"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoonletMark, Wordmark } from "./logo";
import { GitHubMark, TelegramMark } from "./marks";
import Image from "next/image";

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
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
  ]],
];

export function SiteFooter() {
  const router = useRouter();
  const [job, setJob] = useState("");
  return (
    <footer className="relative isolate overflow-hidden bg-[#141413] text-[#F5F2EA]">
      <Image
        src="/mascot/moonlet-rest.png"
        alt=""
        aria-hidden
        width={1492}
        height={1023}
        sizes="(min-width: 1024px) 560px, 360px"
        className="pointer-events-none absolute right-0 bottom-0 -z-10 w-[360px] max-w-none translate-x-[22%] translate-y-[38%] select-none opacity-95 lg:w-[560px]"
      />
      <div className="mx-auto max-w-[1180px] px-5 pt-16 pb-36 sm:px-6 sm:pt-20 sm:pb-10">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)] lg:gap-20">
          {/* left, Cowork-style: logo, prompt, copyright */}
          <div className="flex flex-col">
            <Link href="/" className="inline-flex w-fit items-center gap-2.5">
              <MoonletMark size={34} ink="#F5F2EA" face="#141413" />
              <Wordmark className="text-[1.45rem] text-[#F5F2EA]" />
            </Link>
            <p className="mt-5 max-w-[22rem] text-[15px] leading-[1.55] text-[#F5F2EA]/65">Agents that pay for themselves with the CREDIT your staked $ORBIO earns. One sentence to start; a receipt for every run.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                router.push(`/app?job=${encodeURIComponent(job.trim() || "Every morning, tell me what moved on Robinhood Chain and why.")}`);
              }}
              className="mt-7 flex max-w-[24rem] items-center gap-2 rounded-2xl border border-[#F5F2EA]/15 bg-white/[0.04] p-1.5 pl-4 transition-[border-color,box-shadow] focus-within:border-[#F5F2EA]/40 focus-within:shadow-[0_0_0_3px_rgba(233,182,76,0.25)]"
            >
              <label htmlFor="job-footer" className="sr-only">Describe the job in one sentence</label>
              <input
                id="job-footer"
                value={job}
                onChange={(e) => setJob(e.target.value)}
                placeholder="What should your moonlet do?"
                className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-[#F5F2EA] outline-none placeholder:text-[#F5F2EA]/40"
              />
              <button type="submit" className="lp-btn lp-btn-gold lp-btn-sm !rounded-xl">
                Launch
                <svg viewBox="0 0 16 16" className="lp-arrow h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
              </button>
            </form>
          </div>

          {/* right: link columns */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
            {COLS.map(([title, links]) => (
              <div key={title}>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#F5F2EA]/55">{title}</p>
                <ul className="mt-4 space-y-3 text-[14.5px] text-[#F5F2EA]/75">
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
        </div>

        <div className="mt-14 flex flex-col-reverse gap-4 border-t border-[#F5F2EA]/12 pt-6 sm:flex-row sm:items-center sm:gap-6">
          <p className="text-[12.5px] text-[#F5F2EA]/50">© 2026 moonlet · Built for Orbio Build Week · <Link href="/sky" className="transition-colors hover:text-[#F5F2EA]">Every run is public</Link></p>
          <div className="flex items-center gap-1 sm:-ml-2">
            <Link href="https://t.me/moonletbbot" target="_blank" rel="noreferrer" aria-label="moonlet bot on Telegram" className="grid h-9 w-9 place-items-center rounded-lg text-[#F5F2EA]/60 transition-colors hover:bg-white/[0.06] hover:text-[#F5F2EA]"><TelegramMark size={16} /></Link>
            <Link href="https://github.com/daraijaola/moonlet" target="_blank" rel="noreferrer" aria-label="moonlet on GitHub" className="grid h-9 w-9 place-items-center rounded-lg text-[#F5F2EA]/60 transition-colors hover:bg-white/[0.06] hover:text-[#F5F2EA]"><GitHubMark size={16} /></Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
