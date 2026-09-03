/**
 * MOCK DATA — nothing in this file is real.
 * Every number here is a placeholder until the real API, Orbio OAuth, and
 * on-chain anchoring are wired. Components must import from here and nowhere
 * else so the swap to live data is a single-file change.
 */

export type MoonletStatus = "running" | "idle" | "paused" | "quiet";

export type Template = "market-watch" | "repo-mechanic" | "digest" | "custom";

export type Run = {
  id: string;
  moonletId: string;
  at: string; // ISO
  title: string;
  summary: string;
  output?: { kind: "brief" | "chart" | "pr" | "note"; label: string; href?: string };
  creditsSpent: number; // USD
  model: string;
  txHash?: string; // Robinhood Chain anchor
};

export type Moonlet = {
  id: string;
  name: string;
  owner: string; // wallet
  template: Template;
  job: string;
  status: MoonletStatus;
  createdAt: string;
  bag: number; // $ORBIO held by owner
  earnPerDay: number; // USD credits accruing
  burnPerDay: number; // USD credits spent
  balance: number; // USD unspent on active key
  uptimePct: number;
  keysRotated: number;
  runsToday: number;
  cadence: string; // human, e.g. "every 6h"
  delivery: { public: true; telegram?: string; x?: string };
};

export const TEMPLATES: Record<
  Template,
  { name: string; blurb: string; example: string; costPerRun: number }
> = {
  "market-watch": {
    name: "Market Watch",
    blurb: "Watches a token, a pool, or a whole chain and briefs you when something moves.",
    example: "Every morning, tell me what moved on Robinhood Chain and why.",
    costPerRun: 0.012,
  },
  "repo-mechanic": {
    name: "Repo Mechanic",
    blurb: "Points a coding agent at a GitHub repo on a schedule. Fixes issues, opens PRs.",
    example: "Nightly, triage open issues in daraijaola/moonlet and open PRs for the easy ones.",
    costPerRun: 0.18,
  },
  digest: {
    name: "Digest",
    blurb: "Reads the channels, docs, or feeds you point it at and sends one clean summary.",
    example: "At 9pm, summarize my three Telegram groups into five bullets.",
    costPerRun: 0.02,
  },
  custom: {
    name: "Custom",
    blurb: "Describe the job in one sentence. Moonlet turns it into a schedule and tools.",
    example: "Reply to mentions of my project on X, politely, twice a day.",
    costPerRun: 0.03,
  },
};

export const DEMO_WALLET = "0x7a3f9C21bD4e8F10a2B6c9D3E5f7A1b2C3d4E9c2";

/** Approximate credits a bag earns per day. Placeholder curve, not Orbio's real formula. */
export function estimateEarnPerDay(bag: number): number {
  // ~$30k/day distributed across ~950M tokens ≈ $0.0000316 per token per day
  return Math.max(0, bag * 0.0000316);
}

export function estimateRunsPerDay(bag: number, template: Template): number {
  const earn = estimateEarnPerDay(bag);
  return Math.max(0, Math.floor(earn / TEMPLATES[template].costPerRun));
}

const now = Date.now();
const h = (n: number) => new Date(now - n * 3600_000).toISOString();

export const MOONLETS: Moonlet[] = [
  {
    id: "m_lumen",
    name: "Lumen",
    owner: DEMO_WALLET,
    template: "market-watch",
    job: "Every morning, tell me what moved on Robinhood Chain and why.",
    status: "running",
    createdAt: h(52),
    bag: 1_250_000,
    earnPerDay: 39.5,
    burnPerDay: 11.2,
    balance: 61.4,
    uptimePct: 99.6,
    keysRotated: 2,
    runsToday: 4,
    cadence: "every 6h",
    delivery: { public: true, telegram: "@dara" },
  },
  {
    id: "m_pebble",
    name: "Pebble",
    owner: DEMO_WALLET,
    template: "digest",
    job: "At 9pm, summarize my three Telegram groups into five bullets.",
    status: "idle",
    createdAt: h(30),
    bag: 1_250_000,
    earnPerDay: 39.5,
    burnPerDay: 0.9,
    balance: 12.3,
    uptimePct: 100,
    keysRotated: 0,
    runsToday: 1,
    cadence: "daily",
    delivery: { public: true },
  },
  {
    id: "m_tide",
    name: "Tide",
    owner: "0x11aBcD9F0e1A2b3C4d5E6f7A8b9C0d1E2f3A4b5C",
    template: "repo-mechanic",
    job: "Nightly, triage open issues in acme/router and open PRs for the easy ones.",
    status: "running",
    createdAt: h(70),
    bag: 4_800_000,
    earnPerDay: 151.7,
    burnPerDay: 88.0,
    balance: 140.2,
    uptimePct: 98.9,
    keysRotated: 5,
    runsToday: 3,
    cadence: "hourly",
    delivery: { public: true, x: "@acme" },
  },
  {
    id: "m_dust",
    name: "Dust",
    owner: "0x99fEdC3b2A1908C7d6E5F4a3B2c1D0e9F8a7B6c5",
    template: "custom",
    job: "Reply to mentions of my project on X, politely, twice a day.",
    status: "quiet",
    createdAt: h(90),
    bag: 800,
    earnPerDay: 0.02,
    burnPerDay: 0,
    balance: 0.4,
    uptimePct: 61.2,
    keysRotated: 1,
    runsToday: 0,
    cadence: "paused: bag below 1,000",
    delivery: { public: true },
  },
  {
    id: "m_halo",
    name: "Halo",
    owner: "0x5544aA33bB22cC11dD00eE99fF88a77b66C55d44",
    template: "market-watch",
    job: "Ping me if $ORBIO liquidity moves 10% in either direction.",
    status: "running",
    createdAt: h(20),
    bag: 60_000,
    earnPerDay: 1.9,
    burnPerDay: 1.1,
    balance: 3.2,
    uptimePct: 100,
    keysRotated: 0,
    runsToday: 6,
    cadence: "every 4h",
    delivery: { public: true, telegram: "@halo" },
  },
  {
    id: "m_ember",
    name: "Ember",
    owner: "0xaBcDeF1234567890aBcDeF1234567890aBcDeF12",
    template: "digest",
    job: "Once a week, tell me what the other moonlets are doing.",
    status: "idle",
    createdAt: h(12),
    bag: 15_000,
    earnPerDay: 0.47,
    burnPerDay: 0.05,
    balance: 0.9,
    uptimePct: 100,
    keysRotated: 0,
    runsToday: 0,
    cadence: "weekly",
    delivery: { public: true },
  },
];

