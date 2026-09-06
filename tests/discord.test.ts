import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import * as store from "@/moonlet/store";
import * as discord from "@/moonlet/connections/discord";
import { buildTools } from "@/moonlet/tools";
import { fileSink } from "@/moonlet/files";
import { runOne } from "@/moonlet/scheduler";
import type { JobSpec } from "@/moonlet/spec";
import type { LocalTool } from "@/moonlet/llm";

const OWNER = "0x00000000000000000000000000000000000000dd";
const HOOK = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_abcdefgh";

/** A stand-in for Discord's webhook endpoint: remembers what was posted. */
function fakeDiscord(opts: { unknown?: boolean } = {}) {
  const posts: Array<{ url: string; json?: Record<string, unknown>; file?: { name: string; type: string }; payload?: Record<string, unknown> }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith("https://discord.com/api/webhooks/")) return new Response("not discord", { status: 500 });
    if (opts.unknown) return new Response(JSON.stringify({ message: "Unknown Webhook", code: 10015 }), { status: 404 });
    if (!init || !init.method || init.method === "GET") return new Response(JSON.stringify({ name: "Moonlet", channel_id: "555000111222333444", guild_id: "999" }), { headers: { "content-type": "application/json" } });
    if (init.body instanceof FormData) {
      const f = init.body.get("files[0]") as File;
      posts.push({ url, file: { name: f.name, type: f.type }, payload: JSON.parse(String(init.body.get("payload_json"))) });
    } else posts.push({ url, json: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ id: String(1000 + posts.length) }), { headers: { "content-type": "application/json" } });
  };
  return { fetchImpl, posts };
}

