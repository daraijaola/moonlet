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
def screenshot(fmt: str = "png", quality: int = 72):
    path = "/tmp/shot.png"
    time.sleep(0.5)
    run(["scrot", "-o", "-p", path])
    if not os.path.exists(path):
        raise HTTPException(500, "screenshot failed")
    if fmt != "jpeg":
        return Response(Path(path).read_bytes(), media_type="image/png")
    from PIL import Image
    buf = io.BytesIO()
    Image.open(path).convert("RGB").save(buf, "JPEG", quality=max(30, min(quality, 90)), optimize=True)
    return Response(buf.getvalue(), media_type="image/jpeg")


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
    env: dict[str, str] = {}


@app.post("/exec")
def exec_(e: Exec):
    try:
        os.makedirs(e.cwd, exist_ok=True)
        r = subprocess.run(["bash", "-lc", e.cmd], env={**ENV, **{k: v for k, v in e.env.items() if k.isupper()}}, cwd=e.cwd, capture_output=True, text=True, timeout=min(e.timeout, 600))
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


# ── browser: the visible Chromium driven over CDP, acted on with real clicks so the live view shows every move ──
import json as _json
import urllib.request

from websocket import create_connection

CDP = "http://127.0.0.1:9222"
_elements: list[dict] = []


def _cdp_ready():
    try:
        with urllib.request.urlopen(f"{CDP}/json/version", timeout=1):
            return True
    except Exception:
        return False


def _ensure_browser(url: str | None = None):
    if not _cdp_ready():
        subprocess.Popen(["browser", "--remote-debugging-port=9222", "--remote-allow-origins=*", url or "about:blank"], env=ENV,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        for _ in range(60):
            if _cdp_ready():
                break
            time.sleep(0.25)
        time.sleep(1.0)
        _close_extension_tabs()
        return True
    return False


def _pages():
    with urllib.request.urlopen(f"{CDP}/json", timeout=3) as r:
        return [p for p in _json.loads(r.read()) if p.get("type") == "page"]


def _page_ws():
    pages = _pages()
    web = [p for p in pages if not p.get("url", "").startswith("chrome-extension://")]
    page = (web or pages or [None])[0]
    if not page:
        raise HTTPException(500, "no browser tab")
    try:
        urllib.request.urlopen(f"{CDP}/json/activate/{page['id']}", timeout=2)
    except Exception:
        pass
    return page["webSocketDebuggerUrl"]


def _close_extension_tabs():
    """MetaMask opens its onboarding tab on first launch; close it so it never steals focus from the page being worked on."""
    for _ in range(12):
        tabs = [p for p in _pages() if p.get("url", "").startswith("chrome-extension://")]
        if tabs:
            for p in tabs:
                try:
                    urllib.request.urlopen(f"{CDP}/json/close/{p['id']}", timeout=2)
                except Exception:
                    pass
            return
        time.sleep(0.25)


def _cdp(method: str, params: dict | None = None, timeout=20):
    ws = create_connection(_page_ws(), timeout=timeout)
    try:
        ws.send(_json.dumps({"id": 1, "method": method, "params": params or {}}))
        while True:
            m = _json.loads(ws.recv())
            if m.get("id") == 1:
                if "error" in m:
                    raise HTTPException(500, m["error"].get("message", "cdp error"))
                return m.get("result", {})
    finally:
        ws.close()


def _eval(expr: str):
    r = _cdp("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
    return r.get("result", {}).get("value")


READ_JS = r"""
(() => {
  const out = [];
  const offX = window.screenX + (window.outerWidth - window.innerWidth) / 2;
  const offY = window.screenY + (window.outerHeight - window.innerHeight) - (window.outerWidth - window.innerWidth) / 2;
  const sel = 'a[href],button,input,textarea,select,[role=button],[role=link],[role=tab],[role=menuitem],[contenteditable=true],summary';
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0) continue;
    const label = (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.title || el.getAttribute('href') || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    out.push({ tag: el.tagName.toLowerCase(), type: el.type || '', label, x: Math.round(offX + r.left + r.width / 2), y: Math.round(offY + r.top + r.height / 2) });
    if (out.length >= 120) break;
  }
  const text = (document.body ? document.body.innerText : '').replace(/\n{3,}/g, '\n\n').slice(0, 12000);
  return { url: location.href, title: document.title, text, elements: out, scroll: [scrollY, document.documentElement.scrollHeight, innerHeight] };
})()
"""


class Open(BaseModel):
    url: str


@app.post("/browser/open")
def browser_open(o: Open):
    started = _ensure_browser(o.url)
    if not started:
        _cdp("Page.navigate", {"url": o.url})
    for _ in range(40):
        time.sleep(0.25)
        try:
            if _eval("document.readyState") == "complete":
                break
        except Exception:
            pass
    time.sleep(0.6)
    return {"ok": True, "url": _eval("location.href"), "title": _eval("document.title")}


@app.get("/browser/read")
def browser_read():
    if not _cdp_ready():
        raise HTTPException(409, "no browser open; call open first")
    global _elements
    page = _eval(READ_JS) or {}
    _elements = page.get("elements", [])
    page["elements"] = [{"n": i + 1, "tag": e["tag"], "type": e["type"], "label": e["label"]} for i, e in enumerate(_elements)]
    return page


class Act(BaseModel):
    n: int
    text: str | None = None
    enter: bool = False


@app.post("/browser/click")
def browser_click(a: Act):
    if not 1 <= a.n <= len(_elements):
        raise HTTPException(400, "unknown element number; read the page again")
    e = _elements[a.n - 1]
    run(["xdotool", "mousemove", "--sync", str(e["x"]), str(e["y"]), "click", "1"])
    if a.text is not None:
        time.sleep(0.15)
        run(["xdotool", "key", "ctrl+a"])
        run(["xdotool", "type", "--delay", "12", "--", a.text])
    if a.enter:
        run(["xdotool", "key", "Return"])
    time.sleep(1.0)
    return {"ok": True, "clicked": e["label"]}


class Scroll(BaseModel):
    down: bool = True


@app.post("/browser/scroll")
def browser_scroll(s: Scroll):
    _eval(f"window.scrollBy(0, {'' if s.down else '-'}innerHeight * 0.8)")
    time.sleep(0.4)
    return {"ok": True}
