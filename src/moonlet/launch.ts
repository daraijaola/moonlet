import { committedBurn, plan, spendablePerDay, CADENCE_WORDS } from "./budget";
import { bagOf } from "./bag";
import type { JobSpec } from "./spec";
import * as store from "./store";

/**
 * One way to bring a moonlet into the world, whether the owner launches it from
 * the wizard, asks the bot for it, or an existing moonlet spawns it. Plans the
 * child against the live bag, stores it, and starts its first run in the
 * background so whoever asked sees it working right away.
 */

/** Hard ceiling per wallet: a bag feeds a handful of moonlets, not a swarm. */
export const MAX_MOONLETS = 6;

export type LaunchOpts = { autopilot?: boolean; parentId?: string | null; runNow?: boolean; delivery?: { telegram?: string; x?: string }; fetch?: typeof fetch };

export async function launchMoonlet(owner: string, spec: JobSpec, opts: LaunchOpts = {}) {
  const siblings = await store.listMoonlets(owner);
  if (siblings.length >= MAX_MOONLETS) return { ok: false as const, error: `you already have ${siblings.length} moonlets, the most one wallet can run; retire one first` };

  const bag = await bagOf(owner, opts.fetch);
  const p = plan(spec, bag, undefined, committedBurn(siblings));
  const id = store.newId("m");
  const now = Date.now();
  await store.insertMoonlet({
    id,
    owner,
    name: spec.name,
    spec,
    status: p.quiet ? "quiet" : "idle",
    delivery: { telegram: opts.delivery?.telegram || undefined, x: opts.delivery?.x || undefined },
    autopilot: !!opts.autopilot,
    parentId: opts.parentId ?? null,
    key: null,
    cadence: p.cadence,
    perRunCapUsd: p.perRunCapUsd,
    earnPerDayUsd: p.earnPerDayUsd,
    burnPerDayUsd: p.burnPerDayUsd,
    nextRunAt: now,
    createdAt: now,
  });

  let firstRunStarted = false;
  if (opts.runNow !== false && !p.quiet && (await store.claimForRun(id, now))) {
    firstRunStarted = true;
    // Loaded lazily: the scheduler imports the runner, whose tools propose spawns, which land back here.
    void import("./scheduler").then(({ runOne }) => runOne(id, { fetch: opts.fetch })).catch(() => undefined);
  }
  const moonlet = (await store.getMoonlet(id))!;
  return { ok: true as const, moonlet, plan: p, firstRunStarted, familyNote: familyNote(siblings, p.burnPerDayUsd, p.earnPerDayUsd) };
}

/** Plain words on what adding this moonlet does to the wallet's budget; empty when the income covers everyone. */
export function familyNote(siblings: store.MoonletRow[], burnPerDayUsd: number, earnPerDayUsd: number) {
  const active = siblings.filter((m) => m.status !== "paused");
  const total = active.reduce((s, m) => s + m.burnPerDayUsd, 0) + burnPerDayUsd;
  const spendable = spendablePerDay(earnPerDayUsd);
  if (total <= spendable) return "";
  return `Together your ${active.length + 1} moonlets would burn about $${total.toFixed(3)}/day against the $${spendable.toFixed(3)}/day your bag earns; when credits run short the ones with the most runs go quiet first.`;
}

export function describeSpec(spec: JobSpec) {
  return `${spec.objective}\n\n${CADENCE_WORDS[spec.cadence]} · ${spec.template} · up to $${spec.spendCapUsd.toFixed(3)} a run${spec.sources?.length ? `\nsources: ${spec.sources.join(", ")}` : ""}`;
}
