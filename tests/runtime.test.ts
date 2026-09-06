import { describe, expect, it } from "vitest";
import { compileJob, fallbackSpec } from "@/moonlet/compile";
import { plan } from "@/moonlet/budget";
import { runMoonlet } from "@/moonlet/runner";
import { encodeAnchor, ANCHOR_TO } from "@/moonlet/anchor";
import { JobSpec, type JobSpec as Spec } from "@/moonlet/spec";
import { decodeAbiParameters } from "viem";
import { fakeOrbio } from "./fakes";

const KEY = process.env.OPENROUTER_API_KEY!;
if (!KEY) throw new Error("OPENROUTER_API_KEY required");
const OWNER = "0x7a3f9c21bd4e8f10a2b6c9d3e5f7a1b2c3d4e9c2";
const ORBIO_CA = "0xAa07A0e9209e16aC99708C3EC70159c6eF3128A3";

const marketWatch: Spec = {
  name: "Lumen",
  template: "market-watch",
  objective: `Brief me on $ORBIO (${ORBIO_CA}) on Robinhood Chain: price, liquidity, volume and holder changes in the last day.`,
  cadence: "6h",
  sources: ["$ORBIO", ORBIO_CA],
  checks: [],
  tools: ["token_market", "chain_read", "deliver"],
  output: { kind: "brief", maxWords: 150, alwaysReport: true },
  voice: "terse, concrete, sources named, no hype",
  spendCapUsd: 0.03,
  model: "auto",
};

describe("compile", () => {
  it("turns a sentence into a valid JobSpec on a real model", async () => {
    const spec = await compileJob(KEY, {
      sentence: "Ping me on Telegram if $ORBIO liquidity moves 10% in either direction.",
      template: "market-watch",
    });
    expect(JobSpec.safeParse(spec).success).toBe(true);
    expect(spec.output.alwaysReport).toBe(false);
    expect(spec.tools).toContain("deliver");
    expect(["1h", "4h", "15m"]).toContain(spec.cadence);
    console.log("compiled:", JSON.stringify(spec));
  });

  it("fallback spec is valid without a model", () => {
    const s = fallbackSpec({ sentence: `Watch ${ORBIO_CA} and tell me when whales move`, template: "market-watch" });
    expect(JobSpec.safeParse(s).success).toBe(true);
    expect(s.sources).toContain(ORBIO_CA);
    expect(s.output.alwaysReport).toBe(false);
  });
});

