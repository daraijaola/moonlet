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
  /** "complete" when every approved field was compared; "sample" when only some objects could be (says so on the card). */
  scope: "complete" | "sample";
  /** Where the real object lives. */
  url?: string;
  checks: Check[];
  /** Why it could not be checked, when status is unchecked. */
  reason?: string;
  at: number;
};

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const eq = (field: string, expected: unknown, actual: unknown, cmp: (a: string, b: string) => boolean = (a, b) => a === b): Check => ({ field, expected: String(expected ?? ""), actual: String(actual ?? ""), ok: cmp(norm(expected), norm(actual)) });
const unchecked = (reason: string, at: number): Verification => ({ status: "unchecked", scope: "complete", checks: [], reason, at });
const addrs = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? []));
const sameAddrs = (a: string, b: string) => { const x = addrs(a), y = addrs(b); return x.size === y.size && [...x].every((v) => y.has(v)); };

export async function verifyProposal(p: store.ProposalRow, fetchImpl: typeof fetch = fetch): Promise<Verification> {
  const at = Date.now();
  const result = (p.result ?? {}) as Record<string, unknown>;
  try {
    if (p.kind === "issue_create" || p.kind === "pull_request" || p.kind === "issue_comment") {
      const c = await gh.connectionFor(p.owner);
      if (!c) return unchecked("GitHub is no longer connected", at);
      if (p.kind === "issue_create") {
        const i = p.payload as { repo: string; title: string; body: string; labels?: string[] };
        const number = Number(result.number);
        if (!number) return unchecked("no issue number was returned", at);
        const got = await gh.readIssue(c.data.token, i.repo, number, fetchImpl);
        const checks = [eq("repository", i.repo, got.repo), eq("title", i.title, got.title), eq("body", i.body, got.body), eq("labels", (i.labels ?? []).slice().sort().join(","), got.labels.slice().sort().join(","))];
        return { status: checks.every((x) => x.ok) ? "verified" : "mismatch", scope: "complete", url: got.url, checks, at };
      }
      if (p.kind === "pull_request") {
        const plan = (p.payload as { plan: gh.PullRequestPlan }).plan;
        const number = Number(result.number);
        if (!number) return unchecked("no pull request number was returned", at);
        const got = await gh.readPull(c.data.token, plan.repo, number, fetchImpl);
        const checks = [eq("repository", plan.repo, got.repo), eq("title", plan.title, got.title), eq("files", plan.files.map((f) => f.path).sort().join(","), got.files.map((f) => f.filename).sort().join(","))];
        // Not just the file names: the bytes on the branch must be the bytes that were approved.
        for (const f of plan.files) {
          const onBranch = await gh.readFileAt(c.data.token, plan.repo, got.headRef, f.path, fetchImpl).catch(() => null);
          checks.push(onBranch == null ? { field: `content of ${f.path}`, expected: `${f.content.length} chars`, actual: "unreadable", ok: false } : eq(`content of ${f.path}`, f.content, onBranch));
        }
        return { status: checks.every((x) => x.ok) ? "verified" : "mismatch", scope: "complete", url: got.url, checks, at };
      }
      const cm = p.payload as { repo: string; number: number; body: string };
      const url = String(result.url ?? "");
      const commentId = Number(url.match(/issuecomment-(\d+)/)?.[1]);
      if (!commentId) return unchecked("no comment id was returned", at);
      const got = await gh.readComment(c.data.token, cm.repo, commentId, fetchImpl);
      const checks = [eq("repository", cm.repo, got.repo), eq("issue", cm.number, got.issueNumber), eq("body", cm.body, got.body)];
      return { status: checks.every((x) => x.ok) ? "verified" : "mismatch", scope: "complete", url: got.url, checks, at };
    }
    if (p.kind === "email_send" || p.kind === "email_forward") {
      const messageId = String(result.messageId ?? "");
      if (!messageId) return unchecked("no message id was returned", at);
      const { token } = await gmail.accessToken(p.owner, fetchImpl);
      const got = await gmail.readMessage(token, messageId, fetchImpl);
      const checks: Check[] = [];
      if (p.kind === "email_send") {
        const m = (p.payload as { mail: gmail.Outgoing }).mail;
        checks.push(eq("to", m.to, got.to, sameAddrs));
        // Cc is compared whether or not one was approved: an unexpected Cc is a mismatch, not a pass.
        checks.push(eq("cc", m.cc ?? "", got.cc ?? "", sameAddrs));
        checks.push(eq("bcc", "", got.bcc ?? "", sameAddrs));
        checks.push(eq("subject", m.subject, got.subject));
        checks.push(eq("body", m.body, got.body, (a, b) => b.startsWith(a) || a === b));
        if (m.threadId) checks.push(eq("thread", m.threadId, got.threadId));
      } else {
        const f = p.payload as { to: string; subject: string; note: string };
        checks.push(eq("to", f.to, got.to, sameAddrs));
        checks.push(eq("cc", "", got.cc ?? "", sameAddrs));
        checks.push(eq("bcc", "", got.bcc ?? "", sameAddrs));
        checks.push(eq("subject", /^fwd?:/i.test(f.subject) ? f.subject : `Fwd: ${f.subject}`, got.subject));
        checks.push(eq("note", f.note, got.body, (a, b) => a === "" || b.startsWith(a)));
      }
      checks.push(eq("in sent mail", "yes", got.labelIds.includes("SENT") ? "yes" : "no"));
      return { status: checks.every((x) => x.ok) ? "verified" : "mismatch", scope: "complete", url: `https://mail.google.com/mail/u/0/#all/${got.threadId}`, checks, at };
    }
    if (p.kind === "email_organize") {
      const o = (p.payload as { organize: gmail.Organize }).organize;
      const all = o.messageIds ?? [];
      const ids = all.slice(0, 100);
      if (!ids.length) return { status: "verified", scope: "complete", checks: [{ field: "messages", expected: "none", actual: "none touched", ok: true }], at };
      const { token } = await gmail.accessToken(p.owner, fetchImpl);
      const want: Partial<Record<gmail.OrganizeAction, { has?: string; lacks?: string }>> = { archive: { lacks: "INBOX" }, unarchive: { has: "INBOX" }, mark_read: { lacks: "UNREAD" }, mark_unread: { has: "UNREAD" }, star: { has: "STARRED" }, unstar: { lacks: "STARRED" }, important: { has: "IMPORTANT" }, not_important: { lacks: "IMPORTANT" }, spam: { has: "SPAM" }, not_spam: { lacks: "SPAM" }, trash: { has: "TRASH" }, untrash: { lacks: "TRASH" } };
      const w = want[o.action];
      if (!w) return unchecked("label changes are not checked yet", at);
      const checks: Check[] = [];
      for (let i = 0; i < ids.length; i += 10) {
        const batch = await Promise.all(ids.slice(i, i + 10).map(async (id) => ({ id, got: await gmail.readMessageLabels(token, id, fetchImpl).catch(() => null) })));
        for (const { id, got } of batch) {
          if (!got) { checks.push({ field: `message ${id.slice(0, 8)}`, expected: o.action, actual: "unreadable", ok: false }); continue; }
          const ok = (!w.has || got.includes(w.has)) && (!w.lacks || !got.includes(w.lacks));
          checks.push({ field: `message ${id.slice(0, 8)}`, expected: o.action, actual: got.join(",") || "(no labels)", ok });
        }
      }
      const scope = all.length > ids.length ? "sample" : "complete";
      if (scope === "sample") checks.push({ field: "coverage", expected: `${all.length} messages`, actual: `${ids.length} checked`, ok: true });
      return { status: checks.every((x) => x.ok) ? "verified" : "mismatch", scope, checks, at };
    }
    if (p.kind === "spawn_moonlet") {
      const id = String(result.moonletId ?? "");
      const m = id ? await store.getMoonlet(id) : null;
      if (!m) return { status: "mismatch", scope: "complete", checks: [{ field: "moonlet", expected: "exists", actual: "missing", ok: false }], at };
      const spec = (p.payload as { spec: { name: string; cadence: string; objective: string } }).spec;
      const checks = [eq("name", spec.name, m.name), eq("cadence", spec.cadence, m.spec.cadence), eq("objective", spec.objective, m.spec.objective), eq("parent", p.moonletId, m.parentId)];
      return { status: checks.every((x) => x.ok) ? "verified" : "mismatch", scope: "complete", url: String(result.url ?? ""), checks, at };
    }
    return unchecked("X posts are not read back yet", at);
  } catch (e) {
    return unchecked((e as Error).message.slice(0, 200), at);
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
