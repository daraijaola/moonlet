const b64u = (s: string) => Buffer.from(s, "utf8").toString("base64url");

/** A stand-in for Google: OAuth token endpoint plus the slice of the Gmail API we use. Remembers writes. */
export function fakeGoogle(opts: { revoked?: boolean } = {}) {
  const log: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
  const labels = [
    { id: "INBOX", name: "INBOX", type: "system" },
    { id: "UNREAD", name: "UNREAD", type: "system" },
    { id: "Label_7", name: "Clients", type: "user" },
  ];
  const messages: Record<string, unknown> = {
    m1: {
      id: "m1", threadId: "t1", labelIds: ["INBOX", "UNREAD"], snippet: "Can you confirm Thursday works for the demo?", internalDate: "1788000000000",
      payload: {
        mimeType: "multipart/alternative",
        headers: [{ name: "From", value: "Yash <yash@orbio.so>" }, { name: "To", value: "micheal@gmail.com" }, { name: "Subject", value: "Demo slot" }, { name: "Message-ID", value: "<abc@mail.orbio.so>" }],
        parts: [
          { mimeType: "text/plain", body: { data: b64u("Hey,\n\nCan you confirm Thursday works for the demo?\n\nYash") } },
          { mimeType: "text/html", body: { data: b64u("<p>Hey,</p><p>Can you confirm Thursday works?</p>") } },
        ],
      },
    },
    m2: {
      id: "m2", threadId: "t2", labelIds: ["INBOX"], snippet: "Your weekly digest", internalDate: "1787990000000",
      payload: {
        mimeType: "multipart/mixed",
        headers: [{ name: "From", value: "Substack <no-reply@substack.com>" }, { name: "Subject", value: "Weekly digest" }],
        parts: [
          { mimeType: "text/html", body: { data: b64u("<html><style>p{}</style><body><h1>Digest</h1><p>Line one &amp; two</p><br><p>Three</p></body></html>") } },
          { mimeType: "application/pdf", filename: "digest.pdf", body: { attachmentId: "att1", size: 1234 } },
        ],
      },
    },
  };
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? (typeof init.body === "string" ? (init.body.startsWith("{") ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body))) : Object.fromEntries(init.body as URLSearchParams)) : undefined;
    log.push({ method, path: url.pathname, body });
    if (url.hostname === "oauth2.googleapis.com") {
      if (body?.grant_type === "refresh_token") {
        if (opts.revoked) return Response.json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, { status: 400 });
        return Response.json({ access_token: "ya29.fresh", expires_in: 3599, scope: "https://www.googleapis.com/auth/gmail.modify openid email" });
      }
      if (body?.code === "nogmail") return Response.json({ access_token: "ya29.x", refresh_token: "1//r", expires_in: 3599, scope: "openid email" });
      return Response.json({ access_token: "ya29.first", refresh_token: "1//refresh", expires_in: 3599, scope: "https://www.googleapis.com/auth/gmail.modify openid email" });
    }
    if (url.hostname !== "gmail.googleapis.com") return new Response("not google", { status: 500 });
    const auth = (init?.headers as Record<string, string>)?.authorization;
    if (!auth || !/^Bearer ya29\./.test(auth)) return Response.json({ error: { message: "Invalid Credentials" } }, { status: 401 });
    const p = url.pathname.replace("/gmail/v1/users/me", "");
    if (p === "/profile") return Response.json({ emailAddress: "Micheal@gmail.com", messagesTotal: 2 });
    if (p === "/messages" && method === "GET") return Response.json({ messages: Object.keys(messages).map((id) => ({ id })), resultSizeEstimate: 2 });
    if (p === "/labels" && method === "GET") return Response.json({ labels });
    if (p === "/labels" && method === "POST") {
      const l = { id: `Label_${labels.length + 1}`, name: body!.name as string, type: "user" };
      labels.push(l);
      return Response.json(l);
    }
    if (p === "/labels/INBOX") return Response.json({ messagesUnread: 1, threadsUnread: 1 });
    if (p.startsWith("/messages/") && p.endsWith("/trash")) return Response.json({ id: p.split("/")[2] });
    if (p === "/messages/batchModify") return new Response(null, { status: 204 });
    if (p === "/messages/send") return Response.json({ id: "sent1", threadId: (body!.threadId as string) ?? "tNew" });
    if (p === "/drafts") return Response.json({ id: "d1", message: { id: "dm1", threadId: (body!.message as { threadId?: string }).threadId ?? "tDraft" } });
    if (p.startsWith("/messages/")) {
      const m = messages[p.split("/")[2]];
      return m ? Response.json(m) : Response.json({ error: { message: "Not Found" } }, { status: 404 });
    }
    if (p.startsWith("/threads/")) return Response.json({ id: "t1", messages: [messages.m1] });
    return Response.json({ error: { message: `unhandled ${p}` } }, { status: 500 });
  };
  return { fetchImpl, log };
}

