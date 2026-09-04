import { createPublicClient, createWalletClient, defineChain, encodeAbiParameters, http, keccak256, stringToHex, type Hex } from "viem";
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

export function encodeAnchor(p: AnchorPayload): Hex {
  return encodeAbiParameters(
    [{ type: "string" }, { type: "string" }, { type: "bytes32" }, { type: "uint64" }, { type: "uint64" }],
    [p.moonletId, p.runId, p.outputHash, BigInt(Math.round(p.costUsd * 1_000_000)), BigInt(Math.floor(p.at / 1000))],
  );
}

export type Anchorer = (p: AnchorPayload) => Promise<{ txHash: Hex }>;

export function makeAnchorer(privateKey?: Hex): Anchorer | null {
  const pk = privateKey ?? (process.env.ANCHOR_PRIVATE_KEY as Hex | undefined);
  if (!pk) return null;
  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain: robinhoodChain, transport: http(RH_RPC) });
  const pub = createPublicClient({ chain: robinhoodChain, transport: http(RH_RPC) });
  return async (p) => {
    const txHash = await wallet.sendTransaction({ to: ANCHOR_TO, value: BigInt(0), data: encodeAnchor(p) });
    await pub.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 }).catch(() => undefined);
    return { txHash };
  };
}

export const explorerTx = (hash: string) => `https://robinhoodchain.blockscout.com/tx/${hash}`;
