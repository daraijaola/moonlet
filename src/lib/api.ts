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
  autopilot: boolean;
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
  parentId: string | null;
  keysRotated: number;
  runsTotal: number;
  runsFailed: number;
  spentTotalUsd: number;
};

export type ApiFile = { id: string; name: string; mime: string; size: number; createdAt: number; runId: string | null; runTitle: string | null; url: string };

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
  trace?: Array<{ at: number; tool: string; summary: string }>;
  sections?: Array<{ check: string; finding: string; changed: boolean }>;
  error: string | null;
  files?: Array<{ id: string; name: string; mime: string; size: number; url: string }>;
};

export type ConnectionKind = "telegram" | "github" | "x" | "discord" | "email";
export type Connections = {
  connections: Array<{ kind: ConnectionKind; label: string; createdAt: number }>;
  available: { telegram: boolean; telegramBot: string | null; github: boolean; githubOAuth: boolean; x: boolean; discord: boolean; email: boolean };
};
export type Proposal = {
  id: string;
  moonletId: string;
  kind: "tweet" | "pull_request" | "issue_comment" | "spawn_moonlet";
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  title: string;
  body: string;
  result: Record<string, unknown> | null;
  createdAt: number;
  decidedAt: number | null;
};

export type OrbioStatus = { approved: boolean; bag: number; earnPerDayUsd: number; idleCreditsUsd: number | null; legacyKeyUsd?: number | null; canWrite: boolean; orbio: { tools: string[]; error: string | null; expiresAt: number | null; dev: boolean } };

async function req<T>(owner: string | null, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(owner ? { "x-owner": owner } : {}), ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401 && owner && typeof window !== "undefined") {
    // Session cookie gone (expired or another device signed out): drop the local login and re-sign.
    window.dispatchEvent(new Event("moonlet:unauthorized"));
  }
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
  runs: (id: string) => req<{ runs: ApiRun[]; anchoring?: boolean }>(null, `/api/moonlets/${id}/runs`),
  files: (owner: string, id: string) => req<{ files: ApiFile[] }>(owner, `/api/moonlets/${id}/files`),
  compile: (owner: string, body: { sentence: string; template: JobSpec["template"]; name?: string }) =>
    req<{ spec: JobSpec; compiled: boolean }>(owner, "/api/moonlets/compile", { method: "POST", body: JSON.stringify(body) }),
  launch: (owner: string, body: { spec: JobSpec; delivery: { telegram?: string; x?: string }; autopilot?: boolean; runNow?: boolean }) =>
    req<{ moonlet: ApiMoonlet; plan: Plan; firstRunStarted: boolean }>(owner, "/api/moonlets", { method: "POST", body: JSON.stringify(body) }),
  patch: (owner: string, id: string, body: { action: "pause" | "resume" | "rotate_key" | "edit"; spec?: JobSpec; delivery?: { telegram?: string; x?: string }; autopilot?: boolean }) =>
    req<{ moonlet: ApiMoonlet }>(owner, `/api/moonlets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (owner: string, id: string) => req<{ ok: boolean; returnedUsd: number }>(owner, `/api/moonlets/${id}`, { method: "DELETE" }),
  runNow: (owner: string, id: string) => req<{ status: string; error?: string; runId?: string }>(owner, `/api/moonlets/${id}/run`, { method: "POST" }),
  connections: (owner: string) => req<Connections>(owner, "/api/connections"),
  disconnect: (owner: string, kind: ConnectionKind) => req<{ ok: boolean }>(owner, "/api/connections", { method: "DELETE", body: JSON.stringify({ kind }) }),
  telegramLink: (owner: string) => req<{ code: string; url: string | null }>(owner, "/api/connections/telegram", { method: "POST" }),
  telegramPoll: (owner: string) => req<{ linked: boolean; label: string | null }>(owner, "/api/connections/telegram"),
  githubStart: (owner: string) => req<{ url: string }>(owner, "/api/connections/github/start", { method: "POST", body: JSON.stringify({ origin: typeof window !== "undefined" ? window.location.origin : undefined, redirectTo: "/app/connections" }) }),
  githubConnect: (owner: string, token: string) => req<{ ok: boolean; login: string }>(owner, "/api/connections/github", { method: "POST", body: JSON.stringify({ token }) }),
  emailBegin: (owner: string, email: string) => req<{ ok: boolean; address: string }>(owner, "/api/connections/email", { method: "POST", body: JSON.stringify({ email }) }),
  emailFinish: (owner: string, code: string) => req<{ ok: boolean; label: string }>(owner, "/api/connections/email", { method: "POST", body: JSON.stringify({ code }) }),
  discordConnect: (owner: string, webhookUrl: string) => req<{ ok: boolean; label: string }>(owner, "/api/connections/discord", { method: "POST", body: JSON.stringify({ webhookUrl }) }),
  xConnect: (owner: string, keys: { apiKey: string; apiSecret: string; accessToken: string; accessSecret: string }) => req<{ ok: boolean; username: string }>(owner, "/api/connections/x", { method: "POST", body: JSON.stringify(keys) }),
  ask: (owner: string, id: string, text: string, runId?: string) => req<{ reply: string }>(owner, `/api/moonlets/${id}/ask`, { method: "POST", body: JSON.stringify({ text, runId }) }),
  proposals: (owner: string, status?: Proposal["status"]) => req<{ proposals: Proposal[] }>(owner, `/api/proposals${status ? `?status=${status}` : ""}`),
  decide: (owner: string, id: string, action: "approve" | "reject") => req<{ ok: boolean; status: string; result?: Record<string, unknown>; autopilotOn?: boolean }>(owner, `/api/proposals/${id}`, { method: "POST", body: JSON.stringify({ action }) }),
  sky: () => req<{ alive: number; total: number; creditsPerDay: number; burnPerDay: number; spentTotalUsd: number; runsToday: number; anchoredToday: number }>(null, "/api/sky/stats"),
};

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
/** Display only: full 0x addresses and tx hashes in prose become 0x8366…0951 (the stored/hashed text is untouched). */
export const shortenHexes = (s: string) => s.replace(/0x[0-9a-fA-F]{40,64}/g, shortAddr);
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
