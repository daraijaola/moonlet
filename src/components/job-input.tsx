"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLES = [
  "Ping me if $ORBIO liquidity moves 10%.",
  "Every morning, tell me what moved on Robinhood Chain and why.",
  "At 9pm, five bullets from https://www.orbio.so/build.",
];

export function JobInput({ id = "job" }: { id?: string } = {}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const target = EXAMPLES[idx];

  useEffect(() => {
    if (value) return;
    let t: ReturnType<typeof setTimeout>;
    if (!deleting && shown < target.length) {
      t = setTimeout(() => setShown((s) => s + 1), 26 + Math.random() * 38);
    } else if (!deleting) {
      t = setTimeout(() => setDeleting(true), 2400);
    } else if (shown > 0) {
      t = setTimeout(() => setShown((s) => s - 1), 12);
    } else {
      t = setTimeout(() => {
        setDeleting(false);
        setIdx((i) => (i + 1) % EXAMPLES.length);
      }, 350);
    }
    return () => clearTimeout(t);
  }, [shown, deleting, target, value]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/app?job=${encodeURIComponent(value.trim() || target)}`);
  };

  return (
    <form
      onSubmit={submit}
      className="group relative flex items-center gap-2 rounded-full border border-cream/15 bg-cream/[0.04] p-1.5 pl-5 shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_20px_60px_-30px_rgba(233,182,76,0.35)] backdrop-blur-md transition-colors focus-within:border-cream/35 focus-within:bg-cream/[0.06]"
    >
      <label htmlFor={id} className="sr-only">
        Describe the job in one sentence
      </label>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <input
          id={id}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder={target}
          className="w-full bg-transparent py-2.5 text-[15px] text-cream outline-none placeholder:text-transparent"
        />
        {!value && (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center text-[15px] text-cream/55">
            <span className="whitespace-nowrap">{target.slice(0, shown)}</span>
            <span className="ml-px inline-block h-[1.1em] w-[1.5px] shrink-0 bg-gold animate-caret" />
          </div>
        )}
      </div>
      <button type="submit" className="btn-pill btn-cream shrink-0 !px-5 !py-2.5">
        Launch
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      </button>
    </form>
  );
}
