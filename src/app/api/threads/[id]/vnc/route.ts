import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { bad } from "@/moonlet/http";
import { ownThread } from "@/moonlet/threads-http";
import { computers } from "@/moonlet/computers";

/** A one-minute pass to open the live desktop of this thread's computer through /vnc/<id>. Never wakes it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await ownThread(req, (await params).id);
  if ("error" in r) return r.error;
  const token = process.env.MC_TOKEN;
  if (!token) return bad("computers are not configured", 503);
  const info = await computers.info(r.t.id).catch(() => null);
  if (info?.status !== "running") return bad("asleep", 409);
  const exp = Date.now() + 60_000;
  const mac = createHmac("sha256", token).update(`${r.t.id}.${exp}`).digest("hex");
  return NextResponse.json({ path: `/vnc/${r.t.id}?ticket=${exp}.${mac}` }, { headers: { "cache-control": "no-store" } });
}
