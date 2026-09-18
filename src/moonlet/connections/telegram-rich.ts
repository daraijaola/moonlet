import type { RunOutput } from "../spec";

/**
 * A report as a Telegram Rich Message (Bot API 10.2, July 2026): real blocks instead of a wall of bold. Headline, a
 * pull-quote for the one-line summary, a compact table for the per-check findings, an expandable details block for the
 * long body, the calls as a checkbox list, and a footer with the receipt. Buttons live in the text, so the page link is a
 * button, not a pasted URL. Callers fall back to the HTML message when the API refuses (older server, group without rights).
 */

type Rich = string | Rich[] | { type: string; [k: string]: unknown };
type Block = { type: string; [k: string]: unknown };

const bold = (t: Rich): Rich => ({ type: "bold", text: t });
const italic = (t: Rich): Rich => ({ type: "italic", text: t });
const code = (t: Rich): Rich => ({ type: "code", text: t });
const link = (t: Rich, url: string): Rich => ({ type: "url", text: t, url });
const when = (unix: number): Rich => ({ type: "date_time", text: new Date(unix * 1000).toISOString(), unix_time: unix, date_time_format: "r" });

/** Long hex strings read badly on a phone; shorten them the way the web pages do. */
const short = (s: string) => s.replace(/0x[0-9a-fA-F]{40,64}/g, (h) => `${h.slice(0, 6)}…${h.slice(-4)}`);

export function reportBlocks(o: RunOutput, ctx: { moonletName: string; moonletId: string; page: string; costUsd: number; hashed: boolean; anchoredUrl?: string | null; template: string; at: number }): Block[] {
  const blocks: Block[] = [];
  blocks.push({ type: "heading", size: 3, text: [ctx.moonletName, " · ", short(o.title)] });
  if (o.signal === "high") blocks.push({ type: "paragraph", text: [{ type: "marked", text: "high signal" }] });
  blocks.push({ type: "pullquote", text: short(o.summary), credit: [ctx.moonletName, ", ", when(Math.floor(ctx.at / 1000))] });

  const sections = (o.sections ?? []).filter((s) => s.finding?.trim());
  const inboxBody = ctx.template === "inbox" && o.body.trim();
  if (sections.length && !inboxBody) {
    blocks.push({
      type: "table",
      is_compact: true,
      is_striped: true,
      cells: [
        [{ text: bold("check"), is_header: true, align: "left" }, { text: bold("finding"), is_header: true, align: "left" }],
        ...sections.slice(0, 8).map((s) => [{ text: [s.changed ? "● " : "○ ", short(s.check)], align: "left", valign: "top" }, { text: short(s.finding), align: "left", valign: "top" }]),
      ],
      caption: italic("● changed since last run · ○ unchanged"),
    });
  }
  const body = o.body.trim();
  if (body && body !== o.summary.trim()) {
    blocks.push({ type: "details", summary: bold(inboxBody ? "The full brief" : "Read the full report"), is_open: !!inboxBody, blocks: [{ type: "paragraph", text: short(body.slice(0, 3000)) }] });
  }

  const scored = o.scored ?? [], calls = o.calls ?? [];
  if (scored.length || calls.length) {
    blocks.push({ type: "heading", size: 5, text: "Calls" });
    blocks.push({
      type: "list",
      items: [
        ...scored.map((s) => ({ has_checkbox: true, is_checked: s.result === "hit", blocks: [{ type: "paragraph", text: [bold(s.result === "hit" ? "hit" : s.result === "miss" ? "miss" : "void"), " · ", short(s.claim), ...(s.evidence ? [" ", italic(`(${short(s.evidence)})`)] : [])] }] })),
        ...calls.map((c) => ({ has_checkbox: true, is_checked: false, blocks: [{ type: "paragraph", text: [bold("calls it"), " · ", short(c.claim), " ", italic("(scored next run)")] }] })),
      ],
    });
  }

  if (o.sources?.length) {
    blocks.push({ type: "details", summary: `Sources (${o.sources.length})`, blocks: [{ type: "list", items: o.sources.slice(0, 8).map((s) => ({ blocks: [{ type: "paragraph", text: /^https?:\/\//.test(s) ? link(s.replace(/^https?:\/\//, "").slice(0, 60), s) : short(s) }] })) }] });
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "paragraph",
    text: [
      { type: "button", button: { text: "Open report", url: ctx.page, style: "primary" } },
      "  ",
      { type: "button", button: { text: "Ask about it", callback_data: `ask:${ctx.moonletId}`, style: "link" } },
      "  ",
      { type: "button", button: { text: "Fuel it", url: `${ctx.page}#fuel`, style: "link" } },
    ],
  });
  blocks.push({ type: "footer", text: [code(`$${ctx.costUsd.toFixed(4)}`), " · ", ctx.anchoredUrl ? link("anchored on Robinhood Chain", ctx.anchoredUrl) : ctx.hashed ? "hashed" : "unhashed", " · reply to this message to ask ", ctx.moonletName, " anything"] });
  return blocks;
}
