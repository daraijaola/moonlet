import * as store from "./store";
import { creditTokensOf, gatewayBalance, OrbioAuthError, type OrbioClient } from "./orbio";
import { bagOf } from "./bag";
import { rhRpc } from "./rpc";

/**
 * The free trial: a new account gets TRIAL_CREDIT_USD (default $5) to spend within TRIAL_DAYS (default 7), billed to a
 * Moonlet-owned Orbio key (TRIAL_ORBIO_KEY). It lets someone see real results before paying anything, with no wallet,
 * signature or top-up.
 *
 * The key holds real money, so the trial is fenced in:
 *   - only accounts created after TRIAL_START, once each; never existing accounts
 *   - at most TRIAL_MAX_ACCOUNTS ever (default 200) and TRIAL_DAILY_ACCOUNTS a day (default 40), claimed atomically
 *   - Moonlet meters each account's trial spend itself and stops at the credit; the person's own balance is used first
 *   - the trial key is chosen per run and never stored on a moonlet, so it can't outlive the trial
 *   - nothing is granted after TRIAL_UNTIL (optional)
 */

export type TrialConfig = { key: string | null; creditUsd: number; days: number; start: number; until: number; maxAccounts: number; dailyAccounts: number; bonusUsd: number; bonusUntil: number };

export function trialConfig(env: NodeJS.ProcessEnv = process.env): TrialConfig {
  return {
    key: env.TRIAL_ORBIO_KEY?.trim() || null,
    creditUsd: Number(env.TRIAL_CREDIT_USD ?? 5) || 0,
    days: Number(env.TRIAL_DAYS ?? 7) || 0,
    start: Date.parse(env.TRIAL_START ?? "") || 0,
    until: Date.parse(env.TRIAL_UNTIL ?? "") || Infinity,
    maxAccounts: Number(env.TRIAL_MAX_ACCOUNTS ?? 200) || 0,
    dailyAccounts: Number(env.TRIAL_DAILY_ACCOUNTS ?? 40) || 0,
    // A limited-time boost on top (e.g. +$5 during a hunt): accounts that start before TRIAL_BONUS_UNTIL get it.
    bonusUsd: Number(env.TRIAL_BONUS_USD ?? 0) || 0,
    bonusUntil: Date.parse(env.TRIAL_BONUS_UNTIL ?? "") || 0,
  };
}

/** What a new account gets if it starts now: the base credit, plus the boost while it runs. */
export const currentTrialUsd = (c: TrialConfig = trialConfig(), now = Date.now()) => c.creditUsd + (now < c.bonusUntil ? c.bonusUsd : 0);

/** Whether the trial is on offer right now (for pages that advertise it). */
export const trialOpen = (c: TrialConfig = trialConfig(), now = Date.now()) => !!c.key && c.creditUsd > 0 && c.days > 0 && c.start > 0 && now >= c.start && now < c.until;

const on = (c: TrialConfig) => !!c.key && c.creditUsd > 0 && c.days > 0 && c.start > 0;

export const isTrialKey = (key: string | null | undefined, c: TrialConfig = trialConfig()) => !!key && !!c.key && key === c.key;

async function ensureTable() {
  await store.migrate();
  await store.db().execute(`CREATE TABLE IF NOT EXISTS trials (owner TEXT PRIMARY KEY, granted_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, credit_usd REAL NOT NULL, spent_usd REAL NOT NULL DEFAULT 0)`);
  await store.db().execute(`ALTER TABLE trials ADD COLUMN device TEXT`).catch(() => undefined);
  await store.db().execute(`ALTER TABLE trials ADD COLUMN ip_hash TEXT`).catch(() => undefined);
}

export type Trial = { creditUsd: number; spentUsd: number; remainingUsd: number; expiresAt: number; active: boolean };

export async function trialOf(owner: string, now = Date.now()): Promise<Trial | null> {
  await ensureTable();
  const r = await store.db().execute({ sql: `SELECT * FROM trials WHERE owner=?`, args: [owner.toLowerCase()] });
  const x = r.rows[0];
  if (!x) return null;
  const credit = Number(x.credit_usd), spent = Number(x.spent_usd), exp = Number(x.expires_at);
  const remaining = Math.max(0, credit - spent);
  return { creditUsd: credit, spentUsd: spent, remainingUsd: remaining, expiresAt: exp, active: now < exp && remaining >= 0.005 };
}

/** Grant the trial to a new account if it qualifies and there's room today and overall. Idempotent; returns the trial. */
/**
 * Anti-abuse signals for a grant. `device` is a long-lived first-party cookie id: one trial per device. `realWallet` says a
 * wallet account has history on Robinhood Chain (a transaction, or ORBIO/CREDIT in it), so freshly generated empty wallets,
 * the cheap way to farm trials, get nothing; email/Google accounts are verified by Orbio. `ipHash` is kept for review only:
 * mobile networks put thousands of people behind one IP, so it never blocks.
 */
