import { callModel, stepCountIs } from "@openrouter/agent";
import { buildCompilerInstructions } from "./personality";
import type { OpenRouterClient } from "./model";
import { pickModel } from "./model";
import { JobSpec, JobSpecJsonSchema, TEMPLATE_DEFAULTS, type TemplateId } from "./spec";

/**
 * One sentence in, a JobSpec out. Structured output with a strict schema; the
 * user reviews and edits the result before launch, so this only needs to be a
 * good first draft.
 */
export async function compileJob(
  client: OpenRouterClient,
  input: { sentence: string; template: TemplateId; name?: string },
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
    spendCapUsd: Math.min(Math.max(spec.spendCapUsd, d.costPerRunUsd), d.costPerRunUsd * 3),
  };
}

/** Deterministic spec when the model is unavailable, so launch never dead-ends. */
export function fallbackSpec(input: { sentence: string; template: TemplateId; name?: string }): JobSpec {
  const d = TEMPLATE_DEFAULTS[input.template];
  const alert = /\b(ping|alert|tell me when|notify|if)\b/i.test(input.sentence);
  return {
    name: input.name?.trim() || "Lumen",
    template: input.template,
    objective: input.sentence.trim(),
    cadence: alert ? "4h" : d.cadence,
    sources: extractSources(input.sentence),
    tools: d.tools,
    output: { ...d.output, alwaysReport: alert ? false : d.output.alwaysReport },
    voice: "terse, concrete, sources named, no hype",
    spendCapUsd: d.costPerRunUsd,
  };
}

export function extractSources(s: string) {
  const out = new Set<string>();
  for (const m of s.match(/0x[0-9a-fA-F]{40}/g) ?? []) out.add(m);
  for (const m of s.match(/https?:\/\/\S+/g) ?? []) out.add(m.replace(/[.,)]+$/, ""));
  for (const m of s.match(/\$[A-Z]{2,10}\b/g) ?? []) out.add(m);
  for (const m of s.match(/\b[\w-]+\/[\w.-]+\b/g) ?? []) if (!m.includes("http") && /^[a-z0-9-]+\/[a-z0-9._-]+$/i.test(m)) out.add(m);
  return [...out].slice(0, 8);
}
