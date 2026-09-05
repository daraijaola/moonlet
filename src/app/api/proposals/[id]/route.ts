import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import * as store from "@/moonlet/store";
import { decide } from "@/moonlet/proposals";

/** Approve or reject from the dashboard. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign with your wallet or approve Orbio to unlock this", 401);
  const { id } = await params;
  const p = await store.getProposal(id);
  if (!p || p.owner !== owner) return bad("not found", 404);
  const { action } = (await req.json().catch(() => ({}))) as { action?: "approve" | "reject" };
  if (action !== "approve" && action !== "reject") return bad("action must be approve or reject");
  const r = await decide(id, action);
  if (!r.ok) return bad(r.error, 409);
  return NextResponse.json(r);
}
