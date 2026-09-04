import { NextResponse } from "next/server";
import { bad, requireCron } from "@/moonlet/http";
import { anchorPending, tick } from "@/moonlet/scheduler";

export const maxDuration = 300;

/** Vercel cron hits this every minute; each tick runs whatever is due, then retries unanchored hashes. */
export async function GET(req: Request) {
  if (!requireCron(req)) return bad("unauthorized", 401);
  const results = await tick({}, 10);
  const anchored = await anchorPending({}, 20);
  return NextResponse.json({ ran: results.length, results, anchored });
}
