import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import { ownerLabel } from "@/moonlet/orbio-oauth";
import * as store from "@/moonlet/store";

export const dynamic = "force-dynamic";

/** Who the session cookie belongs to: the account id, its kind and how to show it. */
export async function GET(req: Request) {
  const owner = ownerFrom(req);
  if (!owner) return bad("not signed in", 401);
  const o = await store.getOwner(owner);
  return NextResponse.json({ owner, kind: o?.authKind ?? "wallet", label: ownerLabel(owner, o), email: o?.email ?? null, orbio: !!o?.orbioOAuth });
}
