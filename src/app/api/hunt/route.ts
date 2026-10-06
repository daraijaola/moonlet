import { NextResponse } from "next/server";
import { huntConfig, huntPhase, listSubmissions, nextStageAt, perPlayer, releasedStages, results, stageSignedBy } from "@/moonlet/hunt";
import { anchorLow } from "@/moonlet/anchor-gas";
import { grantConfig, grantsTaken, treasuryHoldings } from "@/moonlet/hunt-grants";

export const dynamic = "force-dynamic";

let cached: { at: number; season: string; value: Awaited<ReturnType<typeof results>> } | null = null;

/**
 * Public state of the hunt: phase, season, the stages released so far (never a future one), clue (once it starts),
 * this season's entries, whether anchoring is delayed, and the verified results after the deadline.
 *
 * Until the entries are judged, an entry shows only a shortened account and its block: no moonlet, run or anchor
 * transaction (whose calldata names the moonlet and run), so nobody learns whose public moonlets to read.
 */
export async function GET() {
  const c = huntConfig();
  const phase = huntPhase(c);
  const season = c.season ?? "1";
  const subs = await listSubmissions(season);
  // Results read the chain for every correct entry; computed at most every five minutes (a "not revealed" state, every 30s).
  const stale = !cached || cached.season !== season || Date.now() - cached.at > (cached.value?.error ? 30_000 : 5 * 60_000);
  if (phase === "ended" && stale) cached = { at: Date.now(), season, value: await results({ config: c }) };
  const res = phase === "ended" ? cached?.value ?? null : null;
  const judged = (!!res && !res.error) || phase === "void";
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const g = grantConfig();
  const [taken, held, low] = await Promise.all([grantsTaken(), treasuryHoldings(g.treasury), anchorLow()]);
  const stages = await Promise.all(
    releasedStages(c).map(async (s) => ({ id: s.id, title: s.title, releaseAt: s.releaseAt, clue: s.clue, signature: s.signature, signatureValid: await stageSignedBy(s, c.signer), artifacts: s.artifacts })),
  );
  return NextResponse.json({
    phase,
    season,
    seasonTitle: c.seasonTitle ?? null,
    perPlayer: perPlayer(c),
    phraseCommit: c.phraseCommit ?? null,
    signer: c.signer ?? null,
    start: c.start || null,
    deadline: c.deadline || null,
    prize: c.prize,
    anchorLow: low,
    stages,
    stagesTotal: (c.stages ?? []).length,
    nextStageAt: nextStageAt(c),
    treasury: g.treasury,
    held,
    grants: { total: g.count, left: Math.max(0, g.count - taken), credit: g.credit, minOrbio: g.minOrbio },
    clue: phase === "live" || phase === "ended" || phase === "void" ? c.clue : null,
    voided: phase === "void" ? c.voided : null,
    entryCount: subs.length,
    entries: subs.map((s) => (judged ? { wallet: short(s.owner), moonletId: s.moonletId, runId: s.runId, txHash: s.txHash, block: s.block, txIndex: s.txIndex, submittedAt: s.submittedAt } : { wallet: short(s.owner), block: s.block })),
    results: res && {
      error: res.error ?? null,
      winner: res.winner && { wallet: short(res.winner.owner), moonletId: res.winner.moonletId, runId: res.winner.runId, txHash: res.winner.txHash, block: res.winner.block, txIndex: res.winner.txIndex },
      entries: res.entries.map((e) => ({ wallet: short(e.owner), runId: e.runId, moonletId: e.moonletId, txHash: e.txHash, block: e.block, txIndex: e.txIndex, correct: e.correct, verified: e.correct && e.anchorOk, reason: e.reason ?? null })),
    },
  });
}
