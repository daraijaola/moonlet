import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { encodeAbiParameters, keccak256, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import * as store from "@/moonlet/store";
import { ORBIO, apiKeyFromSignature, keyMessage, makeCreditClient, readActivations, signatureBelongsTo } from "@/moonlet/orbio";
import { proposeActivation, settleActivation, decide, describe as describeCard } from "@/moonlet/proposals";
import { runOne } from "@/moonlet/scheduler";
import { activationAmount } from "@/moonlet/budget";
import type { JobSpec } from "@/moonlet/spec";
import { fakeOrbio } from "./fakes";
import { ORBIO_GATEWAY, OPENROUTER, baseUrlFor } from "@/moonlet/llm";

/**
 * Orbio's CREDIT protocol, end to end against a fake chain: the wallet's signature is the key, an on-chain activation
 * funds the ledger exactly once, runs debit it, and a moonlet that runs dry asks the owner for CREDIT with one card.
 * No network, no model spend.
 */

const pk = generatePrivateKey();
const wallet = privateKeyToAccount(pk);
const OWNER = wallet.address.toLowerCase();
const STRANGER = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
const spec: JobSpec = { name: "Sentry", template: "market-watch", objective: "Watch ORBIO", cadence: "6h", sources: [], checks: [], tools: ["token_market"], output: { kind: "digest", maxWords: 120, alwaysReport: true }, voice: "terse", spendCapUsd: 0.05, model: "auto", tripwire: null };

/** A fake Robinhood Chain RPC: receipts by hash, plus zero balances for eth_call. */
const receipts = new Map<string, unknown>();
const topic = keccak256(toHex("Activated(uint256,address,bytes32,uint256)"));
const word = (n: bigint | string) => `0x${BigInt(n).toString(16).padStart(64, "0")}`;
function activatedLog(activationId: number, from: string, beneficiary: string, amountUnits: bigint) {
  return { address: ORBIO.credit, topics: [topic, word(BigInt(activationId)), word(from), word(beneficiary)], data: encodeAbiParameters([{ type: "uint256" }], [amountUnits]) };
}
let gatewaySays: { available: string; used: string } | null = null;
const chain: typeof fetch = async (u, init) => {
  if (String(u).endsWith("/api/v1/key")) return gatewaySays ? new Response(JSON.stringify({ object: "key", balance: gatewaySays })) : new Response("{\"error\":\"unknown key\"}", { status: 401 });
  const body = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
  if (body.method === "eth_getTransactionReceipt") return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: receipts.get(String(body.params[0])) ?? null }));
  if (body.method === "eth_getLogs") {
    const f = body.params[0] as { topics: (string | null)[]; fromBlock: string };
    const out: unknown[] = [];
    for (const [hash, rc] of receipts) {
      const r = rc as { status: string; blockNumber: string; logs: Array<{ topics: string[]; data: string }> };
      if (r.status !== "0x1" || Number(r.blockNumber) < Number(f.fromBlock)) continue;
      for (const l of r.logs) if (l.topics[3] === f.topics[3]) out.push({ ...l, transactionHash: hash, blockNumber: r.blockNumber });
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: out }));
  }
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x0" }));
};

beforeAll(async () => {
  rmSync("/tmp/moonlet-credit.db", { force: true });
  process.env.DATABASE_URL = "file:/tmp/moonlet-credit.db";
  process.env.SECRET_KEY = "test";
  await store.migrate();
});

