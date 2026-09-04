import { NextResponse } from "next/server";
import { ORBIO } from "@/moonlet/orbio";
import { publicOrigin } from "@/moonlet/http";
import * as store from "@/moonlet/store";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const err = u.searchParams.get("error");
  const appUrl = publicOrigin(req).origin;
  if (err) return NextResponse.redirect(`${appUrl}/sign-in?orbio=denied`);
  if (!code || !state) return NextResponse.redirect(`${appUrl}/sign-in?orbio=invalid`);

  const saved = await store.takeOauthState(state);
  if (!saved) return NextResponse.redirect(`${appUrl}/sign-in?orbio=expired`);
  const redirectUri = saved.redirectUri || `${appUrl}/api/orbio/callback`;
  const back = saved.redirectUri ? new URL(saved.redirectUri).origin : appUrl;

  const res = await fetch(ORBIO.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: saved.clientId,
      code_verifier: saved.verifier,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("orbio token exchange failed", res.status, detail.slice(0, 300));
    return NextResponse.redirect(`${back}/sign-in?orbio=token_failed`);
  }
  const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  await store.setOwnerOrbio(saved.address, {
    clientId: saved.clientId,
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined,
  });
  const to = saved.redirectTo.startsWith("/") ? saved.redirectTo : "/app";
  return NextResponse.redirect(`${back}${to}${to.includes("?") ? "&" : "?"}orbio=ok`);
}
