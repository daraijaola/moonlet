import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { plan } from "@/moonlet/budget";
import { runOne, tick } from "@/moonlet/scheduler";
import type { JobSpec } from "@/moonlet/spec";
import * as store from "@/moonlet/store";
import { fakeOrbio } from "./fakes";

const KEY = process.env.OPENROUTER_API_KEY!;
const ORBIO_CA = "0xAa07A0e9209e16aC99708C3EC70159c6eF3128A3";

const spec: JobSpec = {
  name: "Swarm",
  template: "market-watch",
  objective: `One-paragraph brief on $ORBIO (${ORBIO_CA}): price and 24h change only.`,
  cadence: "6h",
  sources: ["$ORBIO"],
  checks: [],
  tools: ["token_market", "deliver"],
  output: { kind: "brief", maxWords: 60, alwaysReport: true },
  voice: "one sentence",
  spendCapUsd: 0.012,
  model: "auto",
};

const N = 20;
const owners = Array.from({ length: N }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`);
const orbios = new Map(owners.map((o) => [o, fakeOrbio({ realKey: KEY, balanceUsd: 5 })]));

describe("scheduler", () => {
  beforeAll(async () => {
    rmSync("/tmp/moonlet-test.db", { force: true });
    await store.migrate();
    const now = Date.now();
    for (const o of owners) {
      const bag = 1_250_000;
      const p = plan(spec, bag);
      await store.setOwnerBag(o, bag);
      await store.insertMoonlet({
        id: store.newId("m"), owner: o, name: spec.name, spec, status: "idle", delivery: {}, key: null,
        cadence: p.cadence, perRunCapUsd: p.perRunCapUsd, earnPerDayUsd: p.earnPerDayUsd, burnPerDayUsd: p.burnPerDayUsd,
        nextRunAt: now - 1000, createdAt: now,
      });
    }
  });

  it(`7. ${N} concurrent due moonlets run once each, bounded spend, no double-claims`, async () => {
    const t0 = Date.now();
    const deps = {
      orbioFor: async (o: string) => orbios.get(o)!.client,
      bagOf: async () => 1_250_000,
      anchor: null,
    };
    const [a, b] = await Promise.all([tick(deps, N), tick(deps, N)]);
    const results = [...a, ...b];
    const all = await store.listMoonlets();
    const runs = (await Promise.all(all.map((m) => store.listRuns(m.id)))).flat();
    const done = runs.filter((r) => r.status === "done");
    const cost = runs.reduce((s, r) => s + r.costUsd, 0);
    console.log(`tick x2: ${results.length} executions, ${runs.length} runs, ${done.length} done, ${runs.filter((r) => r.status === "failed").length} failed, $${cost.toFixed(4)} total, ${Date.now() - t0}ms`);
    for (const r of runs.filter((r) => r.status === "failed")) console.log("  failed:", r.error);
    expect(results.length).toBe(N);
    expect(runs.length).toBe(N);
    expect(done.length).toBeGreaterThanOrEqual(N - 2);
    expect(cost).toBeLessThan(N * 0.012 * 3);
    expect(all.every((m) => m.status === "idle" && m.runsTotal === 1 && m.nextRunAt > Date.now())).toBe(true);
    expect(all.every((m) => m.key?.key === KEY)).toBe(true);
  });

  it("8. a second tick with nothing due does nothing", async () => {
    const r = await tick({ orbioFor: async (o) => orbios.get(o)!.client, bagOf: async () => 1_250_000, anchor: null }, N);
    expect(r.length).toBe(0);
  });

  it("9. owner sells below the floor → next run goes quiet and records why; top-up wakes it", async () => {
    const m = (await store.listMoonlets(owners[0]))[0];
    await store.updateMoonlet(m.id, { nextRunAt: Date.now() - 1 });
    await store.claimForRun(m.id);
    const quiet = await runOne(m.id, { orbioFor: async () => orbios.get(owners[0])!.client, bagOf: async () => 500, anchor: null });
    expect(quiet.status).toBe("quiet");
    const after = await store.getMoonlet(m.id);
    expect(after?.status).toBe("quiet");
    const last = (await store.listRuns(m.id))[0];
    expect(last.status).toBe("quiet");
    expect(last.summary).toMatch(/below 1000|below 1,000/);
    expect(last.costUsd).toBe(0);

    await store.updateMoonlet(m.id, { nextRunAt: Date.now() - 1 });
    await store.claimForRun(m.id);
    const back = await runOne(m.id, { orbioFor: async () => orbios.get(owners[0])!.client, bagOf: async () => 2_000_000, anchor: null });
    expect(back.status).toBe("done");
    expect((await store.getMoonlet(m.id))?.status).toBe("idle");
  });

  it("10. Orbio disconnected → failed run with a clear message, moonlet parked quiet", async () => {
    const m = (await store.listMoonlets(owners[1]))[0];
    await store.updateMoonlet(m.id, { nextRunAt: Date.now() - 1 });
    await store.claimForRun(m.id);
    const r = await runOne(m.id, { orbioFor: async () => null, bagOf: async () => 1_250_000, anchor: null });
    expect(r.status).toBe("failed");
    expect((await store.listRuns(m.id))[0].error).toMatch(/Orbio not connected/);
    expect((await store.getMoonlet(m.id))?.status).toBe("quiet");
  });

  it("12. a second moonlet on a wallet whose balance is already inside a key borrows that key instead of going quiet", async () => {
    const owner = "0x0000000000000000000000000000000000000c0d";
    const orbio = fakeOrbio({ realKey: KEY, balanceUsd: 6 });
    const now = Date.now();
    const p = plan(spec, 1_250_000);
    const mk = (id: string, key: typeof spec extends never ? never : { key: string; limitUsd: number; spentUsd: number } | null) =>
      store.insertMoonlet({ id, owner, name: id, spec, status: "idle", delivery: {}, key, cadence: p.cadence, perRunCapUsd: p.perRunCapUsd, earnPerDayUsd: p.earnPerDayUsd, burnPerDayUsd: p.burnPerDayUsd, nextRunAt: now - 1000, createdAt: now });
    // First moonlet already holds the wallet's key (claimed everything).
    await orbio.client.claimKey(6);
    await mk("m_first", { key: KEY, limitUsd: 6, spentUsd: 0.2 });
    await mk("m_second", null);
    const deps = { orbioFor: async () => orbio.client, bagOf: async () => 1_250_000, anchor: null };
    await store.claimForRun("m_second");
    const r = await runOne("m_second", deps);
    const second = await store.getMoonlet("m_second");
    console.log("second moonlet:", r.status, second?.key && "has key", orbio.state.calls);
    expect(r.status).toBe("done");
    expect(second?.key?.key).toBe(KEY);
    // it borrowed, so no rotate happened and the first moonlet's key still works
    expect(orbio.state.calls.filter((c) => c === "rotate").length).toBe(0);
  }, 120_000);

  it("11. secrets are sealed at rest", async () => {
    const m = (await store.listMoonlets(owners[2]))[0];
    const raw = await store.db().execute({ sql: "SELECT key FROM moonlets WHERE id=?", args: [m.id] });
    const stored = String(raw.rows[0].key);
    expect(stored.startsWith("v1.")).toBe(true);
    expect(stored.includes(KEY)).toBe(false);
    expect(m.key?.key).toBe(KEY);
  });
});
