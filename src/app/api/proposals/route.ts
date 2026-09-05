import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import * as store from "@/moonlet/store";
import { describe } from "@/moonlet/proposals";

export async function GET(req: Request) {
  const owner = ownerFrom(req);
  if (!owner) return bad("sign with your wallet or approve Orbio to unlock this", 401);
  const status = new URL(req.url).searchParams.get("status") as store.ProposalStatus | null;
  const rows = await store.listProposals(owner, status ?? undefined);
  return NextResponse.json({ proposals: rows.map((p) => ({ ...p, ...describe(p.kind, p.payload) })) });
}
