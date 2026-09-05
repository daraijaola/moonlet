import { createHmac, randomBytes } from "node:crypto";
import * as store from "../store";

/**
 * X (Twitter), through the holder's OWN developer app.
 *
 * X's API is pay-per-use (no free tier since Feb 2026) and bills the developer
 * account, so each holder creates a free app on developer.x.com, adds a card
 * there, and pastes the four keys from "Keys and tokens" here: API Key, API
 * Key Secret, Access Token, Access Token Secret (the last two must be
 * generated with Read and Write permissions). We sign requests with OAuth 1.0a
 * user context, verify the keys live on connect, and post through POST
 * /2/tweets. No redirect, nothing for the platform to configure.
 */

export type XKeys = { apiKey: string; apiSecret: string; accessToken: string; accessSecret: string };
export type XConn = XKeys & { username: string; userId: string };

const API = "https://api.x.com/2";

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** OAuth 1.0a Authorization header (HMAC-SHA1). `nonce`/`timestamp` are injectable for tests. */
export function oauthHeader(
  keys: XKeys,
  method: "GET" | "POST",
  url: string,
  query: Record<string, string> = {},
  fixed?: { nonce: string; timestamp: string },
) {
  const oauth: Record<string, string> = {
    oauth_consumer_key: keys.apiKey,
    oauth_nonce: fixed?.nonce ?? randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: fixed?.timestamp ?? String(Math.floor(Date.now() / 1000)),
    oauth_token: keys.accessToken,
    oauth_version: "1.0",
  };
  const all = { ...query, ...oauth };
  const params = Object.keys(all)
    .sort()
    .map((k) => `${enc(k)}=${enc(all[k])}`)
    .join("&");
  const base = `${method}&${enc(url)}&${enc(params)}`;
  const key = `${enc(keys.apiSecret)}&${enc(keys.accessSecret)}`;
  oauth.oauth_signature = createHmac("sha1", key).update(base).digest("base64");
  return (
    "OAuth " +
    Object.keys(oauth)
      .sort()
      .map((k) => `${enc(k)}="${enc(oauth[k])}"`)
      .join(", ")
  );
}

function looksLikeKeys(k: Partial<XKeys>): k is XKeys {
  return [k.apiKey, k.apiSecret, k.accessToken, k.accessSecret].every((v) => typeof v === "string" && v.trim().length >= 10);
}

async function xError(res: Response) {
  const j = (await res.json().catch(() => ({}))) as { detail?: string; title?: string; errors?: Array<{ message?: string }>; reason?: string };
  const msg = j.detail ?? j.errors?.[0]?.message ?? j.title ?? `HTTP ${res.status}`;
  if (res.status === 401) return "X rejected the keys (401). Check all four values, and that the Access Token was generated after setting Read and Write.";
  if (res.status === 402 || /credit|billing|payment/i.test(msg)) return "X says the developer account has no credits. Add a card and buy credits on developer.x.com, then try again.";
  if (res.status === 403) return `X refused (403): ${msg}. Usually the app's permissions are Read-only, or the Access Token predates the permission change. Regenerate it.`;
  if (res.status === 429) return "X rate limit hit. Wait a few minutes and try again.";
  return `X error: ${msg}`;
}

/** Verify the four keys against GET /2/users/me and store them. Costs one User read on the holder's X account. */
export async function connectWithKeys(owner: string, input: Partial<XKeys>, fetchImpl: typeof fetch = fetch) {
  const keys: Partial<XKeys> = { apiKey: input.apiKey?.trim(), apiSecret: input.apiSecret?.trim(), accessToken: input.accessToken?.trim(), accessSecret: input.accessSecret?.trim() };
  if (!looksLikeKeys(keys)) throw new Error("All four keys are needed: API Key, API Key Secret, Access Token, Access Token Secret.");
  const url = `${API}/users/me`;
  const res = await fetchImpl(url, { headers: { authorization: oauthHeader(keys, "GET", url) }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(await xError(res));
  const u = ((await res.json()) as { data?: { id: string; username: string } }).data;
  if (!u) throw new Error("X: couldn't read the account behind these keys.");
  const conn: XConn = { ...keys, username: u.username, userId: u.id };
  await store.setConnection(owner, "x", `@${u.username}`, conn);
  return { username: u.username };
}

export async function postTweet(owner: string, text: string, fetchImpl: typeof fetch = fetch) {
  const conn = await store.getConnection<XConn>(owner, "x");
  if (!conn) throw new Error("X not connected");
  const url = `${API}/tweets`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { authorization: oauthHeader(conn.data, "POST", url), "content-type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, 280) }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`X post failed: ${await xError(res)}`);
  const j = (await res.json()) as { data?: { id: string } };
  if (!j.data) throw new Error("X post failed: no id returned");
  return { id: j.data.id, url: `https://x.com/${conn.data.username}/status/${j.data.id}` };
}
