"use client";

import { Check, Mic } from "lucide-react";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Speak instead of typing. Tap the mic and the composer row becomes
 * × · live waveform · timer · ✓. While you talk, the words appear in the box
 * (the recording so far is transcribed every couple of seconds); ✓ keeps them,
 * × throws them away. Nothing is sent until you press Ask, so a misheard word
 * never becomes an action. Capped at 60 s. Hidden where there is no microphone API.
 */

const MAX_SECONDS = 60;
const LIVE_EVERY_MS = 2500;

function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (MediaRecorder.isTypeSupported(t)) return t;
  return null;
}

export function useVoiceSupported() {
  return useSyncExternalStore(() => () => {}, () => !!navigator.mediaDevices?.getUserMedia && !!pickMime(), () => false);
}

export function MicButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-label="Speak instead of typing" title="Speak" className="ui-btn ui-btn-icon h-[38px] w-[38px] shrink-0 rounded-lg text-ink-soft">
      <Mic size={16} strokeWidth={1.75} />
    </button>
  );
}

/**
 * The recording row. Mounted when the owner taps the mic; unmounts itself through onDone / onCancel.
 * `onLive(text)` streams the transcript so far into the composer; `onDone(text)` is the final pass.
 */
export function VoiceRecorder({ transcribe, onLive, onDone, onCancel }: { transcribe: (blob: Blob) => Promise<{ text: string }>; onLive: (text: string) => void; onDone: (text: string) => void; onCancel: () => void }) {
  const [seconds, setSeconds] = useState(0);
  const [phase, setPhase] = useState<"starting" | "recording" | "finishing">("starting");
  const [err, setErr] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const finishing = useRef<"keep" | "discard" | null>(null);
  const liveBusy = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null, raf = 0, timer: ReturnType<typeof setInterval> | null = null, live: ReturnType<typeof setInterval> | null = null, ctx: AudioContext | null = null;
    const bars = new Array(48).fill(0.05);
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setErr("Microphone blocked. Allow it in the address bar and try again.");
        return;
      }
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      const mime = pickMime()!;
      const r = new MediaRecorder(stream, { mimeType: mime });
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = async () => {
        stream?.getTracks().forEach((t) => t.stop());
        if (finishing.current !== "keep") { onCancel(); return; }
        const blob = new Blob(chunks.current, { type: mime.split(";")[0] });
        if (blob.size < 1200) { onCancel(); return; }
        try {
          const { text } = await transcribe(blob);
          onDone(text);
        } catch (e) {
          setErr((e as Error).message);
          setPhase("recording");
          finishing.current = null;
        }
      };
      rec.current = r;
      r.start(250);
      setPhase("recording");
      const t0 = Date.now();
      timer = setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        setSeconds(s);
        if (s >= MAX_SECONDS && r.state === "recording") { finishing.current = "keep"; setPhase("finishing"); r.stop(); }
      }, 250);
      // live words: transcribe everything so far, replace the draft
      live = setInterval(async () => {
        if (liveBusy.current || r.state !== "recording" || chunks.current.length < 4) return;
        liveBusy.current = true;
        try {
          const { text } = await transcribe(new Blob(chunks.current, { type: mime.split(";")[0] }));
          if (text && r.state === "recording") onLive(text);
        } catch {
          /* live preview is best-effort; the final pass reports errors */
        }
        liveBusy.current = false;
      }, LIVE_EVERY_MS);
      // waveform
      ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      const draw = () => {
        const c = canvas.current;
        if (!c) return;
        const g = c.getContext("2d")!;
        an.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += (v - 128) ** 2;
        const rms = Math.sqrt(sum / data.length) / 128;
        bars.push(Math.min(1, 0.05 + rms * 3));
        bars.shift();
        const W = c.width, H = c.height, bw = W / bars.length;
        g.clearRect(0, 0, W, H);
        g.fillStyle = getComputedStyle(c).color;
        bars.forEach((b, i) => { const h = Math.max(2, b * H); g.fillRect(i * bw + 1, (H - h) / 2, bw - 2, h); });
        raf = requestAnimationFrame(draw);
      };
      draw();
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (timer) clearInterval(timer);
      if (live) clearInterval(live);
      ctx?.close().catch(() => undefined);
      if (rec.current && rec.current.state !== "inactive") { finishing.current ??= "discard"; rec.current.stop(); }
      else stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = (how: "keep" | "discard") => {
    finishing.current = how;
    setPhase("finishing");
    const r = rec.current;
    if (r && r.state !== "inactive") r.stop();
    else if (how === "discard") onCancel();
  };

  const mm = String(Math.floor(seconds / 60)), ss = String(seconds % 60).padStart(2, "0");
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <button type="button" onClick={() => finish("discard")} aria-label="Discard recording" className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-md border border-ink/15 bg-white text-ink-soft hover:border-ink/40 hover:text-ink">×</button>
      <div className="flex h-[38px] min-w-0 flex-1 items-center gap-3 rounded-md border border-ink/15 bg-paper px-3">
        {err ? (
          <span className="truncate font-mono text-[11.5px] text-red-800">{err}</span>
        ) : (
          <>
            <canvas ref={canvas} width={480} height={26} className="h-[26px] min-w-0 flex-1 text-ink/70" aria-hidden />
            <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-soft">{phase === "finishing" ? "…" : `${mm}:${ss}`}</span>
          </>
        )}
      </div>
      <button type="button" onClick={() => finish("keep")} disabled={phase !== "recording"} aria-label="Keep recording" className="ui-btn ui-btn-primary ui-btn-icon h-[38px] w-[38px] shrink-0 rounded-lg"><Check size={16} strokeWidth={2.2} /></button>
    </div>
  );
}
