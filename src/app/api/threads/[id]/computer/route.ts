import { NextResponse } from "next/server";
import { bad } from "@/moonlet/http";
import { ownThread } from "@/moonlet/threads-http";
import { computers, computersConfigured, type Machine } from "@/moonlet/computers";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await ownThread(req, (await params).id);
  if ("error" in r) return r.error;
  if (!computersConfigured()) return NextResponse.json({ status: "unavailable" });
  return NextResponse.json(await computers.info(r.t.id).catch(() => ({ status: "none" })));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await ownThread(req, (await params).id);
  if ("error" in r) return r.error;
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action === "wake") return NextResponse.json(await computers.wake(r.t.id, r.t.machine as Machine));
  if (action === "sleep") return NextResponse.json(await computers.sleep(r.t.id));
  return bad("action is wake or sleep");
}
