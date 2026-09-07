import { NextResponse } from "next/server";
import { z } from "zod";
import { plan } from "@/moonlet/budget";
import { bad, ownerFrom } from "@/moonlet/http";
import { bagOf, orbioFor } from "@/moonlet/scheduler";
import { JobSpec } from "@/moonlet/spec";
import * as store from "@/moonlet/store";
import { publicMoonlet } from "../route";

type Ctx = { params: Promise<{ id: string }> };

/** Public read: anyone can view a moonlet. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const m = await store.getMoonlet(id);
  if (!m) return bad("not found", 404);
  return NextResponse.json({ moonlet: publicMoonlet(m) });
}

const Patch = z.object({
  action: z.enum(["pause", "resume", "rotate_key", "edit"]),
  spec: JobSpec.optional(),
  delivery: z.object({ telegram: z.string().max(64).optional(), x: z.string().max(64).optional() }).optional(),
  autopilot: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  const { id } = await params;
  const m = await store.getMoonlet(id);
  if (!m || m.owner !== owner) return bad("not found", 404);
  const body = Patch.safeParse(await req.json().catch(() => null));
  if (!body.success) return bad(body.error.message);

  if (body.data.action === "pause") await store.updateMoonlet(id, { status: "paused" });
  if (body.data.action === "resume") await store.updateMoonlet(id, { status: "idle", nextRunAt: Date.now() });
  if (body.data.action === "rotate_key") {
    const orbio = await orbioFor(owner);
    if (!orbio) return bad("Orbio not connected", 409);
    // Re-mint the wallet's Orbio key (the previous one is retired) and hand the new secret to every moonlet on this wallet.
    const [k, bal] = await Promise.all([orbio.createKey("moonlet"), orbio.getBalance()]);
    for (const sib of await store.listMoonlets(owner)) {
      await store.updateMoonlet(sib.id, { key: { key: k.key, limitUsd: bal.availableUsd, spentUsd: 0 }, ...(sib.id === id ? { keysRotated: m.keysRotated + 1 } : {}) });
    }
  }
  if (body.data.action === "edit") {
    const spec = body.data.spec ?? m.spec;
    const p = plan(spec, await bagOf(owner));
    await store.updateMoonlet(id, {
      spec,
      name: spec.name,
      delivery: body.data.delivery ?? m.delivery,
      autopilot: body.data.autopilot ?? m.autopilot,
      cadence: p.cadence,
      perRunCapUsd: p.perRunCapUsd,
      earnPerDayUsd: p.earnPerDayUsd,
      burnPerDayUsd: p.burnPerDayUsd,
      status: p.quiet ? "quiet" : m.status === "paused" ? "paused" : "idle",
    });
  }
  const after = await store.getMoonlet(id);
  return NextResponse.json({ moonlet: after && publicMoonlet(after) });
}

/** Delete: revokes the key through Orbio so unspent credit returns to the owner's balance. */
export async function DELETE(req: Request, { params }: Ctx) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  const { id } = await params;
  const m = await store.getMoonlet(id);
  if (!m || m.owner !== owner) return bad("not found", 404);
  // The key belongs to the wallet, not the moonlet: deleting a moonlet never touches credits.
  // Runs stay (they are public receipts); drafts still waiting for an OK are withdrawn so nothing acts for a moonlet that no longer exists.
  const pending = (await store.listProposals(owner, "pending")).filter((p) => p.moonletId === id);
  for (const p of pending) await store.decideProposal(p.id, "rejected");
  await store.updateMoonlet(id, { status: "deleted", key: null, nextRunAt: Number.MAX_SAFE_INTEGER });
  return NextResponse.json({ ok: true, withdrawn: pending.length });
}
