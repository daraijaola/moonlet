import type { JobSpec } from "./spec";
import type { MoonletRow, RunRow } from "./store";

/**
 * Two layers. The job text (objective, checks, sources) is hidden while the spec uses private tools (mail, repo reads).
 * Each run carries its own `private` flag, fixed when it ran, so editing the job later never publishes old reports.
 */
export const isPrivateSpec = (spec: Pick<JobSpec, "tools">) => spec.tools.some((t) => t.startsWith("gmail_") || t === "github_read");

export const PRIVATE_OBJECTIVE = "Works inside its owner's accounts. The job and its reports are private; every run is still hashed and anchored here.";

export function redactSpec(spec: JobSpec): JobSpec {
  if (!isPrivateSpec(spec)) return spec;
  return { ...spec, objective: PRIVATE_OBJECTIVE, sources: [], checks: [], tripwire: null };
}

export function redactMoonlet<T extends Pick<MoonletRow, "spec" | "openCalls">>(m: T): T {
  if (!isPrivateSpec(m.spec)) return m;
  return { ...m, spec: redactSpec(m.spec), openCalls: [] };
}

export function redactRun<T extends RunRow>(r: T): T {
  return {
    ...r,
    title: r.status === "failed" ? "Private run failed" : r.status === "quiet" ? "Private run, quiet" : "Private run",
    summary: "The report went to the owner. Only the receipt is public.",
    body: "",
    sources: [],
    sections: [],
    calls: [],
    scored: [],
    keyEvents: r.keyEvents.filter((e) => e.kind !== "tripwire"),
    trace: undefined,
    error: r.error ? "see the owner's app for the reason" : null,
  };
}
