import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import * as store from "@/moonlet/store";

/** Owner only: every file this moonlet has written, newest first. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = ownerFrom(req);
  if (!owner) return bad("sign in with your wallet first", 401);
  const { id } = await params;
  const m = await store.getMoonlet(id);
  if (!m || m.owner !== owner) return bad("not found", 404);
  const files = await store.filesForMoonlet(id);
  return NextResponse.json({ files: files.map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, createdAt: f.createdAt, runId: f.runId, runTitle: f.runTitle, url: `/api/files/${f.id}` })) });
}
