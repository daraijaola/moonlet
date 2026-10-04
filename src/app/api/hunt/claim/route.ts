import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import { claimGrant } from "@/moonlet/hunt-grants";

/** Claim one of the hunt's CREDIT grants: activated straight into your Moonlet AI balance by the treasury. */
export async function POST(req: Request) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  const r = await claimGrant(owner);
  if (!r.ok) return bad(r.error, 422);
  return NextResponse.json(r);
}
