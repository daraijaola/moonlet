import * as store from "./store";
import * as gh from "./connections/github";
import * as gmail from "./connections/gmail";

/**
 * Verified receipts. After an approved action executes, we do not take the provider's "201 Created" or the model's prose as the
 * record: we read the thing back by id (GitHub issue / PR / comment; Gmail message or draft) and compare field by field with the
 * payload the owner approved. The result is stored on the proposal and shown on the card. It is read-only code, not a second
 * model. What it can say: the object exists where approved, with the approved fields. What it cannot say: that a bug is real,
 * that a fix works, that a recipient read the mail.
 */

export type Check = { field: string; expected: string; actual: string; ok: boolean };
export type Verification = {
  status: "verified" | "mismatch" | "unchecked";
  /** Where the real object lives. */
  url?: string;
  checks: Check[];
  /** Why it could not be checked, when status is unchecked. */
  reason?: string;
  at: number;
};

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const eq = (field: string, expected: unknown, actual: unknown, cmp: (a: string, b: string) => boolean = (a, b) => a === b): Check => ({ field, expected: String(expected ?? ""), actual: String(actual ?? ""), ok: cmp(norm(expected), norm(actual)) });
const contains = (a: string, b: string) => b.includes(a);
const addrs = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? []));
const sameAddrs = (a: string, b: string) => { const x = addrs(a), y = addrs(b); return x.size === y.size && [...x].every((v) => y.has(v)); };

