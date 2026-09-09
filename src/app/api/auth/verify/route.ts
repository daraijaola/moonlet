import { NextResponse } from "next/server";
import { bad, publicOrigin } from "@/moonlet/http";
import { sealSession, sessionCookie, verifySiwe } from "@/moonlet/session";
import * as store from "@/moonlet/store";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { address?: string; message?: string; signature?: string; nonce?: string };
  if (!b.address || !b.message || !b.signature || !b.nonce) return bad("address, message, signature, nonce required");
  if (!/^0x[0-9a-fA-F]{40}$/.test(b.address)) return bad("bad address");
  // The wallet must have signed exactly the message this server minted for this nonce and address; nothing else parses.
  const minted = await store.takeNonce(b.nonce);
  if (!minted) return bad("nonce expired", 401);
  if (minted.address !== b.address.toLowerCase() || minted.message !== b.message) return bad("bad signature", 401);
  const u = publicOrigin(req);
  const ok = await verifySiwe({ message: b.message, signature: b.signature as `0x${string}`, address: b.address as `0x${string}`, expectedNonce: b.nonce, expectedDomain: u.host, expectedUri: u.origin }).catch(() => false);
  if (!ok) return bad("bad signature", 401);
  await store.upsertOwner(b.address);
  const res = NextResponse.json({ ok: true, address: b.address.toLowerCase() });
  res.headers.set("set-cookie", sessionCookie(sealSession(b.address)));
  return res;
}
