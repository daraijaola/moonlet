import { createClient, type Client } from "@libsql/client";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { KeyEvent, KeyState, TraceEvent } from "./runner";
import { EARN_PER_TOKEN_PER_DAY_USD } from "./budget";
import type { JobSpec } from "./spec";

/**
 * Storage. libsql so the same code runs against a local file in dev and Turso
 * in production. Secrets (OpenRouter key, Orbio tokens) are stored encrypted
 * at rest with SECRET_KEY; see seal/open below.
 */

export type OwnerRow = {
  address: string;
  /** The wallet-signed Orbio gateway key (sk-orb-…), sealed at rest. */
  orbioKey: string | null;
  orbioEpoch: number;
  /** Activated AI balance Moonlet can account for: verified activations minus recorded spend. An estimate. */
  orbioBalanceUsd: number;
  orbioKeySignedAt: number | null;
  bag: number;
  bagCheckedAt: number;
};

export const AVATAR_COUNT = 10;

export type MoonletRow = {
  id: string;
  owner: string;
  name: string;
  spec: JobSpec;
  status: "running" | "idle" | "paused" | "quiet" | "deleted";
  avatar: number;
  delivery: { telegram?: string; x?: string; discord?: string; email?: string };
  autopilot: boolean;
  /** Compact notes the moonlet carries between runs (last values, seen ids). */
  memory: string | null;
  /** Calls made on the last run, waiting to be scored on the next. */
  openCalls: Array<{ claim: string; check: string; madeAt: number; runId: string | null }>;
  /** Lifetime track record. */
  hits: number;
  misses: number;
  /** Tripwire probe state: last value seen for free and when. */
  watch: { value: number; at: number; tripped?: string } | null;
  /** The moonlet that spawned this one, if any. */
  parentId: string | null;
  key: KeyState;
  cadence: string;
  perRunCapUsd: number;
  earnPerDayUsd: number;
  burnPerDayUsd: number;
  nextRunAt: number;
  lastRunAt: number | null;
  createdAt: number;
  keysRotated: number;
  runsTotal: number;
  runsFailed: number;
  spentTotalUsd: number;
};

export type RunRow = {
  id: string;
  moonletId: string;
  at: number;
  status: "done" | "quiet" | "failed";
  title: string;
  summary: string;
  body: string;
  sources: string[];
  signal: string;
  nothingHappened: boolean;
  costUsd: number;
  model: string;
  modelCalls: number;
  durationMs: number;
  outputHash: string | null;
  txHash: string | null;
  keyEvents: KeyEvent[];
  trace?: TraceEvent[];
  sections?: Array<{ check: string; finding: string; changed: boolean }>;
  calls?: Array<{ claim: string; check: string }>;
  scored?: Array<{ claim: string; result: "hit" | "miss" | "void"; evidence: string }>;
  error: string | null;
  /** The run touched the owner's mailbox or a private repo: public surfaces show its receipt only. Fixed at write time. */
  private: boolean;
};

let client: Client | null = null;
let ready: Promise<void> | null = null;

export function db() {
  if (!client) {
    const url = process.env.DATABASE_URL ?? "file:./.data/moonlet.db";
    if (url.startsWith("file:")) mkdirSync(dirname(url.slice(5)), { recursive: true });
    client = createClient({
      url,
      authToken: process.env.DATABASE_AUTH_TOKEN,
    });
  }
  return client;
}

