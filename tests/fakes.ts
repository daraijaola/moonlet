import type { OrbioClient } from "@/moonlet/orbio";

/**
 * In-memory Orbio on the CREDIT protocol. The "signed key" is the real gateway key so runs hit real inference; the
 * balance is the ledger a wallet has activated. `unknownKey` hands the gateway a key it has never seen, which is what a
 * freshly signed key looks like before the first activation settles.
 */
export function fakeOrbio(opts: { realKey: string; balanceUsd?: number; unknownKey?: boolean; signed?: boolean }) {
  const state = {
    balance: opts.balanceUsd ?? 25,
    signed: opts.signed ?? true,
    exhausted: 0,
    calls: [] as string[],
  };
  const client: OrbioClient = {
    async getBalance() {
      state.calls.push("balance");
      return { availableUsd: state.balance, creditTokens: 0, raw: {} };
    },
    async getKeyStatus() {
      state.calls.push("status");
      return { hasKey: state.signed, prefix: state.signed ? opts.realKey.slice(0, 12) : null, epoch: 0, raw: {} };
    },
    async createKey() {
      state.calls.push("create");
      if (!state.signed) throw new (await import("@/moonlet/orbio")).OrbioAuthError();
      return { key: opts.unknownKey ? "sk-orb-0-unknown-to-the-gateway" : opts.realKey, raw: {} };
    },
    async revokeKey() {
      state.calls.push("revoke");
      state.signed = false;
    },
    async exhausted() {
      state.calls.push("exhausted");
      state.exhausted++;
      state.balance = 0;
    },
  };
  return { client, state };
}
