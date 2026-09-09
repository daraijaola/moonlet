import * as store from "./store";
import * as tg from "./connections/telegram";
import * as gh from "./connections/github";
import * as x from "./connections/x";
import * as gmail from "./connections/gmail";
import { describeSpec, launchMoonlet } from "./launch";
import type { JobSpec } from "./spec";

/**
 * Draft → approve → act.
 *
 * Any tool that touches the outside world on the owner's behalf (a tweet, a
 * pull request, an issue comment) produces a proposal instead of acting, unless
 * the moonlet is on autopilot. The owner approves from the dashboard or from a
 * Telegram button. Approval executes it once; every step is recorded.
 */

export type ProposalInput =
  | { kind: "tweet"; text: string }
  | { kind: "pull_request"; plan: gh.PullRequestPlan }
  | { kind: "issue_comment"; repo: string; number: number; body: string }
  | { kind: "issue_create"; repo: string; title: string; body: string; labels?: string[] }
  | { kind: "spawn_moonlet"; spec: JobSpec; reason: string }
  | { kind: "email_send"; mail: gmail.Outgoing }
  | { kind: "email_organize"; organize: gmail.Organize; why: string }
  | { kind: "email_forward"; messageId: string; to: string; note: string; subject: string };

export type ProposeCtx = { owner: string; moonletId: string; moonletName: string; runId: string | null; autopilot: boolean; fetch?: typeof fetch };

export function describe(kind: store.ProposalKind, payload: Record<string, unknown>) {
  if (kind === "tweet") return { title: "Post on X", body: String(payload.text ?? "") };
  if (kind === "pull_request") {
    const p = payload.plan as gh.PullRequestPlan;
    return { title: `Open PR on ${p.repo}`, body: `${p.title}\n\n${p.body}\n\nfiles: ${p.files.map((f) => f.path).join(", ")}` };
  }
  if (kind === "spawn_moonlet") {
    const { spec, reason } = payload as { spec: JobSpec; reason: string };
    return { title: `Spawn a moonlet: ${spec.name}`, body: `${reason}\n\n${describeSpec(spec)}` };
  }
  if (kind === "issue_create") {
    const i = payload as { repo: string; title: string; body: string };
    return { title: `Open issue on ${i.repo}: ${i.title}`, body: i.body };
  }
  if (kind === "email_send") {
    const m = payload.mail as gmail.Outgoing;
    return { title: m.threadId ? `Reply to ${m.to}` : `Email ${m.to}`, body: `Subject: ${m.subject}\n\n${m.body}` };
  }
  if (kind === "email_organize") {
    const { organize: o, why } = payload as { organize: gmail.Organize; why: string };
    const verb: Record<gmail.OrganizeAction, string> = { archive: "Archive", unarchive: "Move back to inbox", mark_read: "Mark as read", mark_unread: "Mark as unread", star: "Star", unstar: "Unstar", important: "Mark important", not_important: "Mark not important", spam: "Report as spam", not_spam: "Not spam", trash: "Move to trash", untrash: "Restore from trash", label: `Label "${o.label ?? ""}"`, unlabel: `Remove label "${o.label ?? ""}"` };
    const what = o.messageIds?.length ? `${o.messageIds.length} email${o.messageIds.length === 1 ? "" : "s"}` : `everything matching "${o.q ?? ""}"`;
    return { title: `${verb[o.action]}: ${what}`, body: why };
  }
  if (kind === "email_forward") {
    const f = payload as { messageId: string; to: string; note: string; subject: string };
    return { title: `Forward "${f.subject}" to ${f.to}`, body: f.note };
  }
  const c = payload as { repo: string; number: number; body: string };
  return { title: `Comment on ${c.repo}#${c.number}`, body: c.body };
}

