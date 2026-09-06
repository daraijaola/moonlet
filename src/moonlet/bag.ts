import * as store from "./store";
import { RH_RPC } from "./tools";

/** The owner's $ORBIO balance on Robinhood Chain, cached ten minutes; the only input the budget needs. */
const ORBIO_TOKEN = "0xAa07A0e9209e16aC99708C3EC70159c6eF3128A3";

export async function bagOf(owner: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  const cached = await store.getOwner(owner);
  if (cached && Date.now() - cached.bagCheckedAt < 10 * 60_000) return cached.bag;
  try {
    const r = await fetchImpl(RH_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: ORBIO_TOKEN, data: `0x70a08231${owner.slice(2).padStart(64, "0")}` }, "latest"],
      }),
      signal: AbortSignal.timeout(8000),
    });
    const j = (await r.json()) as { result?: string };
    const bag = j.result ? Number(BigInt(j.result)) / 1e18 : (cached?.bag ?? 0);
    await store.setOwnerBag(owner, bag);
    return bag;
  } catch {
    return cached?.bag ?? 0;
  }
}
