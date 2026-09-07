import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, ownerFrom } from "@/moonlet/http";
import { launchMoonlet } from "@/moonlet/launch";
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
  autopilot: z.boolean().default(false),
  runNow: z.boolean().default(true),
});

/** Launch. Plans against the live bag, stores, and (by default) fires the first run immediately. */
export async function POST(req: Request) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  const body = Launch.safeParse(await req.json().catch(() => null));
  if (!body.success) return bad(body.error.message);
  const { spec, delivery, autopilot, runNow } = body.data;

  const r = await launchMoonlet(owner, spec, { autopilot, runNow, delivery });
  if (!r.ok) return bad(r.error);
  return NextResponse.json({ moonlet: publicMoonlet(r.moonlet), plan: r.plan, firstRunStarted: r.firstRunStarted, familyNote: r.familyNote }, { status: 201 });
}

export function publicMoonlet(m: store.MoonletRow) {
  return {
    id: m.id,
    owner: m.owner,
    name: m.name,
    spec: m.spec,
    status: m.status,
    delivery: m.delivery,
    autopilot: m.autopilot,
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
    parentId: m.parentId,
    keysRotated: m.keysRotated,
    runsTotal: m.runsTotal,
    runsFailed: m.runsFailed,
    spentTotalUsd: m.spentTotalUsd,
    openCalls: m.openCalls,
    hits: m.hits,
    misses: m.misses,
  };
}
