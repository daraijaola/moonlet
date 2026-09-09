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
  // The run the question refers to must be one of this moonlet's; a foreign id is dropped, never looked up.
  const runId = body.data.runId && (await store.getRun(body.data.runId))?.moonletId === id ? body.data.runId : null;
  const reply = await followup({ moonletId: id, owner, text: body.data.text, runId, history: body.data.history });
  await store.saveAsk({ moonletId: id, owner, runId, q: body.data.text, a: reply }).catch((e) => console.error("saveAsk", (e as Error).message));
  return NextResponse.json({ reply });
}

/** The owner's past conversation with this moonlet, so the composer survives a reload. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = ownerFrom(req);
  if (!owner) return bad("sign in with your wallet first", 401);
  const { id } = await params;
  const m = await store.getMoonlet(id);
  if (!m || m.owner !== owner) return bad("not found", 404);
  return NextResponse.json({ asks: await store.listAsks(id) });
}
