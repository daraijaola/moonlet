import { NextResponse } from "next/server";
import { ownerFrom } from "@/moonlet/http";
import { describe } from "@/moonlet/proposals";
import { isPrivateSpec } from "@/moonlet/privacy";
import * as store from "@/moonlet/store";

/**
 * What this moonlet actually did, with the read-back verification for each action. The owner sees everything. Anyone else sees
 * the receipt only, under the same rule as the report feed: an action is private if the moonlet works inside its owner's
 * accounts (mail, repo reads) or if the run it came from was private; a private action shows kind, time and verification
 * status with no title, link, or field values. Public actions (a public repo job posting to a public repo) show their card.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await store.getMoonlet(id);
  if (!m || m.status === "deleted") return NextResponse.json({ actions: [] });
  const owner = ownerFrom(req);
  const mine = !!owner && owner === m.owner;
  const rows = await store.listActions(id, 20);
  const runIds = Array.from(new Set(rows.map((p) => p.runId).filter((x): x is string => !!x)));
  const privateRuns = new Set((await Promise.all(runIds.map((r) => store.getRun(r)))).filter((r) => r?.private).map((r) => r!.id));
  const specPrivate = isPrivateSpec(m.spec);
  const GENERIC: Record<store.ProposalKind, string> = { tweet: "Posted on X", pull_request: "Opened a pull request", issue_comment: "Commented on an issue", issue_create: "Opened an issue", spawn_moonlet: "Spawned a moonlet", email_send: "Sent an email", email_forward: "Forwarded an email", email_organize: "Tidied the owner's inbox", activate_credit: "Activated CREDIT" };
  return NextResponse.json({
    actions: rows.map((p) => {
      const priv = !mine && (specPrivate || p.kind.startsWith("email_") || (p.runId ? privateRuns.has(p.runId) : false));
      const d = priv ? null : describe(p.kind, p.payload);
      const v = p.verification;
      return {
        id: p.id,
        kind: p.kind,
        status: p.status,
        at: p.decidedAt ?? p.createdAt,
        runId: p.runId,
        title: priv ? GENERIC[p.kind] : d!.title,
        body: mine ? d!.body : "",
        url: priv ? null : (v?.url ?? (p.result?.url as string | undefined) ?? null),
        error: mine ? ((p.result as { error?: string } | null)?.error ?? null) : null,
        verification: v
          ? { status: v.status, at: v.at, scope: v.scope, reason: mine ? v.reason : undefined, checks: priv ? v.checks.map((c) => ({ field: mine ? c.field : "field", expected: "", actual: "", ok: c.ok })) : v.checks }
          : null,
      };
    }),
  });
}
