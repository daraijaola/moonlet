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
      className="relative flex items-center gap-2 rounded-xl border-2 border-ink bg-paper p-1.5 pl-4 shadow-[4px_4px_0_var(--ink)] focus-within:shadow-[2px_2px_0_var(--ink)] transition-shadow"
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
          className="w-full bg-transparent py-2.5 font-mono text-[14px] text-ink outline-none placeholder:text-transparent"
        />
        {!value && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center font-mono text-[14px] text-ink-soft"
          >
            <span className="whitespace-nowrap">{target.slice(0, shown)}</span>
            <span className="ml-px inline-block h-[1.05em] w-[2px] shrink-0 bg-ink animate-caret" />
          </div>
        )}
      </div>
      <button
        type="submit"
        className="btn-hard shrink-0 rounded-md border-2 border-ink bg-gold px-4 py-2 font-mono text-[13.5px] font-medium text-midnight"
      >
        Launch
      </button>
    </form>
  );
}
