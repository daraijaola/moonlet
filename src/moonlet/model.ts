/**
 * Model tiers and fallbacks. Requests go through Orbio's gateway (see llm.ts);
 * these pick which OpenRouter model id to ask for.
 */

/**
 * Model tiers by bag size. Cheap models for small bags so a 1,000-token holder
 * still gets a daily run; stronger models when the bag can pay for them.
 */
export function pickModel(earnPerDayUsd: number, kind: "compile" | "run" | "code") {
  if (kind === "compile") return process.env.MODEL_COMPILE ?? "google/gemini-3.8-flash";
  if (kind === "code") return process.env.MODEL_CODE ?? "anthropic/claude-sonnet-5";
  if (earnPerDayUsd >= 20) return process.env.MODEL_RUN_HIGH ?? "anthropic/claude-sonnet-5";
  if (earnPerDayUsd >= 1) return process.env.MODEL_RUN_MID ?? "openai/gpt-5.6-terra";
  return process.env.MODEL_RUN_LOW ?? "google/gemini-3.8-flash";
}

/**
 * Fallback chain per tier. OpenRouter tries these in order when the primary is
 * rate-limited or down, so a burst of moonlets doesn't all fail on one model's
 * per-minute cap.
 */
export function fallbackModels(primary: string): string[] {
  const env = process.env.MODEL_FALLBACKS?.split(",").map((s) => s.trim()).filter(Boolean);
  const defaults = ["google/gemini-3.8-flash", "openai/gpt-5.6-terra", "google/gemini-3.7-flash", "openai/gpt-5.4-mini"];
  return Array.from(new Set([primary, ...(env ?? defaults)])).slice(0, 3);
}