describe("discord webhook connection", () => {
  beforeAll(async () => {
    rmSync("/tmp/moonlet-discord.db", { force: true });
    process.env.DATABASE_URL = "file:/tmp/moonlet-discord.db";
    process.env.SECRET_KEY = "test";
    delete process.env.TELEGRAM_BOT_TOKEN;
    await store.migrate();
  });

  it("accepts real webhook URLs (any Discord host) and refuses anything else with a plain reason", () => {
    expect(discord.parseWebhookUrl(`  ${HOOK}/ `)).toBe(HOOK);
    expect(discord.parseWebhookUrl(HOOK.replace("discord.com", "ptb.discord.com"))).toBe(HOOK);
    expect(discord.parseWebhookUrl(HOOK.replace("discord.com", "discordapp.com"))).toBe(HOOK);
    expect(() => discord.parseWebhookUrl("https://discord.com/channels/1/2")).toThrow(/isn't a Discord webhook URL/);
    expect(() => discord.parseWebhookUrl("https://evil.example/api/webhooks/123456789012345678/" + "a".repeat(68))).toThrow(/isn't a Discord webhook URL/);
  });

  it("connect checks the webhook with Discord, says hello in the channel, stores it sealed", async () => {
    const d = fakeDiscord();
    const r = await discord.connectWebhook(OWNER, HOOK, d.fetchImpl);
    expect(r.label).toBe("#3444 via Moonlet");
    expect(d.posts).toHaveLength(1);
    expect((d.posts[0].json!.embeds as Array<{ title: string }>)[0].title).toBe("Moonlet connected");
    const conn = await store.getConnection<discord.DiscordConn>(OWNER, "discord");
    expect(conn?.data.webhookUrl).toBe(HOOK);
    expect((await store.listConnections(OWNER)).find((c) => c.kind === "discord")).toMatchObject({ label: "#3444 via Moonlet" });
  });

  it("a deleted webhook is refused with advice, nothing stored", async () => {
    const d = fakeDiscord({ unknown: true });
    await expect(discord.connectWebhook("0x00000000000000000000000000000000000000de", HOOK, d.fetchImpl)).rejects.toThrow(/doesn't recognise that webhook/);
    expect(await store.getConnection("0x00000000000000000000000000000000000000de", "discord")).toBeNull();
  });

  it("embeds respect Discord's limits and never allow mentions", () => {
    const p = discord.toEmbedPayload(discord.reportEmbed({
      moonletName: "Sentry",
      title: "x".repeat(400),
      summary: "y".repeat(5000),
      sections: Array.from({ length: 30 }, (_, i) => ({ check: `check ${i}`, finding: "z".repeat(2000), changed: i % 2 === 0 })),
      sources: ["a", "b"],
      costUsd: 0.0123,
      hashed: true,
      publicUrl: "https://16labs.xyz/s/m_1",
      at: 1_788_000_000_000,
      signal: "high",
    }));
    const e = p.embeds[0];
    expect(e.title.length).toBeLessThanOrEqual(256);
    expect(e.description!.length).toBeLessThanOrEqual(4096);
    expect(e.fields).toHaveLength(25);
    expect(e.fields![0].value.length).toBeLessThanOrEqual(1024);
    expect(e.fields![0].name.startsWith("● ")).toBe(true);
    expect(e.footer!.text).toBe("$0.0123 · hashed on Robinhood Chain · 2 sources");
    expect(e.color).toBe(0xe6b64a);
    expect(p.allowed_mentions).toEqual({ parse: [] });
  });

  it("the deliver tool can post plain text to Discord, mentions disabled", async () => {
    const d = fakeDiscord();
    const built = buildTools(["deliver"], {
      delivery: { discord: "connected" },
      deliver: async ({ channel, text }) => (channel === "discord" ? discord.postText(HOOK, text, d.fetchImpl) : { ok: false }),
    });
    const t = built.tools.find((x) => x.name === "deliver") as LocalTool;
    const r = await (t.execute as (a: unknown) => Promise<{ ok: boolean }>)({ channel: "discord", text: "@everyone ORBIO liquidity +11%" });
    expect(r.ok).toBe(true);
    expect(d.posts[0].json).toMatchObject({ content: "@everyone ORBIO liquidity +11%", allowed_mentions: { parse: [] } });
    const refused = await (t.execute as (a: unknown) => Promise<{ ok: boolean; error?: string }>)({ channel: "telegram", text: "hi" });
    expect(refused.ok).toBe(false);
  });

  it("files a moonlet writes are attached in the channel too", async () => {
    const d = fakeDiscord();
    const sink = fileSink({ owner: OWNER, moonletId: "m_dc", runId: "run_dc1", discordWebhook: HOOK, fetch: d.fetchImpl });
    const r = await sink({ name: "brief.pdf", mime: "application/pdf", bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]), caption: "Sentry · brief" });
    expect(r.sentTo).toEqual(["moonlet page", "discord"]);
    expect(d.posts[0].file).toEqual({ name: "brief.pdf", type: "application/pdf" });
    expect(d.posts[0].payload!.content).toBe("**Sentry · brief**");
  });

  it("a finished run is posted to the connected channel as a report card", async () => {
    const d = fakeDiscord();
    const spec: JobSpec = { name: "Sentry", template: "market-watch", objective: "watch", cadence: "6h", sources: ["$ORBIO"], checks: ["price"], tools: ["token_market", "deliver"], output: { kind: "brief", maxWords: 100, alwaysReport: true }, voice: "terse", spendCapUsd: 0.02, model: "auto" };
    await store.setOwnerBag(OWNER, 1_250_000);
    const now = Date.now();
    await store.insertMoonlet({ id: "m_dc", owner: OWNER, name: "Sentry", spec, status: "idle", delivery: {}, key: null, cadence: "6h", perRunCapUsd: 0.02, earnPerDayUsd: 30, burnPerDayUsd: 0.08, nextRunAt: now - 1000, createdAt: now });
    await store.claimForRun("m_dc", now);
    const r = await runOne("m_dc", {
      fetch: d.fetchImpl,
      anchor: null,
      bagOf: async () => 1_250_000,
      orbioFor: async () => ({} as never),
      run: async (m) => ({
        ok: true, status: "done", costUsd: 0.0111, model: "test", modelCalls: 1, durationMs: 100, keyEvents: [], trace: [], key: m.key,
        plan: { cadence: "6h", perRunCapUsd: 0.02, burnPerDayUsd: 0.08, earnPerDayUsd: 30, quiet: false },
        outputHash: "0x" + "ab".repeat(32),
        output: { title: "ORBIO up 4%", summary: "Liquidity climbed to $460K.", body: "", sections: [{ check: "price", finding: "$0.0104, +4%", changed: true }], remember: "", sources: ["dexscreener"], signal: "high", nothingHappened: false },
      }) as never,
    });
    expect(r.status).toBe("done");
    const card = d.posts.find((p) => p.json?.embeds);
    expect(card).toBeTruthy();
    const e = (card!.json!.embeds as Array<Record<string, unknown>>)[0];
    expect(e.title).toBe("Sentry · ORBIO up 4%");
    expect(e.url).toMatch(/\/s\/m_dc$/);
    expect((e.fields as Array<{ name: string }>)[0].name).toBe("● price");
  });
});