describe("runner", () => {
  it("1. real run: mints the account key, runs the job, returns valid hashed output under cap", async () => {
    const orbio = fakeOrbio({ realKey: KEY });
    const r = await runMoonlet({ id: "m_t1", owner: OWNER, bag: 1_250_000, spec: marketWatch, delivery: {}, key: null }, { orbio: orbio.client });
    console.log("run1:", r.status, r.error, "cost", r.costUsd, "calls", r.modelCalls, "ms", r.durationMs, "\n", r.output?.title, "\n", r.output?.summary);
    expect(r.status).toBe("done");
    expect(r.output?.title.length).toBeGreaterThan(2);
    expect(r.outputHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(r.keyEvents.map((e) => e.kind)).toContain("claimed");
    expect(orbio.state.calls).toEqual(expect.arrayContaining(["status", "balance", "create"]));
    expect(r.costUsd).toBeLessThan(r.plan.perRunCapUsd * 4);
    expect(r.trace.map((t) => t.tool)).not.toContain("spawn_moonlet");
  });

  it("2. cost cap stops a greedy job and still yields output", async () => {
    const orbio = fakeOrbio({ realKey: KEY });
    const greedy: Spec = {
      ...marketWatch,
      objective: "Compare ORBIO against every other token on Robinhood Chain one by one, fetching holders, transfers and market data for each, exhaustively.",
      spendCapUsd: 0.012,
    };
    const r = await runMoonlet({ id: "m_t2", owner: OWNER, bag: 1_250_000, spec: greedy, delivery: {}, key: null }, { orbio: orbio.client });
    console.log("run2:", r.status, r.error, "cap", r.plan.perRunCapUsd, "cost", r.costUsd, "calls", r.modelCalls);
    expect(r.plan.perRunCapUsd).toBe(0.012);
    expect(["done", "failed"]).toContain(r.status);
    expect(r.costUsd).toBeLessThan(0.012 * 4);
    if (r.status === "done") expect(r.output).toBeDefined();
  });

  it("3. key rejected mid-run → re-mints the Orbio key and retries", async () => {
    const orbio = fakeOrbio({ realKey: KEY, failFirstKey: true });
    const r = await runMoonlet({ id: "m_t3", owner: OWNER, bag: 1_250_000, spec: marketWatch, delivery: {}, key: null }, { orbio: orbio.client });
    console.log("run3:", r.status, r.error, r.keyEvents);
    expect(r.status).toBe("done");
    expect(r.keyEvents.map((e) => e.kind)).toContain("rotated");
    expect(orbio.state.mints).toBe(2);
    expect(r.key?.key).toBe(KEY);
  });

  it("4. bag below 1,000 → quiet, zero spend, no model calls", async () => {
    const orbio = fakeOrbio({ realKey: KEY });
    const r = await runMoonlet({ id: "m_t4", owner: OWNER, bag: 800, spec: marketWatch, delivery: {}, key: null }, { orbio: orbio.client });
    expect(r.status).toBe("quiet");
    expect(r.costUsd).toBe(0);
    expect(r.modelCalls).toBe(0);
    expect(orbio.state.calls).toEqual([]);
  });

  it("5. tools returning garbage → run still completes with honest output", async () => {
    const orbio = fakeOrbio({ realKey: KEY });
    const real = fetch;
    // break only the data tools, not the model endpoint
    const broken: typeof fetch = async (input, init) => (/orbio\.so\/api\/v1|openrouter\.ai/.test(String(input)) ? real(input, init) : new Response("<html>502</html>", { status: 502 }));
    const r = await runMoonlet({ id: "m_t5", owner: OWNER, bag: 1_250_000, spec: marketWatch, delivery: {}, key: null }, { orbio: orbio.client, fetch: broken });
    console.log("run5:", r.status, r.error, "\n", r.output?.summary);
    expect(r.status).toBe("done");
    expect(r.output).toBeDefined();
  });

  it("6. holder's balance is $0 but a legacy OpenRouter key still holds money → folded into the balance, account key minted, run happens", async () => {
    const orbio = fakeOrbio({ realKey: KEY, balanceUsd: 0.01, legacy: { remainingUsd: 8 } });
    const r = await runMoonlet({ id: "m_t6", owner: OWNER, bag: 1_250_000, spec: marketWatch, delivery: {}, key: null }, { orbio: orbio.client });
    console.log("run6:", r.status, r.error, r.keyEvents.map((e) => e.detail));
    expect(r.status).toBe("done");
    expect(orbio.state.calls).toEqual(expect.arrayContaining(["delete_legacy", "create"]));
    expect(r.keyEvents.map((e) => e.kind)).toEqual(expect.arrayContaining(["topped_up", "claimed"]));
    expect(r.key?.key).toBe(KEY);
  });

  it("6b. a moonlet still on a legacy key with room keeps using it; once nearly dry it moves to the account key", async () => {
    const orbio = fakeOrbio({ realKey: KEY, balanceUsd: 5, legacy: { remainingUsd: 3 } });
    const r = await runMoonlet({ id: "m_t6b", owner: OWNER, bag: 1_250_000, spec: marketWatch, delivery: {}, key: { key: KEY, limitUsd: 3.5, spentUsd: 0.5 } }, { orbio: orbio.client });
    expect(r.status).toBe("done");
    expect(orbio.state.calls).not.toContain("create");
    orbio.state.legacy!.remainingUsd = 0.005;
    const r2 = await runMoonlet({ id: "m_t6b", owner: OWNER, bag: 1_250_000, spec: marketWatch, delivery: {}, key: { key: KEY, limitUsd: 3.5, spentUsd: 3.495 } }, { orbio: orbio.client });
    console.log("run6b:", r2.status, r2.keyEvents.map((e) => e.detail));
    expect(r2.status).toBe("done");
    expect(orbio.state.calls).toContain("create");
  });

  it("8. 'summarise my repository moonlet' with GitHub connected → resolves the repo itself and reports", async () => {
    const gh = process.env.GITHUB_TOKEN;
    if (!gh) return;
    const orbio = fakeOrbio({ realKey: KEY });
    const spec: Spec = { ...marketWatch, name: "Micheal", template: "repo-mechanic", objective: "Give me a summarization on what my repository moonlet is about", sources: [], tools: ["github_read", "web_fetch", "deliver"], output: { kind: "digest", maxWords: 220, alwaysReport: false }, spendCapUsd: 0.05, model: "openai/gpt-5.6-terra" };
    const login = ((await (await fetch("https://api.github.com/user", { headers: { authorization: `Bearer ${gh}` } })).json()) as { login: string }).login;
    const r = await runMoonlet({ id: "m_t8", owner: OWNER, bag: 1_250_000, spec, delivery: {}, key: null, connections: { github: { token: gh, login } } }, { orbio: orbio.client });
    console.log("run8:", r.status, r.error, "\n", r.output?.title, "\n", r.output?.summary, "\n", r.trace.map((t) => t.summary));
    expect(r.status).toBe("done");
    expect(r.trace.some((t) => /^repos/.test(t.summary))).toBe(true);
    expect(r.output?.nothingHappened).toBe(false);
    expect(r.output?.summary.toLowerCase()).toMatch(/moonlet|orbio|agent/);
  });

  it("9. a job that calls for a separate watcher → the moonlet proposes a child (once) and says it awaits approval", async () => {
    process.env.DATABASE_URL = "file:/tmp/moonlet-runtime.db";
    process.env.SECRET_KEY = "test";
    const store = await import("@/moonlet/store");
    const orbio = fakeOrbio({ realKey: KEY });
    const spec: Spec = {
      ...marketWatch,
      name: "Scout",
      objective: `Find the single largest recent $ORBIO (${ORBIO_CA}) transfer on Robinhood Chain and set up a separate moonlet that watches that wallet's ORBIO moves from now on. Report the wallet, the amount, and that the watcher awaits my approval.`,
      spendCapUsd: 0.05,
      model: "openai/gpt-5.6-terra",
    };
    const r = await runMoonlet({ id: "m_t9", owner: OWNER, bag: 1_250_000, spec, delivery: {}, key: null, runId: null }, { orbio: orbio.client });
    console.log("run9:", r.status, r.error, "\n", r.output?.title, "\n", r.output?.summary, "\n", r.trace.map((t) => `${t.tool}: ${t.summary}`));
    expect(r.status).toBe("done");
    const spawns = r.trace.filter((t) => t.tool === "spawn_moonlet");
    expect(spawns).toHaveLength(1);
    expect(spawns[0].summary).toMatch(/^pending · p_/);
    const pending = await store.listProposals(OWNER, "pending");
    expect(pending.some((p) => p.kind === "spawn_moonlet" && p.moonletId === "m_t9")).toBe(true);
    const payload = pending.find((p) => p.kind === "spawn_moonlet")!.payload as { spec: Spec; reason: string };
    expect(payload.spec.sources.join(" ")).toMatch(/0x[0-9a-fA-F]{40}/);
    expect(payload.reason.length).toBeGreaterThan(8);
    expect(r.output?.summary.toLowerCase()).toMatch(/approv|awaiting|pending/);
  }, 180_000);

  it("delivery tool refuses channels the owner didn't configure, and uses the sink when they did", async () => {
    const orbio = fakeOrbio({ realKey: KEY });
    const sent: string[] = [];
    const alertSpec: Spec = { ...marketWatch, output: { kind: "alert", maxWords: 60, alwaysReport: true }, objective: "Send the owner a one-line Telegram hello with the current $ORBIO price, then finish." };
    const r = await runMoonlet(
      { id: "m_t7", owner: OWNER, bag: 1_250_000, spec: alertSpec, delivery: { telegram: "@dara" }, key: null },
      { orbio: orbio.client, deliver: async ({ channel, text }) => { sent.push(`${channel}:${text}`); return { ok: true, id: "1" }; } },
    );
    console.log("run7:", r.status, sent);
    expect(r.status).toBe("done");
    expect(sent.length).toBeGreaterThanOrEqual(1);
    expect(sent[0].startsWith("telegram:")).toBe(true);
  });
});

describe("budget", () => {
  it("slows cadence before going quiet", () => {
    const p = plan({ ...marketWatch, cadence: "15m" }, 5_000);
    expect(p.quiet).toBe(false);
    expect(p.cadence).not.toBe("15m");
    expect(p.perRunCapUsd).toBeGreaterThanOrEqual(0.012);
    expect(plan(marketWatch, 999).quiet).toBe(true);
    const tiny = plan({ ...marketWatch, template: "repo-mechanic" }, 1_000);
    expect(tiny.quiet).toBe(false);
    expect(["24h", "7d"]).toContain(tiny.cadence);
  });
});

describe("anchor", () => {
  it("encodes a decodable payload", () => {
    const hash = `0x${"ab".repeat(32)}` as const;
    const data = encodeAnchor({ moonletId: "m_x", runId: "run_y", outputHash: hash, costUsd: 0.0123, at: 1_700_000_000_000 });
    const [mid, rid, h, cost, at] = decodeAbiParameters(
      [{ type: "string" }, { type: "string" }, { type: "bytes32" }, { type: "uint64" }, { type: "uint64" }],
      data,
    );
    expect([mid, rid, h]).toEqual(["m_x", "run_y", hash]);
    expect(Number(cost)).toBe(12300);
    expect(Number(at)).toBe(1_700_000_000);
    expect(ANCHOR_TO).toMatch(/^0x[0-9a-f]{40}$/);
  });
});