export function migrate() {
  if (ready) return ready;
  ready = (async () => {
    const c = db();
    await c.batch(
      [
        `CREATE TABLE IF NOT EXISTS owners (
          address TEXT PRIMARY KEY,
          orbio_client_id TEXT, orbio_access_token TEXT, orbio_refresh_token TEXT, orbio_expires_at INTEGER,
          bag REAL NOT NULL DEFAULT 0, bag_checked_at INTEGER NOT NULL DEFAULT 0
        )`,
        `CREATE TABLE IF NOT EXISTS moonlets (
          id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, spec TEXT NOT NULL,
          status TEXT NOT NULL, delivery TEXT NOT NULL, key TEXT,
          cadence TEXT NOT NULL, per_run_cap_usd REAL NOT NULL, earn_per_day_usd REAL NOT NULL, burn_per_day_usd REAL NOT NULL,
          next_run_at INTEGER NOT NULL, last_run_at INTEGER, created_at INTEGER NOT NULL,
          keys_rotated INTEGER NOT NULL DEFAULT 0, runs_total INTEGER NOT NULL DEFAULT 0, runs_failed INTEGER NOT NULL DEFAULT 0,
          spent_total_usd REAL NOT NULL DEFAULT 0
        )`,
        `CREATE INDEX IF NOT EXISTS moonlets_owner ON moonlets(owner)`,
        `CREATE INDEX IF NOT EXISTS moonlets_due ON moonlets(status, next_run_at)`,
        `CREATE TABLE IF NOT EXISTS runs (
          id TEXT PRIMARY KEY, moonlet_id TEXT NOT NULL, at INTEGER NOT NULL, status TEXT NOT NULL,
          title TEXT NOT NULL, summary TEXT NOT NULL, body TEXT NOT NULL, sources TEXT NOT NULL, signal TEXT NOT NULL,
          nothing_happened INTEGER NOT NULL, cost_usd REAL NOT NULL, model TEXT NOT NULL, model_calls INTEGER NOT NULL,
          duration_ms INTEGER NOT NULL, output_hash TEXT, tx_hash TEXT, key_events TEXT NOT NULL, error TEXT
        )`,
        `CREATE INDEX IF NOT EXISTS runs_moonlet ON runs(moonlet_id, at DESC)`,
        `CREATE TABLE IF NOT EXISTS oauth_states (
          state TEXT PRIMARY KEY, address TEXT NOT NULL, verifier TEXT NOT NULL, client_id TEXT NOT NULL, redirect_to TEXT NOT NULL, created_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS nonces (
          nonce TEXT PRIMARY KEY, address TEXT NOT NULL, message TEXT NOT NULL, expires_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS oauth_clients (
          redirect_uri TEXT PRIMARY KEY, client_id TEXT NOT NULL, created_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS connections (
          owner TEXT NOT NULL, kind TEXT NOT NULL, label TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL,
          PRIMARY KEY(owner, kind)
        )`,
        `CREATE TABLE IF NOT EXISTS link_codes (
          code TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, created_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS proposals (
          id TEXT PRIMARY KEY, owner TEXT NOT NULL, moonlet_id TEXT NOT NULL, run_id TEXT, kind TEXT NOT NULL, payload TEXT NOT NULL,
          status TEXT NOT NULL, result TEXT, telegram_msg TEXT, created_at INTEGER NOT NULL, decided_at INTEGER
        )`,
        `CREATE INDEX IF NOT EXISTS proposals_owner ON proposals(owner, status, created_at DESC)`,
        `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
      ],
      "write",
    );
    await c.execute(`ALTER TABLE moonlets ADD COLUMN autopilot INTEGER NOT NULL DEFAULT 0`).catch(() => undefined);
    await c.execute(`ALTER TABLE owners ADD COLUMN avatar INTEGER`).catch(() => undefined);
    await c.execute(`ALTER TABLE owners ADD COLUMN orbio_key TEXT`).catch(() => undefined);
    await c.execute(`ALTER TABLE owners ADD COLUMN orbio_epoch INTEGER NOT NULL DEFAULT 0`).catch(() => undefined);
    await c.execute(`ALTER TABLE owners ADD COLUMN orbio_balance_usd REAL NOT NULL DEFAULT 0`).catch(() => undefined);
    await c.execute(`ALTER TABLE owners ADD COLUMN orbio_key_signed_at INTEGER`).catch(() => undefined);
    await c.execute(`CREATE TABLE IF NOT EXISTS activations (tx_hash TEXT NOT NULL, activation_id TEXT NOT NULL, owner TEXT NOT NULL, from_addr TEXT NOT NULL, amount_usd REAL NOT NULL, block_number INTEGER NOT NULL, proposal_id TEXT, at INTEGER NOT NULL, PRIMARY KEY (tx_hash, activation_id))`).catch(() => undefined);
    await c.execute(`ALTER TABLE moonlets ADD COLUMN avatar INTEGER`).catch(() => undefined);
    await c.execute(`ALTER TABLE proposals ADD COLUMN verification TEXT`).catch(() => undefined);
    await c.execute(`ALTER TABLE moonlets ADD COLUMN claimed_at INTEGER`).catch(() => undefined);
    await c.execute(`ALTER TABLE proposals ADD COLUMN executing_since INTEGER`).catch(() => undefined);
    await c.execute(`UPDATE moonlets SET runs_total = (SELECT COUNT(*) FROM runs WHERE runs.moonlet_id = moonlets.id), runs_failed = (SELECT COUNT(*) FROM runs WHERE runs.moonlet_id = moonlets.id AND runs.status = 'failed')`).catch(() => undefined);
    // Every moonlet wears one of ten faces; older rows draw theirs once here.
    await c.execute(`UPDATE moonlets SET avatar = 1 + (abs(random()) % ${AVATAR_COUNT}) WHERE avatar IS NULL`).catch(() => undefined);
    await c.execute(`ALTER TABLE runs ADD COLUMN trace TEXT`).catch(() => undefined);
    await c.execute(`ALTER TABLE moonlets ADD COLUMN memory TEXT`).catch(() => undefined);
    await c.execute(`ALTER TABLE runs ADD COLUMN sections TEXT`).catch(() => undefined);
    await c.execute(`ALTER TABLE runs ADD COLUMN calls TEXT`).catch(() => undefined);
    await c.execute(`ALTER TABLE runs ADD COLUMN scored TEXT`).catch(() => undefined);
    // Privacy is a property of the run, decided when it happened, never of the job as it is edited later.
    // Runs from before this column existed are marked private conservatively: anything whose trace or job touched mail or GitHub.
    const hadPrivate = ((await c.execute(`PRAGMA table_info(runs)`)).rows as unknown as Array<{ name: string }>).some((r) => r.name === "private");
    if (!hadPrivate) {
      await c.execute(`ALTER TABLE runs ADD COLUMN private INTEGER NOT NULL DEFAULT 0`);
      await c.execute(`UPDATE runs SET private = 1 WHERE trace LIKE '%"tool":"gmail_%' OR trace LIKE '%"tool":"github_read"%' OR moonlet_id IN (SELECT id FROM moonlets WHERE spec LIKE '%gmail_%' OR spec LIKE '%github_read%')`);
    }
    await c.execute(`ALTER TABLE moonlets ADD COLUMN open_calls TEXT`).catch(() => undefined);
    await c.execute(`ALTER TABLE moonlets ADD COLUMN hits INTEGER NOT NULL DEFAULT 0`).catch(() => undefined);
    await c.execute(`ALTER TABLE moonlets ADD COLUMN misses INTEGER NOT NULL DEFAULT 0`).catch(() => undefined);
    await c.execute(`ALTER TABLE moonlets ADD COLUMN watch TEXT`).catch(() => undefined);
    await c.execute(`ALTER TABLE moonlets ADD COLUMN parent_id TEXT`).catch(() => undefined);
    await c.execute(`CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, owner TEXT NOT NULL, moonlet_id TEXT NOT NULL, run_id TEXT, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, bytes BLOB NOT NULL, created_at INTEGER NOT NULL)`).catch(() => undefined);
    await c.execute(`CREATE INDEX IF NOT EXISTS files_run ON files(run_id)`).catch(() => undefined);
    await c.execute(`CREATE TABLE IF NOT EXISTS tg_messages (chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, run_id TEXT, moonlet_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(chat_id, message_id))`).catch(() => undefined);
    await c.execute(`CREATE TABLE IF NOT EXISTS asks (id TEXT PRIMARY KEY, moonlet_id TEXT NOT NULL, owner TEXT NOT NULL, run_id TEXT, q TEXT NOT NULL, a TEXT NOT NULL, created_at INTEGER NOT NULL)`).catch(() => undefined);
    await c.execute(`CREATE INDEX IF NOT EXISTS asks_moonlet ON asks(moonlet_id, created_at DESC)`).catch(() => undefined);
  })();
  return ready;
}

export const newId = (prefix: string) => `${prefix}_${randomBytes(6).toString("base64url")}`;

// ---- owners ----------------------------------------------------------------

export async function upsertOwner(address: string) {
  await migrate();
  await db().execute({ sql: `INSERT INTO owners(address) VALUES(?) ON CONFLICT(address) DO NOTHING`, args: [address.toLowerCase()] });
}

/** Ten faces. Wallets and moonlets each draw one and keep it. */
export async function avatarOf(address: string): Promise<number> {
  await upsertOwner(address);
  const r = await db().execute({ sql: `SELECT avatar FROM owners WHERE address=?`, args: [address.toLowerCase()] });
  const have = r.rows[0]?.avatar;
  if (have != null) return Number(have);
  const pick = 1 + Math.floor(Math.random() * AVATAR_COUNT);
  await db().execute({ sql: `UPDATE owners SET avatar=? WHERE address=? AND avatar IS NULL`, args: [pick, address.toLowerCase()] });
  const again = await db().execute({ sql: `SELECT avatar FROM owners WHERE address=?`, args: [address.toLowerCase()] });
  return Number(again.rows[0]?.avatar ?? pick);
}

export async function getOwner(address: string): Promise<OwnerRow | null> {
  await migrate();
  const r = await db().execute({ sql: `SELECT * FROM owners WHERE address = ?`, args: [address.toLowerCase()] });
  const row = r.rows[0];
  if (!row) return null;
  return {
    address: row.address as string,
    orbioKey: row.orbio_key ? open(row.orbio_key as string) : null,
    orbioEpoch: Number(row.orbio_epoch ?? 0),
    orbioBalanceUsd: Number(row.orbio_balance_usd ?? 0),
    orbioKeySignedAt: row.orbio_key_signed_at == null ? null : Number(row.orbio_key_signed_at),
    bag: Number(row.bag),
    bagCheckedAt: Number(row.bag_checked_at),
  };
}

/** Store the wallet-signed gateway key. Signing again with a higher epoch rotates it. */
export async function setOwnerOrbioKey(address: string, key: string, epoch: number) {
  await upsertOwner(address);
  await db().execute({ sql: `UPDATE owners SET orbio_key=?, orbio_epoch=?, orbio_key_signed_at=? WHERE address=?`, args: [seal(key), epoch, Date.now(), address.toLowerCase()] });
}

export async function setOwnerBalance(address: string, usd: number) {
  await upsertOwner(address);
  await db().execute({ sql: `UPDATE owners SET orbio_balance_usd=? WHERE address=?`, args: [Math.max(0, usd), address.toLowerCase()] });
}

/** Subtract a run's cost from the ledger, never below zero. */
export async function debitOwnerBalance(address: string, usd: number) {
  if (!(usd > 0)) return;
  await db().execute({ sql: `UPDATE owners SET orbio_balance_usd = MAX(0, orbio_balance_usd - ?) WHERE address=?`, args: [usd, address.toLowerCase()] });
}

/**
 * Record a verified on-chain activation and credit the ledger once. The primary key makes a
 * replayed transaction a no-op, so the same receipt can never fund the balance twice.
 */
export async function addActivation(a: { txHash: string; activationId: string; owner: string; from: string; amountUsd: number; blockNumber: number; proposalId?: string | null }) {
  await migrate();
  const r = await db().execute({
    sql: `INSERT OR IGNORE INTO activations(tx_hash,activation_id,owner,from_addr,amount_usd,block_number,proposal_id,at) VALUES(?,?,?,?,?,?,?,?)`,
    args: [a.txHash.toLowerCase(), a.activationId, a.owner.toLowerCase(), a.from.toLowerCase(), a.amountUsd, a.blockNumber, a.proposalId ?? null, Date.now()],
  });
  if (r.rowsAffected !== 1) return false;
  await upsertOwner(a.owner);
  await db().execute({ sql: `UPDATE owners SET orbio_balance_usd = orbio_balance_usd + ? WHERE address=?`, args: [a.amountUsd, a.owner.toLowerCase()] });
  return true;
}

/** Wallets with at least one quiet moonlet: the ones an activation could wake. */
export async function ownersWithQuietMoonlets(): Promise<string[]> {
  await migrate();
  const r = await db().execute(`SELECT DISTINCT owner FROM moonlets WHERE status='quiet'`);
  return r.rows.map((x) => x.owner as string);
}

/** Money arrived: quiet moonlets of this wallet run on the next tick instead of waiting out their cadence. */
export async function wakeQuietMoonlets(owner: string) {
  await db().execute({ sql: `UPDATE moonlets SET next_run_at=? WHERE owner=? AND status='quiet'`, args: [Date.now(), owner.toLowerCase()] });
}

export async function listActivations(owner: string, limit = 20) {
  await migrate();
  const r = await db().execute({ sql: `SELECT * FROM activations WHERE owner=? ORDER BY block_number DESC, at DESC LIMIT ?`, args: [owner.toLowerCase(), limit] });
  return r.rows.map((row) => ({ txHash: row.tx_hash as string, activationId: row.activation_id as string, from: row.from_addr as string, amountUsd: Number(row.amount_usd), blockNumber: Number(row.block_number), proposalId: (row.proposal_id as string) ?? null, at: Number(row.at) }));
}

export async function setOwnerBag(address: string, bag: number) {
  await upsertOwner(address);
  await db().execute({ sql: `UPDATE owners SET bag=?, bag_checked_at=? WHERE address=?`, args: [bag, Date.now(), address.toLowerCase()] });
}

export async function clearOwnerOrbio(address: string) {
  await db().execute({ sql: `UPDATE owners SET orbio_key=NULL, orbio_key_signed_at=NULL WHERE address=?`, args: [address.toLowerCase()] });
}

// ---- sign-in nonces -------------------------------------------------------

/** A nonce is minted with the exact message the wallet must sign; redeeming it returns that message once, then it is gone. */
export async function saveNonce(nonce: string, address: string, message: string, ttlMs = 10 * 60_000) {
  await migrate();
  await db().execute({ sql: `INSERT INTO nonces(nonce,address,message,expires_at) VALUES(?,?,?,?)`, args: [nonce, address.toLowerCase(), message, Date.now() + ttlMs] });
  await db().execute({ sql: `DELETE FROM nonces WHERE expires_at < ?`, args: [Date.now()] });
}
export async function takeNonce(nonce: string): Promise<{ address: string; message: string } | null> {
  await migrate();
  const r = await db().execute({ sql: `SELECT * FROM nonces WHERE nonce=?`, args: [nonce] });
  const row = r.rows[0];
  const del = await db().execute({ sql: `DELETE FROM nonces WHERE nonce=?`, args: [nonce] });
  if (!row || del.rowsAffected !== 1 || Number(row.expires_at) < Date.now()) return null;
  return { address: row.address as string, message: row.message as string };
}

// ---- oauth state -----------------------------------------------------------

export async function saveOauthState(s: { state: string; address: string; verifier: string; clientId: string; redirectTo: string; redirectUri: string }) {
  await migrate();
  await db().execute({
    sql: `INSERT INTO oauth_states(state,address,verifier,client_id,redirect_to,created_at) VALUES(?,?,?,?,?,?)`,
    args: [s.state, s.address.toLowerCase(), s.verifier, s.clientId, JSON.stringify({ to: s.redirectTo, uri: s.redirectUri }), Date.now()],
  });
}

/** One Orbio OAuth client per redirect_uri, registered once and reused. */

export const OAUTH_STATE_TTL_MS = 10 * 60_000;

/**
 * Redeem an OAuth state exactly once. `provider` is the prefix the flow minted (`gm_`, `gh_`, `ob_`), so a Gmail code cannot be
 * redeemed on the GitHub callback; `sessionOwner` is the wallet signed in on the browser that hit the callback, and it must be
 * the wallet that started the flow, so a forwarded authorization link cannot attach an account to someone else's wallet.
 * A stale, replayed, wrong-provider or wrong-session state returns null and is deleted.
 */
export async function takeOauthState(state: string, provider: string, sessionOwner: string | null) {
  await migrate();
  const r = await db().execute({ sql: `SELECT * FROM oauth_states WHERE state=?`, args: [state] });
  const row = r.rows[0];
  // Single use: whoever deletes the row wins; a concurrent second redemption sees rowsAffected 0.
  const del = await db().execute({ sql: `DELETE FROM oauth_states WHERE state=?`, args: [state] });
  await db().execute({ sql: `DELETE FROM oauth_states WHERE created_at < ?`, args: [Date.now() - OAUTH_STATE_TTL_MS] });
  if (!row || del.rowsAffected !== 1) return null;
  if (!state.startsWith(provider)) return null;
  if (Date.now() - Number(row.created_at) > OAUTH_STATE_TTL_MS) return null;
  if (!sessionOwner || sessionOwner.toLowerCase() !== (row.address as string).toLowerCase()) return null;
  let redirectTo = row.redirect_to as string, redirectUri = "";
  try {
    const j = JSON.parse(redirectTo) as { to: string; uri: string };
    redirectTo = j.to;
    redirectUri = j.uri;
  } catch {}
  return { address: row.address as string, verifier: row.verifier as string, clientId: row.client_id as string, redirectTo, redirectUri };
}

// ---- moonlets --------------------------------------------------------------

function rowToMoonlet(row: Record<string, unknown>): MoonletRow {
  return {
    id: row.id as string,
    owner: row.owner as string,
    name: row.name as string,
    spec: JSON.parse(row.spec as string),
    status: row.status as MoonletRow["status"],
    avatar: Number(row.avatar ?? 1),
    delivery: JSON.parse(row.delivery as string),
    autopilot: !!row.autopilot,
    memory: (row.memory as string | null) ?? null,
    openCalls: row.open_calls ? JSON.parse(row.open_calls as string) : [],
    hits: Number(row.hits ?? 0),
    misses: Number(row.misses ?? 0),
    watch: row.watch ? JSON.parse(row.watch as string) : null,
    parentId: (row.parent_id as string | null) ?? null,
    key: row.key ? (JSON.parse(open(row.key as string)) as KeyState) : null,
    cadence: row.cadence as string,
    perRunCapUsd: Number(row.per_run_cap_usd),
    earnPerDayUsd: Number(row.earn_per_day_usd),
    burnPerDayUsd: Number(row.burn_per_day_usd),
    nextRunAt: Number(row.next_run_at),
    lastRunAt: row.last_run_at === null ? null : Number(row.last_run_at),
    createdAt: Number(row.created_at),
    keysRotated: Number(row.keys_rotated),
    runsTotal: Number(row.runs_total),
    runsFailed: Number(row.runs_failed),
    spentTotalUsd: Number(row.spent_total_usd),
  };
}

/** Insert a moonlet. With `maxPerOwner`, the count check and the insert are one statement, so two launches racing at the cap cannot both land. Returns false when the cap held. */
export async function insertMoonlet(m: Omit<MoonletRow, "keysRotated" | "runsTotal" | "runsFailed" | "spentTotalUsd" | "lastRunAt" | "autopilot" | "memory" | "parentId" | "openCalls" | "hits" | "misses" | "watch" | "avatar"> & { autopilot?: boolean; parentId?: string | null; avatar?: number }, opts: { maxPerOwner?: number } = {}) {
  await migrate();
  const args = [
    m.id, m.owner.toLowerCase(), m.name, JSON.stringify(m.spec), m.status, JSON.stringify(m.delivery), m.autopilot ? 1 : 0,
    m.key ? seal(JSON.stringify(m.key)) : null, m.cadence, m.perRunCapUsd, m.earnPerDayUsd, m.burnPerDayUsd, m.nextRunAt, m.createdAt, m.parentId ?? null,
    m.avatar ?? 1 + Math.floor(Math.random() * AVATAR_COUNT),
  ];
  const cols = `id,owner,name,spec,status,delivery,autopilot,key,cadence,per_run_cap_usd,earn_per_day_usd,burn_per_day_usd,next_run_at,created_at,parent_id,avatar`;
  if (opts.maxPerOwner == null) {
    await db().execute({ sql: `INSERT INTO moonlets(${cols}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, args });
    return true;
  }
  const r = await db().execute({
    sql: `INSERT INTO moonlets(${cols}) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM moonlets WHERE owner=? AND status != 'deleted') < ?`,
    args: [...args, m.owner.toLowerCase(), opts.maxPerOwner],
  });
  return r.rowsAffected === 1;
}

export async function getMoonlet(id: string) {
  await migrate();
  const r = await db().execute({ sql: `SELECT * FROM moonlets WHERE id=? AND status != 'deleted'`, args: [id] });
  return r.rows[0] ? rowToMoonlet(r.rows[0] as Record<string, unknown>) : null;
}

export async function listMoonlets(owner?: string) {
  await migrate();
  const r = owner
    ? await db().execute({ sql: `SELECT * FROM moonlets WHERE owner=? AND status != 'deleted' ORDER BY created_at DESC`, args: [owner.toLowerCase()] })
    : await db().execute(`SELECT * FROM moonlets WHERE status != 'deleted' ORDER BY created_at DESC`);
  return r.rows.map((x) => rowToMoonlet(x as Record<string, unknown>));
}

export async function listDue(now = Date.now(), limit = 20) {
  await migrate();
  const r = await db().execute({
    sql: `SELECT * FROM moonlets WHERE status IN ('idle','quiet') AND next_run_at <= ? ORDER BY next_run_at ASC LIMIT ?`,
    args: [now, limit],
  });
  return r.rows.map((x) => rowToMoonlet(x as Record<string, unknown>));
}

export async function updateMoonlet(id: string, patch: Partial<MoonletRow>) {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  const map: Record<string, (v: never) => string | number | null> = {
    name: (v) => v,
    spec: (v) => JSON.stringify(v),
    status: (v) => v,
    delivery: (v) => JSON.stringify(v),
    autopilot: (v) => (v ? 1 : 0),
    memory: (v) => v,
    openCalls: (v) => JSON.stringify(v ?? []),
    hits: (v) => v,
    misses: (v) => v,
    watch: (v) => (v ? JSON.stringify(v) : null),
    key: (v) => (v ? seal(JSON.stringify(v)) : null),
    cadence: (v) => v,
    perRunCapUsd: (v) => v,
    earnPerDayUsd: (v) => v,
    burnPerDayUsd: (v) => v,
    nextRunAt: (v) => v,
    lastRunAt: (v) => v,
    keysRotated: (v) => v,
    runsTotal: (v) => v,
    runsFailed: (v) => v,
    spentTotalUsd: (v) => v,
  };
  const cols: Record<string, string> = {
    name: "name", spec: "spec", status: "status", delivery: "delivery", autopilot: "autopilot", memory: "memory", key: "key", cadence: "cadence",
    perRunCapUsd: "per_run_cap_usd", earnPerDayUsd: "earn_per_day_usd", burnPerDayUsd: "burn_per_day_usd",
    nextRunAt: "next_run_at", lastRunAt: "last_run_at", keysRotated: "keys_rotated", runsTotal: "runs_total",
    runsFailed: "runs_failed", spentTotalUsd: "spent_total_usd", openCalls: "open_calls", hits: "hits", misses: "misses", watch: "watch",
  };
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in cols) || v === undefined) continue;
    sets.push(`${cols[k]}=?`);
    args.push(map[k](v as never));
  }
  if (!sets.length) return;
  args.push(id);
  // A moonlet deleted while its run was in flight stays deleted: the run's finish must not bring it back with a key and a next run.
  await db().execute({ sql: `UPDATE moonlets SET ${sets.join(",")} WHERE id=? AND (status != 'deleted' OR ? = 'deleted')`, args: [...args, patch.status ?? ""] });
}

