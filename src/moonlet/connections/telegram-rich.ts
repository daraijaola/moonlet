import type { RunOutput } from "../spec";

/**
 * Telegram Rich Messages (Bot API 10.2). The rule for every card: the owner reads it on a phone in five seconds, and the
 * full detail is one tap away, never in the way. Fewer words, all the facts.
 *
 *   report      heading (the result) · pull-quote (one or two sentences) · findings as a list with two-word labels ·
 *               full report folded · calls as checkboxes · sources folded · real inline buttons · receipt footer
 *   approval    heading (what it wants to do) · the exact payload as a quotation · Approve / Reject buttons
 *   activation  heading · why · Sign / Not now buttons
 *   decided     one line, plus the read-back as a checkbox list
 *
 * Every block shape here was checked against the live API on 18 Sep 2026; callers fall back to HTML if it ever refuses.
 */

type Rich = string | Rich[] | { type: string; [k: string]: unknown };
export type Block = { type: string; [k: string]: unknown };
export type Keyboard = Array<Array<{ text: string; data?: string; url?: string }>>;

const bold = (t: Rich): Rich => ({ type: "bold", text: t });
const italic = (t: Rich): Rich => ({ type: "italic", text: t });
const code = (t: Rich): Rich => ({ type: "code", text: t });
const link = (t: Rich, url: string): Rich => ({ type: "url", text: t, url });
const ago = (ms: number): Rich => ({ type: "date_time", text: "just now", unix_time: Math.floor(ms / 1000), date_time_format: "r" });
const para = (text: Rich): Block => ({ type: "paragraph", text });
const fold = (summary: Rich, blocks: Block[], open = false): Block => ({ type: "details", summary, blocks, ...(open ? { is_open: true } : {}) });