describe("CREDIT protocol", () => {
  it("the key is the wallet's signature of Orbio's message, and only that wallet's", async () => {
    expect(keyMessage(0)).toBe("Orbio API key · chain 4663 · epoch 0");
    const sig = await wallet.signMessage({ message: keyMessage(0) });
    expect(await signatureBelongsTo(OWNER, sig, 0)).toBe(true);
    expect(await signatureBelongsTo(STRANGER, sig, 0)).toBe(false);
    expect(await signatureBelongsTo(OWNER, sig, 1)).toBe(false);
    const key = apiKeyFromSignature(sig, 0);
    expect(key.startsWith("sk-orb-0-")).toBe(true);
    expect(Buffer.from(key.slice("sk-orb-0-".length), "base64").toString("hex")).toBe(sig.slice(2).toLowerCase());
  });

  it("both Orbio key shapes route to Orbio's gateway, never to OpenRouter", async () => {
    const sig = await wallet.signMessage({ message: keyMessage(0) });
    expect(baseUrlFor(apiKeyFromSignature(sig, 0))).toBe(ORBIO_GATEWAY);
    expect(baseUrlFor("sk-orb-3-AAAA")).toBe(ORBIO_GATEWAY);
    expect(baseUrlFor("sk-orbio-Y_x83y")).toBe(ORBIO_GATEWAY);
    expect(baseUrlFor("sk-or-v1-legacy")).toBe(OPENROUTER);
  });

  it("the client hands runs the sealed key and the ledger, and refuses before the owner has signed", async () => {
    const client = makeCreditClient(OWNER, chain);
    await expect(client.createKey()).rejects.toThrow(/not signed|must sign/);
    const sig = await wallet.signMessage({ message: keyMessage(0) });
    await store.setOwnerOrbioKey(OWNER, apiKeyFromSignature(sig, 0), 0);
    expect((await client.createKey()).key).toBe(apiKeyFromSignature(sig, 0));
    expect((await client.getBalance()).availableUsd).toBe(0);
    expect((await client.getKeyStatus()).hasKey).toBe(true);
    const row = await store.getOwner(OWNER);
    expect(row?.orbioKey).toBe(apiKeyFromSignature(sig, 0));
    await client.exhausted();
    expect((await client.getBalance()).availableUsd).toBe(0);
  });

  it("an on-chain activation funds the ledger once; replaying the hash adds nothing; a stranger's activation adds nothing", async () => {
    const tx = `0x${"11".repeat(32)}`;
    receipts.set(tx, { status: "0x1", blockNumber: "0x10", logs: [activatedLog(7, OWNER, OWNER, 5_000_000n)] });
    const parsed = await readActivations(tx, chain);
    expect(parsed).toEqual([{ txHash: tx, activationId: "7", from: OWNER, beneficiary: OWNER, amountUsd: 5, blockNumber: 16 }]);

    const first = await settleActivation(OWNER, tx, null, chain);
    expect(first).toMatchObject({ ok: true, credited: 5, total: 5 });
    expect((await store.getOwner(OWNER))?.orbioBalanceUsd).toBe(5);

    const again = await settleActivation(OWNER, tx, null, chain);
    expect(again).toMatchObject({ ok: true, credited: 0, total: 5 });
    expect((await store.getOwner(OWNER))?.orbioBalanceUsd).toBe(5);

    const theirs = `0x${"22".repeat(32)}`;
    receipts.set(theirs, { status: "0x1", blockNumber: "0x11", logs: [activatedLog(8, STRANGER, STRANGER, 9_000_000n)] });
    const stranger = await settleActivation(OWNER, theirs, null, chain);
    expect(stranger.ok).toBe(false);
    expect((await store.getOwner(OWNER))?.orbioBalanceUsd).toBe(5);

    const pending = `0x${"33".repeat(32)}`;
    expect((await settleActivation(OWNER, pending, null, chain)).ok).toBe(false);
    const reverted = `0x${"44".repeat(32)}`;
    receipts.set(reverted, { status: "0x0", blockNumber: "0x12", logs: [] });
    await expect(settleActivation(OWNER, reverted, null, chain)).rejects.toThrow(/reverted/);
  });

  it("a run debits the ledger by what it cost; a quiet run costs nothing", async () => {
    const now = Date.now();
    await store.insertMoonlet({ id: "m_c1", owner: OWNER, name: "Sentry", spec, status: "idle", delivery: {}, key: null, cadence: "6h", perRunCapUsd: 0.05, earnPerDayUsd: 0, burnPerDayUsd: 0.2, nextRunAt: now - 1, createdAt: now });
    await store.claimForRun("m_c1");
    const before = (await store.getOwner(OWNER))!.orbioBalanceUsd;
    const r = await runOne("m_c1", {
      orbioFor: async () => makeCreditClient(OWNER, chain), bagOf: async () => 1000, anchor: null, fetch: chain,
      run: async (m) => ({ ok: true, status: "done", output: { title: "t", summary: "s", body: "b", sections: [], sources: [], signal: "changed", nothingHappened: true, remember: "", calls: [], scored: [] } as never, outputHash: `0x${"ab".repeat(32)}`, costUsd: 0.37, model: "m", modelCalls: 2, durationMs: 5, plan: { cadence: "6h", perRunCapUsd: 0.05, burnPerDayUsd: 0.2, earnPerDayUsd: 0, quiet: false }, keyEvents: [], trace: [], key: m.key, private: false }),
    });
    expect(r.status).toBe("done");
    expect((await store.getOwner(OWNER))!.orbioBalanceUsd).toBeCloseTo(before - 0.37, 6);
  });

  it("a moonlet that runs dry puts one activation card in the queue, sized to a week, and a second dry moonlet adds none", async () => {
    await store.setOwnerBalance(OWNER, 0);
    const now = Date.now();
    await store.insertMoonlet({ id: "m_c2", owner: OWNER, name: "Robin", spec: { ...spec, name: "Robin", cadence: "4h" }, status: "idle", delivery: {}, key: null, cadence: "4h", perRunCapUsd: 0.05, earnPerDayUsd: 0, burnPerDayUsd: 0.3, nextRunAt: now - 1, createdAt: now });
    for (const id of ["m_c1", "m_c2"]) {
      await store.updateMoonlet(id, { nextRunAt: now - 1 });
      await store.claimForRun(id);
      const r = await runOne(id, { orbioFor: async () => makeCreditClient(OWNER, chain), bagOf: async () => 1000, anchor: null, fetch: chain });
      expect(r.status).toBe("quiet");
    }
    const cards = (await store.listProposals(OWNER, "pending")).filter((p) => p.kind === "activate_credit");
    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card.moonletId).toBe("m_c1");
    expect(Number(card.payload.amountUsd)).toBe(activationAmount(0.05, "6h"));
    expect(Number(card.payload.amountUsd)).toBe(2);
    const d = describeCard(card.kind, card.payload);
    expect(d.title).toBe("Activate 2.00 CREDIT");
    expect(d.body).toMatch(/you sign the transaction/i);

    // Approving on the dashboard does not execute anything server-side: the owner's wallet does.
    const approved = await decide(card.id, "approve");
    expect(approved).toMatchObject({ ok: true, status: "approved" });
    expect((await store.getProposal(card.id))?.status).toBe("approved");
    expect((await store.getOwner(OWNER))!.orbioBalanceUsd).toBe(0);

    // The wallet activates; the card settles from the chain's record and the amount is checked against what was approved.
    const tx = `0x${"55".repeat(32)}`;
    receipts.set(tx, { status: "0x1", blockNumber: "0x20", logs: [activatedLog(9, OWNER, OWNER, 2_000_000n)] });
    const settled = await settleActivation(OWNER, tx, card.id, chain);
    expect(settled).toMatchObject({ ok: true, credited: 2 });
    const done = await store.getProposal(card.id);
    expect(done?.status).toBe("executed");
    expect(done?.verification?.status).toBe("verified");
    expect(done?.verification?.checks.map((c) => c.field)).toEqual(["beneficiary", "amount"]);
    expect((await store.getOwner(OWNER))!.orbioBalanceUsd).toBe(2);

    // Less than approved is a mismatch, not a Done.
    const short = await proposeActivation({ owner: OWNER, moonletId: "m_c2", moonletName: "Robin", runId: null, perRunCapUsd: 0.05, cadence: "4h", fetch: chain });
    expect(short).toBeTruthy();
    const tx2 = `0x${"66".repeat(32)}`;
    receipts.set(tx2, { status: "0x1", blockNumber: "0x21", logs: [activatedLog(10, OWNER, OWNER, 1_000_000n)] });
    await settleActivation(OWNER, tx2, short!, chain);
    expect((await store.getProposal(short!))?.verification?.status).toBe("mismatch");
    expect((await store.getOwner(OWNER))!.orbioBalanceUsd).toBe(3);
  });

  it("an activation made on Orbio's own dashboard is picked up from the chain's index, once", async () => {
    const { syncActivations } = await import("@/moonlet/orbio");
    const before = (await store.getOwner(OWNER))!.orbioBalanceUsd;
    const tx = `0x${"77".repeat(32)}`;
    receipts.set(tx, { status: "0x1", blockNumber: "0x30", logs: [activatedLog(11, OWNER, OWNER, 7_500_000n)] });
    await store.updateMoonlet("m_c1", { status: "quiet", nextRunAt: Date.now() + 86_400_000 });
    expect(await syncActivations(OWNER, chain)).toBe(7.5);
    expect(await syncActivations(OWNER, chain)).toBe(0);
    // money arrived: the quiet moonlet is due now, not tomorrow
    expect((await store.getMoonlet("m_c1"))!.nextRunAt).toBeLessThanOrEqual(Date.now());
    expect((await store.getOwner(OWNER))!.orbioBalanceUsd).toBeCloseTo(before + 7.5, 6);
    expect((await makeCreditClient(OWNER, chain).getBalance()).availableUsd).toBeCloseTo(before + 7.5, 6);
  });

  it("when the gateway answers, its balance wins and the ledger is reconciled to it; when it does not, the ledger stands", async () => {
    await store.setOwnerBalance(OWNER, 3);
    const client = makeCreditClient(OWNER, chain);
    gatewaySays = { available: "12.5", used: "41.86" };
    const live = await client.getBalance();
    expect(live.availableUsd).toBe(12.5);
    expect(live.raw).toMatchObject({ gateway: true, usedUsd: 41.86 });
    expect((await store.getOwner(OWNER))!.orbioBalanceUsd).toBe(12.5);
    gatewaySays = null;
    expect((await client.getBalance()).availableUsd).toBe(12.5);
    expect((await client.getBalance()).raw).toMatchObject({ ledger: true });
  });

  it("fuel: a stranger burns their CREDIT into the owner's balance; credited once, recorded with who gave it, wakes the moonlet", async () => {
    await store.setOwnerBalance(OWNER, 0);
    await store.updateMoonlet("m_c1", { status: "quiet", nextRunAt: Date.now() + 86_400_000 });
    const tx = `0x${"88".repeat(32)}`;
    receipts.set(tx, { status: "0x1", blockNumber: "0x40", logs: [activatedLog(12, STRANGER, OWNER, 1_000_000n)] });
    const parsed = await readActivations(tx, chain);
    expect(parsed[0]).toMatchObject({ from: STRANGER, beneficiary: OWNER, amountUsd: 1 });
    expect(await store.addActivation({ ...parsed[0], owner: OWNER, proposalId: "m_c1" })).toBe(true);
    expect(await store.addActivation({ ...parsed[0], owner: OWNER, proposalId: "m_c1" })).toBe(false);
    await store.wakeQuietMoonlets(OWNER);
    expect((await store.getOwner(OWNER))!.orbioBalanceUsd).toBe(1);
    expect((await store.getMoonlet("m_c1"))!.nextRunAt).toBeLessThanOrEqual(Date.now());
    const fuel = await store.listFuel(OWNER);
    expect(fuel).toHaveLength(1);
    expect(fuel[0]).toMatchObject({ from: STRANGER, amountUsd: 1, moonletId: "m_c1" });
    // the owner's own activations are not "fuel"
    expect(fuel.some((f) => f.from === OWNER)).toBe(false);
  });

  it("the gateway refusing for balance zeroes the ledger so the next tick asks the owner instead of retrying", async () => {
    await store.setOwnerBalance(OWNER, 4);
    const fake = fakeOrbio({ realKey: "sk-orb-0-x", balanceUsd: 4 });
    await fake.client.exhausted();
    expect(fake.state.balance).toBe(0);
    const real = makeCreditClient(OWNER, chain);
    await real.exhausted();
    expect((await real.getBalance()).availableUsd).toBe(0);
  });
});