/** Pause / resume, refused while a run is in flight (the run's own finish would otherwise overwrite or be overwritten). */
export async function setStatusIfNotRunning(id: string, status: "paused" | "idle", nextRunAt?: number) {
  const r = await db().execute({
    sql: nextRunAt == null ? `UPDATE moonlets SET status=? WHERE id=? AND status != 'running' AND status != 'deleted'` : `UPDATE moonlets SET status=?, next_run_at=? WHERE id=? AND status != 'running' AND status != 'deleted'`,
    args: nextRunAt == null ? [status, id] : [status, nextRunAt, id],
  });
  return r.rowsAffected === 1;
}

/** "Run now": claim immediately, but only if nothing else is running it. One statement, so two buttons can't both win. */
export async function claimNow(id: string, now = Date.now()) {
  const r = await db().execute({ sql: `UPDATE moonlets SET status='running', next_run_at=? WHERE id=? AND status IN ('idle','quiet','paused')`, args: [now, id] });
  return r.rowsAffected === 1;
}

/** A moonlet left in "running" for too long (crashed worker) goes back to idle. */
/** A run that has held its claim longer than `olderThan` is presumed dead (process restart); release it. Judged by the claim's own timestamp, never by the previous run's. */
export async function releaseStale(olderThan: number) {
  await migrate();
  await db().execute({
    sql: `UPDATE moonlets SET status='idle', claimed_at=NULL WHERE status='running' AND claimed_at IS NOT NULL AND claimed_at < ?`,
    args: [olderThan],
  });
}

