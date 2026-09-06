import { callModel, stepCountIs } from "@openrouter/agent";
import { buildCompilerInstructions } from "./personality";
import type { OpenRouterClient } from "./model";
import { pickModel } from "./model";
import { JobSpec, JobSpecJsonSchema, TEMPLATE_DEFAULTS, type Cadence, type TemplateId } from "./spec";

/**
 * One sentence in, a JobSpec out. Structured output with a strict schema; the
 * user reviews and edits the result before launch, so this only needs to be a
 * good first draft.
 */
export async function compileJob(
  client: OpenRouterClient,
  input: { sentence: string; template: TemplateId; name?: string; repos?: string[] },
): Promise<JobSpec> {
  const defaults = TEMPLATE_DEFAULTS[input.template];
  const result = callModel(client, {
    model: pickModel(0, "compile"),
    instructions: buildCompilerInstructions(),
    input: [
      `Template: ${input.template}`,
      `Default tools for this template: ${defaults.tools.join(", ")}`,
      `Default cadence: ${defaults.cadence}`,
      input.name ? `Name chosen by the owner: ${input.name}` : "",
      input.repos?.length ? `The owner's GitHub repos (most recent first): ${input.repos.join(", ")}. If the request names one of them ("my repo X", "moonlet"), put its owner/name slug in sources.` : "",
      `Request: ${input.sentence}`,
    ]
      .filter(Boolean)
      .join("\n"),
    text: { format: { type: "json_schema", name: "job_spec", strict: true, schema: JobSpecJsonSchema as Record<string, unknown> } },
    stopWhen: stepCountIs(1),
  });
  const text = await result.getText();
  const parsed = JobSpec.safeParse(JSON.parse(text));
  if (parsed.success) return withDefaults(parsed.data, input);
  return fallbackSpec(input);
}

function withDefaults(spec: JobSpec, input: { sentence: string; template: TemplateId; name?: string }): JobSpec {
  const d = TEMPLATE_DEFAULTS[input.template];
  return {
    ...spec,
    template: input.template,
    name: input.name?.trim() || spec.name,
    tools: Array.from(new Set([...(spec.tools.length ? spec.tools : d.tools), "deliver" as const])),
    checks: (spec.checks ?? []).slice(0, 6),
    spendCapUsd: Math.min(Math.max(spec.spendCapUsd, d.costPerRunUsd), d.costPerRunUsd * 3),
    model: spec.model ?? "auto",
  };
}

/** Deterministic spec when the model is unavailable, so launch never dead-ends. */
export function fallbackSpec(input: { sentence: string; template: TemplateId; name?: string }): JobSpec {
  const d = TEMPLATE_DEFAULTS[input.template];
  const s = input.sentence;
  const alert = /\b(ping|alert|tell me when|notify me|if .+ moves?|when .+ moves?)\b/i.test(s);
  return {
    name: input.name?.trim() || "Lumen",
    template: input.template,
    objective: s.trim(),
    cadence: cadenceFrom(s, alert ? "4h" : d.cadence),
    sources: extractSources(s),
    checks: checksFrom(s),
    tools: d.tools,
    output: { ...d.output, alwaysReport: alert ? false : d.output.alwaysReport },
    voice: "terse, concrete, sources named, no hype",
    spendCapUsd: d.costPerRunUsd,
    model: "auto",
  };
}

/** Without a model: split on "and"/commas/";" into up to 5 concrete checks when the sentence reads like a watch list. */
function checksFrom(s: string): string[] {
  const body = s
    .replace(/^(every|each)\s+\d*\s*(minutes?|min|hours?|h|days?|mornings?|nights?|weeks?)\b[,:]?\s*/i, "")
    .replace(/\b(and\s+)?(tell|ping|alert|notify|message|brief)\s+me\b.*$/i, "")
    .trim();
  const parts = body.split(/\s*(?:;|,|\band\b)\s*/i).map((p) => p.replace(/^(watch|check|track|monitor|read)\s+/i, "").trim()).filter((p) => p.length >= 4);
  if (parts.length < 2) return [];
  return parts.slice(0, 5).map((p) => `${p.charAt(0).toUpperCase()}${p.slice(1)} vs last run`);
}

function cadenceFrom(s: string, fallback: Cadence): Cadence {
  if (/\b(every 15|realtime|real[- ]time)\b/i.test(s)) return "15m";
  if (/\bhourly\b/i.test(s)) return "1h";
  if (/\bevery 4h\b/i.test(s)) return "4h";
  if (/\bevery 6h\b/i.test(s)) return "6h";
  if (/\btwice (a |daily)|every 12h\b/i.test(s)) return "12h";
  if (/\b(every morning|daily|each day|at \d|tonight|nightly)\b/i.test(s)) return "24h";
  if (/\bweekly|once a week\b/i.test(s)) return "7d";
  return fallback;
}

export function extractSources(s: string) {
  const out = new Set<string>();
  for (const m of s.match(/0x[0-9a-fA-F]{40}/g) ?? []) out.add(m);
  for (const m of s.match(/https?:\/\/\S+/g) ?? []) out.add(m.replace(/[.,)]+$/, ""));
  for (const m of s.match(/\$[A-Z]{2,10}\b/g) ?? []) out.add(m);
  for (const m of s.match(/\b[\w-]+\/[\w.-]+\b/g) ?? []) if (!m.includes("http") && /^[a-z0-9-]+\/[a-z0-9._-]+$/i.test(m)) out.add(m);
  if (/\bORBIO\b/i.test(s) && ![...out].some((x) => /orbio/i.test(x))) out.add("$ORBIO");
  if (/\brobinhood\b/i.test(s)) out.add("Robinhood Chain");
  return [...out].slice(0, 8);
}
