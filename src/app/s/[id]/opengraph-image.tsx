import { ImageResponse } from "next/og";
import { TEMPLATES, fmtBag, getMoonlet, shortAddr } from "@/lib/mock";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = getMoonlet(id);
  const name = m?.name ?? "moonlet";
  const job = m?.job ?? "Your bag runs an agent.";
  const meta = m ? `${TEMPLATES[m.template].name} · orbits ${shortAddr(m.owner)} · ${fmtBag(m.bag)} $ORBIO` : "";
  const alive = m ? m.status === "running" || m.status === "idle" : false;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#f7f4ee",
          color: "#15161d",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26 }}>
          <div style={{ width: 16, height: 16, borderRadius: 999, background: alive ? "#4f7a5a" : "#b5ad9d" }} />
          <div style={{ display: "flex", color: "#66635b" }}>{alive ? "alive · a moonlet" : "quiet · a moonlet"}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 132, fontWeight: 800, letterSpacing: -6, lineHeight: 0.9, textTransform: "uppercase" }}>{name}</div>
          <div style={{ display: "flex", fontSize: 36, lineHeight: 1.3, maxWidth: 980 }}>{`“${job}”`}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#66635b" }}>
          <div style={{ display: "flex" }}>{meta}</div>
          <div style={{ display: "flex" }}>every run anchored on Robinhood Chain</div>
        </div>
      </div>
    ),
    size,
  );
}
