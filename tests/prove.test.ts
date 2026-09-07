import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import * as store from "@/moonlet/store";
import { runOne } from "@/moonlet/scheduler";
import { runMoonlet, hashOutput } from "@/moonlet/runner";
import { buildInstructions } from "@/moonlet/personality";
import type { JobSpec } from "@/moonlet/spec";
import { fakeOrbio } from "./fakes";

/**
 * Prove: a moonlet ends a run with a checkable call about the next one, and
 * the next run scores it. Both sides live in the hashed output, so the receipt
 * on chain holds the call before the outcome.
 */

const KEY = process.env.OPENROUTER_API_KEY!;
const OWNER = "0x00000000000000000000000000000000000000fa";
const spec: JobSpec = { name: "Tide", template: "market-watch", objective: "Watch $ORBIO liquidity and volume.", cadence: "6h", sources: ["$ORBIO"], checks: ["$ORBIO price, liquidity and 24h volume vs last run"], tools: ["token_market", "deliver"], output: { kind: "brief", maxWords: 120, alwaysReport: true }, voice: "terse", spendCapUsd: 0.04, model: "auto" };

describe("prove: calls and scores", () => {
  beforeAll(async () => {
    rmSync("/tmp/moonlet-prove.db", { force: true });
    process.env.DATABASE_URL = "file:/tmp/moonlet-prove.db";
    process.env.SECRET_KEY = "test";
    delete process.env.TELEGRAM_BOT_TOKEN;
    await store.migrate();
  });

  it("the call is in the hash; the same report with a different call hashes differently", () => {
    const base = { title: "ORBIO steady", summary: "s", body: "", sections: [], remember: "x", sources: [], signal: "low" as const, nothingHappened: false, scored: [] };
    const a = hashOutput({ ...base, calls: [{ claim: "liquidity above $450K", check: "token_market" }] });
    const b = hashOutput({ ...base, calls: [{ claim: "liquidity above $500K", check: "token_market" }] });
    expect(a).not.toBe(b);
    expect(hashOutput({ ...base, calls: [{ claim: "liquidity above $450K", check: "token_market" }], remember: "different notes" })).toBe(a);
  });

  it("open calls and the record reach the instructions; inbox jobs are told not to call", () => {
    const text = buildInstructions(spec, { ownerShort: "0x…", bag: 1_000_000, runAt: "now", openCalls: [{ claim: "liquidity above $450K", check: "token_market liquidityUsd", madeAt: 1_788_000_000_000 }], record: { hits: 3, misses: 1 } });
    expect(text).toContain('Open calls from your last run, to score now in `scored`');
    expect(text).toContain("liquidity above $450K");
    expect(text).toContain("3 hits, 1 miss.");
    const fresh = buildInstructions(spec, { ownerShort: "0x…", bag: 1_000_000, runAt: "now" });
    expect(fresh).toContain("No open calls.");
    const inbox = buildInstructions({ ...spec, template: "inbox", tools: ["gmail_read", "deliver"] }, { ownerShort: "0x…", bag: 1_000_000, runAt: "now" });
    expect(inbox).not.toContain("No open calls.");
  });

  it("scheduler: calls made this run wait as open; the next run's scores settle into hits and misses", async () => {
    await store.setOwnerBag(OWNER, 1_250_000);
    const now = Date.now();
    await store.insertMoonlet({ id: "m_prove", owner: OWNER, name: "Tide", spec, status: "idle", delivery: {}, key: null, cadence: "6h", perRunCapUsd: 0.04, earnPerDayUsd: 30, burnPerDayUsd: 0.16, nextRunAt: now - 1000, createdAt: now });
    const fake = (calls: Array<{ claim: string; check: string }>, scored: Array<{ claim: string; result: "hit" | "miss" | "void"; evidence: string }>) =>
      async (m: { key: unknown; openCalls?: unknown[] }) => ({ ok: true, status: "done", costUsd: 0.01, model: "test", modelCalls: 1, durationMs: 50, keyEvents: [], trace: [], key: m.key, plan: { cadence: "6h", perRunCapUsd: 0.04, burnPerDayUsd: 0.16, earnPerDayUsd: 30, quiet: false }, outputHash: "0x" + "cd".repeat(32), output: { title: "t", summary: "s", body: "", sections: [], remember: "", sources: [], signal: "low", nothingHappened: false, calls, scored } }) as never;
    const deps = { anchor: null, bagOf: async () => 1_250_000, orbioFor: async () => ({} as never) };

    await store.claimForRun("m_prove", now);
    let seenOpen: unknown[] | undefined;
    await runOne("m_prove", { ...deps, run: async (m) => { seenOpen = m.openCalls; return fake([{ claim: "ORBIO liquidity stays above $450K", check: "token_market liquidityUsd" }], [])(m); } });
    expect(seenOpen).toEqual([]);
    let m = (await store.getMoonlet("m_prove"))!;
    expect(m.openCalls).toHaveLength(1);
    expect(m.openCalls[0]).toMatchObject({ claim: "ORBIO liquidity stays above $450K", check: "token_market liquidityUsd" });
    expect(m.hits + m.misses).toBe(0);
    expect((await store.listRuns("m_prove", 1))[0].calls).toEqual([{ claim: "ORBIO liquidity stays above $450K", check: "token_market liquidityUsd" }]);

    await store.updateMoonlet("m_prove", { nextRunAt: now - 1000, status: "idle" });
    await store.claimForRun("m_prove", now);
    await runOne("m_prove", { ...deps, run: async (m) => { seenOpen = m.openCalls; return fake([{ claim: "volume above $30K", check: "token_market volume24h" }], [{ claim: "ORBIO liquidity stays above $450K", result: "hit", evidence: "$461K" }])(m); } });
    expect((seenOpen as Array<{ claim: string }>)[0].claim).toBe("ORBIO liquidity stays above $450K");
    m = (await store.getMoonlet("m_prove"))!;
    expect(m.hits).toBe(1);
    expect(m.misses).toBe(0);
    expect(m.openCalls[0].claim).toBe("volume above $30K");
    const last = (await store.listRuns("m_prove", 1))[0];
    expect(last.scored).toEqual([{ claim: "ORBIO liquidity stays above $450K", result: "hit", evidence: "$461K" }]);

    await store.updateMoonlet("m_prove", { nextRunAt: now - 1000, status: "idle" });
    await store.claimForRun("m_prove", now);
    await runOne("m_prove", { ...deps, run: fake([], [{ claim: "volume above $30K", result: "miss", evidence: "$18K" }]) });
    m = (await store.getMoonlet("m_prove"))!;
    expect({ hits: m.hits, misses: m.misses, open: m.openCalls.length }).toEqual({ hits: 1, misses: 1, open: 0 });
  });

  it("real model: a market-watch run ends with one checkable call, and the next run scores it with a number", async () => {
    if (!KEY) throw new Error("OPENROUTER_API_KEY required");
    const orbio = fakeOrbio({ realKey: KEY });
    const r1 = await runMoonlet({ id: "m_pv", owner: OWNER, bag: 1_250_000, spec: { ...spec, model: "openai/gpt-5.6-terra", spendCapUsd: 0.06 }, delivery: {}, key: null }, { orbio: orbio.client });
    console.log("prove1:", r1.status, r1.output?.title, "| calls:", JSON.stringify(r1.output?.calls), "| scored:", JSON.stringify(r1.output?.scored));
    expect(r1.status).toBe("done");
    expect(r1.output!.calls.length).toBe(1);
    expect(r1.output!.calls[0].claim).toMatch(/\d/);
    expect(r1.output!.scored).toEqual([]);

    const r2 = await runMoonlet({ id: "m_pv", owner: OWNER, bag: 1_250_000, spec: { ...spec, model: "openai/gpt-5.6-terra", spendCapUsd: 0.06 }, delivery: {}, key: r1.key, memory: r1.output!.remember, openCalls: r1.output!.calls.map((c) => ({ ...c, madeAt: Date.now() - 60_000 })), record: { hits: 0, misses: 0 } }, { orbio: orbio.client });
    console.log("prove2:", r2.status, r2.output?.title, "| calls:", JSON.stringify(r2.output?.calls), "| scored:", JSON.stringify(r2.output?.scored));
    expect(r2.status).toBe("done");
    expect(r2.output!.scored.length).toBe(1);
    expect(["hit", "miss", "void"]).toContain(r2.output!.scored[0].result);
    expect(r2.output!.scored[0].evidence).toMatch(/\d/);
  }, 240_000);
});
