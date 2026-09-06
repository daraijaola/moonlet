import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import * as store from "@/moonlet/store";
import { concierge } from "@/moonlet/concierge";
import type { JobSpec } from "@/moonlet/spec";

const KEY = process.env.OPENROUTER_API_KEY!;
const OWNER = "0x00000000000000000000000000000000000000cc";
const spec: JobSpec = {
  name: "Tide",
  template: "market-watch",
  objective: "Brief me on $ORBIO liquidity and volume on Robinhood Chain.",
  cadence: "6h",
  sources: ["$ORBIO"],
  checks: [],
  tools: ["token_market", "chain_read", "deliver"],
  output: { kind: "brief", maxWords: 120, alwaysReport: true },
  voice: "terse",
  spendCapUsd: 0.02,
  model: "auto",
};

describe("telegram concierge (real model, owner's key)", () => {
  beforeAll(async () => {
    if (!KEY) throw new Error("OPENROUTER_API_KEY required");
    rmSync("/tmp/moonlet-concierge.db", { force: true });
    process.env.DATABASE_URL = "file:/tmp/moonlet-concierge.db";
    await store.migrate();
    const now = Date.now();
    await store.insertMoonlet({ id: "m_tide", owner: OWNER, name: "Tide", spec, status: "idle", delivery: {}, key: { key: KEY, limitUsd: 5, spentUsd: 0.4 }, cadence: "6h", perRunCapUsd: 0.02, earnPerDayUsd: 0.05, burnPerDayUsd: 0.02, nextRunAt: now + 3_600_000, createdAt: now });
    await store.insertRun({ id: "run_1", moonletId: "m_tide", at: now - 7_200_000, status: "done", title: "ORBIO/NVDA up 8.3% in the past hour", summary: "Price rose 8.26% on the main Uniswap pool, driven by a 101k ORBIO buy.", body: "", sources: ["https://dexscreener.com/robinhood/0xa95b"], signal: "high", nothingHappened: false, costUsd: 0.0165, model: "google/gemini-3.8-flash", modelCalls: 3, durationMs: 9000, outputHash: "0xabc", txHash: null, keyEvents: [], error: null });
  });

  it("answers about the latest result from the store, not from imagination", async () => {
    const r = await concierge(OWNER, "what did tide find last time?", { appUrl: "https://moonlet.16labs.xyz" });
    console.log("concierge1:", r);
    expect(r.toLowerCase()).toMatch(/8\.3|8\.26|nvda|uniswap|101/);
    expect(r).not.toMatch(/\*\*|^- /m);
  });

  it("changes cadence when asked in plain words", async () => {
    const r = await concierge(OWNER, "make tide run every 12 hours instead", { appUrl: "https://moonlet.16labs.xyz" });
    console.log("concierge2:", r);
    const m = await store.getMoonlet("m_tide");
    expect(m?.spec.cadence).toBe("12h");
    expect(r.toLowerCase()).toMatch(/12/);
  });

  it("runs now through the injected runner and says the result is coming", async () => {
    let ran: string | null = null;
    const r = await concierge(OWNER, "run it now please", { appUrl: "https://moonlet.16labs.xyz", runNow: async (id) => { ran = id; } });
    console.log("concierge3:", r);
    expect(ran).toBe("m_tide");
    expect(r.toLowerCase()).toMatch(/started|running|minute|on it/);
  });

  it("declines what it cannot do and points to the site", async () => {
    const r = await concierge(OWNER, "connect my discord and delete tide", { appUrl: "https://moonlet.16labs.xyz" });
    console.log("concierge4:", r);
    expect(r).toMatch(/16labs\.xyz/);
    expect((await store.listMoonlets(OWNER)).map((m) => m.name)).toContain("Tide");
  });

  it("spawns a new moonlet from one sentence and reports what it will do", async () => {
    await store.setOwnerBag(OWNER, 250_000);
    const noRpc: typeof fetch = async (u, init) => (String(u).includes("robinhood") ? new Response("{}", { status: 503 }) : fetch(u, init));
    const r = await concierge(OWNER, "spawn a moonlet called Shadow that watches wallet 0x8366a39cc670b4001a1121b8f6a443a643e40951 and tells me when it moves ORBIO", { appUrl: "https://moonlet.16labs.xyz", fetch: noRpc });
    console.log("concierge5:", r);
    const all = await store.listMoonlets(OWNER);
    const child = all.find((m) => m.name.toLowerCase() === "shadow");
    expect(child).toBeTruthy();
    expect(child!.parentId).toBeNull();
    expect(child!.spec.sources.join(" ")).toMatch(/0x8366a39cc670b4001a1121b8f6a443a643e40951/i);
    expect(r).toMatch(/Shadow/);
    expect(r.toLowerCase()).toMatch(/wallet|0x8366/);
  }, 90_000);

  it("sends a moonlet's latest report as a pdf file", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    const uploads: string[] = [];
    const f: typeof fetch = async (url, init) => {
      if (String(url).endsWith("/sendDocument")) {
        uploads.push((((init!.body as FormData).get("document")) as File).name);
        return new Response(JSON.stringify({ ok: true, result: { message_id: 901 } }), { headers: { "content-type": "application/json" } });
      }
      return fetch(url, init);
    };
    try {
      await store.setConnection(OWNER, "telegram", "@t", { chatId: "4242" });
      const r = await concierge(OWNER, "send me tide's last report as a pdf", { appUrl: "https://moonlet.16labs.xyz", fetch: f });
      console.log("concierge6:", r, uploads);
      expect(uploads).toHaveLength(1);
      expect(uploads[0]).toMatch(/\.pdf$/);
      expect((await store.filesForRuns(["run_1"])).run_1?.[0]?.mime).toBe("application/pdf");
    } finally {
      await store.deleteConnection(OWNER, "telegram");
      delete process.env.TELEGRAM_BOT_TOKEN;
    }
  }, 90_000);
});
