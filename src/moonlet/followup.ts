import { callModel, maxCost, stepCountIs } from "@openrouter/agent";
import * as store from "./store";
import { makeClient } from "./model";
import { buildTools } from "./tools";
import { CADENCE_MS, Cadence } from "./spec";
import type { GitHubConn } from "./connections/github";

/**
 * A follow-up on one report. The owner replies to a result ("why did it move?",
 * "which wallet was that?", "do this every 6 hours instead") and gets an answer
 * grounded in that run, with the same read-only tools the moonlet used, billed
 * to the moonlet's own key. Schedule changes are applied directly.
 *
 * Kept deliberately small: one model call with a hard cap, at most three tool
 * steps, no acting tools. If the moonlet has no key yet, we say so.
 */

export type FollowupInput = {
  moonletId: string;
  owner: string;
  text: string;
  /** The report being replied to. Omit to answer against the latest run. */
  runId?: string | null;
  /** Optional image the owner attached (a chart screenshot, a message). */
  imageUrl?: string | null;
  fetch?: typeof fetch;
};

const CADENCE_WORDS: Record<Cadence, string> = { "15m": "every 15 minutes", "1h": "hourly", "4h": "every 4 hours", "6h": "every 6 hours", "12h": "every 12 hours", "24h": "daily", "7d": "weekly" };

function parseCadence(text: string): Cadence | null {
  const t = text.toLowerCase();
  if (/every\s*15\s*min|quarter/.test(t)) return "15m";
  if (/hourly|every\s*hour|each\s*hour|every\s*1\s*h/.test(t)) return "1h";
  if (/every\s*4\s*h/.test(t)) return "4h";
  if (/every\s*6\s*h|twice a day|twice daily|four times/.test(t)) return "6h";
  if (/every\s*12\s*h|twice a day/.test(t)) return "12h";
  if (/daily|every\s*day|each\s*day|every\s*24\s*h|every morning|every night|once a day/.test(t)) return "24h";
  if (/weekly|every\s*week|once a week|every\s*7\s*d/.test(t)) return "7d";
  return null;
}

export async function followup(input: FollowupInput): Promise<string> {
  const m = await store.getMoonlet(input.moonletId);
  if (!m || m.owner !== input.owner) return "That moonlet isn't yours or no longer exists.";

  // Plain schedule changes need no model.
  const cadence = /\b(run|report|check|do (this|it)|every|hourly|daily|weekly|schedule|instead)\b/i.test(input.text) ? parseCadence(input.text) : null;
  if (cadence && /\b(every|hourly|daily|weekly|schedule|instead|from now)\b/i.test(input.text) && input.text.trim().split(/\s+/).length <= 14) {
    await store.updateMoonlet(m.id, { spec: { ...m.spec, cadence }, cadence, nextRunAt: Math.min(m.nextRunAt, Date.now() + CADENCE_MS[cadence]) });
    return `Done. ${m.name} now reports ${CADENCE_WORDS[cadence]}.`;
  }

  const key = m.key?.key ?? (await store.listMoonlets(m.owner)).find((x) => x.key?.key)?.key?.key ?? process.env.COMPILE_API_KEY;
  if (!key) return `${m.name} hasn't claimed a key yet, so I can't dig in until its first run. Ask again after that.`;

  const runs = await store.listRuns(m.id, 3);
  const run = (input.runId && runs.find((r) => r.id === input.runId)) ?? (input.runId ? await store.getRun(input.runId) : null) ?? runs[0] ?? null;
  const gh = await store.getConnection<GitHubConn>(m.owner, "github");
  const readOnly = m.spec.tools.filter((t) => !["deliver", "open_pull_request", "comment_on_issue", "post_tweet"].includes(t));
  const tools = buildTools(readOnly, { fetch: input.fetch, delivery: {}, connections: { github: gh?.data } });

  const context = run
    ? [
        `Report being discussed (${new Date(run.at).toISOString()}, status ${run.status}):`,
        `Title: ${run.title}`,
        `Summary: ${run.summary}`,
        run.sections?.length ? `Sections:\n${run.sections.map((s) => `- ${s.check}: ${s.finding}${s.changed ? " (changed)" : ""}`).join("\n")}` : "",
        run.body ? `Body:\n${run.body.slice(0, 2500)}` : "",
        run.sources.length ? `Sources: ${run.sources.join(", ")}` : "",
        run.error ? `Error: ${run.error}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "No report yet.";

  const instructions = [
    `You are ${m.name}, a moonlet (small autonomous agent) working for one $ORBIO holder. They are replying to one of your reports. Answer their question about it.`,
    "Terse, concrete, plain text, no markdown, no emoji. Two to six sentences unless they ask for detail. Name sources.",
    "Use the report first. Use a tool only if the answer needs fresh data the report doesn't contain. Never invent numbers.",
    "Never speculate on price direction or give financial advice. Describe what happened.",
    "If they ask you to change your job (schedule, what to watch), say what they should do: reply 'every 6 hours' style for schedule, or edit the job at the site for scope. Do not pretend to change it.",
    m.memory ? `Your notes from the last run:\n${m.memory}` : "",
    `Your job: ${m.spec.objective}`,
    context,
  ]
    .filter(Boolean)
    .join("\n\n");

  // Fetch the image ourselves (Telegram file URLs and many hosts refuse third-party fetches) and inline it.
  let imageData: string | null = null;
  if (input.imageUrl) {
    try {
      const res = await (input.fetch ?? fetch)(input.imageUrl, { signal: AbortSignal.timeout(15_000) });
      const buf = Buffer.from(await res.arrayBuffer());
      if (res.ok && buf.length > 0 && buf.length < 6_000_000) imageData = `data:${res.headers.get("content-type")?.split(";")[0] || "image/jpeg"};base64,${buf.toString("base64")}`;
    } catch {
      imageData = null;
    }
    if (!imageData) return "I couldn't load that image. Try sending it again as a photo.";
  }
  const inputContent = imageData
    ? [{ type: "input_text" as const, text: input.text || "What do you see, and how does it relate to my report?" }, { type: "input_image" as const, imageUrl: imageData, detail: "auto" as const }]
    : input.text;

  const result = callModel(makeClient(key), {
    model: imageData ? "google/gemini-3.8-flash" : m.spec.model && m.spec.model !== "auto" ? m.spec.model : "google/gemini-3.8-flash",
    instructions,
    input: imageData ? [{ role: "user" as const, content: inputContent as never }] : (inputContent as string),
    tools,
    stopWhen: [maxCost(Math.max(0.02, m.spec.spendCapUsd)), stepCountIs(3)],
  });
  try {
    const text = (await result.getText()).trim();
    return text || "I don't have more on that than what the report says.";
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    if (/401|user not found|unauthorized|402|insufficient/i.test(msg)) return `${m.name}'s key isn't working right now (${/401|not found|unauthorized/i.test(msg) ? "rejected" : "out of credit"}). It rotates on its next run; ask again after that.`;
    throw e;
  }
}