/** Long hex strings read badly on a phone. */
const short = (s: string) => s.replace(/0x[0-9a-fA-F]{40,64}/g, (h) => `${h.slice(0, 6)}…${h.slice(-4)}`);
/** A headline stays a headline: one line, no trailing period. */
const headline = (s: string) => short(s).replace(/\.$/, "").slice(0, 80);
/** A label the model did not give: the first two meaningful words of the check. */
const labelFor = (check: string, label?: string) => (label?.trim() || check.replace(/[:;,(].*$/, "").split(/\s+/).filter((w) => !/^(the|a|an|and|of|on|in|vs|for|with|to|how|it|its)$/i.test(w)).slice(0, 3).join(" ")).slice(0, 24);

export function reportBlocks(o: RunOutput, ctx: { moonletName: string; page: string; costUsd: number; hashed: boolean; anchoredUrl?: string | null; template: string; at: number }): { blocks: Block[]; keyboard: Keyboard } {
  const blocks: Block[] = [];
  blocks.push({ type: "heading", size: 4, text: headline(o.title) });
  blocks.push({ type: "pullquote", text: short(o.summary).slice(0, 320), credit: [ctx.moonletName, o.signal === "high" ? " · high signal · " : " · ", ago(ctx.at)] });

  const sections = (o.sections ?? []).filter((s) => s.finding?.trim());
  const inboxBody = ctx.template === "inbox" && o.body.trim();
  if (sections.length && !inboxBody) {
    blocks.push({
      type: "list",
      items: sections.slice(0, 6).map((s) => ({ blocks: [para([bold(labelFor(s.check, (s as { label?: string }).label)), s.changed ? "  " : "  ", short(s.finding).slice(0, 240), s.changed ? "" : italic(" · unchanged")])] })),
    });
  }
  const body = o.body.trim();
  if (body && body !== o.summary.trim() && body.length > 40) {
    blocks.push(fold(bold(inboxBody ? "The brief" : "Full report"), [para(short(body.slice(0, 3000)))], !!inboxBody));
  }

  // Calls: what it got right or wrong since last time, and what it commits to now. Identical text is shown once.
  const scored = o.scored ?? [];
  const calls = (o.calls ?? []).filter((c) => !scored.some((s) => s.claim.trim() === c.claim.trim()));
  if (scored.length || calls.length) {
    blocks.push({
      type: "list",
      items: [
        ...scored.map((s) => ({ has_checkbox: true, is_checked: s.result === "hit", blocks: [para([bold(s.result), " · ", short(s.claim).slice(0, 140), ...(s.evidence ? [" ", italic(`(${short(s.evidence).slice(0, 80)})`)] : [])])] })),
        ...calls.map((c) => ({ has_checkbox: true, is_checked: false, blocks: [para([bold("calls"), " · ", short(c.claim).slice(0, 140)])] })),
      ],
    });
  }
  if (o.sources?.length) {
    blocks.push(fold(`Sources · ${o.sources.length}`, [{ type: "list", items: o.sources.slice(0, 8).map((s) => ({ blocks: [para(/^https?:\/\//.test(s) ? link(s.replace(/^https?:\/\/(www\.)?/, "").slice(0, 56), s) : short(s))] })) }]));
  }
  blocks.push({ type: "footer", text: [code(`$${ctx.costUsd.toFixed(3)}`), " · ", ctx.anchoredUrl ? link("anchored", ctx.anchoredUrl) : ctx.hashed ? "hashed" : "unhashed", " · reply to ask ", ctx.moonletName] });
  const keyboard: Keyboard = [[{ text: "Open report", url: ctx.page }, { text: "Fuel it", url: `${ctx.page}#fuel` }]];
  return { blocks, keyboard };
}

/** A draft waiting for the owner. The payload is shown exactly as it will execute; nothing is paraphrased. */
export function approvalBlocks(d: { title: string; body: string }, ctx: { moonletName: string; proposalId: string }): { blocks: Block[]; keyboard: Keyboard } {
  const body = short(d.body).trim();
  const lines = body.split("\n");
  const preview = lines.slice(0, 6).join("\n").slice(0, 600);
  const blocks: Block[] = [
    { type: "heading", size: 4, text: headline(d.title) },
    para([italic(`${ctx.moonletName} drafted this and is waiting for you.`)]),
    { type: "blockquote", blocks: [para(preview)] },
    ...(body.length > preview.length ? [fold("Everything it will send", [para(body.slice(0, 3500))])] : []),
    { type: "footer", text: "Approving executes this once. It asks again next time unless you turn on Autopilot." },
  ];
  return { blocks, keyboard: [[{ text: "✓ Approve", data: `approve:${ctx.proposalId}` }, { text: "✗ Reject", data: `reject:${ctx.proposalId}` }]] };
}

/** The moonlet ran dry and is asking for CREDIT. */
export function activationBlocks(a: { amountUsd: number; reason: string }, ctx: { moonletName: string; proposalId: string; url: string }): { blocks: Block[]; keyboard: Keyboard } {
  return {
    blocks: [
      { type: "heading", size: 4, text: `${ctx.moonletName} is out of fuel` },
      para(short(a.reason)),
      { type: "pullquote", text: [bold(`${a.amountUsd.toFixed(2)} CREDIT`), " → ", `$${a.amountUsd.toFixed(2)} of runs`], credit: "you sign it, the chain proves it" },
      { type: "footer", text: "Your wallet burns the CREDIT into your own AI balance. Moonlet never touches your tokens." },
    ],
    keyboard: [[{ text: "Sign in wallet", url: ctx.url }, { text: "Not now", data: `reject:${ctx.proposalId}` }]],
  };
}

/** After the owner decided: one line, and the read-back as ticks. */
export function decidedBlocks(d: { title: string }, r: { status: string; url?: string; verification?: { status: string; scope?: string; checks: Array<{ ok: boolean; field: string; expected?: string; actual?: string }> } | null; error?: string; extra?: string }): Block[] {
  const v = r.verification;
  const head = r.status === "rejected" ? "✗ Rejected. Nothing happened." : r.status === "executed" ? (v?.status === "mismatch" ? "⚠ Happened, but not as approved" : "✓ Done") : r.status === "uncertain" ? "⚠ Approved, but the provider didn't answer" : `⚠ Approved, but it failed`;
  const blocks: Block[] = [{ type: "heading", size: 5, text: [head, " · ", headline(d.title)] }];
  if (r.extra) blocks.push(para(short(r.extra)));
  if (v?.checks?.length) {
    blocks.push({
      type: "list",
      items: v.checks.slice(0, 8).map((c) => ({ has_checkbox: true, is_checked: c.ok, blocks: [para(c.ok ? c.field : [c.field, italic(c.expected ? ` · approved “${short(c.expected).slice(0, 60)}”, found “${short(c.actual ?? "").slice(0, 60)}”` : " · differs")])] })),
    });
    blocks.push({ type: "footer", text: [`Read back from the provider${v.scope === "sample" ? " (sample)" : ""}: ${v.checks.filter((c) => c.ok).length}/${v.checks.length} fields match`, ...(r.url ? [" · ", link("open", r.url)] : [])] });
  } else if (r.url) blocks.push({ type: "footer", text: link("open", r.url) });
  if (r.error) blocks.push(para(italic(short(r.error).slice(0, 300))));
  return blocks;
}
