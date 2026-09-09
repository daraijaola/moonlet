import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import { renewedCookie, sessionFrom } from "@/moonlet/session";
import { bagOf, orbioFor } from "@/moonlet/scheduler";
import { estimateEarnPerDay } from "@/moonlet/budget";
import * as store from "@/moonlet/store";

/** Is this owner approved on Orbio, and what does their bag look like? */
export async function GET(req: Request) {
  const owner = ownerFrom(req);
  if (!owner) return bad("sign in with your wallet first", 401);
  const [orbio, bag] = await Promise.all([orbioFor(owner), bagOf(owner)]);
  let balanceUsd: number | null = null;
  let legacyUsd: number | null = null;
  let tools: string[] = [];
  let orbioError: string | null = null;
  if (orbio) {
    try {
      const [bal, ks] = await Promise.all([orbio.getBalance(), orbio.getKeyStatus()]);
      balanceUsd = bal.availableUsd;
      legacyUsd = ks.legacy?.active ? ks.legacy.remainingUsd : null;
      tools = orbio.listTools ? (await orbio.listTools()).map((t) => t.name) : [];
    } catch (e) {
      orbioError = (e as Error).message;
    }
  }
  const canWrite = !!sessionFrom(req) || process.env.ALLOW_HEADER_AUTH === "1" || process.env.NODE_ENV !== "production";
  const [o, avatar] = await Promise.all([store.getOwner(owner), store.avatarOf(owner)]);
  const res = NextResponse.json({
    approved: !!orbio,
    avatar,
    bag,
    earnPerDayUsd: estimateEarnPerDay(bag),
    idleCreditsUsd: balanceUsd,
    legacyKeyUsd: legacyUsd,
    canWrite,
    orbio: { tools, error: orbioError, expiresAt: o?.orbioExpiresAt ?? null, dev: process.env.ALLOW_DEV_ORBIO === "1" },
  });
  const renewed = renewedCookie(req);
  if (renewed) res.headers.set("set-cookie", renewed);
  return res;
}

/** Disconnect Orbio for this owner (they can re-approve from sign-in). */
export async function DELETE(req: Request) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  await store.clearOwnerOrbio(owner);
  return NextResponse.json({ ok: true });
}
