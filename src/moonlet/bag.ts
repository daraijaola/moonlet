import * as store from "./store";
import { RH_RPC } from "./tools";
import { ORBIO, stakedOrbioOf } from "./orbio";

/**
 * The owner's bag: ORBIO staked with Orbio (what earns CREDIT) plus ORBIO still in the wallet. Read on chain, cached ten
 * minutes in the owners table. The staked part is what the earn estimate is built from.
 */

async function heldOrbio(owner: string, fetchImpl: typeof fetch) {
  const r = await fetchImpl(RH_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: ORBIO.orbio, data: `0x70a08231${owner.slice(2).padStart(64, "0")}` }, "latest"] }),
    signal: AbortSignal.timeout(8000),
  });
  const j = (await r.json()) as { result?: string; error?: { message: string } };
  if (j.error) throw new Error(`rpc: ${j.error.message}`);
  return j.result && j.result !== "0x" ? Number(BigInt(j.result)) / 1e18 : 0;
}

export async function bagOf(owner: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  const cached = await store.getOwner(owner);
  if (cached && Date.now() - cached.bagCheckedAt < 10 * 60_000) return cached.bag;
  try {
    const [held, staked] = await Promise.all([heldOrbio(owner, fetchImpl), stakedOrbioOf(owner, fetchImpl)]);
    const bag = held + staked;
    await store.setOwnerBag(owner, bag);
    return bag;
  } catch (e) {
    console.error(`bag read ${owner}:`, (e as Error).message);
    return cached?.bag ?? 0;
  }
}

/** ORBIO the owner has staked, uncached: the part of the bag that mints CREDIT. 0 (logged) when the chain can't be read. */
export async function stakedOf(owner: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  return stakedOrbioOf(owner, fetchImpl).catch((e) => {
    console.error(`staked read ${owner}:`, (e as Error).message);
    return 0;
  });
}
