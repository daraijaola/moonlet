import { NextResponse } from "next/server";
import { explorerTx } from "@/moonlet/anchor";
import { bad } from "@/moonlet/http";
import * as store from "@/moonlet/store";

/** Public: the run feed, with anchor links. This is the API other builders can consume. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await store.getMoonlet(id);
  if (!m) return bad("not found", 404);
  const runs = await store.listRuns(id);
  const anchoring = !!process.env.ANCHOR_PRIVATE_KEY;
  return NextResponse.json({ anchoring, runs: runs.map((r) => ({ ...r, explorerUrl: r.txHash ? explorerTx(r.txHash) : null })) });
}
