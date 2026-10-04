import * as store from "./store";
import { rhRpc } from "./rpc";
import { ORBIO, stakedOrbioOf } from "./orbio";

/**
 * The owner's bag: ORBIO staked with Orbio (what earns CREDIT) plus ORBIO still in the wallet. Read on chain, cached ten
 * minutes in the owners table. The staked part is what the earn estimate is built from.
 */

async function heldOrbio(owner: string, fetchImpl: typeof fetch) {
  const result = await rhRpc<string>("eth_call", [{ to: ORBIO.orbio, data: `0x70a08231${owner.slice(2).padStart(64, "0")}` }, "latest"], fetchImpl, 8000);
  return result && result !== "0x" ? Number(BigInt(result)) / 1e18 : 0;
}

export async function bagOf(owner: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  if (!/^0x[0-9a-f]{40}$/i.test(owner)) return 0;
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

/** ORBIO the owner has staked: the part of the bag that mints CREDIT. Two-minute memo (every page load asks); 0, logged, when the chain can't be read. */
const stakedMemo = new Map<string, { at: number; v: number }>();
export async function stakedOf(owner: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  if (!/^0x[0-9a-f]{40}$/i.test(owner)) return 0;
  const hit = stakedMemo.get(owner.toLowerCase());
  if (hit && Date.now() - hit.at < 2 * 60_000 && fetchImpl === fetch) return hit.v;
  try {
    const v = await stakedOrbioOf(owner, fetchImpl);
    if (fetchImpl === fetch) stakedMemo.set(owner.toLowerCase(), { at: Date.now(), v });
    return v;
  } catch (e) {
    console.error(`staked read ${owner}:`, (e as Error).message);
    return 0;
  }
}
