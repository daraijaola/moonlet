import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { recoverMessageAddress, type Hex } from "viem";
import { z } from "zod";
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
 *   HUNT_SEAL_SHA256    optional, comma-separated sha256s of other fragments to hide while live (same normalising)
 *   HUNT_VOID           optional: the round is closed without a winner; the text says why (shown on the page)
 *
 * Season 2 onwards (per-player answers and a staged schedule):
 *
 *   HUNT_SEASON         the season entries count for ("1" when unset); older seasons' entries stay stored as history
 *   HUNT_SEASON_TITLE   optional name shown on the page, e.g. "The Moonlet Vault"
 *   HUNT_PHRASE_COMMIT  sha256 hex of HUNT_PHRASE_SALT + the normalised phrase, published at launch. Turns on per-player
 *                       answers: each player's answer is the first 16 hex characters of sha256(normalised phrase + ":" +
 *                       huntId), so a copied answer is wrong for everyone else. The server does NOT hold the phrase while
 *                       live: entries are recorded unchecked, and nothing is judged until the reveal.
 *   HUNT_PHRASE         set only after the deadline (the reveal), with HUNT_PHRASE_SALT. results() checks
 *                       sha256(salt + normalised phrase) against the commitment before judging anything.
 *   HUNT_SEAL_SHA256    in a per-player season, put sha256(normalised phrase) (and any shard or fragment shas) here so the
 *                       phrase is still sealed on public pages while live without the server knowing it
 *   HUNT_STAGES         JSON array of stages: {id, title, releaseAt (ISO), clue, signature?, artifacts?: [{label, url | tx}]}.
 *                       A stage is public only once its releaseAt has passed; until then not even its title leaves the server.
 *   HUNT_SIGNER         the hunt address; each stage's signature is EIP-191 (personal_sign) by it over the clue text exactly
 *
 * Submissions are recorded without saying whether they are right. After the deadline the results are computed in the
 * open: every submission whose answer is right (hashes to HUNT_ANSWER_SHA256, or equals that player's own answer) is
 * checked against its anchor transaction (the calldata must name that moonlet, that run and that output hash), and the
 * earliest anchor wins: lowest block, then lowest position in that block.
 */

export type HuntArtifact = { label: string; url: string | null; tx: string | null };
export type HuntStage = { id: string; title: string; releaseAt: number; clue: string; signature: string | null; artifacts: HuntArtifact[] };
export type HuntConfig = {
  start: number;
  deadline: number;
  clue: string | null;
  prize: string;
  answerSha: string | null;
  seal?: string[];
  season?: string;
  seasonTitle?: string | null;
  phrase?: string | null;
  phraseSalt?: string;
  phraseCommit?: string | null;
  stages?: HuntStage[];
  signer?: string | null;
  voided?: string | null;
};
export type HuntPhase = "off" | "upcoming" | "live" | "ended" | "void";

export function huntConfig(env: NodeJS.ProcessEnv = process.env): HuntConfig {
  return {
    start: Date.parse(env.HUNT_START ?? "") || 0,
    deadline: Date.parse(env.HUNT_DEADLINE ?? "") || 0,
    clue: env.HUNT_CLUE?.trim() || null,
    prize: env.HUNT_PRIZE?.trim() || "100 CREDIT",
    answerSha: env.HUNT_ANSWER_SHA256?.trim().toLowerCase() || null,
    voided: env.HUNT_VOID?.trim() || null,
    seal: (env.HUNT_SEAL_SHA256 ?? "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => /^[0-9a-f]{64}$/.test(x)),
    season: env.HUNT_SEASON?.trim() || "1",
    seasonTitle: env.HUNT_SEASON_TITLE?.trim() || null,
    phrase: env.HUNT_PHRASE ? normaliseAnswer(env.HUNT_PHRASE) || null : null,
    phraseSalt: env.HUNT_PHRASE_SALT ?? "",
    phraseCommit: /^[0-9a-f]{64}$/.test(env.HUNT_PHRASE_COMMIT?.trim().toLowerCase() ?? "") ? env.HUNT_PHRASE_COMMIT!.trim().toLowerCase() : null,
    stages: parseStages(env.HUNT_STAGES),
    signer: /^0x[0-9a-fA-F]{40}$/.test(env.HUNT_SIGNER?.trim() ?? "") ? env.HUNT_SIGNER!.trim() : null,
  };
}

const StageJson = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  title: z.string().min(1),
  releaseAt: z.string().refine((x) => !Number.isNaN(Date.parse(x)), "releaseAt must be an ISO time"),
  clue: z.string(),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/).nullish(),
  artifacts: z
    .array(z.object({ label: z.string().min(1), url: z.string().regex(/^https?:\/\//).nullish(), tx: z.string().regex(/^0x[0-9a-fA-F]{64}$/).nullish() }).refine((a) => !!a.url || !!a.tx, "an artifact needs a url or a tx hash"))
    .nullish(),
});

/** HUNT_STAGES, validated and in release order. Bad JSON turns the schedule off (and says so) rather than half-loading it. */
export function parseStages(raw: string | undefined): HuntStage[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = z.array(StageJson).parse(JSON.parse(raw));
    return parsed
      .map((x) => ({ id: x.id, title: x.title, releaseAt: Date.parse(x.releaseAt), clue: x.clue, signature: x.signature ?? null, artifacts: (x.artifacts ?? []).map((a) => ({ label: a.label, url: a.url ?? null, tx: a.tx ?? null })) }))
      .sort((a, b) => a.releaseAt - b.releaseAt);
  } catch (e) {
    // The message names the field that failed, never the clue text.
    console.error("HUNT_STAGES is invalid, no stages shown:", e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : "not JSON");
    return [];
  }
}

export function huntPhase(c: HuntConfig, now = Date.now()): HuntPhase {
  if (c.voided) return "void";
  if (!c.start || !c.deadline || (!c.answerSha && !c.phraseCommit)) return "off";
  if (now < c.start) return "upcoming";
  if (now < c.deadline) return "live";
  return "ended";
}

/** "The Quiet  Lantern…  hums." → "the quiet lantern hums": case, quotes, trailing punctuation and spacing don't matter. */
export const normaliseAnswer = (s: string) =>
  s.toLowerCase().replace(/[“”"'`*_]/g, "").replace(/\s+/g, " ").trim().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");

export const answerSha = (s: string) => createHash("sha256").update(normaliseAnswer(s)).digest("hex");

/** Per-player answers are on when the season publishes a commitment to its phrase. */
export const perPlayer = (c: HuntConfig) => !!c.phraseCommit;

/**
 * An account's hunt id: the first 12 hex of HMAC-SHA256(SECRET_KEY, owner id lowercase). Opaque and fixed per account
 * (wallet or email login alike), so players compute their answer from a value shown to them rather than a raw id whose
 * case or format they might get wrong.
 */
export function huntId(owner: string, secret = process.env.SECRET_KEY): string {
  if (!secret && process.env.NODE_ENV === "production") throw new Error("SECRET_KEY is required in production");
  return createHmac("sha256", secret || "moonlet-dev-only-not-secret").update(owner.trim().toLowerCase()).digest("hex").slice(0, 12);
}

/** A player's own answer: the first 16 hex characters of sha256(normalised phrase + ":" + their hunt id). */
export const playerAnswer = (phrase: string, id: string) => createHash("sha256").update(`${normaliseAnswer(phrase)}:${id.trim().toLowerCase()}`).digest("hex").slice(0, 16);

/** The published commitment: sha256 of the salt followed by the normalised phrase. */
export const phraseCommitment = (salt: string, phrase: string) => createHash("sha256").update(`${salt}${normaliseAnswer(phrase)}`).digest("hex");

/**
 * The phrase, once it may be used: after the deadline, set, and matching the commitment published at launch. Before
 * then (or if the reveal doesn't match) it's an error and nothing is judged.
 */
export function revealedPhrase(c: HuntConfig, now = Date.now()): { ok: true; phrase: string } | { ok: false; error: string } {
  if (!c.phraseCommit) return { ok: false, error: "this season has no phrase commitment" };
  if (now < c.deadline) return { ok: false, error: "phrase not revealed yet" };
  if (!c.phrase) return { ok: false, error: "phrase not revealed yet" };
  if (!sameHex(phraseCommitment(c.phraseSalt ?? "", c.phrase), c.phraseCommit)) return { ok: false, error: "the revealed phrase doesn't match the published commitment" };
  return { ok: true, phrase: c.phrase };
}

/** The 16-hex answer in what followed ANSWER: ("0x" and a longer pasted hash are fine: the first 16 characters count). */
export const hexAnswer = (a: string) => /(?:^|[^0-9a-z])(?:0x)?([0-9a-f]{16})[0-9a-f]{0,48}(?![0-9a-z])/.exec(a.toLowerCase())?.[1] ?? null;

/** Equal hex digests, compared in constant time. */
function sameHex(a: string, b: string) {
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/**
 * Whether a stored entry (sha of its normalised answer) is right for the player who entered it. Per-player seasons need
 * the revealed phrase (see revealedPhrase); without it nothing is correct.
 */
export function entryCorrect(c: HuntConfig, s: { owner: string; answerSha: string }, phrase?: string | null): boolean {
  if (perPlayer(c)) return !!phrase && sameHex(s.answerSha, answerSha(playerAnswer(phrase, huntId(s.owner))));
  return !!c.answerSha && sameHex(s.answerSha, c.answerSha);
}

// ---- stages ------------------------------------------------------------------

/** The stages anyone may see: released (releaseAt passed) and only while the hunt is configured. Future stages never leave. */
export function releasedStages(c: HuntConfig, now = Date.now()): HuntStage[] {
  if (huntPhase(c, now) === "off") return [];
  return (c.stages ?? []).filter((s) => s.releaseAt <= now);
}

/** When the next stage drops (a time only, nothing about its content), or null when every stage is out. */
export function nextStageAt(c: HuntConfig, now = Date.now()): number | null {
  if (huntPhase(c, now) === "off") return null;
  return (c.stages ?? []).find((s) => s.releaseAt > now)?.releaseAt ?? null;
}

/** Whether a stage's signature is the hunt signer's personal_sign over the clue text. Null when there's nothing to check. */
export async function stageSignedBy(stage: HuntStage, signer: string | null | undefined): Promise<boolean | null> {
  if (!stage.signature || !signer) return null;
  try {
    const who = await recoverMessageAddress({ message: stage.clue, signature: stage.signature as Hex });
    return who.toLowerCase() === signer.toLowerCase();
  } catch {
    return false;
  }
}

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

// ---- sealing -----------------------------------------------------------------

export const SEALED = "sealed until the hunt closes";

/** True when some run of 1–14 words hashes to the answer or another sealed fragment. The server only knows hashes. */
function wordsHaveSealed(words: string[], shas: Set<string>) {
  for (let i = 0; i < words.length; i++) {
    for (let k = 1; k <= 14 && i + k <= words.length; k++) if (shas.has(answerSha(words.slice(i, i + k).join(" ")))) return true;
  }
  return false;
}

/** Checked as written, and again with every non-alphanumeric (commas, hyphens, dots, slashes) read as a space. */
function lineHasSealed(line: string, shas: Set<string>) {
  if (!shas.size) return false;
  if (wordsHaveSealed(line.split(/\s+/).filter(Boolean), shas)) return true;
  return wordsHaveSealed(line.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean), shas);
}

/** An answer marker ("answer:" or "answer：", any case, anywhere in the line). */
const ANSWER_MARK = /\banswer\s*[:：]/i;
/** A run of 16 or more hex characters: an answer, a shard, a key, or a piece of one. */
const HEX_RUN = /[0-9a-f]{16,}/i;

/**
 * While live, a line goes whole (text before the marker included) when it holds an answer marker, a run of 16+ hex
 * characters, or a sealed fragment written with any separators. Other lines are untouched.
 */
function sealText(s: string, shas: Set<string>) {
  return s
    .split("\n")
    .map((line) => (ANSWER_MARK.test(line) || HEX_RUN.test(line) || (line.length <= 4000 && lineHasSealed(line, shas)) ? `[${SEALED}]` : line))
    .join("\n");
}

/** Identifier fields (ids, owners, hashes, links) are structure, not prose: they stay as they are so pages still work. */
const ID_KEYS = new Set(["id", "moonletId", "runId", "owner", "txHash", "outputHash", "explorerUrl", "avatar", "template", "status", "model", "cadence", "signal"]);

function sealAll<T>(v: T, shas: Set<string>, key?: string): T {
  if (key && ID_KEYS.has(key)) return v;
  if (typeof v === "string") return sealText(v, shas) as T;
  if (Array.isArray(v)) return v.map((x) => sealAll(x, shas)) as T;
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sealAll(x, shas, k)])) as T;
  }
  return v;
}

