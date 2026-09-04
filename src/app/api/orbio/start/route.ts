import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { ORBIO } from "@/moonlet/orbio";
import { bad, ownerFrom, publicOrigin } from "@/moonlet/http";
import * as store from "@/moonlet/store";

/**
 * Begin the Orbio OAuth approval (PKCE). Registers a public client once per
 * deployment (dynamic client registration, verified live), then redirects the
 * owner to orbio.so/mcp/authorize.
 */
export async function POST(req: Request) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  const { redirectTo = "/app", origin } = (await req.json().catch(() => ({}))) as { redirectTo?: string; origin?: string };

  // APP_URL wins; otherwise trust the origin the browser actually sees (it must
  // be the one Orbio redirects back to), falling back to forwarded headers.
  const appUrl = process.env.APP_URL ? publicOrigin(req).origin : safeOrigin(origin) ?? publicOrigin(req).origin;
  const redirectUri = `${appUrl}/api/orbio/callback`;

  let clientId = process.env.ORBIO_CLIENT_ID ?? (await store.getOauthClient(redirectUri));
  if (!clientId) {
    const reg = await fetch(ORBIO.register, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Moonlet",
        client_uri: appUrl,
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        scope: ORBIO.scope,
      }),
    });
    if (!reg.ok) return bad(`Orbio client registration failed: ${reg.status}`, 502);
    clientId = ((await reg.json()) as { client_id: string }).client_id;
    await store.saveOauthClient(redirectUri, clientId);
  }

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  await store.saveOauthState({ state, address: owner, verifier, clientId, redirectTo, redirectUri });

  const url = new URL(ORBIO.authorize);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ORBIO.scope,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();
  return NextResponse.json({ url: url.toString() });
}

function safeOrigin(o?: string) {
  if (!o) return null;
  try {
    const u = new URL(o);
    if (u.protocol !== "https:" && !u.hostname.match(/^(localhost|127\.0\.0\.1)$/)) return null;
    return u.origin;
  } catch {
    return null;
  }
}
