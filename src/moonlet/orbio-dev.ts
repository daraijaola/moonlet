import type { OrbioClient } from "./orbio";

/**
 * Local-only stand-in for Orbio, enabled by ALLOW_DEV_ORBIO=1 + ORBIO_DEV_KEY.
 * Hands every owner the same OpenRouter key with a pretend $25 balance so the
 * whole loop can be exercised before a wallet has approved the real MCP.
 * Never enable in a deployment users touch.
 */
export function devOrbio(): OrbioClient | null {
  if (process.env.ALLOW_DEV_ORBIO !== "1" || !process.env.ORBIO_DEV_KEY) return null;
  const key = process.env.ORBIO_DEV_KEY;
  const st = { balance: 25, limit: 0, spent: 0 };
  return {
    async getBalance() { return { availableUsd: st.balance, raw: { dev: true } }; },
    async claimKey(amount = 5) { const a = Math.min(amount, st.balance); st.balance -= a; st.limit = a; st.spent = 0; return { key, limitUsd: a, raw: { dev: true } }; },
    async getKeyStatus() { return { spentUsd: st.spent, limitUsd: st.limit, remainingUsd: st.limit - st.spent, active: true, raw: { dev: true } }; },
    async topUpKey(a) { st.balance -= a; st.limit += a; return this.getKeyStatus(); },
    async rotateKey() { return { key, limitUsd: st.limit - st.spent, raw: { dev: true } }; },
    async deleteKey() { const back = st.limit - st.spent; st.balance += back; st.limit = 0; return { returnedUsd: back }; },
  };
}
