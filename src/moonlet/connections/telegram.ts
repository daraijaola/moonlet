import { createHash } from "node:crypto";
import * as store from "../store";

/**
 * Telegram, via one platform bot (TELEGRAM_BOT_TOKEN). A holder links by
 * opening t.me/<bot>?start=<code>; the bot's /start message binds their chat
 * id to their wallet. From then on the moonlet can message them, and proposals
 * arrive with Approve / Reject buttons.
 *
 * Updates arrive on the webhook (POST /api/telegram/webhook) when APP_URL is
 * public https, which is what makes replies feel instant; otherwise they are
 * pulled with getUpdates on the cron tick. Both paths end in `handleUpdate`.
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
  opts: { buttons?: Array<Array<{ text: string; data: string }>>; replyTo?: number; fetch?: typeof fetch } = {},
) {
  const r = await call<{ message_id: number }>(
    "sendMessage",
    {
      chat_id: chatId,
      text: text.slice(0, 4000),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(opts.replyTo ? { reply_parameters: { message_id: opts.replyTo, allow_sending_without_reply: true } } : {}),
      ...(opts.buttons ? { reply_markup: { inline_keyboard: opts.buttons.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) } } : {}),
    },
    opts.fetch,
  );
  return { ok: true as const, id: String(r.message_id) };
}

/** Send a file (a report as PDF/DOCX/TXT) to a linked chat. Telegram caps bot uploads at 50 MB; ours are far smaller. */
export async function sendDocument(chatId: string, file: { name: string; mime: string; bytes: Uint8Array; caption?: string; replyTo?: number }, fetchImpl: typeof fetch = fetch) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram bot not configured");
  const form = new FormData();
  form.set("chat_id", chatId);
  if (file.caption) {
    form.set("caption", file.caption.slice(0, 1000));
    form.set("parse_mode", "HTML");
  }
  if (file.replyTo) form.set("reply_parameters", JSON.stringify({ message_id: file.replyTo, allow_sending_without_reply: true }));
  form.set("document", new Blob([file.bytes as BlobPart], { type: file.mime }), file.name);
  const res = await fetchImpl(API(token, "sendDocument"), { method: "POST", body: form, signal: AbortSignal.timeout(60_000) });
  const j = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
  if (!j.ok) throw new Error(`Telegram sendDocument: ${j.description ?? res.status}`);
  return { ok: true as const, id: String(j.result!.message_id) };
}

export async function editMessage(chatId: string, messageId: number, text: string, fetchImpl?: typeof fetch) {
  await call("editMessageText", { chat_id: chatId, message_id: messageId, text: text.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true }, fetchImpl).catch(() => undefined);
}

export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The light markdown a moonlet writes, as Telegram HTML: headings bold, bullets kept, **bold**, [text](url). Everything else escaped. */
export function mdToHtml(md: string) {
  return md
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => {
      const h = /^#{1,3}\s+(.*)$/.exec(line);
      if (h) return `<b>${esc(h[1].replace(/\*\*/g, ""))}</b>`;
      const li = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
      const body = li ? li[1] : line;
      const html = esc(body)
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
        .replace(/`([^`]+)`/g, "<code>$1</code>");
      return li ? `• ${html}` : html;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const APP = () => process.env.APP_URL ?? "https://moonlet.16labs.xyz";

/**
 * One-time bot profile: commands menu, descriptions. Re-applied whenever the
 * token changes (keyed in kv), so a fresh bot from BotFather is ready on the
 * first tick without anyone touching the Telegram UI.
 */
export async function configureBot(fetchImpl: typeof fetch = fetch) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const webhook = webhookUrl();
  const stamp = `v3:${token.slice(0, 12)}:${webhook ?? "poll"}`;
  if ((await store.kvGet("telegram.configured")) === stamp) return false;
  if (webhook) await call("setWebhook", { url: webhook, secret_token: webhookSecret(), allowed_updates: ["message", "callback_query"], max_connections: 10 }, fetchImpl);
  else await call("deleteWebhook", { drop_pending_updates: false }, fetchImpl);
  await call("setMyCommands", {
    commands: [
      { command: "status", description: "Your moonlets, fuel and next runs" },
      { command: "help", description: "What this bot does" },
      { command: "stop", description: "Unlink this chat from your wallet" },
    ],
  }, fetchImpl);
  await call("setMyShortDescription", { short_description: "Your moonlets report here. Approve or reject what they want to do with one tap." }, fetchImpl);
  await call("setMyDescription", {
    description: "Moonlet runs small AI agents paid for by the CREDIT your staked $ORBIO earns. Link this chat from Moonlet → Connections and your moonlets will send you briefs, alerts and anything that needs your OK, with Approve / Reject buttons.",
  }, fetchImpl);
  await store.kvSet("telegram.configured", stamp);
  return true;
}

/** Where Telegram pushes updates; null on hosts without a public https origin (then we poll). */
export function webhookUrl() {
  const app = process.env.APP_URL;
  if (!app || !/^https:\/\//.test(app) || process.env.TELEGRAM_POLL === "1") return null;
  return `${app.replace(/\/$/, "")}/api/telegram/webhook`;
}

/** Telegram echoes this in X-Telegram-Bot-Api-Secret-Token so the route can reject anyone else. */
export function webhookSecret() {
  return createHash("sha256").update(`telegram-webhook:${process.env.SECRET_KEY ?? ""}:${process.env.TELEGRAM_BOT_TOKEN ?? ""}`).digest("hex");
}

/**
 * The chat equivalent of a spinner: a "Thinking…" bubble under the owner's
 * message and a live typing indicator while the model works; when the answer
 * lands, the bubble becomes the answer with how long it took. Nothing is left
 * behind and nothing arrives twice.
 */
export async function withThinking(chatId: string, replyTo: number, label: string, fetchImpl: typeof fetch, work: () => Promise<string>) {
  const t0 = Date.now();
  const placeholder = await sendMessage(chatId, `<i>${esc(label)}</i>`, { replyTo, fetch: fetchImpl }).catch(() => null);
  const typing = () => call("sendChatAction", { chat_id: chatId, action: "typing" }, fetchImpl).catch(() => undefined);
  void typing();
  const timer = setInterval(typing, 4_000);
  let reply: string;
  try {
    reply = await work();
  } catch (e) {
    reply = `I couldn't think just now (${(e as Error).message.slice(0, 80)}). Try again in a minute, or use ${APP()}/app.`;
  } finally {
    clearInterval(timer);
  }
  const secs = Math.max(1, Math.round((Date.now() - t0) / 1000));
  const html = `${esc(reply).slice(0, 3900)}\n\n<i>answered in ${secs}s</i>`;
  if (placeholder) {
    const edited = await call("editMessageText", { chat_id: chatId, message_id: Number(placeholder.id), text: html, parse_mode: "HTML", disable_web_page_preview: true }, fetchImpl).then(() => true, () => false);
    if (edited) return reply;
    await call("deleteMessage", { chat_id: chatId, message_id: Number(placeholder.id) }, fetchImpl).catch(() => undefined);
  }
  await sendMessage(chatId, html, { replyTo, fetch: fetchImpl });
  return reply;
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

