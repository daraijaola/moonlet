import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import * as ts from "@/moonlet/threads-store";
import { pickSettings, saveUploads } from "@/moonlet/threads-http";
import { startTurn } from "@/moonlet/thread-agent";

export async function GET(req: Request) {
  const owner = ownerFrom(req);
  if (!owner) return bad("sign in with your wallet first", 401);
  await ts.releaseStaleThreads(25 * 60_000);
  return NextResponse.json({ threads: await ts.listThreads(owner) });
}

/** A new thread from its first task: saved, then the moonlet starts working on it in the background. */
export async function POST(req: Request) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text && !Array.isArray(body.files)) return bad("say what the moonlet should do");
  if (text.length > 8000) return bad("keep the task under 8,000 characters");
  const s = pickSettings(body);
  const id = await ts.createThread({ owner, title: text ? (text.length > 70 ? `${text.slice(0, 67)}…` : text) : "Files", model: s.model ?? "auto", effort: s.effort ?? "medium", machine: s.machine ?? "standard" });
  const up = await saveUploads(id, s.machine ?? "standard", body.files).catch((e) => ({ error: (e as Error).message }));
  if ("error" in up) {
    await ts.deleteThread(id);
    return bad(up.error);
  }
  await ts.addMessage({ threadId: id, role: "user", text: text || "Here are some files.", files: up.paths });
  await ts.updateThread(id, { status: "working" });
  startTurn(id);
  return NextResponse.json({ id });
}
