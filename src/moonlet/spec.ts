import { z } from "zod";

/**
 * A JobSpec is what a one-sentence job becomes after compilation. The user
 * sees and edits this before launch; the runner executes it. Nothing about a
 * moonlet's behaviour lives outside this object plus its template's prompt.
 */

export const TEMPLATE_IDS = ["market-watch", "repo-mechanic", "inbox", "digest", "custom"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const TOOL_IDS = [
  "web_search",
  "web_fetch",
  "chain_read",
  "token_market",
  "sandbox",
  "deliver",
  "github_read",
  "open_pull_request",
  "comment_on_issue",
  "open_issue",
  "post_tweet",
  "spawn_moonlet",
  "write_document",
  "gmail_read",
  "gmail_draft",
  "gmail_send",
  "gmail_forward",
  "gmail_organize",
] as const;

/** Tools that need a connection on the owner's account before a moonlet may use them. */
export const TOOL_REQUIRES: Partial<Record<ToolId, "telegram" | "github" | "x" | "gmail">> = {
  github_read: "github",
  open_pull_request: "github",
  comment_on_issue: "github",
  open_issue: "github",
  post_tweet: "x",
  gmail_read: "gmail",
  gmail_draft: "gmail",
  gmail_send: "gmail",
  gmail_forward: "gmail",
  gmail_organize: "gmail",
};
/** Tools that act on the owner's behalf; always go through draft → approve unless autopilot. */
export const ACTING_TOOLS: ToolId[] = ["open_pull_request", "comment_on_issue", "open_issue", "post_tweet", "spawn_moonlet", "gmail_send", "gmail_forward", "gmail_organize"];
export type ToolId = (typeof TOOL_IDS)[number];

export const MODEL_CHOICES = ["auto", "google/gemini-3.8-flash", "openai/gpt-5.6-terra", "anthropic/claude-sonnet-5"] as const;
export type ModelChoice = (typeof MODEL_CHOICES)[number];

/** How much more a run costs on each model than on Flash, which the template costs assume. Auto is planned at the middle tier. */
export const MODEL_COST_MULT: Record<ModelChoice, number> = { auto: 4, "google/gemini-3.8-flash": 1, "openai/gpt-5.6-terra": 4, "anthropic/claude-sonnet-5": 6 };

/** A per-run cap that lets this template finish on this model. Templates were costed on Flash; heavier models need room. */
export function recommendedCapUsd(template: TemplateId, model: ModelChoice = "auto") {
  return Math.round(TEMPLATE_DEFAULTS[template].costPerRunUsd * MODEL_COST_MULT[model] * 1000) / 1000;
}

export const Cadence = z.enum(["15m", "1h", "4h", "6h", "12h", "24h", "7d"]);
export type Cadence = z.infer<typeof Cadence>;

export const CADENCE_MS: Record<Cadence, number> = {
  "15m": 15 * 60_000,
  "1h": 3_600_000,
  "4h": 4 * 3_600_000,
  "6h": 6 * 3_600_000,
  "12h": 12 * 3_600_000,
  "24h": 24 * 3_600_000,
  "7d": 7 * 24 * 3_600_000,
};

export const JobSpec = z.object({
  name: z.string().min(1).max(24).describe("Short moon-ish name: Lumen, Pebble, Tide."),
  template: z.enum(TEMPLATE_IDS),
  objective: z.string().min(8).max(400).describe("One or two plain sentences: what this moonlet is for."),
  cadence: Cadence.describe("How often to run. Prefer the slowest cadence that still does the job."),
  sources: z
    .array(z.string().min(1).max(200))
    .max(8)
    .describe("Concrete things to watch or read: URLs, token symbols, contract addresses, repo slugs, topics."),
  checks: z
    .array(z.string().min(4).max(160))
    .max(6)
    .default([])
    .describe("The concrete checks to perform every run, one line each, e.g. '$ORBIO price, liquidity and volume vs last run'. 2-5 for a watch job; empty for a single-purpose job."),
  tools: z.array(z.enum(TOOL_IDS)).min(1).max(6).describe("Only the tools this job needs. Fewer is better."),
  output: z.object({
    kind: z.enum(["brief", "alert", "digest", "pr", "note"]),
    maxWords: z.number().int().min(20).max(600),
    alwaysReport: z
      .boolean()
      .describe("false = stay silent when nothing meaningful happened (alerts). true = always produce output (briefs)."),
  }),
  voice: z
    .string()
    .max(160)
    .describe("Tone in a phrase. Default: terse, concrete, sources named, no hype."),
  spendCapUsd: z
    .number()
    .min(0.001)
    .max(5)
    .describe("Spend cap per run in USD. The runner stops using tools before crossing it; the first model call is not yet priced, so a run can overshoot by about one call."),
  model: z
    .enum(MODEL_CHOICES)
    .default("auto")
    .describe("auto picks by bag size. Otherwise a fixed OpenRouter model id."),
  tripwire: z
    .object({
      metric: z.enum(["price", "liquidity", "volume24h", "wallet_balance", "repo_activity"]).describe("what to watch for free between runs"),
      target: z.string().min(1).max(80).describe("token symbol or 0x address for price/liquidity/volume24h; wallet 0x address for wallet_balance; owner/name for repo_activity"),
      thresholdPct: z.number().min(1).max(90).describe("percent move that wakes the moonlet early (ignored for repo_activity: any new push, issue or pull request wakes it)"),
    })
    .nullable()
    .default(null)
    .describe("Watch jobs: a free check every 15 minutes wakes the moonlet as soon as the number moves this much, or the repo has a new push, issue or PR; the cadence becomes a heartbeat. null for inbox jobs, digests of pages, and one-off jobs."),
});
export type JobSpec = z.infer<typeof JobSpec>;
export type Tripwire = NonNullable<JobSpec["tripwire"]>;

export const JobSpecJsonSchema = z.toJSONSchema(JobSpec);

export const TEMPLATE_DEFAULTS: Record<
  TemplateId,
  { tools: ToolId[]; cadence: Cadence; output: JobSpec["output"]; costPerRunUsd: number }
> = {
  "market-watch": {
    tools: ["token_market", "chain_read", "web_search", "deliver"],
    cadence: "6h",
    output: { kind: "brief", maxWords: 180, alwaysReport: true },
    costPerRunUsd: 0.012,
  },
  "repo-mechanic": {
    tools: ["github_read", "web_fetch", "deliver"],
    cadence: "24h",
    output: { kind: "digest", maxWords: 220, alwaysReport: false },
    costPerRunUsd: 0.02,
  },
  inbox: {
    tools: ["gmail_read", "gmail_draft", "deliver"],
    cadence: "24h",
    output: { kind: "digest", maxWords: 220, alwaysReport: true },
    costPerRunUsd: 0.04,
  },
  digest: {
    tools: ["web_fetch", "web_search", "deliver"],
    cadence: "24h",
    output: { kind: "digest", maxWords: 220, alwaysReport: true },
    costPerRunUsd: 0.02,
  },
  custom: {
    tools: ["web_search", "web_fetch", "deliver"],
    cadence: "24h",
    output: { kind: "note", maxWords: 200, alwaysReport: true },
    costPerRunUsd: 0.03,
  },
};

/** The structured output every run must end with. Hashed and anchored. */
export const RunOutput = z.object({
  title: z.string().min(3).max(90),
  summary: z.string().min(1).max(600).describe("Plain text. What happened, why it matters. No markdown."),
  body: z.string().max(4000).describe("The full deliverable in markdown. Empty string if nothing to report."),
  sections: z
    .array(z.object({ check: z.string().max(160), finding: z.string().max(700), changed: z.boolean() }))
    .max(6)
    .describe("One entry per check in the plan, in order: what you found, and whether it changed since the last run. Empty when the plan has no checks."),
  remember: z
    .string()
    .max(1200)
    .describe("Compact notes for your next run: last values seen, last item ids, page fingerprints. Plain text. Empty if nothing worth carrying over."),
  sources: z.array(z.url()).max(12).describe("Only URLs actually used. Verbatim."),
  signal: z.enum(["none", "low", "medium", "high"]).describe("How much the owner should care."),
  nothingHappened: z.boolean().describe("true when there was nothing worth reporting."),
  calls: z
    .array(z.object({ claim: z.string().min(8).max(200), check: z.string().min(4).max(200) }))
    .max(2)
    .default([])
    .describe("Pre-committed calls about the next run: a concrete, checkable claim ('ORBIO liquidity above $450K') and exactly how you will check it next time. Empty for jobs with nothing that moves."),
  scored: z
    .array(z.object({ claim: z.string().max(200), result: z.enum(["hit", "miss", "void"]), evidence: z.string().max(300) }))
    .max(2)
    .default([])
    .describe("Every open call from your last run, scored now with what you actually observed. void only when it could not be checked."),
});
export type RunOutput = z.infer<typeof RunOutput>;
export type Call = RunOutput["calls"][number];
export type Scored = RunOutput["scored"][number];
export const RunOutputJsonSchema = z.toJSONSchema(RunOutput);
