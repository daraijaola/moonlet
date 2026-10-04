import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, ownerFrom } from "@/moonlet/http";
import { submit } from "@/moonlet/hunt";

const Body = z.object({ runId: z.string().min(4).max(64) });

/** Enter one of your anchored runs. Whether the answer is right stays hidden until the deadline. */
export async function POST(req: Request) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return bad("runId required");
  const r = await submit(owner, body.data.runId);
  if (!r.ok) return bad(r.error, 422);
  return NextResponse.json({ ok: true, block: r.submission.block, txHash: r.submission.txHash });
}
