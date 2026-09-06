"use client";

import dynamic from "next/dynamic";

const ToolPhysics = dynamic(() => import("./tool-physics").then((m) => m.ToolPhysics), { ssr: false });

export function Rails() {
  return (
    <section id="rails" className="relative border-t border-ink/[0.07]">
      <div className="mx-auto max-w-[1180px] px-5 py-24 sm:px-6 sm:py-32">
        <div className="surface grid overflow-hidden rounded-2xl lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="p-8 sm:p-12">
            <p className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink-soft">What it runs on</p>
            <h2 className="mt-4 text-[2.3rem] font-medium leading-[1.04] tracking-[-0.03em] text-ink sm:text-[3rem]">
              Your tools.
              <br />
              Nothing to install.
            </h2>
            <p className="mt-5 max-w-[30rem] text-[16px] leading-[1.55] text-ink-soft">
              Orbio pays for it, Robinhood Chain remembers it, and it acts through the accounts you already have. GitHub, Discord and X connect in a click; anything that speaks for you waits for your approval the first time.
            </p>
          </div>

          <ToolPhysics className="relative h-[300px] overflow-hidden border-t border-ink/[0.07] bg-[#FBF8F1] lg:h-auto lg:min-h-[340px] lg:border-t-0 lg:border-l" />
        </div>
      </div>
    </section>
  );
}
