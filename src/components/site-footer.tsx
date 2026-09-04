"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoonletMark, Wordmark } from "./logo";
import { OpenRouterMark, OrbioMark, RobinhoodMark } from "./marks";

const COLS: [string, { href: string; label: string; external?: boolean }[]][] = [
  ["Product", [
    { href: "/app", label: "Launch a moonlet" },
    { href: "/sky", label: "The sky" },
    { href: "/sign-in", label: "Sign in" },
  ]],
  ["Learn", [
    { href: "#how", label: "How it works" },
    { href: "https://www.orbio.so/build", label: "Orbio Build Week", external: true },
    { href: "https://github.com/daraijaola/moonlet", label: "Source", external: true },
  ]],
  ["Legal", [
    { href: "https://www.orbio.so", label: "Credits are product access, not cash", external: true },
    { href: "/sky", label: "Every run is public" },
  ]],
];

const PARTNERS = [
  { name: "moonlet", role: "the agent", mark: <MoonletMark size={28} ink="#F5F2EA" face="#141413" /> },
  { name: "Orbio", role: "credits", href: "https://www.orbio.so", mark: <OrbioMark size={28} /> },
  { name: "Robinhood Chain", role: "receipts", href: "https://robinhoodchain.blockscout.com", mark: <RobinhoodMark size={26} /> },
  { name: "OpenRouter", role: "models", href: "https://openrouter.ai", mark: <OpenRouterMark size={26} /> },
];

export function SiteFooter() {
  const router = useRouter();
  const [job, setJob] = useState("");
  return (
    <footer className="bg-[#141413] text-[#F5F2EA]">
      <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)] lg:gap-20">
          {/* left, Cowork-style: logo, prompt, copyright */}
          <div className="flex flex-col">
            <Link href="/" className="inline-flex w-fit items-center gap-2.5">
              <MoonletMark size={34} ink="#F5F2EA" face="#141413" />
              <Wordmark className="text-[1.45rem] text-[#F5F2EA]" />
            </Link>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                router.push(`/app?job=${encodeURIComponent(job.trim() || "Every morning, tell me what moved on Robinhood Chain and why.")}`);
              }}
              className="mt-8 flex max-w-[22rem] items-end gap-3 border-b border-[#F5F2EA]/25 pb-2 transition-colors focus-within:border-[#F5F2EA]/70"
            >
              <label htmlFor="job-footer" className="sr-only">Describe the job in one sentence</label>
              <input
                id="job-footer"
                value={job}
                onChange={(e) => setJob(e.target.value)}
                placeholder="What should your moonlet do?"
                className="min-w-0 flex-1 bg-transparent py-1 text-[14px] text-[#F5F2EA] outline-none placeholder:text-[#F5F2EA]/45"
              />
              <button type="submit" aria-label="Launch" className="btn-press grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#D97757] text-[#141413] hover:!bg-[#c96442]">
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
              </button>
            </form>
            <p className="mt-auto pt-10 text-[12.5px] text-[#F5F2EA]/55">© 2026 moonlet · Built for Orbio Build Week</p>
          </div>

          {/* right: link columns + partner boxes on the edge */}
          <div className="grid gap-12 sm:grid-cols-[1fr_auto] sm:gap-10">
            <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
              {COLS.map(([title, links]) => (
                <div key={title}>
                  <p className="text-[13px] font-medium text-[#F5F2EA]">{title}</p>
                  <ul className="mt-4 space-y-2.5 text-[13.5px] text-[#F5F2EA]/60">
                    {links.map((l) => (
                      <li key={l.label}>
                        <Link href={l.href} target={l.external ? "_blank" : undefined} rel={l.external ? "noreferrer" : undefined} className="transition-colors hover:text-[#F5F2EA]">
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <ul className="grid w-full grid-cols-2 border-l border-t border-[#F5F2EA]/15 sm:w-[300px]">
              {PARTNERS.map((p) => {
                const inner = (
                  <>
                    <span className="grid h-11 w-11 place-items-center text-[#F5F2EA] [&_img]:brightness-0 [&_img]:invert">{p.mark}</span>
                    <span className="mt-3 block text-[13px] font-medium text-[#F5F2EA]">{p.name}</span>
                    <span className="block font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#F5F2EA]/45">{p.role}</span>
                  </>
                );
                const cls = "flex h-full flex-col items-start p-5 transition-colors hover:bg-[#F5F2EA]/[0.04]";
                return (
                  <li key={p.name} className="border-b border-r border-[#F5F2EA]/15">
                    {p.href ? <a href={p.href} target="_blank" rel="noreferrer" className={cls}>{inner}</a> : <div className={cls}>{inner}</div>}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
