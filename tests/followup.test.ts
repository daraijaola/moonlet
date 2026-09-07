import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import * as store from "@/moonlet/store";
import { followup } from "@/moonlet/followup";
import type { JobSpec } from "@/moonlet/spec";

const KEY = process.env.OPENROUTER_API_KEY!;
if (!KEY) throw new Error("OPENROUTER_API_KEY required");
const OWNER = "0x00000000000000000000000000000000000000ee";
const spec: JobSpec = { name: "Tide", template: "market-watch", objective: "Watch $ORBIO on Robinhood Chain.", cadence: "6h", sources: ["$ORBIO"], checks: ["$ORBIO price, liquidity, volume vs last run"], tools: ["token_market", "chain_read", "deliver"], output: { kind: "brief", maxWords: 120, alwaysReport: true }, voice: "terse", spendCapUsd: 0.03, model: "auto" };

describe("follow-up on a report (real model)", () => {
  beforeAll(async () => {
    rmSync("/tmp/moonlet-followup.db", { force: true });
    process.env.DATABASE_URL = "file:/tmp/moonlet-followup.db";
    await store.migrate();
    const now = Date.now();
    await store.insertMoonlet({ id: "m_f", owner: OWNER, name: "Tide", spec, status: "idle", delivery: {}, key: { key: KEY, limitUsd: 5, spentUsd: 0.1 }, cadence: "6h", perRunCapUsd: 0.03, earnPerDayUsd: 0.05, burnPerDayUsd: 0.02, nextRunAt: now + 3_600_000, createdAt: now });
    await store.insertRun({ id: "run_f1", moonletId: "m_f", at: now - 600_000, status: "done", title: "ORBIO/NVDA up 8.3% in the past hour", summary: "Price rose 8.26% on the main Uniswap pool, driven by a 101,071 ORBIO buy from 0x8366…0951.", body: "", sources: ["https://dexscreener.com/robinhood/0xa95b"], signal: "high", nothingHappened: false, costUsd: 0.0165, model: "google/gemini-3.8-flash", modelCalls: 3, durationMs: 9000, outputHash: "0xabc", txHash: null, keyEvents: [], sections: [{ check: "$ORBIO price, liquidity, volume vs last run", finding: "Price $0.0072 (+8.26%), liquidity $234k, 24h volume $1.49M", changed: true }], error: null });
  });

  it("answers a question grounded in the report", async () => {
    const r = await followup({ moonletId: "m_f", owner: OWNER, text: "which wallet was that buy from?", runId: "run_f1" });
    console.log("followup1:", r);
    expect(r).toMatch(/0x8366/);
  }, 60_000);

  it("changes the schedule from plain words without a model call", async () => {
    const r = await followup({ moonletId: "m_f", owner: OWNER, text: "do this every 12 hours instead", runId: "run_f1" });
    console.log("followup2:", r);
    expect((await store.getMoonlet("m_f"))?.spec.cadence).toBe("12h");
    expect(r).toMatch(/12 hours/);
  });

  it("fetches fresh data when the report can't answer", async () => {
    const r = await followup({ moonletId: "m_f", owner: OWNER, text: "what's the liquidity right now?", runId: "run_f1" });
    console.log("followup3:", r);
    expect(r).toMatch(/\$\s?[\d,.]+|liquidity/i);
  }, 90_000);

  it("reads an image the owner sends", async () => {
    const r = await followup({ moonletId: "m_f", owner: OWNER, text: "describe this image in one sentence", runId: "run_f1", imageUrl: "https://moonlet.16labs.xyz/mascot/moonlet-rest.png" });
    console.log("followup4:", r);
    expect(r.length).toBeGreaterThan(20);
    expect(r.toLowerCase()).toMatch(/moon|cartoon|character|face|sleep|antenna|round/);
  }, 90_000);

  it("reads a photo served as application/octet-stream (Telegram file server)", async () => {
    const octet: typeof fetch = async (url, init) => {
      const res = await fetch(url, init);
      if (String(url).includes("/mascot/")) return new Response(await res.arrayBuffer(), { status: 200, headers: { "content-type": "application/octet-stream" } });
      return res;
    };
    const r = await followup({ moonletId: "m_f", owner: OWNER, text: "describe this image in one sentence", runId: "run_f1", imageUrl: "https://moonlet.16labs.xyz/mascot/moonlet-rest.png", fetch: octet });
    console.log("followup5:", r);
    expect(r.toLowerCase()).not.toMatch(/binary|raw data|cannot be rendered|pasted/);
    expect(r.toLowerCase()).toMatch(/moon|cartoon|character|face|sleep|antenna|round/);
  }, 90_000);

  it("'send me this as a docx' → writes the file once and answers in one line", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    const uploads: string[] = [];
    const f: typeof fetch = async (url, init) => {
      if (String(url).endsWith("/sendDocument")) {
        uploads.push((((init!.body as FormData).get("document")) as File).name);
        return new Response(JSON.stringify({ ok: true, result: { message_id: 900 } }), { headers: { "content-type": "application/json" } });
      }
      return fetch(url, init);
    };
    try {
      await store.setConnection(OWNER, "telegram", "@t", { chatId: "4242" });
      const r = await followup({ moonletId: "m_f", owner: OWNER, text: "send me this report as a docx please", runId: "run_f1", fetch: f });
      console.log("followup6:", r, uploads);
      expect(uploads).toHaveLength(1);
      expect(uploads[0]).toMatch(/\.docx$/);
      expect(r.length).toBeLessThan(400);
      const files = await store.filesForRuns(["run_f1"]);
      expect(files.run_f1?.[0]?.mime).toContain("wordprocessingml");
    } finally {
      await store.deleteConnection(OWNER, "telegram");
      delete process.env.TELEGRAM_BOT_TOKEN;
    }
  }, 90_000);
});
