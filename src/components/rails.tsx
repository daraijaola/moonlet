import { AnthropicMark, GoogleMark, OpenAIMark, OpenRouterMark, OrbioMark, RobinhoodMark } from "./marks";

const RAILS = [
  { name: "Orbio", role: "credits", Mark: OrbioMark },
  { name: "Robinhood Chain", role: "receipts", Mark: RobinhoodMark },
  { name: "OpenRouter", role: "one key, every model", Mark: OpenRouterMark },
  { name: "Gemini", role: "small bags", Mark: GoogleMark },
  { name: "GPT", role: "middle", Mark: OpenAIMark },
  { name: "Claude", role: "large bags", Mark: AnthropicMark },
];

/** What a moonlet actually runs on. All real, all already wired in. */
export function Rails() {
  return (
    <section className="relative mx-auto max-w-[1180px] px-5 pt-20 sm:px-6 sm:pt-28">
      <div className="divider-fade" />
      <div className="flex flex-col items-center gap-8 py-12 lg:flex-row lg:justify-between">
        <p className="eyebrow shrink-0">Runs on</p>
        <ul className="grid w-full grid-cols-2 gap-x-8 gap-y-6 text-cream/60 sm:grid-cols-3 lg:flex lg:w-auto lg:items-center lg:gap-12">
          {RAILS.map(({ name, role, Mark }) => (
            <li key={name} className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border hair bg-cream/[0.03] text-cream/80 [&_img]:brightness-0 [&_img]:invert [&_img]:opacity-80">
                <Mark size={16} />
              </span>
              <span className="leading-tight">
                <span className="block text-[14px] font-medium text-cream/85">{name}</span>
                <span className="block text-[11.5px] text-cream/40">{role}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="divider-fade" />
    </section>
  );
}
