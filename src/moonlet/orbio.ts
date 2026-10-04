import { recoverMessageAddress } from "viem";
import * as store from "./store";
import { rhRpc } from "./rpc";

/**
 * Orbio's CREDIT protocol (September 2026). Inference is a token on Robinhood
 * Chain: stake ORBIO to earn CREDIT, `activate` burns CREDIT into a
 * non-transferable AI balance, and the API key is the wallet's signature of a
 * fixed message. There is no account to approve and no key to mint:
 *
 *   key      = sk-orb-<epoch>-base64(signMessage("Orbio API key · chain 4663 · epoch <epoch>"))
 *   balance  = what the owner activated (Activated events we verified) minus what runs spent
 *   funding  = the owner's wallet calls CREDIT.activate(); Moonlet never holds a private key
 *
 * GET /api/v1/key on the gateway returns the key's live balance (verified 16 Sep:
 * {balance:{available, used}}). That is the source of truth when the wallet has a
 * key; the on-chain ledger of activations minus spend is the fallback when the
 * gateway is unreachable, and is what the app shows labelled an estimate.
 */

export const ORBIO = {
  origin: "https://www.orbio.so",
  gateway: "https://www.orbio.so/api/v1",
  chainId: 4663,
  credit: "0xe33322da1380e61e5ae5dfb21e7f62924c73004c",
  staking: "0xe0710011278bfb63e57c5f227e5980984b1eddca",
  exchange: "0x6951ffd32630b05e06f50062aea801625a58ebc0",
  orbio: "0xaa07a0e9209e16ac99708c3ec70159c6ef3128a3",
  /** keccak256("Activated(uint256,address,bytes32,uint256)") */
  activatedTopic: "0x3a293632e41f6556f85d186d28ae95749534c2c9422cec0e1075886560ca7147",
  /** keccak256("ActivationFeeCharged(uint256,uint256)"): the part of an activation that credits nothing. */
  feeTopic: "0x22bce9ab29f23f4818afa41ce0ca8cc1d23816cf4544e29580a53aead6f0176c",
  /** Just before the first Activated event on chain (block 63,743,280); a log scan never needs to start earlier. */
  firstBlock: 63_700_000,
} as const;

/** Robinhood Chain's RPC refuses eth_getLogs spanning more than 10,000,000 blocks. */
const LOG_WINDOW = 9_000_000;

export const keyMessage = (epoch: number) => `Orbio API key · chain ${ORBIO.chainId} · epoch ${epoch}`;

/** The gateway credential, derived from the wallet's signature exactly as Orbio's guide does. */
export function apiKeyFromSignature(signature: `0x${string}`, epoch: number) {
  return `sk-orb-${epoch}-${Buffer.from(signature.slice(2), "hex").toString("base64")}`;
}

/** True only if `signature` is the owner's signature of this epoch's key message. */
export async function signatureBelongsTo(owner: string, signature: `0x${string}`, epoch: number) {
  try {
    const addr = await recoverMessageAddress({ message: keyMessage(epoch), signature });
    return addr.toLowerCase() === owner.toLowerCase();
  } catch {
    return false;
  }
}

export type OrbioBalance = { availableUsd: number; creditTokens?: number; raw: unknown };
export type OrbioKey = { key: string; raw: unknown };
export type OrbioKeyStatus = { hasKey: boolean; prefix: string | null; epoch: number; raw: unknown };

export type OrbioClient = {
  /** The AI balance Moonlet can account for, in dollars. */
  getBalance(): Promise<OrbioBalance>;
  getKeyStatus(): Promise<OrbioKeyStatus>;
  /** The owner's signature key. Throws OrbioAuthError when the owner has not signed. */
  createKey(label?: string): Promise<OrbioKey>;
  /** Forget the key; the owner signs again (with a higher epoch to rotate on Orbio's side). */
  revokeKey(): Promise<void>;
  /** The gateway refused for lack of balance: the ledger is wrong on the high side, so zero it. */
  exhausted(): Promise<void>;
};

export class OrbioAuthError extends Error {
  constructor(msg = "Orbio key missing; owner must sign for it") {
    super(msg);
    this.name = "OrbioAuthError";
  }
}

// ---- chain reads -----------------------------------------------------------

const pad = (hex: string) => hex.replace(/^0x/, "").padStart(64, "0");

async function ethCall(to: string, data: string, fetchImpl: typeof fetch): Promise<bigint> {
  const result = await rhRpc<string>("eth_call", [{ to, data }, "latest"], fetchImpl, 8000);
  return result && result !== "0x" ? BigInt(result) : 0n;
}

/** Unactivated CREDIT in the wallet, in dollars (6 decimals). Memoized 30s in production: every page load asks. */
const creditMemo = new Map<string, { at: number; v: number }>();
export async function creditTokensOf(owner: string, fetchImpl: typeof fetch = fetch) {
  const k = owner.toLowerCase(), hit = creditMemo.get(k);
  if (fetchImpl === fetch && hit && Date.now() - hit.at < 30_000) return hit.v;
  const v = Number(await ethCall(ORBIO.credit, `0x70a08231${pad(owner)}`, fetchImpl)) / 1e6;
  if (fetchImpl === fetch) creditMemo.set(k, { at: Date.now(), v });
  return v;
}

