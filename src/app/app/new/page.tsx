"use client";

import { ArrowRight, Check, ChevronLeft } from "lucide-react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, fmtBag, fmtUsd, type Connections, type OrbioStatus } from "@/lib/api";
import { plan, HOLDER_FLOOR } from "@/moonlet/budget";
import { MODEL_CHOICES, TEMPLATE_DEFAULTS, TOOL_IDS, recommendedCapUsd, type Cadence, type JobSpec, type ModelChoice, type TemplateId, type ToolId } from "@/moonlet/spec";
import { FuelGauge } from "@/components/fuel-gauge";
import { CADENCE_LABEL, MODEL_LABEL, TEMPLATE_BLURB, TEMPLATE_EXAMPLE, TEMPLATE_LABEL, TOOL_LABEL } from "@/components/labels";
import { GitHubMark, OpenRouterMark, TelegramMark, VENDOR_MARK, XMark, DiscordMark, GmailMark } from "@/components/marks";

const ORDER: TemplateId[] = ["market-watch", "repo-mechanic", "inbox", "digest", "custom"];
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
  const linked = (k: "telegram" | "x" | "github" | "discord" | "gmail") => conns?.connections.find((c) => c.kind === k) ?? null;

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
    <div className="flex min-h-[calc(100vh-56px)] flex-col lg:min-h-screen">
      <div className="sticky top-14 z-20 border-b border-ink/10 bg-cream/90 backdrop-blur lg:top-0">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{editId ? "Edit job" : "Launch a moonlet"}</h1>
          <span className="text-[12px] text-ink-faint">Step {step + 1} of {STEPS.length}</span>
        </div>
      </div>
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 sm:px-6">
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((l, i) => {
          const state = i < step ? "done" : i === step ? "active" : "todo";
          return (
            <li key={l} className="flex items-center gap-2">
              <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-medium ${state === "done" ? "bg-moss text-white" : state === "active" ? "bg-ink text-cream" : "bg-ink/10 text-ink-soft"}`}>
                {state === "done" ? <Check size={12} strokeWidth={2.5} /> : i + 1}
              </span>
              <span className={`hidden text-[12.5px] font-medium sm:inline ${state === "todo" ? "text-ink-faint" : "text-ink"}`}>{l}</span>
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
                  <p className="mt-2 text-[11.5px] text-ink-faint"><span className="font-mono tabular-nums">~{fmtUsd(TEMPLATE_DEFAULTS[t].costPerRunUsd, 3)}</span> / run</p>
                </button>
              ))}
            </div>
            <label className="mt-5 block">
              <span className="text-[12.5px] font-medium text-ink">The job, in one sentence</span>
              <textarea value={sentence} onChange={(e) => setSentence(e.target.value)} rows={2} placeholder={TEMPLATE_EXAMPLE[template]} className="mt-1.5 w-full resize-none rounded-lg border border-ink/12 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none transition-[border-color,box-shadow] focus:border-ink/30 focus:shadow-[0_0_0_3px_rgba(233,182,76,0.22)]" />
            </label>
            <label className="mt-3 block">
              <span className="text-[12.5px] font-medium text-ink">Name <span className="font-normal text-ink-faint">(optional)</span></span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Lumen, Pebble, Tide…" className="mt-1.5 w-full rounded-lg border border-ink/12 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none transition-[border-color,box-shadow] focus:border-ink/30 focus:shadow-[0_0_0_3px_rgba(233,182,76,0.22)]" />
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
                <span className="shrink-0 rounded-full bg-moss/10 px-2 py-0.5 text-[11px] font-medium text-moss">always</span>
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
                  <span className="shrink-0 rounded-full bg-moss/10 px-2 py-0.5 text-[11px] font-medium text-moss">on</span>
                ) : (
                  <Link href="/app/connections" className="ui-btn ui-btn-sm shrink-0">Link</Link>
                )}
              </li>
              {linked("discord") && (
                <li className="flex items-center justify-between gap-3 rounded-lg border border-moss/40 bg-white p-3.5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink/10 bg-paper text-ink"><DiscordMark size={18} /></span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink">Discord <span className="ml-1 text-[11.5px] font-normal text-ink-faint">{linked("discord")!.label}</span></p>
                      <p className="text-[12.5px] leading-[1.5] text-ink-soft">Every report is posted in the channel as a card, files as attachments. Free to send.</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-moss/10 px-2 py-0.5 text-[11px] font-medium text-moss">on</span>
                </li>
              )}
              {(["x", "github", "gmail"] as const).filter((k) => linked(k)).map((k) => (
                <li key={k} className="flex items-center justify-between gap-3 rounded-lg border border-moss/40 bg-white p-3.5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink/10 bg-paper text-ink">{k === "x" ? <XMark size={16} /> : k === "gmail" ? <GmailMark size={18} /> : <GitHubMark size={18} />}</span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink">{k === "x" ? "X" : k === "gmail" ? "Gmail" : "GitHub"} <span className="ml-1 text-[11.5px] font-normal text-ink-faint">{linked(k)!.label}</span></p>
                      <p className="text-[12.5px] leading-[1.5] text-ink-soft">{k === "x" ? (autopilot ? "It may post on its own, the moment it decides to." : "It drafts its first post for your approval; once you approve, it posts on its own.") : k === "gmail" ? (autopilot ? "It may read your inbox, draft, send and tidy on its own." : "It reads and drafts freely; the first send or archive waits for your approval, then it acts on its own.") : autopilot ? "It may read repos and open pull requests or comments on its own." : "It drafts its first pull request or comment for your approval; once you approve, it acts on its own."}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${autopilot ? "bg-ink text-cream" : "bg-moss/10 text-moss"}`}>{autopilot ? "acts on its own" : "asks once"}</span>
                </li>
              ))}
            </ul>
            {(linked("x") || linked("github") || linked("gmail")) && (
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
            {template === "inbox" && !linked("gmail") && (
              <p className="mt-3 rounded-md border border-gold bg-gold/10 px-3 py-2 text-[12.5px] leading-[1.5] text-ink">This is an inbox job, but Gmail isn&apos;t connected, so it would have nothing to read. <Link href="/app/connections" className="underline">Connect Gmail</Link> first; the moonlet waits quietly until you do.</p>
            )}
            {!linked("x") && !linked("github") && !linked("gmail") && (
              <p className="mt-3 text-[12px] text-ink-faint">Want it to post on X, open pull requests or work in your Gmail? Connect those under <Link href="/app/connections" className="underline">Connections</Link>; it asks once, then acts on its own.</p>
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
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 self-center text-[13px]">
                <dt className="text-ink-soft">your bag</dt><dd className="text-ink">{status ? `${fmtBag(bag)} $ORBIO` : "reading…"}</dd>
                <dt className="text-ink-soft">earns</dt><dd className="text-ink">~{fmtUsd(p.earnPerDayUsd)} / day</dd>
                <dt className="text-ink-soft">cap per run</dt><dd className="text-ink">{fmtUsd(p.perRunCapUsd, 3)}</dd>
                <dt className="text-ink-soft">so it runs</dt><dd className="text-ink">{p.quiet ? "not yet" : `${CADENCE_LABEL[p.cadence]}${p.cadence !== spec.cadence ? ` (slowed from ${CADENCE_LABEL[spec.cadence]})` : ""}`}</dd>
                <dt className="text-ink-soft">burns</dt><dd className="text-ink">~{fmtUsd(p.burnPerDayUsd)} / day</dd>
                {status?.idleCreditsUsd !== null && status?.idleCreditsUsd !== undefined && (<><dt className="text-ink-soft">idle credit now</dt><dd className="text-ink">{fmtUsd(status.idleCreditsUsd)}</dd></>)}
              </dl>
            </div>
            {p.quiet && (
              <p className="mt-4 rounded-md border border-gold/60 bg-gold/10 px-3 py-2 text-[12.5px] leading-[1.5] text-ink">
                {p.reason}. It will launch quiet and wake up on its own when the bag clears {HOLDER_FLOOR.toLocaleString()} $ORBIO and can afford a run.
              </p>
            )}
            {status && !status.approved && (
              <p className="mt-4 rounded-md border border-red-700/30 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">Orbio isn&apos;t approved for this wallet yet. Go back to sign-in and approve, or the first run will fail.</p>
            )}
            <div className="mt-5 rounded-lg border border-ink/10 p-4">
              <p className="text-[12px] font-medium text-ink-soft">{spec.name} · {TEMPLATE_LABEL[spec.template]} · {CADENCE_LABEL[spec.cadence]}</p>
              <p className="mt-1.5 text-[14px] text-ink">“{spec.objective}”</p>
              <p className="mt-2 text-[12.5px] text-ink-soft">model: {MODEL_LABEL[spec.model ?? "auto"].name} · tools: {spec.tools.map((t) => TOOL_LABEL[t]).join(", ")}</p>
              <p className="mt-1 text-[12.5px] text-ink-soft">→ public page{linked("telegram") && ` · Telegram ${linked("telegram")!.label}`}{linked("x") && " · may draft posts on X"}{linked("github") && " · may draft pull requests"}</p>
            </div>
          </>
        )}

        {launching && (
          <>
            <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-ink">Launching {spec?.name}</h1>
            <p className="mt-1 text-[13.5px] text-ink-soft">Planning against the bag, then the first run if it can afford one. This page waits on the real response — it does not fake steps.</p>
            <p className="mt-6 text-[13px] text-ink-soft">Working…</p>
          </>
        )}

        {err && <p className="mt-4 rounded-md border border-red-700/30 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">{err}</p>}

        {!launching && (
          <div className="mt-6 flex items-center justify-between border-t border-ink/10 pt-5">
            <button onClick={() => (step === 0 ? router.push("/app") : setStep((s) => s - 1))} className="ui-btn ui-btn-ghost">
              <ChevronLeft size={14} strokeWidth={2} /> {step === 0 ? "Cancel" : "Back"}
            </button>
            {step === 0 ? (
              <button disabled={!canNext || !!busy} onClick={compile} className="ui-btn ui-btn-primary px-4">
                {busy === "compile" ? "Planning…" : <>Plan it <ArrowRight size={14} strokeWidth={2} /></>}
              </button>
            ) : step < 3 ? (
              <button disabled={!canNext} onClick={() => setStep((s) => s + 1)} className="ui-btn ui-btn-primary px-4">
                Continue <ArrowRight size={14} strokeWidth={2} />
              </button>
            ) : (
              <button disabled={!!busy || !status} onClick={launch} className="ui-btn ui-btn-gold px-5">
                {editId ? "Save changes" : "Launch"}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
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
  const field = "mt-1.5 w-full rounded-lg border border-ink/12 bg-white px-3 py-2 text-[13.5px] text-ink outline-none transition-[border-color,box-shadow] focus:border-ink/30 focus:shadow-[0_0_0_3px_rgba(233,182,76,0.22)]";
  const label = "text-[12.5px] font-medium text-ink";
  return (
    <>
      <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-ink">Here&apos;s the plan. Change anything.</h1>
      <p className="mt-1 text-[13.5px] text-ink-soft">
        {compiled === false ? "Drafted without a model (compile key missing); worth a closer read." : "Drafted from your sentence. This is exactly what the moonlet will follow."}
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block"><span className={label}>Name</span><input value={spec.name} maxLength={24} onChange={(e) => set("name", e.target.value)} className={field} /></label>
        <label className="block"><span className={label}>Cadence (asked)</span>
          <select value={spec.cadence} onChange={(e) => set("cadence", e.target.value as Cadence)} className={`${field} ui-select`}>
            {CADENCES.map((c) => <option key={c} value={c}>{CADENCE_LABEL[c]}</option>)}
          </select>
        </label>
        {spec.tripwire && (
          <div className="rounded-md border border-gold bg-gold/10 px-3 py-2.5 sm:col-span-2">
            <p className="text-[13px] font-semibold text-ink">{spec.tripwire.metric === "repo_activity" ? `Tripwire: new activity on ${spec.tripwire.target}` : `Tripwire: ${spec.tripwire.metric.replace("_", " ")} of ${spec.tripwire.target}, ±${spec.tripwire.thresholdPct}%`}</p>
            <p className="mt-0.5 text-[12.5px] leading-[1.5] text-ink-soft">{spec.tripwire.metric === "repo_activity" ? "Checked for free every 15 minutes. The moonlet wakes and spends credits only when there is a new push, issue or pull request; quiet days cost nothing." : "Checked for free every 15 minutes. The moonlet wakes and spends credits only when it moves that much; the cadence below is just a heartbeat."}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {spec.tripwire.metric !== "repo_activity" && <label className="text-[12px] text-ink-soft">threshold % <input type="number" min={1} max={90} value={spec.tripwire.thresholdPct} onChange={(e) => set("tripwire", { ...spec.tripwire!, thresholdPct: Math.min(90, Math.max(1, Number(e.target.value) || 10)) })} className="ml-1 w-16 rounded border border-ink/15 bg-paper px-2 py-1 text-ink" /></label>}
              <button type="button" onClick={() => set("tripwire", null)} className="text-[12px] text-ink-faint underline hover:text-ink">remove tripwire</button>
            </div>
          </div>
        )}
        <label className="block sm:col-span-2"><span className={label}>Objective</span><textarea value={spec.objective} rows={2} maxLength={400} onChange={(e) => set("objective", e.target.value)} className={`${field} resize-none`} /></label>
        <label className="block sm:col-span-2"><span className={label}>Checks every run (one per line)</span>
          <textarea value={(spec.checks ?? []).join("\n")} rows={Math.max(2, Math.min(6, (spec.checks ?? []).length + 1))} onChange={(e) => set("checks", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6))} placeholder={"$ORBIO price, liquidity and volume vs last run\nTransfers in/out of wallet 0x… since last run\nNew pools on Robinhood Chain"} className={`${field} resize-none`} />
          <span className="mt-1 block text-[12px] text-ink-faint">It works through these in order each cycle, remembers what it saw, and reports one section per check.</span>
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
                <button key={t} type="button" onClick={() => toggleTool(t)} disabled={t === "deliver"} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${on ? "border-ink bg-ink text-cream" : "border-ink/15 bg-white text-ink-soft hover:border-ink/40 hover:text-ink"} disabled:opacity-70`}>
                  {on && <Check size={11} strokeWidth={2.5} />}{TOOL_LABEL[t]}
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
                <button key={id} type="button" onClick={() => onChange({ ...spec, model: id as ModelChoice, spendCapUsd: Math.max(spec.spendCapUsd, recommendedCapUsd(spec.template, id as ModelChoice)) })} className={`flex min-w-0 items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${on ? "border-ink bg-paper" : "border-ink/10 hover:border-ink/30"}`}>
                  <Mark size={18} className={on ? "text-ink" : "text-ink-soft"} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-ink">{m.name}</span>
                    <span className="block text-[11.5px] leading-[1.45] text-ink-soft">{m.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <label className="block"><span className={label}>Output</span>
          <select value={spec.output.kind} onChange={(e) => set("output", { ...spec.output, kind: e.target.value as JobSpec["output"]["kind"] })} className={`${field} ui-select`}>
            {["brief", "alert", "digest", "pr", "note"].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="block"><span className={label}>Max words</span><input type="number" min={20} max={600} value={spec.output.maxWords} onChange={(e) => set("output", { ...spec.output, maxWords: Number(e.target.value) || 100 })} className={field} /></label>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-ink/12 bg-white px-3.5 py-2.5 sm:col-span-2">
          <input type="checkbox" checked={!spec.output.alwaysReport} onChange={(e) => set("output", { ...spec.output, alwaysReport: !e.target.checked })} className="h-4 w-4 accent-ink" />
          <span className="text-[13px] text-ink">Stay silent when nothing happened <span className="text-[11.5px] text-ink-soft">(alerts)</span></span>
        </label>
        <label className="block"><span className={label}>Voice</span><input value={spec.voice} maxLength={160} onChange={(e) => set("voice", e.target.value)} className={field} /></label>
        <label className="block"><span className={label}>Spend cap per run (USD)</span><input type="number" step={0.001} min={0.001} max={5} value={spec.spendCapUsd} onChange={(e) => set("spendCapUsd", Math.min(5, Math.max(0.001, Number(e.target.value) || 0.01)))} className={field} />
          {spec.spendCapUsd < recommendedCapUsd(spec.template, spec.model ?? "auto") ? (
            <span className="mt-1 block text-[12px] text-red-800">
              {MODEL_LABEL[spec.model ?? "auto"].name} on a {TEMPLATE_LABEL[spec.template].toLowerCase()} job usually needs ~{fmtUsd(recommendedCapUsd(spec.template, spec.model ?? "auto"), 3)} to finish; at {fmtUsd(spec.spendCapUsd, 3)} it will stop early and report what it managed.{" "}
              <button type="button" onClick={() => set("spendCapUsd", recommendedCapUsd(spec.template, spec.model ?? "auto"))} className="underline">Set to {fmtUsd(recommendedCapUsd(spec.template, spec.model ?? "auto"), 3)}</button>
            </span>
          ) : (
            <span className="mt-1 block text-[12px] text-ink-faint">Hard ceiling per run. If it is reached mid-job the moonlet stops, reports what it did, and says what it skipped.</span>
          )}
        </label>
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
