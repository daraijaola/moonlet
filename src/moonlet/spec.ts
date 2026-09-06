import { z } from "zod";

/**
 * A JobSpec is what a one-sentence job becomes after compilation. The user
 * sees and edits this before launch; the runner executes it. Nothing about a
 * moonlet's behaviour lives outside this object plus its template's prompt.
 */

export const TEMPLATE_IDS = ["market-watch", "repo-mechanic", "digest", "custom"] as const;
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
  "post_tweet",
  "spawn_moonlet",
  "write_document",
] as const;

/** Tools that need a connection on the owner's account before a moonlet may use them. */
export const TOOL_REQUIRES: Partial<Record<ToolId, "telegram" | "github" | "x">> = {
  github_read: "github",
  open_pull_request: "github",
  comment_on_issue: "github",
  post_tweet: "x",
};
/** Tools that act on the owner's behalf; always go through draft → approve unless autopilot. */
export const ACTING_TOOLS: ToolId[] = ["open_pull_request", "comment_on_issue", "post_tweet", "spawn_moonlet"];
export type ToolId = (typeof TOOL_IDS)[number];

export const MODEL_CHOICES = ["auto", "google/gemini-3.8-flash", "openai/gpt-5.6-terra", "anthropic/claude-sonnet-5"] as const;
export type ModelChoice = (typeof MODEL_CHOICES)[number];

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
    .describe("Hard ceiling per run in USD. The runner enforces it with maxCost."),
  model: z
    .enum(MODEL_CHOICES)
    .default("auto")
    .describe("auto picks by bag size. Otherwise a fixed OpenRouter model id."),
});
export type JobSpec = z.infer<typeof JobSpec>;

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
});
export type RunOutput = z.infer<typeof RunOutput>;
export const RunOutputJsonSchema = z.toJSONSchema(RunOutput);
