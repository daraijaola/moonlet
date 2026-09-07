import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, ownerFrom } from "@/moonlet/http";
import { followup } from "@/moonlet/followup";
import * as store from "@/moonlet/store";

const Body = z.object({ text: z.string().min(1).max(1000), runId: z.string().max(40).optional(), history: z.array(z.object({ q: z.string().max(1000), a: z.string().max(4000) })).max(8).optional() });

/** Owner asks a follow-up about one of this moonlet's reports. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  const { id } = await params;
  const m = await store.getMoonlet(id);
  if (!m || m.owner !== owner) return bad("not found", 404);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return bad("text required");
  const reply = await followup({ moonletId: id, owner, text: body.data.text, runId: body.data.runId ?? null, history: body.data.history });
  return NextResponse.json({ reply });
}
