import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { verifyMessage } from "viem";

/**
 * Sessions. A wallet signs a SIWE-style message containing a server nonce;
 * we verify the signature and issue an HMAC-signed cookie bound to the address.
 * Pasted addresses never get a session: they can view, not act.
 */

export const COOKIE = "moonlet_session";
const TTL_MS = 30 * 24 * 3600_000;

function secret() {
  const k = process.env.SECRET_KEY;
  if (k) return k;
  // A production process without its signing secret must not mint or accept sessions; a known fallback is for local development only.
  if (process.env.NODE_ENV === "production") throw new Error("SECRET_KEY is not set");
  return "moonlet-dev-only-not-secret";
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

/**
 * Strict SIWE check. The message is parsed line by line and every field must be what this server would have written: the
 * expected domain and URI (so a signature given to another site is useless here), version 1, our chain id, the exact nonce,
 * the exact address, and an Issued At within ten minutes on either side. Only then is the signature verified.
 */
export async function verifySiwe(p: { message: string; signature: `0x${string}`; address: `0x${string}`; expectedNonce: string; expectedDomain?: string; expectedUri?: string }) {
  const lines = p.message.split("\n");
  const domainLine = lines[0]?.match(/^(\S+) wants you to sign in with your Ethereum account:$/);
  if (!domainLine) return false;
  if (p.expectedDomain && domainLine[1] !== p.expectedDomain) return false;
  if (!/^0x[0-9a-fA-F]{40}$/.test(lines[1] ?? "") || lines[1].toLowerCase() !== p.address.toLowerCase()) return false;
  const field = (name: string) => {
    const hits = lines.filter((l) => l.startsWith(`${name}: `));
    return hits.length === 1 ? hits[0].slice(name.length + 2) : null;
  };
  const uri = field("URI"), version = field("Version"), chain = field("Chain ID"), nonce = field("Nonce"), issued = field("Issued At");
  if (!uri || !version || !chain || !nonce || !issued) return false;
  if (p.expectedUri && uri !== p.expectedUri) return false;
  if (version !== "1" || chain !== "4663") return false;
  if (nonce !== p.expectedNonce) return false;
  // The whole message must be exactly what this server writes for those fields: no extra lines, statements or reordering.
  if (p.message !== siweMessage({ domain: domainLine[1], uri, address: lines[1], nonce, issuedAt: issued })) return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(issued)) return false;
  const t = Date.parse(issued);
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > 10 * 60_000) return false;
  if (!/^0x[0-9a-fA-F]{130}$/.test(p.signature)) return false;
  return verifyMessage({ address: p.address, message: p.message, signature: p.signature });
}

export function sealSession(address: string) {
  const exp = Date.now() + TTL_MS;
  const body = `${address.toLowerCase()}.${exp}`;
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/** Expiry of a valid token, or null. Used to slide the cookie forward on active use. */
export function sessionExpiry(token: string | undefined | null): number | null {
  if (!token || !openSession(token)) return null;
  return Number(token.split(".")[1]);
}

/** Re-issue the cookie when the session has used up a third of its life. */
export function renewedCookie(req: Request): string | null {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  const exp = sessionExpiry(m?.[1]);
  if (!exp) return null;
  if (exp - Date.now() > (TTL_MS * 2) / 3) return null;
  return sessionCookie(sealSession(openSession(m![1])!));
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
