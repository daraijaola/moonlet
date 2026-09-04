import { afterAll, describe, expect, it } from "vitest";
import { decodeAnchor, encodeAnchor, ANCHOR_TO } from "@/moonlet/anchor";
import { hashOutput } from "@/moonlet/runner";
import { attachAnchor, anchorPending } from "@/moonlet/scheduler";
import * as store from "@/moonlet/store";
import type { Hex } from "viem";

const HASH = hashOutput({
  title: "ORBIO moved",
  summary: "Liquidity +11% in 6h.",
  body: "",
  sources: ["https://dexscreener.com"],
  signal: "medium",
  nothingHappened: false,
}) as Hex;

describe("anchor encode", () => {
  it("round-trips moonletId, runId, hash, cost, time", () => {
    const p = { moonletId: "m_abc", runId: "run_xyz", outputHash: HASH, costUsd: 0.012, at: 1_700_000_000_000 };
    const back = decodeAnchor(encodeAnchor(p));
    expect(back.moonletId).toBe(p.moonletId);
    expect(back.runId).toBe(p.runId);
    expect(back.outputHash).toBe(p.outputHash);
    expect(back.costUsd).toBeCloseTo(0.012, 6);
    expect(back.at).toBe(1_700_000_000_000);
    expect(ANCHOR_TO).toMatch(/^0x[0-9a-f]{40}$/);
  });
});

describe("anchor queue", () => {
  const trash: string[] = [];
  const seed = async (moonletId: string) => {
    const id = store.newId("run");
    trash.push(id);
    await store.insertRun({
      id,
      moonletId,
      at: Date.now(),
      status: "done",
      title: "t",
      summary: "s",
      body: "",
      sources: [],
      signal: "low",
      nothingHappened: false,
      costUsd: 0.01,
      model: "test",
      modelCalls: 1,
      durationMs: 10,
      outputHash: HASH,
      txHash: null,
      keyEvents: [],
      error: null,
    });
    return id;
  };

  afterAll(async () => {
    for (const id of trash) await store.deleteRun(id);
  });

  it("writes a tx on the first send and ignores a second", async () => {
    const id = await seed("m_anchor");
    const sent: string[] = [];
    const fake = async (p: { runId: string }) => {
      sent.push(p.runId);
      return { txHash: `0x${"ab".repeat(32)}` as Hex };
    };
    const a = await attachAnchor({ id, moonletId: "m_anchor", at: Date.now(), outputHash: HASH, costUsd: 0.01 }, { anchor: fake });
    expect(a.anchored).toBe(true);
    expect(a.txHash).toMatch(/^0xab/);
    const again = await attachAnchor({ id, moonletId: "m_anchor", at: Date.now(), outputHash: HASH, costUsd: 0.01 }, { anchor: fake });
    expect(again.txHash).toBe(a.txHash);
    expect(sent).toHaveLength(1);
  });

  it("retries a failed send on the next tick", async () => {
    const id = await seed("m_retry");
    let n = 0;
    const flaky = async () => {
      n += 1;
      if (n === 1) throw new Error("insufficient funds");
      return { txHash: `0x${"cd".repeat(32)}` as Hex };
    };
    const first = await attachAnchor({ id, moonletId: "m_retry", at: Date.now(), outputHash: HASH, costUsd: 0.01 }, { anchor: flaky });
    expect(first.anchored).toBe(false);
    expect((await store.getRun(id))?.txHash).toBeNull();
    const pending = await store.listUnanchored(50);
    expect(pending.some((r) => r.id === id)).toBe(true);
    const second = await anchorPending({ anchor: flaky }, 50);
    expect(second.some((r) => r.runId === id && r.anchored)).toBe(true);
    expect((await store.getRun(id))?.txHash).toMatch(/^0xcd/);
  });

  it("stays queued when no wallet is configured", async () => {
    const id = await seed("m_nowallet");
    const r = await attachAnchor({ id, moonletId: "m_nowallet", at: Date.now(), outputHash: HASH, costUsd: 0 }, { anchor: null });
    expect(r.anchored).toBe(false);
    expect((await store.listUnanchored(50)).some((x) => x.id === id)).toBe(true);
  });
});
