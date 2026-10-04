import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhoodChain } from "./anchor";
import { bagOf } from "./bag";
import { huntConfig, huntPhase, type HuntConfig } from "./hunt";
import { ORBIO, syncActivations } from "./orbio";
import { RH_RPC } from "./tools";
import * as store from "./store";

/**
 * Hunt grants: the first N wallets to claim get CREDIT activated straight into their Moonlet AI balance by the hunt
 * treasury (CREDIT.activate(amount, beneficiary)). Activated balance can only be spent on inference, so a grant pays
 * for an attempt and can't be claimed and sold. Settings come from the environment:
 *
 *   TREASURY_PRIVATE_KEY   the treasury wallet (holds the grant CREDIT and a little ETH for gas)
 *   HUNT_GRANTS            how many grants (default 10)        HUNT_GRANT_CREDIT    CREDIT each (default 10)
 *   HUNT_GRANT_MIN_ORBIO   ORBIO a wallet must hold or stake to claim (default 100)
 *
 * Claims open when the hunt goes live. One per wallet; the wallet must have signed its Orbio key so the balance is usable.
 */

export type GrantConfig = { count: number; credit: number; minOrbio: number; treasury: string | null };

export function grantConfig(env: NodeJS.ProcessEnv = process.env): GrantConfig {
  const pk = env.TREASURY_PRIVATE_KEY?.trim();
  let treasury: string | null = null;
  try { treasury = pk ? privateKeyToAccount(pk as Hex).address : null; } catch { treasury = null; }
  return {
    count: Math.max(0, Number(env.HUNT_GRANTS ?? 10) || 0),
    credit: Math.max(0, Number(env.HUNT_GRANT_CREDIT ?? 10) || 0),
    minOrbio: Math.max(0, Number(env.HUNT_GRANT_MIN_ORBIO ?? 100) || 0),
    treasury,
  };
}

async function ensureTable() {
  await store.migrate();
  await store.db().execute(`CREATE TABLE IF NOT EXISTS hunt_grants (owner TEXT PRIMARY KEY, status TEXT NOT NULL, tx_hash TEXT, amount REAL NOT NULL, at INTEGER NOT NULL)`);
}

export async function grantsTaken(): Promise<number> {
  await ensureTable();
  const r = await store.db().execute(`SELECT COUNT(*) AS n FROM hunt_grants`);
  return Number(r.rows[0]?.n ?? 0);
}

export async function grantOf(owner: string): Promise<{ status: string; txHash: string | null; amount: number } | null> {
  await ensureTable();
  const r = await store.db().execute({ sql: `SELECT * FROM hunt_grants WHERE owner=?`, args: [owner.toLowerCase()] });
  const x = r.rows[0];
  return x ? { status: x.status as string, txHash: (x.tx_hash as string) ?? null, amount: Number(x.amount) } : null;
}

/** Sends the activation from the treasury; injectable so tests never touch the chain. */
export type GrantSender = (beneficiary: string, credit: number) => Promise<{ txHash: string }>;

const CREDIT_ABI = parseAbi(["function activate(uint256 amount, bytes32 beneficiary)"]);
// One send at a time: the treasury's nonce must not be raced by two claims landing together.
let queue: Promise<unknown> = Promise.resolve();

export function treasurySender(env: NodeJS.ProcessEnv = process.env): GrantSender | null {
  const pk = env.TREASURY_PRIVATE_KEY?.trim();
  if (!pk) return null;
  const account = privateKeyToAccount(pk as Hex);
  const wallet = createWalletClient({ account, chain: robinhoodChain, transport: http(RH_RPC) });
  const pub = createPublicClient({ chain: robinhoodChain, transport: http(RH_RPC) });
  return (beneficiary, credit) => {
    const job = queue.then(async () => {
      const units = BigInt(Math.round(credit * 1e6));
      const to32 = `0x${beneficiary.toLowerCase().replace(/^0x/, "").padStart(64, "0")}` as Hex;
      const hash = await wallet.writeContract({ address: ORBIO.credit, abi: CREDIT_ABI, functionName: "activate", args: [units, to32] });
      const rc = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
      if (rc.status !== "success") throw new Error("activation transaction reverted");
      return { txHash: hash };
    });
    queue = job.catch(() => undefined);
    return job;
  };
}

