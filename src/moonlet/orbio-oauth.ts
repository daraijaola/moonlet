import { createHash, randomBytes } from "node:crypto";
import * as store from "./store";

/**
 * Sign in with Orbio (OAuth 2.1 + PKCE, OpenID Connect). A person signs in with email, Google or a wallet on Orbio's
 * consent screen; Moonlet gets an access token that works on Orbio's gateway exactly like an API key, so every run,
 * thread and plan bills their Orbio balance (topped up by card on orbio.so). No wallet, CREDIT, gas or signatures.
 *
 * Accounts: a person whose Orbio account has a wallet signs in as that wallet's address, the same account as a wallet
 * login. An email-only person gets an id that can never pass for a wallet ("orbio-…"), so nothing on chain is ever sent to it.
 *
 * Tokens: access tokens last an hour; refresh tokens are single use, and replaying one disconnects the person. So refreshes
 * happen in one place (the tick), one owner at a time, and a new pair is saved only if the stored refresh token is still
 * the one that was spent.
 */

export const ORBIO_OAUTH = {
  authorize: "https://www.orbio.so/oauth/authorize",
  token: "https://www.orbio.so/api/oauth/token",
  userinfo: "https://www.orbio.so/api/oauth/userinfo",
  revoke: "https://www.orbio.so/api/oauth/revoke",
  scope: "openid profile email wallet inference balance tools",
} as const;

export type OAuthConfig = { clientId: string; clientSecret: string; redirectUri: string };

export function oauthConfig(env: NodeJS.ProcessEnv = process.env): OAuthConfig | null {
  const clientId = env.ORBIO_CLIENT_ID?.trim(), clientSecret = env.ORBIO_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const app = (env.APP_URL ?? "https://moonlet.16labs.xyz").replace(/\/$/, "");
  return { clientId, clientSecret, redirectUri: `${app}/api/auth/orbio/callback` };
}

const b64url = (b: Buffer) => b.toString("base64url");

