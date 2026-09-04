import { createClient, type Client } from "@libsql/client";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { KeyEvent, KeyState } from "./runner";
import type { JobSpec } from "./spec";

/**
 * Storage. libsql so the same code runs against a local file in dev and Turso
 * in production. Secrets (OpenRouter key, Orbio tokens) are stored encrypted
 * at rest with SECRET_KEY; see seal/open below.
 */

export type OwnerRow = {
  address: string;
  orbioClientId: string | null;
  orbioAccessToken: string | null;
  orbioRefreshToken: string | null;
  orbioExpiresAt: number | null;
  bag: number;
  bagCheckedAt: number;
};

export type MoonletRow = {
  id: string;
  owner: string;
  name: string;
  spec: JobSpec;
  status: "running" | "idle" | "paused" | "quiet" | "deleted";
  delivery: { telegram?: string; x?: string };
  autopilot: boolean;
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
  error: string | null;
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
  })();
  return ready;
}

export const newId = (prefix: string) => `${prefix}_${randomBytes(6).toString("base64url")}`;

// ---- owners ----------------------------------------------------------------

export async function upsertOwner(address: string) {
  await migrate();
  await db().execute({ sql: `INSERT INTO owners(address) VALUES(?) ON CONFLICT(address) DO NOTHING`, args: [address.toLowerCase()] });
}

export async function getOwner(address: string): Promise<OwnerRow | null> {
  await migrate();
  const r = await db().execute({ sql: `SELECT * FROM owners WHERE address = ?`, args: [address.toLowerCase()] });
  const row = r.rows[0];
  if (!row) return null;
  return {
    address: row.address as string,
    orbioClientId: (row.orbio_client_id as string) ?? null,
    orbioAccessToken: row.orbio_access_token ? open(row.orbio_access_token as string) : null,
    orbioRefreshToken: row.orbio_refresh_token ? open(row.orbio_refresh_token as string) : null,
    orbioExpiresAt: (row.orbio_expires_at as number) ?? null,
    bag: Number(row.bag),
    bagCheckedAt: Number(row.bag_checked_at),
  };
}

export async function setOwnerOrbio(address: string, t: { clientId: string; accessToken: string; refreshToken?: string; expiresAt?: number }) {
  await upsertOwner(address);
  await db().execute({
    sql: `UPDATE owners SET orbio_client_id=?, orbio_access_token=?, orbio_refresh_token=?, orbio_expires_at=? WHERE address=?`,
    args: [t.clientId, seal(t.accessToken), t.refreshToken ? seal(t.refreshToken) : null, t.expiresAt ?? null, address.toLowerCase()],
  });
}

export async function setOwnerBag(address: string, bag: number) {
  await upsertOwner(address);
  await db().execute({ sql: `UPDATE owners SET bag=?, bag_checked_at=? WHERE address=?`, args: [bag, Date.now(), address.toLowerCase()] });
}

