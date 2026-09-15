import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import { settleActivation } from "@/moonlet/proposals";

/**
 * The wallet sent CREDIT.activate(); the browser posts the hash. The receipt is read from the chain and only activations
 * whose beneficiary is the signed-in wallet fund its ledger, once per activation. A pending transaction returns 202.
 */
export async function POST(req: Request) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  const { txHash, proposalId = null } = (await req.json().catch(() => ({}))) as { txHash?: string; proposalId?: string | null };
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return bad("txHash missing or malformed");
  try {
    const r = await settleActivation(owner, txHash, proposalId);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 202 });
    return NextResponse.json(r);
  } catch (e) {
    return bad((e as Error).message, 400);
  }
}
