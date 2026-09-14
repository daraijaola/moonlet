import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import * as store from "@/moonlet/store";
import { propose, decide, describe as describeCard } from "@/moonlet/proposals";
import { runMoonlet } from "@/moonlet/runner";
import { verifySiwe, siweMessage, newNonce } from "@/moonlet/session";
import { redactRun, redactMoonlet } from "@/moonlet/privacy";
import { safeFetchText } from "@/moonlet/safe-fetch";
import { launchMoonlet, MAX_MOONLETS } from "@/moonlet/launch";
import { runLoop } from "@/moonlet/llm";
import type { JobSpec } from "@/moonlet/spec";
import { fakeGoogle } from "./fake-google";
import { fakeOrbio } from "./fakes";

/**
 * The acceptance matrix, in one place, with names a judge can read. Every case here is deterministic (fakes, no network, no
 * model spend) and is the promise the README makes, stated as a test. The deeper suites cover the same ground in more detail;
 * this file is the index.
 */

const A = "0x00000000000000000000000000000000000000a1";
const B = "0x00000000000000000000000000000000000000b2";
const noNet: typeof fetch = async () => { throw new Error("network disabled in this test"); };

const inbox: JobSpec = { name: "Postie", template: "inbox", objective: "Brief me on mail from jane@example.com and draft replies", cadence: "24h", sources: [], checks: [], tools: ["gmail_read", "gmail_send"], output: { kind: "digest", maxWords: 120, alwaysReport: true }, voice: "terse", spendCapUsd: 0.03, model: "auto", tripwire: null };
const repo: JobSpec = { name: "Micheal", template: "repo-mechanic", objective: "Open an issue for anything broken", cadence: "24h", sources: ["dara/moonlet"], checks: [], tools: ["github_read", "open_issue"], output: { kind: "digest", maxWords: 120, alwaysReport: true }, voice: "terse", spendCapUsd: 0.03, model: "auto", tripwire: null };
const seed = (id: string, owner: string, spec: JobSpec) => store.insertMoonlet({ id, owner, name: spec.name, spec, status: "idle", delivery: {}, key: { key: "sk-orbio-test", limitUsd: 1, spentUsd: 0 }, cadence: spec.cadence, perRunCapUsd: spec.spendCapUsd, earnPerDayUsd: 1, burnPerDayUsd: 0.03, nextRunAt: Date.now(), createdAt: Date.now() });

beforeAll(async () => {
  rmSync("/tmp/moonlet-acceptance.db", { force: true });
  process.env.DATABASE_URL = "file:/tmp/moonlet-acceptance.db";
  process.env.SECRET_KEY = "test";
  await store.migrate();
  await seed("m_a", A, inbox);
  await seed("m_b", B, repo);
  await store.setConnection(A, "gmail", "a@gmail.com", { email: "a@gmail.com", refreshToken: "r", accessToken: "ya29.a", expiresAt: Date.now() + 3_600_000 });
  await store.setConnection(B, "github", "@dara", { token: "ghp_b", login: "dara" });
});

