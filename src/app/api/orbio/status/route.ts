import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import { sessionFrom } from "@/moonlet/session";
import { bagOf, orbioFor } from "@/moonlet/scheduler";
import { estimateEarnPerDay } from "@/moonlet/budget";
import * as store from "@/moonlet/store";

/** Is this owner approved on Orbio, and what does their bag look like? */
export async function GET(req: Request) {
  const owner = ownerFrom(req);
  if (!owner) return bad("sign with your wallet or approve Orbio to unlock this", 401);
  const [orbio, bag] = await Promise.all([orbioFor(owner), bagOf(owner)]);
  let balanceUsd: number | null = null;
  let tools: string[] = [];
  let orbioError: string | null = null;
  if (orbio) {
    try {
      balanceUsd = (await orbio.getBalance()).availableUsd;
      tools = orbio.listTools ? (await orbio.listTools()).map((t) => t.name) : [];
    } catch (e) {
      orbioError = (e as Error).message;
    }
  }
  const canWrite = !!sessionFrom(req) || process.env.ALLOW_HEADER_AUTH === "1" || process.env.NODE_ENV !== "production";
  const o = await store.getOwner(owner);
  return NextResponse.json({
    approved: !!orbio,
    bag,
    earnPerDayUsd: estimateEarnPerDay(bag),
    idleCreditsUsd: balanceUsd,
    canWrite,
    orbio: { tools, error: orbioError, expiresAt: o?.orbioExpiresAt ?? null, dev: process.env.ALLOW_DEV_ORBIO === "1" },
  });
}

/** Disconnect Orbio for this owner (they can re-approve from sign-in). */
export async function DELETE(req: Request) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign with your wallet or approve Orbio to unlock this", 401);
  await store.clearOwnerOrbio(owner);
  return NextResponse.json({ ok: true });
}
