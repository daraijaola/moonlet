import type { JobSpec } from "./spec";
import type { MoonletRow, RunRow } from "./store";

/** A moonlet that works inside its owner's mailbox reports to the owner alone: the public page, the sky and the JSON feed get the receipt (hash, cost, anchor), never the words. */
export const isPrivateSpec = (spec: Pick<JobSpec, "tools">) => spec.tools.some((t) => t.startsWith("gmail_"));

export const PRIVATE_OBJECTIVE = "Works inside its owner's inbox. The job and its reports are private; every run is still hashed and anchored here.";

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
    title: r.status === "failed" ? "Private run failed" : r.status === "quiet" ? "Private run, quiet" : "Private inbox run",
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