export type Update = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    caption?: string;
    photo?: Array<{ file_id: string; width: number; height: number }>;
    reply_to_message?: { message_id: number };
    chat: { id: number; type: string; username?: string; first_name?: string };
  };
  callback_query?: { id: string; data?: string; message?: { message_id: number; chat: { id: number } } };
};

export type CallbackHandler = (action: "approve" | "reject", proposalId: string, ctx: { chatId: string; messageId: number }) => Promise<string>;
/** Free text from a linked chat. Returns the reply (HTML-escaped by the caller). */
export type ChatHandler = (owner: string, text: string, ctx: { chatId: string; replyToMessageId?: number; imageUrl?: string }) => Promise<string>;

/** Public URL for a photo the owner sent; Telegram file URLs embed the bot token, so callers must not log them. */
export async function fileUrl(fileId: string, fetchImpl?: typeof fetch) {
  const f = await call<{ file_path: string }>("getFile", { file_id: fileId }, fetchImpl);
  return `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${f.file_path}`;
}
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
  if (!telegramConfigured() || webhookUrl()) return { linked: 0, decided: 0, skipped: true };
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
    const r = await handleUpdate(u, onCallback, fetchImpl);
    if (r === "linked") linked++;
    if (r === "decided") decided++;
  }
  if (updates.length) await store.kvSet("telegram.offset", String(last + 1));
  return { linked, decided, skipped: false };
}

/** One update, from the webhook or the poller. Never throws: one bad update must not block the rest. */
export async function handleUpdate(u: Update, onCallback: CallbackHandler, fetchImpl: typeof fetch = fetch): Promise<"linked" | "decided" | "handled" | "error"> {
  try {
    if ((u.message?.text || u.message?.photo?.length) && u.message.chat.type === "private") {
      const chatId = String(u.message.chat.id);
      const text = u.message.text ?? u.message.caption ?? "";
      const [cmd, arg] = text.trim().split(/\s+/);
      const command = (cmd ?? "").replace(/@\w+$/, "").toLowerCase();
      if (command === "/start" && arg) {
        const hit = await store.takeLinkCode(arg);
        if (hit && hit.kind === "telegram") {
          await store.setConnection(hit.owner, "telegram", u.message.chat.username ? `@${u.message.chat.username}` : (u.message.chat.first_name ?? "Telegram"), { chatId, username: u.message.chat.username, firstName: u.message.chat.first_name } satisfies TelegramConn);
          await sendMessage(chatId, `✓ Linked to <b>${esc(hit.owner.slice(0, 6))}…${esc(hit.owner.slice(-4))}</b>.\n\nYour moonlets will report here. Reply to any report to dig into it, send a screenshot, or just talk to me: "what did Tide find?", "run it now", "make it every 6 hours". Anything that needs your OK comes with Approve / Reject buttons.`, { fetch: fetchImpl });
          return "linked";
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
          await sendMessage(chatId, `Moonlet runs small AI agents paid for by the CREDIT your staked $ORBIO earns.\n\nTo link this chat: open ${esc(APP())}/app/connections, tap <b>Link Telegram</b>, then press Start here.`, { fetch: fetchImpl });
        } else if (command === "/help" || command === "/start" || !chatHandler) {
          await sendMessage(
            chatId,
            `This chat is linked to <b>${esc(owner.slice(0, 6))}…${esc(owner.slice(-4))}</b>. Your moonlets report here and ask before acting on your behalf. Just talk to me: "what did Tide find?", "run Micheal now", "make it daily", "pause it".\n\n/status — your moonlets\n/stop — unlink\n\n${esc(APP())}/app`,
            { fetch: fetchImpl },
          );
        } else {
          const photo = u.message.photo?.length ? u.message.photo[u.message.photo.length - 1] : undefined;
          const replyToMessageId = u.message.reply_to_message?.message_id;
          const handler = chatHandler;
          await withThinking(chatId, u.message.message_id, photo ? "Looking at your photo…" : replyToMessageId ? "Reading that report…" : "Thinking…", fetchImpl, async () => {
            const imageUrl = photo ? await fileUrl(photo.file_id, fetchImpl).catch(() => undefined) : undefined;
            return handler(owner, text, { chatId, replyToMessageId, imageUrl });
          });
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
        return "decided";
      }
    }
    return "handled";
  } catch {
    return "error";
  }
}
