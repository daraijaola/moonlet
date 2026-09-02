/**
 * Shape returned by GET /api/sky/stats (owned by the app/api team).
 * The landing page only reads it.
 */
export type SkyStats = {
  alive: number;
  runsToday: number;
  creditsIn: number;
  creditsOut: number;
  uptimePct: number;
  lastAnchorTx: string | null;
  updatedAt: string;
};

/**
 * MOCK DATA — placeholder until /api/sky/stats ships.
 * Never shown as real: the UI labels it "demo" whenever this is used.
 */
export const MOCK_SKY_STATS: SkyStats = {
  alive: 12,
  runsToday: 184,
  creditsIn: 41.2,
  creditsOut: 38.9,
  uptimePct: 99.4,
  lastAnchorTx: "0x7c2e…a91f",
  updatedAt: new Date(0).toISOString(),
};

export async function fetchSkyStats(signal?: AbortSignal): Promise<SkyStats | null> {
  try {
    const res = await fetch("/api/sky/stats", { signal, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as SkyStats;
  } catch {
    return null;
  }
}
