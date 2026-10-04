import { createHash } from "node:crypto";
import type { Hex } from "viem";
import { decodeAnchor } from "./anchor";
import { rhRpc } from "./rpc";
import * as store from "./store";

/**
 * The Moonlet hunt: a puzzle whose answer only counts when a moonlet puts it in a report that is anchored on Robinhood
 * Chain. Everything that would give the game away lives in the environment, not in this (public) repository:
 *
 *   HUNT_ANSWER_SHA256  sha256 of the normalised answer (lowercase, single spaces)
 *   HUNT_START          ISO time the clue goes up        HUNT_DEADLINE  ISO time submissions close
 *   HUNT_CLUE           the opening clue, shown from HUNT_START
 *   HUNT_PRIZE          what the winner gets (text)
 *
 * Submissions are recorded without saying whether they are right. After the deadline the results are computed in the
 * open: every submission whose answer hashes to HUNT_ANSWER_SHA256 is checked against its anchor transaction (the
 * calldata must name that moonlet, that run and that output hash), and the earliest block wins.
 */

export type HuntConfig = { start: number; deadline: number; clue: string | null; prize: string; answerSha: string | null };
export type HuntPhase = "off" | "upcoming" | "live" | "ended";

export function huntConfig(env: NodeJS.ProcessEnv = process.env): HuntConfig {
  return {
    start: Date.parse(env.HUNT_START ?? "") || 0,
    deadline: Date.parse(env.HUNT_DEADLINE ?? "") || 0,
    clue: env.HUNT_CLUE?.trim() || null,
    prize: env.HUNT_PRIZE?.trim() || "100 CREDIT",
    answerSha: env.HUNT_ANSWER_SHA256?.trim().toLowerCase() || null,
  };
}

export function huntPhase(c: HuntConfig, now = Date.now()): HuntPhase {
  if (!c.start || !c.deadline || !c.answerSha) return "off";
  if (now < c.start) return "upcoming";
  if (now < c.deadline) return "live";
  return "ended";
}

