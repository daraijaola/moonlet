import { describe, expect, it } from "vitest";
import { probeToken } from "../src/moonlet/connections/github";

const conn = { token: "gho_test", login: "x" };
const respond = (seq: Array<[number, string]>) => {
  let i = 0;
  return (async () => { const [status, body] = seq[Math.min(i++, seq.length - 1)]; return new Response(body, { status }); }) as unknown as typeof fetch;
};

describe("probeToken", () => {
  it("is alive on 2xx", async () => { expect(await probeToken(conn, respond([[200, "{}"]]))).toBe("alive"); });
  it("does not condemn a single 401", async () => { expect(await probeToken(conn, respond([[401, '{"message":"Bad credentials"}'], [200, "{}"]]))).toBe("alive"); });
  it("condemns two Bad credentials in a row", async () => { expect(await probeToken(conn, respond([[401, '{"message":"Bad credentials"}']]))).toBe("revoked"); });
  it("treats 5xx, 403 and network errors as unknown", async () => {
    expect(await probeToken(conn, respond([[502, "bad gateway"]]))).toBe("unknown");
    expect(await probeToken(conn, respond([[403, '{"message":"API rate limit exceeded"}']]))).toBe("unknown");
    expect(await probeToken(conn, (async () => { throw new Error("net"); }) as unknown as typeof fetch)).toBe("unknown");
  });
});
