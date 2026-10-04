import { describe, expect, it } from "vitest";
import { metricText } from "@/lib/metrics";

describe("metric tiles", () => {
  it("makes a model's raw readings readable: dollars by label, compact, signed deltas", () => {
    expect(metricText("Liquidity USD", "1540686", "3477.1")).toEqual({ value: "$1.54M", delta: "+$3,477", tone: "up" });
    expect(metricText("ORBIO price", "0.1068", "0.0007")).toEqual({ value: "$0.1068", delta: "+$0.0007", tone: "up" });
    expect(metricText("24h volume", "3617640.36", "-6377.82")).toEqual({ value: "$3.62M", delta: "−$6,378", tone: "down" });
    expect(metricText("CREDIT 6h", "2437.196684", "")).toEqual({ value: "2,437", delta: "", tone: undefined });
    expect(metricText("CREDIT activations", "126", "")).toEqual({ value: "126", delta: "", tone: undefined });
    expect(metricText("CREDIT burned 6h", "2457.82", "20.36")).toEqual({ value: "$2,458", delta: "+$20.36", tone: "up" });
    expect(metricText("Holders", "773", "12")).toEqual({ value: "773", delta: "+12", tone: "up" });
  });

  it("leaves numbers the model already formatted alone", () => {
    expect(metricText("Price", "$0.1061", "+0.7%")).toEqual({ value: "$0.1061", delta: "+0.7%", tone: undefined });
    expect(metricText("Activations", "124 (+1)", "")).toEqual({ value: "124 (+1)", delta: "", tone: undefined });
    expect(metricText("24h volume", "$3.684M", "+ $6.5K").delta).toBe("+$6.5K");
  });
});