/**
 * While the hunt is live, what strangers see of moonlets and reports hides anything that would give the answer away:
 * every answer line, hex that could be an answer or a shard, and the phrase (or another sealed fragment from
 * HUNT_SEAL_SHA256) wherever it appears. The anchored hash still covers the full report, the owner still sees
 * everything, and it all shows again when the hunt closes so anyone can check the winner.
 */
export function sealHunt<T>(v: T, opts: { now?: number; config?: HuntConfig } = {}): T {
  const c = opts.config ?? huntConfig();
  if (huntPhase(c, opts.now) !== "live") return v;
  const shas = [c.answerSha, ...(c.seal ?? [])].filter((x): x is string => !!x);
  return sealAll(v, new Set(shas));
}

// ---- submissions -------------------------------------------------------------

export type Submission = { owner: string; runId: string; moonletId: string; answerSha: string; txHash: string; block: number; txIndex: number | null; submittedAt: number; season: string };

let seasonColumn = false;
async function ensureTable() {
  await store.migrate();
  await store.db().execute(
    `CREATE TABLE IF NOT EXISTS hunt_submissions (owner TEXT NOT NULL, run_id TEXT NOT NULL PRIMARY KEY, moonlet_id TEXT NOT NULL, answer_sha TEXT NOT NULL, tx_hash TEXT NOT NULL, block INTEGER NOT NULL, submitted_at INTEGER NOT NULL, season TEXT NOT NULL DEFAULT '1', tx_index INTEGER)`,
  );
  if (seasonColumn) return;
  // Season 1's table had no season column; its rows become season '1' and stay readable as history. Nor did it record
  // the anchor's position in its block (NULL: those rows sort after any known position in the same block).
  await store.db().execute(`ALTER TABLE hunt_submissions ADD COLUMN season TEXT NOT NULL DEFAULT '1'`).catch(() => undefined);
  await store.db().execute(`ALTER TABLE hunt_submissions ADD COLUMN tx_index INTEGER`).catch(() => undefined);
  seasonColumn = true;
}

