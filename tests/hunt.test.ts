import { beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import * as store from "@/moonlet/store";
import { encodeAnchor, nonceQueue } from "@/moonlet/anchor";
import { anchorCheckDue, anchorIsLow, anchorLow, anchorMinWei, checkAnchorGas, ANCHOR_GAS_EVERY_MS } from "@/moonlet/anchor-gas";
import {
  answerSha, entryCorrect, extractAnswer, hexAnswer, huntId, huntPhase, listSubmissions, nextStageAt, normaliseAnswer, parseStages, phraseCommitment, playerAnswer, releasedStages, results, revealedPhrase, sealHunt, SEALED,
  stageSignedBy, submit,
  type HuntConfig, type HuntStage,
} from "@/moonlet/hunt";
import type { JobSpec } from "@/moonlet/spec";

/**
 * The hunt is decided by hashes and anchor transactions, so these tests pin the rules: answers are normalised, only an
 * owner's finished, anchored run with an ANSWER line can be entered, nothing is judged before the deadline, and at the
 * deadline the earliest block wins among entries whose anchor really commits to that run's output hash.
 */

const ALICE = "0x" + "a1".repeat(20), BOB = "0x" + "b2".repeat(20);
const RIGHT = "The Quiet Lantern hums over a meadow";
const spec: JobSpec = { name: "Solver", template: "custom", objective: "say the answer", cadence: "7d", sources: [], checks: [], tools: ["deliver"], output: { kind: "note", maxWords: 60, alwaysReport: true }, voice: "terse", spendCapUsd: 0.02, model: "auto", tripwire: null };
const T0 = Date.parse("2026-10-10T12:00:00Z");
const config: HuntConfig = { start: T0, deadline: T0 + 86_400_000, clue: "block 1", prize: "100 CREDIT", answerSha: answerSha(RIGHT) };

/** A fake chain: receipts and transactions keyed by hash. */
const txs = new Map<string, { block: number; txIndex: number; input: string; status?: string }>();
const chain: typeof fetch = async (_u, init) => {
  const b = JSON.parse(String(init?.body)) as { method: string; params: [string] };
  const t = txs.get(b.params[0]);
  const result = !t ? null : b.method === "eth_getTransactionReceipt" ? { status: t.status ?? "0x1", blockNumber: `0x${t.block.toString(16)}`, transactionIndex: `0x${t.txIndex.toString(16)}` } : { input: t.input };
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
};

async function runFor(owner: string, id: string, text: { title?: string; body?: string }, anchor?: { block: number; txIndex?: number; forgedHash?: boolean }) {
  const moonletId = `m_${id}`;
  await store.insertMoonlet({ id: moonletId, owner, name: id, spec, status: "idle", delivery: {}, key: null, cadence: "7d", perRunCapUsd: 0.02, earnPerDayUsd: 0, burnPerDayUsd: 0, nextRunAt: T0 + 9e9, createdAt: T0 });
  const outputHash = `0x${id.padEnd(64, "0").replace(/[^0-9a-f]/g, "0")}` as `0x${string}`;
  const txHash = anchor ? `0x${(id + "tx").padEnd(64, "f").replace(/[^0-9a-f]/g, "e")}` : null;
  await store.insertRun({ id, moonletId, at: T0 + 1000, status: "done", title: text.title ?? "Report", summary: "", body: text.body ?? "", sources: [], signal: "low", nothingHappened: false, costUsd: 0.01, model: "m", modelCalls: 1, durationMs: 1, outputHash, txHash, keyEvents: [], error: null });
  if (anchor && txHash) txs.set(txHash, { block: anchor.block, txIndex: anchor.txIndex ?? 0, input: encodeAnchor({ moonletId, runId: id, outputHash: anchor.forgedHash ? (`0x${"9".repeat(64)}` as `0x${string}`) : outputHash, costUsd: 0.01, at: T0 }) });
  return id;
}

beforeAll(async () => {
  rmSync("/tmp/moonlet-hunt.db", { force: true });
  process.env.DATABASE_URL = "file:/tmp/moonlet-hunt.db";
  process.env.SECRET_KEY = "test";
  await store.migrate();
  // A Season 1 database: the table as it was before seasons, with one entry already in it.
  await store.db().execute(`CREATE TABLE hunt_submissions (owner TEXT NOT NULL, run_id TEXT NOT NULL PRIMARY KEY, moonlet_id TEXT NOT NULL, answer_sha TEXT NOT NULL, tx_hash TEXT NOT NULL, block INTEGER NOT NULL, submitted_at INTEGER NOT NULL)`);
  await store.db().execute({ sql: `INSERT INTO hunt_submissions VALUES(?,?,?,?,?,?,?)`, args: [BOB, "rlegacy", "m_rlegacy", "0".repeat(64), "0x" + "1".repeat(64), 50, T0 + 1] });
});

describe("hunt", () => {
  it("normalises answers so case, quotes and punctuation don't matter, and finds ANSWER: anywhere in a report", () => {
    expect(normaliseAnswer('  "The Quiet  Lantern hums over a MEADOW."  ')).toBe("the quiet lantern hums over a meadow");
    expect(answerSha("the quiet lantern hums over a meadow!")).toBe(answerSha(RIGHT));
    expect(extractAnswer({ title: "Solved", summary: "", body: "Stage three done.\nANSWER: the quiet lantern hums over a meadow\nbye" })).toBe("the quiet lantern hums over a meadow");
    expect(extractAnswer({ title: "x", summary: "", body: "", sections: [{ finding: "answer： The Quiet Lantern Hums Over A Meadow" }] })).toBe("the quiet lantern hums over a meadow");
    expect(extractAnswer({ title: "no answer here", summary: "", body: "" })).toBeNull();
  });

  it("while live, public views hide ANSWER: lines, the phrase and sealed fragments; nothing is hidden before or after", () => {
    const sealCfg = { ...config, seal: [answerSha("meadow"), answerSha("quiet lantern hums over a")] };
    const run = { title: "Solved it: The quiet lantern hums over a meadow.", summary: "Short answer: yes, it worked.", body: "Stage one done.\nANSWER: the quiet lantern hums over a meadow\nThe word was meadow, found by brute force.\nPhrase: the quiet lantern hums over a ____", sections: [{ finding: "nothing secret here" }], at: 5 };
    const sealed = sealHunt(run, { now: T0 + 1, config: sealCfg });
    expect(sealed.title).toBe(`[${SEALED}]`);
    // Any answer marker takes its whole line while live, even an innocent one.
    expect(sealed.summary).toBe(`[${SEALED}]`);
    expect(sealed.body.split("\n")).toEqual(["Stage one done.", `[${SEALED}]`, `[${SEALED}]`, `[${SEALED}]`]);
    expect(sealed.sections[0].finding).toBe("nothing secret here");
    expect(sealed.at).toBe(5);
    expect(JSON.stringify(sealed)).not.toMatch(/meadow/i);
    expect(sealHunt(run, { now: T0 - 1, config: sealCfg })).toEqual(run);
    expect(sealHunt(run, { now: config.deadline + 1, config: sealCfg })).toEqual(run);
  });

  it("a voided round is closed: no entries, no results", async () => {
    const voided = { ...config, voided: "closed" };
    expect(huntPhase(voided, T0 + 1)).toBe("void");
    expect(await submit(ALICE, "anything", { now: T0 + 1, config: voided })).toEqual({ ok: false, error: "this round is closed" });
    expect(await results({ now: config.deadline + 1, config: voided })).toBeNull();
  });

  it("is off without an answer hash, and moves upcoming → live → ended on the clock", () => {
    expect(huntPhase({ ...config, answerSha: null }, T0)).toBe("off");
    expect(huntPhase(config, T0 - 1)).toBe("upcoming");
    expect(huntPhase(config, T0 + 1)).toBe("live");
    expect(huntPhase(config, config.deadline)).toBe("ended");
  });

  it("only takes the owner's finished, anchored runs with an ANSWER line, and only while live", async () => {
    const live = { now: T0 + 3600_000, fetch: chain, config };
    const unanchored = await runFor(ALICE, "rnoanchor", { body: `ANSWER: ${RIGHT}` });
    const noAnswer = await runFor(ALICE, "rnoanswer", { body: "I think it is about the moon" }, { block: 100 });
    const ok = await runFor(ALICE, "raliceok", { body: `ANSWER: ${RIGHT}` }, { block: 200 });
    expect(await submit(ALICE, unanchored, live)).toMatchObject({ ok: false, error: expect.stringMatching(/anchored/) });
    expect(await submit(ALICE, noAnswer, live)).toMatchObject({ ok: false, error: expect.stringMatching(/ANSWER/) });
    expect(await submit(BOB, ok, live)).toMatchObject({ ok: false, error: expect.stringMatching(/your moonlets/) });
    expect(await submit(ALICE, ok, { ...live, now: T0 - 1 })).toMatchObject({ ok: false, error: expect.stringMatching(/started/) });
    expect(await submit(ALICE, ok, live)).toMatchObject({ ok: true, submission: { block: 200 } });
    // Nothing is judged before the deadline.
    expect(await results(live)).toBeNull();
  });

  it("at the deadline: earliest verified block wins; wrong answers and forged anchors don't", async () => {
    const live = { now: T0 + 7200_000, fetch: chain, config };
    // Bob anchored the right answer earlier than Alice, but his anchor commits to a different hash than his report.
    await submit(BOB, await runFor(BOB, "rbobforged", { body: `ANSWER: ${RIGHT}` }, { block: 150, forgedHash: true }), live);
    // Bob also tried a wrong answer, earliest of all.
    await submit(BOB, await runFor(BOB, "rbobwrong", { title: "ANSWER: moonlet to the moon" }, { block: 120 }), live);
    // A later, honest right answer from Bob.
    await submit(BOB, await runFor(BOB, "rboblate", { body: `answer: ${RIGHT.toUpperCase()}` }, { block: 300 }), live);
    const r = await results({ now: config.deadline + 1, fetch: chain, config });
    expect(r?.winner).toMatchObject({ owner: ALICE, runId: "raliceok", block: 200 });
    const byRun = Object.fromEntries(r!.entries.map((e) => [e.runId, e]));
    expect(byRun.rbobforged).toMatchObject({ correct: true, anchorOk: false, reason: expect.stringMatching(/hash/) });
    expect(byRun.rbobwrong).toMatchObject({ correct: false });
    expect(byRun.rboblate).toMatchObject({ correct: true, anchorOk: true });
  });
});

describe("hunt grants", () => {
  const grants = { count: 2, credit: 10, minOrbio: 100, treasury: "0x" + "77".repeat(20) };
  const live = T0 + 60_000;
  const noChain: typeof fetch = async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "offline" } }));
  const sent: Array<{ to: string; credit: number }> = [];
  const send = async (to: string, credit: number) => { sent.push({ to, credit }); return { txHash: `0x${String(sent.length).padStart(64, "0")}` }; };
  const bags: Record<string, number> = {};
  const wallet = (i: number) => `0x${String(i).padStart(40, "c")}`;
  const opts = (extra: object = {}) => ({ now: live, config, grants, send, bag: async (o: string) => bags[o] ?? 0, fetch: noChain, ...extra });

  it("needs the hunt live, a signed Orbio key and the minimum ORBIO; then sends exactly the grant", async () => {
    const { claimGrant } = await import("@/moonlet/hunt-grants");
    const w = wallet(1);
    bags[w] = 150;
    expect(await claimGrant(w, opts({ now: T0 - 1 }))).toMatchObject({ ok: false, error: expect.stringMatching(/live/) });
    expect(await claimGrant(w, opts())).toMatchObject({ ok: false, error: expect.stringMatching(/Orbio key/) });
    await store.setOwnerOrbioKey(w, "sk-orb-0-test", 0);
    bags[w] = 99;
    expect(await claimGrant(w, opts())).toMatchObject({ ok: false, error: expect.stringMatching(/at least 100/) });
    bags[w] = 150;
    expect(await claimGrant(w, opts())).toMatchObject({ ok: true, credit: 10, left: 1 });
    expect(sent).toEqual([{ to: w, credit: 10 }]);
    expect(await claimGrant(w, opts())).toMatchObject({ ok: false, error: expect.stringMatching(/already claimed/) });
  });

  it("a failed send gives the slot back; never more than N grants even when claims arrive together", async () => {
    const { claimGrant, grantsTaken } = await import("@/moonlet/hunt-grants");
    const ws = [2, 3, 4, 5].map(wallet);
    for (const w of ws) { bags[w] = 1000; await store.setOwnerOrbioKey(w, "sk-orb-0-test", 0); }
    const failing = async () => { throw new Error("out of gas"); };
    expect(await claimGrant(ws[0], opts({ send: failing }))).toMatchObject({ ok: false, error: expect.stringMatching(/treasury/) });
    expect(await grantsTaken()).toBe(1);
    const results = await Promise.all(ws.map((w) => claimGrant(w, opts())));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && /all grants/.test(r.error))).toHaveLength(3);
    expect(await grantsTaken()).toBe(2);
  });
});

