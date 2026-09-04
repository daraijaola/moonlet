import { NextResponse } from "next/server";
import { bad } from "@/moonlet/http";
import { sealSession, sessionCookie, verifySiwe } from "@/moonlet/session";
import * as store from "@/moonlet/store";
import { takeNonce } from "../nonce/route";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { address?: string; message?: string; signature?: string; nonce?: string };
  if (!b.address || !b.message || !b.signature || !b.nonce) return bad("address, message, signature, nonce required");
  if (!takeNonce(b.nonce)) return bad("nonce expired", 401);
  const ok = await verifySiwe({ message: b.message, signature: b.signature as `0x${string}`, address: b.address as `0x${string}`, expectedNonce: b.nonce }).catch(() => false);
  if (!ok) return bad("bad signature", 401);
  await store.upsertOwner(b.address);
  const res = NextResponse.json({ ok: true, address: b.address.toLowerCase() });
  res.headers.set("set-cookie", sessionCookie(sealSession(b.address)));
  return res;
}
