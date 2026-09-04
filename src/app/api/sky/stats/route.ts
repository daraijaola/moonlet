import { NextResponse } from "next/server";
import * as store from "@/moonlet/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ...(await store.skyStats()), at: new Date().toISOString() });
}