export type GrantSignals = { device?: string | null; ipHash?: string | null; realWallet?: (owner: string) => Promise<boolean> };

export type GrantResult = Trial | null;

export async function grantIfEligible(owner: string, opts: { now?: number; config?: TrialConfig; signals?: GrantSignals } = {}): Promise<GrantResult> {
  const c = opts.config ?? trialConfig();
  const now = opts.now ?? Date.now();
  const have = await trialOf(owner, now);
  if (have || !on(c) || now < c.start || now >= c.until) return have;
  const o = await store.getOwner(owner);
  if (!o?.createdAt || o.createdAt < c.start) return null;
  const sig = opts.signals ?? {};
  if (!sig.device) return null;
  await ensureTable();
  if ((await store.db().execute({ sql: `SELECT 1 FROM trials WHERE device=? LIMIT 1`, args: [sig.device] })).rows.length) return null;
  if (/^0x/.test(owner) && !(await (sig.realWallet ?? (async () => false))(owner).catch(() => false))) return null;
  const day = now - 86_400_000;
  // One statement: under both caps, once per account and per device. Two sign-ins racing can't both get past a cap.
  await store.db().execute({
    sql: `INSERT INTO trials(owner,granted_at,expires_at,credit_usd,spent_usd,device,ip_hash) SELECT ?, ?, ?, ?, 0, ?, ? WHERE (SELECT COUNT(*) FROM trials) < ? AND (SELECT COUNT(*) FROM trials WHERE granted_at > ?) < ? AND NOT EXISTS (SELECT 1 FROM trials WHERE owner=? OR device=?)`,
    args: [owner.toLowerCase(), now, now + c.days * 86_400_000, currentTrialUsd(c, now), sig.device, sig.ipHash ?? null, c.maxAccounts, day, c.dailyAccounts, owner.toLowerCase(), sig.device],
  });
  return trialOf(owner, now);
}

/** A wallet with history on Robinhood Chain: it has sent a transaction, or holds ORBIO or CREDIT. */
export async function walletHasHistory(owner: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const nonce = await rhRpc<string>("eth_getTransactionCount", [owner, "latest"], fetchImpl).catch(() => "0x0");
  if (BigInt(nonce) > 0n) return true;
  const [bag, credit] = await Promise.all([bagOf(owner, fetchImpl).catch(() => 0), creditTokensOf(owner, fetchImpl).catch(() => 0)]);
  return bag > 0 || credit > 0;
}

export async function addTrialSpend(owner: string, usd: number) {
  if (!(usd > 0)) return;
  await ensureTable();
  await store.db().execute({ sql: `UPDATE trials SET spent_usd = MIN(credit_usd, spent_usd + ?) WHERE owner=?`, args: [usd, owner.toLowerCase()] });
}

/**
 * What a run bills: the person's own balance when it has at least a few cents, else an active trial. The choice is made
 * once per getBalance and the matching key handed over by createKey, so a run never mixes the two.
 */
export function withTrial(owner: string, own: OrbioClient | null, c: TrialConfig = trialConfig()): OrbioClient {
  let useTrial = false;
  return {
    async getBalance() {
      const mine = own ? await own.getBalance().catch(() => null) : null;
      if (mine && mine.availableUsd >= 0.05) { useTrial = false; return mine; }
      const t = await trialOf(owner);
      if (t?.active && c.key) { useTrial = true; return { availableUsd: t.remainingUsd, raw: { trial: true, expiresAt: t.expiresAt } }; }
      useTrial = false;
      return mine ?? { availableUsd: 0, raw: { none: true } };
    },
    async getKeyStatus() { return own ? own.getKeyStatus() : { hasKey: false, prefix: null, epoch: 0, raw: { trial: true } }; },
    async createKey(label) {
      if (useTrial && c.key) return { key: c.key, raw: { trial: true } };
      if (!own) throw new OrbioAuthError();
      return own.createKey(label);
    },
    async revokeKey() { if (own) await own.revokeKey(); },
    async exhausted() {
      // The shared key refusing is not this account's problem; an own-balance refusal is.
      if (!useTrial && own) await own.exhausted();
    },
  };
}

/** Threads and plans: the person's own key when their balance can pay, else the trial key while it's active. */
export async function billingKey(owner: string, opts: { config?: TrialConfig; fetch?: typeof fetch } = {}): Promise<{ key: string; trial: boolean; remainingUsd?: number } | null> {
  const c = opts.config ?? trialConfig();
  const o = await store.getOwner(owner);
  const ownKey = o?.orbioKey ?? null;
  const t = c.key ? await trialOf(owner) : null;
  if (ownKey) {
    const live = t?.active ? await gatewayBalance(ownKey, opts.fetch) : null;
    if (!t?.active || (live && live.availableUsd >= 0.05)) return { key: ownKey, trial: false };
  }
  if (t?.active && c.key) return { key: c.key, trial: true, remainingUsd: t.remainingUsd };
  return ownKey ? { key: ownKey, trial: false } : null;
}
