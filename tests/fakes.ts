import type { OrbioClient } from "@/moonlet/orbio";

/**
 * In-memory Orbio on the account-key model. Hands out the real key so runs hit
 * real inference. `legacy` simulates a holder who still has an old capped
 * OpenRouter key with money on it.
 */
export function fakeOrbio(opts: { realKey: string; balanceUsd?: number; legacy?: { remainingUsd: number; disabled?: boolean } | null; failFirstKey?: boolean }) {
  const state = {
    balance: opts.balanceUsd ?? 25,
    hasKey: false,
    mints: 0,
    legacy: opts.legacy ? { limitUsd: opts.legacy.remainingUsd + 0.5, usageUsd: 0.5, remainingUsd: opts.legacy.remainingUsd, disabled: !!opts.legacy.disabled } : null,
    calls: [] as string[],
  };
  const client: OrbioClient = {
    async getBalance() {
      state.calls.push("balance");
      return { availableUsd: state.balance, raw: {} };
    },
    async getKeyStatus() {
      state.calls.push("status");
      return {
        hasKey: state.hasKey,
        prefix: state.hasKey ? (opts.failFirstKey && state.mints === 1 ? "sk-orbio-bad" : opts.realKey.slice(0, 12)) : null,
        legacy: state.legacy ? { limitUsd: state.legacy.limitUsd, spentUsd: state.legacy.usageUsd, remainingUsd: state.legacy.remainingUsd, active: !state.legacy.disabled } : null,
        raw: {},
      };
    },
    async createKey() {
      state.calls.push("create");
      state.mints++;
      state.hasKey = true;
      return { key: opts.failFirstKey && state.mints === 1 ? "sk-orbio-invalid" : opts.realKey, raw: {} };
    },
    async revokeKey() {
      state.calls.push("revoke");
      state.hasKey = false;
    },
    async deleteLegacyKey() {
      state.calls.push("delete_legacy");
      const back = state.legacy && !state.legacy.disabled ? state.legacy.remainingUsd : 0;
      if (state.legacy) state.legacy.disabled = true;
      state.balance += back;
      return { returnedUsd: back };
    },
  };
  return { client, state };
}
