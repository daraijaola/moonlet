import { fmtUsd } from "@/lib/api";

export type FuelTone = "green" | "amber" | "grey";

export function fuelTone(earnPerDay: number, burnPerDay: number, quiet = false): FuelTone {
  if (quiet || earnPerDay <= 0) return "grey";
  return earnPerDay >= burnPerDay ? "green" : "amber";
}

const TONE = {
  green: { ring: "var(--moss)", label: "Earning faster than burning", chip: "bg-moss/10 text-moss" },
  amber: { ring: "var(--gold)", label: "Burning down", chip: "bg-gold/20 text-ink" },
  grey: { ring: "var(--ink-faint)", label: "Quiet", chip: "bg-ink/5 text-ink-soft" },
} as const;

type Props = {
  earnPerDay: number;
  burnPerDay: number;
  balance?: number;
  quiet?: boolean;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
};

/**
 * The fuel gauge: credits in vs credits out. Same meaning on every screen.
 * The arc fills with burn as a share of earn (capped), the tone tells the story.
 */
export function FuelGauge({
  earnPerDay,
  burnPerDay,
  balance,
  quiet,
  size = "md",
  showLabel = true,
  className,
}: Props) {
  const tone = fuelTone(earnPerDay, burnPerDay, quiet);
  const t = TONE[tone];
  const ratio = earnPerDay > 0 ? Math.min(1, burnPerDay / earnPerDay) : 0;
  const px = size === "lg" ? 168 : size === "md" ? 104 : 44;
  const stroke = size === "lg" ? 12 : size === "md" ? 9 : 5;
  const r = (px - stroke) / 2;
  const c = 2 * Math.PI * r;
  const runwayDays =
    burnPerDay > earnPerDay && balance !== undefined
      ? balance / (burnPerDay - earnPerDay)
      : null;

  return (
    <div className={`inline-flex items-center gap-4 ${className ?? ""}`}>
      <div className="relative shrink-0" style={{ width: px, height: px }}>
        <svg width={px} height={px} className="-rotate-90">
          <circle
            cx={px / 2}
            cy={px / 2}
            r={r}
            fill="none"
            stroke="var(--cream-deep)"
            strokeWidth={stroke}
          />
          <circle
            cx={px / 2}
            cy={px / 2}
            r={r}
            fill="none"
            stroke={t.ring}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - (tone === "grey" ? 0.04 : Math.max(0.04, ratio)))}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        {size !== "sm" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className={`font-display leading-none text-ink ${
                size === "lg" ? "text-[2.6rem]" : "text-[1.5rem]"
              }`}
            >
              {tone === "grey" ? "—" : ratio < 0.01 && ratio > 0 ? `${(ratio * 100).toFixed(1)}%` : `${Math.round(ratio * 100)}%`}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
              burn
            </span>
          </div>
        )}
      </div>

      {showLabel && size !== "sm" && (
        <div className="min-w-0">
          <span
            className={`inline-block rounded-full px-2 py-0.5 font-mono text-[11px] font-medium ${t.chip}`}
          >
            {t.label}
          </span>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 font-mono text-[12.5px]">
            <dt className="whitespace-nowrap text-ink-soft">in / day</dt>
            <dd className="text-ink">{fmtUsd(earnPerDay)}</dd>
            <dt className="whitespace-nowrap text-ink-soft">out / day</dt>
            <dd className="text-ink">{fmtUsd(burnPerDay)}</dd>
            {runwayDays !== null && (
              <>
                <dt className="text-ink-soft">runway</dt>
                <dd className="text-ink">{runwayDays.toFixed(1)}d</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

export function StatusDot({ tone, pulse }: { tone: FuelTone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {pulse && tone !== "grey" && (
        <span
          className="absolute inset-0 rounded-full animate-pulse-ring"
          style={{ background: TONE[tone].ring }}
        />
      )}
      <span className="relative h-2.5 w-2.5 rounded-full" style={{ background: TONE[tone].ring }} />
    </span>
  );
}
