import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import { extractAnswer, listSubmissions } from "@/moonlet/hunt";
import { grantOf } from "@/moonlet/hunt-grants";
import * as store from "@/moonlet/store";

export const dynamic = "force-dynamic";

/**
 * Your finished runs that carry an ANSWER line, newest first, with whether each is anchored and already entered (in any
 * season: a run is entered once), and your account id, which per-player answers are computed from.
 */
export async function GET(req: Request) {
  const owner = ownerFrom(req);
  if (!owner) return bad("sign in first", 401);
  const entered = new Set((await listSubmissions()).filter((s) => s.owner === owner).map((s) => s.runId));
  const out: Array<{ runId: string; moonletId: string; moonlet: string; at: number; answer: string; anchored: boolean; txHash: string | null; entered: boolean }> = [];
  for (const m of await store.listMoonlets(owner)) {
    for (const r of await store.listRuns(m.id, 30)) {
      if (r.status !== "done") continue;
      const answer = extractAnswer(r);
      if (!answer) continue;
      out.push({ runId: r.id, moonletId: m.id, moonlet: m.spec.name, at: r.at, answer, anchored: !!r.txHash, txHash: r.txHash, entered: entered.has(r.id) });
    }
  }
  out.sort((a, b) => b.at - a.at);
  const grant = await grantOf(owner);
  return NextResponse.json({ account: owner, runs: out.slice(0, 20), grant });
}
