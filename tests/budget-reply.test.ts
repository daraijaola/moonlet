import { describe, expect, it } from "vitest";
import { cadenceReply, plan } from "../src/moonlet/budget";
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
