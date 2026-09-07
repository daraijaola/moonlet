import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import * as store from "@/moonlet/store";
import { MAX_AUDIO_BYTES, transcribe } from "@/moonlet/transcribe";

/** Owner sends a voice note for this moonlet's composer; the words come back as text, billed to the moonlet's key. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  const { id } = await params;
  const m = await store.getMoonlet(id);
  if (!m || m.owner !== owner) return bad("not found", 404);
  const key = m.key?.key ?? (await store.listMoonlets(owner)).find((x) => x.key?.key)?.key?.key ?? process.env.COMPILE_API_KEY;
  if (!key) return bad(`${m.name} hasn't claimed a key yet; voice notes work after its first run`, 409);
  const mime = req.headers.get("content-type") ?? "";
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.byteLength) return bad("no audio");
  if (bytes.byteLength > MAX_AUDIO_BYTES) return bad("recording too long; keep it under a minute", 413);
  try {
    return NextResponse.json(await transcribe(key, { bytes, mime }));
  } catch (e) {
    return bad((e as Error).message.slice(0, 200));
  }
}
