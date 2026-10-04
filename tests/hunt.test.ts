import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import * as store from "@/moonlet/store";
import { encodeAnchor } from "@/moonlet/anchor";
import { answerSha, extractAnswer, huntPhase, normaliseAnswer, results, submit, type HuntConfig } from "@/moonlet/hunt";
import type { JobSpec } from "@/moonlet/spec";

/**
 * The hunt is decided by hashes and anchor transactions, so these tests pin the rules: answers are normalised, only an
 * owner's finished, anchored run with an ANSWER line can be entered, nothing is judged before the deadline, and at the
 * deadline the earliest block wins among entries whose anchor really commits to that run's output hash.
 */

const ALICE = "0x" + "a1".repeat(20), BOB = "0x" + "b2".repeat(20);
const RIGHT = "The Sleepy Moonlet dreams of a fjord";
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
});

describe("hunt", () => {
  it("normalises answers so case, quotes and punctuation don't matter, and finds ANSWER: anywhere in a report", () => {
    expect(normaliseAnswer('  "The Sleepy  Moonlet dreams of a FJORD."  ')).toBe("the sleepy moonlet dreams of a fjord");
    expect(answerSha("the sleepy moonlet dreams of a fjord!")).toBe(answerSha(RIGHT));
    expect(extractAnswer({ title: "Solved", summary: "", body: "Stage three done.\nANSWER: the sleepy moonlet dreams of a fjord\nbye" })).toBe("the sleepy moonlet dreams of a fjord");
    expect(extractAnswer({ title: "x", summary: "", body: "", sections: [{ finding: "answer： The Sleepy Moonlet Dreams Of A Fjord" }] })).toBe("the sleepy moonlet dreams of a fjord");
    expect(extractAnswer({ title: "no answer here", summary: "", body: "" })).toBeNull();
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
