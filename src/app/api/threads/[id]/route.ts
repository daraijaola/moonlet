import { NextResponse } from "next/server";
import * as ts from "@/moonlet/threads-store";
import { ownThread, pickSettings } from "@/moonlet/threads-http";
import { computers, computersConfigured } from "@/moonlet/computers";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await ownThread(req, (await params).id);
  if ("error" in r) return r.error;
  const [messages, steps] = await Promise.all([ts.listMessages(r.t.id), ts.listSteps(r.t.id)]);
  return NextResponse.json({ thread: r.t, messages, steps });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await ownThread(req, (await params).id);
  if ("error" in r) return r.error;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 70) : "";
  await ts.updateThread(r.t.id, { ...pickSettings(body), ...(title ? { title } : {}) });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await ownThread(req, (await params).id);
  if ("error" in r) return r.error;
  if (computersConfigured()) await computers.sleep(r.t.id).catch(() => undefined);
  await ts.deleteThread(r.t.id);
  return NextResponse.json({ deleted: true });
}
