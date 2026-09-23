import { describe, expect, it } from "vitest";
import { closeJson } from "../src/moonlet/runner";

describe("closeJson", () => {
  it("closes a report clipped inside a string", () => {
    const cut = `{\n  "title": "CREDIT at 75¢, 25% off",\n  "summary": "AI inference trades at a 25% discount.",\n  "sections": [{"check": "Price", "label": "Price", "finding": "75¢"}],\n  "metrics": [\n    {"label": "ORBIO Staked", "value": "351.30M", "delta": "-329.39K"},\n    {\n      "label": "6h Activations Burn",\n      "value": "$15.00",\n      "delta": "+`;
    const o = JSON.parse(closeJson(cut));
    expect(o.title).toBe("CREDIT at 75¢, 25% off");
    expect(o.sections[0].finding).toBe("75¢");
    expect(o.metrics[0].value).toBe("351.30M");
  });
  it("drops a key left without a value", () => {
    const o = JSON.parse(closeJson(`{"title": "T", "summary": "S", "body":`));
    expect(o).toEqual({ title: "T", summary: "S" });
  });
  it("leaves complete JSON alone", () => {
    const src = `{"a": [1, 2, {"b": "c\\"d"}], "e": null}`;
    expect(JSON.parse(closeJson(src))).toEqual(JSON.parse(src));
  });
});
