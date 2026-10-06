import { beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import * as store from "@/moonlet/store";
import { encodeAnchor } from "@/moonlet/anchor";
import { anchorCheckDue, anchorIsLow, anchorLow, anchorMinWei, checkAnchorGas, ANCHOR_GAS_EVERY_MS } from "@/moonlet/anchor-gas";
import {
  answerSha, entryCorrect, extractAnswer, hexAnswer, huntPhase, listSubmissions, nextStageAt, normaliseAnswer, parseStages, playerAnswer, releasedStages, results, sealHunt, SEALED, stageSignedBy, submit,
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
const txs = new Map<string, { block: number; input: string; status?: string }>();
const chain: typeof fetch = async (_u, init) => {
  const b = JSON.parse(String(init?.body)) as { method: string; params: [string] };
  const t = txs.get(b.params[0]);
  const result = !t ? null : b.method === "eth_getTransactionReceipt" ? { status: t.status ?? "0x1", blockNumber: `0x${t.block.toString(16)}` } : { input: t.input };
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
};

async function runFor(owner: string, id: string, text: { title?: string; body?: string }, anchor?: { block: number; forgedHash?: boolean }) {
  const moonletId = `m_${id}`;
  await store.insertMoonlet({ id: moonletId, owner, name: id, spec, status: "idle", delivery: {}, key: null, cadence: "7d", perRunCapUsd: 0.02, earnPerDayUsd: 0, burnPerDayUsd: 0, nextRunAt: T0 + 9e9, createdAt: T0 });
  const outputHash = `0x${id.padEnd(64, "0").replace(/[^0-9a-f]/g, "0")}` as `0x${string}`;
  const txHash = anchor ? `0x${(id + "tx").padEnd(64, "f").replace(/[^0-9a-f]/g, "e")}` : null;
  await store.insertRun({ id, moonletId, at: T0 + 1000, status: "done", title: text.title ?? "Report", summary: "", body: text.body ?? "", sources: [], signal: "low", nothingHappened: false, costUsd: 0.01, model: "m", modelCalls: 1, durationMs: 1, outputHash, txHash, keyEvents: [], error: null });
  if (anchor && txHash) txs.set(txHash, { block: anchor.block, input: encodeAnchor({ moonletId, runId: id, outputHash: anchor.forgedHash ? (`0x${"9".repeat(64)}` as `0x${string}`) : outputHash, costUsd: 0.01, at: T0 }) });
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
    expect(sealed.summary).toBe("Short answer: yes, it worked.");
    expect(sealed.body.split("\n")).toEqual(["Stage one done.", `ANSWER: ${SEALED}`, `[${SEALED}]`, `[${SEALED}]`]);
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
  const PHRASE = "Under the vault the tide keeps time";
  const HOUR = 3600_000;
  const stage = (id: string, releaseAt: number, clue: string): HuntStage => ({ id, title: `Stage ${id}`, releaseAt, clue, signature: null, artifacts: [] });
  const stages = [stage("1", T0, "the first door"), stage("2", T0 + 6 * HOUR, "SECRET-FUTURE-CLUE-two"), stage("3", T0 + 12 * HOUR, "SECRET-FUTURE-CLUE-three")];
  const s2: HuntConfig = { ...config, answerSha: null, phrase: normaliseAnswer(PHRASE), season: "2", stages };

  it("a player's answer is the first 16 hex of sha256(phrase:owner); right for Alice is wrong for Bob", () => {
    const a = playerAnswer(PHRASE, ALICE), b = playerAnswer(PHRASE, BOB);
    expect(a).toBe(createHash("sha256").update(`under the vault the tide keeps time:${ALICE}`).digest("hex").slice(0, 16));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
    // The owner id is lowercased and the phrase normalised before hashing.
    expect(playerAnswer('"under THE vault the tide keeps time."', ALICE.toUpperCase().replace("0X", "0x"))).toBe(a);
    expect(entryCorrect(s2, { owner: ALICE, answerSha: answerSha(a) })).toBe(true);
    expect(entryCorrect(s2, { owner: BOB, answerSha: answerSha(a) })).toBe(false);
    expect(entryCorrect(s2, { owner: BOB, answerSha: answerSha(b) })).toBe(true);
    // Hex answers: an 0x prefix and a full pasted hash are fine; a phrase or a short hex isn't an answer.
    expect(hexAnswer(`0x${a}`)).toBe(a);
    expect(hexAnswer(`${a}${"0".repeat(48)} my answer`)).toBe(a);
    expect(hexAnswer(normaliseAnswer(PHRASE))).toBeNull();
    expect(hexAnswer(a.slice(0, 15))).toBeNull();
  });

  it("is live on a phrase alone, and seals per-player ANSWER lines and the phrase while live", () => {
    expect(huntPhase(s2, T0 + 1)).toBe("live");
    expect(huntPhase({ ...s2, phrase: null }, T0 + 1)).toBe("off");
    const run = { title: "Done", summary: "Short answer: yes.", body: `answer: ${playerAnswer(PHRASE, ALICE)}\nThe phrase was under the vault the tide keeps time.` };
    const sealed = sealHunt(run, { now: T0 + 1, config: s2 });
    expect(sealed.body.split("\n")).toEqual([`answer: ${SEALED}`, `[${SEALED}]`]);
    expect(sealed.summary).toBe("Short answer: yes.");
    expect(sealHunt(run, { now: s2.deadline + 1, config: s2 })).toEqual(run);
  });

  it("exposes only released stages and the next release time, never a future stage's clue", async () => {
    expect(releasedStages(s2, T0 - 1)).toEqual([]);
    expect(releasedStages(s2, T0 + HOUR).map((s) => s.id)).toEqual(["1"]);
    expect(nextStageAt(s2, T0 + HOUR)).toBe(T0 + 6 * HOUR);
    expect(releasedStages(s2, T0 + 6 * HOUR).map((s) => s.id)).toEqual(["1", "2"]);
    expect(nextStageAt(s2, T0 + 13 * HOUR)).toBeNull();
    expect(releasedStages({ ...s2, phrase: null }, T0 + 13 * HOUR)).toEqual([]);

    // The public API, end to end from the environment.
    const now = Date.now();
    const future = new Date(now + HOUR).toISOString();
    const env = {
      HUNT_START: new Date(now - HOUR).toISOString(), HUNT_DEADLINE: new Date(now + 24 * HOUR).toISOString(), HUNT_PHRASE: PHRASE, HUNT_SEASON: "2", HUNT_SEASON_TITLE: "The Moonlet Vault",
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
      expect(j).toMatchObject({ phase: "live", season: "2", seasonTitle: "The Moonlet Vault", perPlayer: true, signer: env.HUNT_SIGNER, stagesTotal: 2, anchorLow: false });
      expect(j.stages.map((s) => s.id)).toEqual(["1"]);
      expect(j.stages[0]).toMatchObject({ clue: "the first door", artifacts: [{ label: "the tx", tx: "0x" + "ab".repeat(32), url: null }] });
      expect(j.nextStageAt).toBe(Date.parse(future));
      expect(text).not.toContain("SECRET-FUTURE-CLUE");
      expect(text).not.toContain("Second door");
      expect(text.toLowerCase()).not.toContain("tide keeps time");
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

  it("results count only this season's entries, by each player's own answer; Season 1 stays stored", async () => {
    const live = { now: T0 + 2 * HOUR, fetch: chain, config: s2 };
    const aliceAnswer = playerAnswer(PHRASE, ALICE);
    // Bob copies Alice's answer and anchors it first; it's wrong for him.
    expect(await submit(BOB, await runFor(BOB, "s2bobcopy", { body: `ANSWER: ${aliceAnswer}` }, { block: 400 }), live)).toMatchObject({ ok: true });
    // The phrase itself isn't an answer this season.
    expect(await submit(BOB, await runFor(BOB, "s2bobphrase", { body: `ANSWER: ${PHRASE}` }, { block: 410 }), live)).toMatchObject({ ok: false, error: expect.stringMatching(/16 hex/) });
    expect(await submit(ALICE, await runFor(ALICE, "s2alice", { body: `ANSWER: ${aliceAnswer}` }, { block: 500 }), live)).toMatchObject({ ok: true, submission: { season: "2" } });
    const bobFull = createHash("sha256").update(`${normaliseAnswer(PHRASE)}:${BOB}`).digest("hex");
    expect(await submit(BOB, await runFor(BOB, "s2bobright", { body: `answer: 0x${bobFull}` }, { block: 600 }), live)).toMatchObject({ ok: true });

    const r = await results({ now: s2.deadline + 1, fetch: chain, config: s2 });
    expect(r?.winner).toMatchObject({ owner: ALICE, runId: "s2alice", block: 500 });
    expect(r!.entries.map((e) => e.runId).sort()).toEqual(["s2alice", "s2bobcopy", "s2bobright"]);
    const byRun = Object.fromEntries(r!.entries.map((e) => [e.runId, e]));
    expect(byRun.s2bobcopy).toMatchObject({ correct: false });
    expect(byRun.s2bobright).toMatchObject({ correct: true, anchorOk: true });

    // Season 1 is history: still stored (the pre-season row reads as season 1), not judged in season 2.
    const one = await listSubmissions("1");
    expect(one.map((s) => s.runId)).toEqual(expect.arrayContaining(["rlegacy", "raliceok", "rbobforged"]));
    expect(one.every((s) => s.season === "1")).toBe(true);
    expect((await listSubmissions("2")).map((s) => s.runId).sort()).toEqual(["s2alice", "s2bobcopy", "s2bobright"]);
    expect((await listSubmissions()).length).toBe(one.length + 3);
    expect((await results({ now: config.deadline + 1, fetch: chain, config }))?.winner).toMatchObject({ runId: "raliceok" });
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
