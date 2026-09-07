import * as store from "../store";

/**
 * Discord, through a channel webhook the holder pastes. No app, no OAuth, no
 * bot to invite: Server Settings → Integrations → Webhooks → New Webhook →
 * Copy URL. Reports arrive as embeds; files as attachments. Webhooks cannot
 * carry buttons, so approvals stay on Telegram and the dashboard.
 */

export type DiscordConn = { webhookUrl: string; webhookName: string; channelId: string; guildId: string };

const WEBHOOK_RE = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/(\d{15,22})\/([\w-]{50,120})\/?$/;

export function parseWebhookUrl(raw: string) {
  const url = raw.trim();
  const m = WEBHOOK_RE.exec(url);
  if (!m) throw new Error("That isn't a Discord webhook URL. It looks like https://discord.com/api/webhooks/123…/abc…, copied from Server Settings → Integrations → Webhooks.");
  return `https://discord.com/api/webhooks/${m[1]}/${m[2]}`;
}

/** Validate the webhook with Discord (GET returns its name and channel), post a hello, store it. */
export async function connectWebhook(owner: string, raw: string, fetchImpl: typeof fetch = fetch) {
  const webhookUrl = parseWebhookUrl(raw);
  const res = await fetchImpl(webhookUrl, { signal: AbortSignal.timeout(10_000) });
  if (res.status === 401 || res.status === 404) throw new Error("Discord doesn't recognise that webhook. It may have been deleted; make a new one and paste the fresh URL.");
  if (!res.ok) throw new Error(`Discord answered ${res.status} while checking the webhook. Try again in a minute.`);
  const hook = (await res.json()) as { name?: string; channel_id?: string; guild_id?: string };
  const conn: DiscordConn = { webhookUrl, webhookName: hook.name || "Moonlet", channelId: hook.channel_id ?? "", guildId: hook.guild_id ?? "" };
  await postEmbed(webhookUrl, { title: "Moonlet connected", description: "Your moonlets will post their reports in this channel. Alerts, briefs and files land here the moment a run finishes; approvals stay in Telegram.", color: 0xe6b64a, footer: "moonlet.16labs.xyz" }, fetchImpl).catch(() => undefined);
  const label = `#${conn.channelId.slice(-4)} via ${conn.webhookName}`;
  await store.setConnection(owner, "discord", label, conn);
  return { label, webhookName: conn.webhookName };
}

export type Embed = {
  title: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: string;
  timestamp?: number;
};

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Discord's embed limits, applied so a long report never bounces the whole message. */
export function toEmbedPayload(e: Embed) {
  return {
    embeds: [
      {
        title: clip(e.title, 256),
        description: e.description ? clip(e.description, 4096) : undefined,
        url: e.url,
        color: e.color ?? 0x15161d,
        fields: e.fields?.slice(0, 25).map((f) => ({ name: clip(f.name || "·", 256), value: clip(f.value || "·", 1024), inline: !!f.inline })),
        footer: e.footer ? { text: clip(e.footer, 2048) } : undefined,
        timestamp: e.timestamp ? new Date(e.timestamp).toISOString() : undefined,
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

export async function postEmbed(webhookUrl: string, e: Embed, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`${webhookUrl}?wait=true`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(toEmbedPayload(e)),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const j = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true as const, id: j.id ?? "" };
}

/** Plain text (the `deliver` tool), still with mentions disabled so a moonlet can never @everyone. */
export async function postText(webhookUrl: string, content: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`${webhookUrl}?wait=true`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: clip(content, 2000), allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const j = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true as const, id: j.id ?? "" };
}

/** A report as a file: multipart with the embed as payload_json and the document as files[0]. Discord allows 10 MB on webhooks. */
export async function postFile(webhookUrl: string, file: { name: string; mime: string; bytes: Uint8Array; caption?: string }, fetchImpl: typeof fetch = fetch) {
  const form = new FormData();
  form.set("payload_json", JSON.stringify({ content: file.caption ? clip(`**${file.caption}**`, 2000) : undefined, allowed_mentions: { parse: [] } }));
  form.set("files[0]", new Blob([file.bytes as BlobPart], { type: file.mime }), file.name);
  const res = await fetchImpl(`${webhookUrl}?wait=true`, { method: "POST", body: form, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const j = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true as const, id: j.id ?? "" };
}

/** A finished run as one embed: summary up top, one field per check, receipts in the footer. */
export function reportEmbed(input: { moonletName: string; title: string; summary: string; sections?: Array<{ check: string; finding: string; changed: boolean }>; sources?: string[]; costUsd: number; hashed: boolean; publicUrl: string; at: number; signal?: string }): Embed {
  return {
    title: `${input.moonletName} · ${input.title}`,
    description: input.summary,
    url: input.publicUrl,
    color: input.signal === "high" ? 0xe6b64a : 0x4f7a5a,
    fields: (input.sections ?? []).map((s) => ({ name: `${s.changed ? "●" : "○"} ${s.check}`, value: s.finding })),
    footer: `$${input.costUsd.toFixed(4)} · ${input.hashed ? "hashed on Robinhood Chain" : "run recorded"}${input.sources?.length ? ` · ${input.sources.length} source${input.sources.length === 1 ? "" : "s"}` : ""}`,
    timestamp: input.at,
  };
}
