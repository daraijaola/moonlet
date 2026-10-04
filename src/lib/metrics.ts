/** Labels whose numbers are dollars. Not "CREDIT" alone: "CREDIT activations" is a count. */
const MONEY = /price|usd|\$|liquidity|volume|cap|fdv|tvl|burned|spent|cost|fees?/i;

function compact(n: number) {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e5) return `${(n / 1e3).toFixed(0)}K`;
  if (a >= 1000) return Math.round(n).toLocaleString("en-US");
  if (a >= 1) return n.toFixed(2).replace(/\.?0+$/, "");
  return n.toPrecision(4).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

const bare = (v: string) => /^[-+−]?\d+(\.\d+)?$/.test(v.trim());

/**
 * Models sometimes put a raw reading in a tile ("1537208.9", "0.0007"). Shown as-is it looks broken, so a bare number is
 * made readable ($1.54M, +$0.0007); anything the model already formatted ("$1.54M", "+0.7%") is left alone.
 */
export function metricText(label: string, value: string, delta: string) {
  const money = MONEY.test(label);
  const fmt = (v: string, signed: boolean) => {
    const n = Number(v.trim().replace("−", "-"));
    const sign = signed ? (n > 0 ? "+" : n < 0 ? "−" : "±") : n < 0 ? "−" : "";
    return `${sign}${money ? "$" : ""}${compact(Math.abs(n))}`;
  };
  // "+ $6.5K" → "+$6.5K": models sometimes space the sign off.
  const d = delta.trim().replace(/^([+−-])\s+/, "$1");
  const dn = bare(d) ? Number(d.replace("−", "-")) : NaN;
  return {
    value: bare(value) ? fmt(value, false) : value,
    delta: bare(d) ? fmt(d, true) : d,
    tone: Number.isFinite(dn) ? (dn > 0 ? "up" : dn < 0 ? "down" : "flat") : undefined,
  };
}
