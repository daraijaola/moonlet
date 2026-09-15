import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import { apiKeyFromSignature, signatureBelongsTo } from "@/moonlet/orbio";
import * as store from "@/moonlet/store";

/**
 * The wallet signed Orbio's key message; that signature is the gateway credential. It is accepted only if it recovers to
 * the signed-in wallet for the epoch claimed, then sealed at rest. Signing with a higher epoch rotates the key.
 */
export async function POST(req: Request) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  const { signature, epoch = 0 } = (await req.json().catch(() => ({}))) as { signature?: string; epoch?: number };
  if (!signature || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return bad("signature missing or malformed");
  if (!Number.isInteger(epoch) || epoch < 0 || epoch > 1_000_000) return bad("bad epoch");
  const current = await store.getOwner(owner);
  if (current?.orbioKey && epoch < current.orbioEpoch) return bad(`epoch ${epoch} is older than the current key (epoch ${current.orbioEpoch})`, 409);
  if (!(await signatureBelongsTo(owner, signature as `0x${string}`, epoch))) return bad("that signature was not made by this wallet for this epoch", 403);
  await store.setOwnerOrbioKey(owner, apiKeyFromSignature(signature as `0x${string}`, epoch), epoch);
  return NextResponse.json({ ok: true, epoch });
}
