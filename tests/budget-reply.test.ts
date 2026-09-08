import { describe, expect, it } from "vitest";
import { activeSiblings, cadenceReply, plan, spendablePerDay } from "../src/moonlet/budget";
import type { JobSpec } from "../src/moonlet/spec";

const spec = { template: "market-watch", cadence: "12h", spendCapUsd: 0.5, objective: "watch", output: "brief" } as unknown as JobSpec;

describe("cadence reply", () => {
  it("confirms plainly when the bag can afford the cadence", () => {
    expect(cadenceReply("Sentry", spec, "6h", 5)).toBe("Done. Sentry now reports every 6 hours.");
    expect(plan({ ...spec, cadence: "6h" }, 1_000, 5).cadence).toBe("6h");
  });
  it("says what will really happen when income only pays for a slower cadence", () => {
    const earn = 0.035;
    const effective = plan({ ...spec, cadence: "6h" }, 1_000, earn).cadence;
    expect(effective).not.toBe("6h");
    const r = cadenceReply("Sentry", spec, "6h", earn);
    expect(r).toContain("set to every 6 hours");
    expect(r).toContain("$0.04/day");
    expect(r).toMatch(/It will run (every 12 hours|daily|weekly)/);
  });
});

describe("one wallet, several moonlets", () => {
  const watch = { ...spec, template: "market-watch" as const, cadence: "12h" as const, spendCapUsd: 0.03, model: "auto" as const };
  it("the income is split evenly, so a sibling that planned first cannot starve the others", () => {
    // The prod wallet: ~1.1M ORBIO earning 3.5¢/day (Orbio's live figure); alone that pays a market-watch run daily.
    const alone = plan(watch, 1_112_000, 0.035);
    expect(alone.quiet).toBe(false);
    // Five moonlets on the same bag: each still gets a (weekly) run instead of the last three going quiet.
    const shared = plan(watch, 1_112_000, 0.035, 4);
    expect(shared.quiet).toBe(false);
    expect(shared.cadence).toBe("7d");
    expect(shared.perRunCapUsd).toBeGreaterThanOrEqual(0.012);
    expect(shared.burnPerDayUsd * 5).toBeLessThanOrEqual(spendablePerDay(alone.earnPerDayUsd) + 1e-9);
  });
  it("quiet and idle siblings count as sharers; paused and deleted ones don't", () => {
    const sibs = [{ id: "a", status: "idle" }, { id: "b", status: "quiet" }, { id: "c", status: "paused" }, { id: "d", status: "deleted" }, { id: "me", status: "idle" }];
    expect(activeSiblings(sibs, "me")).toBe(2);
  });
});
