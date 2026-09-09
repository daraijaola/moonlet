import { NextResponse } from "next/server";
import { ownerFrom, publicOrigin } from "@/moonlet/http";
import { finishOAuth } from "@/moonlet/connections/github";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const base = publicOrigin(req).origin;
  const code = u.searchParams.get("code"), state = u.searchParams.get("state");
  if (!code || !state) return NextResponse.redirect(`${base}/app/connections?github=denied`);
  try {
    const r = await finishOAuth(code, state, ownerFrom(req));
    return NextResponse.redirect(`${base}${r.redirectTo}?github=ok`);
  } catch (e) {
    console.error("github oauth", (e as Error).message);
    return NextResponse.redirect(`${base}/app/connections?github=failed`);
  }
}
