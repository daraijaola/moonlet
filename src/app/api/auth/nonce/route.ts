import { NextResponse } from "next/server";
import { newNonce, siweMessage } from "@/moonlet/session";
import { bad, publicOrigin } from "@/moonlet/http";

const nonces = new Map<string, number>();

export async function POST(req: Request) {
  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return bad("address required");
  const nonce = newNonce();
  nonces.set(nonce, Date.now() + 10 * 60_000);
  for (const [n, exp] of nonces) if (exp < Date.now()) nonces.delete(n);
  const u = publicOrigin(req);
  const message = siweMessage({ domain: u.host, uri: u.origin, address, nonce, issuedAt: new Date().toISOString() });
  return NextResponse.json({ nonce, message });
}

export function takeNonce(n: string) {
  const ok = (nonces.get(n) ?? 0) > Date.now();
  nonces.delete(n);
  return ok;
}
