import { CADENCE_MS, type Cadence, type JobSpec, recommendedCapUsd } from "./spec";

/**
 * Budgeting to income. A moonlet may only spend what its owner's bag earns,
 * minus a reserve so the key never hits zero mid-run.
 */

export const HOLDER_FLOOR = 1_000;
/** Placeholder until live Orbio balance deltas are used. ~$30k/day over 950M tokens. */
export const EARN_PER_TOKEN_PER_DAY_USD = 0.0000316;
const RESERVE = 0.15;

/** What the bag's income leaves for moonlets after the reserve. */
export function spendablePerDay(earnPerDayUsd: number) {
  return earnPerDayUsd * (1 - RESERVE);
}

export function estimateEarnPerDay(bag: number) {
  return bag >= HOLDER_FLOOR ? bag * EARN_PER_TOKEN_PER_DAY_USD : 0;
}

export function runsPerDay(cadence: Cadence) {
  return 86_400_000 / CADENCE_MS[cadence];
}

export type Plan = {
  cadence: Cadence;
  perRunCapUsd: number;
  burnPerDayUsd: number;
  earnPerDayUsd: number;
  quiet: boolean;
  reason?: string;
};

/**
 * Given a spec and the owner's bag, decide how often and how expensively the
 * moonlet may run. Slows the cadence before cutting the cap, because a run that
 * can't afford its tools is worse than a run that happens less often.
 */
export function plan(spec: JobSpec, bag: number, earnPerDayUsd = estimateEarnPerDay(bag), committedPerDayUsd = 0): Plan {
  if (bag < HOLDER_FLOOR) {
    return { cadence: spec.cadence, perRunCapUsd: 0, burnPerDayUsd: 0, earnPerDayUsd, quiet: true, reason: `bag below ${HOLDER_FLOOR}` };
  }
  // One wallet, one income: what the owner's other active moonlets already burn per day is not available to this one.
  const spendable = Math.max(0, spendablePerDay(earnPerDayUsd) - committedPerDayUsd);
  // Templates were costed on Flash; a heavier model needs a bigger cap to finish, so slow the cadence before starving the run.
  const floorCap = Math.min(recommendedCapUsd(spec.template, spec.model ?? "auto"), spec.spendCapUsd);
  const order: Cadence[] = ["15m", "1h", "4h", "6h", "12h", "24h", "7d"];
  let cadence = spec.cadence;
  for (let i = order.indexOf(spec.cadence); i < order.length; i++) {
    cadence = order[i];
    const cap = Math.min(spec.spendCapUsd, spendable / runsPerDay(cadence));
    if (cap >= floorCap) {
      return { cadence, perRunCapUsd: round(cap), burnPerDayUsd: round(cap * runsPerDay(cadence)), earnPerDayUsd, quiet: false };
    }
  }
  return {
    cadence: "7d",
    perRunCapUsd: 0,
    burnPerDayUsd: 0,
    earnPerDayUsd,
    quiet: true,
    reason: committedPerDayUsd > 0
      ? `the bag earns $${earnPerDayUsd.toFixed(3)}/day and your other moonlets already use $${committedPerDayUsd.toFixed(3)}; not enough left for a ${spec.template} run ($${floorCap})`
      : `earns $${earnPerDayUsd.toFixed(3)}/day, below the $${floorCap} a ${spec.template} run needs`,
  };
}

/** Burn per day the wallet's other active moonlets are already planned for. */
export function committedBurn(siblings: Array<{ id: string; status: string; burnPerDayUsd: number }>, exceptId?: string) {
  return siblings.filter((m) => m.id !== exceptId && m.status !== "paused" && m.status !== "quiet" && m.status !== "deleted").reduce((s, m) => s + m.burnPerDayUsd, 0);
}

/** How much to ask Orbio for on a fresh key: about three days of burn, clamped to Orbio's $200 ceiling. */
export function keyClaimAmount(p: Plan) {
  return Math.min(200, Math.max(2, round(p.burnPerDayUsd * 3)));
}

/** Rotate or top up when the active key is nearly spent. */
export function keyNeedsRefill(remainingUsd: number, p: Plan) {
  return remainingUsd < Math.max(p.perRunCapUsd * 2, 0.5);
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export const CADENCE_WORDS: Record<Cadence, string> = { "15m": "every 15 minutes", "1h": "hourly", "4h": "every 4 hours", "6h": "every 6 hours", "12h": "every 12 hours", "24h": "daily", "7d": "weekly" };

/**
 * What to tell an owner who asked for a cadence: the plan slows a cadence the
 * bag's income can't afford, so "every 6 hours" may really run every 12.
 */
export function cadenceReply(name: string, spec: JobSpec, cadence: Cadence, earnPerDayUsd: number) {
  const p = plan({ ...spec, cadence }, HOLDER_FLOOR, earnPerDayUsd);
  if (p.quiet || p.cadence === cadence) return `Done. ${name} now reports ${CADENCE_WORDS[cadence]}.`;
  return `Done. ${name} is set to ${CADENCE_WORDS[cadence]}, but your bag earns about $${earnPerDayUsd.toFixed(2)}/day, which only pays for a run ${CADENCE_WORDS[p.cadence]}. It will run ${CADENCE_WORDS[p.cadence]} until the bag grows.`;
}