const ORDER = `ORDER BY block ASC, COALESCE(tx_index, 1000000000) ASC, submitted_at ASC`;

/** Entries in chain order (block, then position in the block): one season's (pass the current one) or every season's. */
export async function listSubmissions(season?: string): Promise<Submission[]> {
  await ensureTable();
  const r = season
    ? await store.db().execute({ sql: `SELECT * FROM hunt_submissions WHERE season=? ${ORDER}`, args: [season] })
    : await store.db().execute(`SELECT * FROM hunt_submissions ${ORDER}`);
  return r.rows.map((x) => ({
    owner: x.owner as string, runId: x.run_id as string, moonletId: x.moonlet_id as string, answerSha: x.answer_sha as string, txHash: x.tx_hash as string,
    block: Number(x.block), txIndex: x.tx_index == null ? null : Number(x.tx_index), submittedAt: Number(x.submitted_at), season: String(x.season ?? "1"),
  }));
}

/** Where an anchor transaction landed (block and index in it), read from its receipt. Throws if it failed or is unknown. */
async function anchorPosition(txHash: string, fetchImpl: typeof fetch) {
  const rc = await rhRpc<{ status: string; blockNumber: string; transactionIndex?: string } | null>("eth_getTransactionReceipt", [txHash], fetchImpl);
  if (!rc) throw new Error("anchor transaction not found on Robinhood Chain yet");
  if (rc.status !== "0x1") throw new Error("anchor transaction reverted");
  return { block: Number(BigInt(rc.blockNumber)), txIndex: rc.transactionIndex == null ? null : Number(BigInt(rc.transactionIndex)) };
}

