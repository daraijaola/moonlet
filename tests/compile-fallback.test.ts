import { describe, expect, it } from "vitest";
import { extractSources, fallbackSpec } from "@/moonlet/compile";
import { JobSpec } from "@/moonlet/spec";

describe("fallbackSpec", () => {
  it("treats a liquidity ping as an alert and keeps $ORBIO", () => {
    const s = fallbackSpec({ sentence: "Ping me if $ORBIO liquidity moves 10%.", template: "market-watch" });
    expect(JobSpec.safeParse(s).success).toBe(true);
    expect(s.output.alwaysReport).toBe(false);
    expect(s.cadence).toBe("4h");
    expect(s.sources).toContain("$ORBIO");
  });

  it("reads 'every morning' as daily and names Robinhood Chain", () => {
    const s = fallbackSpec({
      sentence: "Every morning, tell me what moved on Robinhood Chain and why.",
      template: "custom",
    });
    expect(s.cadence).toBe("24h");
    expect(s.sources).toContain("Robinhood Chain");
  });

  it("pulls a repo slug out of a watch sentence", () => {
    const s = fallbackSpec({
      sentence: "Nightly: what changed in daraijaola/moonlet issues and commits.",
      template: "repo-mechanic",
    });
    expect(s.sources).toContain("daraijaola/moonlet");
    expect(s.cadence).toBe("24h");
    expect(s.output.kind).toBe("digest");
  });
});

describe("extractSources", () => {
  it("adds $ORBIO when the word is bare", () => {
    expect(extractSources("Watch ORBIO whales")).toContain("$ORBIO");
  });
});
