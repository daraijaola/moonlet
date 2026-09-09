"use client";

import dynamic from "next/dynamic";

const ToolPhysics = dynamic(() => import("./tool-physics").then((m) => m.ToolPhysics), { ssr: false });

export function Rails() {
  return (
    <section id="rails" className="relative border-t border-ink/[0.07]">
      <div className="mx-auto max-w-[1180px] px-5 py-24 sm:px-6 sm:py-32">
        <div className="grid overflow-hidden rounded-2xl border-2 border-ink bg-white shadow-[6px_6px_0_var(--ink)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="p-8 sm:p-12">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">What it runs on</p>
            <h2 className="mt-3 text-[2.3rem] font-medium leading-[1.04] tracking-[-0.03em] text-ink sm:text-[3rem]">
              Your accounts.
              <br />
              Nothing to install.
            </h2>
            <p className="mt-5 max-w-[30rem] text-[16px] leading-[1.55] text-ink-soft">
              Orbio pays for the work, Robinhood Chain keeps the receipt, and the moonlet acts through accounts you already own. Gmail, GitHub, Telegram, Discord and X connect in a click. Anything that speaks for you waits for your approval.
            </p>
            <p className="mt-6 font-mono text-[11.5px] text-ink-faint">Drag the tiles. They&apos;re real; the connections are one tap each.</p>
          </div>

          <ToolPhysics className="tool-stage relative h-[320px] overflow-hidden border-t-2 border-ink bg-paper lg:h-auto lg:min-h-[380px] lg:border-t-0 lg:border-l-2" />
        </div>
      </div>
    </section>
  );
}
