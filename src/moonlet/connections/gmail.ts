import { randomBytes } from "node:crypto";
import * as store from "../store";

/**
 * Gmail, through Google sign-in. The holder signs in once; a moonlet can then
 * read the inbox, search it, draft replies, and, behind a proposal, send mail
 * or tidy up (archive, label, mark read). Scope gmail.modify covers all of
 * that without permanent deletion. Tokens are stored sealed and refreshed in
 * place; revoking access in the Google account stops everything at once.
 */

export type GmailConn = { email: string; refreshToken: string; accessToken: string; expiresAt: number; scope: string };

const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.modify"];
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export function gmailOAuthConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export async function beginOAuth(owner: string, redirectUri: string, redirectTo: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("Google sign-in isn't configured (GOOGLE_CLIENT_ID)");
  const state = `gm_${randomBytes(12).toString("base64url")}`;
  await store.saveOauthState({ state, address: owner, verifier: "", clientId, redirectTo, redirectUri });
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(" "), state, access_type: "offline", prompt: "consent", include_granted_scopes: "true" }).toString();
  return u.toString();
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };

export async function finishOAuth(code: string, state: string, fetchImpl: typeof fetch = fetch) {
  const saved = await store.takeOauthState(state);
  if (!saved) throw new Error("state expired");
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: saved.clientId, client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", redirect_uri: saved.redirectUri, grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(15_000),
  });
  const t = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !t.access_token) throw new Error(`Google token exchange failed: ${t.error_description ?? t.error ?? res.status}`);
  if (!t.refresh_token) throw new Error("Google didn't return a refresh token; remove Moonlet under Google Account → Security → Third-party access and connect again");
  if (!(t.scope ?? "").includes("gmail.modify")) throw new Error("Gmail access wasn't granted. Tick the Gmail box on Google's consent screen and try again.");
  const me = await fetchImpl(`${API}/profile`, { headers: { authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(15_000) });
  const p = (await me.json().catch(() => ({}))) as { emailAddress?: string };
  if (!me.ok || !p.emailAddress) throw new Error(`Gmail profile lookup failed: ${me.status}`);
  const conn: GmailConn = { email: p.emailAddress.toLowerCase(), refreshToken: t.refresh_token, accessToken: t.access_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000, scope: t.scope ?? "" };
  await store.setConnection(saved.address, "gmail", conn.email, conn);
  return { owner: saved.address, redirectTo: saved.redirectTo, email: conn.email };
}

export async function connectionFor(owner: string) {
  return store.getConnection<GmailConn>(owner, "gmail");
}

/** A live access token, refreshed and re-stored when within a minute of expiry. Throws `revoked` when Google no longer honours the refresh token. */
export async function accessToken(owner: string, fetchImpl: typeof fetch = fetch): Promise<{ token: string; email: string }> {
  const c = await connectionFor(owner);
  if (!c) throw new Error("Gmail not connected");
  if (c.data.expiresAt - Date.now() > 60_000) return { token: c.data.accessToken, email: c.data.email };
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: c.data.refreshToken, client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(15_000),
  });
  const t = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !t.access_token) {
    if (t.error === "invalid_grant") throw new Error("revoked");
    throw new Error(`Google refresh failed: ${t.error_description ?? t.error ?? res.status}`);
  }
  const next: GmailConn = { ...c.data, accessToken: t.access_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
  await store.setConnection(owner, "gmail", c.label, next);
  return { token: next.accessToken, email: next.email };
}

