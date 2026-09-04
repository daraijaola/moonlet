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

/**
 * Pull pending updates and handle them: /start <code> links a wallet;
 * callback buttons decide proposals. Offset is persisted so nothing is
 * processed twice. Returns a small summary for logs.
 */
export async function processUpdates(onCallback: CallbackHandler, fetchImpl: typeof fetch = fetch) {
  if (!telegramConfigured()) return { linked: 0, decided: 0, skipped: true };
  const offset = Number((await store.kvGet("telegram.offset")) ?? 0);
  const updates = await call<Update[]>("getUpdates", { offset, timeout: 0, allowed_updates: ["message", "callback_query"] }, fetchImpl);
  let linked = 0, decided = 0, last = offset - 1;
  for (const u of updates) {
    last = Math.max(last, u.update_id);
    try {
      if (u.message?.text?.startsWith("/start")) {
        const code = u.message.text.split(/\s+/)[1];
        const chatId = String(u.message.chat.id);
        const hit = code ? await store.takeLinkCode(code) : null;
        if (hit && hit.kind === "telegram") {
          await store.setConnection(hit.owner, "telegram", u.message.chat.username ? `@${u.message.chat.username}` : (u.message.chat.first_name ?? "Telegram"), { chatId, username: u.message.chat.username, firstName: u.message.chat.first_name } satisfies TelegramConn);
          await sendMessage(chatId, `Linked to <b>${esc(hit.owner.slice(0, 6))}…${esc(hit.owner.slice(-4))}</b>. Your moonlets can reach you here, and anything that needs your OK will show up with buttons.`, { fetch: fetchImpl });
          linked++;
        } else {
          await sendMessage(chatId, "Open Moonlet → Connections → Telegram and tap the link there. Codes expire after 30 minutes.", { fetch: fetchImpl });
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
