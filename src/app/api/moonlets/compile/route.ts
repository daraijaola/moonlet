import { NextResponse } from "next/server";
import { z } from "zod";
import { compileJob, fallbackSpec } from "@/moonlet/compile";
import { bad, ownerFrom } from "@/moonlet/http";
import { makeClient } from "@/moonlet/model";
import { TEMPLATE_IDS } from "@/moonlet/spec";

const Body = z.object({ sentence: z.string().min(8).max(500), template: z.enum(TEMPLATE_IDS), name: z.string().max(24).optional() });

/**
 * Sentence → JobSpec. Uses the platform key (COMPILE_API_KEY) because the
 * owner's moonlet has no key yet at this point; it costs a fraction of a cent.
 */
export async function POST(req: Request) {
  if (!ownerFrom(req, { write: true })) return bad("sign in with your wallet first", 401);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return bad(body.error.message);
  const key = process.env.COMPILE_API_KEY ?? process.env.OPENROUTER_API_KEY;
  if (!key) return NextResponse.json({ spec: fallbackSpec(body.data), compiled: false });
  try {
    const spec = await compileJob(makeClient(key), body.data);
    return NextResponse.json({ spec, compiled: true });
  } catch {
    return NextResponse.json({ spec: fallbackSpec(body.data), compiled: false });
  }
}
