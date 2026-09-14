import { CADENCE_MS, type Cadence, type JobSpec } from "./spec";

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
 * The rule is one line: a moonlet runs on the cadence its owner set, spending up to the cap its owner set, and goes quiet
 * only when the wallet's Orbio balance can't pay for a run (that check happens at run time, in the runner). Nothing here
 * slows a schedule or splits income; the earn figure is shown so the owner can see whether the bag keeps up.
 */
export function plan(spec: JobSpec, bag: number, earnPerDayUsd = estimateEarnPerDay(bag)): Plan {
  if (bag < HOLDER_FLOOR) {
    return { cadence: spec.cadence, perRunCapUsd: 0, burnPerDayUsd: 0, earnPerDayUsd, quiet: true, reason: `bag below ${HOLDER_FLOOR}` };
  }
  return { cadence: spec.cadence, perRunCapUsd: round(spec.spendCapUsd), burnPerDayUsd: round(spec.spendCapUsd * runsPerDay(spec.cadence)), earnPerDayUsd, quiet: false };
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

/** What to tell an owner who asked for a cadence: it's set, plus a plain warning when the cap outruns what the bag earns. */
export function cadenceReply(name: string, spec: JobSpec, cadence: Cadence, earnPerDayUsd: number) {
  const burn = spec.spendCapUsd * runsPerDay(cadence);
  if (burn <= spendablePerDay(earnPerDayUsd)) return `Done. ${name} now reports ${CADENCE_WORDS[cadence]}.`;
  return `Done. ${name} now reports ${CADENCE_WORDS[cadence]}. Heads up: at up to $${spec.spendCapUsd.toFixed(3)} a run that's about $${burn.toFixed(2)}/day, and your bag earns about $${earnPerDayUsd.toFixed(2)}/day, so it will draw the balance down and go quiet when the credits run out.`;
}
