import * as store from "./store";
import { RH_RPC } from "./tools";

/**
 * The owner's bag: ORBIO staked with Orbio (what earns CREDIT) plus ORBIO still in the wallet. Read on chain, cached ten
 * minutes in the owners table. The staked part is what the earn estimate is built from.
 */
const ORBIO_TOKEN = "0xAa07A0e9209e16aC99708C3EC70159c6eF3128A3";
const STAKING = "0xe0710011278bfb63e57c5f227e5980984b1eddca";

async function balanceOf(contract: string, owner: string, fetchImpl: typeof fetch) {
  const r = await fetchImpl(RH_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: contract, data: `0x70a08231${owner.slice(2).padStart(64, "0")}` }, "latest"] }),
    signal: AbortSignal.timeout(8000),
  });
  const j = (await r.json()) as { result?: string };
  return j.result && j.result !== "0x" ? Number(BigInt(j.result)) / 1e18 : 0;
}

export async function bagOf(owner: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  const cached = await store.getOwner(owner);
  if (cached && Date.now() - cached.bagCheckedAt < 10 * 60_000) return cached.bag;
  try {
    const [held, staked] = await Promise.all([balanceOf(ORBIO_TOKEN, owner, fetchImpl), balanceOf(STAKING, owner, fetchImpl).catch(() => 0)]);
    const bag = held + staked;
    await store.setOwnerBag(owner, bag);
    return bag;
  } catch {
    return cached?.bag ?? 0;
  }
}

/** ORBIO the owner has staked, uncached: the part of the bag that mints CREDIT. */
export async function stakedOf(owner: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  return balanceOf(STAKING, owner, fetchImpl).catch(() => 0);
}
