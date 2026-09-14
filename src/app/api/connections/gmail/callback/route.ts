import { NextResponse } from "next/server";
import { ownerFrom, publicOrigin } from "@/moonlet/http";
import { finishOAuth } from "@/moonlet/connections/gmail";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const base = publicOrigin(req).origin;
  const code = u.searchParams.get("code"), state = u.searchParams.get("state");
  if (!code || !state) return NextResponse.redirect(`${base}/app/connections?gmail=denied`);
  try {
    const r = await finishOAuth(code, state, ownerFrom(req));
    return NextResponse.redirect(`${base}${r.redirectTo}?gmail=ok`);
  } catch (e) {
    console.error("gmail oauth", (e as Error).message);
    return NextResponse.redirect(`${base}/app/connections?gmail=failed&reason=${encodeURIComponent((e as Error).message.slice(0, 160))}`);
  }
}
