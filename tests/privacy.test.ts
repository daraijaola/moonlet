import { describe, expect, it } from "vitest";
import { isPrivateSpec, PRIVATE_OBJECTIVE, redactMoonlet, redactRun } from "@/moonlet/privacy";
import type { JobSpec } from "@/moonlet/spec";
import * as store from "@/moonlet/store";
import type { RunRow } from "@/moonlet/store";
import { rmSync } from "node:fs";

const inbox: JobSpec = {
  name: "Postie", template: "inbox", objective: "Reply to Jane about the lease", cadence: "24h", sources: ["from:jane@example.com"], checks: ["anything from the landlord"],
  tools: ["gmail_read", "gmail_draft", "deliver"], output: { kind: "digest", maxWords: 200, alwaysReport: true }, voice: "terse", spendCapUsd: 0.05, model: "auto", tripwire: null,
};
const run: RunRow = {
  id: "run_1", moonletId: "m_1", at: 1, status: "done", title: "Jane wants the lease signed by Friday", summary: "Two emails from Jane…", body: "Jane wrote…", sources: ["https://mail.google.com/x"], signal: "changed",
  nothingHappened: false, costUsd: 0.004, model: "m", modelCalls: 3, durationMs: 100, outputHash: "0xabc", txHash: "0xdef",
  keyEvents: [{ kind: "tripwire", detail: "email from jane" }, { kind: "budget", detail: "cut short" }], trace: [{ tool: "gmail_read", summary: "3 mails from Jane" } as never],
  sections: [{ check: "landlord", finding: "Jane…", changed: true }], calls: [{ claim: "Jane replies by Friday", check: "gmail_read" }], scored: [], error: "gmail: quota for jane@example.com", private: true,
};

describe("privacy", () => {
  it("a run's privacy is fixed when it happens; editing the job later never publishes it", async () => {
    rmSync("/tmp/moonlet-privacy.db", { force: true });
    process.env.DATABASE_URL = "file:/tmp/moonlet-privacy.db";
    await store.migrate();
    const now = Date.now();
    await store.insertMoonlet({ id: "m_p", owner: "0x00000000000000000000000000000000000000aa", name: "Postie", spec: inbox, status: "idle", delivery: {}, key: null, cadence: "24h", perRunCapUsd: 0.02, earnPerDayUsd: 1, burnPerDayUsd: 0.02, nextRunAt: now, createdAt: now });
    await store.insertRun({ ...run, id: "run_p", moonletId: "m_p", private: true });
    // Owner turns the inbox job into a plain market watch. The old report must stay a receipt for strangers.
    await store.updateMoonlet("m_p", { spec: { ...inbox, tools: ["token_market", "deliver"] } });
    const after = (await store.listRuns("m_p"))[0];
    expect(after.private).toBe(true);
    expect(JSON.stringify(redactRun(after))).not.toMatch(/Jane/);
  });
  it("private-repo work is private too, not only mail", () => {
    expect(isPrivateSpec({ tools: ["github_read", "deliver"] })).toBe(true);
  });
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
