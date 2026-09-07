import type { ReactNode } from "react";

/**
 * The small markdown a moonlet writes: headings, bullets, bold, links, and
 * paragraphs. Nothing else, no raw HTML, so a model can never inject markup.
 * Links open in a new tab; only http(s) and mailto survive.
 */

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\((\S+?)\)|\*\*([^*]+)\*\*|`([^`]+)`|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1] !== undefined) out.push(SAFE_HREF.test(m[2]) ? <a key={k} href={m[2]} target="_blank" rel="noopener noreferrer" className="underline decoration-ink/40 underline-offset-2 hover:decoration-ink">{m[1]}</a> : m[1]);
    else if (m[3] !== undefined) out.push(<strong key={k} className="font-semibold text-ink">{m[3]}</strong>);
    else if (m[4] !== undefined) out.push(<code key={k} className="rounded bg-ink/[0.06] px-1 font-mono text-[12px]">{m[4]}</code>);
    else if (m[5] !== undefined) out.push(<a key={k} href={m[5]} target="_blank" rel="noopener noreferrer" className="underline decoration-ink/40 underline-offset-2 hover:decoration-ink [overflow-wrap:anywhere]">{m[5].replace(/^https?:\/\//, "").slice(0, 60)}{m[5].replace(/^https?:\/\//, "").length > 60 ? "…" : ""}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function LightMarkdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [], list: string[] = [], ordered = false;
  const flush = () => {
    if (para.length) {
      blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(" "), `p${blocks.length}`)}</p>);
      para = [];
    }
    if (list.length) {
      const items = list.map((l, i) => <li key={i}>{inline(l, `l${blocks.length}-${i}`)}</li>);
      blocks.push(ordered ? <ol key={`o${blocks.length}`} className="list-decimal space-y-1 pl-5">{items}</ol> : <ul key={`u${blocks.length}`} className="list-disc space-y-1 pl-5">{items}</ul>);
      list = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (!line.trim()) { flush(); continue; }
    if (h) {
      flush();
      const Tag = h[1].length === 1 ? "h3" : "h4";
      blocks.push(<Tag key={`h${blocks.length}`} className={`${h[1].length === 1 ? "text-[14px]" : "text-[13px]"} font-semibold tracking-[-0.01em] text-ink ${blocks.length ? "pt-2" : ""}`}>{inline(h[2].replace(/\*\*/g, ""), `h${blocks.length}`)}</Tag>);
      continue;
    }
    if (li) {
      if (para.length) flush();
      const isOrdered = /^\s*\d/.test(line);
      if (list.length && isOrdered !== ordered) flush();
      ordered = isOrdered;
      list.push(li[1]);
      continue;
    }
    if (list.length) flush();
    para.push(line.trim());
  }
  flush();
  return <div className={`space-y-2 [overflow-wrap:anywhere] ${className ?? ""}`}>{blocks}</div>;
}