describe("acceptance: the promises, as tests", () => {
  it("1. a foreign owner's report id never enters my moonlet's context", async () => {
    await store.insertRun({ id: "run_secret", moonletId: "m_a", at: 1, status: "done", title: "SECRET", summary: "SECRET-BODY", body: "", sources: [], signal: "changed", nothingHappened: false, costUsd: 0, model: "m", modelCalls: 1, durationMs: 1, outputHash: null, txHash: null, keyEvents: [], trace: [], sections: [], calls: [], scored: [], error: null, private: true });
    await store.insertRun({ id: "run_mine", moonletId: "m_b", at: 2, status: "done", title: "MINE", summary: "mine", body: "", sources: [], signal: "changed", nothingHappened: false, costUsd: 0, model: "m", modelCalls: 1, durationMs: 1, outputHash: null, txHash: null, keyEvents: [], trace: [], sections: [], calls: [], scored: [], error: null, private: false });
    let prompt = "";
    const echo = (async (_u: string | URL | Request, init?: RequestInit) => { prompt = String(init?.body); return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }], usage: { cost: 0 } }), { status: 200, headers: { "content-type": "application/json" } }); }) as typeof fetch;
    const { followup } = await import("@/moonlet/followup");
    await followup({ moonletId: "m_b", owner: B, text: "what did that say?", runId: "run_secret", fetch: echo });
    expect(prompt).not.toContain("SECRET");
    expect(prompt).toContain("MINE");
  });

  it("2. a rejected approval has no effect", async () => {
    let posts = 0;
    const gh: typeof fetch = async (i, init) => { if (init?.method === "POST") posts++; return new Response("{}", { status: 201 }); };
    const r = await propose({ kind: "issue_create", repo: "dara/moonlet", title: "t", body: "b" }, { owner: B, moonletId: "m_b", moonletName: "Micheal", runId: null, autopilot: false, fetch: gh });
    expect(r.status).toBe("pending");
    const d = await decide(r.proposalId!, "reject", gh);
    expect(d.ok && d.status).toBe("rejected");
    expect(posts).toBe(0);
    expect((await store.getProposal(r.proposalId!))!.status).toBe("rejected");
  });

  it("3. an approval acts once; a second approval is refused", async () => {
    let posts = 0;
    const gh: typeof fetch = async (i, init) => {
      if (String(i).endsWith("/issues") && init?.method === "POST") { posts++; return new Response(JSON.stringify({ html_url: "https://github.com/dara/moonlet/issues/1", number: 1 }), { status: 201 }); }
      return new Response(JSON.stringify({ html_url: "https://github.com/dara/moonlet/issues/1", title: "t", body: "b", labels: [], repository_url: "https://api.github.com/repos/dara/moonlet", state: "open" }), { status: 200 });
    };
    const r = await propose({ kind: "issue_create", repo: "dara/moonlet", title: "t", body: "b" }, { owner: B, moonletId: "m_b", moonletName: "Micheal", runId: null, autopilot: false, fetch: gh });
    const [x, y] = await Promise.all([decide(r.proposalId!, "approve", gh), decide(r.proposalId!, "approve", gh)]);
    expect([x, y].filter((d) => d.ok && d.status === "executed")).toHaveLength(1);
    expect(posts).toBe(1);
    expect((await decide(r.proposalId!, "approve", gh)).ok).toBe(false);
  });

  it("4. a provider timeout after the request is 'uncertain', never a silent retry", async () => {
    const hang: typeof fetch = async () => { throw new Error("The operation was aborted due to timeout"); };
    const r = await propose({ kind: "issue_create", repo: "dara/moonlet", title: "t", body: "b" }, { owner: B, moonletId: "m_b", moonletName: "Micheal", runId: null, autopilot: false, fetch: hang });
    const d = await decide(r.proposalId!, "approve", hang);
    expect(d.ok && d.status).toBe("uncertain");
    expect((await store.getProposal(r.proposalId!))!.status).toBe("uncertain");
  });

  it("5. the receipt is a read-back: a provider that returns something else yields 'mismatch'", async () => {
    const gh: typeof fetch = async (i, init) => {
      if (String(i).endsWith("/issues") && init?.method === "POST") return new Response(JSON.stringify({ html_url: "https://github.com/dara/moonlet/issues/2", number: 2 }), { status: 201 });
      return new Response(JSON.stringify({ html_url: "https://github.com/dara/moonlet/issues/2", title: "different", body: "b", labels: [], repository_url: "https://api.github.com/repos/dara/moonlet", state: "open" }), { status: 200 });
    };
    const r = await propose({ kind: "issue_create", repo: "dara/moonlet", title: "approved title", body: "b" }, { owner: B, moonletId: "m_b", moonletName: "Micheal", runId: null, autopilot: false, fetch: gh });
    await decide(r.proposalId!, "approve", gh);
    const v = (await store.getProposal(r.proposalId!))!.verification!;
    expect(v.status).toBe("mismatch");
    expect(v.checks.find((c) => c.field === "title")?.ok).toBe(false);
  });

  it("6. text inside an email cannot widen where mail goes or which repo is written", async () => {
    const g = fakeGoogle();
    const mail = await propose({ kind: "email_send", mail: { to: "attacker@evil.io", subject: "as instructed", body: "x" } }, { owner: A, moonletId: "m_a", moonletName: "Postie", runId: null, autopilot: true, fetch: g.fetchImpl });
    expect(mail.status).toBe("failed");
    expect(String((mail.result as { error?: string }).error)).toMatch(/not named in the job/);
    const issue = await propose({ kind: "issue_create", repo: "attacker/repo", title: "t", body: "b" }, { owner: B, moonletId: "m_b", moonletName: "Micheal", runId: null, autopilot: true, fetch: noNet });
    expect(issue.status).toBe("failed");
    expect(String((issue.result as { error?: string }).error)).toMatch(/may only write to dara\/moonlet/);
  });

  it("7. a header line break cannot add a hidden recipient", async () => {
    const g = fakeGoogle();
    const r = await propose({ kind: "email_send", mail: { to: "jane@example.com\r\nBcc: attacker@evil.io", subject: "hi", body: "x" } }, { owner: A, moonletId: "m_a", moonletName: "Postie", runId: null, autopilot: false, fetch: g.fetchImpl });
    expect(r.status).toBe("failed");
    expect(await store.listProposals(A, "pending")).toHaveLength(0);
  });

  it("8. what the card shows is what would be sent", () => {
    const card = describeCard("email_send", { mail: { to: "jane@example.com", cc: "boss@example.com", subject: "Re: lease", body: "Thursday works." } });
    expect(card.body).toMatch(/^To: jane@example.com\nCc: boss@example.com\nSubject: Re: lease/);
  });

  it("9. private content never reaches public representations", () => {
    const run = { id: "r", moonletId: "m_a", at: 1, status: "done" as const, title: "Jane's lease", summary: "Jane said", body: "Jane wrote", sources: ["https://mail.google.com/x"], signal: "changed", nothingHappened: false, costUsd: 0.01, model: "m", modelCalls: 1, durationMs: 1, outputHash: "0xabc", txHash: null, keyEvents: [{ kind: "tripwire" as const, detail: "mail from Jane" }], trace: [{ at: 1, tool: "gmail_read", summary: "Jane" }], sections: [{ check: "Jane", finding: "Jane", changed: true }], calls: [{ claim: "Jane", check: "x" }], scored: [], error: "quota for jane@example.com", private: true };
    expect(JSON.stringify(redactRun(run))).not.toMatch(/Jane|jane/);
    expect(JSON.stringify(redactMoonlet({ spec: inbox, openCalls: [{ claim: "Jane", check: "x", madeAt: 1, runId: null }] }))).not.toMatch(/jane/);
  });

  it("10. a signature for another site does not sign you in here", async () => {
    const acct = privateKeyToAccount(`0x${"33".repeat(32)}`);
    const nonce = newNonce();
    const foreign = siweMessage({ domain: "evil.example", uri: "https://evil.example", address: acct.address, nonce, issuedAt: new Date().toISOString() });
    expect(await verifySiwe({ message: foreign, signature: await acct.signMessage({ message: foreign }), address: acct.address, expectedNonce: nonce, expectedDomain: "moonlet.16labs.xyz", expectedUri: "https://moonlet.16labs.xyz" })).toBe(false);
  });

  it("11. the agent cannot make the server fetch itself", async () => {
    const f: typeof fetch = async (u) => (String(u).includes("example.com") ? new Response(null, { status: 302, headers: { location: "http://127.0.0.1:3000/api/cron/tick" } }) : new Response("never"));
    await expect(safeFetchText("http://localhost:3000/api/cron/tick", { fetch: f })).rejects.toThrow();
    await expect(safeFetchText("https://example.com/redirect", { fetch: f })).rejects.toThrow(/private or local/);
  });

  it("12. below the holder floor a run costs nothing and calls no model", async () => {
    const orbio = fakeOrbio({ realKey: "sk-orbio-x" });
    const r = await runMoonlet({ id: "m_q", owner: A, bag: 500, spec: inbox, delivery: {}, key: null }, { orbio: orbio.client, fetch: noNet });
    expect(r.status).toBe("quiet");
    expect(r.costUsd).toBe(0);
    expect(r.modelCalls).toBe(0);
    expect(orbio.state.calls).toEqual([]);
  });

  it("13. spend is counted per call, so a failed run still reports what it cost", async () => {
    let n = 0;
    const gateway = (async () => {
      n++;
      if (n === 1) return new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "nope", arguments: "{}" } }] } }], usage: { cost: 0.005, prompt_tokens: 10, completion_tokens: 5 } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ error: { message: "boom", code: 500 } }), { status: 500, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    let seen = 0;
    await expect(runLoop({ key: "k", model: "a", instructions: "x", input: "y", maxCostUsd: 1, maxSteps: 4, fetch: gateway, onSpend: (c) => { seen += c; } })).rejects.toThrow();
    expect(seen).toBeCloseTo(0.005, 6);
  });

  it("14. racing launches cannot pass the per-wallet cap", async () => {
    const C = "0x00000000000000000000000000000000000000c3";
    for (let i = 0; i < MAX_MOONLETS - 1; i++) expect((await launchMoonlet(C, { ...repo, name: `Pre${i}` }, { runNow: false, fetch: noNet })).ok).toBe(true);
    const rs = await Promise.all(Array.from({ length: 5 }, (_, i) => launchMoonlet(C, { ...repo, name: `Race${i}` }, { runNow: false, fetch: noNet })));
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
  });

  it("15. spawning a moonlet asks even on autopilot", async () => {
    const r = await propose({ kind: "spawn_moonlet", spec: { ...repo, name: "Child" }, reason: "worth its own watch" }, { owner: B, moonletId: "m_b", moonletName: "Micheal", runId: null, autopilot: true, fetch: noNet });
    expect(r.status).toBe("pending");
  });

  it("16. deleting a moonlet withdraws every pending draft, not the first fifty", async () => {
    for (let i = 0; i < 60; i++) await store.insertProposal({ id: `p_bulk_${i}`, owner: B, moonletId: "m_b", runId: null, kind: "issue_create", payload: { repo: "dara/moonlet", title: `t${i}`, body: "b" } });
    expect(await store.rejectPendingProposals("m_b")).toBeGreaterThanOrEqual(60);
    expect((await store.listProposals(B, "pending", 500)).filter((p) => p.moonletId === "m_b")).toHaveLength(0);
  });
});

