import { runLoop } from "./llm";

/**
 * Voice notes → text, through the owner's own key. One cheap multimodal call
 * (Gemini Flash reads audio natively, ~$0.0002 a note); no third-party speech
 * API, no audio stored. The text comes back for the owner to read and edit
 * before anything is sent, so a mishearing never becomes an action.
 */

export const AUDIO_FORMATS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/aac": "aac",
  "audio/flac": "flac",
};
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

export async function transcribe(key: string, audio: { bytes: Uint8Array; mime: string }, fetchImpl?: typeof fetch) {
  const format = AUDIO_FORMATS[audio.mime.split(";")[0].trim().toLowerCase()];
  if (!format) throw new Error(`unsupported audio type ${audio.mime}`);
  if (audio.bytes.byteLength > MAX_AUDIO_BYTES) throw new Error("recording too long; keep it under a minute");
  const r = await runLoop({
    key,
    model: "google/gemini-3.8-flash",
    instructions: "You transcribe short voice notes. Return only the words spoken, in the speaker's language, with normal punctuation; no quotes, no labels, no commentary. Numbers as digits, ticker symbols in caps ($ORBIO). If there is no intelligible speech, return an empty string.",
    input: [{ type: "text", text: "Transcribe this voice note." }, { type: "input_audio", input_audio: { data: Buffer.from(audio.bytes).toString("base64"), format } }],
    maxCostUsd: 0.01,
    maxSteps: 1,
    fetch: fetchImpl,
  });
  const text = r.text.trim().replace(/^\[.*?\]$/s, "").trim();
  return { text, costUsd: r.costUsd };
}
