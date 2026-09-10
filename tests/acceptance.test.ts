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
