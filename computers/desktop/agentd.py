import base64, io, os, shlex, subprocess, time
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

app = FastAPI()
HOME = Path("/home/moon")
ENV = {**os.environ, "DISPLAY": ":1", "HOME": str(HOME)}


def run(args, timeout=30, input=None):
    return subprocess.run(args, env=ENV, capture_output=True, text=True, timeout=timeout, input=input)


@app.get("/health")
def health():
    return {"ok": True, "display": run(["xdpyinfo"]).returncode == 0}


@app.get("/screenshot")
def screenshot(scale: int = 100):
    path = "/tmp/shot.png"
    run(["scrot", "-o", "-p", path] + (["--scale", str(scale / 100)] if scale != 100 else []))
    if not os.path.exists(path):
        raise HTTPException(500, "screenshot failed")
    return Response(Path(path).read_bytes(), media_type="image/png")


class Action(BaseModel):
    type: str
    x: int | None = None
    y: int | None = None
    x2: int | None = None
    y2: int | None = None
    text: str | None = None
    keys: str | None = None
    button: int = 1
    amount: int = 3


@app.post("/action")
def action(a: Action):
    xd = ["xdotool"]
    if a.type in ("click", "double_click", "right_click", "move"):
        if a.x is None or a.y is None:
            raise HTTPException(400, "x and y required")
        cmd = xd + ["mousemove", "--sync", str(a.x), str(a.y)]
        if a.type == "click":
            cmd += ["click", str(a.button)]
        elif a.type == "double_click":
            cmd += ["click", "--repeat", "2", "--delay", "80", "1"]
        elif a.type == "right_click":
            cmd += ["click", "3"]
    elif a.type == "drag":
        cmd = xd + ["mousemove", str(a.x), str(a.y), "mousedown", "1", "mousemove", "--sync", str(a.x2), str(a.y2), "mouseup", "1"]
    elif a.type == "type":
        cmd = xd + ["type", "--delay", "12", "--", a.text or ""]
    elif a.type == "key":
        cmd = xd + ["key", "--"] + shlex.split(a.keys or "")
    elif a.type == "scroll":
        btn = "5" if (a.amount or 0) > 0 else "4"
        cmd = xd + (["mousemove", str(a.x), str(a.y)] if a.x is not None else []) + ["click", "--repeat", str(abs(a.amount)), btn]
    else:
        raise HTTPException(400, f"unknown action {a.type}")
    r = run(cmd)
    time.sleep(0.25)
    return {"ok": r.returncode == 0, "error": r.stderr[-400:]}


class Exec(BaseModel):
    cmd: str
    timeout: int = 60
    cwd: str = "/home/moon/work"


@app.post("/exec")
def exec_(e: Exec):
    try:
        r = subprocess.run(["bash", "-lc", e.cmd], env=ENV, cwd=e.cwd, capture_output=True, text=True, timeout=min(e.timeout, 600))
        return {"code": r.returncode, "stdout": r.stdout[-20000:], "stderr": r.stderr[-8000:]}
    except subprocess.TimeoutExpired:
        return {"code": -1, "stdout": "", "stderr": f"timed out after {e.timeout}s"}


def safe(p: str) -> Path:
    path = (HOME / p.lstrip("/")).resolve()
    if not str(path).startswith(str(HOME)):
        raise HTTPException(400, "path outside home")
    return path


@app.get("/files")
def files(path: str = "work"):
    p = safe(path)
    if p.is_dir():
        return {"dir": str(p), "entries": [{"name": c.name, "dir": c.is_dir(), "size": c.stat().st_size} for c in sorted(p.iterdir())]}
    if not p.exists():
        raise HTTPException(404, "not found")
    return Response(p.read_bytes(), media_type="application/octet-stream")


class Write(BaseModel):
    path: str
    b64: str


@app.put("/files")
def write(w: Write):
    p = safe(w.path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(base64.b64decode(w.b64))
    return {"ok": True, "size": p.stat().st_size}
