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
  const st = { balance: 25, hasKey: false };
  return {
    async getBalance() { return { availableUsd: st.balance, raw: { dev: true } }; },
    async getKeyStatus() { return { hasKey: st.hasKey, prefix: st.hasKey ? key.slice(0, 12) : null, legacy: null, raw: { dev: true } }; },
    async createKey() { st.hasKey = true; return { key, raw: { dev: true } }; },
    async revokeKey() { st.hasKey = false; },
    async deleteLegacyKey() { return { returnedUsd: 0 }; },
  };
}
