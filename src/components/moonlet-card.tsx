import Image from "next/image";

/**
 * A public moonlet page, in miniature. Real HTML so it stays crisp.
 * Values below are ILLUSTRATIVE (demo) and labelled as such in the UI.
 */
export function MoonletCard() {
  return (
    <div className="relative mx-auto w-full max-w-[26rem]">
      <Image
        src="/mascot/moonlet-peek.png"
        alt=""
        width={220}
        height={220}
        priority
        className="pointer-events-none absolute -top-[92px] right-6 z-10 w-[150px] select-none sm:-top-[104px] sm:w-[170px]"
      />
      <div className="relative overflow-hidden rounded-2xl border border-ink/15 bg-paper shadow-[0_1px_0_rgba(23,20,15,0.06),0_24px_60px_-30px_rgba(23,20,15,0.35)]">
        <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
          <span className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-moss animate-pulse-ring" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-moss" />
            </span>
            alive · 14d 6h
          </span>
          <span>moonlet #0042 · demo</span>
        </div>

        <div className="px-4 pt-4 pb-3">
          <p className="font-serif text-[1.15rem] leading-snug text-ink">
            “Every morning, read new Orbio governance posts and send me a
            three-line brief on Telegram.”
          </p>
          <p className="mt-2 font-mono text-[11px] text-ink-soft">
            0x3fA9…c21B · schedule: daily 07:00 UTC · model: cheapest that passes
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-px border-t border-ink/10 bg-ink/10 font-mono text-[12px] sm:grid-cols-4">
          {[
            ["runs", "31"],
            ["credits in", "$4.10"],
            ["credits out", "$3.84"],
            ["uptime", "99.6%"],
          ].map(([k, v]) => (
            <div key={k} className="bg-paper px-4 py-3">
              <dt className="whitespace-nowrap text-ink-soft">{k}</dt>
              <dd className="mt-0.5 text-[15px] tabular-nums text-ink">{v}</dd>
            </div>
          ))}
        </dl>

        <ul className="divide-y divide-ink/10 border-t border-ink/10 font-mono text-[12px]">
          {[
            ["07:02", "brief sent · 412 tokens", "0x7c2e…a91f"],
            ["yesterday", "brief sent · 388 tokens", "0x11b0…4de7"],
            ["2d ago", "key rotated · $0.00 lost", "0x9a4c…02f3"],
          ].map(([t, what, tx]) => (
            <li key={tx} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="w-[5.5rem] shrink-0 text-ink-soft">{t}</span>
              <span className="flex-1 truncate text-ink">{what}</span>
              <span className="shrink-0 text-ink-soft underline decoration-ink/30 underline-offset-2">
                {tx} ↗
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
