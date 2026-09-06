import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { newNonce, openSession, sealSession, siweMessage, verifySiwe } from "@/moonlet/session";

describe("siwe sessions", () => {
  const acct = privateKeyToAccount(`0x${"11".repeat(32)}`);

  it("accepts a correctly signed message and rejects tampering", async () => {
    const nonce = newNonce();
    const message = siweMessage({ domain: "moonlet.sky", uri: "https://moonlet.sky", address: acct.address, nonce, issuedAt: new Date().toISOString() });
    const signature = await acct.signMessage({ message });
    expect(await verifySiwe({ message, signature, address: acct.address, expectedNonce: nonce })).toBe(true);
    expect(await verifySiwe({ message, signature, address: acct.address, expectedNonce: "other" })).toBe(false);
    const other = privateKeyToAccount(`0x${"22".repeat(32)}`);
    expect(await verifySiwe({ message, signature, address: other.address, expectedNonce: nonce })).toBe(false);
    const stale = siweMessage({ domain: "moonlet.sky", uri: "https://moonlet.sky", address: acct.address, nonce, issuedAt: new Date(Date.now() - 3600_000).toISOString() });
    expect(await verifySiwe({ message: stale, signature: await acct.signMessage({ message: stale }), address: acct.address, expectedNonce: nonce })).toBe(false);
  });

  it("session tokens round-trip and reject forgery", () => {
    const t = sealSession(acct.address);
    expect(openSession(t)).toBe(acct.address.toLowerCase());
    const [a, exp, mac] = t.split(".");
    expect(openSession(`${"0x" + "ff".repeat(20)}.${exp}.${mac}`)).toBeNull();
    expect(openSession(`${a}.${Number(exp) + 99999}.${mac}`)).toBeNull();
    expect(openSession("garbage")).toBeNull();
  });
});

describe("session renewal", () => {
  it("lasts 30 days and slides forward once a third is used; fresh sessions are left alone", async () => {
    const { renewedCookie, sealSession, sessionExpiry } = await import("@/moonlet/session");
    const addr = "0x00000000000000000000000000000000000000ab";
    const fresh = sealSession(addr);
    const exp = sessionExpiry(fresh)!;
    expect(exp - Date.now()).toBeGreaterThan(29 * 24 * 3600_000);
    expect(renewedCookie(new Request("http://x", { headers: { cookie: `moonlet_session=${fresh}` } }))).toBeNull();
    // forge an older-but-valid token: same address, expiry 12 days out (18 used of 30)
    const [a] = fresh.split(".");
    const oldExp = Date.now() + 12 * 24 * 3600_000;
    const { createHmac } = await import("node:crypto");
    const mac = createHmac("sha256", process.env.SECRET_KEY ?? "moonlet-dev-only-not-secret").update(`${a}.${oldExp}`).digest("base64url");
    const aged = `${a}.${oldExp}.${mac}`;
    const renewed = renewedCookie(new Request("http://x", { headers: { cookie: `moonlet_session=${aged}` } }));
    expect(renewed).toMatch(/^moonlet_session=0x/);
    expect(renewed).toMatch(/Max-Age=2592000/);
    expect(sessionExpiry(renewed!.split("=")[1].split(";")[0])! - Date.now()).toBeGreaterThan(29 * 24 * 3600_000);
  });
});
