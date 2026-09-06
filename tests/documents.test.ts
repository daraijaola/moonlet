import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { parseBlocks, renderDocument, safeFilename } from "@/moonlet/documents";
import * as store from "@/moonlet/store";
import { buildTools } from "@/moonlet/tools";
import { fileSink } from "@/moonlet/files";
import type { LocalTool } from "@/moonlet/llm";

const OWNER = "0x00000000000000000000000000000000000000d1";
const REPORT = `# Wallet 0x8366 · daily\n\nHolds 20.7M ORBIO, moved 217k out in two transfers.\n\n## Transfers\n- 138,157 ORBIO to 0x8876…0904\n- 79,430 ORBIO to 0x39b3…be5f\n\nNo inbound. Balance vs last run: −0.9%.`;
const call = (t: LocalTool, a: unknown) => (t.execute as (a: unknown) => Promise<Record<string, unknown>>)(a);

describe("documents", () => {
  it("parses light markdown into blocks", () => {
    const b = parseBlocks(REPORT);
    expect(b.map((x) => x.kind)).toEqual(["h1", "para", "h2", "bullet", "bullet", "para"]);
    expect(b[3].text).toBe("138,157 ORBIO to 0x8876…0904");
  });

  it("renders a real PDF, a real DOCX, plain text and markdown", async () => {
    const pdf = await renderDocument({ format: "pdf", title: "Wallet report", content: REPORT, footer: "written by a moonlet" });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(800);
    const docx = await renderDocument({ format: "docx", title: "Wallet report", content: REPORT });
    expect(Buffer.from(docx.slice(0, 2)).toString()).toBe("PK");
    const txt = Buffer.from(await renderDocument({ format: "txt", title: "Wallet report", content: REPORT })).toString();
    expect(txt).toMatch(/^WALLET REPORT\n=+\n/);
    expect(txt).toContain("  • 138,157 ORBIO to 0x8876…0904");
    const md = Buffer.from(await renderDocument({ format: "md", title: "Wallet report", content: REPORT })).toString();
    expect(md.startsWith("# Wallet report\n\n# Wallet 0x8366")).toBe(true);
  });

  it("a very long report paginates instead of throwing", async () => {
    const long = Array.from({ length: 120 }, (_, i) => `- line ${i}: ${"word ".repeat(30)}`).join("\n");
    const pdf = await renderDocument({ format: "pdf", title: "Long", content: long });
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(3);
  });

  it("filenames are safe and carry the format", () => {
    expect(safeFilename("Wallet 0x8366 · daily / report!", "pdf")).toBe("Wallet-0x8366-daily-report.pdf");
    expect(safeFilename("", "docx")).toBe("report.docx");
    expect(safeFilename("notes.txt", "md")).toBe("notes.md");
  });
});

describe("write_document tool + file store", () => {
  beforeAll(async () => {
    rmSync("/tmp/moonlet-files.db", { force: true });
    process.env.DATABASE_URL = "file:/tmp/moonlet-files.db";
    process.env.SECRET_KEY = "test";
    delete process.env.TELEGRAM_BOT_TOKEN;
    await store.migrate();
  });

  it("is only offered with a file sink; writes once; the file is stored on the run and listed for it", async () => {
    expect(buildTools(["write_document"], { delivery: {} }).tools).toHaveLength(0);
    const sink = fileSink({ owner: OWNER, moonletId: "m_doc", runId: "run_doc1" });
    const built = buildTools(["write_document"], { delivery: {}, files: sink });
    const t = built.tools.find((x) => x.name === "write_document")!;
    const r = await call(t, { format: "pdf", title: "Wallet 0x8366 daily", content: REPORT });
    expect(r.written).toBe(true);
    expect(r.file).toBe("Wallet-0x8366-daily.pdf");
    expect(r.sentTo).toEqual(["moonlet page"]);
    const again = await call(t, { format: "txt", title: "Again", content: REPORT });
    expect(again.error).toMatch(/already wrote/);

    const files = await store.filesForRuns(["run_doc1", "run_other"]);
    expect(files.run_doc1).toHaveLength(1);
    expect(files.run_doc1[0]).toMatchObject({ name: "Wallet-0x8366-daily.pdf", mime: "application/pdf", owner: OWNER, runId: "run_doc1" });
    const f = await store.getFile(files.run_doc1[0].id);
    expect(Buffer.from(f!.bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(f!.size).toBe(f!.bytes.byteLength);
  });

  it("pushes a copy to Telegram as a document when the chat is linked", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    const uploads: Array<{ name: string; type: string; caption: string | null }> = [];
    const fake: typeof fetch = async (url, init) => {
      if (String(url).endsWith("/sendDocument")) {
        const form = init!.body as FormData;
        const doc = form.get("document") as File;
        uploads.push({ name: doc.name, type: doc.type, caption: form.get("caption") as string | null });
        return new Response(JSON.stringify({ ok: true, result: { message_id: 501 } }), { headers: { "content-type": "application/json" } });
      }
      return new Response("nope", { status: 404 });
    };
    try {
      const sink = fileSink({ owner: OWNER, moonletId: "m_doc", runId: "run_doc2", chatId: "4242", fetch: fake });
      const built = buildTools(["write_document"], { delivery: {}, files: sink });
      const r = await call(built.tools[0], { format: "docx", title: "Weekly digest", content: REPORT });
      expect(r.sentTo).toEqual(["moonlet page", "telegram"]);
      expect(uploads).toEqual([{ name: "Weekly-digest.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", caption: "<b>Weekly digest</b>" }]);
      expect(await store.telegramMessageRef("4242", 501)).toEqual({ moonletId: "m_doc", runId: "run_doc2" });
    } finally {
      delete process.env.TELEGRAM_BOT_TOKEN;
    }
  });
});
