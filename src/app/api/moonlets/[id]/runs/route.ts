import { NextResponse } from "next/server";
import { explorerTx } from "@/moonlet/anchor";
import { bad, ownerFrom } from "@/moonlet/http";
import * as store from "@/moonlet/store";

/** Public: the run feed, with anchor links. This is the API other builders can consume. Files a run wrote are listed for the owner only. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await store.getMoonlet(id);
  if (!m) return bad("not found", 404);
  const runs = await store.listRuns(id);
  const anchoring = !!process.env.ANCHOR_PRIVATE_KEY;
  const files = ownerFrom(req) === m.owner ? await store.filesForRuns(runs.map((r) => r.id)) : {};
  return NextResponse.json({ anchoring, runs: runs.map((r) => ({ ...r, explorerUrl: r.txHash ? explorerTx(r.txHash) : null, files: (files[r.id] ?? []).map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, url: `/api/files/${f.id}` })) })) });
}
