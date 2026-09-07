import { randomBytes } from "node:crypto";
import * as store from "../store";

/**
 * GitHub, via a fine-grained personal access token the holder pastes. We
 * verify it, store it sealed, and expose two capabilities to moonlets:
 * reading (issues, PRs, commits, files) and, behind a proposal, opening a PR
 * that adds or changes files on a fresh branch.
 */

export type GitHubConn = { token: string; login: string; scopes?: string };

const GH = "https://api.github.com";

async function gh<T = unknown>(token: string, path: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<T> {
  const res = await fetchImpl(`${GH}${path}`, {
    ...init,
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "user-agent": "moonlet", "x-github-api-version": "2022-11-28", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let j: unknown = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    j = { raw: text.slice(0, 300) };
  }
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: ${res.status} ${(j as { message?: string })?.message ?? ""}`.trim());
  return j as T;
}

export function githubOAuthConfigured() {
  return !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

/** OAuth web flow: authorize → callback → exchange. Scope `repo` covers read + PRs on the user's repos. */
export async function beginOAuth(owner: string, redirectUri: string, redirectTo: string) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) throw new Error("GitHub sign-in isn't configured (GITHUB_CLIENT_ID)");
  const state = `gh_${randomBytes(12).toString("base64url")}`;
  await store.saveOauthState({ state, address: owner, verifier: "", clientId, redirectTo, redirectUri });
  const u = new URL("https://github.com/login/oauth/authorize");
  u.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope: "repo read:user", state, allow_signup: "false" }).toString();
  return u.toString();
}

export async function finishOAuth(code: string, state: string, fetchImpl: typeof fetch = fetch) {
  const saved = await store.takeOauthState(state);
  if (!saved) throw new Error("state expired");
  const res = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: saved.clientId, client_secret: process.env.GITHUB_CLIENT_SECRET, code, redirect_uri: saved.redirectUri }),
  });
  const t = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string; scope?: string };
  if (!res.ok || !t.access_token) throw new Error(`GitHub token exchange failed: ${t.error_description ?? res.status}`);
  const conn = await verifyToken(t.access_token, fetchImpl);
  conn.scopes = t.scope;
  await store.setConnection(saved.address, "github", `@${conn.login}`, conn);
  return { owner: saved.address, redirectTo: saved.redirectTo, login: conn.login };
}

export async function verifyToken(token: string, fetchImpl?: typeof fetch): Promise<GitHubConn> {
  const me = await gh<{ login: string }>(token, "/user", {}, fetchImpl);
  return { token, login: me.login };
}

export async function connectionFor(owner: string) {
  return store.getConnection<GitHubConn>(owner, "github");
}

export type RepoRead =
  | { action: "repos"; repo?: string; limit?: number }
  | { action: "readme"; repo: string; ref?: string }
  | { action: "issues"; repo: string; state?: "open" | "closed" | "all"; limit?: number }
  | { action: "pulls"; repo: string; state?: "open" | "closed" | "all"; limit?: number }
  | { action: "commits"; repo: string; limit?: number }
  | { action: "file"; repo: string; path: string; ref?: string }
  | { action: "tree"; repo: string; path?: string; ref?: string };

/** The owner's own repositories, most recently pushed first. */
export async function listRepos(token: string, limit = 30, fetchImpl?: typeof fetch) {
  const items = await gh<Array<Record<string, unknown>>>(token, `/user/repos?sort=pushed&per_page=${Math.min(100, limit)}&affiliation=owner,collaborator,organization_member`, {}, fetchImpl);
  return items.map((r) => ({ repo: r.full_name as string, private: !!r.private, description: String(r.description ?? "").slice(0, 160), language: r.language as string | null, pushed: r.pushed_at as string, stars: r.stargazers_count as number, url: r.html_url as string, defaultBranch: r.default_branch as string }));
}

export async function readRepo(token: string, q: RepoRead, fetchImpl?: typeof fetch) {
  if (q.action === "repos") return { repos: await listRepos(token, q.limit ?? 30, fetchImpl) };
  const [o, r] = q.repo.split("/");
  if (!o || !r) return { error: "repo must be owner/name" };
  const lim = Math.min(30, Math.max(1, ("limit" in q && q.limit) || 15));
  switch (q.action) {
    case "readme": {
      const f = await gh<{ content?: string; encoding?: string; path?: string; html_url?: string }>(token, `/repos/${o}/${r}/readme${q.ref ? `?ref=${q.ref}` : ""}`, {}, fetchImpl).catch(() => null);
      if (!f) return { error: "no README in this repo" };
      const text = f.content && f.encoding === "base64" ? Buffer.from(f.content, "base64").toString("utf8") : "";
      return { path: f.path, url: f.html_url, content: text.slice(0, 12_000), truncated: text.length > 12_000 };
    }
    case "issues": {
      const items = await gh<Array<Record<string, unknown>>>(token, `/repos/${o}/${r}/issues?state=${q.state ?? "open"}&per_page=${lim}`, {}, fetchImpl);
      return { issues: items.filter((i) => !i.pull_request).map((i) => ({ number: i.number, title: i.title, state: i.state, labels: (i.labels as Array<{ name: string }>)?.map((l) => l.name), updated: i.updated_at, url: i.html_url, body: String(i.body ?? "").slice(0, 600) })) };
    }
    case "pulls": {
      const items = await gh<Array<Record<string, unknown>>>(token, `/repos/${o}/${r}/pulls?state=${q.state ?? "open"}&per_page=${lim}`, {}, fetchImpl);
      return { pulls: items.map((p) => ({ number: p.number, title: p.title, state: p.state, draft: p.draft, head: (p.head as { ref: string })?.ref, updated: p.updated_at, url: p.html_url, body: String(p.body ?? "").slice(0, 600) })) };
    }
    case "commits": {
      const items = await gh<Array<Record<string, unknown>>>(token, `/repos/${o}/${r}/commits?per_page=${lim}`, {}, fetchImpl);
      return { commits: items.map((c) => ({ sha: String(c.sha).slice(0, 7), message: String((c.commit as { message: string }).message).split("\n")[0], author: (c.commit as { author: { name: string; date: string } }).author?.name, date: (c.commit as { author: { date: string } }).author?.date, url: c.html_url })) };
    }
    case "file": {
      const f = await gh<{ content?: string; encoding?: string; size?: number; sha: string }>(token, `/repos/${o}/${r}/contents/${q.path}${q.ref ? `?ref=${q.ref}` : ""}`, {}, fetchImpl);
      const text = f.content && f.encoding === "base64" ? Buffer.from(f.content, "base64").toString("utf8") : "";
      return { path: q.path, sha: f.sha, size: f.size, content: text.slice(0, 12_000), truncated: text.length > 12_000 };
    }
    case "tree": {
      const items = await gh<Array<{ name: string; path: string; type: string; size?: number }>>(token, `/repos/${o}/${r}/contents/${q.path ?? ""}${q.ref ? `?ref=${q.ref}` : ""}`, {}, fetchImpl);
      return { entries: (Array.isArray(items) ? items : [items]).slice(0, 100).map((e) => ({ name: e.name, path: e.path, type: e.type, size: e.size })) };
    }
  }
}

export type PullRequestPlan = {
  repo: string;
  title: string;
  body: string;
  branch?: string;
  files: Array<{ path: string; content: string }>;
};

/** Create a branch off the default branch, commit the files, open the PR. */
export async function openPullRequest(token: string, plan: PullRequestPlan, fetchImpl?: typeof fetch) {
  const [o, r] = plan.repo.split("/");
  const repo = await gh<{ default_branch: string }>(token, `/repos/${o}/${r}`, {}, fetchImpl);
  const base = repo.default_branch;
  const ref = await gh<{ object: { sha: string } }>(token, `/repos/${o}/${r}/git/ref/heads/${base}`, {}, fetchImpl);
  const branch = (plan.branch ?? `moonlet/${plan.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now().toString(36).slice(-4)}`).replace(/^refs\/heads\//, "");
  await gh(token, `/repos/${o}/${r}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.object.sha }) }, fetchImpl);
  for (const f of plan.files.slice(0, 10)) {
    let sha: string | undefined;
    try {
      sha = (await gh<{ sha: string }>(token, `/repos/${o}/${r}/contents/${f.path}?ref=${branch}`, {}, fetchImpl)).sha;
    } catch {
      sha = undefined;
    }
    await gh(token, `/repos/${o}/${r}/contents/${f.path}`, {
      method: "PUT",
      body: JSON.stringify({ message: `${plan.title}\n\nOpened by a moonlet.`, content: Buffer.from(f.content, "utf8").toString("base64"), branch, ...(sha ? { sha } : {}) }),
    }, fetchImpl);
  }
  const pr = await gh<{ number: number; html_url: string }>(token, `/repos/${o}/${r}/pulls`, {
    method: "POST",
    body: JSON.stringify({ title: plan.title, body: `${plan.body}\n\n---\nOpened by a moonlet after its owner approved the draft.`, head: branch, base }),
  }, fetchImpl);
  return { number: pr.number, url: pr.html_url, branch };
}

export async function openIssue(token: string, repo: string, title: string, body: string, labels: string[] = [], fetchImpl?: typeof fetch) {
  const [o, r] = repo.split("/");
  const c = await gh<{ html_url: string; number: number }>(token, `/repos/${o}/${r}/issues`, { method: "POST", body: JSON.stringify({ title, body, labels }) }, fetchImpl);
  return { url: c.html_url, number: c.number };
}

export async function commentOnIssue(token: string, repo: string, number: number, body: string, fetchImpl?: typeof fetch) {
  const [o, r] = repo.split("/");
  const c = await gh<{ html_url: string }>(token, `/repos/${o}/${r}/issues/${number}/comments`, { method: "POST", body: JSON.stringify({ body }) }, fetchImpl);
  return { url: c.html_url };
}
