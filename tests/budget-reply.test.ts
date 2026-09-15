import { describe, expect, it } from "vitest";
import { cadenceReply, plan } from "../src/moonlet/budget";
import type { JobSpec } from "../src/moonlet/spec";

const spec = { template: "market-watch", cadence: "12h", spendCapUsd: 0.5, objective: "watch", output: "brief" } as unknown as JobSpec;

describe("cadence reply", () => {
  it("confirms plainly when the bag can afford the cadence", () => {
    expect(cadenceReply("Sentry", spec, "6h", 5)).toBe("Done. Sentry now reports every 6 hours.");
    expect(plan({ ...spec, cadence: "6h" }, 1_000, 5).cadence).toBe("6h");
  });
  it("keeps the asked cadence and says plainly when the bag won't keep up", () => {
    const r = cadenceReply("Sentry", spec, "6h", 0.035);
    expect(r).toContain("now reports every 6 hours");
    expect(r).toContain("$0.04/day");
  });
});

describe("the schedule is the owner's", () => {
  it("runs on the cadence and cap the owner set, whatever the bag earns", () => {
    const watch = { ...spec, cadence: "12h" as const, spendCapUsd: 0.03 };
    const p = plan(watch, 1_112_000, 0.035);
    expect(p.quiet).toBe(false);
    expect(p.cadence).toBe("12h");
    expect(p.perRunCapUsd).toBe(0.03);
    expect(p.burnPerDayUsd).toBe(0.06);
  });
  it("never goes quiet on the size of the bag: the balance decides at run time", () => {
    expect(plan(spec, 0).quiet).toBe(false);
    expect(plan(spec, 1_000_000).quiet).toBe(false);
    expect(plan(spec, 0).perRunCapUsd).toBe(spec.spendCapUsd);
  });
  it("warns in plain words when the cap outruns the income, but keeps the cadence", () => {
    const r = cadenceReply("Sentry", { ...spec, spendCapUsd: 0.03 }, "6h", 0.035);
    expect(r).toContain("now reports every 6 hours");
    expect(r).toMatch(/draw the balance down/);
  });
});