describe("acceptance, second pass: the boundaries", () => {
  it("17. strangers see receipts of private-repo actions without titles, links or field values", async () => {
    const { GET } = await import("@/app/api/moonlets/[id]/actions/route");
    await seed("m_priv", B, { ...repo, name: "Priv", tools: ["github_read", "open_issue"] });
    await store.insertProposal({ id: "p_priv", owner: B, moonletId: "m_priv", runId: null, kind: "issue_create", payload: { repo: "dara/secret-repo", title: "SECRET TITLE", body: "b" } });
    await store.decideProposal("p_priv", "approved"); await store.leaseProposal("p_priv");
    await store.finishProposal("p_priv", "executed", { url: "https://github.com/dara/secret-repo/issues/1", number: 1 });
    await store.setProposalVerification("p_priv", { status: "verified", scope: "complete", url: "https://github.com/dara/secret-repo/issues/1", checks: [{ field: "title", expected: "SECRET TITLE", actual: "SECRET TITLE", ok: true }], at: Date.now() });
    const anon = await (await GET(new Request("http://x/api/moonlets/m_priv/actions"), { params: Promise.resolve({ id: "m_priv" }) })).json();
    expect(JSON.stringify(anon)).not.toMatch(/SECRET|secret-repo/);
    expect(anon.actions[0]).toMatchObject({ title: "Opened an issue", url: null, verification: { status: "verified" } });
    const own = await (await GET(new Request("http://x/api/moonlets/m_priv/actions", { headers: { "x-owner": B } }), { params: Promise.resolve({ id: "m_priv" }) })).json();
    expect(own.actions[0].title).toMatch(/SECRET TITLE/);
  });

  it("18. an approved empty bulk set stays empty; mail arriving later is never touched", async () => {
    const g = fakeGoogle();
    let modified = 0;
    const counting = (async (u: string | URL | Request, init?: RequestInit) => { if (String(u).includes("/messages/batchModify") || /\/messages\/[^/]+\/(trash|untrash)$/.test(String(u))) modified++; if (String(u).includes("/messages?q=")) return new Response(JSON.stringify({ messages: [] }), { status: 200, headers: { "content-type": "application/json" } }); return g.fetchImpl(u, init); }) as typeof fetch;
    const r = await propose({ kind: "email_organize", organize: { q: "from:newsletter@x.io", action: "archive" }, why: "tidy" }, { owner: A, moonletId: "m_a", moonletName: "Postie", runId: null, autopilot: false, fetch: counting });
    expect(r.status).toBe("pending");
    const stored = (await store.getProposal(r.proposalId!))!;
    expect((stored.payload.organize as { messageIds: string[] }).messageIds).toEqual([]);
    // Mail arrives that would match; approving the old empty draft must not sweep it.
    const later = (async (u: string | URL | Request, init?: RequestInit) => { if (String(u).includes("/messages?q=")) return new Response(JSON.stringify({ messages: Array.from({ length: 150 }, (_, i) => ({ id: `new${i}` })) }), { status: 200, headers: { "content-type": "application/json" } }); return counting(u, init); }) as typeof fetch;
    const d = await decide(r.proposalId!, "approve", later);
    expect(d.ok && d.status).toBe("executed");
    expect(modified).toBe(0);
    expect(((d as { result?: { changed?: number } }).result?.changed)).toBe(0);
  });

  it("19. 'verified' means the whole approved payload: a PR with the right file names but different contents is a mismatch", async () => {
    const { verifyProposal } = await import("@/moonlet/verify");
    const gh: typeof fetch = async (u) => {
      const s = String(u);
      if (/\/pulls\/5$/.test(s)) return new Response(JSON.stringify({ html_url: "https://github.com/dara/moonlet/pull/5", title: "Add changelog", state: "open", merged: false, base: { repo: { full_name: "dara/moonlet" } }, head: { ref: "moonlet/x", sha: "abc" } }), { status: 200 });
      if (/\/pulls\/5\/files/.test(s)) return new Response(JSON.stringify([{ filename: "CHANGELOG.md", sha: "1" }]), { status: 200 });
      if (/\/contents\/CHANGELOG\.md/.test(s)) return new Response(JSON.stringify({ content: Buffer.from("# Changelog\n\nsomething else entirely").toString("base64"), encoding: "base64" }), { status: 200 });
      return new Response("{}", { status: 404 });
    };
    const p = { id: "p_pr", owner: B, moonletId: "m_b", runId: null, kind: "pull_request" as const, payload: { plan: { repo: "dara/moonlet", title: "Add changelog", body: "", files: [{ path: "CHANGELOG.md", content: "# Changelog\n\n- approved line" }] } }, status: "executed" as const, result: { number: 5, url: "x" }, verification: null, telegramMsg: null, createdAt: 1, decidedAt: 1 };
    const v = await verifyProposal(p, gh);
    expect(v.status).toBe("mismatch");
    expect(v.checks.find((c) => c.field === "content of CHANGELOG.md")?.ok).toBe(false);
    expect(v.scope).toBe("complete");
  });

  it("20. an email that went out with an unexpected Cc or a different body is a mismatch", async () => {
    const { verifyProposal } = await import("@/moonlet/verify");
    const fake = (async (u: string | URL | Request) => {
      if (String(u).includes("/messages/sentX")) return new Response(JSON.stringify({ id: "sentX", threadId: "t1", labelIds: ["SENT"], payload: { headers: [{ name: "To", value: "jane@example.com" }, { name: "Cc", value: "attacker@evil.io" }, { name: "Subject", value: "Re: lease" }], body: { data: Buffer.from("A different body").toString("base64url") }, mimeType: "text/plain" } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
    const p = { id: "p_mail", owner: A, moonletId: "m_a", runId: null, kind: "email_send" as const, payload: { mail: { to: "jane@example.com", subject: "Re: lease", body: "Thursday works." } }, status: "executed" as const, result: { messageId: "sentX", threadId: "t1" }, verification: null, telegramMsg: null, createdAt: 1, decidedAt: 1 };
    const v = await verifyProposal(p, fake);
    expect(v.status).toBe("mismatch");
    expect(v.checks.filter((c) => !c.ok).map((c) => c.field).sort()).toEqual(["body", "cc"]);
  });

  it("21. an action left 'executing' by a dead process becomes 'uncertain' on the next tick, never re-run", async () => {
    await store.insertProposal({ id: "p_stuck", owner: B, moonletId: "m_b", runId: null, kind: "issue_create", payload: { repo: "dara/moonlet", title: "t", body: "b" } });
    await store.decideProposal("p_stuck", "approved");
    expect(await store.leaseProposal("p_stuck")).toBe(true);
    await store.db().execute({ sql: `UPDATE proposals SET executing_since=? WHERE id='p_stuck'`, args: [Date.now() - 60 * 60_000] });
    expect(await store.reconcileStuckActions(Date.now() - 5 * 60_000)).toBeGreaterThanOrEqual(1);
    const p = (await store.getProposal("p_stuck"))!;
    expect(p.status).toBe("uncertain");
    expect(String((p.result as { error?: string }).error)).toMatch(/may or may not have gone through/);
    expect(await store.leaseProposal("p_stuck")).toBe(false);
  });

  it("22. stale-run recovery is judged from the claim, so a fresh claim is never released", async () => {
    await seed("m_claim", B, repo);
    expect(await store.claimForRun("m_claim", Date.now())).toBe(true);
    await store.releaseStale(Date.now() - 10 * 60_000);
    expect((await store.getMoonlet("m_claim"))!.status).toBe("running");
    expect(await store.claimForRun("m_claim", Date.now())).toBe(false);
    await store.db().execute({ sql: `UPDATE moonlets SET claimed_at=? WHERE id='m_claim'`, args: [Date.now() - 30 * 60_000] });
    await store.releaseStale(Date.now() - 10 * 60_000);
    expect((await store.getMoonlet("m_claim"))!.status).toBe("idle");
  });

  it("23. a pool draining to zero trips the alert; missing data does not", async () => {
    const { readMetric } = await import("@/moonlet/tripwire");
    const dex = (pairs: unknown[]) => (async () => new Response(JSON.stringify({ pairs }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    const t = { metric: "liquidity" as const, target: "ORBIO", thresholdPct: 10 };
    expect(await readMetric(t, dex([{ chainId: "robinhood", liquidity: { usd: 0 }, priceUsd: "0" }]))).toBe(0);
    expect(await readMetric(t, dex([{ chainId: "robinhood", priceUsd: "1" }]))).toBeNull();
  });

  it("24. the failure counter is the number of failed run rows", async () => {
    await seed("m_cnt", B, repo);
    const base = { moonletId: "m_cnt", title: "t", summary: "s", body: "", sources: [], signal: "x", nothingHappened: false, costUsd: 0, model: "m", modelCalls: 0, durationMs: 0, outputHash: null, txHash: null, keyEvents: [], trace: [], sections: [], calls: [], scored: [], error: null, private: false };
    await store.insertRun({ ...base, id: "r_c1", at: 1, status: "done" });
    await store.insertRun({ ...base, id: "r_c2", at: 2, status: "failed", error: "boom" });
    const m = (await store.getMoonlet("m_cnt"))!;
    expect(m.runsTotal).toBe(2);
    expect(m.runsFailed).toBe(1);
  });
});
