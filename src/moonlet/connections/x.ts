import { createHash, randomBytes } from "node:crypto";
import * as store from "../store";

/**
 * X (Twitter), via OAuth 2.0 PKCE on the holder's own account. Needs an X
 * developer app: X_CLIENT_ID (+ X_CLIENT_SECRET for confidential apps).
 * Posting always goes through a proposal unless the moonlet is on autopilot.
 */

export type XConn = { accessToken: string; refreshToken?: string; expiresAt?: number; username: string; userId: string };

const AUTH = "https://twitter.com/i/oauth2/authorize";
const TOKEN = "https://api.twitter.com/2/oauth2/token";
const API = "https://api.twitter.com/2";
const SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"];

export function xConfigured() {
  return !!process.env.X_CLIENT_ID;
}

function basicAuth(): Record<string, string> {
  const id = process.env.X_CLIENT_ID, secret = process.env.X_CLIENT_SECRET;
  return secret ? { authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` } : {};
}

export async function beginOAuth(owner: string, redirectUri: string, redirectTo: string) {
  const clientId = process.env.X_CLIENT_ID;
  if (!clientId) throw new Error("X isn't configured (X_CLIENT_ID)");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = `x_${randomBytes(12).toString("base64url")}`;
  await store.saveOauthState({ state, address: owner, verifier, clientId, redirectTo, redirectUri });
  const u = new URL(AUTH);
  u.search = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope: SCOPES.join(" "), state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
  return u.toString();
}

export async function finishOAuth(code: string, state: string, fetchImpl: typeof fetch = fetch) {
  const saved = await store.takeOauthState(state);
  if (!saved) throw new Error("state expired");
  const res = await fetchImpl(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...basicAuth() },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: saved.redirectUri, client_id: saved.clientId, code_verifier: saved.verifier }),
  });
  if (!res.ok) throw new Error(`X token exchange failed: ${res.status}`);
  const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  const me = await fetchImpl(`${API}/users/me`, { headers: { authorization: `Bearer ${t.access_token}` } });
  const u = ((await me.json()) as { data?: { id: string; username: string } }).data;
  if (!u) throw new Error("X: couldn't read the account");
  const conn: XConn = { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined, username: u.username, userId: u.id };
  await store.setConnection(saved.address, "x", `@${u.username}`, conn);
  return { owner: saved.address, redirectTo: saved.redirectTo, username: u.username };
}

async function freshToken(owner: string, conn: XConn, fetchImpl: typeof fetch): Promise<string> {
  if (!conn.expiresAt || conn.expiresAt - Date.now() > 60_000 || !conn.refreshToken) return conn.accessToken;
  const res = await fetchImpl(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...basicAuth() },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refreshToken, client_id: process.env.X_CLIENT_ID ?? "" }),
  });
  if (!res.ok) throw new Error(`X refresh failed: ${res.status}`);
  const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  const next: XConn = { ...conn, accessToken: t.access_token, refreshToken: t.refresh_token ?? conn.refreshToken, expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined };
  await store.setConnection(owner, "x", `@${conn.username}`, next);
  return next.accessToken;
}

export async function postTweet(owner: string, text: string, fetchImpl: typeof fetch = fetch) {
  const conn = await store.getConnection<XConn>(owner, "x");
  if (!conn) throw new Error("X not connected");
  const token = await freshToken(owner, conn.data, fetchImpl);
  const res = await fetchImpl(`${API}/tweets`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 280) }) });
  const j = (await res.json()) as { data?: { id: string }; detail?: string; title?: string };
  if (!res.ok || !j.data) throw new Error(`X post failed: ${j.detail ?? j.title ?? res.status}`);
  return { id: j.data.id, url: `https://x.com/${conn.data.username}/status/${j.data.id}` };
}