/** Chain order: block, then position in the block (unknown last), then our clock as a last resort. */
const chainOrder = (a: Submission, b: Submission) => a.block - b.block || (a.txIndex ?? 1e9) - (b.txIndex ?? 1e9) || a.submittedAt - b.submittedAt;

export type SubmitResult = { ok: true; submission: Submission } | { ok: false; error: string };

/**
 * Record a run as an entry. The run must be the owner's, finished, anchored, and carry an ANSWER line. Whether the answer
 * is right is not revealed. One entry per run; an owner may enter several runs (the earliest correct one counts).
 */
export async function submit(owner: string, runId: string, opts: { now?: number; fetch?: typeof fetch; config?: HuntConfig } = {}): Promise<SubmitResult> {
  const c = opts.config ?? huntConfig();
  const phase = huntPhase(c, opts.now);
  if (phase !== "live") return { ok: false, error: phase === "void" ? "this round is closed" : phase === "ended" ? "the hunt is over" : "the hunt hasn't started" };
  const run = await store.getRun(runId);
  if (!run) return { ok: false, error: "no such run" };
  const m = await store.getMoonlet(run.moonletId);
  if (!m || m.owner !== owner.toLowerCase()) return { ok: false, error: "that run isn't from one of your moonlets" };
  if (run.status !== "done" || !run.outputHash) return { ok: false, error: "that run didn't finish with a report" };
  if (!run.txHash) return { ok: false, error: "that report isn't anchored on Robinhood Chain yet; wait a minute and try again" };
  const extracted = extractAnswer(run);
  if (!extracted) return { ok: false, error: "no ANSWER: line in that report" };
  // Per-player seasons: the answer is 16 hex characters, recorded unchecked (the server doesn't know the phrase yet).
  // Saying it must be hex reveals nothing about whether it's right.
  const answer = perPlayer(c) ? hexAnswer(extracted) : extracted;
  if (!answer) return { ok: false, error: "your ANSWER: should be 16 hex characters: the start of sha256(phrase:your hunt id)" };
  const pos = await anchorPosition(run.txHash, opts.fetch ?? fetch).catch((e: Error) => e);
  if (pos instanceof Error) return { ok: false, error: pos.message };
  await ensureTable();
  const s: Submission = { owner: owner.toLowerCase(), runId, moonletId: run.moonletId, answerSha: answerSha(answer), txHash: run.txHash, block: pos.block, txIndex: pos.txIndex, submittedAt: opts.now ?? Date.now(), season: c.season ?? "1" };
  await store.db().execute({
    sql: `INSERT OR IGNORE INTO hunt_submissions(owner,run_id,moonlet_id,answer_sha,tx_hash,block,tx_index,submitted_at,season) VALUES(?,?,?,?,?,?,?,?,?)`,
    args: [s.owner, s.runId, s.moonletId, s.answerSha, s.txHash, s.block, s.txIndex, s.submittedAt, s.season],
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

export type Results = { winner: Verdict | null; entries: Verdict[]; error?: string };

/**
 * After the deadline: every entry of the current season with its verdict, correct and verified first, then chain order
 * (block, position in the block). Null before the deadline. A per-player season is judged only once the revealed phrase
 * matches its commitment; until then the result is an error with no entries.
 */
export async function results(opts: { now?: number; fetch?: typeof fetch; config?: HuntConfig } = {}): Promise<Results | null> {
  const c = opts.config ?? huntConfig();
  const now = opts.now ?? Date.now();
  if (huntPhase(c, now) !== "ended") return null;
  let phrase: string | null = null;
  if (perPlayer(c)) {
    const r = revealedPhrase(c, now);
    if (!r.ok) return { winner: null, entries: [], error: r.error };
    phrase = r.phrase;
  }
  const subs = await listSubmissions(c.season ?? "1");
  const entries: Verdict[] = [];
  for (const s of subs) {
    const correct = entryCorrect(c, s, phrase);
    const anchor = correct ? await anchorMatches(s, opts.fetch ?? fetch) : { ok: true };
    // Entries after the deadline block don't count; the submission time is ours, the block is the chain's.
    const late = s.submittedAt > c.deadline;
    entries.push({ ...s, correct, anchorOk: anchor.ok && !late, reason: late ? "submitted after the deadline" : anchor.reason });
  }
  entries.sort((a, b) => Number(b.correct && b.anchorOk) - Number(a.correct && a.anchorOk) || chainOrder(a, b));
  const winner = entries.find((e) => e.correct && e.anchorOk) ?? null;
  return { winner, entries };
}
