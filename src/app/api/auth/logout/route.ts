import { NextResponse } from "next/server";
import { sessionCookie } from "@/moonlet/session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("set-cookie", sessionCookie(null));
  return res;
}
