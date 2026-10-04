import { NextResponse } from "next/server";
import { huntConfig, huntPhase, listSubmissions, results } from "@/moonlet/hunt";
import { grantConfig, grantsTaken, treasuryHoldings } from "@/moonlet/hunt-grants";

export const dynamic = "force-dynamic";

let cached: { at: number; value: Awaited<ReturnType<typeof results>> } | null = null;

/** Public state of the hunt: phase, clue (once it starts), entries (no answers), and the verified results after the deadline. */
export async function GET() {
  const c = huntConfig();
  const phase = huntPhase(c);
  const subs = await listSubmissions();
  // Results read the chain for every correct entry; computed at most every five minutes.
  if (phase === "ended" && (!cached || Date.now() - cached.at > 5 * 60_000)) cached = { at: Date.now(), value: await results({ config: c }) };
  const res = phase === "ended" ? cached?.value ?? null : null;
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const g = grantConfig();
  const [taken, held] = await Promise.all([grantsTaken(), treasuryHoldings(g.treasury)]);
  return NextResponse.json({
    phase,
    start: c.start || null,
    deadline: c.deadline || null,
    prize: c.prize,
    treasury: g.treasury,
    held,
    grants: { total: g.count, left: Math.max(0, g.count - taken), credit: g.credit, minOrbio: g.minOrbio },
    clue: phase === "live" || phase === "ended" ? c.clue : null,
    entries: subs.map((s) => ({ wallet: short(s.owner), moonletId: s.moonletId, runId: s.runId, txHash: s.txHash, block: s.block, submittedAt: s.submittedAt })),
    results: res && {
      winner: res.winner && { wallet: short(res.winner.owner), moonletId: res.winner.moonletId, runId: res.winner.runId, txHash: res.winner.txHash, block: res.winner.block },
      entries: res.entries.map((e) => ({ wallet: short(e.owner), runId: e.runId, txHash: e.txHash, block: e.block, correct: e.correct, verified: e.correct && e.anchorOk, reason: e.reason ?? null })),
    },
  });
}
