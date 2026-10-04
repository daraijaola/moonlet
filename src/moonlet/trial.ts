import * as store from "./store";
import { gatewayBalance, OrbioAuthError, type OrbioClient } from "./orbio";

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

export type TrialConfig = { key: string | null; creditUsd: number; days: number; start: number; until: number; maxAccounts: number; dailyAccounts: number };

export function trialConfig(env: NodeJS.ProcessEnv = process.env): TrialConfig {
  return {
    key: env.TRIAL_ORBIO_KEY?.trim() || null,
    creditUsd: Number(env.TRIAL_CREDIT_USD ?? 5) || 0,
    days: Number(env.TRIAL_DAYS ?? 7) || 0,
    start: Date.parse(env.TRIAL_START ?? "") || 0,
    until: Date.parse(env.TRIAL_UNTIL ?? "") || Infinity,
    maxAccounts: Number(env.TRIAL_MAX_ACCOUNTS ?? 200) || 0,
    dailyAccounts: Number(env.TRIAL_DAILY_ACCOUNTS ?? 40) || 0,
  };
}

const on = (c: TrialConfig) => !!c.key && c.creditUsd > 0 && c.days > 0 && c.start > 0;

export const isTrialKey = (key: string | null | undefined, c: TrialConfig = trialConfig()) => !!key && !!c.key && key === c.key;

async function ensureTable() {
  await store.migrate();
  await store.db().execute(`CREATE TABLE IF NOT EXISTS trials (owner TEXT PRIMARY KEY, granted_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, credit_usd REAL NOT NULL, spent_usd REAL NOT NULL DEFAULT 0)`);
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
export async function grantIfEligible(owner: string, opts: { now?: number; config?: TrialConfig } = {}): Promise<Trial | null> {
  const c = opts.config ?? trialConfig();
  const now = opts.now ?? Date.now();
  const have = await trialOf(owner, now);
  if (have || !on(c) || now < c.start || now >= c.until) return have;
  const o = await store.getOwner(owner);
  if (!o?.createdAt || o.createdAt < c.start) return null;
  await ensureTable();
  const day = now - 86_400_000;
  // One statement: under both caps, once per account. Two sign-ins racing can't both get in past a cap.
  await store.db().execute({
    sql: `INSERT INTO trials(owner,granted_at,expires_at,credit_usd,spent_usd) SELECT ?, ?, ?, ?, 0 WHERE (SELECT COUNT(*) FROM trials) < ? AND (SELECT COUNT(*) FROM trials WHERE granted_at > ?) < ? AND NOT EXISTS (SELECT 1 FROM trials WHERE owner=?)`,
    args: [owner.toLowerCase(), now, now + c.days * 86_400_000, c.creditUsd, c.maxAccounts, day, c.dailyAccounts, owner.toLowerCase()],
  });
  return trialOf(owner, now);
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
