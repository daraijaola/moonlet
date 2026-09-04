import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, ownerFrom } from "@/moonlet/http";
import * as store from "@/moonlet/store";
import { verifyToken } from "@/moonlet/connections/github";

/** Save a fine-grained PAT after verifying it. Stored sealed; never returned. */
export async function POST(req: Request) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign with your wallet or approve Orbio to unlock this", 401);
  const body = z.object({ token: z.string().min(20).max(400) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return bad("token required");
  try {
    const conn = await verifyToken(body.data.token.trim());
    await store.setConnection(owner, "github", `@${conn.login}`, conn);
    return NextResponse.json({ ok: true, login: conn.login });
  } catch (e) {
    return bad(`GitHub rejected that token: ${(e as Error).message}`, 400);
  }
}
