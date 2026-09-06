"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, fmtBag, fmtUsd, type Connections, type OrbioStatus } from "@/lib/api";
import { plan, HOLDER_FLOOR } from "@/moonlet/budget";
import { MODEL_CHOICES, TEMPLATE_DEFAULTS, TOOL_IDS, type Cadence, type JobSpec, type ModelChoice, type TemplateId, type ToolId } from "@/moonlet/spec";
import { FuelGauge } from "@/components/fuel-gauge";
import { CADENCE_LABEL, MODEL_LABEL, TEMPLATE_BLURB, TEMPLATE_EXAMPLE, TEMPLATE_LABEL, TOOL_LABEL } from "@/components/labels";
import { GitHubMark, OpenRouterMark, TelegramMark, VENDOR_MARK, XMark, DiscordMark, GmailMark } from "@/components/marks";

const ORDER: TemplateId[] = ["market-watch", "repo-mechanic", "digest", "custom"];
const CADENCES: Cadence[] = ["15m", "1h", "4h", "6h", "12h", "24h", "7d"];
const STEPS = ["The job", "Review", "Delivery", "Confirm"] as const;

function NewInner() {
  const { address } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("edit");

  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState<TemplateId>("market-watch");
  const [sentence, setSentence] = useState(() => params.get("job") ?? "");
  const [name, setName] = useState("");
  const [spec, setSpec] = useState<JobSpec | null>(null);
  const [compiled, setCompiled] = useState<boolean | null>(null);
  const [autopilot, setAutopilot] = useState(false);
  const [status, setStatus] = useState<OrbioStatus | null>(null);
  const [conns, setConns] = useState<Connections | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (!address) return;
    api.orbioStatus(address).then(setStatus).catch(() => setStatus(null));
    api.connections(address).then(setConns).catch(() => setConns(null));
  }, [address]);

  useEffect(() => {
    if (!editId) return;
    api.getMoonlet(editId).then(({ moonlet }) => {
      setSpec(moonlet.spec);
      setTemplate(moonlet.spec.template);
      setSentence(moonlet.spec.objective);
      setName(moonlet.name);
      setAutopilot(!!moonlet.autopilot);
      setCompiled(true);
      setStep(1);
    }).catch(() => setErr("Couldn't load that moonlet."));
  }, [editId]);

  const bag = status?.bag ?? 0;
  const p = useMemo(() => (spec ? plan(spec, bag) : null), [spec, bag]);
  const linked = (k: "telegram" | "x" | "github" | "discord" | "email") => conns?.connections.find((c) => c.kind === k) ?? null;

  const compile = async () => {
    if (!address) return;
    setBusy("compile");
    setErr(null);
    try {
      const r = await api.compile(address, { sentence: sentence.trim(), template, name: name.trim() || undefined });
      setSpec(r.spec);
      setCompiled(r.compiled);
      setStep(1);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(null);
  };

  const launch = async () => {
    if (!address || !spec) return;
    setBusy("launch");
    setErr(null);
    setLaunching(true);
    try {
      const delivery = { telegram: linked("telegram") ? "connected" : undefined, x: linked("x") ? "connected" : undefined };
      if (editId) {
        await api.patch(address, editId, { action: "edit", spec, delivery, autopilot });
        router.push(`/app?m=${editId}`);
        return;
      }
      const r = await api.launch(address, { spec, delivery, autopilot, runNow: true });
      router.push(`/app?m=${r.moonlet.id}&launched=1`);
    } catch (e) {
      setErr((e as Error).message);
      setLaunching(false);
      setBusy(null);
    }
  };

  const canNext = step === 0 ? sentence.trim().length > 8 : step === 1 ? !!spec && spec.objective.length > 8 : true;

  return (
    <div className="mx-auto max-w-[760px]">
      <nav className="flex items-center gap-2 font-mono text-[12px] text-ink-soft">
        <Link href="/app" className="hover:text-ink">Moonlets</Link>
        <span>/</span>
        <span className="text-ink">{editId ? "Edit" : "Launch"}</span>
      </nav>

      <ol className="mt-6 grid grid-cols-4 gap-2">
        {STEPS.map((l, i) => {
          const state = i < step ? "done" : i === step ? "active" : "todo";
          return (
            <li key={l} className="flex items-center gap-2">
              <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11.5px] ${state === "done" ? "bg-moss text-white" : state === "active" ? "bg-ink text-cream" : "bg-ink/10 text-ink-soft"}`}>
                {state === "done" ? "✓" : i + 1}
              </span>
              <span className={`hidden font-mono text-[12.5px] sm:inline ${state === "todo" ? "text-ink-faint" : "text-ink"}`}>{l}</span>
              <span className={`ml-1 h-px flex-1 ${state === "done" ? "bg-moss" : "bg-ink/10"}`} />
            </li>
          );
        })}
      </ol>

      <section className="mt-6 rounded-lg border border-ink/10 bg-white p-6">
        {step === 0 && (
          <>
            <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-ink">What should it do?</h1>
            <p className="mt-1 text-[13.5px] text-ink-soft">Pick a shape, then say it in one sentence. You&apos;ll review the plan before anything runs.</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {ORDER.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTemplate(t);
                    if (!sentence || Object.values(TEMPLATE_EXAMPLE).includes(sentence)) setSentence(TEMPLATE_EXAMPLE[t]);
                  }}
                  className={`rounded-lg border p-3.5 text-left transition-colors ${template === t ? "border-ink bg-paper" : "border-ink/10 hover:border-ink/30"}`}
                >
                  <p className="text-[14px] font-semibold text-ink">{TEMPLATE_LABEL[t]}</p>
                  <p className="mt-0.5 text-[12.5px] leading-[1.5] text-ink-soft">{TEMPLATE_BLURB[t]}</p>
                  <p className="mt-2 font-mono text-[11px] text-ink-faint">~{fmtUsd(TEMPLATE_DEFAULTS[t].costPerRunUsd, 3)} / run</p>
                </button>
              ))}
            </div>
            <label className="mt-5 block">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">The job, one sentence</span>
              <textarea value={sentence} onChange={(e) => setSentence(e.target.value)} rows={2} placeholder={TEMPLATE_EXAMPLE[template]} className="mt-1.5 w-full resize-none rounded-md border border-ink/20 bg-paper px-3 py-2.5 font-mono text-[14px] text-ink outline-none focus:border-ink" />
            </label>
            <label className="mt-3 block">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">Name (optional)</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Lumen, Pebble, Tide…" className="mt-1.5 w-full rounded-md border border-ink/20 bg-paper px-3 py-2 font-mono text-[14px] text-ink outline-none focus:border-ink" />
            </label>
          </>
        )}

        {step === 1 && spec && (
          <SpecEditor spec={spec} onChange={setSpec} compiled={compiled} />
        )}

        {step === 2 && (
          <>
            <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-ink">Where results go</h1>
            <p className="mt-1 text-[13.5px] text-ink-soft">Every run lands on the public page. Anything else follows what you’ve connected.</p>
            <ul className="mt-5 space-y-2.5">
              <li className="flex items-center justify-between gap-3 rounded-lg border border-ink/10 bg-paper p-3.5">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-ink">Public page</p>
                  <p className="text-[12.5px] text-ink-soft">Anyone can watch it work. Every run is hashed and anchored on Robinhood Chain.</p>
                </div>
                <span className="shrink-0 rounded-full bg-moss/10 px-2 py-0.5 font-mono text-[11px] text-moss">always</span>
              </li>
              <li className={`flex items-center justify-between gap-3 rounded-lg border p-3.5 ${linked("telegram") ? "border-moss/40 bg-white" : "border-ink/10"}`}>
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink/10 bg-paper text-ink"><TelegramMark size={18} /></span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-ink">Telegram</p>
                    <p className="text-[12.5px] leading-[1.5] text-ink-soft">
                      {linked("telegram") ? `Briefs and alerts go to ${linked("telegram")!.label}. Anything that needs your OK arrives with Approve / Reject buttons.` : "Link it and results reach your phone; approvals become two taps."}
                    </p>
                  </div>
                </div>
                {linked("telegram") ? (
                  <span className="shrink-0 rounded-full bg-moss/10 px-2 py-0.5 font-mono text-[11px] text-moss">on</span>
                ) : (
                  <Link href="/app/connections" className="shrink-0 rounded-md border border-ink/15 bg-white px-2.5 py-1.5 font-mono text-[12px] text-ink hover:border-ink/40">Link</Link>
                )}
              </li>
              {linked("discord") && (
                <li className="flex items-center justify-between gap-3 rounded-lg border border-moss/40 bg-white p-3.5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink/10 bg-paper text-ink"><DiscordMark size={18} /></span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink">Discord <span className="ml-1 font-mono text-[11px] font-normal text-ink-faint">{linked("discord")!.label}</span></p>
                      <p className="text-[12.5px] leading-[1.5] text-ink-soft">Every report is posted in the channel as a card, files as attachments. Free to send.</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-moss/10 px-2 py-0.5 font-mono text-[11px] text-moss">on</span>
                </li>
              )}
              {linked("email") && (
                <li className="flex items-center justify-between gap-3 rounded-lg border border-moss/40 bg-white p-3.5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink/10 bg-paper text-ink"><GmailMark size={18} /></span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink">Email <span className="ml-1 font-mono text-[11px] font-normal text-ink-faint">{linked("email")!.label}</span></p>
                      <p className="text-[12.5px] leading-[1.5] text-ink-soft">Every report arrives as a readable email, files attached. Free to send.</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-moss/10 px-2 py-0.5 font-mono text-[11px] text-moss">on</span>
                </li>
              )}
              {(["x", "github"] as const).filter((k) => linked(k)).map((k) => (
                <li key={k} className="flex items-center justify-between gap-3 rounded-lg border border-moss/40 bg-white p-3.5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink/10 bg-paper text-ink">{k === "x" ? <XMark size={16} /> : <GitHubMark size={18} />}</span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink">{k === "x" ? "X" : "GitHub"} <span className="ml-1 font-mono text-[11px] font-normal text-ink-faint">{linked(k)!.label}</span></p>
                      <p className="text-[12.5px] leading-[1.5] text-ink-soft">{k === "x" ? (autopilot ? "It may post on its own, the moment it decides to." : "It drafts its first post for your approval; once you approve, it posts on its own.") : autopilot ? "It may read repos and open pull requests or comments on its own." : "It drafts its first pull request or comment for your approval; once you approve, it acts on its own."}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] ${autopilot ? "bg-ink text-cream" : "bg-moss/10 text-moss"}`}>{autopilot ? "acts on its own" : "asks once"}</span>
                </li>
              ))}
            </ul>
            {(linked("x") || linked("github")) && (
              <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-ink/10 bg-paper p-3.5">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-ink">{autopilot ? "Autopilot: on" : "Autopilot: off"}</p>
                  <p className="mt-0.5 text-[12.5px] leading-[1.5] text-ink-soft">
                    {autopilot
                      ? "Posts, pull requests and comments go out the moment the moonlet decides, in your name. Reading never needs approval either way."
                      : "Its first action that speaks for you is drafted and sent to Telegram with Approve / Reject. One approval and it's on autopilot from then on. You can switch this any time on the moonlet page."}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autopilot}
                  onClick={() => setAutopilot((v) => !v)}
                  className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border-2 border-ink transition-colors ${autopilot ? "bg-ink" : "bg-white"}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${autopilot ? "left-[22px] bg-cream" : "left-0.5 bg-ink"}`} />
                </button>
              </div>
            )}
            {!linked("x") && !linked("github") && (
              <p className="mt-3 font-mono text-[11.5px] text-ink-faint">Want it to post on X or open pull requests? Connect those under <Link href="/app/connections" className="underline">Connections</Link>; it asks once, then acts on its own.</p>
            )}
          </>
        )}

        {step === 3 && spec && p && !launching && (
          <>
            <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-ink">The honest math</h1>
            <p className="mt-1 text-[13.5px] text-ink-soft">This is what your bag can afford. Buy more and it runs more. Sell and it goes quiet.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr]">
              <div className="rounded-lg border border-ink/10 bg-paper p-4">
                <FuelGauge earnPerDay={p.earnPerDayUsd} burnPerDay={p.burnPerDayUsd} quiet={p.quiet} size="md" />
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 self-center font-mono text-[13px]">
                <dt className="text-ink-soft">your bag</dt><dd className="text-ink">{status ? `${fmtBag(bag)} $ORBIO` : "reading…"}</dd>
                <dt className="text-ink-soft">earns</dt><dd className="text-ink">~{fmtUsd(p.earnPerDayUsd)} / day</dd>
                <dt className="text-ink-soft">cap per run</dt><dd className="text-ink">{fmtUsd(p.perRunCapUsd, 3)}</dd>
                <dt className="text-ink-soft">so it runs</dt><dd className="text-ink">{p.quiet ? "not yet" : `${CADENCE_LABEL[p.cadence]}${p.cadence !== spec.cadence ? ` (slowed from ${CADENCE_LABEL[spec.cadence]})` : ""}`}</dd>
                <dt className="text-ink-soft">burns</dt><dd className="text-ink">~{fmtUsd(p.burnPerDayUsd)} / day</dd>
                {status?.idleCreditsUsd !== null && status?.idleCreditsUsd !== undefined && (<><dt className="text-ink-soft">idle credit now</dt><dd className="text-ink">{fmtUsd(status.idleCreditsUsd)}</dd></>)}
              </dl>
            </div>
            {p.quiet && (
              <p className="mt-4 rounded-md border border-gold/60 bg-gold/10 px-3 py-2 font-mono text-[12px] text-ink">
                {p.reason}. It will launch quiet and wake up on its own when the bag clears {HOLDER_FLOOR.toLocaleString()} $ORBIO and can afford a run.
              </p>
            )}
            {status && !status.approved && (
              <p className="mt-4 rounded-md border border-red-700/30 bg-red-50 px-3 py-2 font-mono text-[12px] text-red-800">Orbio isn&apos;t approved for this wallet yet. Go back to sign-in and approve, or the first run will fail.</p>
            )}
            <div className="mt-5 rounded-lg border border-ink/10 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">{spec.name} · {TEMPLATE_LABEL[spec.template]} · {CADENCE_LABEL[spec.cadence]}</p>
              <p className="mt-1.5 text-[14px] text-ink">“{spec.objective}”</p>
              <p className="mt-2 font-mono text-[12px] text-ink-soft">model: {MODEL_LABEL[spec.model ?? "auto"].name} · tools: {spec.tools.map((t) => TOOL_LABEL[t]).join(", ")}</p>
              <p className="mt-1 font-mono text-[12px] text-ink-soft">→ public page{linked("telegram") && ` · Telegram ${linked("telegram")!.label}`}{linked("x") && " · may draft posts on X"}{linked("github") && " · may draft pull requests"}</p>
            </div>
          </>
        )}

        {launching && (
          <>
            <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-ink">Launching {spec?.name}</h1>
            <p className="mt-1 text-[13.5px] text-ink-soft">Planning against the bag, then the first run if it can afford one. This page waits on the real response — it does not fake steps.</p>
            <p className="mt-6 font-mono text-[13px] text-ink-soft">Working…</p>
          </>
        )}

        {err && <p className="mt-4 rounded-md border border-red-700/30 bg-red-50 px-3 py-2 font-mono text-[12px] text-red-800">{err}</p>}

        {!launching && (
          <div className="mt-6 flex items-center justify-between border-t border-ink/10 pt-5">
            <button onClick={() => (step === 0 ? router.push("/app") : setStep((s) => s - 1))} className="font-mono text-[13px] text-ink-soft hover:text-ink">
              ← {step === 0 ? "Cancel" : "Back"}
            </button>
            {step === 0 ? (
              <button disabled={!canNext || !!busy} onClick={compile} className="btn-hard rounded-md border-2 border-ink bg-white px-4 py-2 font-mono text-[13.5px] font-medium text-ink disabled:opacity-40">
                {busy === "compile" ? "Planning…" : "Plan it →"}
              </button>
            ) : step < 3 ? (
              <button disabled={!canNext} onClick={() => setStep((s) => s + 1)} className="btn-hard rounded-md border-2 border-ink bg-white px-4 py-2 font-mono text-[13.5px] font-medium text-ink disabled:opacity-40">
                Continue →
              </button>
            ) : (
              <button disabled={!!busy || !status} onClick={launch} className="btn-hard rounded-md border-2 border-ink bg-gold px-5 py-2 font-mono text-[13.5px] font-medium text-midnight disabled:opacity-40">
                {editId ? "Save changes" : "Launch"}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function SpecEditor({ spec, onChange, compiled }: { spec: JobSpec; onChange: (s: JobSpec) => void; compiled: boolean | null }) {
  const set = <K extends keyof JobSpec>(k: K, v: JobSpec[K]) => onChange({ ...spec, [k]: v });
  const toggleTool = (t: ToolId) => {
    if (t === "deliver") return;
    const has = spec.tools.includes(t);
    const tools = has ? spec.tools.filter((x) => x !== t) : [...spec.tools, t];
    if (tools.length) set("tools", tools);
  };
  const field = "mt-1.5 w-full rounded-md border border-ink/20 bg-paper px-3 py-2 font-mono text-[13.5px] text-ink outline-none focus:border-ink";
  const label = "font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft";
  return (
    <>
      <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-ink">Here&apos;s the plan. Change anything.</h1>
      <p className="mt-1 text-[13.5px] text-ink-soft">
        {compiled === false ? "Drafted without a model (compile key missing); worth a closer read." : "Drafted from your sentence. This is exactly what the moonlet will follow."}
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block"><span className={label}>Name</span><input value={spec.name} maxLength={24} onChange={(e) => set("name", e.target.value)} className={field} /></label>
        <label className="block"><span className={label}>Cadence (asked)</span>
          <select value={spec.cadence} onChange={(e) => set("cadence", e.target.value as Cadence)} className={field}>
            {CADENCES.map((c) => <option key={c} value={c}>{CADENCE_LABEL[c]}</option>)}
          </select>
        </label>
        <label className="block sm:col-span-2"><span className={label}>Objective</span><textarea value={spec.objective} rows={2} maxLength={400} onChange={(e) => set("objective", e.target.value)} className={`${field} resize-none`} /></label>
        <label className="block sm:col-span-2"><span className={label}>Checks every run (one per line)</span>
          <textarea value={(spec.checks ?? []).join("\n")} rows={Math.max(2, Math.min(6, (spec.checks ?? []).length + 1))} onChange={(e) => set("checks", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6))} placeholder={"$ORBIO price, liquidity and volume vs last run\nTransfers in/out of wallet 0x… since last run\nNew pools on Robinhood Chain"} className={`${field} resize-none`} />
          <span className="mt-1 block font-mono text-[11px] text-ink-faint">It works through these in order each cycle, remembers what it saw, and reports one section per check.</span>
        </label>
        <label className="block sm:col-span-2"><span className={label}>Sources (one per line)</span>
          <textarea value={spec.sources.join("\n")} rows={3} onChange={(e) => set("sources", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 8))} placeholder="$ORBIO&#10;0x…&#10;https://…" className={`${field} resize-none`} />
        </label>
        <div className="sm:col-span-2">
          <span className={label}>Tools</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {TOOL_IDS.filter((t) => t !== "spawn_moonlet" && t !== "write_document").map((t) => {
              const on = spec.tools.includes(t);
              return (
                <button key={t} type="button" onClick={() => toggleTool(t)} disabled={t === "deliver"} className={`rounded-md border px-2.5 py-1 font-mono text-[12px] transition-colors ${on ? "border-ink bg-ink text-cream" : "border-ink/15 text-ink-soft hover:border-ink/40"} disabled:opacity-70`}>
                  {TOOL_LABEL[t]}
                </button>
              );
            })}
          </div>
        </div>
        <div className="sm:col-span-2">
          <span className={`${label} inline-flex items-center gap-1.5`}>Model <OpenRouterMark size={12} className="text-ink-faint" /> <span className="normal-case tracking-normal text-ink-faint">via OpenRouter, billed to the moonlet&apos;s key</span></span>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            {MODEL_CHOICES.map((id) => {
              const m = MODEL_LABEL[id];
              const Mark = VENDOR_MARK[m.vendor];
              const on = (spec.model ?? "auto") === id;
              return (
                <button key={id} type="button" onClick={() => set("model", id as ModelChoice)} className={`flex min-w-0 items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${on ? "border-ink bg-paper" : "border-ink/10 hover:border-ink/30"}`}>
                  <Mark size={18} className={on ? "text-ink" : "text-ink-soft"} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-ink">{m.name}</span>
                    <span className="block font-mono text-[11px] leading-[1.45] text-ink-soft">{m.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <label className="block"><span className={label}>Output</span>
          <select value={spec.output.kind} onChange={(e) => set("output", { ...spec.output, kind: e.target.value as JobSpec["output"]["kind"] })} className={field}>
            {["brief", "alert", "digest", "pr", "note"].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="block"><span className={label}>Max words</span><input type="number" min={20} max={600} value={spec.output.maxWords} onChange={(e) => set("output", { ...spec.output, maxWords: Number(e.target.value) || 100 })} className={field} /></label>
        <label className="flex items-center gap-3 rounded-md border border-ink/10 bg-paper px-3 py-2.5 sm:col-span-2">
          <input type="checkbox" checked={!spec.output.alwaysReport} onChange={(e) => set("output", { ...spec.output, alwaysReport: !e.target.checked })} className="h-4 w-4 accent-ink" />
          <span className="text-[13px] text-ink">Stay silent when nothing happened <span className="font-mono text-[11px] text-ink-soft">(alerts)</span></span>
        </label>
        <label className="block"><span className={label}>Voice</span><input value={spec.voice} maxLength={160} onChange={(e) => set("voice", e.target.value)} className={field} /></label>
        <label className="block"><span className={label}>Spend cap per run (USD)</span><input type="number" step={0.001} min={0.001} max={5} value={spec.spendCapUsd} onChange={(e) => set("spendCapUsd", Math.max(0.001, Number(e.target.value) || 0.01))} className={field} /></label>
      </div>
    </>
  );
}

export default function NewMoonletPage() {
  return (
    <Suspense>
      <NewInner />
    </Suspense>
  );
}
