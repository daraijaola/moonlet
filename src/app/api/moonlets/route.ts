import { NextResponse } from "next/server";
import { z } from "zod";
import { plan } from "@/moonlet/budget";
import { bad, ownerFrom } from "@/moonlet/http";
import { bagOf, runOne } from "@/moonlet/scheduler";
import { JobSpec } from "@/moonlet/spec";
import * as store from "@/moonlet/store";

export async function GET(req: Request) {
  const owner = ownerFrom(req);
  if (!owner) return bad("sign in with your wallet first", 401);
  const rows = await store.listMoonlets(owner);
  return NextResponse.json({ moonlets: rows.map(publicMoonlet) });
}

const Launch = z.object({
  spec: JobSpec,
  delivery: z.object({ telegram: z.string().max(64).optional(), x: z.string().max(64).optional() }).default({}),
  runNow: z.boolean().default(true),
});

/** Launch. Plans against the live bag, stores, and (by default) fires the first run immediately. */
export async function POST(req: Request) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  const body = Launch.safeParse(await req.json().catch(() => null));
  if (!body.success) return bad(body.error.message);
  const { spec, delivery, runNow } = body.data;

  const bag = await bagOf(owner);
  const p = plan(spec, bag);
  const id = store.newId("m");
  const now = Date.now();
  await store.insertMoonlet({
    id,
    owner,
    name: spec.name,
    spec,
    status: p.quiet ? "quiet" : "idle",
    delivery: { telegram: delivery.telegram || undefined, x: delivery.x || undefined },
    key: null,
    cadence: p.cadence,
    perRunCapUsd: p.perRunCapUsd,
    earnPerDayUsd: p.earnPerDayUsd,
    burnPerDayUsd: p.burnPerDayUsd,
    nextRunAt: now,
    createdAt: now,
  });

  let first: Awaited<ReturnType<typeof runOne>> | null = null;
  if (runNow && !p.quiet && (await store.claimForRun(id, now))) first = await runOne(id);

  const m = await store.getMoonlet(id);
  return NextResponse.json({ moonlet: m && publicMoonlet(m), plan: p, firstRun: first }, { status: 201 });
}

export function publicMoonlet(m: store.MoonletRow) {
  return {
    id: m.id,
    owner: m.owner,
    name: m.name,
    spec: m.spec,
    status: m.status,
    delivery: m.delivery,
    cadence: m.cadence,
    perRunCapUsd: m.perRunCapUsd,
    earnPerDayUsd: m.earnPerDayUsd,
    burnPerDayUsd: m.burnPerDayUsd,
    keyLimitUsd: m.key?.limitUsd ?? 0,
    keySpentUsd: m.key?.spentUsd ?? 0,
    keyRemainingUsd: m.key ? Math.max(0, m.key.limitUsd - m.key.spentUsd) : 0,
    nextRunAt: m.nextRunAt,
    lastRunAt: m.lastRunAt,
    createdAt: m.createdAt,
    keysRotated: m.keysRotated,
    runsTotal: m.runsTotal,
    runsFailed: m.runsFailed,
    spentTotalUsd: m.spentTotalUsd,
  };
}
