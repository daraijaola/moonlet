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

export async function finishOAuth(code: string, state: string, sessionOwner: string | null, fetchImpl: typeof fetch = fetch) {
  const saved = await store.takeOauthState(state, "gh_", sessionOwner);
  if (!saved) throw new Error("this sign-in link is expired, already used, or was opened in a different browser than the one that started it. Start again from Connections.");
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
  | { action: "pull"; repo: string; number: number }
  | { action: "branches"; repo: string; limit?: number }
  | { action: "runs"; repo: string; limit?: number }
  | { action: "tree"; repo: string; path?: string; ref?: string };

/** The owner's own repositories, most recently pushed first. */
export async function listRepos(token: string, limit = 30, fetchImpl?: typeof fetch) {
  const items = await gh<Array<Record<string, unknown>>>(token, `/user/repos?sort=pushed&per_page=${Math.min(100, limit)}&affiliation=owner,collaborator,organization_member`, {}, fetchImpl);
  return items.map((r) => ({ repo: r.full_name as string, private: !!r.private, description: String(r.description ?? "").slice(0, 160), language: r.language as string | null, pushed: r.pushed_at as string, stars: r.stargazers_count as number, url: r.html_url as string, defaultBranch: r.default_branch as string }));
}

const repoPrivacy = new Map<string, boolean>();
/** Whether owner/name is a private repo, cached per process. Unknown (404, network) is treated as private. */
export async function isPrivateRepo(token: string, repo: string, fetchImpl?: typeof fetch): Promise<boolean> {
  const key = `${token.slice(-8)}:${repo.toLowerCase()}`;
  const hit = repoPrivacy.get(key);
  if (hit !== undefined) return hit;
  const r = await gh<{ private?: boolean }>(token, `/repos/${repo}`, {}, fetchImpl).catch(() => null);
  const priv = r ? !!r.private : true;
  repoPrivacy.set(key, priv);
  return priv;
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
    case "pull": {
      // Everything a merge decision needs, from GitHub's own records: mergeability, checks on the head, reviews, size, age.
      const n = q.number;
      const p = await gh<Record<string, unknown>>(token, `/repos/${o}/${r}/pulls/${n}`, {}, fetchImpl);
      const head = (p.head as { sha: string; ref: string }) ?? { sha: "", ref: "" };
      const [checks, reviews, files] = await Promise.all([
        gh<{ check_runs?: Array<{ name: string; status: string; conclusion: string | null }> }>(token, `/repos/${o}/${r}/commits/${head.sha}/check-runs?per_page=30`, {}, fetchImpl).catch(() => ({ check_runs: [] })),
        gh<Array<{ user: { login: string }; state: string; submitted_at: string }>>(token, `/repos/${o}/${r}/pulls/${n}/reviews?per_page=30`, {}, fetchImpl).catch(() => []),
        gh<Array<{ filename: string; additions: number; deletions: number; status: string }>>(token, `/repos/${o}/${r}/pulls/${n}/files?per_page=100`, {}, fetchImpl).catch(() => []),
      ]);
      const runs = checks.check_runs ?? [];
      const ci = runs.length === 0 ? "none" : runs.some((c) => c.status !== "completed") ? "pending" : runs.every((c) => c.conclusion === "success" || c.conclusion === "skipped" || c.conclusion === "neutral") ? "passing" : "failing";
      const latestByUser = new Map<string, string>();
      for (const rv of reviews) if (rv.state !== "COMMENTED") latestByUser.set(rv.user.login, rv.state);
      const ageDays = Math.round((Date.now() - new Date(String(p.created_at)).getTime()) / 86_400_000);
      const idleDays = Math.round((Date.now() - new Date(String(p.updated_at)).getTime()) / 86_400_000);
      return {
        number: n, title: p.title, url: p.html_url, author: (p.user as { login: string })?.login, draft: !!p.draft, state: p.state,
        base: (p.base as { ref: string })?.ref, head: head.ref, ageDays, idleDays,
        mergeable: p.mergeable, mergeableState: p.mergeable_state, merged: !!p.merged,
        ci, checks: runs.slice(0, 12).map((c) => ({ name: c.name, status: c.status, conclusion: c.conclusion })),
        reviews: [...latestByUser].map(([login, state]) => ({ login, state })), reviewComments: p.review_comments, comments: p.comments,
        size: { commits: p.commits, files: p.changed_files, additions: p.additions, deletions: p.deletions },
        files: files.slice(0, 40).map((f) => ({ path: f.filename, add: f.additions, del: f.deletions, status: f.status })),
        body: String(p.body ?? "").slice(0, 1200),
      };
    }
    case "branches": {
      // Where each branch stands against the default branch, so drift ("main is 27 behind") is a fact, not a guess.
      const repoInfo = await gh<{ default_branch: string }>(token, `/repos/${o}/${r}`, {}, fetchImpl);
      const branches = await gh<Array<{ name: string; commit: { sha: string } }>>(token, `/repos/${o}/${r}/branches?per_page=${lim}`, {}, fetchImpl);
      const out = [];
      for (const b of branches.slice(0, Math.min(lim, 12))) {
        if (b.name === repoInfo.default_branch) continue;
        const cmp = await gh<{ ahead_by: number; behind_by: number; status: string }>(token, `/repos/${o}/${r}/compare/${repoInfo.default_branch}...${b.name}`, {}, fetchImpl).catch(() => null);
        out.push({ name: b.name, aheadOfDefault: cmp?.ahead_by ?? null, behindDefault: cmp?.behind_by ?? null, status: cmp?.status ?? "unknown" });
      }
      return { defaultBranch: repoInfo.default_branch, branches: out };
    }
    case "runs": {
      const w = await gh<{ workflow_runs: Array<Record<string, unknown>> }>(token, `/repos/${o}/${r}/actions/runs?per_page=${lim}`, {}, fetchImpl);
      return { runs: w.workflow_runs.map((x) => ({ id: x.id, name: x.name, branch: x.head_branch, event: x.event, status: x.status, conclusion: x.conclusion, sha: String(x.head_sha).slice(0, 7), at: x.created_at, url: x.html_url })) };
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

/** Read-back for verified receipts: what actually exists, by id, in the repository we were told. */
export async function readIssue(token: string, repo: string, number: number, fetchImpl?: typeof fetch) {
  const [o, r] = repo.split("/");
  const i = await gh<{ html_url: string; title: string; body: string | null; labels: Array<{ name: string }>; repository_url: string; state: string }>(token, `/repos/${o}/${r}/issues/${number}`, {}, fetchImpl);
  return { url: i.html_url, title: i.title, body: i.body ?? "", labels: (i.labels ?? []).map((l) => l.name), repo: i.repository_url.replace(/^.*\/repos\//, ""), state: i.state };
}
export async function readPull(token: string, repo: string, number: number, fetchImpl?: typeof fetch) {
  const [o, r] = repo.split("/");
  const p = await gh<{ html_url: string; title: string; state: string; merged: boolean; base: { repo: { full_name: string } }; head: { ref: string; sha: string } }>(token, `/repos/${o}/${r}/pulls/${number}`, {}, fetchImpl);
  const files = await gh<Array<{ filename: string; sha: string }>>(token, `/repos/${o}/${r}/pulls/${number}/files?per_page=100`, {}, fetchImpl);
  return { url: p.html_url, title: p.title, state: p.state, merged: p.merged, repo: p.base.repo.full_name, headRef: p.head.sha, files };
}
/** The exact text of a file at a ref, for comparing approved content with what landed on the branch. */
export async function readFileAt(token: string, repo: string, ref: string, path: string, fetchImpl?: typeof fetch) {
  const [o, r] = repo.split("/");
  const f = await gh<{ content?: string; encoding?: string }>(token, `/repos/${o}/${r}/contents/${path}?ref=${encodeURIComponent(ref)}`, {}, fetchImpl);
  return f.content ? Buffer.from(f.content.replace(/\n/g, ""), "base64").toString("utf8") : "";
}
export async function readComment(token: string, repo: string, commentId: number, fetchImpl?: typeof fetch) {
  const [o, r] = repo.split("/");
  const c = await gh<{ html_url: string; body: string; issue_url: string }>(token, `/repos/${o}/${r}/issues/comments/${commentId}`, {}, fetchImpl);
  return { url: c.html_url, body: c.body, repo: c.issue_url.replace(/^.*\/repos\//, "").replace(/\/issues\/\d+$/, ""), issueNumber: Number(c.issue_url.match(/\/issues\/(\d+)$/)?.[1]) };
}

export async function commentOnIssue(token: string, repo: string, number: number, body: string, fetchImpl?: typeof fetch) {
  const [o, r] = repo.split("/");
  const c = await gh<{ html_url: string }>(token, `/repos/${o}/${r}/issues/${number}/comments`, { method: "POST", body: JSON.stringify({ body }) }, fetchImpl);
  return { url: c.html_url };
}