const tx = (s: string) => `0x${s.padEnd(64, "0").slice(0, 64)}`;

export const RUNS: Run[] = [
  {
    id: "r1",
    moonletId: "m_lumen",
    at: h(1),
    title: "Morning brief: Robinhood Chain",
    summary:
      "ORBIO/NVDA pool liquidity up 4.1% overnight. Two new Pons graduations. NVDA tokenized volume flat. No whale moves above $50k.",
    output: { kind: "brief", label: "Read brief" },
    creditsSpent: 0.011,
    model: "google/gemini-3.8-flash",
    txHash: tx("a3dbef11"),
  },
  {
    id: "r2",
    moonletId: "m_lumen",
    at: h(7),
    title: "Liquidity chart, 24h",
    summary: "Rendered the 24h liquidity chart for the three largest ORBIO pools.",
    output: { kind: "chart", label: "View chart" },
    creditsSpent: 0.009,
    model: "google/gemini-3.8-flash",
    txHash: tx("b91c02ff"),
  },
  {
    id: "r3",
    moonletId: "m_lumen",
    at: h(13),
    title: "Key rotated",
    summary: "Active key hit 92% spend. Claimed a fresh $60 key through Orbio MCP and revoked the old one. No downtime.",
    output: { kind: "note", label: "Key event" },
    creditsSpent: 0,
    model: "system",
    txHash: tx("c0ffee77"),
  },
  {
    id: "r4",
    moonletId: "m_pebble",
    at: h(3),
    title: "Nightly digest",
    summary:
      "Three groups, 412 messages. Five bullets: two alpha calls, one scam warning, a Pons V2 fee change, and a meetup on Friday.",
    output: { kind: "brief", label: "Read digest" },
    creditsSpent: 0.018,
    model: "anthropic/claude-haiku-4-5",
    txHash: tx("d1ge5700"),
  },
  {
    id: "r5",
    moonletId: "m_tide",
    at: h(2),
    title: "PR opened: fix retry backoff",
    summary: "Issue #212 reproduced in sandbox, patched exponential backoff, tests green. Opened PR #219.",
    output: { kind: "pr", label: "Open PR #219", href: "https://github.com" },
    creditsSpent: 0.21,
    model: "anthropic/claude-sonnet-5",
    txHash: tx("f1x00219"),
  },
  {
    id: "r6",
    moonletId: "m_halo",
    at: h(0.5),
    title: "Alert: liquidity +11.4%",
    summary: "ORBIO/NVDA pool crossed the 10% threshold. Sent Telegram alert with pool link.",
    output: { kind: "note", label: "Alert" },
    creditsSpent: 0.004,
    model: "google/gemini-3.8-flash",
    txHash: tx("ha10a1e7"),
  },
];

export function getMoonlets(owner?: string): Moonlet[] {
  return owner ? MOONLETS.filter((m) => m.owner === owner) : MOONLETS;
}

export function getMoonlet(id: string): Moonlet | undefined {
  return MOONLETS.find((m) => m.id === id);
}

export function getRuns(moonletId: string): Run[] {
  return RUNS.filter((r) => r.moonletId === moonletId).sort(
    (a, b) => +new Date(b.at) - +new Date(a.at),
  );
}

export function getSkyStats() {
  const alive = MOONLETS.filter((m) => m.status !== "quiet");
  return {
    alive: alive.length,
    total: MOONLETS.length,
    creditsPerDay: alive.reduce((s, m) => s + m.earnPerDay, 0),
    runsToday: MOONLETS.reduce((s, m) => s + m.runsToday, 0),
    anchored: RUNS.filter((r) => r.txHash).length,
  };
}

export const EXPLORER = "https://robinhoodchain.blockscout.com/tx/";

export function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function fmtUsd(n: number, digits = 2) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 100 && digits >= 2) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(digits)}`;
}

export function fmtBag(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 2 : 0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 ? 1 : 0)}K`;
  return String(n);
}

export function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - +new Date(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const hrs = Math.round(m / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
