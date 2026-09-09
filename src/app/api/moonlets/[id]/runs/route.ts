import { NextResponse } from "next/server";
import { explorerTx } from "@/moonlet/anchor";
import { bad, ownerFrom } from "@/moonlet/http";
import * as store from "@/moonlet/store";
import { redactRun } from "@/moonlet/privacy";

/** Public: the run feed, with anchor links. This is the API other builders can consume. Files a run wrote are listed for the owner only, and an inbox moonlet's words stay with its owner. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await store.getMoonlet(id);
  if (!m) return bad("not found", 404);
  const mine = ownerFrom(req) === m.owner;
  const runs = (await store.listRuns(id)).map((r) => (mine || !r.private ? r : redactRun(r)));
  const anchoring = !!process.env.ANCHOR_PRIVATE_KEY;
  const files = mine ? await store.filesForRuns(runs.map((r) => r.id)) : {};
  return NextResponse.json({ anchoring, runs: runs.map((r) => ({ ...r, explorerUrl: r.txHash ? explorerTx(r.txHash) : null, files: (files[r.id] ?? []).map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, url: `/api/files/${f.id}` })) })) });
}
