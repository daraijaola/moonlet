import { NextResponse } from "next/server";
import { bad, ownerFrom, publicOrigin } from "@/moonlet/http";
import { beginOAuth, xConfigured } from "@/moonlet/connections/x";

export async function POST(req: Request) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign with your wallet or approve Orbio to unlock this", 401);
  if (!xConfigured()) return bad("X isn't configured on this deployment", 503);
  const { origin, redirectTo = "/app/connections" } = (await req.json().catch(() => ({}))) as { origin?: string; redirectTo?: string };
  const base = process.env.APP_URL ? publicOrigin(req).origin : (origin && origin.startsWith("https://") ? new URL(origin).origin : publicOrigin(req).origin);
  const url = await beginOAuth(owner, `${base}/api/connections/x/callback`, redirectTo);
  return NextResponse.json({ url });
}
