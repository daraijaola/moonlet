import { NextResponse } from "next/server";
import { getSkyStats } from "@/lib/mock";

/** MOCK: served from lib/mock until moonlets run for real. Shape is final. */
export async function GET() {
  return NextResponse.json({ ...getSkyStats(), mock: true, at: new Date().toISOString() });
}
