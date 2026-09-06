import { describe, expect, it } from "vitest";
import { buildTools } from "@/moonlet/tools";

describe("wallet_activity (live RPC)", () => {
  it("scans a busy wallet in chunks under budget and groups by token", async () => {
    const chain = buildTools(["chain_read"], { delivery: {} }).tools[0] as unknown as { function: { execute: (a: unknown) => Promise<unknown> } };
    // the ORBIO/NVDA Uniswap pool (the pool contract itself, seen in every swap)
    const t0 = Date.now();
    const r = (await (chain as unknown as { execute: (a: unknown) => Promise<unknown> }).execute({ action: "wallet_activity", wallet: "0x8366a39cc670b4001a1121b8f6a443a643e40951", limit: 5 })) as Record<string, unknown>;
    console.log("wallet:", JSON.stringify(r).slice(0, 600), "in", Date.now() - t0, "ms");
    expect(r.error).toBeUndefined();
    expect(Number(r.transferCount)).toBeGreaterThan(0);
    expect(Object.keys(r.byToken as object).length).toBeGreaterThan(0);
    expect(Date.now() - t0).toBeLessThan(20_000);
    const again = (await (chain as unknown as { execute: (a: unknown) => Promise<unknown> }).execute({ action: "wallet_activity", wallet: "0x8366a39cc670b4001a1121b8f6a443a643e40951", fromBlock: Number(r.latestBlock), limit: 5 })) as Record<string, unknown>;
    console.log("incremental:", JSON.stringify(again).slice(0, 200));
    expect(again.error).toBeUndefined();
  }, 60_000);
});