export async function clearOwnerOrbio(address: string) {
  await db().execute({ sql: `UPDATE owners SET orbio_access_token=NULL, orbio_refresh_token=NULL, orbio_expires_at=NULL WHERE address=?`, args: [address.toLowerCase()] });
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
export async function getOauthClient(redirectUri: string) {
  await migrate();
  const r = await db().execute({ sql: `SELECT client_id FROM oauth_clients WHERE redirect_uri=?`, args: [redirectUri] });
  return (r.rows[0]?.client_id as string) ?? null;
}
export async function saveOauthClient(redirectUri: string, clientId: string) {
  await db().execute({ sql: `INSERT OR REPLACE INTO oauth_clients(redirect_uri,client_id,created_at) VALUES(?,?,?)`, args: [redirectUri, clientId, Date.now()] });
}

export async function takeOauthState(state: string) {
  await migrate();
  const r = await db().execute({ sql: `SELECT * FROM oauth_states WHERE state=?`, args: [state] });
  const row = r.rows[0];
  if (!row) return null;
  await db().execute({ sql: `DELETE FROM oauth_states WHERE state=? OR created_at < ?`, args: [state, Date.now() - 15 * 60_000] });
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
    delivery: JSON.parse(row.delivery as string),
    autopilot: !!row.autopilot,
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

export async function insertMoonlet(m: Omit<MoonletRow, "keysRotated" | "runsTotal" | "runsFailed" | "spentTotalUsd" | "lastRunAt" | "autopilot"> & { autopilot?: boolean }) {
  await migrate();
  await db().execute({
    sql: `INSERT INTO moonlets(id,owner,name,spec,status,delivery,autopilot,key,cadence,per_run_cap_usd,earn_per_day_usd,burn_per_day_usd,next_run_at,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      m.id, m.owner.toLowerCase(), m.name, JSON.stringify(m.spec), m.status, JSON.stringify(m.delivery), m.autopilot ? 1 : 0,
      m.key ? seal(JSON.stringify(m.key)) : null, m.cadence, m.perRunCapUsd, m.earnPerDayUsd, m.burnPerDayUsd, m.nextRunAt, m.createdAt,
    ],
  });
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
    name: "name", spec: "spec", status: "status", delivery: "delivery", autopilot: "autopilot", key: "key", cadence: "cadence",
    perRunCapUsd: "per_run_cap_usd", earnPerDayUsd: "earn_per_day_usd", burnPerDayUsd: "burn_per_day_usd",
    nextRunAt: "next_run_at", lastRunAt: "last_run_at", keysRotated: "keys_rotated", runsTotal: "runs_total",
    runsFailed: "runs_failed", spentTotalUsd: "spent_total_usd",
  };
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in cols) || v === undefined) continue;
    sets.push(`${cols[k]}=?`);
    args.push(map[k](v as never));
  }
  if (!sets.length) return;
  args.push(id);
  await db().execute({ sql: `UPDATE moonlets SET ${sets.join(",")} WHERE id=?`, args });
}

/** A moonlet left in "running" for too long (crashed worker) goes back to idle. */
export async function releaseStale(olderThan: number) {
  await migrate();
  await db().execute({
    sql: `UPDATE moonlets SET status='idle' WHERE status='running' AND COALESCE(last_run_at, created_at) < ? AND next_run_at <= ?`,
    args: [olderThan, Date.now()],
  });
}

/** Atomically claim a due moonlet for a run so two cron ticks can't double-run it. */
export async function claimForRun(id: string, now = Date.now()) {
  const r = await db().execute({
    sql: `UPDATE moonlets SET status='running' WHERE id=? AND status IN ('idle','quiet') AND next_run_at <= ?`,
    args: [id, now],
  });
  return r.rowsAffected === 1;
}

// ---- runs ------------------------------------------------------------------

export async function insertRun(r: RunRow) {
  await migrate();
  await db().execute({
    sql: `INSERT INTO runs(id,moonlet_id,at,status,title,summary,body,sources,signal,nothing_happened,cost_usd,model,model_calls,duration_ms,output_hash,tx_hash,key_events,error)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      r.id, r.moonletId, r.at, r.status, r.title, r.summary, r.body, JSON.stringify(r.sources), r.signal, r.nothingHappened ? 1 : 0,
      r.costUsd, r.model, r.modelCalls, r.durationMs, r.outputHash, r.txHash, JSON.stringify(r.keyEvents), r.error,
    ],
  });
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
  const [m, r] = await Promise.all([
    c.execute(`SELECT
        SUM(CASE WHEN status IN ('running','idle') THEN 1 ELSE 0 END) AS alive,
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ('running','idle') THEN earn_per_day_usd ELSE 0 END) AS earn,
        SUM(CASE WHEN status IN ('running','idle') THEN burn_per_day_usd ELSE 0 END) AS burn,
        SUM(spent_total_usd) AS spent
      FROM moonlets WHERE status != 'deleted'`),
    c.execute({ sql: `SELECT COUNT(*) AS today, SUM(CASE WHEN tx_hash IS NOT NULL THEN 1 ELSE 0 END) AS anchored FROM runs WHERE at >= ?`, args: [Date.now() - 86_400_000] }),
  ]);
  const a = m.rows[0], b = r.rows[0];
  return {
    alive: Number(a?.alive ?? 0),
    total: Number(a?.total ?? 0),
    creditsPerDay: Number(a?.earn ?? 0),
    burnPerDay: Number(a?.burn ?? 0),
    spentTotalUsd: Number(a?.spent ?? 0),
    runsToday: Number(b?.today ?? 0),
    anchoredToday: Number(b?.anchored ?? 0),
  };
}

// ---- connections -----------------------------------------------------------

export type ConnectionKind = "telegram" | "github" | "x";
export type ConnectionRow<T = Record<string, unknown>> = { owner: string; kind: ConnectionKind; label: string; data: T; createdAt: number };

export async function setConnection(owner: string, kind: ConnectionKind, label: string, data: Record<string, unknown>) {
  await migrate();
  await db().execute({
    sql: `INSERT OR REPLACE INTO connections(owner,kind,label,data,created_at) VALUES(?,?,?,?,?)`,
    args: [owner.toLowerCase(), kind, label, seal(JSON.stringify(data)), Date.now()],
  });
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

export type ProposalKind = "tweet" | "pull_request" | "issue_comment";
export type ProposalStatus = "pending" | "approved" | "rejected" | "executed" | "failed";
export type ProposalRow = {
  id: string;
  owner: string;
  moonletId: string;
  runId: string | null;
  kind: ProposalKind;
  payload: Record<string, unknown>;
  status: ProposalStatus;
  result: Record<string, unknown> | null;
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

export async function finishProposal(id: string, status: "executed" | "failed", result: Record<string, unknown>) {
  await db().execute({ sql: `UPDATE proposals SET status=?, result=? WHERE id=?`, args: [status, JSON.stringify(result), id] });
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
