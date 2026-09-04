import { NextResponse } from "next/server";
import { publicOrigin } from "@/moonlet/http";
import { finishOAuth } from "@/moonlet/connections/x";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const base = publicOrigin(req).origin;
  const code = u.searchParams.get("code"), state = u.searchParams.get("state");
  if (!code || !state) return NextResponse.redirect(`${base}/app/connections?x=denied`);
  try {
    const r = await finishOAuth(code, state);
    return NextResponse.redirect(`${base}${r.redirectTo}?x=ok`);
  } catch (e) {
    console.error("x oauth", (e as Error).message);
    return NextResponse.redirect(`${base}/app/connections?x=failed`);
  }
}