/** ORBIO staked by the owner (18 decimals). The staking proxy answers `positionOf(address)`; its `balanceOf` reverts. */
export async function stakedOrbioOf(owner: string, fetchImpl: typeof fetch = fetch) {
  return Number(await ethCall(ORBIO.staking, `0xfd2d39c5${pad(owner)}`, fetchImpl)) / 1e18;
}

export async function latestBlock(fetchImpl: typeof fetch = fetch) {
  return Number(BigInt(await rhRpc<string>("eth_blockNumber", [], fetchImpl)));
}

export type ActivationReceipt = { txHash: string; activationId: string; from: string; beneficiary: string; amountUsd: number; blockNumber: number };

/**
 * Read a transaction's receipt and return the CREDIT `Activated` events in it.
 * The caller checks the beneficiary; this only proves the burn happened on chain.
 */
export async function readActivations(txHash: string, fetchImpl: typeof fetch = fetch): Promise<ActivationReceipt[]> {
  const rc = await rhRpc<{ status: string; blockNumber: string; logs: Array<{ address: string; topics: string[]; data: string }> } | null>("eth_getTransactionReceipt", [txHash], fetchImpl, 8000);
  if (!rc) return [];
  if (rc.status !== "0x1") throw new Error("transaction reverted");
  const out: ActivationReceipt[] = [];
  const fees = feesIn(rc.logs);
  for (const log of rc.logs) {
    if (log.address.toLowerCase() !== ORBIO.credit || log.topics[0]?.toLowerCase() !== ORBIO.activatedTopic) continue;
    // Activated(uint256 indexed activationId, address indexed from, bytes32 indexed beneficiary, uint256 amount)
    const [, activationId, from, beneficiary] = log.topics;
    const amount = log.data.slice(0, 66);
    if (!activationId || !from || !beneficiary || amount.length !== 66) continue;
    out.push({
      txHash,
      activationId: BigInt(activationId).toString(),
      from: `0x${from.slice(-40)}`.toLowerCase(),
      beneficiary: `0x${beneficiary.slice(-40)}`.toLowerCase(),
      amountUsd: netUsd(BigInt(amount), fees.get(BigInt(activationId).toString())),
      blockNumber: Number(BigInt(rc.blockNumber)),
    });
  }
  return out;
}

/** ActivationFeeCharged amounts by activationId. Activated carries the gross burn; the fee is the part that credits nothing. */
function feesIn(logs: Array<{ address: string; topics: string[]; data: string }>) {
  const m = new Map<string, bigint>();
  for (const l of logs) if (l.address.toLowerCase() === ORBIO.credit && l.topics[0]?.toLowerCase() === ORBIO.feeTopic && l.topics[1]) m.set(BigInt(l.topics[1]).toString(), BigInt(l.data.slice(0, 66)));
  return m;
}

const netUsd = (gross: bigint, fee = 0n) => Number(gross > fee ? gross - fee : 0n) / 1e6;

type RawLog = { address: string; transactionHash: string; blockNumber: string; topics: string[]; data: string };

/**
 * Every Activated event whose beneficiary is this wallet, from the chain's own index. Lets the ledger pick up activations
 * made anywhere (Orbio's dashboard, a script, another app), not only the ones posted through Moonlet. Scans in windows the
 * RPC accepts; any window failing throws, so the caller never advances past blocks it did not read.
 */
export async function findActivations(owner: string, fetchImpl: typeof fetch = fetch, fromBlock: number = ORBIO.firstBlock, toBlock?: number): Promise<ActivationReceipt[]> {
  const to = toBlock ?? (await latestBlock(fetchImpl));
  const logs: RawLog[] = [];
  for (let lo = Math.max(0, fromBlock); lo <= to; lo += LOG_WINDOW) {
    const hi = Math.min(to, lo + LOG_WINDOW - 1);
    const filter = { fromBlock: `0x${lo.toString(16)}`, toBlock: `0x${hi.toString(16)}`, address: ORBIO.credit };
    const found = await rhRpc<RawLog[]>("eth_getLogs", [{ ...filter, topics: [ORBIO.activatedTopic, null, null, `0x${pad(owner)}`] }], fetchImpl);
    if (!found.length) continue;
    logs.push(...found);
    // The fee events for these activations, same window: one more call only when something was found.
    const ids = found.map((l) => l.topics[1]);
    logs.push(...(await rhRpc<RawLog[]>("eth_getLogs", [{ ...filter, topics: [ORBIO.feeTopic, ids] }], fetchImpl).catch(() => [])));
  }
  const fees = feesIn(logs.map((l) => ({ ...l, address: l.address ?? ORBIO.credit })));
  return logs
    .filter((l) => l.topics[0]?.toLowerCase() === ORBIO.activatedTopic)
    .map((log) => {
      const activationId = BigInt(log.topics[1]).toString();
      return {
        txHash: log.transactionHash,
        activationId,
        from: `0x${log.topics[2].slice(-40)}`.toLowerCase(),
        beneficiary: `0x${log.topics[3].slice(-40)}`.toLowerCase(),
        amountUsd: netUsd(BigInt(log.data.slice(0, 66)), fees.get(activationId)),
        blockNumber: Number(BigInt(log.blockNumber)),
      };
    });
}