describe("hunt season 2", () => {
  // A decoy: the real phrase is never in the repository.
  const PHRASE = "Amber kites drift past seven harbours";
  const SALT = "decoy-salt-7f3a";
  const HOUR = 3600_000;
  const stage = (id: string, releaseAt: number, clue: string): HuntStage => ({ id, title: `Stage ${id}`, releaseAt, clue, signature: null, artifacts: [] });
  const stages = [stage("1", T0, "the first door"), stage("2", T0 + 6 * HOUR, "SECRET-FUTURE-CLUE-two"), stage("3", T0 + 12 * HOUR, "SECRET-FUTURE-CLUE-three")];
  /** While live the server holds only the commitment (and, for sealing, the phrase's hash); no phrase. */
  const s2: HuntConfig = { ...config, answerSha: null, phraseCommit: phraseCommitment(SALT, PHRASE), season: "2", stages, seal: [answerSha(PHRASE)] };
  /** After the deadline the operator reveals the phrase and salt. */
  const revealed: HuntConfig = { ...s2, phrase: normaliseAnswer(PHRASE), phraseSalt: SALT };

  it("a hunt id is an opaque HMAC of the owner; a player's answer is the first 16 hex of sha256(phrase:huntId)", () => {
    const idA = huntId(ALICE), idB = huntId(BOB);
    expect(idA).toMatch(/^[0-9a-f]{12}$/);
    expect(idA).not.toBe(idB);
    expect(huntId(ALICE.toUpperCase().replace("0X", "0x"))).toBe(idA);
    expect(idA).not.toBe(huntId(ALICE, "another-secret"));
    const a = playerAnswer(PHRASE, idA), b = playerAnswer(PHRASE, idB);
    expect(a).toBe(createHash("sha256").update(`amber kites drift past seven harbours:${idA}`).digest("hex").slice(0, 16));
    expect(a).not.toBe(b);
    expect(playerAnswer('"amber KITES drift past seven harbours."', idA)).toBe(a);
    // Right for Alice is wrong for Bob; nothing is right without the revealed phrase.
    expect(entryCorrect(revealed, { owner: ALICE, answerSha: answerSha(a) }, revealed.phrase)).toBe(true);
    expect(entryCorrect(revealed, { owner: BOB, answerSha: answerSha(a) }, revealed.phrase)).toBe(false);
    expect(entryCorrect(revealed, { owner: BOB, answerSha: answerSha(b) }, revealed.phrase)).toBe(true);
    expect(entryCorrect(s2, { owner: ALICE, answerSha: answerSha(a) }, null)).toBe(false);
    // Hex answers: an 0x prefix and a full pasted hash are fine; a phrase or a short hex isn't an answer.
    expect(hexAnswer(`0x${a}`)).toBe(a);
    expect(hexAnswer(`${a}${"0".repeat(48)} my answer`)).toBe(a);
    expect(hexAnswer(normaliseAnswer(PHRASE))).toBeNull();
    expect(hexAnswer(a.slice(0, 15))).toBeNull();
  });

  it("the phrase counts only after the deadline and only if it matches the commitment", () => {
    expect(huntPhase(s2, T0 + 1)).toBe("live");
    expect(huntPhase({ ...s2, phraseCommit: null }, T0 + 1)).toBe("off");
    // Even if someone sets HUNT_PHRASE early, it isn't used before the deadline.
    expect(revealedPhrase(revealed, T0 + 1)).toEqual({ ok: false, error: "phrase not revealed yet" });
    expect(revealedPhrase(s2, s2.deadline + 1)).toEqual({ ok: false, error: "phrase not revealed yet" });
    expect(revealedPhrase({ ...revealed, phraseSalt: "wrong" }, s2.deadline + 1)).toMatchObject({ ok: false, error: expect.stringMatching(/commitment/) });
    expect(revealedPhrase({ ...revealed, phrase: "amber kites drift past six harbours" }, s2.deadline + 1)).toMatchObject({ ok: false });
    expect(revealedPhrase(revealed, s2.deadline + 1)).toEqual({ ok: true, phrase: "amber kites drift past seven harbours" });
    expect(phraseCommitment(SALT, PHRASE)).toBe(createHash("sha256").update(`${SALT}amber kites drift past seven harbours`).digest("hex"));
  });

  it("while live, sealing closes each leak from the review: prefix text, separators, lowercase answer:, hex shards", () => {
    const answer = playerAnswer(PHRASE, huntId(ALICE));
    const shard = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    const run = {
      title: "Day 4 notes",
      summary: "All clear, nothing found.",
      body: [
        `amber kites drift ANSWER: past seven harbours`, // (a) text before the marker
        `the phrase is amber, kites, drift, past, seven, harbours`, // (b) commas
        `amber-kites-drift-past-seven-harbours`, // (b) hyphens
        `AMBER.KITES/drift_past seven—harbours`, // (b) mixed separators
        `final answer: ${answer}`, // lowercase marker
        `answer：${answer}`, // full-width colon, no space
        `shard two is ${shard.slice(0, 20)} and that's all`, // (c) hex shard piece
        `0x${shard}`, // (c) a whole key
        `The moon rose over the harbour at 7pm.`, // innocent
        `answers are not here`, // "answers" without a colon is not a marker
        `deadbeef is only 8 hex`, // short hex is fine
      ].join("\n"),
      sections: [{ finding: `Stage 2: ${shard.slice(0, 16)}` }],
      id: "run_1",
      txHash: "0x" + "ab".repeat(32),
      outputHash: "0x" + "cd".repeat(32),
      owner: ALICE,
    };
    const sealed = sealHunt(run, { now: T0 + 1, config: s2 });
    const S = `[${SEALED}]`;
    expect(sealed.body.split("\n")).toEqual([S, S, S, S, S, S, S, S, "The moon rose over the harbour at 7pm.", "answers are not here", "deadbeef is only 8 hex"]);
    expect(sealed.sections[0].finding).toBe(S);
    expect(sealed.title).toBe("Day 4 notes");
    expect(sealed.summary).toBe("All clear, nothing found.");
    // Identifier fields are structure, not prose: pages and explorer links keep working.
    expect(sealed).toMatchObject({ id: "run_1", txHash: run.txHash, outputHash: run.outputHash, owner: ALICE });
    const text = JSON.stringify({ ...sealed, txHash: null, outputHash: null, owner: null });
    expect(text).not.toMatch(/kites|harbours|9f86d0818/i);
    expect(text).not.toContain(answer);
    // Nothing is sealed before the start or after the deadline.
    expect(sealHunt(run, { now: T0 - 1, config: s2 })).toEqual(run);
    expect(sealHunt(run, { now: s2.deadline + 1, config: s2 })).toEqual(run);
  });

  it("exposes only released stages and the next release time, never a future stage's clue", async () => {
    expect(releasedStages(s2, T0 - 1)).toEqual([]);
    expect(releasedStages(s2, T0 + HOUR).map((s) => s.id)).toEqual(["1"]);
    expect(nextStageAt(s2, T0 + HOUR)).toBe(T0 + 6 * HOUR);
    expect(releasedStages(s2, T0 + 6 * HOUR).map((s) => s.id)).toEqual(["1", "2"]);
    expect(nextStageAt(s2, T0 + 13 * HOUR)).toBeNull();
    expect(releasedStages({ ...s2, phraseCommit: null }, T0 + 13 * HOUR)).toEqual([]);

    // The public API, end to end from the environment.
    const now = Date.now();
    const future = new Date(now + HOUR).toISOString();
    const env = {
      HUNT_START: new Date(now - HOUR).toISOString(), HUNT_DEADLINE: new Date(now + 24 * HOUR).toISOString(), HUNT_PHRASE_COMMIT: phraseCommitment(SALT, PHRASE), HUNT_SEASON: "2", HUNT_SEASON_TITLE: "The Moonlet Vault",
      HUNT_SIGNER: "0x" + "5".repeat(40),
      HUNT_STAGES: JSON.stringify([
        { id: "2", title: "Second door", releaseAt: future, clue: "SECRET-FUTURE-CLUE-two" },
        { id: "1", title: "First door", releaseAt: new Date(now - HOUR).toISOString(), clue: "the first door", artifacts: [{ label: "the tx", tx: "0x" + "ab".repeat(32) }] },
      ]),
    };
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    try {
      const { GET } = await import("@/app/api/hunt/route");
      const text = await (await GET()).text();
      const j = JSON.parse(text) as { stages: Array<{ id: string }>; nextStageAt: number };
      expect(j).toMatchObject({ phase: "live", season: "2", seasonTitle: "The Moonlet Vault", perPlayer: true, phraseCommit: env.HUNT_PHRASE_COMMIT, signer: env.HUNT_SIGNER, stagesTotal: 2, anchorLow: false });
      expect(j.stages.map((s) => s.id)).toEqual(["1"]);
      expect(j.stages[0]).toMatchObject({ clue: "the first door", artifacts: [{ label: "the tx", tx: "0x" + "ab".repeat(32), url: null }] });
      expect(j.nextStageAt).toBe(Date.parse(future));
      expect(text).not.toContain("SECRET-FUTURE-CLUE");
      expect(text).not.toContain("Second door");
    } finally {
      for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  it("validates HUNT_STAGES and checks each stage's signature against the hunt address", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(parseStages("not json")).toEqual([]);
    expect(parseStages(JSON.stringify([{ id: 1, title: "x", releaseAt: "soon", clue: "a secret clue" }]))).toEqual([]);
    expect(err.mock.calls.flat().join(" ")).not.toContain("a secret clue");
    err.mockRestore();
    const hunt = privateKeyToAccount(`0x${"42".repeat(32)}`);
    const clue = "the first door\nopens at block 7";
    const signed = { ...stage("1", T0, clue), signature: await hunt.signMessage({ message: clue }) };
    expect(await stageSignedBy(signed, hunt.address)).toBe(true);
    expect(await stageSignedBy({ ...signed, clue: "the first door" }, hunt.address)).toBe(false);
    expect(await stageSignedBy(signed, "0x" + "5".repeat(40))).toBe(false);
    expect(await stageSignedBy(stage("1", T0, clue), hunt.address)).toBeNull();
  });

  it("records entries blind while live; judges after the reveal, per player, in block then position order; Season 1 stays stored", async () => {
    const live = { now: T0 + 2 * HOUR, fetch: chain, config: s2 };
    const aliceAnswer = playerAnswer(PHRASE, huntId(ALICE));
    const bobFull = createHash("sha256").update(`${normaliseAnswer(PHRASE)}:${huntId(BOB)}`).digest("hex");
    // Bob copies Alice's answer and anchors it first; it's wrong for him.
    expect(await submit(BOB, await runFor(BOB, "s2bobcopy", { body: `ANSWER: ${aliceAnswer}` }, { block: 400 }), live)).toMatchObject({ ok: true });
    // The phrase itself isn't an answer this season.
    expect(await submit(BOB, await runFor(BOB, "s2bobphrase", { body: `ANSWER: ${PHRASE}` }, { block: 410 }), live)).toMatchObject({ ok: false, error: expect.stringMatching(/16 hex/) });
    // Bob's own right answer lands in the same block as Alice's but at a later position; he enters it first by our clock.
    expect(await submit(BOB, await runFor(BOB, "s2bobright", { body: `answer: 0x${bobFull}` }, { block: 500, txIndex: 7 }), { ...live, now: live.now - 60_000 })).toMatchObject({ ok: true, submission: { block: 500, txIndex: 7 } });
    expect(await submit(ALICE, await runFor(ALICE, "s2alice", { body: `ANSWER: ${aliceAnswer}` }, { block: 500, txIndex: 2 }), live)).toMatchObject({ ok: true, submission: { season: "2", txIndex: 2 } });

    // Nothing is judged before the deadline, nor after it until the phrase is revealed and matches.
    expect(await results(live)).toBeNull();
    expect(await results({ now: s2.deadline + 1, fetch: chain, config: s2 })).toEqual({ winner: null, entries: [], error: "phrase not revealed yet" });
    expect((await results({ now: s2.deadline + 1, fetch: chain, config: { ...revealed, phraseSalt: "nope" } }))?.error).toMatch(/commitment/);

    const r = await results({ now: s2.deadline + 1, fetch: chain, config: revealed });
    expect(r?.error).toBeUndefined();
    expect(r?.winner).toMatchObject({ owner: ALICE, runId: "s2alice", block: 500, txIndex: 2 });
    expect(r!.entries.map((e) => e.runId)).toEqual(["s2alice", "s2bobright", "s2bobcopy"]);
    const byRun = Object.fromEntries(r!.entries.map((e) => [e.runId, e]));
    expect(byRun.s2bobcopy).toMatchObject({ correct: false });
    expect(byRun.s2bobright).toMatchObject({ correct: true, anchorOk: true });

    // Season 1 is history: still stored (the pre-season row reads as season 1, position unknown), not judged in season 2.
    const one = await listSubmissions("1");
    expect(one.map((s) => s.runId)).toEqual(expect.arrayContaining(["rlegacy", "raliceok", "rbobforged"]));
    expect(one.every((s) => s.season === "1")).toBe(true);
    expect(one.find((s) => s.runId === "rlegacy")?.txIndex).toBeNull();
    expect((await listSubmissions("2")).map((s) => s.runId)).toEqual(["s2bobcopy", "s2alice", "s2bobright"]);
    expect((await listSubmissions()).length).toBe(one.length + 3);
    expect((await results({ now: config.deadline + 1, fetch: chain, config }))?.winner).toMatchObject({ runId: "raliceok" });
  });

  it("while live the public API lists only a shortened account and block per entry; details come with the results", async () => {
    const now = Date.now();
    const base = { HUNT_PHRASE_COMMIT: phraseCommitment(SALT, PHRASE), HUNT_SEASON: "2", HUNT_START: new Date(now - 2 * HOUR).toISOString() };
    const keys = ["HUNT_PHRASE_COMMIT", "HUNT_SEASON", "HUNT_START", "HUNT_DEADLINE", "HUNT_PHRASE", "HUNT_PHRASE_SALT"];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    const restore = () => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; };
    const { GET } = await import("@/app/api/hunt/route");
    try {
      Object.assign(process.env, base, { HUNT_DEADLINE: new Date(now + HOUR).toISOString() });
      const text = await (await GET()).text();
      const j = JSON.parse(text) as { entryCount: number; entries: Array<Record<string, unknown>> };
      expect(j.entryCount).toBe(3);
      expect(j.entries.every((e) => Object.keys(e).sort().join() === "block,wallet")).toBe(true);
      expect(text).not.toMatch(/s2alice|s2bob|m_s2|"txHash"/);
      // Ended but not revealed: still nothing but account and block.
      Object.assign(process.env, { HUNT_DEADLINE: new Date(now - HOUR).toISOString() });
      const ended = JSON.parse(await (await GET()).text()) as { entries: Array<Record<string, unknown>>; results: { error: string } };
      expect(ended.results.error).toBe("phrase not revealed yet");
      expect(ended.entries.every((e) => !("runId" in e))).toBe(true);
    } finally {
      restore();
    }
  });
});

describe("anchor nonces", () => {
  it("serialises sends so concurrent anchors never share a nonce, even when the RPC's pending count lags", async () => {
    let confirmed = 0;
    const used = new Set<number>();
    const send = async (nonce: number) => {
      await new Promise((ok) => setTimeout(ok, Math.random() * 5));
      if (used.has(nonce) || nonce < confirmed) throw new Error("nonce too low");
      used.add(nonce);
      return `tx${nonce}`;
    };
    // A lagging RPC: always reports the nonce as of before this burst.
    const q = nonceQueue(async () => confirmed);
    const out = await Promise.all(Array.from({ length: 6 }, () => q(send)));
    expect(out.sort()).toEqual(["tx0", "tx1", "tx2", "tx3", "tx4", "tx5"]);

    // A transaction from elsewhere takes nonce 6: the next send collides and retries once with a later nonce.
    used.add(6);
    confirmed = 3;
    const attempts: number[] = [];
    expect(await q(async (n) => { attempts.push(n); return send(n); })).toBe("tx7");
    expect(attempts).toEqual([6, 7]);

    // Other failures pass through untouched, and don't wedge the queue.
    await expect(q(async () => { throw new Error("insufficient funds for gas"); })).rejects.toThrow(/insufficient funds/);
    expect(await q(send)).toBe("tx8");
  });
});

describe("anchor gas alert", () => {
  const ETH = 10n ** 18n;
  it("flags a balance strictly under ANCHOR_MIN_ETH (0.0001 by default), and checks at most every ten minutes", () => {
    expect(anchorMinWei({})).toBe(ETH / 10_000n);
    expect(anchorMinWei({ ANCHOR_MIN_ETH: "0.01" })).toBe(ETH / 100n);
    expect(anchorMinWei({ ANCHOR_MIN_ETH: "lots" })).toBe(ETH / 10_000n);
    expect(anchorIsLow(ETH / 10_000n - 1n, anchorMinWei({}))).toBe(true);
    expect(anchorIsLow(ETH / 10_000n, anchorMinWei({}))).toBe(false);
    expect(anchorIsLow(0n, anchorMinWei({}))).toBe(true);
    expect(anchorCheckDue(0, T0)).toBe(true);
    expect(anchorCheckDue(T0, T0 + ANCHOR_GAS_EVERY_MS - 1)).toBe(false);
    expect(anchorCheckDue(T0, T0 + ANCHOR_GAS_EVERY_MS)).toBe(true);
  });

  it("reads the anchor wallet's balance, remembers anchorLow and logs loudly when low", async () => {
    let balance = 5n * 10n ** 13n, reads = 0;
    const rpc: typeof fetch = async (_u, init) => {
      const b = JSON.parse(String(init?.body)) as { method: string };
      reads++;
      expect(b.method).toBe("eth_getBalance");
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: `0x${balance.toString(16)}` }));
    };
    const env = { ANCHOR_PRIVATE_KEY: `0x${"24".repeat(32)}` };
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await checkAnchorGas({ now: T0, fetch: rpc, env: {} })).toBeNull();
    expect(await checkAnchorGas({ now: T0, fetch: rpc, env })).toMatchObject({ low: true, balanceWei: balance });
    expect(await anchorLow()).toBe(true);
    expect(err.mock.calls.flat().join(" ")).toMatch(/ANCHOR WALLET LOW ON GAS/);
    balance = ETH;
    expect(await checkAnchorGas({ now: T0 + 60_000, fetch: rpc, env })).toBeNull();
    expect(reads).toBe(1);
    expect(await checkAnchorGas({ now: T0 + ANCHOR_GAS_EVERY_MS, fetch: rpc, env })).toMatchObject({ low: false });
    expect(await anchorLow()).toBe(false);
    err.mockRestore();
  });
});
