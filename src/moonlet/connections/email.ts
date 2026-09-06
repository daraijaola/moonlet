import { createHash, randomInt } from "node:crypto";
import * as store from "../store";

/**
 * Email, through Resend. The holder types an address, we mail a six-digit
 * code, they type it back; only then is the address stored. Reports arrive
 * as a plain, readable email with the same sections Telegram gets; files as
 * attachments. Email cannot carry buttons, so approvals stay on Telegram and
 * the dashboard.
 */

export type EmailConn = { address: string };

const RESEND = "https://api.resend.com";
const CODE_TTL_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

export function emailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

export function fromAddress() {
  return process.env.EMAIL_FROM ?? "Moonlet <moonlet@16labs.xyz>";
}

const ADDRESS_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normaliseAddress(raw: string) {
  const a = raw.trim().toLowerCase();
  if (!ADDRESS_RE.test(a) || a.length > 254) throw new Error("That doesn't look like an email address.");
  return a;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{ name: string; mime: string; bytes: Uint8Array }>;
};

/** One call to Resend. Attachments are base64 inline; Resend caps the whole message at 40 MB. */
export async function send(mail: Mail, fetchImpl: typeof fetch = fetch) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("email isn't configured on this server");
  const res = await fetchImpl(`${RESEND}/emails`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: fromAddress(),
      to: [mail.to],
      subject: clip(mail.subject, 200),
      text: mail.text,
      html: mail.html,
      attachments: mail.attachments?.map((a) => ({ filename: a.name, content: Buffer.from(a.bytes).toString("base64"), content_type: a.mime })),
    }),
    signal: AbortSignal.timeout(mail.attachments?.length ? 60_000 : 15_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const j = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true as const, id: j.id ?? "" };
}

const codeKey = (owner: string) => `email-code:${owner.toLowerCase()}`;
const hashCode = (address: string, code: string) => createHash("sha256").update(`${process.env.SECRET_KEY ?? ""}:${address}:${code}`).digest("hex");

/** Step one: mail a code to the address. Nothing is stored against the wallet until the code comes back. */
export async function beginConnect(owner: string, raw: string, fetchImpl: typeof fetch = fetch) {
  const address = normaliseAddress(raw);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await send(
    {
      to: address,
      subject: `${code} is your Moonlet code`,
      text: `Your code is ${code}. It works for 15 minutes.\n\nType it on the Connections page to have your moonlets email their reports here. If you didn't ask for this, ignore it; nothing is connected until the code is entered.`,
      html: wrap(`<p style="margin:0 0 12px">Your code is</p><p style="margin:0 0 16px;font-family:ui-monospace,Menlo,monospace;font-size:28px;letter-spacing:0.18em;font-weight:600">${code}</p><p style="margin:0;color:#6b6a63">It works for 15 minutes. Type it on the Connections page to have your moonlets email their reports here. If you didn't ask for this, ignore it; nothing is connected until the code is entered.</p>`),
    },
    fetchImpl,
  );
  await store.kvSet(codeKey(owner), JSON.stringify({ address, hash: hashCode(address, code), expiresAt: Date.now() + CODE_TTL_MS, attempts: 0 }));
  return { address };
}

/** Step two: the code back from the inbox. Five tries, fifteen minutes, then start over. */
export async function finishConnect(owner: string, rawCode: string) {
  const code = rawCode.replace(/\D/g, "");
  const pendingRaw = await store.kvGet(codeKey(owner));
  const pending = pendingRaw ? (JSON.parse(pendingRaw) as { address: string; hash: string; expiresAt: number; attempts: number }) : null;
  if (!pending || pending.expiresAt < Date.now()) {
    await store.kvSet(codeKey(owner), "");
    throw new Error("That code has expired. Send a new one.");
  }
  if (pending.attempts >= MAX_ATTEMPTS) {
    await store.kvSet(codeKey(owner), "");
    throw new Error("Too many tries. Send a new code.");
  }
  if (code.length !== 6 || hashCode(pending.address, code) !== pending.hash) {
    await store.kvSet(codeKey(owner), JSON.stringify({ ...pending, attempts: pending.attempts + 1 }));
    throw new Error(`That code doesn't match. ${MAX_ATTEMPTS - pending.attempts - 1} tries left.`);
  }
  await store.kvSet(codeKey(owner), "");
  const conn: EmailConn = { address: pending.address };
  await store.setConnection(owner, "email", maskAddress(pending.address), conn);
  return { label: maskAddress(pending.address), address: pending.address };
}