/** Only same-site paths survive as a post-login destination. */
export const safeNext = (next: string | null | undefined) => (next && /^\/(?!\/)[\w\-/?=&%#.]*$/.test(next) ? next : "/app");

const STATE_TTL_MS = 10 * 60_000;

/** Start a login: a single-use state and PKCE verifier kept server-side, and the URL to send the person to. */
export async function beginLogin(c: OAuthConfig, next: string) {
  const state = `obl_${b64url(randomBytes(18))}`;
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  await store.kvSet(`orbio_login.${state}`, JSON.stringify({ verifier, next: safeNext(next), at: Date.now() }));
  const u = new URL(ORBIO_OAUTH.authorize);
  u.search = new URLSearchParams({ response_type: "code", client_id: c.clientId, redirect_uri: c.redirectUri, scope: ORBIO_OAUTH.scope, state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
  return u.toString();
}

/** Redeem a state exactly once (deleted on first read), within ten minutes. */
export async function takeLogin(state: string): Promise<{ verifier: string; next: string } | null> {
  if (!/^obl_[\w-]{10,}$/.test(state)) return null;
  const k = `orbio_login.${state}`;
  const raw = await store.kvGet(k);
  if (!raw) return null;
  await store.kvDelete(k);
  const v = JSON.parse(raw) as { verifier: string; next: string; at: number };
  return Date.now() - v.at > STATE_TTL_MS ? null : { verifier: v.verifier, next: v.next };
}

export type Tokens = { access: string; refresh: string; expiresAt: number };

async function tokenRequest(c: OAuthConfig, body: Record<string, string>, fetchImpl: typeof fetch): Promise<Tokens> {
  const r = await fetchImpl(ORBIO_OAUTH.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}` },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !j.access_token || !j.refresh_token) throw new Error(j.error_description ?? j.error ?? `token endpoint ${r.status}`);
  return { access: j.access_token, refresh: j.refresh_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 };
}

export const exchangeCode = (c: OAuthConfig, code: string, verifier: string, fetchImpl: typeof fetch = fetch) =>
  tokenRequest(c, { grant_type: "authorization_code", code, redirect_uri: c.redirectUri, code_verifier: verifier }, fetchImpl);

export type OrbioProfile = { sub: string; accountKind?: string; email?: string; name?: string; handle?: string; picture?: string; wallet?: string };

export async function userinfo(access: string, fetchImpl: typeof fetch = fetch): Promise<OrbioProfile> {
  const r = await fetchImpl(ORBIO_OAUTH.userinfo, { headers: { authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`userinfo ${r.status}`);
  const j = (await r.json()) as Record<string, unknown>;
  const s = (k: string) => (typeof j[k] === "string" && j[k] ? (j[k] as string) : undefined);
  if (!s("sub")) throw new Error("userinfo without sub");
  const wallet = s("wallet_address");
  return { sub: s("sub")!, accountKind: s("account_kind"), email: s("email"), name: s("name"), handle: s("preferred_username"), picture: s("picture"), wallet: wallet && /^0x[0-9a-fA-F]{40}$/.test(wallet) ? wallet.toLowerCase() : undefined };
}

/** The Moonlet account for an Orbio person: their wallet when the account has one, else an id that is plainly not a wallet. */
export function ownerIdFor(p: OrbioProfile) {
  return p.wallet ?? `orbio-${createHash("sha256").update(`orbio:${p.sub}`).digest("hex").slice(0, 24)}`;
}

export const isWalletOwner = (owner: string) => /^0x[0-9a-f]{40}$/.test(owner);

/** What to show for an account: the wallet shortened, or the Orbio person's handle/name/email, never a made-up address. */
export function ownerLabel(owner: string, o?: { displayName?: string | null; email?: string | null } | null) {
  if (isWalletOwner(owner)) return `${owner.slice(0, 6)}…${owner.slice(-4)}`;
  return o?.displayName || (o?.email ? o.email.replace(/^(.).*(@.*)$/, "$1…$2") : `orbio·${owner.slice(-4)}`);
}

/** Finish a login: tokens in, profile read, account created or joined, tokens saved. Returns the account id. */
export async function completeLogin(c: OAuthConfig, code: string, verifier: string, fetchImpl: typeof fetch = fetch) {
  const t = await exchangeCode(c, code, verifier, fetchImpl);
  const p = await userinfo(t.access, fetchImpl);
  const owner = ownerIdFor(p);
  await store.setOrbioOAuth(owner, { sub: p.sub, email: p.email ?? null, displayName: p.handle ? `@${p.handle}` : p.name ?? null, kind: p.wallet ? "wallet" : "orbio" }, t);
  return { owner, profile: p };
}

/**
 * Refresh one owner's tokens if they expire within `within` ms. Single flight per owner through the stored refresh token:
 * the new pair is written only if the refresh token we spent is still the stored one (a compare-and-swap), so two
 * refreshes racing can't leave a dead token behind. A refusal means the person disconnected Moonlet; the tokens are cleared.
 */
export async function refreshIfDue(c: OAuthConfig, owner: string, opts: { within?: number; fetch?: typeof fetch } = {}) {
  const cur = await store.getOrbioOAuth(owner);
  if (!cur?.refresh) return "none" as const;
  if (cur.expiresAt - Date.now() > (opts.within ?? 15 * 60_000)) return "fresh" as const;
  try {
    const t = await tokenRequest(c, { grant_type: "refresh_token", refresh_token: cur.refresh }, opts.fetch ?? fetch);
    return (await store.swapOrbioTokens(owner, cur.refresh, t)) ? ("refreshed" as const) : ("raced" as const);
  } catch (e) {
    if (/invalid_grant|revoked|used|unknown/i.test((e as Error).message)) {
      await store.clearOrbioOAuth(owner, cur.refresh);
      return "revoked" as const;
    }
    console.error(`orbio refresh ${owner}:`, (e as Error).message);
    return "error" as const;
  }
}

/** The tick's keep-alive: every Orbio login whose token is close to expiring, refreshed one at a time. */
export async function refreshDueTokens(opts: { config?: OAuthConfig | null; fetch?: typeof fetch; within?: number } = {}) {
  const c = opts.config === undefined ? oauthConfig() : opts.config;
  if (!c) return [];
  const due = await store.ownersWithOrbioTokensBefore(Date.now() + (opts.within ?? 15 * 60_000));
  const out: Array<{ owner: string; result: string }> = [];
  for (const owner of due) out.push({ owner, result: await refreshIfDue(c, owner, opts) });
  return out;
}

/** Sign out of Moonlet on Orbio's side too: the refresh token is revoked and the tokens forgotten. */
export async function disconnect(c: OAuthConfig, owner: string, fetchImpl: typeof fetch = fetch) {
  const cur = await store.getOrbioOAuth(owner);
  if (cur?.refresh) {
    await fetchImpl(ORBIO_OAUTH.revoke, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}` }, body: new URLSearchParams({ token: cur.refresh }).toString() }).catch(() => undefined);
    await store.clearOrbioOAuth(owner, cur.refresh);
  }
}
