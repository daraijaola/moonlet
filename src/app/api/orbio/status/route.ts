import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import { sessionFrom } from "@/moonlet/session";
import { bagOf, orbioFor } from "@/moonlet/scheduler";
import { estimateEarnPerDay } from "@/moonlet/budget";

/** Is this owner approved on Orbio, and what does their bag look like? */
export async function GET(req: Request) {
  const owner = ownerFrom(req);
  if (!owner) return bad("sign in with your wallet first", 401);
  const [orbio, bag] = await Promise.all([orbioFor(owner), bagOf(owner)]);
  let balanceUsd: number | null = null;
  if (orbio) {
    try {
      balanceUsd = (await orbio.getBalance()).availableUsd;
    } catch {
      balanceUsd = null;
    }
  }
  const canWrite = !!sessionFrom(req) || process.env.ALLOW_HEADER_AUTH === "1" || process.env.NODE_ENV !== "production";
  return NextResponse.json({ approved: !!orbio, bag, earnPerDayUsd: estimateEarnPerDay(bag), idleCreditsUsd: balanceUsd, canWrite });
}
