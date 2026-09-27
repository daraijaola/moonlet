import { randomBytes } from "node:crypto";
import { db, migrate, newId } from "./store";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type ThreadStatus = "idle" | "working" | "stopping" | "failed";
export type ThreadRow = { id: string; owner: string; title: string; model: string; effort: Effort; machine: "standard" | "large"; status: ThreadStatus; spentUsd: number; createdAt: number; updatedAt: number };
export type MessageRow = { id: string; threadId: string; role: "user" | "moonlet"; text: string; files: string[]; model: string | null; ms: number | null; costUsd: number | null; createdAt: number };
export type StepRow = { id: string; threadId: string; messageId: string | null; tool: string; summary: string; detail: string | null; shot: string | null; ok: boolean; ms: number | null; createdAt: number };

let ready: Promise<void> | null = null;
function ensure() {
  ready ??= (async () => {
    await migrate();
    const c = db();
    await c.execute(`CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, model TEXT NOT NULL, effort TEXT NOT NULL, machine TEXT NOT NULL, status TEXT NOT NULL, spent_usd REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
    await c.execute(`CREATE INDEX IF NOT EXISTS threads_owner ON threads(owner, updated_at DESC)`);
    await c.execute(`CREATE TABLE IF NOT EXISTS thread_messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, files TEXT NOT NULL DEFAULT '[]', model TEXT, ms INTEGER, created_at INTEGER NOT NULL)`);
    await c.execute(`CREATE INDEX IF NOT EXISTS thread_messages_thread ON thread_messages(thread_id, created_at)`);
    await c.execute(`CREATE TABLE IF NOT EXISTS thread_steps (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, message_id TEXT, tool TEXT NOT NULL, summary TEXT NOT NULL, detail TEXT, shot TEXT, ok INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL)`);
    await c.execute(`CREATE INDEX IF NOT EXISTS thread_steps_thread ON thread_steps(thread_id, created_at)`);
    await c.execute(`ALTER TABLE thread_messages ADD COLUMN cost_usd REAL`).catch(() => undefined);
    await c.execute(`ALTER TABLE thread_steps ADD COLUMN ms INTEGER`).catch(() => undefined);
  })();
  return ready;
}

const thread = (r: Record<string, unknown>): ThreadRow => ({
  id: r.id as string,
  owner: r.owner as string,
  title: r.title as string,
  model: r.model as string,
  effort: r.effort as Effort,
  machine: r.machine as ThreadRow["machine"],
  status: r.status as ThreadStatus,
  spentUsd: Number(r.spent_usd),
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
});

export async function createThread(t: Pick<ThreadRow, "owner" | "title" | "model" | "effort" | "machine">) {
  await ensure();
  const now = Date.now();
  const id = `th-${randomBytes(8).toString("hex")}`;
  await db().execute({ sql: `INSERT INTO threads(id,owner,title,model,effort,machine,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`, args: [id, t.owner, t.title, t.model, t.effort, t.machine, "idle", now, now] });
  return id;
}

export async function getThread(id: string) {
  await ensure();
  const r = await db().execute({ sql: `SELECT * FROM threads WHERE id=?`, args: [id] });
  return r.rows[0] ? thread(r.rows[0] as unknown as Record<string, unknown>) : null;
}

export async function listThreads(owner: string) {
  await ensure();
  const r = await db().execute({ sql: `SELECT * FROM threads WHERE owner=? ORDER BY updated_at DESC LIMIT 100`, args: [owner] });
  return (r.rows as unknown as Record<string, unknown>[]).map(thread);
}

export async function updateThread(id: string, patch: Partial<Pick<ThreadRow, "title" | "model" | "effort" | "machine" | "status">> & { addSpent?: number }) {
  await ensure();
  const sets: string[] = ["updated_at=?"];
  const args: Array<string | number> = [Date.now()];
  for (const [k, col] of [["title", "title"], ["model", "model"], ["effort", "effort"], ["machine", "machine"], ["status", "status"]] as const) {
    if (patch[k] !== undefined) {
      sets.push(`${col}=?`);
      args.push(patch[k]!);
    }
  }
  if (patch.addSpent) {
    sets.push("spent_usd=spent_usd+?");
    args.push(patch.addSpent);
  }
  await db().execute({ sql: `UPDATE threads SET ${sets.join(",")} WHERE id=?`, args: [...args, id] });
}

/** Threads left "working" by a restart can never finish; hand them back to the owner. */
export async function releaseStaleThreads(olderThanMs: number) {
  await ensure();
  await db().execute({ sql: `UPDATE threads SET status='failed' WHERE status IN ('working','stopping') AND updated_at<?`, args: [Date.now() - olderThanMs] });
}

export async function deleteThread(id: string) {
  await ensure();
  await db().execute({ sql: `DELETE FROM thread_steps WHERE thread_id=?`, args: [id] });
  await db().execute({ sql: `DELETE FROM thread_messages WHERE thread_id=?`, args: [id] });
  await db().execute({ sql: `DELETE FROM threads WHERE id=?`, args: [id] });
}

export async function addMessage(m: Pick<MessageRow, "threadId" | "role" | "text"> & Partial<Pick<MessageRow, "files" | "model" | "ms" | "costUsd">>) {
  await ensure();
  const id = newId("msg");
  await db().execute({ sql: `INSERT INTO thread_messages(id,thread_id,role,text,files,model,ms,cost_usd,created_at) VALUES(?,?,?,?,?,?,?,?,?)`, args: [id, m.threadId, m.role, m.text, JSON.stringify(m.files ?? []), m.model ?? null, m.ms ?? null, m.costUsd ?? null, Date.now()] });
  return id;
}

export async function listMessages(threadId: string): Promise<MessageRow[]> {
  await ensure();
  const r = await db().execute({ sql: `SELECT * FROM thread_messages WHERE thread_id=? ORDER BY created_at`, args: [threadId] });
  return (r.rows as unknown as Record<string, unknown>[]).map((x) => ({
    id: x.id as string,
    threadId: x.thread_id as string,
    role: x.role as MessageRow["role"],
    text: x.text as string,
    files: JSON.parse((x.files as string) || "[]"),
    model: (x.model as string | null) ?? null,
    ms: x.ms == null ? null : Number(x.ms),
    costUsd: x.cost_usd == null ? null : Number(x.cost_usd),
    createdAt: Number(x.created_at),
  }));
}

export async function addStep(s: Pick<StepRow, "threadId" | "tool" | "summary"> & Partial<Pick<StepRow, "messageId" | "detail" | "shot" | "ok" | "ms">>) {
  await ensure();
  const id = newId("st");
  await db().execute({ sql: `INSERT INTO thread_steps(id,thread_id,message_id,tool,summary,detail,shot,ok,ms,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, args: [id, s.threadId, s.messageId ?? null, s.tool, s.summary.slice(0, 300), s.detail?.slice(0, 6000) ?? null, s.shot ?? null, s.ok === false ? 0 : 1, s.ms ?? null, Date.now()] });
  return id;
}

export async function listSteps(threadId: string): Promise<StepRow[]> {
  await ensure();
  const r = await db().execute({ sql: `SELECT * FROM thread_steps WHERE thread_id=? ORDER BY created_at LIMIT 1000`, args: [threadId] });
  return (r.rows as unknown as Record<string, unknown>[]).map((x) => ({
    id: x.id as string,
    threadId: x.thread_id as string,
    messageId: (x.message_id as string | null) ?? null,
    tool: x.tool as string,
    summary: x.summary as string,
    detail: (x.detail as string | null) ?? null,
    shot: (x.shot as string | null) ?? null,
    ok: Number(x.ok) === 1,
    ms: x.ms == null ? null : Number(x.ms),
    createdAt: Number(x.created_at),
  }));
}
