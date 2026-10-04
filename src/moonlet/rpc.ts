import { RH_RPC } from "./tools";

/**
 * Robinhood Chain JSON-RPC for the ledger, bag and staking reads. The public RPC limits by load: a handful of wide
 * eth_getLogs scans in a row earns a 429 for a few seconds, and a page load fires several reads at once. So calls share
 * one small in-flight limit, and a rate-limited call waits 1s, 2s, then 4s before giving up.
 */

const MAX_IN_FLIGHT = 3;
let inFlight = 0;
const waiting: Array<() => void> = [];

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((ok) => waiting.push(ok));
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    waiting.shift()?.();
  }
}

export async function rhRpc<T>(method: string, params: unknown[], fetchImpl: typeof fetch = fetch, timeoutMs = 10_000): Promise<T> {
  for (const wait of [0, 1000, 2000, 4000]) {
    if (wait) await new Promise((ok) => setTimeout(ok, wait));
    const { status, body } = await slot(async () => {
      const r = await fetchImpl(RH_RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { status: r.status, body: (await r.json().catch(() => ({ error: { message: `HTTP ${r.status}` } }))) as { result?: T; error?: { message: string } } };
    });
    if (status === 429 || /too many requests/i.test(body.error?.message ?? "")) continue;
    if (body.error) throw new Error(`rpc ${method}: ${body.error.message}`);
    if (body.result === undefined) throw new Error(`rpc ${method}: no result`);
    return body.result;
  }
  throw new Error(`rpc ${method}: Too Many Requests`);
}
