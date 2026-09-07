import { describe, expect, it } from "vitest";
import { isPrivateSpec, PRIVATE_OBJECTIVE, redactMoonlet, redactRun } from "@/moonlet/privacy";
import type { JobSpec } from "@/moonlet/spec";
import type { RunRow } from "@/moonlet/store";

const inbox: JobSpec = {
  name: "Postie", template: "inbox", objective: "Reply to Jane about the lease", cadence: "24h", sources: ["from:jane@example.com"], checks: ["anything from the landlord"],
  tools: ["gmail_read", "gmail_draft", "deliver"], output: { kind: "digest", maxWords: 200, alwaysReport: true }, voice: "terse", spendCapUsd: 0.05, model: "auto", tripwire: null,
};
const run: RunRow = {
  id: "run_1", moonletId: "m_1", at: 1, status: "done", title: "Jane wants the lease signed by Friday", summary: "Two emails from Jane…", body: "Jane wrote…", sources: ["https://mail.google.com/x"], signal: "changed",
  nothingHappened: false, costUsd: 0.004, model: "m", modelCalls: 3, durationMs: 100, outputHash: "0xabc", txHash: "0xdef",
  keyEvents: [{ kind: "tripwire", detail: "email from jane" }, { kind: "budget", detail: "cut short" }], trace: [{ tool: "gmail_read", summary: "3 mails from Jane" } as never],
  sections: [{ check: "landlord", finding: "Jane…", changed: true }], calls: [{ claim: "Jane replies by Friday", check: "gmail_read" }], scored: [], error: "gmail: quota for jane@example.com",
};

describe("privacy", () => {
  it("only mailbox tools make a moonlet private", () => {
    expect(isPrivateSpec(inbox)).toBe(true);
    expect(isPrivateSpec({ tools: ["token_market", "deliver"] })).toBe(false);
  });
  it("a stranger sees the receipt, never the words", () => {
    const r = redactRun(run);
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/Jane|jane|lease|landlord/);
    expect(r.outputHash).toBe("0xabc");
    expect(r.txHash).toBe("0xdef");
    expect(r.costUsd).toBe(0.004);
    expect(r.keyEvents).toEqual([{ kind: "budget", detail: "cut short" }]);
  });
  it("the job itself is hidden too, but the receipt stats stay", () => {
    const m = redactMoonlet({ spec: inbox, openCalls: [{ claim: "Jane replies", check: "x", madeAt: 1, runId: "r" }] });
    expect(JSON.stringify(m)).not.toMatch(/Jane|jane|landlord/);
    expect(m.spec.objective).toBe(PRIVATE_OBJECTIVE);
    expect(m.spec.tools).toEqual(inbox.tools);
    const market = redactMoonlet({ spec: { ...inbox, tools: ["token_market"] }, openCalls: [] });
    expect(market.spec.objective).toBe(inbox.objective);
  });
});
