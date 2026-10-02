"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** The one official $MOONLET contract. Clones with the same name exist on Robinhood Chain; this is the only real one. */
export const MOONLET_CA = "0xCaCE05716778f86E4feB04Bd7a2C2f2c31705f2b";

const LINKS = [
  { href: "https://dexscreener.com/robinhood/0xe2a9837a15c2b3de6a590c6c3f148a4b858a81c81af9da62c145f507c5bddecd", label: "Chart" },
  { href: `https://robinhoodchain.blockscout.com/token/${MOONLET_CA}`, label: "Explorer" },
  { href: "https://x.com/Moonletxyz", label: "@Moonletxyz" },
];

export function TokenCA() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(MOONLET_CA); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {}
  };
  return (
    <section id="token" className="mx-auto max-w-[1180px] scroll-mt-24 px-5 pb-20 sm:px-6">
      <div className="rounded-3xl border border-ink/10 bg-white/60 p-6 sm:p-8">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between">
          <p className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink-soft">$MOONLET · official contract · Robinhood Chain</p>
          <p className="text-[13px] text-ink-faint">Paired with $ORBIO on Uniswap</p>
        </div>

        <button
          type="button"
          onClick={copy}
          aria-label="Copy the $MOONLET contract address"
          className="group mt-4 flex w-full items-center gap-3 rounded-2xl border border-ink/10 bg-cream px-4 py-3.5 text-left transition-[border-color,box-shadow] hover:border-ink/25 focus-visible:shadow-[0_0_0_3px_rgba(233,182,76,0.35)] focus-visible:outline-none"
        >
          <code className="min-w-0 flex-1 break-all font-mono text-[14px] leading-[1.5] text-ink sm:text-[16px]">{MOONLET_CA}</code>
          <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-2.5 py-1.5 text-[12.5px] font-medium text-cream">
            {copied ? <Check size={14} strokeWidth={2.2} /> : <Copy size={14} strokeWidth={2} />}
            {copied ? "Copied" : "Copy"}
          </span>
        </button>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[34rem] text-[13.5px] leading-[1.55] text-ink-soft">
            Other tokens named Moonlet exist. This address is the only official one; check it before you buy.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13.5px]">
            {LINKS.map((l) => (
              <Link key={l.label} href={l.href} target="_blank" rel="noreferrer" className="text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
