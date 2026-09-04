import type { TemplateId, ToolId, Cadence } from "@/moonlet/spec";

export const TEMPLATE_LABEL: Record<TemplateId, string> = {
  "market-watch": "Market Watch",
  "repo-mechanic": "Repo Mechanic",
  digest: "Digest",
  custom: "Custom",
};

export const TEMPLATE_BLURB: Record<TemplateId, string> = {
  "market-watch": "Watches a token, a pool, or a whole chain and briefs you when something moves.",
  "repo-mechanic": "Points a coding agent at a GitHub repo on a schedule. Fixes issues, opens PRs.",
  digest: "Reads the channels, docs, or feeds you point it at and sends one clean summary.",
  custom: "Describe the job in one sentence. Moonlet turns it into a schedule and tools.",
};

export const TEMPLATE_EXAMPLE: Record<TemplateId, string> = {
  "market-watch": "Every morning, tell me what moved on Robinhood Chain and why.",
  "repo-mechanic": "Nightly, triage open issues in daraijaola/moonlet and open PRs for the easy ones.",
  digest: "At 9pm, summarize these three pages into five bullets: …",
  custom: "Reply to mentions of my project on X, politely, twice a day.",
};

export const TOOL_LABEL: Record<ToolId, string> = {
  web_search: "Web search",
  web_fetch: "Read pages",
  chain_read: "Robinhood Chain RPC",
  token_market: "DEX market data",
  sandbox: "Sandboxed shell",
  deliver: "Deliver",
};

export const CADENCE_LABEL: Record<Cadence, string> = {
  "15m": "every 15 min",
  "1h": "hourly",
  "4h": "every 4h",
  "6h": "every 6h",
  "12h": "twice daily",
  "24h": "daily",
  "7d": "weekly",
};
