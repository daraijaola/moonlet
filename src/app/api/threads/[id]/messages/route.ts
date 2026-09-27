import { NextResponse } from "next/server";
import { bad } from "@/moonlet/http";
import * as ts from "@/moonlet/threads-store";
import { ownThread, pickSettings, saveUploads } from "@/moonlet/threads-http";
import { startTurn } from "@/moonlet/thread-agent";

/** A follow-up in the thread. While a turn is running the message waits in the thread and is read on the next turn. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await ownThread(req, (await params).id);
  if ("error" in r) return r.error;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text && !Array.isArray(body.files)) return bad("empty message");
  const up = await saveUploads(r.t.id, r.t.machine, body.files).catch((e) => ({ error: (e as Error).message }));
  if ("error" in up) return bad(up.error);
  await ts.addMessage({ threadId: r.t.id, role: "user", text: text.slice(0, 8000) || "Here are some files.", files: up.paths });
  if (r.t.status === "working" || r.t.status === "stopping") return NextResponse.json({ queued: true });
  await ts.updateThread(r.t.id, { ...pickSettings(body), status: "working" });
  startTurn(r.t.id);
  return NextResponse.json({ started: true });
}
