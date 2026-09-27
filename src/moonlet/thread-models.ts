/**
 * Models a thread can run on, cheapest first. Prices are the gateway's per-million-token rates (input / output).
 * `vision` models get screenshots directly; the others get a precise description of the screen written by Gemini Flash,
 * because the gateway refuses image requests to the pricier models unless the balance is several dollars.
 */
export const THREAD_MODELS = [
  { id: "auto", name: "Auto", vendor: "auto", price: "Gemini Flash", vision: true },
  { id: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash", vendor: "google", price: "$0.75 / $3.75", vision: true },
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", vendor: "anthropic", price: "$2 / $10", vision: false },
  { id: "moonshotai/kimi-k3", name: "Kimi K3", vendor: "moonshot", price: "$3 / $15", vision: false },
  { id: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5", vendor: "anthropic", price: "$4 / $20", vision: false },
  { id: "openai/gpt-6-astra", name: "GPT-6 Astra", vendor: "openai", price: "$10 / $50", vision: false },
] as const;

export type ThreadModelId = (typeof THREAD_MODELS)[number]["id"];
export const THREAD_MODEL_IDS = THREAD_MODELS.map((m) => m.id) as readonly string[];
export const VISION_MODEL = "google/gemini-3.8-flash";
export const TITLE_MODEL = "google/gemini-3.8-flash";

export function threadModel(id: string) {
  return THREAD_MODELS.find((m) => m.id === id) ?? THREAD_MODELS[0];
}
