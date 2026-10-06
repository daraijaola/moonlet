import { formatEther, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { rhRpc } from "./rpc";
import * as store from "./store";

/**
 * The anchor wallet pays gas for every report hash it writes to Robinhood Chain. Season 1 of the hunt stalled when it ran
 * dry: reports stayed "anchoring…" and nobody could enter. So the tick looks at its ETH balance (at most every ten
 * minutes), shouts in the logs when it drops under ANCHOR_MIN_ETH (default 0.0001), and /api/hunt says anchorLow so the
 * page can warn that anchoring is delayed.
 */

export const ANCHOR_GAS_EVERY_MS = 10 * 60_000;
type Env = Record<string, string | undefined>;
const K_CHECKED = "anchor.gas.checkedAt", K_LOW = "anchor.gas.low", K_BALANCE = "anchor.gas.balanceWei";

/** The floor in wei: ANCHOR_MIN_ETH, or 0.0001 ETH when unset or unreadable. */
export function anchorMinWei(env: Env = process.env): bigint {
  const raw = env.ANCHOR_MIN_ETH?.trim();
  try {
    if (raw && /^\d+(\.\d+)?$/.test(raw)) return parseEther(raw);
  } catch {
    /* fall through to the default */
  }
  return parseEther("0.0001");
}

/** Below the floor (strictly). */
export const anchorIsLow = (balanceWei: bigint, minWei: bigint) => balanceWei < minWei;

/** Whether a check is due: never checked, or the last one is at least ten minutes old. */
export const anchorCheckDue = (lastCheckedAt: number, now: number) => !lastCheckedAt || now - lastCheckedAt >= ANCHOR_GAS_EVERY_MS;

export function anchorAddress(env: Env = process.env): string | null {
  const pk = env.ANCHOR_PRIVATE_KEY?.trim();
  if (!pk) return null;
  try {
    return privateKeyToAccount(pk as Hex).address;
  } catch {
    return null;
  }
}

export type AnchorGas = { address: string; balanceWei: bigint; low: boolean };

/**
 * Read the anchor wallet's balance if a check is due and remember the verdict. Returns null when there's no anchor key or
 * the last check is recent. A failed read (it throws) leaves the last verdict in place and is tried again ten minutes on.
 */
export async function checkAnchorGas(opts: { now?: number; fetch?: typeof fetch; env?: Env } = {}): Promise<AnchorGas | null> {
  const env = opts.env ?? process.env;
  const address = anchorAddress(env);
  if (!address) return null;
  const now = opts.now ?? Date.now();
  if (!anchorCheckDue(Number((await store.kvGet(K_CHECKED)) ?? 0), now)) return null;
  // Claimed before the read, so a slow or failing RPC is still asked at most every ten minutes.
  await store.kvSet(K_CHECKED, String(now));
  const hex = await rhRpc<string>("eth_getBalance", [address, "latest"], opts.fetch ?? fetch);
  const balanceWei = BigInt(hex);
  const minWei = anchorMinWei(env);
  const low = anchorIsLow(balanceWei, minWei);
  await store.kvSet(K_LOW, low ? "1" : "0");
  await store.kvSet(K_BALANCE, balanceWei.toString());
  if (low) console.error(`ANCHOR WALLET LOW ON GAS: ${address} holds ${formatEther(balanceWei)} ETH, under ANCHOR_MIN_ETH ${formatEther(minWei)}. Reports can't be anchored (and hunt entries can't be made) until it's topped up on Robinhood Chain.`);
  return { address, balanceWei, low };
}

/** The last verdict, for the public hunt state. False until a check has said otherwise. */
export async function anchorLow(): Promise<boolean> {
  return (await store.kvGet(K_LOW).catch(() => null)) === "1";
}
