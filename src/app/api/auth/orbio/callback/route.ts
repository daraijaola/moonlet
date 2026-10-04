import { NextResponse } from "next/server";
import { completeLogin, oauthConfig, takeLogin } from "@/moonlet/orbio-oauth";
import { publicOrigin } from "@/moonlet/http";
import { sealSession, sessionCookie } from "@/moonlet/session";

/**
 * Orbio sends the person back here with a code. Swap it (PKCE + client secret), read who they are, create or join the
 * account, set the session cookie, and hand over to /sign-in/orbio, which stores the account in the page and moves on.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const origin = publicOrigin(req).origin;
  const fail = (why: string) => NextResponse.redirect(`${origin}/sign-in?orbio_error=${encodeURIComponent(why)}`);
  const c = oauthConfig();
  if (!c) return fail("Sign in with Orbio isn't configured");
  if (u.searchParams.get("error")) return fail(u.searchParams.get("error") === "access_denied" ? "You cancelled on Orbio." : (u.searchParams.get("error_description") ?? "Orbio refused the sign-in."));
  const state = u.searchParams.get("state") ?? "", code = u.searchParams.get("code") ?? "";
  const login = await takeLogin(state);
  if (!login || !code) return fail("That sign-in link expired. Try again.");
  try {
    const { owner } = await completeLogin(c, code, login.verifier);
    const res = NextResponse.redirect(`${origin}/sign-in/orbio?next=${encodeURIComponent(login.next)}`);
    res.headers.set("set-cookie", sessionCookie(sealSession(owner)));
    return res;
  } catch (e) {
    console.error("orbio sign-in:", (e as Error).message);
    return fail("Couldn't finish signing in with Orbio. Try again.");
  }
}
