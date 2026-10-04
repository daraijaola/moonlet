import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import * as store from "@/moonlet/store";
import { addTrialSpend, billingKey, grantIfEligible, trialOf, withTrial, type TrialConfig } from "@/moonlet/trial";
import { runOne } from "@/moonlet/scheduler";
import type { OrbioClient } from "@/moonlet/orbio";
import type { JobSpec } from "@/moonlet/spec";

/**
 * The free trial spends a Moonlet-owned key, so these pin the fences: new accounts only, once each, under the overall and
 * daily caps even when sign-ins race; nothing after TRIAL_UNTIL; own balance before the trial; a trial-paid run comes off
 * the trial and never leaves the trial key on the moonlet; the trial ends at its credit and at its expiry.
 */

const T0 = Date.parse("2026-10-05T12:00:00Z");
const KEY = "sk-orbio-TRIALKEY";
const cfg = (over: Partial<TrialConfig> = {}): TrialConfig => ({ key: KEY, creditUsd: 5, days: 7, start: T0 - 3600_000, until: Infinity, maxAccounts: 3, dailyAccounts: 2, ...over });
const acct = (i: number) => `0x${String(i).padStart(40, "e")}`;
const spec: JobSpec = { name: "Trial", template: "custom", objective: "x", cadence: "24h", sources: [], checks: [], tools: ["deliver"], output: { kind: "note", maxWords: 50, alwaysReport: true }, voice: "terse", spendCapUsd: 0.05, model: "auto", tripwire: null };

async function newAccount(i: number, createdAt: number) {
  await store.upsertOwner(acct(i));
  await store.db().execute({ sql: `UPDATE owners SET created_at=? WHERE address=?`, args: [createdAt, acct(i)] });
  return acct(i);
}

beforeAll(async () => {
  rmSync("/tmp/moonlet-trial.db", { force: true });
  process.env.DATABASE_URL = "file:/tmp/moonlet-trial.db";
  process.env.SECRET_KEY = "test";
  process.env.TRIAL_ORBIO_KEY = KEY;
  await store.migrate();
});

describe("free trial", () => {
  it("new accounts only, once each; never accounts from before the start; nothing after the end date", async () => {
    const old = await newAccount(1, T0 - 86_400_000);
    expect(await grantIfEligible(old, { now: T0, config: cfg() })).toBeNull();
    const fresh = await newAccount(2, T0);
    const t = await grantIfEligible(fresh, { now: T0, config: cfg() });
    expect(t).toMatchObject({ creditUsd: 5, remainingUsd: 5, active: true });
    expect(t!.expiresAt).toBe(T0 + 7 * 86_400_000);
    expect((await grantIfEligible(fresh, { now: T0 + 1000, config: cfg() }))!.expiresAt).toBe(t!.expiresAt);
    const late = await newAccount(3, T0);
    expect(await grantIfEligible(late, { now: T0, config: cfg({ until: T0 - 1 }) })).toBeNull();
  });

  it("the daily and overall caps hold even when new accounts arrive together", async () => {
    const day1 = await Promise.all([4, 5, 6].map((i) => newAccount(i, T0)));
    const got1 = await Promise.all(day1.map((a) => grantIfEligible(a, { now: T0 + 60_000, config: cfg() })));
    // Two a day: account 2 already took one today, so one more fits.
    expect(got1.filter(Boolean)).toHaveLength(1);
    const day2 = await Promise.all([7, 8].map((i) => newAccount(i, T0 + 2 * 86_400_000)));
    const got2 = await Promise.all(day2.map((a) => grantIfEligible(a, { now: T0 + 2 * 86_400_000, config: cfg() })));
    // Three overall: only one left.
    expect(got2.filter(Boolean)).toHaveLength(1);
  });

  it("the person's own balance pays first; the trial key only when theirs can't", async () => {
    const a = await newAccount(10, T0);
    await grantIfEligible(a, { now: T0, config: cfg({ maxAccounts: 100, dailyAccounts: 100 }) });
    const own = (avail: number): OrbioClient => ({ getBalance: async () => ({ availableUsd: avail, raw: {} }), getKeyStatus: async () => ({ hasKey: true, prefix: "sk-orb-0", epoch: 0, raw: {} }), createKey: async () => ({ key: "sk-orb-0-own", raw: {} }), revokeKey: async () => {}, exhausted: async () => {} });
    const rich = withTrial(a, own(3), cfg());
    expect((await rich.getBalance()).availableUsd).toBe(3);
    expect((await rich.createKey()).key).toBe("sk-orb-0-own");
    const broke = withTrial(a, own(0), cfg());
    expect((await broke.getBalance()).availableUsd).toBe(5);
    expect((await broke.createKey()).key).toBe(KEY);
    const noKey = withTrial(a, null, cfg());
    expect((await noKey.createKey().catch(() => null))).toBeNull();
    expect((await noKey.getBalance()).availableUsd).toBe(5);
    expect((await noKey.createKey()).key).toBe(KEY);
    expect(await billingKey(a, { config: cfg() })).toMatchObject({ key: KEY, trial: true, remainingUsd: 5 });
  });

  it("a trial-paid run comes off the trial and the trial key is never kept on the moonlet", async () => {
    const a = await newAccount(11, T0);
    await grantIfEligible(a, { now: T0, config: cfg({ maxAccounts: 100, dailyAccounts: 100 }) });
    await store.insertMoonlet({ id: "m_trial", owner: a, name: "Trial", spec, status: "idle", delivery: {}, key: null, cadence: "24h", perRunCapUsd: 0.05, earnPerDayUsd: 0, burnPerDayUsd: 0.05, nextRunAt: Date.now() - 1000, createdAt: Date.now() });
    const r = await runOne("m_trial", {
      orbioFor: async (o) => withTrial(o, null, cfg()),
      bagOf: async () => 0,
      anchor: null,
      run: async (m) => ({ ok: true, status: "done", output: { title: "t", summary: "s", body: "b", sections: [], metrics: [], remember: "", sources: [], signal: "low", nothingHappened: false, calls: [], scored: [] }, outputHash: "0xabc", costUsd: 0.03, model: "m", modelCalls: 1, durationMs: 1, plan: { cadence: "24h" } as never, keyEvents: [], trace: [], key: { key: KEY, limitUsd: 5, spentUsd: 0.03 }, private: false, ...(m ? {} : {}) }) as never,
    });
    expect(r.status).toBe("done");
    expect((await trialOf(a))!.spentUsd).toBeCloseTo(0.03, 6);
    expect((await store.getMoonlet("m_trial"))!.key).toBeNull();
  });

  it("the trial ends at its credit and at its expiry", async () => {
    const a = await newAccount(12, T0);
    await grantIfEligible(a, { now: T0, config: cfg({ maxAccounts: 100, dailyAccounts: 100 }) });
    await addTrialSpend(a, 9);
    expect(await trialOf(a)).toMatchObject({ spentUsd: 5, remainingUsd: 0, active: false });
    const b = await newAccount(13, T0);
    await grantIfEligible(b, { now: T0, config: cfg({ maxAccounts: 100, dailyAccounts: 100 }) });
    expect((await trialOf(b, T0 + 8 * 86_400_000))!.active).toBe(false);
  });
});
