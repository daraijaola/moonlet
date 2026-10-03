import { NextResponse } from "next/server";
import { z } from "zod";
import { compileJob, fallbackSpec } from "@/moonlet/compile";
import { bad, ownerFrom } from "@/moonlet/http";
import { TEMPLATE_IDS } from "@/moonlet/spec";
import { connectionFor, listRepos } from "@/moonlet/connections/github";
import * as store from "@/moonlet/store";

const Body = z.object({ sentence: z.string().min(8).max(500), template: z.enum(TEMPLATE_IDS), name: z.string().max(24).optional() });

/**
 * Sentence → JobSpec. Billed to the owner's own Orbio-funded key when one of
 * their moonlets already holds one (a fraction of a cent); the platform key
 * (COMPILE_API_KEY) only covers a holder's very first plan.
 */
export async function POST(req: Request) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return bad(body.error.message);
  // The wallet's own signed key first (a fresh holder has no moonlets yet), then a key one of their moonlets holds, then the platform key.
  const signedKey = (await store.getOwner(owner))?.orbioKey ?? null;
  const ownKey = signedKey ?? (await store.listMoonlets(owner)).find((m) => m.key?.key)?.key?.key;
  // A fresh holder's own key usually has no balance yet, so a refusal there falls through to the platform key.
  const keys = [ownKey, process.env.COMPILE_API_KEY || process.env.OPENROUTER_API_KEY].filter((k): k is string => !!k);
  if (!keys.length) return NextResponse.json({ spec: fallbackSpec(body.data), compiled: false });
  const gh = await connectionFor(owner).catch(() => null);
  const repos = gh ? await listRepos(gh.data.token, 30).then((r) => r.map((x) => x.repo)).catch(() => []) : [];
  for (const key of keys) {
    try {
      return NextResponse.json({ spec: await compileJob(key, { ...body.data, repos }), compiled: true });
    } catch (e) {
      console.error(`compile (${key === ownKey ? "owner key" : "platform key"}):`, (e as Error).message);
    }
  }
  return NextResponse.json({ spec: fallbackSpec(body.data), compiled: false });
}
