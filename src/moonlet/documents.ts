import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

/**
 * Reports as files. The moonlet writes light markdown (headings, bullets,
 * paragraphs); this turns it into a PDF, a Word document, plain text or the
 * markdown itself. Pure JS, no fonts or binaries to install on the host.
 */

export const DOC_FORMATS = ["pdf", "docx", "txt", "md"] as const;
export type DocFormat = (typeof DOC_FORMATS)[number];

export const DOC_MIME: Record<DocFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
};

type Block = { kind: "h1" | "h2" | "bullet" | "para"; text: string };

export function parseBlocks(md: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "para", text: para.join(" ") });
    para = [];
  };
  for (const raw of md.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^#\s+/.test(line)) {
      flush();
      out.push({ kind: "h1", text: line.replace(/^#\s+/, "") });
    } else if (/^#{2,6}\s+/.test(line)) {
      flush();
      out.push({ kind: "h2", text: line.replace(/^#{2,6}\s+/, "") });
    } else if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      flush();
      out.push({ kind: "bullet", text: line.replace(/^\s*([-*•]|\d+[.)])\s+/, "") });
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return out.map((b) => ({ ...b, text: b.text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1") }));
}

export function safeFilename(name: string, format: DocFormat) {
  const base = name.replace(/\.[a-z0-9]+$/i, "").replace(/[^\w\s.-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "report";
  return `${base}.${format}`;
}

export async function renderDocument(input: { format: DocFormat; title: string; content: string; footer?: string }): Promise<Uint8Array> {
  const blocks = parseBlocks(input.content);
  if (input.format === "md") return Buffer.from(`# ${input.title}\n\n${input.content.trim()}\n${input.footer ? `\n---\n${input.footer}\n` : ""}`);
  if (input.format === "txt") {
    const lines = [input.title.toUpperCase(), "=".repeat(Math.min(input.title.length, 72)), ""];
    for (const b of blocks) {
      if (b.kind === "h1") lines.push("", b.text.toUpperCase(), "");
      else if (b.kind === "h2") lines.push("", b.text, "-".repeat(Math.min(b.text.length, 72)));
      else if (b.kind === "bullet") lines.push(`  • ${b.text}`);
      else lines.push(b.text, "");
    }
    if (input.footer) lines.push("", "--", input.footer);
    return Buffer.from(lines.join("\n").replace(/\n{3,}/g, "\n\n"));
  }
  if (input.format === "docx") {
    const children: Paragraph[] = [new Paragraph({ text: input.title, heading: HeadingLevel.TITLE })];
    for (const b of blocks) {
      if (b.kind === "h1") children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_1 }));
      else if (b.kind === "h2") children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_2 }));
      else if (b.kind === "bullet") children.push(new Paragraph({ text: b.text, bullet: { level: 0 } }));
      else children.push(new Paragraph({ children: [new TextRun(b.text)], spacing: { after: 160 } }));
    }
    if (input.footer) children.push(new Paragraph({ children: [new TextRun({ text: input.footer, size: 16, color: "888888" })], alignment: AlignmentType.LEFT, spacing: { before: 400 } }));
    return new Uint8Array(await Packer.toBuffer(new Document({ sections: [{ children }] })));
  }
  return renderPdf(input.title, blocks, input.footer);
}

async function renderPdf(title: string, blocks: Block[], footer?: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer("moonlet");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 56;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const ink = rgb(0.08, 0.09, 0.11), soft = rgb(0.4, 0.4, 0.42);

  const ensure = (need: number) => {
    if (y - need < M) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };
  const wrap = (text: string, font: PDFFont, size: number, width: number) => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= width) cur = next;
      else {
        if (cur) lines.push(cur);
        cur = w;
        while (font.widthOfTextAtSize(cur, size) > width && cur.length > 1) {
          let cut = cur.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(cur.slice(0, cut), size) > width) cut--;
          lines.push(cur.slice(0, cut));
          cur = cur.slice(cut);
        }
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const write = (text: string, font: PDFFont, size: number, opts: { color?: ReturnType<typeof rgb>; indent?: number; gapAfter?: number; bullet?: boolean } = {}) => {
    const indent = opts.indent ?? 0;
    const lines = wrap(clean(text), font, size, W - 2 * M - indent);
    const lh = size * 1.42;
    lines.forEach((line, i) => {
      ensure(lh);
      if (opts.bullet && i === 0) page.drawText("•", { x: M + indent - 12, y: y - size, size, font, color: opts.color ?? ink });
      page.drawText(line, { x: M + indent, y: y - size, size, font, color: opts.color ?? ink });
      y -= lh;
    });
    y -= opts.gapAfter ?? 0;
  };

  write(title, bold, 22, { gapAfter: 14 });
  for (const b of blocks) {
    if (b.kind === "h1") {
      y -= 8;
      write(b.text, bold, 15, { gapAfter: 6 });
    } else if (b.kind === "h2") {
      y -= 4;
      write(b.text, bold, 12.5, { gapAfter: 4 });
    } else if (b.kind === "bullet") write(b.text, regular, 11, { indent: 16, gapAfter: 3, bullet: true });
    else write(b.text, regular, 11, { gapAfter: 9 });
  }
  if (footer) {
    y -= 10;
    write(footer, regular, 9, { color: soft });
  }
  return doc.save();
}

/** Standard PDF fonts cover Latin-1; swap what they can't draw so the layout never throws. */
function clean(s: string) {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}
