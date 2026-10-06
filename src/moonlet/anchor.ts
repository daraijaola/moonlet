import { createPublicClient, createWalletClient, decodeAbiParameters, defineChain, encodeAbiParameters, http, keccak256, stringToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { RH_RPC } from "./tools";

/**
 * Anchoring. Every completed run becomes a zero-value transaction on
 * Robinhood Chain whose calldata is abi(moonletId, runId, outputHash, costMicroUsd, timestamp).
 * Anyone can decode it from the explorer. Gas is ~$0.03; we pay it from a
 * platform wallet so holders never need ETH.
 *
 * The recipient is a fixed "anchor" address with no code; sending calldata to
 * an EOA is the cheapest way to leave a permanent, indexable record.
 */

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RH_RPC] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

/** keccak("moonlet.anchor.v1") truncated to an address. Deterministic, code-free, recognisable. */
export const ANCHOR_TO = `0x${keccak256(stringToHex("moonlet.anchor.v1")).slice(26)}` as Hex;

export type AnchorPayload = { moonletId: string; runId: string; outputHash: Hex; costUsd: number; at: number };

const ANCHOR_ABI = [
  { type: "string" },
  { type: "string" },
  { type: "bytes32" },
  { type: "uint64" },
  { type: "uint64" },
] as const;

export function encodeAnchor(p: AnchorPayload): Hex {
  return encodeAbiParameters(ANCHOR_ABI, [
    p.moonletId,
    p.runId,
    p.outputHash,
    BigInt(Math.round(p.costUsd * 1_000_000)),
    BigInt(Math.floor(p.at / 1000)),
  ]);
}

export function decodeAnchor(data: Hex): AnchorPayload {
  const [moonletId, runId, outputHash, costMicro, at] = decodeAbiParameters(ANCHOR_ABI, data);
  return { moonletId, runId, outputHash, costUsd: Number(costMicro) / 1_000_000, at: Number(at) * 1000 };
}

export type Anchorer = (p: AnchorPayload) => Promise<{ txHash: Hex }>;

const NONCE_ERROR = /nonce too low|nonce has already been used|invalid nonce|nonce.*expected|already known|replacement transaction underpriced/i;

/**
 * Sends from one account, one at a time, each with its own nonce. Several runs finishing together (the tick's workers,
 * anchorPending, an overlapping tick) used to send at once and could pick the same nonce from the RPC; the loser waited
 * a whole tick to retry, which can decide a close hunt. Each send takes max(the RPC's pending count, one past the last
 * nonce we used), so a lagging RPC can't hand out a used nonce, and a send rejected for its nonce (say a transaction from
 * elsewhere took it) is retried once with a later one. Only the broadcast is queued; waiting for receipts is not.
 */
export function nonceQueue(pendingNonce: () => Promise<number>) {
  let queue: Promise<unknown> = Promise.resolve();
  let next = 0;
  const attempt = async <T>(send: (nonce: number) => Promise<T>): Promise<T> => {
    const nonce = Math.max(await pendingNonce(), next);
    try {
      const out = await send(nonce);
      next = nonce + 1;
      return out;
    } catch (e) {
      if (!NONCE_ERROR.test((e as Error)?.message ?? String(e))) throw e;
      const again = Math.max(await pendingNonce(), nonce + 1);
      const out = await send(again);
      next = again + 1;
      return out;
    }
  };
  return <T>(send: (nonce: number) => Promise<T>): Promise<T> => {
    const job = queue.then(() => attempt(send));
    queue = job.catch(() => undefined);
    return job;
  };
}

/** One queue per sending address for the life of the process (makeAnchorer is called per anchor). */
const queues = new Map<string, ReturnType<typeof nonceQueue>>();

export function makeAnchorer(privateKey?: Hex): Anchorer | null {
  const pk = privateKey ?? (process.env.ANCHOR_PRIVATE_KEY as Hex | undefined);
  if (!pk) return null;
  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain: robinhoodChain, transport: http(RH_RPC) });
  const pub = createPublicClient({ chain: robinhoodChain, transport: http(RH_RPC) });
  let send = queues.get(account.address);
  if (!send) queues.set(account.address, (send = nonceQueue(() => pub.getTransactionCount({ address: account.address, blockTag: "pending" }))));
  const enqueue = send;
  return async (p) => {
    const txHash = await enqueue((nonce) => wallet.sendTransaction({ to: ANCHOR_TO, value: BigInt(0), data: encodeAnchor(p), nonce }));
    // A hash alone is only "submitted". The run is recorded as anchored only once the chain confirms it; otherwise the next
    // tick's anchorPending() sends it again.
    const receipt = await pub.waitForTransactionReceipt({ hash: txHash, timeout: 90_000 });
    if (receipt.status !== "success") throw new Error(`anchor tx ${txHash} reverted`);
    return { txHash };
  };
}

export const explorerTx = (hash: string) => `https://robinhoodchain.blockscout.com/tx/${hash}`;
