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
