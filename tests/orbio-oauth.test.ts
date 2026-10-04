import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import * as store from "@/moonlet/store";
import { baseUrlFor, ORBIO_GATEWAY } from "@/moonlet/llm";
import { beginLogin, completeLogin, ownerIdFor, ownerLabel, refreshDueTokens, refreshIfDue, safeNext, takeLogin, type OAuthConfig } from "@/moonlet/orbio-oauth";

/**
 * Sign in with Orbio against a fake Orbio: a login lands on the right account (the wallet when there is one, a plainly
 * non-wallet id otherwise), tokens bill Orbio's gateway, and refreshes rotate the single-use refresh token without ever
 * keeping a stale one: a racing refresh can't clobber a newer pair, and a revoked refresh disconnects cleanly.
 */

const c: OAuthConfig = { clientId: "orbio_client", clientSecret: "orbio_secret", redirectUri: "https://moonlet.test/api/auth/orbio/callback" };
let n = 0;
let profile: Record<string, unknown> = {};
let refuseRefresh = false;
const seenRefresh: string[] = [];
const orbio: typeof fetch = async (u, init) => {
  const url = String(u);
  if (url.endsWith("/api/oauth/userinfo")) return new Response(JSON.stringify(profile));
  if (url.endsWith("/api/oauth/token")) {
    const body = new URLSearchParams(String(init?.body));
    expect((init?.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("orbio_client:orbio_secret").toString("base64")}`);
    if (body.get("grant_type") === "refresh_token") {
      seenRefresh.push(body.get("refresh_token")!);
      if (refuseRefresh) return new Response(JSON.stringify({ error: "invalid_grant", error_description: "refresh token already used" }), { status: 400 });
    }
    n++;
    return new Response(JSON.stringify({ access_token: `orbio_at_${n}`, refresh_token: `orbio_rt_${n}`, expires_in: 3600, token_type: "Bearer" }));
  }
  return new Response("{}", { status: 404 });
};

beforeAll(async () => {
  rmSync("/tmp/moonlet-oauth.db", { force: true });
  process.env.DATABASE_URL = "file:/tmp/moonlet-oauth.db";
  process.env.SECRET_KEY = "test";
  await store.migrate();
});

describe("Sign in with Orbio", () => {
  it("maps a wallet account to its address and an email account to an id that can't pass for a wallet; labels never invent an address", () => {
    const w = "0x" + "ab".repeat(20);
    expect(ownerIdFor({ sub: "u1", wallet: w })).toBe(w);
    const e = ownerIdFor({ sub: "u2", email: "ada@example.com" });
    expect(e).toMatch(/^orbio-[0-9a-f]{24}$/);
    expect(ownerIdFor({ sub: "u2" })).toBe(e);
    expect(ownerLabel(w)).toBe("0xabab…abab");
    expect(ownerLabel(e, { email: "ada@example.com" })).toBe("a…@example.com");
    expect(ownerLabel(e, { displayName: "@ada" })).toBe("@ada");
    expect(ownerLabel(e)).toMatch(/^orbio·[0-9a-f]{4}$/);
  });

  it("only sends people back to same-site paths, and a login state works once, within ten minutes", async () => {
    expect(safeNext("/app/threads")).toBe("/app/threads");
    expect(safeNext("https://evil.example")).toBe("/app");
    expect(safeNext("//evil.example")).toBe("/app");
    const url = new URL(await beginLogin(c, "/hunt"));
    expect(url.origin + url.pathname).toBe("https://www.orbio.so/oauth/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("inference");
    const state = url.searchParams.get("state")!;
    expect(await takeLogin(state)).toMatchObject({ next: "/hunt" });
    expect(await takeLogin(state)).toBeNull();
    expect(await takeLogin("obl_forgedforgedforged")).toBeNull();
  });

  it("a login stores the tokens as the account's gateway key, which bills Orbio", async () => {
    profile = { sub: "email-person", email: "ada@example.com", account_kind: "email", preferred_username: "ada" };
    const { owner } = await completeLogin(c, "code-1", "verifier", orbio);
    const o = await store.getOwner(owner);
    expect(o).toMatchObject({ authKind: "orbio", email: "ada@example.com", displayName: "@ada", orbioOAuth: true });
    expect(o?.orbioKey).toMatch(/^orbio_at_/);
    expect(baseUrlFor(o!.orbioKey!)).toBe(ORBIO_GATEWAY);
    // A wallet account signs in as its wallet: the same account a wallet login uses.
    profile = { sub: "wallet-person", wallet_address: "0x" + "CD".repeat(20), account_kind: "wallet" };
    const w = await completeLogin(c, "code-2", "verifier", orbio);
    expect(w.owner).toBe("0x" + "cd".repeat(20));
    expect((await store.getOwner(w.owner))?.authKind).toBe("wallet");
  });

  it("refreshes rotate the single-use refresh token; a racing refresh can't clobber the newer pair", async () => {
    profile = { sub: "refresher", email: "r@example.com" };
    const { owner } = await completeLogin(c, "code-3", "verifier", orbio);
    expect(await refreshIfDue(c, owner, { fetch: orbio })).toBe("fresh");
    // Force it due, refresh once: a new pair, and the old refresh token was the one spent.
    const before = await store.getOrbioOAuth(owner);
    await store.swapOrbioTokens(owner, before!.refresh, { ...before!, expiresAt: Date.now() + 60_000 });
    expect(await refreshIfDue(c, owner, { fetch: orbio })).toBe("refreshed");
    const after = await store.getOrbioOAuth(owner);
    expect(seenRefresh.at(-1)).toBe(before!.refresh);
    expect(after!.refresh).not.toBe(before!.refresh);
    expect((await store.getOwner(owner))?.orbioKey).toBe(after!.access);
    // Someone holding the stale refresh token can't overwrite the newer pair.
    expect(await store.swapOrbioTokens(owner, before!.refresh, { access: "orbio_at_stale", refresh: "orbio_rt_stale", expiresAt: 1 })).toBe(false);
    expect((await store.getOrbioOAuth(owner))?.access).toBe(after!.access);
  });

  it("the tick refreshes only tokens close to expiry; a refused refresh disconnects instead of retrying a dead token", async () => {
    profile = { sub: "soon", email: "s@example.com" };
    const { owner } = await completeLogin(c, "code-4", "verifier", orbio);
    const cur = await store.getOrbioOAuth(owner);
    await store.swapOrbioTokens(owner, cur!.refresh, { ...cur!, expiresAt: Date.now() + 5 * 60_000 });
    const ran = await refreshDueTokens({ config: c, fetch: orbio });
    expect(ran.find((r) => r.owner === owner)?.result).toBe("refreshed");
    const now = await store.getOrbioOAuth(owner);
    await store.swapOrbioTokens(owner, now!.refresh, { ...now!, expiresAt: Date.now() });
    refuseRefresh = true;
    expect(await refreshIfDue(c, owner, { fetch: orbio })).toBe("revoked");
    refuseRefresh = false;
    expect(await store.getOrbioOAuth(owner)).toBeNull();
    expect((await store.getOwner(owner))?.orbioKey).toBeNull();
  });
});
