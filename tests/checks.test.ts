import { describe, expect, it } from "vitest";
import { compileJob } from "@/moonlet/compile";
import { runMoonlet } from "@/moonlet/runner";
import { JobSpec, type JobSpec as Spec } from "@/moonlet/spec";
import { fakeOrbio } from "./fakes";

const KEY = process.env.OPENROUTER_API_KEY!;
if (!KEY) throw new Error("OPENROUTER_API_KEY required");
const OWNER = "0x00000000000000000000000000000000000000dd";

describe("checks + memory (real model)", () => {
  it("compiler splits a watch sentence into 2-5 concrete checks with the right tools", async () => {
    const spec = await compileJob(KEY, {
      sentence: "Every 12 hours: watch $ORBIO price and liquidity, tell me about big transfers of ORBIO, and whether orbio.so/build changed.",
      template: "custom",
    });
    console.log("checks:", spec.checks, spec.tools, spec.cadence);
    expect(JobSpec.safeParse(spec).success).toBe(true);
    expect(spec.checks.length).toBeGreaterThanOrEqual(2);
    expect(spec.checks.length).toBeLessThanOrEqual(5);
    expect(spec.tools).toContain("token_market");
    expect(spec.tools.some((t) => t === "web_fetch" || t === "web_search")).toBe(true);
  }, 60_000);

  it("runs every check, reports one section each, remembers, and on the second run compares against memory", async () => {
    const spec: Spec = {
      name: "Sentry",
      template: "custom",
      objective: "Watch $ORBIO on Robinhood Chain and the Build Week page.",
      cadence: "12h",
      sources: ["$ORBIO", "https://www.orbio.so/build"],
      checks: ["$ORBIO price, liquidity and 24h volume vs last run", "Largest ORBIO transfers since last run", "Changes on https://www.orbio.so/build"],
      tools: ["token_market", "chain_read", "web_fetch", "deliver"],
      output: { kind: "brief", maxWords: 220, alwaysReport: true },
      voice: "terse, concrete, sources named, no hype",
      spendCapUsd: 0.06,
      model: "openai/gpt-5.6-terra", tripwire: null,
    };
    const orbio = fakeOrbio({ realKey: KEY });
    const r1 = await runMoonlet({ id: "m_c1", owner: OWNER, bag: 1_250_000, spec, delivery: {}, key: null }, { orbio: orbio.client });
    console.log("run1:", r1.status, r1.error, "\n", r1.output?.title, "\n", r1.output?.sections, "\nremember:", r1.output?.remember);
    expect(r1.status).toBe("done");
    expect(r1.output!.sections.length).toBe(3);
    expect(r1.output!.remember.length).toBeGreaterThan(20);

    const r2 = await runMoonlet({ id: "m_c1", owner: OWNER, bag: 1_250_000, spec, delivery: {}, key: r1.key, memory: r1.output!.remember }, { orbio: orbio.client });
    console.log("run2:", r2.status, r2.error, "\n", r2.output?.title, "\n", r2.output?.sections, "\nremember:", r2.output?.remember);
    expect(r2.status).toBe("done");
    expect(r2.output!.sections.length).toBe(3);
    // minutes apart: the page should be unchanged and the model should say so
    const page = r2.output!.sections.find((s) => /build|page|orbio\.so/i.test(s.check));
    expect(page?.changed).toBe(false);
  }, 240_000);
});

describe("wallet watch job (real model)", () => {
  it("'watch this wallet' → wallet_activity, a section, a remembered block cursor", async () => {
    const spec: Spec = {
      name: "Hawk",
      template: "custom",
      objective: "Watch wallet 0x8366a39cc670b4001a1121b8f6a443a643e40951 on Robinhood Chain and tell me its token movements.",
      cadence: "12h",
      sources: ["0x8366a39cc670b4001a1121b8f6a443a643e40951"],
      checks: ["Token transfers in and out of 0x8366a39cc670b4001a1121b8f6a443a643e40951 since last run, biggest first"],
      tools: ["chain_read", "token_market", "deliver"],
      output: { kind: "brief", maxWords: 160, alwaysReport: true },
      voice: "terse, concrete, sources named, no hype",
      spendCapUsd: 0.05,
      model: "openai/gpt-5.6-terra", tripwire: null,
    };
    const orbio = fakeOrbio({ realKey: KEY });
    const r = await runMoonlet({ id: "m_w1", owner: OWNER, bag: 1_250_000, spec, delivery: {}, key: null }, { orbio: orbio.client });
    console.log("wallet run:", r.status, r.error, "\n", r.output?.title, "\n", r.output?.summary, "\nremember:", r.output?.remember, "\n", r.trace.map((t) => t.summary.slice(0, 120)));
    expect(r.status).toBe("done");
    expect(r.trace.some((t) => t.summary.startsWith("wallet_activity"))).toBe(true);
    expect(r.output!.sections.length).toBe(1);
    expect(r.output!.remember).toMatch(/\d{8}/);
  }, 240_000);
});