/**
 * Pull any activations the ledger has not seen yet; returns the dollars newly credited. A per-wallet cursor remembers the
 * last block read, so each sync scans only new blocks. Errors are logged and return 0: the chain being slow must not stop a run.
 */
const syncedAt = new Map<string, number>();
export async function syncActivations(owner: string, fetchImpl: typeof fetch = fetch) {
  // An Orbio email account (orbio-…) has no wallet, so nothing on chain can be addressed to it.
  if (!/^0x[0-9a-f]{40}$/i.test(owner)) return 0;
  // A page load, the balance read inside it and the tick all ask; one sync per owner per 30s is plenty (production only).
  const k = owner.toLowerCase();
  if (fetchImpl === fetch) {
    const last = syncedAt.get(k) ?? 0;
    if (Date.now() - last < 30_000) return 0;
    syncedAt.set(k, Date.now());
  }
  const cursorKey = `activations.synced.${owner.toLowerCase()}`;
  try {
    const cursor = Number((await store.kvGet(cursorKey)) ?? NaN);
    const latest = await latestBlock(fetchImpl);
    // Re-read a few blocks behind the cursor: a block at the tip may not have been indexed yet. Replays are no-ops.
    const from = Number.isFinite(cursor) ? Math.max(ORBIO.firstBlock, cursor - 50) : ORBIO.firstBlock;
    let credited = 0;
    for (const a of await findActivations(owner, fetchImpl, from, latest)) if (await store.addActivation({ ...a, owner })) credited += a.amountUsd;
    await store.kvSet(cursorKey, String(latest));
    if (credited > 0) await store.wakeQuietMoonlets(owner);
    return credited;
  } catch (e) {
    console.error(`activation sync ${owner}:`, (e as Error).message);
    return 0;
  }
}

/** The gateway's own view of a key: available and used dollars. Null when the key is unknown to it or the call fails. */
export async function gatewayBalance(key: string, fetchImpl: typeof fetch = fetch): Promise<{ availableUsd: number; usedUsd: number } | null> {
  try {
    const r = await fetchImpl(`${ORBIO.gateway}/key`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { balance?: { available?: string; used?: string } };
    if (!j.balance) return null;
    return { availableUsd: Number(j.balance.available ?? 0), usedUsd: Number(j.balance.used ?? 0) };
  } catch {
    return null;
  }
}

// ---- the client ------------------------------------------------------------

/** Client for one owner, backed by the owners table: the sealed signature key and the activated-balance ledger. */
export function makeCreditClient(owner: string, fetchImpl: typeof fetch = fetch): OrbioClient {
  return {
    async getBalance() {
      await syncActivations(owner, fetchImpl);
      const [o, creditTokens] = await Promise.all([store.getOwner(owner), creditTokensOf(owner, fetchImpl).catch(() => undefined)]);
      // Ask the gateway first, with whichever key this wallet has; reconcile the ledger to it so the app shows the real figure.
      const key = o?.orbioKey ?? (await store.listMoonlets(owner)).find((m) => m.key?.key.startsWith("sk-orb"))?.key?.key;
      const live = key ? await gatewayBalance(key, fetchImpl) : null;
      if (live) {
        if (Math.abs(live.availableUsd - (o?.orbioBalanceUsd ?? 0)) > 0.0005) await store.setOwnerBalance(owner, live.availableUsd);
        return { availableUsd: live.availableUsd, creditTokens, raw: { gateway: true, usedUsd: live.usedUsd } };
      }
      return { availableUsd: Math.max(0, o?.orbioBalanceUsd ?? 0), creditTokens, raw: { ledger: true } };
    },
    async getKeyStatus() {
      const o = await store.getOwner(owner);
      return { hasKey: !!o?.orbioKey, prefix: o?.orbioKey ? o.orbioKey.slice(0, 12) : null, epoch: o?.orbioEpoch ?? 0, raw: {} };
    },
    async createKey() {
      const o = await store.getOwner(owner);
      if (!o?.orbioKey) throw new OrbioAuthError();
      return { key: o.orbioKey, raw: { epoch: o.orbioEpoch } };
    },
    async revokeKey() {
      await store.clearOwnerOrbio(owner);
    },
    async exhausted() {
      await store.setOwnerBalance(owner, 0);
    },
  };
}
