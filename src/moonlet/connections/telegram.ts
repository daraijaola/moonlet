import * as store from "../store";

/**
 * Telegram, via one platform bot (TELEGRAM_BOT_TOKEN). A holder links by
 * opening t.me/<bot>?start=<code>; the bot's /start message binds their chat
 * id to their wallet. From then on the moonlet can message them, and proposals
 * arrive with Approve / Reject buttons.
 *
 * Updates are pulled with getUpdates on the cron tick (no webhook to set up),
 * so this works on any host. `processUpdates` is the single entry point.
 */

export type TelegramConn = { chatId: string; username?: string; firstName?: string };

const API = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

export function telegramConfigured() {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

export function botUsername() {
  return process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? null;
}

async function call<T = unknown>(method: string, body: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram bot not configured");
  const res = await fetchImpl(API(token, method), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  const j = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description ?? res.status}`);
  return j.result as T;
}

export async function sendMessage(
  chatId: string,
  text: string,
  opts: { buttons?: Array<Array<{ text: string; data: string }>>; fetch?: typeof fetch } = {},
) {
  const r = await call<{ message_id: number }>(
    "sendMessage",
    {
      chat_id: chatId,
      text: text.slice(0, 4000),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(opts.buttons ? { reply_markup: { inline_keyboard: opts.buttons.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) } } : {}),
    },
    opts.fetch,
  );
  return { ok: true as const, id: String(r.message_id) };
}

export async function editMessage(chatId: string, messageId: number, text: string, fetchImpl?: typeof fetch) {
  await call("editMessageText", { chat_id: chatId, message_id: messageId, text: text.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true }, fetchImpl).catch(() => undefined);
}

export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const APP = () => process.env.APP_URL ?? "https://16labs.xyz";

/**
 * One-time bot profile: commands menu, descriptions. Re-applied whenever the
 * token changes (keyed in kv), so a fresh bot from BotFather is ready on the
 * first tick without anyone touching the Telegram UI.
 */
export async function configureBot(fetchImpl: typeof fetch = fetch) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const stamp = `v2:${token.slice(0, 12)}`;
  if ((await store.kvGet("telegram.configured")) === stamp) return false;
  await call("setMyCommands", {
    commands: [
      { command: "status", description: "Your moonlets, fuel and next runs" },
      { command: "help", description: "What this bot does" },
      { command: "stop", description: "Unlink this chat from your wallet" },
    ],
  }, fetchImpl);
  await call("setMyShortDescription", { short_description: "Your moonlets report here. Approve or reject what they want to do with one tap." }, fetchImpl);
  await call("setMyDescription", {
    description: "Moonlet runs small AI agents paid for by the credits your $ORBIO earns. Link this chat from Moonlet → Connections and your moonlets will send you briefs, alerts and anything that needs your OK, with Approve / Reject buttons.",
  }, fetchImpl);
  await store.kvSet("telegram.configured", stamp);
  return true;
}

export async function ownerOfChat(chatId: string) {
  const all = await store.connectionsOfKind<TelegramConn>("telegram");
  return all.find((c) => c.data.chatId === chatId)?.owner ?? null;
}

async function statusText(owner: string) {
  const ms = await store.listMoonlets(owner);
  if (!ms.length) return `No moonlets yet for <b>${esc(owner.slice(0, 6))}…${esc(owner.slice(-4))}</b>. Launch one at ${esc(APP())}/app/new`;
  const lines = ms.map((m) => {
    const when = m.status === "running" ? "running now" : m.status === "paused" ? "paused" : m.status === "quiet" ? "quiet (no fuel)" : m.nextRunAt ? `next in ${Math.max(0, Math.round((m.nextRunAt - Date.now()) / 60_000))} min` : "scheduled";
    return `• <b>${esc(m.name)}</b> — ${esc(when)} · ${m.runsTotal} run${m.runsTotal === 1 ? "" : "s"} · $${m.spentTotalUsd.toFixed(3)} spent`;
  });
  return `<b>Your moonlets</b>\n${lines.join("\n")}\n\n${esc(APP())}/app`;
}

/** Start a link: returns the deep link the holder taps. */
export async function beginLink(owner: string) {
  const code = `ml_${Math.random().toString(36).slice(2, 10)}`;
  await store.saveLinkCode(code, owner, "telegram");
  const bot = botUsername();
  return { code, url: bot ? `https://t.me/${bot}?start=${code}` : null };
}

type Update = {
  update_id: number;
  message?: { message_id: number; text?: string; chat: { id: number; type: string; username?: string; first_name?: string } };
  callback_query?: { id: string; data?: string; message?: { message_id: number; chat: { id: number } } };
};

export type CallbackHandler = (action: "approve" | "reject", proposalId: string, ctx: { chatId: string; messageId: number }) => Promise<string>;
/** Free text from a linked chat. Returns the reply (HTML-escaped by the caller). */
export type ChatHandler = (owner: string, text: string) => Promise<string>;
let chatHandler: ChatHandler | null = null;
export function setChatHandler(h: ChatHandler | null) {
  chatHandler = h;
}

export async function chatOwns(chatId: string, owner: string) {
  const c = await store.getConnection<TelegramConn>(owner, "telegram");
  return !!c && c.data.chatId === chatId;
}

/**
 * Pull pending updates and handle them: /start <code> links a wallet;
 * callback buttons decide proposals. Offset is persisted so nothing is
 * processed twice. Returns a small summary for logs.
 */
let inflight: Promise<{ linked: number; decided: number; skipped: boolean }> | null = null;

export function processUpdates(onCallback: CallbackHandler, fetchImpl: typeof fetch = fetch) {
  // Telegram allows one getUpdates at a time per bot; page polls and cron ticks share this.
  if (inflight) return inflight;
  inflight = processUpdatesInner(onCallback, fetchImpl).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function processUpdatesInner(onCallback: CallbackHandler, fetchImpl: typeof fetch) {
  if (!telegramConfigured()) return { linked: 0, decided: 0, skipped: true };
  const offset = Number((await store.kvGet("telegram.offset")) ?? 0);
  let updates: Update[];
  try {
    updates = await call<Update[]>("getUpdates", { offset, timeout: 0, allowed_updates: ["message", "callback_query"] }, fetchImpl);
  } catch (e) {
    // 409 = another poller or a webhook is set; not fatal, try next tick.
    if (/409|Conflict|terminated by other/i.test((e as Error).message)) return { linked: 0, decided: 0, skipped: true };
    throw e;
  }
  let linked = 0, decided = 0, last = offset - 1;
  for (const u of updates) {
    last = Math.max(last, u.update_id);
    try {
      if (u.message?.text && u.message.chat.type === "private") {
        const chatId = String(u.message.chat.id);
        const [cmd, arg] = u.message.text.trim().split(/\s+/);
        const command = cmd.replace(/@\w+$/, "").toLowerCase();
        if (command === "/start" && arg) {
          const hit = await store.takeLinkCode(arg);
          if (hit && hit.kind === "telegram") {
            await store.setConnection(hit.owner, "telegram", u.message.chat.username ? `@${u.message.chat.username}` : (u.message.chat.first_name ?? "Telegram"), { chatId, username: u.message.chat.username, firstName: u.message.chat.first_name } satisfies TelegramConn);
            await sendMessage(chatId, `✓ Linked to <b>${esc(hit.owner.slice(0, 6))}…${esc(hit.owner.slice(-4))}</b>.\n\nYour moonlets will report here. When one wants to post or open a pull request, you'll get it with Approve / Reject buttons. Send /status any time.`, { fetch: fetchImpl });
            linked++;
          } else {
            await sendMessage(chatId, `That link has expired. Open ${esc(APP())}/app/connections and tap <b>Link Telegram</b> again.`, { fetch: fetchImpl });
          }
        } else if (command === "/status") {
          const owner = await ownerOfChat(chatId);
          await sendMessage(chatId, owner ? await statusText(owner) : `This chat isn't linked yet. Open ${esc(APP())}/app/connections and tap <b>Link Telegram</b>.`, { fetch: fetchImpl });
        } else if (command === "/stop") {
          const owner = await ownerOfChat(chatId);
          if (owner) await store.deleteConnection(owner, "telegram");
          await sendMessage(chatId, owner ? "Unlinked. Your moonlets will stop messaging this chat; pending drafts stay on the dashboard." : "This chat wasn't linked to anything.", { fetch: fetchImpl });
        } else {
          const owner = await ownerOfChat(chatId);
          if (!owner) {
            await sendMessage(chatId, `Moonlet runs small AI agents paid for by the credits your $ORBIO earns.\n\nTo link this chat: open ${esc(APP())}/app/connections, tap <b>Link Telegram</b>, then press Start here.`, { fetch: fetchImpl });
          } else if (command === "/help" || command === "/start" || !chatHandler) {
            await sendMessage(
              chatId,
              `This chat is linked to <b>${esc(owner.slice(0, 6))}…${esc(owner.slice(-4))}</b>. Your moonlets report here and ask before acting on your behalf. Just talk to me: "what did Tide find?", "run Micheal now", "make it daily", "pause it".\n\n/status — your moonlets\n/stop — unlink\n\n${esc(APP())}/app`,
              { fetch: fetchImpl },
            );
          } else {
            await call("sendChatAction", { chat_id: chatId, action: "typing" }, fetchImpl).catch(() => undefined);
            const reply = await chatHandler(owner, u.message.text).catch((e) => `I couldn't think just now (${(e as Error).message.slice(0, 80)}). Try again in a minute, or use ${APP()}/app.`);
            await sendMessage(chatId, esc(reply), { fetch: fetchImpl });
          }
        }
      } else if (u.callback_query?.data && u.callback_query.message) {
        const [action, id] = u.callback_query.data.split(":");
        if ((action === "approve" || action === "reject") && id) {
          const chatId = String(u.callback_query.message.chat.id);
          const messageId = u.callback_query.message.message_id;
          const text = await onCallback(action, id, { chatId, messageId });
          await call("answerCallbackQuery", { callback_query_id: u.callback_query.id, text: action === "approve" ? "Approved" : "Rejected" }, fetchImpl).catch(() => undefined);
          await editMessage(chatId, messageId, text, fetchImpl);
          decided++;
        }
      }
    } catch {
      // one bad update must not block the rest
    }
  }
  if (updates.length) await store.kvSet("telegram.offset", String(last + 1));
  return { linked, decided, skipped: false };
}
