"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, type ApiMoonlet, type Connections, type OrbioStatus } from "./api";

type AppData = { moonlets: ApiMoonlet[] | null; status: OrbioStatus | null; conns: Connections | null; reload: () => Promise<void> };
const Ctx = createContext<AppData>({ moonlets: null, status: null, conns: null, reload: async () => {} });

/** One fetch of the owner's moonlets, Orbio state and connections, shared by the sidebar and every app page. */
export function AppDataProvider({ owner, children }: { owner: string; children: React.ReactNode }) {
  const [moonlets, setMoonlets] = useState<ApiMoonlet[] | null>(null);
  const [status, setStatus] = useState<OrbioStatus | null>(null);
  const [conns, setConns] = useState<Connections | null>(null);
  const reload = useCallback(async () => {
    const [m, s, c] = await Promise.all([api.listMoonlets(owner), api.orbioStatus(owner).catch(() => null), api.connections(owner).catch(() => null)]);
    setMoonlets(m.moonlets);
    setStatus(s);
    setConns(c);
  }, [owner]);
  const anyRunning = !!moonlets?.some((m) => m.status === "running");
  useEffect(() => {
    const first = setTimeout(reload, 0);
    const t = setInterval(reload, anyRunning ? 4000 : 15_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [reload, anyRunning]);
  const value = useMemo(() => ({ moonlets, status, conns, reload }), [moonlets, status, conns, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAppData = () => useContext(Ctx);