/** Atomically claim a due moonlet for a run so two cron ticks can't double-run it. Stamps the claim so staleness is measured from it. */
export async function claimForRun(id: string, now = Date.now()) {
  const r = await db().execute({
    sql: `UPDATE moonlets SET status='running', claimed_at=? WHERE id=? AND status IN ('idle','quiet') AND next_run_at <= ?`,
    args: [now, id, now],
  });
  return r.rowsAffected === 1;
}

/** Actions left in 'executing' longer than `olderThan` (process died mid-action) become 'uncertain' for the owner to check; nothing is retried. */
export async function reconcileStuckActions(olderThan: number) {
  await migrate();
  const r = await db().execute({
    sql: `UPDATE proposals SET status='uncertain', result=json_object('error','the process stopped while this was executing; it may or may not have gone through. Check at the provider before approving again. Nothing was retried.') WHERE status='executing' AND executing_since IS NOT NULL AND executing_since < ?`,
    args: [olderThan],
  });
  return r.rowsAffected;
}

// ---- runs ------------------------------------------------------------------

export async function insertRun(r: Omit<RunRow, "private"> & { private?: boolean }) {
  await migrate();
  await db().execute({
    sql: `INSERT INTO runs(id,moonlet_id,at,status,title,summary,body,sources,signal,nothing_happened,cost_usd,model,model_calls,duration_ms,output_hash,tx_hash,key_events,error,trace,sections,calls,scored,private)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      r.id, r.moonletId, r.at, r.status, r.title, r.summary, r.body, JSON.stringify(r.sources), r.signal, r.nothingHappened ? 1 : 0,
      r.costUsd, r.model, r.modelCalls, r.durationMs, r.outputHash, r.txHash, JSON.stringify(r.keyEvents), r.error, JSON.stringify(r.trace ?? []), JSON.stringify(r.sections ?? []),
      JSON.stringify(r.calls ?? []), JSON.stringify(r.scored ?? []), r.private ? 1 : 0,
    ],
  });
  // The counter on the moonlet is the number of run rows, whichever path wrote them, so no two surfaces can disagree.
  await db().execute({ sql: `UPDATE moonlets SET runs_total = (SELECT COUNT(*) FROM runs WHERE moonlet_id = ?), runs_failed = (SELECT COUNT(*) FROM runs WHERE moonlet_id = ? AND status = 'failed') WHERE id = ?`, args: [r.moonletId, r.moonletId, r.moonletId] });
}

export async function setRunTx(id: string, txHash: string) {
  const r = await db().execute({ sql: `UPDATE runs SET tx_hash=? WHERE id=? AND tx_hash IS NULL`, args: [txHash, id] });
  return r.rowsAffected === 1;
}

function rowToRun(row: Record<string, unknown>): RunRow {
  return {
    id: row.id as string,
    moonletId: row.moonlet_id as string,
    at: Number(row.at),
    status: row.status as RunRow["status"],
    private: Number(row.private ?? 0) === 1,
    title: row.title as string,
    summary: row.summary as string,
    body: row.body as string,
    sources: JSON.parse(row.sources as string),
    signal: row.signal as string,
    nothingHappened: !!row.nothing_happened,
    costUsd: Number(row.cost_usd),
    model: row.model as string,
    modelCalls: Number(row.model_calls),
    durationMs: Number(row.duration_ms),
    outputHash: (row.output_hash as string) ?? null,
    txHash: (row.tx_hash as string) ?? null,
    keyEvents: JSON.parse(row.key_events as string),
    trace: row.trace ? JSON.parse(row.trace as string) : [],
    sections: row.sections ? JSON.parse(row.sections as string) : [],
    calls: row.calls ? JSON.parse(row.calls as string) : [],
    scored: row.scored ? JSON.parse(row.scored as string) : [],
    error: (row.error as string) ?? null,
  };
}

export async function getRun(id: string) {
  await migrate();
  const r = await db().execute({ sql: `SELECT * FROM runs WHERE id=?`, args: [id] });
  return r.rows[0] ? rowToRun(r.rows[0] as Record<string, unknown>) : null;
}

/** Finished runs that have a hash but no chain receipt yet. */
export async function deleteRun(id: string) {
  await db().execute({ sql: `DELETE FROM runs WHERE id=?`, args: [id] });
}

export async function listUnanchored(limit = 20): Promise<RunRow[]> {
  await migrate();
  const r = await db().execute({
    sql: `SELECT * FROM runs WHERE status='done' AND output_hash IS NOT NULL AND tx_hash IS NULL ORDER BY at ASC LIMIT ?`,
    args: [limit],
  });
  return r.rows.map((row) => rowToRun(row as Record<string, unknown>));
}

export async function listRuns(moonletId: string, limit = 50): Promise<RunRow[]> {
  await migrate();
  const r = await db().execute({ sql: `SELECT * FROM runs WHERE moonlet_id=? ORDER BY at DESC LIMIT ?`, args: [moonletId, limit] });
  return r.rows.map((row) => rowToRun(row as Record<string, unknown>));
}

export async function skyStats() {
  await migrate();
  const c = db();
  const [m, r, ownersRow, spentRow] = await Promise.all([
    c.execute(`SELECT
        SUM(CASE WHEN status IN ('running','idle') THEN 1 ELSE 0 END) AS alive,
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ('running','idle') THEN earn_per_day_usd ELSE 0 END) AS earn,
        SUM(CASE WHEN status IN ('running','idle') THEN burn_per_day_usd ELSE 0 END) AS burn,
        SUM(spent_total_usd) AS spent
      FROM moonlets WHERE status != 'deleted'`),
    c.execute({ sql: `SELECT COUNT(*) AS today, SUM(CASE WHEN tx_hash IS NOT NULL THEN 1 ELSE 0 END) AS anchored FROM runs WHERE at >= ?`, args: [Date.now() - 86_400_000] }),
    c.execute(`SELECT COUNT(*) AS bags, COALESCE(SUM(bag),0) AS tokens FROM owners WHERE bag >= 1000 AND address IN (SELECT DISTINCT owner FROM moonlets WHERE status != 'deleted')`),
    c.execute(`SELECT COALESCE(SUM(cost_usd),0) AS spent, COUNT(*) AS runs FROM runs WHERE status = 'done'`),
  ]);
  const a = m.rows[0], b = r.rows[0], o = ownersRow.rows[0], s = spentRow.rows[0];
  const tokens = Number(o?.tokens ?? 0);
  return {
    alive: Number(a?.alive ?? 0),
    total: Number(a?.total ?? 0),
    // Credits the bags behind live moonlets earn per day (one bag can fund several moonlets, so this is per owner, not per moonlet).
    creditsPerDay: tokens * EARN_PER_TOKEN_PER_DAY_USD,
    burnPerDay: Number(a?.burn ?? 0),
    spentTotalUsd: Number(s?.spent ?? 0),
    runsTotal: Number(s?.runs ?? 0),
    bags: Number(o?.bags ?? 0),
    tokens,
    runsToday: Number(b?.today ?? 0),
    anchoredToday: Number(b?.anchored ?? 0),
  };
}

// ---- connections -----------------------------------------------------------

export type ConnectionKind = "telegram" | "github" | "x" | "discord" | "gmail";
export type ConnectionRow<T = Record<string, unknown>> = { owner: string; kind: ConnectionKind; label: string; data: T; createdAt: number };

export async function setConnection(owner: string, kind: ConnectionKind, label: string, data: Record<string, unknown>) {
  await migrate();
  await db().execute({
    sql: `INSERT OR REPLACE INTO connections(owner,kind,label,data,created_at) VALUES(?,?,?,?,?)`,
    args: [owner.toLowerCase(), kind, label, seal(JSON.stringify(data)), Date.now()],
  });
  // A moonlet parked because this connection was missing gets its next run now instead of waiting out the hour.
  if (kind === "github" || kind === "gmail") {
    for (const m of await listMoonlets(owner)) {
      if (m.status !== "quiet" || !m.spec.tools.some((t) => (kind === "gmail" ? t.startsWith("gmail_") : t === "github_read" || t === "open_pull_request" || t === "comment_on_issue" || t === "open_issue"))) continue;
      const last = (await listRuns(m.id, 1))[0];
      if (last?.status === "quiet" && /isn't connected/.test(last.error ?? "")) await updateMoonlet(m.id, { status: "idle", nextRunAt: Date.now() });
    }
  }
}

export async function getConnection<T = Record<string, unknown>>(owner: string, kind: ConnectionKind): Promise<ConnectionRow<T> | null> {
  await migrate();
  const r = await db().execute({ sql: `SELECT * FROM connections WHERE owner=? AND kind=?`, args: [owner.toLowerCase(), kind] });
  const row = r.rows[0];
  if (!row) return null;
  return { owner: row.owner as string, kind, label: row.label as string, data: JSON.parse(open(row.data as string)) as T, createdAt: Number(row.created_at) };
}

export async function listConnections(owner: string) {
  await migrate();
  const r = await db().execute({ sql: `SELECT owner, kind, label, created_at FROM connections WHERE owner=?`, args: [owner.toLowerCase()] });
  return r.rows.map((row) => ({ kind: row.kind as ConnectionKind, label: row.label as string, createdAt: Number(row.created_at) }));
}

/** Every connection of one kind, data opened. Small table; used to map a Telegram chat back to its wallet. */
export async function connectionsOfKind<T = Record<string, unknown>>(kind: ConnectionKind): Promise<ConnectionRow<T>[]> {
  await migrate();
  const r = await db().execute({ sql: `SELECT * FROM connections WHERE kind=?`, args: [kind] });
  return r.rows.map((row) => ({ owner: row.owner as string, kind, label: row.label as string, data: JSON.parse(open(row.data as string)) as T, createdAt: Number(row.created_at) }));
}

export async function deleteConnection(owner: string, kind: ConnectionKind) {
  await db().execute({ sql: `DELETE FROM connections WHERE owner=? AND kind=?`, args: [owner.toLowerCase(), kind] });
}

export async function saveLinkCode(code: string, owner: string, kind: ConnectionKind) {
  await migrate();
  await db().execute({ sql: `INSERT OR REPLACE INTO link_codes(code,owner,kind,created_at) VALUES(?,?,?,?)`, args: [code, owner.toLowerCase(), kind, Date.now()] });
}

export async function takeLinkCode(code: string) {
  await migrate();
  const r = await db().execute({ sql: `SELECT * FROM link_codes WHERE code=? AND created_at > ?`, args: [code, Date.now() - 30 * 60_000] });
  const row = r.rows[0];
  await db().execute({ sql: `DELETE FROM link_codes WHERE code=? OR created_at < ?`, args: [code, Date.now() - 30 * 60_000] });
  return row ? { owner: row.owner as string, kind: row.kind as ConnectionKind } : null;
}

// ---- proposals (draft → approve → act) --------------------------------------

export type ProposalKind = "tweet" | "pull_request" | "issue_comment" | "spawn_moonlet" | "email_send" | "email_organize" | "email_forward" | "issue_create" | "activate_credit";
export type ProposalStatus = "pending" | "approved" | "executing" | "rejected" | "executed" | "failed" | "uncertain";
export type ProposalRow = {
  id: string;
  owner: string;
  moonletId: string;
  runId: string | null;
  kind: ProposalKind;
  payload: Record<string, unknown>;
  status: ProposalStatus;
  result: Record<string, unknown> | null;
  /** Read-back of the executed action against the approved payload (see verify.ts). */
  verification: { status: "verified" | "mismatch" | "unchecked"; scope: "complete" | "sample"; url?: string; checks: Array<{ field: string; expected: string; actual: string; ok: boolean }>; reason?: string; at: number } | null;
  telegramMsg: { chatId: string; messageId: number } | null;
  createdAt: number;
  decidedAt: number | null;
};

function rowToProposal(row: Record<string, unknown>): ProposalRow {
  return {
    id: row.id as string,
    owner: row.owner as string,
    moonletId: row.moonlet_id as string,
    runId: (row.run_id as string) ?? null,
    kind: row.kind as ProposalKind,
    payload: JSON.parse(row.payload as string),
    status: row.status as ProposalStatus,
    result: row.result ? JSON.parse(row.result as string) : null,
    verification: row.verification ? JSON.parse(row.verification as string) : null,
    telegramMsg: row.telegram_msg ? JSON.parse(row.telegram_msg as string) : null,
    createdAt: Number(row.created_at),
    decidedAt: row.decided_at === null ? null : Number(row.decided_at),
  };
}

export async function insertProposal(p: { id: string; owner: string; moonletId: string; runId: string | null; kind: ProposalKind; payload: Record<string, unknown> }) {
  await migrate();
  await db().execute({
    sql: `INSERT INTO proposals(id,owner,moonlet_id,run_id,kind,payload,status,created_at) VALUES(?,?,?,?,?,?,'pending',?)`,
    args: [p.id, p.owner.toLowerCase(), p.moonletId, p.runId, p.kind, JSON.stringify(p.payload), Date.now()],
  });
}

export async function getProposal(id: string) {
  await migrate();
  const r = await db().execute({ sql: `SELECT * FROM proposals WHERE id=?`, args: [id] });
  return r.rows[0] ? rowToProposal(r.rows[0] as Record<string, unknown>) : null;
}

/** Withdraw every pending draft of one moonlet; returns how many. */
export async function rejectPendingProposals(moonletId: string) {
  await migrate();
  const r = await db().execute({ sql: `UPDATE proposals SET status='rejected', decided_at=? WHERE moonlet_id=? AND status='pending'`, args: [Date.now(), moonletId] });
  return r.rowsAffected;
}

/** Actions a moonlet has taken (or tried), newest first, for the receipts list. */
export async function listActions(moonletId: string, limit = 20) {
  await migrate();
  const r = await db().execute({ sql: `SELECT * FROM proposals WHERE moonlet_id=? AND status IN ('executed','failed','uncertain') ORDER BY decided_at DESC, created_at DESC LIMIT ?`, args: [moonletId, limit] });
  return r.rows.map((x) => rowToProposal(x as Record<string, unknown>));
}

export async function listProposals(owner: string, status?: ProposalStatus, limit = 50) {
  await migrate();
  const r = status
    ? await db().execute({ sql: `SELECT * FROM proposals WHERE owner=? AND status=? ORDER BY created_at DESC LIMIT ?`, args: [owner.toLowerCase(), status, limit] })
    : await db().execute({ sql: `SELECT * FROM proposals WHERE owner=? ORDER BY created_at DESC LIMIT ?`, args: [owner.toLowerCase(), limit] });
  return r.rows.map((x) => rowToProposal(x as Record<string, unknown>));
}

/** Atomically move pending → approved/rejected. Returns false if it wasn't pending. */
export async function decideProposal(id: string, status: "approved" | "rejected") {
  const r = await db().execute({ sql: `UPDATE proposals SET status=?, decided_at=? WHERE id=? AND status='pending'`, args: [status, Date.now(), id] });
  return r.rowsAffected === 1;
}

/** Take the execution lease: only one caller moves approved → executing, so a double tap or two ticks cannot act twice. */
export async function leaseProposal(id: string) {
  const r = await db().execute({ sql: `UPDATE proposals SET status='executing', executing_since=? WHERE id=? AND status='approved'`, args: [Date.now(), id] });
  return r.rowsAffected === 1;
}

export async function setProposalVerification(id: string, v: ProposalRow["verification"]) {
  await db().execute({ sql: `UPDATE proposals SET verification=? WHERE id=?`, args: [JSON.stringify(v), id] });
}

export async function finishProposal(id: string, status: "executed" | "failed" | "uncertain", result: Record<string, unknown>) {
  await db().execute({ sql: `UPDATE proposals SET status=?, result=? WHERE id=? AND status='executing'`, args: [status, JSON.stringify(result), id] });
}

/** Remember which Telegram message carried which report, so a reply can be routed to it. */
// ---- composer conversations (web) --------------------------------------------

export async function saveAsk(a: { moonletId: string; owner: string; runId: string | null; q: string; a: string }) {
  await migrate();
  await db().execute({ sql: `INSERT INTO asks(id,moonlet_id,owner,run_id,q,a,created_at) VALUES(?,?,?,?,?,?,?)`, args: [newId("ask"), a.moonletId, a.owner.toLowerCase(), a.runId, a.q, a.a, Date.now()] });
}

/** The owner's conversation with one moonlet, oldest first. */
export async function listAsks(moonletId: string, limit = 30) {
  await migrate();
  const r = await db().execute({ sql: `SELECT q, a, run_id, created_at FROM asks WHERE moonlet_id=? ORDER BY created_at DESC LIMIT ?`, args: [moonletId, limit] });
  return r.rows.reverse().map((x) => ({ q: x.q as string, a: x.a as string, runId: (x.run_id as string | null) ?? undefined, at: Number(x.created_at) }));
}

export async function rememberTelegramMessage(chatId: string, messageId: number, moonletId: string, runId: string | null) {
  await migrate();
  await db().execute({ sql: `INSERT OR REPLACE INTO tg_messages(chat_id,message_id,run_id,moonlet_id,created_at) VALUES(?,?,?,?,?)`, args: [chatId, messageId, runId, moonletId, Date.now()] });
}
export async function telegramMessageRef(chatId: string, messageId: number): Promise<{ moonletId: string; runId: string | null } | null> {
  await migrate();
  const r = await db().execute({ sql: `SELECT moonlet_id, run_id FROM tg_messages WHERE chat_id=? AND message_id=?`, args: [chatId, messageId] });
  const row = r.rows[0];
  return row ? { moonletId: row.moonlet_id as string, runId: (row.run_id as string | null) ?? null } : null;
}
/** The last report this chat received, for replies that aren't threaded. */
export async function lastTelegramRef(chatId: string): Promise<{ moonletId: string; runId: string | null } | null> {
  await migrate();
  const r = await db().execute({ sql: `SELECT moonlet_id, run_id FROM tg_messages WHERE chat_id=? ORDER BY created_at DESC LIMIT 1`, args: [chatId] });
  const row = r.rows[0];
  return row ? { moonletId: row.moonlet_id as string, runId: (row.run_id as string | null) ?? null } : null;
}

export async function setProposalTelegram(id: string, msg: { chatId: string; messageId: number }) {
  await db().execute({ sql: `UPDATE proposals SET telegram_msg=? WHERE id=?`, args: [JSON.stringify(msg), id] });
}

export async function kvGet(k: string) {
  await migrate();
  const r = await db().execute({ sql: `SELECT v FROM kv WHERE k=?`, args: [k] });
  return (r.rows[0]?.v as string) ?? null;
}
export async function kvSet(k: string, v: string) {
  await migrate();
  await db().execute({ sql: `INSERT OR REPLACE INTO kv(k,v) VALUES(?,?)`, args: [k, v] });
}

// ---- secrets at rest -------------------------------------------------------

import { createCipheriv, createDecipheriv, createHash } from "node:crypto";

function secretKey() {
  const s = process.env.SECRET_KEY;
  if (!s && process.env.NODE_ENV === "production") throw new Error("SECRET_KEY is required in production");
  return createHash("sha256").update(s ?? "moonlet-dev-only-not-secret").digest();
}

export function seal(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${enc.toString("base64url")}.${c.getAuthTag().toString("base64url")}`;
}

export function open(sealed: string) {
  const [v, iv, enc, tag] = sealed.split(".");
  if (v !== "v1") throw new Error("bad sealed value");
  const d = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
}

// ---- files a moonlet wrote (reports as PDF/DOCX/TXT), kept on the run ---------

export type FileMeta = { id: string; owner: string; moonletId: string; runId: string | null; name: string; mime: string; size: number; createdAt: number };

export async function saveFile(f: { owner: string; moonletId: string; runId: string | null; name: string; mime: string; bytes: Uint8Array }): Promise<FileMeta> {
  await migrate();
  const id = newId("f");
  const createdAt = Date.now();
  await db().execute({
    sql: `INSERT INTO files(id,owner,moonlet_id,run_id,name,mime,size,bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
    args: [id, f.owner.toLowerCase(), f.moonletId, f.runId, f.name, f.mime, f.bytes.byteLength, f.bytes, createdAt],
  });
  return { id, owner: f.owner.toLowerCase(), moonletId: f.moonletId, runId: f.runId, name: f.name, mime: f.mime, size: f.bytes.byteLength, createdAt };
}

export async function getFile(id: string): Promise<(FileMeta & { bytes: Uint8Array }) | null> {
  await migrate();
  const r = await db().execute({ sql: `SELECT * FROM files WHERE id=?`, args: [id] });
  const row = r.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const raw = row.bytes as ArrayBuffer | Uint8Array;
  return { ...fileMeta(row), bytes: raw instanceof Uint8Array ? raw : new Uint8Array(raw) };
}

/** Files attached to any of these runs, newest first; a run with none simply has no entry. */
export async function filesForRuns(runIds: string[]): Promise<Record<string, FileMeta[]>> {
  await migrate();
  if (!runIds.length) return {};
  const r = await db().execute({ sql: `SELECT id,owner,moonlet_id,run_id,name,mime,size,created_at FROM files WHERE run_id IN (${runIds.map(() => "?").join(",")}) ORDER BY created_at DESC`, args: runIds });
  const out: Record<string, FileMeta[]> = {};
  for (const row of r.rows as unknown as Record<string, unknown>[]) {
    const m = fileMeta(row);
    (out[m.runId ?? ""] ??= []).push(m);
  }
  return out;
}

/** Everything a moonlet has ever written, newest first, with the run each came from. */
export async function filesForMoonlet(moonletId: string): Promise<Array<FileMeta & { runTitle: string | null; runAt: number | null }>> {
  await migrate();
  const r = await db().execute({
    sql: `SELECT f.id,f.owner,f.moonlet_id,f.run_id,f.name,f.mime,f.size,f.created_at, r.title AS run_title, r.at AS run_at FROM files f LEFT JOIN runs r ON r.id=f.run_id WHERE f.moonlet_id=? ORDER BY f.created_at DESC LIMIT 200`,
    args: [moonletId],
  });
  return (r.rows as unknown as Record<string, unknown>[]).map((row) => ({ ...fileMeta(row), runTitle: (row.run_title as string | null) ?? null, runAt: row.run_at == null ? null : Number(row.run_at) }));
}

function fileMeta(row: Record<string, unknown>): FileMeta {
  return { id: row.id as string, owner: row.owner as string, moonletId: row.moonlet_id as string, runId: (row.run_id as string | null) ?? null, name: row.name as string, mime: row.mime as string, size: Number(row.size), createdAt: Number(row.created_at) };
}
