import Image from "next/image";
import Link from "next/link";
import { Reveal } from "./reveal";

const RULES = [
  {
    title: "It claims its own key.",
    body: "It reads your Orbio balance and claims a capped inference key through Orbio's MCP. The key never sits in your clipboard. If it leaks, it rotates. If you leave, it's revoked.",
    icon: (
      <path d="M14 7a5 5 0 1 1-9.6 2L2 11.4V14h2.6l.5-.5H7v-2h2l1.2-1.2A5 5 0 0 1 14 7Zm-3-1a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
    ),
  },
  {
    title: "It asks before it acts.",
    body: "Reading the chain, the market and the web is free. Anything that speaks for you, a post, a pull request, a message, lands in your Telegram as a proposal first. Approve with one tap, or turn on autopilot per moonlet.",
    icon: <path d="M8 1.5 14 4v4c0 3.4-2.6 5.8-6 6.5C4.6 13.8 2 11.4 2 8V4l6-2.5Zm-2.5 6.3 1.8 1.8 3.2-3.4" />,
  },
  {
    title: "It sleeps when you sell.",
    body: "Under 1,000 $ORBIO it goes quiet: no runs, no spend, key revoked. Top back up and it wakes on the next tick. The bag is the on switch.",
    icon: <path d="M9.5 2.2A6 6 0 1 0 13.8 10 4.6 4.6 0 0 1 9.5 2.2Z" />,
  },
  {
    title: "Proof, not promises.",
    body: "Every run is hashed and anchored on Robinhood Chain. The public page shows cost, model, duration and the hash. Anyone can check the work.",
    icon: <path d="M3 8.5l3 3L13 4.5M2 13h12" />,
  },
];

export function Rules() {
  return (
    <section id="rules" className="relative mx-auto max-w-[1180px] px-5 pt-28 sm:px-6 sm:pt-40">
      <Reveal className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-[36rem]">
          <p className="eyebrow">The rules</p>
          <h2 className="serif mt-4 text-[2.7rem] leading-[1.02] text-cream sm:text-[3.8rem]">
            One rule underneath everything: <em className="text-gold">the bag is the budget.</em>
          </h2>
        </div>
        <p className="max-w-[26rem] text-[15px] leading-[1.6] text-cream/55">
          No card, no monthly plan. The credits your $ORBIO earns pay for the agent, and Moonlet never touches the tokens themselves.
        </p>
      </Reveal>

      <div className="mt-14 grid gap-4 lg:grid-cols-3">
        <Reveal className="card card-hover relative overflow-hidden lg:col-span-2">
          <div className="flex flex-col gap-3 p-7 sm:flex-row sm:items-end sm:justify-between sm:p-8">
            <div>
              <p className="eyebrow">The sky</p>
              <h3 className="serif mt-3 text-[2rem] leading-none text-cream">Every moonlet, live.</h3>
              <p className="mt-3 max-w-[28rem] text-[15px] leading-[1.6] text-cream/60">
                Dot size is the bag it orbits. A pulse means it&apos;s working right now. Open any one and read what it did.
              </p>
            </div>
            <Link href="/sky" className="btn-pill btn-ghost shrink-0 !py-2 !px-4 text-[13.5px]">
              Open the sky
            </Link>
          </div>
          <div className="relative px-7 sm:px-8">
            <div aria-hidden className="glow-gold pointer-events-none absolute inset-x-0 -bottom-20 h-64 opacity-40 blur-3xl" />
            <div className="frame relative -mb-24 translate-y-2 transition-transform duration-500 group-hover:translate-y-0">
              <div className="frame-bar">
                <i /><i /><i />
                <span className="frame-url">moonlet.sky/sky</span>
              </div>
              <Image src="/shots/sky.webp" alt="The sky: an orbital view of live moonlets around $ORBIO, with alive count, credits per day, and runs in the last 24 hours." width={2530} height={1600} sizes="(max-width: 1024px) 100vw, 780px" className="block w-full" />
            </div>
          </div>
        </Reveal>

        {RULES.map((r, i) => (
          <Reveal key={r.title} delay={0.06 * i} className="card card-hover relative flex flex-col overflow-hidden p-7 sm:p-8">
            <span className="grid h-10 w-10 place-items-center rounded-full border hair bg-cream/[0.03] text-gold">
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                {r.icon}
              </svg>
            </span>
            <h3 className="serif mt-6 text-[1.9rem] leading-none text-cream">{r.title}</h3>
            <p className="mt-3 text-[14.5px] leading-[1.6] text-cream/60">{r.body}</p>
            {i === 0 && (
              <div className="relative mt-8 flex flex-1 items-end justify-center">
                <div aria-hidden className="glow-gold pointer-events-none absolute inset-x-8 bottom-0 h-40 opacity-60 blur-2xl" />
                <Image src="/mascot/moonlet-float.png" alt="" width={520} height={520} className="animate-float relative -mb-2 w-[200px] select-none" />
              </div>
            )}
          </Reveal>
        ))}
      </div>
    </section>
  );
}
