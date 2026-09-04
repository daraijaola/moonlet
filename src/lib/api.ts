import type { JobSpec } from "@/moonlet/spec";
import type { Plan } from "@/moonlet/budget";

/** Thin client for the Moonlet API. The owner header is set from useAuth(). */

export type ApiMoonlet = {
  id: string;
  owner: string;
  name: string;
  spec: JobSpec;
  status: "running" | "idle" | "paused" | "quiet" | "deleted";
  delivery: { telegram?: string; x?: string };
  cadence: string;
  perRunCapUsd: number;
  earnPerDayUsd: number;
  burnPerDayUsd: number;
  keyLimitUsd: number;
  keySpentUsd: number;
  keyRemainingUsd: number;
  nextRunAt: number;
  lastRunAt: number | null;
  createdAt: number;
  keysRotated: number;
  runsTotal: number;
  runsFailed: number;
  spentTotalUsd: number;
};

export type ApiRun = {
  id: string;
  moonletId: string;
  at: number;
  status: "done" | "quiet" | "failed";
  title: string;
  summary: string;
  body: string;
  sources: string[];
  signal: string;
  nothingHappened: boolean;
  costUsd: number;
  model: string;
  modelCalls: number;
  durationMs: number;
  outputHash: string | null;
  txHash: string | null;
  explorerUrl: string | null;
  keyEvents: Array<{ kind: string; detail: string; amountUsd?: number }>;
  error: string | null;
};

export type OrbioStatus = { approved: boolean; bag: number; earnPerDayUsd: number; idleCreditsUsd: number | null; canWrite: boolean; orbio: { tools: string[]; error: string | null; expiresAt: number | null; dev: boolean } };

async function req<T>(owner: string | null, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(owner ? { "x-owner": owner } : {}), ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export const api = {
  orbioStatus: (owner: string) => req<OrbioStatus>(owner, "/api/orbio/status"),
  orbioDisconnect: (owner: string) => req<{ ok: boolean }>(owner, "/api/orbio/status", { method: "DELETE" }),
  orbioStart: (owner: string, redirectTo: string) =>
    req<{ url: string }>(owner, "/api/orbio/start", { method: "POST", body: JSON.stringify({ redirectTo, origin: typeof window !== "undefined" ? window.location.origin : undefined }) }),
  listMoonlets: (owner: string) => req<{ moonlets: ApiMoonlet[] }>(owner, "/api/moonlets"),
  getMoonlet: (id: string) => req<{ moonlet: ApiMoonlet }>(null, `/api/moonlets/${id}`),
  runs: (id: string) => req<{ runs: ApiRun[] }>(null, `/api/moonlets/${id}/runs`),
  compile: (owner: string, body: { sentence: string; template: JobSpec["template"]; name?: string }) =>
    req<{ spec: JobSpec; compiled: boolean }>(owner, "/api/moonlets/compile", { method: "POST", body: JSON.stringify(body) }),
  launch: (owner: string, body: { spec: JobSpec; delivery: { telegram?: string; x?: string }; runNow?: boolean }) =>
    req<{ moonlet: ApiMoonlet; plan: Plan; firstRun: { status: string; error?: string; runId?: string } | null }>(owner, "/api/moonlets", { method: "POST", body: JSON.stringify(body) }),
  patch: (owner: string, id: string, body: { action: "pause" | "resume" | "rotate_key" | "edit"; spec?: JobSpec; delivery?: { telegram?: string; x?: string } }) =>
    req<{ moonlet: ApiMoonlet }>(owner, `/api/moonlets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (owner: string, id: string) => req<{ ok: boolean; returnedUsd: number }>(owner, `/api/moonlets/${id}`, { method: "DELETE" }),
  runNow: (owner: string, id: string) => req<{ status: string; error?: string; runId?: string }>(owner, `/api/moonlets/${id}/run`, { method: "POST" }),
  sky: () => req<{ alive: number; total: number; creditsPerDay: number; burnPerDay: number; spentTotalUsd: number; runsToday: number; anchoredToday: number }>(null, "/api/sky/stats"),
};

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const fmtUsd = (n: number, digits = 2) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : n >= 100 && digits >= 2 ? `$${n.toFixed(0)}` : `$${n.toFixed(digits)}`);
export const fmtBag = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 2 : 0)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(n % 1_000 ? 1 : 0)}K` : String(Math.round(n)));
export function timeAgo(ms: number) {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
export function timeUntil(ms: number) {
  const s = Math.round((ms - Date.now()) / 1000);
  if (s <= 0) return "now";
  if (s < 60) return `in ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `in ${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `in ${h}h`;
  return `in ${Math.round(h / 24)}d`;
}
