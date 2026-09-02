import Image from "next/image";
import { JobInput } from "./job-input";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-cream">
      <div className="mx-auto grid max-w-[1180px] gap-4 px-4 pt-16 pb-16 sm:px-6 sm:pt-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:gap-10 lg:pt-24 lg:pb-24">
        <div>
          <h1 className="font-display text-[4.4rem] leading-[0.9] tracking-[0.005em] text-ink sm:text-[6rem] lg:text-[7.2rem]">
            Your bag
            <br />
            runs an agent
          </h1>
          <p className="mt-7 max-w-[34rem] font-mono text-[15px] leading-[1.65] text-ink sm:text-[17px]">
            Type one sentence. Thirty seconds later a moonlet is working around
            the clock, paid only by the credits your $ORBIO earns. No key ever
            touches a human.
          </p>
        </div>

        <div className="relative mx-auto mt-28 w-full max-w-[28rem] lg:mx-0 lg:ml-auto lg:mt-0">
          <Image
            src="/mascot/moonlet-rest.png"
            alt="A moonlet resting on the input box"
            width={520}
            height={357}
            priority
            className="animate-drift pointer-events-none absolute -top-[128px] left-1/2 z-20 w-[300px] max-w-none -translate-x-1/2 select-none sm:-top-[150px] sm:w-[350px]"
          />
          <div className="relative z-10">
            <JobInput />
          </div>
        </div>
      </div>
    </section>
  );
}
