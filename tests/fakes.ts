import type { OrbioClient } from "@/moonlet/orbio";

/** In-memory Orbio. Hands out the real OpenRouter key so runs hit real inference. */
export function fakeOrbio(opts: { realKey: string; balanceUsd?: number; badFirstKey?: boolean; inactive?: boolean }) {
  const state = {
    balance: opts.balanceUsd ?? 25,
    key: null as null | { key: string; limit: number; spent: number; active: boolean },
    calls: [] as string[],
    rotations: 0,
  };
  const client: OrbioClient = {
    async getBalance() {
      state.calls.push("balance");
      return { availableUsd: state.balance, raw: {} };
    },
    async claimKey(amount = 5) {
      state.calls.push("claim");
      const limit = Math.min(amount, state.balance);
      state.balance -= limit;
      state.key = { key: opts.badFirstKey && state.rotations === 0 ? "sk-or-v1-invalid" : opts.realKey, limit, spent: 0, active: !opts.inactive };
      return { key: state.key.key, limitUsd: limit, raw: {} };
    },
    async getKeyStatus() {
      state.calls.push("status");
      const k = state.key!;
      return { spentUsd: k.spent, limitUsd: k.limit, remainingUsd: k.limit - k.spent, active: k.active, raw: {} };
    },
    async topUpKey(amount) {
      state.calls.push("topup");
      state.balance -= amount;
      state.key!.limit += amount;
      return client.getKeyStatus();
    },
    async rotateKey() {
      state.calls.push("rotate");
      state.rotations++;
      const k = state.key!;
      state.key = { key: opts.realKey, limit: k.limit - k.spent, spent: 0, active: true };
      return { key: state.key.key, limitUsd: state.key.limit, raw: {} };
    },
    async deleteKey() {
      state.calls.push("delete");
      const back = state.key ? state.key.limit - state.key.spent : 0;
      state.balance += back;
      state.key = null;
      return { returnedUsd: back };
    },
  };
  return { client, state };
}