async function api<T = unknown>(token: string, path: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<T> {
  const res = await fetchImpl(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let j: unknown = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    j = { raw: text.slice(0, 300) };
  }
  if (!res.ok) throw new Error(`Gmail ${init.method ?? "GET"} ${path.split("?")[0]}: ${res.status} ${(j as { error?: { message?: string } })?.error?.message ?? ""}`.trim());
  return j as T;
}

// ---- reading ---------------------------------------------------------------

type Header = { name: string; value: string };
type Part = { mimeType?: string; filename?: string; headers?: Header[]; body?: { data?: string; size?: number; attachmentId?: string }; parts?: Part[] };
type Message = { id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: Part; sizeEstimate?: number };

const header = (p: Part | undefined, name: string) => p?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
const b64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

/** Best readable text of a message: text/plain first, else stripped HTML. Attachments listed by name. */
function bodyOf(payload: Part | undefined) {
  const plain: string[] = [], html: string[] = [], attachments: Array<{ name: string; mime: string; size: number }> = [];
  const walk = (p: Part | undefined) => {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) attachments.push({ name: p.filename, mime: p.mimeType ?? "", size: p.body.size ?? 0 });
    else if (p.mimeType === "text/plain" && p.body?.data) plain.push(b64(p.body.data));
    else if (p.mimeType === "text/html" && p.body?.data) html.push(b64(p.body.data));
    p.parts?.forEach(walk);
  };
  walk(payload);
  const text = plain.length
    ? plain.join("\n")
    : html
        .join("\n")
        .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "")
        .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/li>|<\/h\d>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
  return { text: text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), attachments };
}

const summarise = (m: Message) => ({
  id: m.id,
  threadId: m.threadId,
  from: header(m.payload, "From"),
  to: header(m.payload, "To"),
  subject: header(m.payload, "Subject") || "(no subject)",
  date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : header(m.payload, "Date"),
  unread: !!m.labelIds?.includes("UNREAD"),
  labels: (m.labelIds ?? []).filter((l) => !["UNREAD", "CATEGORY_PERSONAL"].includes(l)),
  snippet: (m.snippet ?? "").slice(0, 200),
});
export type MessageSummary = ReturnType<typeof summarise>;

/** Gmail search syntax passes straight through: "is:unread newer_than:1d", "from:yash", "has:attachment invoice". */
export async function search(token: string, q: string, limit = 15, fetchImpl?: typeof fetch) {
  const list = await api<{ messages?: Array<{ id: string }>; resultSizeEstimate?: number }>(token, `/messages?q=${encodeURIComponent(q)}&maxResults=${Math.min(50, Math.max(1, limit))}`, {}, fetchImpl);
  const ids = (list.messages ?? []).map((m) => m.id);
  const msgs = await Promise.all(ids.map((id) => api<Message>(token, `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`, {}, fetchImpl)));
  return { query: q, total: list.resultSizeEstimate ?? ids.length, messages: msgs.map(summarise) };
}

/** What's going on: unread count and the newest mail, grouped so a model can brief without reading everything. */
export async function overview(token: string, fetchImpl?: typeof fetch) {
  const [inbox, unread] = await Promise.all([search(token, "in:inbox newer_than:2d", 25, fetchImpl), api<{ messagesUnread?: number; threadsUnread?: number }>(token, "/labels/INBOX", {}, fetchImpl)]);
  return { unreadInInbox: unread.messagesUnread ?? 0, unreadThreads: unread.threadsUnread ?? 0, recent: inbox.messages };
}

export async function readMessage(token: string, id: string, fetchImpl?: typeof fetch) {
  const m = await api<Message>(token, `/messages/${id}?format=full`, {}, fetchImpl);
  const { text, attachments } = bodyOf(m.payload);
  return { ...summarise(m), cc: header(m.payload, "Cc"), messageIdHeader: header(m.payload, "Message-ID"), body: text.slice(0, 12_000), truncated: text.length > 12_000, attachments };
}

export async function readThread(token: string, id: string, fetchImpl?: typeof fetch) {
  const t = await api<{ id: string; messages?: Message[] }>(token, `/threads/${id}?format=full`, {}, fetchImpl);
  const messages = (t.messages ?? []).map((m) => {
    const { text, attachments } = bodyOf(m.payload);
    return { ...summarise(m), messageIdHeader: header(m.payload, "Message-ID"), body: text.slice(0, 4000), truncated: text.length > 4000, attachments };
  });
  return { threadId: t.id, subject: messages[0]?.subject ?? "", count: messages.length, messages };
}