export type ClaimResult = { ok: true; txHash: string; credit: number; left: number } | { ok: false; error: string };

export async function claimGrant(
  owner: string,
  opts: { now?: number; config?: HuntConfig; grants?: GrantConfig; send?: GrantSender | null; bag?: (o: string) => Promise<number>; fetch?: typeof fetch } = {},
): Promise<ClaimResult> {
  const c = opts.config ?? huntConfig();
  const g = opts.grants ?? grantConfig();
  const send = opts.send === undefined ? treasurySender() : opts.send;
  const who = owner.toLowerCase();
  if (huntPhase(c, opts.now) !== "live") return { ok: false, error: "claims open when the hunt goes live" };
  if (!send || !g.count || !g.credit) return { ok: false, error: "grants aren't set up" };
  if (!/^0x[0-9a-f]{40}$/.test(who)) return { ok: false, error: "grants are activated on Robinhood Chain, so they need a wallet account: sign in with a wallet to claim" };
  if (!(await store.getOwner(who))?.orbioKey) return { ok: false, error: "sign your Orbio key first (Connections), so the CREDIT lands somewhere you can use it" };
  const bag = await (opts.bag ?? ((o) => bagOf(o, opts.fetch)))(who).catch(() => 0);
  if (bag < g.minOrbio) return { ok: false, error: `hold or stake at least ${g.minOrbio.toLocaleString("en-US")} $ORBIO in this wallet to claim (you have ${Math.floor(bag).toLocaleString("en-US")})` };
  await ensureTable();
  // Reserve a slot in one statement: the insert only happens while fewer than N are taken, and only once per wallet.
  const r = await store.db().execute({
    sql: `INSERT INTO hunt_grants(owner,status,tx_hash,amount,at) SELECT ?, 'sending', NULL, ?, ? WHERE (SELECT COUNT(*) FROM hunt_grants) < ? AND NOT EXISTS (SELECT 1 FROM hunt_grants WHERE owner=?)`,
    args: [who, g.credit, opts.now ?? Date.now(), g.count, who],
  });
  if (r.rowsAffected !== 1) return { ok: false, error: (await grantOf(who)) ? "this wallet already claimed" : "all grants have been claimed" };
  try {
    const { txHash } = await send(who, g.credit);
    await store.db().execute({ sql: `UPDATE hunt_grants SET status='sent', tx_hash=? WHERE owner=?`, args: [txHash, who] });
    // Credit the ledger now rather than on the next tick, so the balance shows straight away.
    await syncActivations(who, opts.fetch).catch(() => 0);
    return { ok: true, txHash, credit: g.credit, left: Math.max(0, g.count - (await grantsTaken())) };
  } catch (e) {
    // The send failed: give the slot back so the next person can have it.
    await store.db().execute({ sql: `DELETE FROM hunt_grants WHERE owner=? AND status='sending'`, args: [who] });
    console.error(`hunt grant ${who}:`, (e as Error).message);
    return { ok: false, error: "the treasury couldn't send right now; try again in a minute" };
  }
}

/** What the treasury holds right now, read on chain: the prize ($MOONLET) and the grant pot (CREDIT). Null if unknown. */
export async function treasuryHoldings(treasury: string | null, fetchImpl: typeof fetch = fetch): Promise<{ moonlet: number; credit: number } | null> {
  if (!treasury) return null;
  const call = async (token: string) => {
    const r = await fetchImpl(RH_RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: token, data: `0x70a08231${treasury.slice(2).toLowerCase().padStart(64, "0")}` }, "latest"] }), signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as { result?: string };
    return j.result && j.result !== "0x" ? BigInt(j.result) : 0n;
  };
  try {
    const [m, c] = await Promise.all([call(MOONLET_TOKEN), call(ORBIO.credit)]);
    return { moonlet: Number(m) / 1e18, credit: Number(c) / 1e6 };
  } catch {
    return null;
  }
}

/** The one official $MOONLET contract (same as the landing page's). */
export const MOONLET_TOKEN = "0xcace05716778f86e4feb04bd7a2c2f2c31705f2b";