/** m•••l@example.com: enough to recognise, not enough to scrape. */
export function maskAddress(address: string) {
  const [user, domain] = address.split("@");
  if (user.length <= 2) return `${user[0]}•@${domain}`;
  return `${user[0]}•••${user[user.length - 1]}@${domain}`;
}

function wrap(inner: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f1ea;padding:32px 16px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15161d;font-size:15px;line-height:1.55"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid rgba(21,22,29,0.1);border-radius:10px;padding:28px 28px 22px"><p style="margin:0 0 20px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#8d8b82">moonlet</p>${inner}</div></body></html>`;
}

export type Report = {
  moonletName: string;
  title: string;
  summary: string;
  body?: string;
  sections?: Array<{ check: string; finding: string; changed: boolean }>;
  sources?: string[];
  costUsd: number;
  hashed: boolean;
  publicUrl: string;
};

/** A finished run as one email: summary first, a line per check, receipts at the foot. Text and HTML say the same thing. */
export function reportMail(to: string, r: Report): Mail {
  const sections = r.sections ?? [];
  const detail = sections.length ? "" : r.body && r.body.trim() !== r.summary.trim() ? clip(r.body.trim(), 6000) : "";
  const receipt = `$${r.costUsd.toFixed(4)} · ${r.hashed ? "hashed on Robinhood Chain" : "run recorded"}${r.sources?.length ? ` · ${r.sources.length} source${r.sources.length === 1 ? "" : "s"}` : ""}`;
  const text = [
    `${r.moonletName} · ${r.title}`,
    "",
    r.summary,
    ...(sections.length ? ["", ...sections.map((s) => `${s.changed ? "●" : "○"} ${s.check}\n${s.finding}`)] : detail ? ["", detail] : []),
    "",
    receipt,
    r.publicUrl,
  ].join("\n");
  const html = wrap(
    `<p style="margin:0 0 4px;font-size:12px;color:#8d8b82">${esc(r.moonletName)}</p>` +
      `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;letter-spacing:-0.01em">${esc(r.title)}</h1>` +
      `<p style="margin:0 0 18px">${esc(r.summary)}</p>` +
      (sections.length
        ? sections.map((s) => `<div style="margin:0 0 14px;padding:0 0 0 14px;border-left:2px solid ${s.changed ? "#e6b64a" : "rgba(21,22,29,0.12)"}"><p style="margin:0 0 2px;font-weight:600;font-size:14px">${esc(s.check)}</p><p style="margin:0;color:#3a3a40;white-space:pre-wrap">${esc(s.finding)}</p></div>`).join("")
        : detail
          ? `<p style="margin:0 0 18px;color:#3a3a40;white-space:pre-wrap">${esc(detail)}</p>`
          : "") +
      `<hr style="border:0;border-top:1px solid rgba(21,22,29,0.1);margin:20px 0 14px">` +
      `<p style="margin:0 0 6px;font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:#8d8b82">${esc(receipt)}</p>` +
      `<p style="margin:0;font-size:12.5px"><a href="${esc(r.publicUrl)}" style="color:#15161d">Open the moonlet</a> · reply on Telegram to ask about any of this</p>`,
  );
  return { to, subject: `${r.moonletName}: ${r.title}`, text, html };
}

/** Plain text (the `deliver` tool). */
export function textMail(to: string, moonletName: string, content: string): Mail {
  const firstLine = content.split("\n").find((l) => l.trim())?.trim() ?? "update";
  return { to, subject: `${moonletName}: ${clip(firstLine, 80)}`, text: content, html: wrap(`<p style="margin:0 0 4px;font-size:12px;color:#8d8b82">${esc(moonletName)}</p><p style="margin:0;white-space:pre-wrap">${esc(content)}</p>`) };
}

/** A report as a file: short body, the document attached. */
export function fileMail(to: string, moonletName: string, file: { name: string; mime: string; bytes: Uint8Array; caption?: string }): Mail {
  const caption = file.caption?.trim() || file.name;
  return {
    to,
    subject: `${moonletName}: ${clip(caption, 80)}`,
    text: `${caption}\n\nAttached: ${file.name}`,
    html: wrap(`<p style="margin:0 0 4px;font-size:12px;color:#8d8b82">${esc(moonletName)}</p><p style="margin:0 0 10px;font-weight:600">${esc(caption)}</p><p style="margin:0;color:#6b6a63;font-size:13px">Attached: <span style="font-family:ui-monospace,Menlo,monospace">${esc(file.name)}</span></p>`),
    attachments: [{ name: file.name, mime: file.mime, bytes: file.bytes }],
  };
}
