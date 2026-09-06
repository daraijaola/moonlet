import { z } from "zod";
import * as store from "./store";
import { pickModel } from "./model";
import { runLoop, type LocalTool } from "./llm";
import { Cadence, CADENCE_MS } from "./spec";
import { CADENCE_WORDS, cadenceReply } from "./budget";
import { runOne } from "./scheduler";

/**
 * The owner talks to their moonlets in Telegram. Free text from a linked chat
 * comes here: a small model call with tools that can read moonlets and runs,
 * run one now, pause/resume, and change the cadence. Billed to the owner's own
 * Orbio key (any of their moonlets holds one), so a holder with no key yet
 * gets a plain pointer instead.
 */

const CHARACTER = `You are the owner's moonlet concierge in Telegram: the voice of their small agents.
Terse, warm, concrete. One to four short sentences, no markdown, no emoji, no bullet lists unless listing moonlets.
You can: list their moonlets and what each does, report the latest result, run a moonlet now, pause or resume one, change how often it runs.
If they ask for something you cannot do (new moonlet, connections, spending), say so in one line and point to the site.
Never speculate on price or give financial advice. Never ask for keys or wallet access.
When you run something now, say it started and that the result will arrive here in about a minute.
Use tool results; do not invent moonlets, runs or numbers.`;


export async function concierge(owner: string, text: string, opts: { appUrl: string; fetch?: typeof fetch; runNow?: (id: string) => Promise<unknown> } ): Promise<string> {
  const moonlets = await store.listMoonlets(owner);
  const key = moonlets.find((m) => m.key?.key)?.key?.key ?? process.env.COMPILE_API_KEY;
  if (!moonlets.length) return `You have no moonlets yet. Launch one at ${opts.appUrl}/app/new and I'll report here.`;
  if (!key) return `Your moonlets haven't claimed a key yet, so I can't think on your behalf until the first run. Ask again after that, or manage them at ${opts.appUrl}/app.`;

  const byName = (q: string) => {
    const s = q.trim().toLowerCase();
    return moonlets.find((m) => m.id === s || m.name.toLowerCase() === s) ?? moonlets.find((m) => m.name.toLowerCase().includes(s)) ?? (moonlets.length === 1 ? moonlets[0] : undefined);
  };
  const describe = (m: (typeof moonlets)[number]) => ({
    id: m.id,
    name: m.name,
    job: m.spec.objective,
    cadence: CADENCE_WORDS[m.spec.cadence],
    status: m.status,
    nextRunInMinutes: m.status === "paused" ? null : Math.max(0, Math.round((m.nextRunAt - Date.now()) / 60_000)),
    runs: m.runsTotal,
    failed: m.runsFailed,
    spentUsd: Number(m.spentTotalUsd.toFixed(4)),
    fuelUsd: m.key ? Number((m.key.limitUsd - m.key.spentUsd).toFixed(2)) : null,
    page: `${opts.appUrl}/s/${m.id}`,
  });

  const tool = <S extends z.ZodType>(t: { name: string; description: string; inputSchema: S; execute: (a: z.infer<S>) => Promise<unknown> }): LocalTool => ({ name: t.name, description: t.description, schema: t.inputSchema, execute: t.execute as never });
  const tools = [
    tool({
      name: "list_moonlets",
      description: "The owner's moonlets: job, cadence, status, next run, spend, fuel.",
      inputSchema: z.object({}),
      execute: async () => ({ moonlets: moonlets.map(describe) }),
    }),
    tool({
      name: "latest_runs",
      description: "Most recent results of one moonlet (title, summary, cost, when).",
      inputSchema: z.object({ moonlet: z.string().describe("name or id"), limit: z.number().int().min(1).max(5).optional() }),
      execute: async ({ moonlet, limit }) => {
        const m = byName(moonlet);
        if (!m) return { error: "no such moonlet" };
        const runs = await store.listRuns(m.id, limit ?? 3);
        return { moonlet: m.name, runs: runs.map((r) => ({ when: new Date(r.at).toISOString(), status: r.status, title: r.title, summary: r.summary, body: r.body.slice(0, 1200), costUsd: r.costUsd, sources: r.sources.slice(0, 5), anchored: !!r.txHash, error: r.error })) };
      },
    }),
    tool({
      name: "run_now",
      description: "Start a moonlet's job immediately. The result is delivered to this chat when it finishes.",
      inputSchema: z.object({ moonlet: z.string() }),
      execute: async ({ moonlet }) => {
        const m = byName(moonlet);
        if (!m) return { error: "no such moonlet" };
        if (m.status === "running") return { started: false, note: "already running" };
        await store.updateMoonlet(m.id, { status: "idle", nextRunAt: Date.now() });
        if (!(await store.claimForRun(m.id))) return { started: false, note: "could not start right now" };
        void (opts.runNow ?? ((id: string) => runOne(id, { fetch: opts.fetch })))(m.id);
        return { started: true, moonlet: m.name };
      },
    }),
    tool({
      name: "set_cadence",
      description: "Change how often a moonlet runs.",
      inputSchema: z.object({ moonlet: z.string(), cadence: Cadence }),
      execute: async ({ moonlet, cadence }) => {
        const m = byName(moonlet);
        if (!m) return { error: "no such moonlet" };
        await store.updateMoonlet(m.id, { spec: { ...m.spec, cadence }, cadence, nextRunAt: Math.min(m.nextRunAt, Date.now() + CADENCE_MS[cadence]) });
        return { ok: true, tellOwner: cadenceReply(m.name, m.spec, cadence, m.earnPerDayUsd) };
      },
    }),
    tool({
      name: "pause_or_resume",
      description: "Pause a moonlet (keeps its fuel) or resume it.",
      inputSchema: z.object({ moonlet: z.string(), action: z.enum(["pause", "resume"]) }),
      execute: async ({ moonlet, action }) => {
        const m = byName(moonlet);
        if (!m) return { error: "no such moonlet" };
        await store.updateMoonlet(m.id, action === "pause" ? { status: "paused" } : { status: "idle", nextRunAt: Date.now() + 60_000 });
        return { ok: true, moonlet: m.name, status: action === "pause" ? "paused" : "resumed, next run in a minute" };
      },
    }),
  ];

  try {
    const r = await runLoop({
      key,
      model: pickModel(0, "compile"),
      instructions: `${CHARACTER}\n\nIt is ${new Date().toISOString()}. The owner has ${moonlets.length} moonlet${moonlets.length === 1 ? "" : "s"}: ${moonlets.map((m) => `${m.name} (${CADENCE_WORDS[m.spec.cadence]}, ${m.status})`).join(", ")}. Site: ${opts.appUrl}`,
      input: text,
      tools,
      maxCostUsd: 0.02,
      maxSteps: 4,
      fetch: opts.fetch,
    });
    const reply = r.text.trim();
    return reply || "Done.";
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    if (/401|user not found|unauthorized|402|insufficient/i.test(msg)) return `Your moonlets' key isn't working right now; it rotates on the next run. Meanwhile: ${opts.appUrl}/app`;
    throw e;
  }
}