export async function verifyProposal(p: store.ProposalRow, fetchImpl: typeof fetch = fetch): Promise<Verification> {
  const at = Date.now();
  const result = (p.result ?? {}) as Record<string, unknown>;
  try {
    if (p.kind === "issue_create" || p.kind === "pull_request" || p.kind === "issue_comment") {
      const c = await gh.connectionFor(p.owner);
      if (!c) return { status: "unchecked", checks: [], reason: "GitHub is no longer connected", at };
      if (p.kind === "issue_create") {
        const i = p.payload as { repo: string; title: string; body: string; labels?: string[] };
        const number = Number(result.number);
        if (!number) return { status: "unchecked", checks: [], reason: "no issue number was returned", at };
        const got = await gh.readIssue(c.data.token, i.repo, number, fetchImpl);
        const checks = [eq("repository", i.repo, got.repo), eq("title", i.title, got.title), eq("body", i.body, got.body, contains), eq("labels", (i.labels ?? []).slice().sort().join(","), got.labels.slice().sort().join(","))];
        return { status: checks.every((x) => x.ok) ? "verified" : "mismatch", url: got.url, checks, at };
      }
      if (p.kind === "pull_request") {
        const plan = (p.payload as { plan: gh.PullRequestPlan }).plan;
        const number = Number(result.number);
        if (!number) return { status: "unchecked", checks: [], reason: "no pull request number was returned", at };
        const got = await gh.readPull(c.data.token, plan.repo, number, fetchImpl);
        const checks = [eq("repository", plan.repo, got.repo), eq("title", plan.title, got.title), eq("files", plan.files.map((f) => f.path).sort().join(","), got.files.slice().sort().join(","))];
        return { status: checks.every((x) => x.ok) ? "verified" : "mismatch", url: got.url, checks, at };
      }
      const cm = p.payload as { repo: string; number: number; body: string };
      const url = String(result.url ?? "");
      const commentId = Number(url.match(/issuecomment-(\d+)/)?.[1]);
      if (!commentId) return { status: "unchecked", checks: [], reason: "no comment id was returned", at };
      const got = await gh.readComment(c.data.token, cm.repo, commentId, fetchImpl);
      const checks = [eq("repository", cm.repo, got.repo), eq("issue", cm.number, got.issueNumber), eq("body", cm.body, got.body)];
      return { status: checks.every((x) => x.ok) ? "verified" : "mismatch", url: got.url, checks, at };
    }
    if (p.kind === "email_send" || p.kind === "email_forward") {
      const messageId = String(result.messageId ?? "");
      if (!messageId) return { status: "unchecked", checks: [], reason: "no message id was returned", at };
      const { token } = await gmail.accessToken(p.owner, fetchImpl);
      const got = await gmail.readMessage(token, messageId, fetchImpl);
      const checks: Check[] = [];
      if (p.kind === "email_send") {
        const m = (p.payload as { mail: gmail.Outgoing }).mail;
        checks.push(eq("to", m.to, got.to, sameAddrs));
        if (m.cc) checks.push(eq("cc", m.cc, (got as { cc?: string }).cc ?? "", sameAddrs));
        checks.push(eq("subject", m.subject, got.subject));
        if (m.threadId) checks.push(eq("thread", m.threadId, got.threadId));
      } else {
        const f = p.payload as { to: string; subject: string };
        checks.push(eq("to", f.to, got.to, sameAddrs));
        checks.push(eq("subject", /^fwd?:/i.test(f.subject) ? f.subject : `Fwd: ${f.subject}`, got.subject));
      }
      checks.push(eq("in sent mail", "yes", got.labelIds.includes("SENT") ? "yes" : "no"));
      return { status: checks.every((x) => x.ok) ? "verified" : "mismatch", url: `https://mail.google.com/mail/u/0/#all/${got.threadId}`, checks, at };
    }
    if (p.kind === "email_organize") {
      const o = (p.payload as { organize: gmail.Organize }).organize;
      const ids = (o.messageIds ?? []).slice(0, 5);
      if (!ids.length) return { status: "unchecked", checks: [], reason: "no message ids to check", at };
      const { token } = await gmail.accessToken(p.owner, fetchImpl);
      const want: Partial<Record<gmail.OrganizeAction, { has?: string; lacks?: string }>> = { archive: { lacks: "INBOX" }, unarchive: { has: "INBOX" }, mark_read: { lacks: "UNREAD" }, mark_unread: { has: "UNREAD" }, star: { has: "STARRED" }, unstar: { lacks: "STARRED" }, important: { has: "IMPORTANT" }, not_important: { lacks: "IMPORTANT" }, spam: { has: "SPAM" }, not_spam: { lacks: "SPAM" }, trash: { has: "TRASH" }, untrash: { lacks: "TRASH" } };
      const w = want[o.action];
      if (!w) return { status: "unchecked", checks: [], reason: "label changes are not checked yet", at };
      const checks: Check[] = [];
      for (const id of ids) {
        const got = await gmail.readMessage(token, id, fetchImpl).catch(() => null);
        if (!got) { checks.push({ field: id, expected: o.action, actual: "unreadable", ok: false }); continue; }
        const ok = (!w.has || got.labelIds.includes(w.has)) && (!w.lacks || !got.labelIds.includes(w.lacks));
        checks.push({ field: `message ${id.slice(0, 8)}`, expected: o.action, actual: got.labelIds.join(","), ok });
      }
      const total = o.messageIds?.length ?? 0;
      if (total > ids.length) checks.push({ field: "sample", expected: `${total} messages`, actual: `${ids.length} checked`, ok: true });
      return { status: checks.every((x) => x.ok) ? "verified" : "mismatch", checks, at };
    }
    if (p.kind === "spawn_moonlet") {
      const id = String(result.moonletId ?? "");
      const m = id ? await store.getMoonlet(id) : null;
      if (!m) return { status: "mismatch", checks: [{ field: "moonlet", expected: "exists", actual: "missing", ok: false }], at };
      const spec = (p.payload as { spec: { name: string; cadence: string } }).spec;
      const checks = [eq("name", spec.name, m.name), eq("cadence", spec.cadence, m.spec.cadence), eq("parent", p.moonletId, m.parentId)];
      return { status: checks.every((x) => x.ok) ? "verified" : "mismatch", url: String(result.url ?? ""), checks, at };
    }
    return { status: "unchecked", checks: [], reason: "X posts are not read back yet", at };
  } catch (e) {
    return { status: "unchecked", checks: [], reason: (e as Error).message.slice(0, 200), at };
  }
}

/** Verify an executed proposal and store the result on it. Never throws; never writes to the provider. */
export async function verifyAndRecord(id: string, fetchImpl: typeof fetch = fetch) {
  const p = await store.getProposal(id);
  if (!p || p.status !== "executed") return null;
  const v = await verifyProposal(p, fetchImpl);
  await store.setProposalVerification(id, v);
  return v;
}
