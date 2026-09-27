import type { ReactNode } from "react";

/**
 * Markdown for thread replies: headings, paragraphs, bullet and numbered lists (one level of nesting), tables,
 * fenced code, quotes, rules, and inline bold, italic, code and links. No raw HTML, so a model can't inject markup;
 * only http(s) and mailto links survive.
 */

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\((\S+?)\)|\*\*([^*]+)\*\*|__([^_]+)__|(?<![\w*])\*([^*\n]+)\*(?![\w*])|`([^`]+)`|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1] !== undefined) out.push(SAFE_HREF.test(m[2]) ? <a key={k} href={m[2]} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink">{inline(m[1], k)}</a> : m[1]);
    else if (m[3] !== undefined || m[4] !== undefined) out.push(<strong key={k} className="font-semibold text-ink">{inline(m[3] ?? m[4], k)}</strong>);
    else if (m[5] !== undefined) out.push(<em key={k}>{m[5]}</em>);
    else if (m[6] !== undefined) out.push(<code key={k} className="rounded-[4px] bg-ink/[0.06] px-1 py-px font-mono text-[12.5px] text-ink">{m[6]}</code>);
    else if (m[7] !== undefined) out.push(<a key={k} href={m[7]} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink [overflow-wrap:anywhere]">{m[7].replace(/^https?:\/\//, "").slice(0, 64)}{m[7].replace(/^https?:\/\//, "").length > 64 ? "…" : ""}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isRule = (row: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(row);

export function ThreadMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  const key = () => `b${blocks.length}`;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = /^\s*```(\w*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push(<pre key={key()} className="overflow-x-auto rounded-lg border border-ink/[0.08] bg-paper px-3 py-2.5 font-mono text-[12.5px] leading-[1.55] text-ink [scrollbar-width:thin]">{body.join("\n")}</pre>);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      blocks.push(<p key={key()} className={`font-semibold tracking-[-0.01em] text-ink ${level <= 2 ? "text-[15px]" : "text-[14px]"} ${blocks.length ? "pt-1.5" : ""}`}>{inline(h[2].replace(/\*\*/g, ""), key())}</p>);
      i++;
      continue;
    }
    if (/^\s*(?:-\s*){3,}$|^\s*(?:\*\s*){3,}$|^\s*(?:_\s*){3,}$/.test(line)) {
      blocks.push(<hr key={key()} className="border-ink/[0.08]" />);
      i++;
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && isRule(lines[i + 1])) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      blocks.push(
        <div key={key()} className="overflow-x-auto rounded-lg border border-ink/[0.08] [scrollbar-width:thin]">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="bg-paper">
              <tr>{head.map((c, j) => <th key={j} className="whitespace-nowrap border-b border-ink/[0.08] px-3 py-2 font-medium text-ink">{inline(c, `${key()}h${j}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-ink/[0.05] last:border-0">
                  {head.map((_, j) => <td key={j} className="whitespace-nowrap px-3 py-1.5 align-top text-ink-soft">{inline(r[j] ?? "", `${key()}r${ri}c${j}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*>/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push(<blockquote key={key()} className="border-l-2 border-ink/[0.12] pl-3 text-ink-soft">{inline(q.join(" "), key())}</blockquote>);
      continue;
    }
    const item = /^(\s*)(?:[-*•]|(\d+)[.)])\s+(.*)$/;
    if (item.test(line)) {
      const ordered = !!item.exec(line)![2];
      const items: Array<{ text: string; sub: string[] }> = [];
      while (i < lines.length) {
        const m = item.exec(lines[i]);
        if (m && m[1].length < 2 && !!m[2] !== ordered) break;
        if (m && m[1].length < 2) items.push({ text: m[3], sub: [] });
        else if (m && items.length) items[items.length - 1].sub.push(m[3]);
        else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) items[items.length - 1].text += ` ${lines[i].trim()}`;
        else break;
        i++;
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={key()} className={`space-y-1 pl-5 ${ordered ? "list-decimal" : "list-disc"} marker:text-ink-faint`}>
          {items.map((it, j) => (
            <li key={j} className="pl-0.5">
              {inline(it.text, `${key()}i${j}`)}
              {it.sub.length > 0 && <ul className="mt-1 list-[circle] space-y-0.5 pl-5 marker:text-ink-faint">{it.sub.map((s, k) => <li key={k}>{inline(s, `${key()}i${j}s${k}`)}</li>)}</ul>}
            </li>
          ))}
        </Tag>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*```|\s*>|\s*(?:[-*•]|\d+[.)])\s)/.test(lines[i]) && !(lines[i].includes("|") && i + 1 < lines.length && isRule(lines[i + 1]))) para.push(lines[i++].trim());
    blocks.push(<p key={key()}>{para.flatMap((p, j) => (j ? [<br key={`br${j}`} />, ...inline(p, `${key()}p${j}`)] : inline(p, `${key()}p${j}`)))}</p>);
  }
  return <div className="space-y-3 [overflow-wrap:anywhere]">{blocks}</div>;
}
