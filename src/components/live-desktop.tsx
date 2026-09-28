"use client";

import { useEffect, useRef, useState } from "react";

type Rfb = { viewOnly: boolean; scaleViewport: boolean; resizeSession: boolean; background: string; disconnect: () => void; addEventListener: (t: string, f: () => void) => void; focus: () => void };

/** The computer's screen over noVNC. View-only unless `control` is on. Calls onFail when the stream can't open, so the caller can fall back to screenshots. */
export function LiveDesktop({ threadId, control, onFail, fill = false }: { threadId: string; control: boolean; onFail: () => void; fill?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const rfb = useRef<Rfb | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await fetch(`/api/threads/${threadId}/vnc`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const { path } = (await r.json()) as { path: string };
        const { default: RFB } = await import("@novnc/novnc");
        if (dead || !box.current) return;
        const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path}`;
        const c = new RFB(box.current, url, { wsProtocols: ["binary"] }) as unknown as Rfb;
        c.scaleViewport = true;
        c.resizeSession = false;
        c.viewOnly = true;
        c.background = "transparent";
        c.addEventListener("connect", () => setReady(true));
        c.addEventListener("disconnect", () => { if (!dead) onFail(); });
        rfb.current = c;
      } catch {
        if (!dead) onFail();
      }
    })();
    return () => {
      dead = true;
      rfb.current?.disconnect();
      rfb.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    if (!rfb.current) return;
    rfb.current.viewOnly = !control;
    if (control) rfb.current.focus();
  }, [control, ready]);

  return (
    <div className={`relative w-full overflow-hidden rounded-lg border bg-night ${fill ? "h-full" : "aspect-[16/10]"} ${control ? "border-gold ring-2 ring-gold/40" : "border-ink/[0.08]"}`}>
      <div ref={box} className={`absolute inset-0 ${control ? "" : "pointer-events-none"}`} />
      {!ready && <div className="absolute inset-0 flex items-center justify-center text-[12px] text-cream/60">Connecting…</div>}
    </div>
  );
}
