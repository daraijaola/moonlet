import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import { bagOf, orbioFor } from "@/moonlet/scheduler";
import { estimateEarnPerDay } from "@/moonlet/budget";

/** Is this owner approved on Orbio, and what does their bag look like? */
export async function GET(req: Request) {
  const owner = ownerFrom(req);
  if (!owner) return bad("x-owner required", 401);
  const [orbio, bag] = await Promise.all([orbioFor(owner), bagOf(owner)]);
  let balanceUsd: number | null = null;
  if (orbio) {
    try {
      balanceUsd = (await orbio.getBalance()).availableUsd;
    } catch {
      balanceUsd = null;
    }
  }
  return NextResponse.json({ approved: !!orbio, bag, earnPerDayUsd: estimateEarnPerDay(bag), idleCreditsUsd: balanceUsd });
}
