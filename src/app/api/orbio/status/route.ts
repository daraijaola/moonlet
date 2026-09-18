import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import { renewedCookie, sessionFrom } from "@/moonlet/session";
import { bagOf, orbioFor } from "@/moonlet/scheduler";
import { stakedOf } from "@/moonlet/bag";
import { estimateEarnPerDay } from "@/moonlet/budget";
import { creditTokensOf, keyMessage, syncActivations } from "@/moonlet/orbio";
import * as store from "@/moonlet/store";

/** Has this wallet signed for its Orbio key, and what does its bag and CREDIT look like? */
export async function GET(req: Request) {
  const owner = ownerFrom(req);
  if (!owner) return bad("sign in with your wallet first", 401);
  await syncActivations(owner);
  const [orbio, bag, staked, creditTokens, o, avatar, activations, pending] = await Promise.all([
    orbioFor(owner),
    bagOf(owner),
    stakedOf(owner),
    creditTokensOf(owner).catch(() => null),
    store.getOwner(owner),
    store.avatarOf(owner),
    store.listActivations(owner, 5),
    store.listProposals(owner, "pending").then((ps) => ps.concat([])).catch(() => []),
  ]);
  const balance = orbio ? await orbio.getBalance().catch(() => null) : null;
  const activationCard = pending.find((p) => p.kind === "activate_credit") ?? (await store.listProposals(owner, "approved")).find((p) => p.kind === "activate_credit") ?? null;
  const canWrite = !!sessionFrom(req) || process.env.ALLOW_HEADER_AUTH === "1" || process.env.NODE_ENV !== "production";
  const res = NextResponse.json({
    approved: !!orbio,
    avatar,
    bag,
    staked,
    earnPerDayUsd: estimateEarnPerDay(staked),
    /** Activated AI balance: the gateway's figure when it answers, else verified activations minus recorded spend. */
    idleCreditsUsd: balance?.availableUsd ?? o?.orbioBalanceUsd ?? 0,
    balanceSource: balance?.raw && (balance.raw as { gateway?: boolean }).gateway ? "gateway" : "ledger",
    /** CREDIT tokens in the wallet, not yet activated. */
    creditTokensUsd: creditTokens,
    canWrite,
    orbio: { epoch: o?.orbioEpoch ?? 0, signedAt: o?.orbioKeySignedAt ?? null, message: keyMessage(o?.orbioEpoch ?? 0), dev: process.env.ALLOW_DEV_ORBIO === "1", activations, activationCard: activationCard ? { id: activationCard.id, amountUsd: Number(activationCard.payload.amountUsd ?? 0), status: activationCard.status } : null },
  });
  const renewed = renewedCookie(req);
  if (renewed) res.headers.set("set-cookie", renewed);
  return res;
}

/** Forget the signed key for this owner; they sign again from Connections. */
export async function DELETE(req: Request) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  await store.clearOwnerOrbio(owner);
  return NextResponse.json({ ok: true });
}
