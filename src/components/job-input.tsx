"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLES = [
  "Every morning, brief me on new Orbio governance posts.",
  "Watch $ORBIO liquidity and ping me on Telegram if it moves 10%.",
  "Reply to mentions of my project on X with a friendly one-liner.",
  "Once a week, summarise what the other moonlets are doing.",
];

export function JobInput() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState(0);
  const [deleting, setDeleting] = useState(false);

  const target = EXAMPLES[idx];
  const placeholder = useMemo(() => target.slice(0, shown), [target, shown]);

  useEffect(() => {
    if (value) return;
    let t: ReturnType<typeof setTimeout>;
    if (!deleting && shown < target.length) {
      t = setTimeout(() => setShown((s) => s + 1), 28 + Math.random() * 40);
    } else if (!deleting && shown === target.length) {
      t = setTimeout(() => setDeleting(true), 2200);
    } else if (deleting && shown > 0) {
      t = setTimeout(() => setShown((s) => s - 1), 14);
    } else {
      t = setTimeout(() => {
        setDeleting(false);
        setIdx((i) => (i + 1) % EXAMPLES.length);
      }, 300);
    }
    return () => clearTimeout(t);
  }, [shown, deleting, target, value]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const job = value.trim() || target;
    router.push(`/app?job=${encodeURIComponent(job)}`);
  };

  return (
    <form
      onSubmit={submit}
      className="group relative flex w-full max-w-xl items-center rounded-2xl border border-ink/15 bg-paper p-1.5 pl-4 shadow-[0_1px_0_rgba(21,22,29,0.04),0_18px_50px_-30px_rgba(21,22,29,0.45)] transition-colors focus-within:border-ink/40 sm:pl-5"
    >
      <label htmlFor="job" className="sr-only">
        Describe the job in one sentence
      </label>
      <div className="relative min-w-0 flex-1">
        <input
          id="job"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-transparent py-3 font-sans text-[15px] text-ink outline-none placeholder:text-transparent sm:text-base"
          placeholder={target}
        />
        {!value && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center overflow-hidden pr-2 text-[15px] text-ink-soft sm:text-base"
          >
            <span className="whitespace-nowrap">{placeholder}</span>
            <span className="ml-0.5 inline-block h-[1.1em] w-[2px] shrink-0 bg-gold animate-caret" />
          </div>
        )}
      </div>
      <button
        type="submit"
        className="shrink-0 rounded-xl bg-midnight px-4 py-3 text-[14px] font-semibold text-cream transition-colors hover:bg-midnight-soft sm:px-5"
      >
        Launch <span aria-hidden>→</span>
      </button>
    </form>
  );
}
