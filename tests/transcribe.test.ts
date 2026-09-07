import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { transcribe, AUDIO_FORMATS, MAX_AUDIO_BYTES } from "@/moonlet/transcribe";

const KEY = process.env.OPENROUTER_API_KEY!;

describe("voice notes → text", () => {
  it("refuses what it can't read before spending anything", async () => {
    await expect(transcribe("sk-x", { bytes: new Uint8Array(10), mime: "video/mp4" })).rejects.toThrow(/unsupported audio type/);
    await expect(transcribe("sk-x", { bytes: new Uint8Array(MAX_AUDIO_BYTES + 1), mime: "audio/webm" })).rejects.toThrow(/too long/);
    expect(AUDIO_FORMATS["audio/webm"]).toBe("webm");
  });

  it("real model: a browser-style webm/opus note comes back as the words spoken, for well under a cent", async () => {
    if (!KEY) throw new Error("OPENROUTER_API_KEY required");
    const bytes = new Uint8Array(readFileSync("tests/fixtures/voice-note.webm"));
    const r = await transcribe(KEY, { bytes, mime: "audio/webm;codecs=opus" });
    console.log("transcript:", JSON.stringify(r.text), "cost", r.costUsd);
    expect(r.text.toLowerCase()).toMatch(/reply to yash/);
    expect(r.text.toLowerCase()).toMatch(/thursday/);
    expect(r.costUsd).toBeLessThan(0.005);
  }, 60_000);
});
