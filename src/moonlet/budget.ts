import { CADENCE_MS, type Cadence, type JobSpec } from "./spec";

/**
 * Budgeting to income. Under Orbio's CREDIT protocol the bag earns by staking:
 * staked ORBIO mints CREDIT every hour, and the owner activates CREDIT into the
 * AI balance the moonlets spend. The earn figure below is an estimate from the
 * staked amount, shown so the owner can see whether the bag keeps up.
 */

/** Rough CREDIT minted per staked ORBIO per day, from the fee share Orbio publishes. An estimate, labelled as one wherever it appears. */
export const EARN_PER_TOKEN_PER_DAY_USD = 0.0000316;
const RESERVE = 0.15;

/** What the bag's income leaves for moonlets after the reserve. */
export function spendablePerDay(earnPerDayUsd: number) {
  return earnPerDayUsd * (1 - RESERVE);
}

export function estimateEarnPerDay(staked: number) {
  return Math.max(0, staked) * EARN_PER_TOKEN_PER_DAY_USD;
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
 * only when the activated AI balance can't pay for a run (that check happens at run time, in the runner). Nothing here
 * slows a schedule or splits income; the earn figure is shown so the owner can see whether the bag keeps up.
 */
export function plan(spec: JobSpec, staked: number, earnPerDayUsd = estimateEarnPerDay(staked)): Plan {
  return { cadence: spec.cadence, perRunCapUsd: round(spec.spendCapUsd), burnPerDayUsd: round(spec.spendCapUsd * runsPerDay(spec.cadence)), earnPerDayUsd, quiet: false };
}


/** How much CREDIT to suggest activating when a moonlet goes quiet: about a week of its runs, never under $2. */
export function activationAmount(perRunCapUsd: number, cadence: Cadence) {
  return Math.max(2, Math.ceil(perRunCapUsd * runsPerDay(cadence) * 7 * 100) / 100);
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export const CADENCE_WORDS: Record<Cadence, string> = { "15m": "every 15 minutes", "1h": "hourly", "4h": "every 4 hours", "6h": "every 6 hours", "12h": "every 12 hours", "24h": "daily", "7d": "weekly" };

/** What to tell an owner who asked for a cadence: it's set, plus a plain warning when the cap outruns what the bag earns. */
export function cadenceReply(name: string, spec: JobSpec, cadence: Cadence, earnPerDayUsd: number) {
  const burn = spec.spendCapUsd * runsPerDay(cadence);
  if (burn <= spendablePerDay(earnPerDayUsd)) return `Done. ${name} now reports ${CADENCE_WORDS[cadence]}.`;
  return `Done. ${name} now reports ${CADENCE_WORDS[cadence]}. Heads up: at up to $${spec.spendCapUsd.toFixed(3)} a run that's about $${burn.toFixed(2)}/day, and your bag earns about $${earnPerDayUsd.toFixed(2)}/day, so it will draw the balance down and ask you to activate more CREDIT when it runs out.`;
}
