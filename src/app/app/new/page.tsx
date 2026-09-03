"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  TEMPLATES,
  estimateEarnPerDay,
  fmtBag,
  fmtUsd,
  getMoonlets,
  type Template,
} from "@/lib/mock";
import { FuelGauge } from "@/components/fuel-gauge";

const ORDER: Template[] = ["market-watch", "repo-mechanic", "digest", "custom"];

const LAUNCH_STEPS = [
  { key: "balance", label: "Reading your Orbio balance", tool: "orbio_get_balance" },
  { key: "claim", label: "Claiming a funded OpenRouter key", tool: "orbio_claim_key" },
  { key: "status", label: "Verifying key spend limit", tool: "orbio_get_key_status" },
  { key: "budget", label: "Setting pace to your income", tool: "moonlet.budget" },
  { key: "schedule", label: "Scheduling the first run", tool: "moonlet.schedule" },
  { key: "anchor", label: "Anchoring launch on Robinhood Chain", tool: "eth_sendTransaction" },
] as const;

function NewInner() {
  const { address } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const bag = useMemo(() => getMoonlets(address ?? undefined)[0]?.bag ?? 1_250_000, [address]);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [template, setTemplate] = useState<Template>("custom");
  const [job, setJob] = useState(() => params.get("job") ?? "");
  const [name, setName] = useState("");
  const [telegram, setTelegram] = useState("");
  const [x, setX] = useState("");
  const [launching, setLaunching] = useState(false);
  const [done, setDone] = useState<number>(-1);

  const earn = estimateEarnPerDay(bag);
  const cost = TEMPLATES[template].costPerRun;
  const affordable = Math.floor(earn / cost);
  const runsPerDay = Math.min(24, affordable);
  const burn = runsPerDay * cost;
  const cadence =
    runsPerDay >= 24 ? "hourly" : runsPerDay >= 4 ? `every ${Math.floor(24 / runsPerDay)}h` : runsPerDay >= 1 ? `${runsPerDay}× daily` : "weekly";

  const canNext = step === 1 ? job.trim().length > 8 : true;

  const launch = async () => {
    setLaunching(true);
    for (let i = 0; i < LAUNCH_STEPS.length; i++) {
      await new Promise((r) => setTimeout(r, 650 + Math.random() * 500));
      setDone(i);
    }
    await new Promise((r) => setTimeout(r, 700));
    router.push("/app?m=m_lumen&launched=1");
  };

  return (
    <div className="mx-auto max-w-[760px]">
      <nav className="flex items-center gap-2 font-mono text-[12px] text-ink-soft">
        <Link href="/app" className="hover:text-ink">Moonlets</Link>
        <span>/</span>
        <span className="text-ink">Launch</span>
      </nav>

      <ol className="mt-6 grid grid-cols-3 gap-2">
        {["The job", "Delivery", "Confirm"].map((l, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const state = n < step ? "done" : n === step ? "active" : "todo";
          return (
            <li key={l} className="flex items-center gap-2">
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11.5px] ${
                  state === "done" ? "bg-moss text-white" : state === "active" ? "bg-ink text-cream" : "bg-ink/10 text-ink-soft"
                }`}
              >
                {state === "done" ? "✓" : n}
              </span>
              <span className={`font-mono text-[12.5px] ${state === "todo" ? "text-ink-faint" : "text-ink"}`}>{l}</span>
              <span className={`ml-1 h-px flex-1 ${state === "done" ? "bg-moss" : "bg-ink/10"}`} />
            </li>
          );
        })}
      </ol>

      <section className="mt-6 rounded-lg border border-ink/10 bg-white p-6">
        {step === 1 && (
          <>
            <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-ink">What should it do?</h1>
            <p className="mt-1 text-[13.5px] text-ink-soft">Pick a shape, then say it in one sentence. You can change it later.</p>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {ORDER.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTemplate(t);
                    if (!job || Object.values(TEMPLATES).some((v) => v.example === job)) setJob(TEMPLATES[t].example);
                  }}
                  className={`rounded-lg border p-3.5 text-left transition-colors ${
                    template === t ? "border-ink bg-paper" : "border-ink/10 hover:border-ink/30"
                  }`}
                >
                  <p className="text-[14px] font-semibold text-ink">{TEMPLATES[t].name}</p>
                  <p className="mt-0.5 text-[12.5px] leading-[1.5] text-ink-soft">{TEMPLATES[t].blurb}</p>
                  <p className="mt-2 font-mono text-[11px] text-ink-faint">~{fmtUsd(TEMPLATES[t].costPerRun, 3)} / run</p>
                </button>
              ))}
            </div>

            <label className="mt-5 block">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">The job, one sentence</span>
              <textarea
                value={job}
                onChange={(e) => setJob(e.target.value)}
                rows={2}
                placeholder={TEMPLATES[template].example}
                className="mt-1.5 w-full resize-none rounded-md border border-ink/20 bg-paper px-3 py-2.5 font-mono text-[14px] text-ink outline-none focus:border-ink"
              />
            </label>

            <label className="mt-3 block">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">Name (optional)</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Lumen, Pebble, Tide…"
                className="mt-1.5 w-full rounded-md border border-ink/20 bg-paper px-3 py-2 font-mono text-[14px] text-ink outline-none focus:border-ink"
              />
            </label>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-ink">Where should results go?</h1>
            <p className="mt-1 text-[13.5px] text-ink-soft">Every run lands on the public page and gets anchored on chain. Add pings if you want them.</p>

            <ul className="mt-5 space-y-2.5">
              <li className="flex items-center justify-between rounded-lg border border-ink/10 bg-paper p-3.5">
                <div>
                  <p className="text-[14px] font-semibold text-ink">Public page</p>
                  <p className="text-[12.5px] text-ink-soft">moonlet.sky/s/… · anyone can watch it work</p>
                </div>
                <span className="rounded-full bg-moss/10 px-2 py-0.5 font-mono text-[11px] text-moss">always on</span>
              </li>
              <li className="rounded-lg border border-ink/10 p-3.5">
                <p className="text-[14px] font-semibold text-ink">Telegram</p>
                <input
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="@handle or chat id"
                  className="mt-2 w-full rounded-md border border-ink/20 bg-paper px-3 py-2 font-mono text-[13.5px] text-ink outline-none focus:border-ink"
                />
              </li>
              <li className="rounded-lg border border-ink/10 p-3.5">
                <p className="text-[14px] font-semibold text-ink">X</p>
                <input
                  value={x}
                  onChange={(e) => setX(e.target.value)}
                  placeholder="@handle to post from"
                  className="mt-2 w-full rounded-md border border-ink/20 bg-paper px-3 py-2 font-mono text-[13.5px] text-ink outline-none focus:border-ink"
                />
              </li>
            </ul>
          </>
        )}

        {step === 3 && !launching && (
          <>
            <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-ink">The honest math</h1>
            <p className="mt-1 text-[13.5px] text-ink-soft">This is what your bag can afford. Buy more and it runs more. Sell and it goes quiet.</p>

            <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr]">
              <div className="rounded-lg border border-ink/10 bg-paper p-4">
                <FuelGauge earnPerDay={earn} burnPerDay={burn} size="md" />
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 self-center font-mono text-[13px]">
                <dt className="text-ink-soft">your bag</dt><dd className="text-ink">{fmtBag(bag)} $ORBIO</dd>
                <dt className="text-ink-soft">earns</dt><dd className="text-ink">~{fmtUsd(earn)} / day</dd>
                <dt className="text-ink-soft">this job costs</dt><dd className="text-ink">~{fmtUsd(cost, 3)} / run</dd>
                <dt className="text-ink-soft">so it runs</dt><dd className="text-ink">{cadence}{affordable > 24 ? " · capped, headroom for better models" : ` · ~${runsPerDay}×/day`}</dd>
                <dt className="text-ink-soft">first key</dt><dd className="text-ink">{fmtUsd(Math.min(200, Math.max(5, earn * 3)))} from your balance</dd>
              </dl>
            </div>

            <div className="mt-5 rounded-lg border border-ink/10 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">{name || "Unnamed"} · {TEMPLATES[template].name}</p>
              <p className="mt-1.5 text-[14px] text-ink">“{job}”</p>
              <p className="mt-2 font-mono text-[12px] text-ink-soft">
                → public page{telegram && ` · Telegram ${telegram}`}{x && ` · X ${x}`}
              </p>
            </div>
            <p className="mt-3 text-[11.5px] leading-[1.5] text-ink-faint">
              Estimates use a placeholder earnings curve until live Orbio balance is wired. Spend is always read from OpenRouter.
            </p>
          </>
        )}

        {launching && (
          <>
            <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-ink">Launching {name || "your moonlet"}</h1>
            <p className="mt-1 text-[13.5px] text-ink-soft">No human touches a key. Watch it happen.</p>
            <ol className="mt-5 space-y-2">
              {LAUNCH_STEPS.map((s, i) => {
                const state = i <= done ? "done" : i === done + 1 ? "active" : "todo";
                return (
                  <li key={s.key} className={`flex items-center gap-3 rounded-md border px-3.5 py-2.5 ${state === "active" ? "border-ink bg-paper" : "border-ink/10"} ${state === "todo" ? "opacity-50" : ""}`}>
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] ${state === "done" ? "bg-moss text-white" : state === "active" ? "bg-ink text-cream" : "bg-ink/10 text-ink-soft"}`}>
                      {state === "done" ? "✓" : state === "active" ? <span className="h-2 w-2 animate-pulse rounded-full bg-gold" /> : i + 1}
                    </span>
                    <span className="flex-1 text-[13.5px] text-ink">{s.label}</span>
                    <code className="font-mono text-[11px] text-ink-faint">{s.tool}</code>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        {!launching && (
          <div className="mt-6 flex items-center justify-between border-t border-ink/10 pt-5">
            <button
              onClick={() => (step === 1 ? router.push("/app") : setStep((s) => (s - 1) as 1 | 2 | 3))}
              className="font-mono text-[13px] text-ink-soft hover:text-ink"
            >
              ← {step === 1 ? "Cancel" : "Back"}
            </button>
            {step < 3 ? (
              <button
                disabled={!canNext}
                onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
                className="btn-hard rounded-md border-2 border-ink bg-white px-4 py-2 font-mono text-[13.5px] font-medium text-ink disabled:opacity-40"
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={launch}
                className="btn-hard rounded-md border-2 border-ink bg-gold px-5 py-2 font-mono text-[13.5px] font-medium text-midnight"
              >
                Launch
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export default function NewMoonletPage() {
  return (
    <Suspense>
      <NewInner />
    </Suspense>
  );
}
