import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { verifyMessage } from "viem";

/**
 * Sessions. A wallet signs a SIWE-style message containing a server nonce;
 * we verify the signature and issue an HMAC-signed cookie bound to the address.
 * Pasted addresses never get a session: they can view, not act.
 */

const COOKIE = "moonlet_session";
const TTL_MS = 7 * 24 * 3600_000;

function secret() {
  return process.env.SECRET_KEY ?? "moonlet-dev-only-not-secret";
}

export function newNonce() {
  return randomBytes(16).toString("base64url");
}

export function siweMessage(p: { domain: string; address: string; nonce: string; issuedAt: string; uri: string }) {
  return [
    `${p.domain} wants you to sign in with your Ethereum account:`,
    p.address,
    "",
    "Let Moonlet run agents funded by this wallet's Orbio credits. This signature does not move tokens.",
    "",
    `URI: ${p.uri}`,
    "Version: 1",
    "Chain ID: 4663",
    `Nonce: ${p.nonce}`,
    `Issued At: ${p.issuedAt}`,
  ].join("\n");
}

export async function verifySiwe(p: { message: string; signature: `0x${string}`; address: `0x${string}`; expectedNonce: string }) {
  if (!p.message.includes(`Nonce: ${p.expectedNonce}`)) return false;
  if (!p.message.includes(`\n${p.address}\n`) && !p.message.toLowerCase().includes(`\n${p.address.toLowerCase()}\n`)) return false;
  const issued = p.message.match(/Issued At: (.+)/)?.[1];
  if (!issued || Math.abs(Date.now() - +new Date(issued)) > 10 * 60_000) return false;
  return verifyMessage({ address: p.address, message: p.message, signature: p.signature });
}

export function sealSession(address: string) {
  const exp = Date.now() + TTL_MS;
  const body = `${address.toLowerCase()}.${exp}`;
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function openSession(token: string | undefined | null): string | null {
  if (!token) return null;
  const [address, exp, mac] = token.split(".");
  if (!address || !exp || !mac) return null;
  const expect = createHmac("sha256", secret()).update(`${address}.${exp}`).digest("base64url");
  if (expect.length !== mac.length || !timingSafeEqual(Buffer.from(expect), Buffer.from(mac))) return null;
  if (Number(exp) < Date.now()) return null;
  return address;
}

export function sessionCookie(token: string | null) {
  const base = `${COOKIE}=${token ?? ""}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
  return token ? `${base}; Max-Age=${TTL_MS / 1000}` : `${base}; Max-Age=0`;
}

export function sessionFrom(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return openSession(m?.[1]);
}