/** Create the proposal (or act immediately on autopilot). Returns what the tool should tell the model. */
export async function propose(input: ProposalInput, ctx: ProposeCtx) {
  const needs = input.kind === "tweet" ? "x" : input.kind === "spawn_moonlet" ? null : input.kind === "email_send" || input.kind === "email_organize" || input.kind === "email_forward" ? "gmail" : "github";
  if (needs && !(await store.getConnection(ctx.owner, needs))) return { proposalId: null, status: "failed" as const, result: { error: `${needs === "x" ? "X" : needs === "gmail" ? "Gmail" : "GitHub"} is not connected` } };
  const payload: Record<string, unknown> =
    input.kind === "tweet" ? { text: input.text }
    : input.kind === "pull_request" ? { plan: input.plan }
    : input.kind === "spawn_moonlet" ? { spec: input.spec, reason: input.reason }
    : input.kind === "email_send" ? { mail: input.mail }
    : input.kind === "email_organize" ? { organize: input.organize, why: input.why }
    : input.kind === "email_forward" ? { messageId: input.messageId, to: input.to, note: input.note, subject: input.subject }
    : input.kind === "issue_create" ? { repo: input.repo, title: input.title, body: input.body, labels: input.labels ?? [] }
    : { repo: input.repo, number: input.number, body: input.body };
  const id = store.newId("p");
  await store.insertProposal({ id, owner: ctx.owner, moonletId: ctx.moonletId, runId: ctx.runId, kind: input.kind, payload });

  // Autopilot covers the moonlet's own actions; bringing a new moonlet into the world always asks the owner.
  if (ctx.autopilot && input.kind !== "spawn_moonlet") {
    if (!(await store.decideProposal(id, "approved"))) return { proposalId: id, status: "pending" as const };
    const r = await execute(id, ctx.fetch);
    return { proposalId: id, status: r.status, result: r.result };
  }

  const conn = await store.getConnection<tg.TelegramConn>(ctx.owner, "telegram");
  if (conn && tg.telegramConfigured()) {
    const d = describe(input.kind, payload);
    try {
      const m = await tg.sendMessage(
        conn.data.chatId,
        `<b>${tg.esc(ctx.moonletName)}</b> wants to: <b>${tg.esc(d.title)}</b>\n\n${tg.esc(d.body).slice(0, 3000)}`,
        { buttons: [[{ text: "✓ Approve", data: `approve:${id}` }, { text: "✗ Reject", data: `reject:${id}` }]], fetch: ctx.fetch },
      );
      await store.setProposalTelegram(id, { chatId: conn.data.chatId, messageId: Number(m.id) });
    } catch {
      // Telegram down is not a reason to lose the proposal; it still shows on the dashboard.
    }
  }
  return { proposalId: id, status: "pending" as const, note: "Waiting for the owner's approval. It will run once they approve." };
}

/**
 * Owner decided. Executes on approve. Safe to call twice (second call is a no-op).
 * Approval is for this one action only; autopilot is a separate, explicit switch on
 * the moonlet page. Spawns always ask.
 */
export async function decide(id: string, action: "approve" | "reject", fetchImpl?: typeof fetch) {
  const p = await store.getProposal(id);
  if (!p) return { ok: false as const, error: "not found" };
  const moved = await store.decideProposal(id, action === "approve" ? "approved" : "rejected");
  if (!moved) return { ok: false as const, error: `already ${p.status}` };
  if (action === "reject") return { ok: true as const, status: "rejected" as const, autopilotOn: false };
  const r = await execute(id, fetchImpl);
  return { ok: true as const, status: r.status, result: r.result, autopilotOn: false };
}