/** "The Sleepy  Moonlet…  dreams." → "the sleepy moonlet dreams": case, quotes, trailing punctuation and spacing don't matter. */
export const normaliseAnswer = (s: string) =>
  s.toLowerCase().replace(/[“”"'`*_]/g, "").replace(/\s+/g, " ").trim().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");

export const answerSha = (s: string) => createHash("sha256").update(normaliseAnswer(s)).digest("hex");

type RunText = { title: string; summary: string; body: string; sections?: Array<{ finding?: string }> };

/** The text after "ANSWER:" in a report, anywhere it was written (title, summary, body, a section). */
export function extractAnswer(r: RunText): string | null {
  const texts = [r.title, r.summary, r.body, ...(r.sections ?? []).map((s) => s.finding ?? "")];
  for (const t of texts) {
    const m = /ANSWER\s*[:：]\s*([^\n]+)/i.exec(t ?? "");
    const a = m ? normaliseAnswer(m[1]) : "";
    if (a.length >= 3) return a;
  }
  return null;
}

// ---- submissions -------------------------------------------------------------

export type Submission = { owner: string; runId: string; moonletId: string; answerSha: string; txHash: string; block: number; submittedAt: number };

async function ensureTable() {
  await store.migrate();
  await store.db().execute(
    `CREATE TABLE IF NOT EXISTS hunt_submissions (owner TEXT NOT NULL, run_id TEXT NOT NULL PRIMARY KEY, moonlet_id TEXT NOT NULL, answer_sha TEXT NOT NULL, tx_hash TEXT NOT NULL, block INTEGER NOT NULL, submitted_at INTEGER NOT NULL)`,
  );
}

export async function listSubmissions(): Promise<Submission[]> {
  await ensureTable();
  const r = await store.db().execute(`SELECT * FROM hunt_submissions ORDER BY block ASC, submitted_at ASC`);
  return r.rows.map((x) => ({ owner: x.owner as string, runId: x.run_id as string, moonletId: x.moonlet_id as string, answerSha: x.answer_sha as string, txHash: x.tx_hash as string, block: Number(x.block), submittedAt: Number(x.submitted_at) }));
}

/** The block an anchor transaction landed in, read from its receipt. Throws if the transaction failed or is unknown. */
async function anchorBlock(txHash: string, fetchImpl: typeof fetch) {
  const rc = await rhRpc<{ status: string; blockNumber: string } | null>("eth_getTransactionReceipt", [txHash], fetchImpl);
  if (!rc) throw new Error("anchor transaction not found on Robinhood Chain yet");
  if (rc.status !== "0x1") throw new Error("anchor transaction reverted");
  return Number(BigInt(rc.blockNumber));
}

export type SubmitResult = { ok: true; submission: Submission } | { ok: false; error: string };

/**
 * Record a run as an entry. The run must be the owner's, finished, anchored, and carry an ANSWER line. Whether the answer
 * is right is not revealed. One entry per run; an owner may enter several runs (the earliest correct one counts).
 */
export async function submit(owner: string, runId: string, opts: { now?: number; fetch?: typeof fetch; config?: HuntConfig } = {}): Promise<SubmitResult> {
  const c = opts.config ?? huntConfig();
  const phase = huntPhase(c, opts.now);
  if (phase !== "live") return { ok: false, error: phase === "ended" ? "the hunt is over" : "the hunt hasn't started" };
  const run = await store.getRun(runId);
  if (!run) return { ok: false, error: "no such run" };
  const m = await store.getMoonlet(run.moonletId);
  if (!m || m.owner !== owner.toLowerCase()) return { ok: false, error: "that run isn't from one of your moonlets" };
  if (run.status !== "done" || !run.outputHash) return { ok: false, error: "that run didn't finish with a report" };
  if (!run.txHash) return { ok: false, error: "that report isn't anchored on Robinhood Chain yet; wait a minute and try again" };
  const answer = extractAnswer(run);
  if (!answer) return { ok: false, error: "no ANSWER: line in that report" };
  const block = await anchorBlock(run.txHash, opts.fetch ?? fetch).catch((e: Error) => e);
  if (block instanceof Error) return { ok: false, error: block.message };
  await ensureTable();
  const s: Submission = { owner: owner.toLowerCase(), runId, moonletId: run.moonletId, answerSha: answerSha(answer), txHash: run.txHash, block, submittedAt: opts.now ?? Date.now() };
  await store.db().execute({
    sql: `INSERT OR IGNORE INTO hunt_submissions(owner,run_id,moonlet_id,answer_sha,tx_hash,block,submitted_at) VALUES(?,?,?,?,?,?,?)`,
    args: [s.owner, s.runId, s.moonletId, s.answerSha, s.txHash, s.block, s.submittedAt],
  });
  return { ok: true, submission: s };
}

// ---- results -----------------------------------------------------------------

export type Verdict = Submission & { correct: boolean; anchorOk: boolean; reason?: string };

/** Decode the anchor transaction and check it commits to exactly this moonlet, run and output hash. */
async function anchorMatches(s: Submission, fetchImpl: typeof fetch): Promise<{ ok: boolean; reason?: string }> {
  const tx = await rhRpc<{ input: Hex } | null>("eth_getTransactionByHash", [s.txHash], fetchImpl).catch(() => null);
  if (!tx) return { ok: false, reason: "anchor transaction not found" };
  const run = await store.getRun(s.runId);
  try {
    const a = decodeAnchor(tx.input);
    if (a.runId !== s.runId || a.moonletId !== s.moonletId) return { ok: false, reason: "anchor names a different run" };
    if (!run?.outputHash || a.outputHash.toLowerCase() !== run.outputHash.toLowerCase()) return { ok: false, reason: "anchored hash differs from the report" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "anchor calldata doesn't decode" };
  }
}

/** After the deadline: every entry with its verdict, correct and verified first, earliest block first. Null before. */
export async function results(opts: { now?: number; fetch?: typeof fetch; config?: HuntConfig } = {}): Promise<{ winner: Verdict | null; entries: Verdict[] } | null> {
  const c = opts.config ?? huntConfig();
  if (huntPhase(c, opts.now) !== "ended") return null;
  const subs = await listSubmissions();
  const entries: Verdict[] = [];
  for (const s of subs) {
    const correct = !!c.answerSha && s.answerSha === c.answerSha;
    const anchor = correct ? await anchorMatches(s, opts.fetch ?? fetch) : { ok: true };
    // Entries after the deadline block don't count; the submission time is ours, the block is the chain's.
    const late = s.submittedAt > c.deadline;
    entries.push({ ...s, correct, anchorOk: anchor.ok && !late, reason: late ? "submitted after the deadline" : anchor.reason });
  }
  entries.sort((a, b) => Number(b.correct && b.anchorOk) - Number(a.correct && a.anchorOk) || a.block - b.block || a.submittedAt - b.submittedAt);
  const winner = entries.find((e) => e.correct && e.anchorOk) ?? null;
  return { winner, entries };
}
