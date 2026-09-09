import { describe, expect, it } from "vitest";
import { isPublicAddress, safeFetchText, vetUrl } from "@/moonlet/safe-fetch";
import { webFetchTool } from "@/moonlet/llm";

describe("egress guard: the model can only make us fetch public hosts", () => {
  it("classifies addresses", () => {
    for (const bad of ["127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::7f00:1"]) expect(isPublicAddress(bad), bad).toBe(false);
    for (const ok of ["1.1.1.1", "8.8.8.8", "140.82.112.3", "2606:4700:4700::1111"]) expect(isPublicAddress(ok), ok).toBe(true);
  });
  it("refuses local, private, credentialed and non-http URLs before any request", async () => {
    for (const u of ["http://localhost:3000/api/cron/tick", "http://127.0.0.1/", "http://[::1]/", "http://10.0.0.5/", "http://169.254.169.254/latest/meta-data", "http://web:3000/", "file:///etc/passwd", "ftp://example.com/", "http://user:pw@example.com/", "http://foo.localhost/", "http://db.internal/"]) {
      await expect(vetUrl(u), u).rejects.toThrow();
    }
  });
  it("re-checks every redirect, so a public page cannot bounce us onto the box", async () => {
    const calls: string[] = [];
    const f = (async (u: string | URL | Request) => {
      calls.push(String(u));
      if (String(u).startsWith("https://example.com/go")) return new Response(null, { status: 302, headers: { location: "http://127.0.0.1:3000/api/cron/tick" } });
      return new Response("hello", { status: 200, headers: { "content-type": "text/plain" } });
    }) as typeof fetch;
    await expect(safeFetchText("https://example.com/go", { fetch: f })).rejects.toThrow(/private or local/);
    expect(calls).toEqual(["https://example.com/go"]);
  });
  it("caps the body while streaming instead of buffering whatever comes back", async () => {
    const big = new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < 200; i++) c.enqueue(new Uint8Array(64 * 1024).fill(97)); c.close(); } });
    const f = (async () => new Response(big, { status: 200, headers: { "content-type": "text/plain" } })) as typeof fetch;
    const r = await safeFetchText("https://example.com/big", { fetch: f, maxBytes: 100_000 });
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(100_000);
  });
  it("the tool reports a refusal as a result the model can read, not a crash", async () => {
    const t = webFetchTool();
    const r = (await (t.execute as (a: unknown) => Promise<{ error?: string }>)({ url: "http://localhost:3000/", maxChars: 1000 })) as { error?: string };
    expect(r.error).toMatch(/local hosts/);
  });
});