async function execute(id: string, fetchImpl: typeof fetch = fetch): Promise<{ status: "executed" | "failed"; result: Record<string, unknown> }> {
  const p = await store.getProposal(id);
  if (!p) return { status: "failed", result: { error: "not found" } };
  try {
    let result: Record<string, unknown>;
    if (p.kind === "tweet") {
      result = await x.postTweet(p.owner, String(p.payload.text ?? ""), fetchImpl);
    } else if (p.kind === "spawn_moonlet") {
      const r = await launchMoonlet(p.owner, p.payload.spec as JobSpec, { parentId: p.moonletId, fetch: fetchImpl });
      if (!r.ok) throw new Error(r.error);
      result = { moonletId: r.moonlet.id, name: r.moonlet.name, url: `${process.env.APP_URL ?? "https://moonlet.16labs.xyz"}/app?m=${r.moonlet.id}`, familyNote: r.familyNote };
    } else if (p.kind === "email_send") {
      const { token, email } = await gmail.accessToken(p.owner, fetchImpl);
      result = await gmail.sendMail(token, email, p.payload.mail as gmail.Outgoing, fetchImpl);
    } else if (p.kind === "email_forward") {
      const { token, email } = await gmail.accessToken(p.owner, fetchImpl);
      const f = p.payload as { messageId: string; to: string; note: string };
      result = await gmail.forwardMessage(token, email, f.messageId, f.to, f.note, fetchImpl);
    } else if (p.kind === "email_organize") {
      const { token } = await gmail.accessToken(p.owner, fetchImpl);
      result = await gmail.organize(token, p.payload.organize as gmail.Organize, fetchImpl);
    } else if (p.kind === "issue_create") {
      const c = await gh.connectionFor(p.owner);
      if (!c) throw new Error("GitHub not connected");
      const i = p.payload as { repo: string; title: string; body: string; labels?: string[] };
      result = await gh.openIssue(c.data.token, i.repo, i.title, i.body, i.labels ?? [], fetchImpl);
    } else if (p.kind === "pull_request") {
      const c = await gh.connectionFor(p.owner);
      if (!c) throw new Error("GitHub not connected");
      result = await gh.openPullRequest(c.data.token, p.payload.plan as gh.PullRequestPlan, fetchImpl);
    } else {
      const c = await gh.connectionFor(p.owner);
      if (!c) throw new Error("GitHub not connected");
      const { repo, number, body } = p.payload as { repo: string; number: number; body: string };
      result = await gh.commentOnIssue(c.data.token, repo, number, body, fetchImpl);
    }
    await store.finishProposal(id, "executed", result);
    return { status: "executed", result };
  } catch (e) {
    const result = { error: (e as Error).message };
    await store.finishProposal(id, "failed", result);
    return { status: "failed", result };
  }
}

/** Telegram button handler: decide, then return the text the message should be edited to. */
export const telegramCallback: tg.CallbackHandler = async (action, id, ctx) => {
  const p = await store.getProposal(id);
  const d = p ? describe(p.kind, p.payload) : { title: "proposal", body: "" };
  if (!p) return "This draft no longer exists.";
  if (!(await tg.chatOwns(ctx.chatId, p.owner))) return "This chat isn't linked to the wallet that owns this draft.";
  const r = await decide(id, action);
  if (!r.ok) return `<b>${tg.esc(d.title)}</b>\n\n${tg.esc(r.error)}.`;
  if (r.status === "rejected") return `<b>${tg.esc(d.title)}</b>\n\n✗ Rejected. Nothing ${p.kind === "spawn_moonlet" ? "was spawned" : p.kind === "email_send" || p.kind === "email_forward" ? "was sent" : p.kind === "email_organize" ? "changed in your inbox" : "was posted"}.`;
  if (r.status === "executed") {
    const { url, name, familyNote } = (r.result ?? {}) as { url?: string; name?: string; familyNote?: string };
    if (p.kind === "spawn_moonlet") return `<b>${tg.esc(d.title)}</b>\n\n✓ <b>${tg.esc(name ?? "")}</b> is live and running its first check now; its reports will land here too.${familyNote ? `\n\n${tg.esc(familyNote)}` : ""}\n${tg.esc(url ?? "")}`;
    const m = await store.getMoonlet(p.moonletId);
    const note = m && !m.autopilot ? `\n\n<i>It will ask again next time. To let ${tg.esc(m.name)} act on its own, turn on Autopilot on its page.</i>` : "";
    if (p.kind === "email_send" || p.kind === "email_forward") return `<b>${tg.esc(d.title)}</b>\n\n✓ Sent from your Gmail.${url ? ` ${tg.esc(url)}` : ""}${note}`;
    if (p.kind === "email_organize") return `<b>${tg.esc(d.title)}</b>\n\n✓ Done in your Gmail.${note}`;
    return `<b>${tg.esc(d.title)}</b>\n\n✓ Done.${url ? ` ${tg.esc(url)}` : ""}${note}`;
  }
  return `<b>${tg.esc(d.title)}</b>\n\n⚠ Approved, but it failed: ${tg.esc(String((r.result as { error?: string })?.error ?? "unknown"))}`;
};