export async function labels(token: string, fetchImpl?: typeof fetch) {
  const r = await api<{ labels?: Array<{ id: string; name: string; type: string }> }>(token, "/labels", {}, fetchImpl);
  return (r.labels ?? []).map((l) => ({ id: l.id, name: l.name, system: l.type === "system" }));
}

// ---- writing ---------------------------------------------------------------

export type Outgoing = {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  /** Reply into an existing thread: Gmail thread id plus the Message-ID header of the mail being answered. */
  threadId?: string;
  inReplyTo?: string;
};

const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);

/** RFC 5322 message, base64url as Gmail wants it. Plain text only: a moonlet writes prose, not templates. */
export function buildRaw(from: string, o: Outgoing) {
  const headers = [
    `From: ${from}`,
    `To: ${o.to}`,
    o.cc ? `Cc: ${o.cc}` : "",
    `Subject: ${encodeHeader(o.subject)}`,
    o.inReplyTo ? `In-Reply-To: ${o.inReplyTo}` : "",
    o.inReplyTo ? `References: ${o.inReplyTo}` : "",
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean);
  const body = Buffer.from(o.body, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8").toString("base64url");
}

export async function createDraft(token: string, from: string, o: Outgoing, fetchImpl?: typeof fetch) {
  const r = await api<{ id: string; message?: { id: string; threadId: string } }>(token, "/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: { raw: buildRaw(from, o), threadId: o.threadId } }) }, fetchImpl);
  return { draftId: r.id, messageId: r.message?.id ?? "", threadId: r.message?.threadId ?? o.threadId ?? "", url: "https://mail.google.com/mail/u/0/#drafts" };
}

export async function sendMail(token: string, from: string, o: Outgoing, fetchImpl?: typeof fetch) {
  const r = await api<{ id: string; threadId: string }>(token, "/messages/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ raw: buildRaw(from, o), threadId: o.threadId }) }, fetchImpl);
  return { messageId: r.id, threadId: r.threadId, url: `https://mail.google.com/mail/u/0/#all/${r.threadId}` };
}

export type Organize = { messageIds: string[]; action: "archive" | "mark_read" | "mark_unread" | "star" | "trash" | "label"; label?: string };

/** Tidy up. Label names are resolved (and created) by name; archive is "remove INBOX"; trash is reversible for 30 days. */
export async function organize(token: string, o: Organize, fetchImpl?: typeof fetch) {
  const ids = o.messageIds.slice(0, 100);
  if (!ids.length) return { changed: 0 };
  if (o.action === "trash") {
    await Promise.all(ids.map((id) => api(token, `/messages/${id}/trash`, { method: "POST" }, fetchImpl)));
    return { changed: ids.length, action: o.action };
  }
  let add: string[] = [], remove: string[] = [];
  if (o.action === "archive") remove = ["INBOX"];
  if (o.action === "mark_read") remove = ["UNREAD"];
  if (o.action === "mark_unread") add = ["UNREAD"];
  if (o.action === "star") add = ["STARRED"];
  if (o.action === "label") {
    if (!o.label) throw new Error("label name required");
    const all = await labels(token, fetchImpl);
    const found = all.find((l) => l.name.toLowerCase() === o.label!.toLowerCase());
    const id = found?.id ?? (await api<{ id: string }>(token, "/labels", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: o.label, labelListVisibility: "labelShow", messageListVisibility: "show" }) }, fetchImpl)).id;
    add = [id];
  }
  await api(token, "/messages/batchModify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids, addLabelIds: add, removeLabelIds: remove }) }, fetchImpl);
  return { changed: ids.length, action: o.action, label: o.label };
}
