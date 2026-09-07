import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import * as store from "@/moonlet/store";
import { probeTripwires, readMetric, readRepoActivity, PROBE_EVERY_MS } from "@/moonlet/tripwire";
import { fallbackSpec } from "@/moonlet/compile";
import { runOne } from "@/moonlet/scheduler";
import { buildInstructions } from "@/moonlet/personality";
import type { JobSpec } from "@/moonlet/spec";

const OWNER = "0x00000000000000000000000000000000000000fb";

/** DexScreener that answers with whatever liquidity we set; counts calls so we can prove the probe is cheap. */
function fakeDex() {
  const state = { liquidity: 460_000, price: 0.0104, calls: 0 };
  const fetchImpl: typeof fetch = async (u) => {
    if (!String(u).includes("dexscreener")) return new Response("{}", { status: 404 });
    state.calls++;
    return Response.json({ pairs: [{ chainId: "robinhood", priceUsd: String(state.price), liquidity: { usd: state.liquidity }, volume: { h24: 38_000 } }, { chainId: "base", priceUsd: "1", liquidity: { usd: 9_999_999 } }] });
  };
  return { state, fetchImpl };
}

describe("tripwire: the cheap alert lane", () => {
  beforeAll(async () => {
    rmSync("/tmp/moonlet-tripwire.db", { force: true });
    process.env.DATABASE_URL = "file:/tmp/moonlet-tripwire.db";
    process.env.SECRET_KEY = "test";
    delete process.env.TELEGRAM_BOT_TOKEN;
    await store.migrate();
  });

  it("the fallback compiler turns 'ping me if liquidity drops 10%' into a tripwire with a 24h heartbeat", () => {
    const s = fallbackSpec({ sentence: "Ping me if $ORBIO liquidity drops 10%", template: "market-watch" });
    expect(s.tripwire).toEqual({ metric: "liquidity", target: "ORBIO", thresholdPct: 10 });
    expect(s.cadence).toBe("24h");
    expect(s.output.alwaysReport).toBe(false);
    expect(fallbackSpec({ sentence: "Every morning brief me on $ORBIO", template: "market-watch" }).tripwire).toBeNull();
    expect(fallbackSpec({ sentence: "tell me when wallet 0x8366a39cc670b4001a1121b8f6a443a643e40951 balance moves 5%", template: "market-watch" }).tripwire).toEqual({ metric: "wallet_balance", target: "0x8366a39cc670b4001a1121b8f6a443a643e40951", thresholdPct: 5 });
  });

  it("readMetric sums liquidity across the token's Robinhood pools and ignores other chains", async () => {
    const d = fakeDex();
    expect(await readMetric({ metric: "liquidity", target: "ORBIO", thresholdPct: 10 }, d.fetchImpl)).toBe(460_000);
    expect(await readMetric({ metric: "price", target: "ORBIO", thresholdPct: 10 }, d.fetchImpl)).toBe(0.0104);
    expect(await readMetric({ metric: "volume24h", target: "ORBIO", thresholdPct: 10 }, d.fetchImpl)).toBe(38_000);
  });

  it("probe: baseline first, no wake under the line, wake and early run past it, then a fresh baseline", async () => {
    const d = fakeDex();
    const spec: JobSpec = { name: "Tripwire", template: "market-watch", objective: "Ping me if $ORBIO liquidity drops 10%", cadence: "24h", sources: ["$ORBIO"], checks: [], tools: ["token_market", "deliver"], output: { kind: "alert", maxWords: 120, alwaysReport: false }, voice: "terse", spendCapUsd: 0.02, model: "auto", tripwire: { metric: "liquidity", target: "ORBIO", thresholdPct: 10 } };
    await store.setOwnerBag(OWNER, 1_250_000);
    const t0 = Date.now();
    await store.insertMoonlet({ id: "m_tw", owner: OWNER, name: "Tripwire", spec, status: "idle", delivery: {}, key: null, cadence: "24h", perRunCapUsd: 0.02, earnPerDayUsd: 30, burnPerDayUsd: 0.02, nextRunAt: t0 + 86_400_000, createdAt: t0 });

    expect(await probeTripwires(t0, d.fetchImpl)).toEqual([]);
    let m = (await store.getMoonlet("m_tw"))!;
    expect(m.watch).toMatchObject({ value: 460_000, at: t0 });
    expect(d.state.calls).toBe(1);

    // Too soon: no second request at all.
    expect(await probeTripwires(t0 + 60_000, d.fetchImpl)).toEqual([]);
    expect(d.state.calls).toBe(1);

    // 15 minutes later, a 4% dip: under the line, still asleep, baseline kept.
    d.state.liquidity = 441_600;
    expect(await probeTripwires(t0 + PROBE_EVERY_MS, d.fetchImpl)).toEqual([]);
    m = (await store.getMoonlet("m_tw"))!;
    expect(m.watch!.value).toBe(460_000);
    expect(m.nextRunAt).toBe(t0 + 86_400_000);

    // A 12% drop trips it: next run pulled to now, with the reason.
    d.state.liquidity = 404_800;
    const tripped = await probeTripwires(t0 + 2 * PROBE_EVERY_MS, d.fetchImpl);
    expect(tripped).toHaveLength(1);
    expect(tripped[0].detail).toMatch(/liquidity of ORBIO moved -12\.0% \(\$460,000 → \$404,800\), past your 10% line/);
    m = (await store.getMoonlet("m_tw"))!;
    expect(m.nextRunAt).toBe(t0 + 2 * PROBE_EVERY_MS);
    expect(d.state.calls).toBe(3);

    // The run it triggered carries the reason into the model's instructions and onto the run record; afterwards the trip is cleared and the next probe re-baselines.
    let seenTrip: string | undefined;
    await store.claimForRun("m_tw", t0 + 2 * PROBE_EVERY_MS);
    const r = await runOne("m_tw", {
      fetch: d.fetchImpl, anchor: null, bagOf: async () => 1_250_000, orbioFor: async () => ({} as never),
      run: async (mm) => { seenTrip = mm.tripped; return { ok: true, status: "done", costUsd: 0.01, model: "test", modelCalls: 1, durationMs: 10, keyEvents: [], trace: [], key: mm.key, plan: { cadence: "24h", perRunCapUsd: 0.02, burnPerDayUsd: 0.02, earnPerDayUsd: 30, quiet: false }, output: { title: "Liquidity fell 12%", summary: "s", body: "", sections: [], remember: "", sources: [], signal: "high", nothingHappened: false, calls: [], scored: [] } } as never; },
    });
    expect(r.status).toBe("done");
    expect(seenTrip).toMatch(/moved -12\.0%/);
    const run = (await store.listRuns("m_tw", 1))[0];
    expect(run.keyEvents[0]).toMatchObject({ kind: "tripwire" });
    expect(run.keyEvents[0].detail).toMatch(/woke early/);
    m = (await store.getMoonlet("m_tw"))!;
    expect(m.watch!.tripped).toBeUndefined();
    d.state.liquidity = 300_000;
    await probeTripwires(t0 + 3 * PROBE_EVERY_MS + 1, d.fetchImpl);
    m = (await store.getMoonlet("m_tw"))!;
    expect(m.watch!.value).toBe(300_000);
    expect(m.nextRunAt).toBeGreaterThan(t0 + 3 * PROBE_EVERY_MS);
  });

  it("the woken run is told what moved", () => {
    const spec = fallbackSpec({ sentence: "Ping me if $ORBIO liquidity drops 10%", template: "market-watch" });
    const text = buildInstructions(spec, { ownerShort: "0x…", bag: 1_000_000, runAt: "now", tripped: "liquidity of ORBIO moved -12.0% ($460,000 → $404,800), past your 10% line" });
    expect(text).toContain("woken early by your tripwire: liquidity of ORBIO moved -12.0%");
  });

  it("repo tripwire: the fallback compiler sets it for a repo watch; a new push wakes the moonlet, a quiet day does not", async () => {
    const s = fallbackSpec({ sentence: "Every night, summarise the day's commits and open issues in daraijaola/moonlet", template: "repo-mechanic" });
    expect(s.tripwire).toEqual({ metric: "repo_activity", target: "daraijaola/moonlet", thresholdPct: 1 });
    expect(fallbackSpec({ sentence: "Every night, summarise https://www.orbio.so/build", template: "digest" }).tripwire).toBeNull();

    const gh = { pushed: "2026-09-07T06:00:00Z", issue: "2026-09-07T05:00:00Z", calls: 0 };
    const f: typeof fetch = async (u, init) => {
      const url = String(u);
      if (!url.includes("api.github.com")) return new Response("{}", { status: 404 });
      gh.calls++;
      if ((init?.headers as Record<string, string>)?.authorization !== "Bearer ghp_x") return new Response("{}", { status: 404 });
      if (url.endsWith("/repos/daraijaola/moonlet")) return Response.json({ pushed_at: gh.pushed });
      return Response.json([{ updated_at: gh.issue }]);
    };
    const owner = "0x00000000000000000000000000000000000000fc";
    await store.setConnection(owner, "github", "@dara", { token: "ghp_x", login: "dara" });
    expect(await readRepoActivity("daraijaola/moonlet", "ghp_x", f)).toBe(Date.parse("2026-09-07T06:00:00Z"));
    expect(await readRepoActivity("not a repo", "ghp_x", f)).toBeNull();

    await store.setOwnerBag(owner, 1_250_000);
    const t0 = Date.now();
    await store.insertMoonlet({ id: "m_rtw", owner, name: "Micheal", spec: s, status: "idle", delivery: {}, key: null, cadence: "24h", perRunCapUsd: 0.02, earnPerDayUsd: 30, burnPerDayUsd: 0.02, nextRunAt: t0 + 86_400_000, createdAt: t0 });
    await probeTripwires(t0, f);
    expect((await store.getMoonlet("m_rtw"))!.watch!.value).toBe(Date.parse("2026-09-07T06:00:00Z"));
    await probeTripwires(t0 + PROBE_EVERY_MS, f);
    expect((await store.getMoonlet("m_rtw"))!.nextRunAt).toBe(t0 + 86_400_000);
    gh.issue = "2026-09-07T06:30:00Z";
    const tripped = await probeTripwires(t0 + 2 * PROBE_EVERY_MS, f);
    expect(tripped.map((t) => t.id)).toEqual(["m_rtw"]);
    expect(tripped[0].detail).toMatch(/daraijaola\/moonlet has new activity/);
    expect((await store.getMoonlet("m_rtw"))!.nextRunAt).toBe(t0 + 2 * PROBE_EVERY_MS);
  });
});
