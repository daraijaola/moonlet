import asyncio, json, os, re, subprocess, time
import httpx, websockets
from fastapi import FastAPI, HTTPException, Request, WebSocket, Depends
from fastapi.responses import Response

TOKEN = os.environ["MC_TOKEN"]
IMAGE = os.environ.get("MC_IMAGE", "moonlet-desktop:latest")
IDLE_SECONDS = int(os.environ.get("MC_IDLE_SECONDS", "600"))
SIZES = {"standard": {"cpus": "1", "memory": "2g"}, "large": {"cpus": "2", "memory": "4g"}}
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,40}$")
app = FastAPI()
last_used: dict[str, float] = {}


def auth(req: Request):
    if req.headers.get("authorization") != f"Bearer {TOKEN}":
        raise HTTPException(401, "bad token")


def docker(*args, check=True):
    r = subprocess.run(["docker", *args], capture_output=True, text=True, timeout=60)
    if check and r.returncode:
        raise HTTPException(500, r.stderr.strip()[-300:])
    return r.stdout.strip()


def name(sid: str):
    if not ID_RE.match(sid):
        raise HTTPException(400, "bad sandbox id")
    return f"mc-{sid}"


def state(sid: str):
    out = docker("inspect", "-f", "{{.State.Status}}|{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", name(sid), check=False)
    if not out:
        return {"exists": False, "status": "none", "ip": None}
    status, ip = out.split("|")
    return {"exists": True, "status": status, "ip": ip or None}


async def ip_of(sid: str):
    s = state(sid)
    if s["status"] != "running":
        raise HTTPException(409, "sandbox is asleep; wake it first")
    last_used[sid] = time.time()
    return s["ip"]


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/v1/sandboxes/{sid}/wake", dependencies=[Depends(auth)])
async def wake(sid: str, size: str = "standard"):
    n = name(sid)
    s = state(sid)
    if not s["exists"]:
        spec = SIZES.get(size, SIZES["standard"])
        docker("run", "-d", "--name", n, "--runtime=runsc", "--cpus", spec["cpus"], "--memory", spec["memory"], "--pids-limit", "512",
               "--shm-size", "512m", "--label", f"mc.size={size}", "-v", f"mcvol-{sid}:/home/moon", IMAGE)
    elif s["status"] != "running":
        docker("start", n)
    ip = state(sid)["ip"]
    async with httpx.AsyncClient(timeout=2) as c:
        for _ in range(60):
            try:
                if (await c.get(f"http://{ip}:8000/health")).json().get("display"):
                    break
            except Exception:
                pass
            await asyncio.sleep(0.5)
    last_used[sid] = time.time()
    return {"status": "running", "size": size}


@app.post("/v1/sandboxes/{sid}/sleep", dependencies=[Depends(auth)])
def sleep_(sid: str):
    docker("stop", "-t", "3", name(sid), check=False)
    last_used.pop(sid, None)
    return {"status": "asleep"}


@app.delete("/v1/sandboxes/{sid}", dependencies=[Depends(auth)])
def delete(sid: str):
    docker("rm", "-f", name(sid), check=False)
    docker("volume", "rm", "-f", f"mcvol-{sid}", check=False)
    return {"deleted": True}


@app.get("/v1/sandboxes/{sid}", dependencies=[Depends(auth)])
def info(sid: str):
    s = state(sid)
    out = {"status": "asleep" if s["exists"] and s["status"] != "running" else s["status"]}
    if s["status"] == "running":
        st = docker("stats", "--no-stream", "--format", "{{json .}}", name(sid), check=False)
        if st:
            j = json.loads(st)
            out.update(cpu=j.get("CPUPerc"), mem=j.get("MemUsage"))
    if s["exists"]:
        mp = docker("volume", "inspect", "-f", "{{.Mountpoint}}", f"mcvol-{sid}", check=False)
        if mp:
            du = subprocess.run(["du", "-sb", mp], capture_output=True, text=True).stdout.split()
            out["disk_bytes"] = int(du[0]) if du else None
    return out


async def forward(sid: str, method: str, path: str, req: Request):
    ip = await ip_of(sid)
    body = await req.body()
    async with httpx.AsyncClient(timeout=620) as c:
        r = await c.request(method, f"http://{ip}:8000{path}", params=dict(req.query_params), content=body,
                            headers={"content-type": req.headers.get("content-type", "application/json")})
    return Response(r.content, status_code=r.status_code, media_type=r.headers.get("content-type"))


@app.get("/v1/sandboxes/{sid}/screenshot", dependencies=[Depends(auth)])
async def screenshot(sid: str, req: Request):
    return await forward(sid, "GET", "/screenshot", req)


@app.post("/v1/sandboxes/{sid}/action", dependencies=[Depends(auth)])
async def action(sid: str, req: Request):
    return await forward(sid, "POST", "/action", req)


@app.post("/v1/sandboxes/{sid}/exec", dependencies=[Depends(auth)])
async def exec_(sid: str, req: Request):
    return await forward(sid, "POST", "/exec", req)


@app.api_route("/v1/sandboxes/{sid}/files", methods=["GET", "PUT"], dependencies=[Depends(auth)])
async def files(sid: str, req: Request):
    return await forward(sid, req.method, "/files", req)


@app.websocket("/v1/sandboxes/{sid}/vnc")
async def vnc(ws: WebSocket, sid: str, token: str = ""):
    if token != TOKEN:
        await ws.close(code=4401)
        return
    s = state(sid)
    if s["status"] != "running":
        await ws.close(code=4409)
        return
    await ws.accept(subprotocol="binary")
    async with websockets.connect(f"ws://{s['ip']}:6080/websockify", subprotocols=["binary"], max_size=None) as up:
        async def a():
            while True:
                last_used[sid] = time.time()
                await up.send(await ws.receive_bytes())
        async def b():
            async for m in up:
                await ws.send_bytes(m if isinstance(m, bytes) else m.encode())
        await asyncio.gather(a(), b(), return_exceptions=True)


@app.on_event("startup")
async def reaper():
    async def loop():
        while True:
            await asyncio.sleep(60)
            now = time.time()
            for sid, t in list(last_used.items()):
                if now - t > IDLE_SECONDS:
                    docker("stop", "-t", "3", f"mc-{sid}", check=False)
                    last_used.pop(sid, None)
    asyncio.create_task(loop())
