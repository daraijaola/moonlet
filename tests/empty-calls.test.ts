import { describe, expect, it } from "vitest";
import { safeParseOutput } from "../src/moonlet/runner";

const base = { title: "Title", summary: "Summary here", body: "B body long enough to count as a body here.", sources: [], signal: "low", nothingHappened: false, sections: [] };

describe("calls with no claim", () => {
  it("are dropped instead of padded into dots", () => {
    const o = safeParseOutput(JSON.stringify({ ...base, calls: [{ claim: "", check: "" }, { claim: "...", check: "x" }, { claim: "ORBIO staked stays above 355M", check: "read supply next run" }] }));
    expect(o?.calls).toEqual([{ claim: "ORBIO staked stays above 355M", check: "read supply next run" }]);
  });
});
