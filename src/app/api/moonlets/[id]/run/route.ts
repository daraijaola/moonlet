import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import { runOne } from "@/moonlet/scheduler";
import * as store from "@/moonlet/store";

/** Run now. Owner-only. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign with your wallet or approve Orbio to unlock this", 401);
  const { id } = await params;
  const m = await store.getMoonlet(id);
  if (!m || m.owner !== owner) return bad("not found", 404);
  if (m.status === "running") return bad("already running", 409);
  await store.updateMoonlet(id, { status: "idle", nextRunAt: Date.now() });
  if (!(await store.claimForRun(id))) return bad("could not claim", 409);
  const r = await runOne(id);
  return NextResponse.json(r);
}
