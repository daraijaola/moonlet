import { NextResponse } from "next/server";
import { ownerFrom } from "@/moonlet/http";
import { describe } from "@/moonlet/proposals";
import * as store from "@/moonlet/store";

/**
 * What this moonlet actually did, with the read-back verification for each action. The owner sees the full card; anyone else
 * sees the receipt only: kind, when, verified or not, which fields were checked, and the provider link when the moonlet's job is public.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await store.getMoonlet(id);
  if (!m || m.status === "deleted") return NextResponse.json({ actions: [] });
  const owner = ownerFrom(req);
  const mine = !!owner && owner === m.owner;
  const rows = await store.listActions(id, 20);
  const isPrivateKind = (k: store.ProposalKind) => k.startsWith("email_");
  return NextResponse.json({
    actions: rows.map((p) => {
      const d = describe(p.kind, p.payload);
      const priv = !mine && isPrivateKind(p.kind);
      return {
        id: p.id,
        kind: p.kind,
        status: p.status,
        at: p.decidedAt ?? p.createdAt,
        runId: p.runId,
        title: priv ? (p.kind === "email_organize" ? "Tidied the owner's inbox" : p.kind === "email_forward" ? "Forwarded an email" : "Sent an email") : d.title,
        body: mine ? d.body : "",
        url: priv ? null : (p.verification?.url ?? (p.result?.url as string | undefined) ?? null),
        error: mine ? ((p.result as { error?: string } | null)?.error ?? null) : null,
        verification: p.verification
          ? { status: p.verification.status, at: p.verification.at, reason: mine ? p.verification.reason : undefined, checks: p.verification.checks.map((c) => (mine || !priv ? c : { field: c.field, ok: c.ok, expected: "", actual: "" })) }
          : null,
      };
    }),
  });
}
