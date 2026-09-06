import type { TemplateId, ToolId, Cadence, ModelChoice } from "@/moonlet/spec";

export const TEMPLATE_LABEL: Record<TemplateId, string> = {
  "market-watch": "ORBIO / RH watch",
  "repo-mechanic": "Repo watch",
  inbox: "Inbox",
  digest: "Digest",
  custom: "Custom",
};

export const TEMPLATE_BLURB: Record<TemplateId, string> = {
  "market-watch": "Liquidity, whales, new pools on Robinhood Chain. Briefs you when something actually moved.",
  "repo-mechanic": "Reads your repos on a schedule: commits, issues, PRs, files. Can open pull requests and comments; you approve the first, then it acts on its own.",
  inbox: "Works in your Gmail: briefs you on what came in, drafts replies, tidies up. Sending or archiving waits for your OK the first time.",
  digest: "Reads the pages you name and sends one short brief. No guessing unread sources.",
  custom: "One sentence. Tools we actually have: search, fetch, chain, market, sandbox.",
};

export const TEMPLATE_EXAMPLE: Record<TemplateId, string> = {
  "market-watch": "Ping me if $ORBIO liquidity moves 10%.",
  "repo-mechanic": "Every night, summarise the day's commits and open issues in my repo.",
  inbox: "Every morning, tell me what came into my email that needs an answer, and draft replies.",
  digest: "At 9pm, five bullets from https://www.orbio.so/build.",
  custom: "Every 12 hours, check my repo for new issues and message me a plan for each.",
};

export const TOOL_LABEL: Record<ToolId, string> = {
  web_search: "Web search",
  web_fetch: "Read pages",
  chain_read: "Robinhood Chain RPC",
  token_market: "DEX market data",
  sandbox: "Sandboxed shell",
  deliver: "Deliver",
  spawn_moonlet: "Spawn a moonlet",
  write_document: "Write a file (PDF, DOCX, TXT)",
  github_read: "Read GitHub repo",
  open_pull_request: "Open pull request",
  comment_on_issue: "Comment on issue",
  post_tweet: "Post on X",
  gmail_read: "Read Gmail",
  gmail_draft: "Draft in Gmail",
  gmail_send: "Send email",
  gmail_organize: "Tidy inbox",
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

export const MODEL_LABEL: Record<ModelChoice, { name: string; vendor: "auto" | "google" | "openai" | "anthropic"; hint: string }> = {
  auto: { name: "Auto", vendor: "auto", hint: "picks by bag size: Flash for small bags, Sonnet for large" },
  "google/gemini-3.8-flash": { name: "Gemini 3.8 Flash", vendor: "google", hint: "~$0.01 / run · fastest, cheapest" },
  "openai/gpt-5.6-terra": { name: "GPT-5.6 Terra", vendor: "openai", hint: "~$0.03 / run · solid middle" },
  "anthropic/claude-sonnet-5": { name: "Claude Sonnet 5", vendor: "anthropic", hint: "~$0.08 / run · best for code and nuance" },
};
