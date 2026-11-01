"""局域网共享 —— FastAPI 后端。启动：python -m app.main"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import mimetypes
import os
import shutil
import socket
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path
from urllib.parse import quote

import uvicorn
from fastapi import FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import store

APP_VERSION = "1.0.0"
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = Path(__file__).resolve().parent / "static"
CONFIG_PATH = BASE_DIR / "config.json"
DATA_DIR = BASE_DIR / "data"

DEFAULT_CONFIG = {
    "name": "局域网共享",
    "port": 8777,
    "pin": "",
    "storage": "storage",
    "max_text_items": 300,
}


def load_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_PATH.exists():
        try:
            cfg.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
        except Exception as exc:
            print(f"[warn] config.json 解析失败，使用默认配置: {exc}")
    return cfg


CONFIG = load_config()
STORAGE_ROOT = (BASE_DIR / str(CONFIG.get("storage", "storage"))).resolve()
STORAGE_ROOT.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "app.log"


def setup_logging() -> None:
    if getattr(setup_logging, "_done", False):
        return
    fmt = logging.Formatter("%(asctime)s | %(levelname)-7s | %(name)s | %(message)s", "%Y-%m-%d %H:%M:%S")
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    for handler in list(root.handlers):
        root.removeHandler(handler)
    file_handler = RotatingFileHandler(LOG_FILE, maxBytes=3 * 1024 * 1024, backupCount=3, encoding="utf-8")
    file_handler.setFormatter(fmt)
    root.addHandler(file_handler)
    try:
        stream_handler = logging.StreamHandler(sys.stdout)
        stream_handler.setFormatter(fmt)
        root.addHandler(stream_handler)
    except Exception:
        pass
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers.clear()
        logger.propagate = True
        logger.setLevel(logging.INFO)
    setup_logging._done = True


setup_logging()
CLIPS = store.ClipStore(DATA_DIR / "clips.db", int(CONFIG.get("max_text_items", 300)))

PIN = str(CONFIG.get("pin") or "").strip()
PIN_TOKEN = hashlib.sha256(("lanhub:" + PIN).encode("utf-8")).hexdigest() if PIN else ""
COOKIE_NAME = "hub_auth"
COOKIE_MAX_AGE = 60 * 60 * 24 * 30

TEXT_PREVIEW_EXTS = {
    "txt", "md", "markdown", "log", "json", "js", "ts", "jsx", "tsx", "css", "scss",
    "html", "htm", "xml", "yml", "yaml", "toml", "ini", "cfg", "conf", "csv", "tsv",
    "py", "java", "c", "h", "cpp", "hpp", "cs", "go", "rs", "rb", "php", "sh", "bat",
    "ps1", "sql", "env", "gitignore", "vue", "svelte", "lua", "kt", "swift",
}
TEXT_PREVIEW_LIMIT = 256 * 1024

app = FastAPI(title="局域网共享", version=APP_VERSION, docs_url=None, redoc_url=None)


@app.exception_handler(Exception)
async def handle_unexpected(request: Request, exc: Exception):
    logging.getLogger("app").exception("未处理异常: %s %s", request.method, request.url.path)
    return JSONResponse(
        {"detail": f"服务器内部错误：{type(exc).__name__}: {exc}"},
        status_code=500,
    )


# ---------------------------------------------------------------- 鉴权


def is_authenticated(request: Request) -> bool:
    if not PIN:
        return True
    return request.cookies.get(COOKIE_NAME) == PIN_TOKEN


@app.middleware("http")
async def auth_guard(request: Request, call_next):
    path = request.url.path
    if PIN and path.startswith("/api/") and path not in ("/api/info", "/api/login"):
        if not is_authenticated(request):
            return JSONResponse({"detail": "需要访问密码"}, status_code=401)
    return await call_next(request)


class LoginBody(BaseModel):
    pin: str = ""


@app.post("/api/login")
def login(body: LoginBody, response: Response):
    if not PIN:
        return {"ok": True}
    if body.pin != PIN:
        raise HTTPException(status_code=401, detail="密码错误")
    response.set_cookie(COOKIE_NAME, PIN_TOKEN, max_age=COOKIE_MAX_AGE, httponly=True, samesite="lax")
    return {"ok": True}


@app.post("/api/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


# ---------------------------------------------------------------- 基础信息


def lan_ips() -> list[str]:
    ips: set[str] = set()
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ips.add(sock.getsockname()[0])
        sock.close()
    except OSError:
        pass
    try:
        host = socket.gethostname()
        for info in socket.getaddrinfo(host, None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    result = [ip for ip in ips if not ip.startswith("127.") and not ip.startswith("169.254.")]
    return sorted(result, key=lambda ip: (not ip.startswith("192.168."), ip))


@app.get("/api/info")
def info(request: Request):
    return {
        "name": CONFIG.get("name", "局域网共享"),
        "version": APP_VERSION,
        "hostname": socket.gethostname(),
        "port": int(CONFIG.get("port", 8777)),
        "ips": lan_ips(),
        "need_pin": bool(PIN),
        "authenticated": is_authenticated(request),
        "disk": store.disk_info(STORAGE_ROOT),
        "storage_path": str(STORAGE_ROOT),
    }


@app.get("/api/qr")
def qr_code(text: str):
    text = (text or "").strip()
    if not text or len(text) > 512:
        raise HTTPException(status_code=400, detail="文本为空或过长")
    try:
        import qrcode
    except ImportError:
        raise HTTPException(status_code=503, detail="服务器未安装 qrcode")
    img = qrcode.make(text, box_size=9, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png", headers={"Cache-Control": "no-store"})


# ---------------------------------------------------------------- 文件


class PathBody(BaseModel):
    path: str = ""


class MkdirBody(BaseModel):
    path: str = ""
    name: str


class RenameBody(BaseModel):
    path: str
    name: str


def _guard(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc) or "不存在")
    except NotADirectoryError:
        raise HTTPException(status_code=400, detail="不是目录")
    except PermissionError:
        raise HTTPException(status_code=403, detail="没有权限")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc) or "非法请求")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"文件操作失败: {exc}")


@app.get("/api/files")
def files(path: str = ""):
    return _guard(store.list_dir, STORAGE_ROOT, path)


@app.get("/api/search")
def search(q: str = "", limit: int = 200):
    return {"entries": _guard(store.search_files, STORAGE_ROOT, q, max(1, min(limit, 500)))}


@app.post("/api/files/upload")
async def upload(files: list[UploadFile] = File(...), path: str = ""):
    target_dir = _guard(store.resolve, STORAGE_ROOT, path)
    if not target_dir.is_dir():
        raise HTTPException(status_code=400, detail="目标不是目录")
    saved = []
    for item in files:
        name = store.clean_filename(item.filename or "")
        if not name:
            continue
        budget = 240 - len(str(target_dir)) - 1 - 10
        try:
            name = store.fit_name(name, budget)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        destination = store.unique_path(target_dir / name)
        size = 0
        try:
            with destination.open("wb") as out:
                while True:
                    chunk = await item.read(1024 * 256)
                    if not chunk:
                        break
                    out.write(chunk)
                    size += len(chunk)
        except OSError as exc:
            destination.unlink(missing_ok=True)
            logging.getLogger("app").exception("上传写入失败: %s", destination)
            raise HTTPException(status_code=500, detail=f"写入失败: {exc}")
        saved.append({"name": destination.name, "size": size})
    if not saved:
        raise HTTPException(status_code=400, detail="没有可保存的文件")
    return {"saved": saved}


@app.post("/api/files/mkdir")
def mkdir(body: MkdirBody):
    parent = _guard(store.resolve, STORAGE_ROOT, body.path)
    name = store.clean_filename(body.name)
    if not name:
        raise HTTPException(status_code=400, detail="文件夹名无效")
    if not parent.is_dir():
        raise HTTPException(status_code=400, detail="目标不是目录")
    new_dir = parent / name
    if new_dir.exists():
        raise HTTPException(status_code=409, detail="同名文件夹或文件已存在")
    new_dir.mkdir(parents=True, exist_ok=False)
    return {"ok": True, "path": store.entry_info(STORAGE_ROOT, new_dir)}


@app.post("/api/files/rename")
def rename(body: RenameBody):
    source = _guard(store.resolve, STORAGE_ROOT, body.path)
    if source == STORAGE_ROOT:
        raise HTTPException(status_code=400, detail="不能重命名根目录")
    if not source.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    name = store.clean_filename(body.name)
    if not name:
        raise HTTPException(status_code=400, detail="名称无效")
    destination = source.parent / name
    if destination == source:
        return {"ok": True}
    if destination.exists():
        raise HTTPException(status_code=409, detail="同名文件或文件夹已存在")
    source.rename(destination)
    return {"ok": True, "path": store.entry_info(STORAGE_ROOT, destination)}


@app.post("/api/files/delete")
def delete(body: PathBody):
    target = _guard(store.resolve, STORAGE_ROOT, body.path)
    if target == STORAGE_ROOT:
        raise HTTPException(status_code=400, detail="不能删除根目录")
    if not target.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()
    return {"ok": True}


@app.get("/api/files/download")
def download(path: str):
    target = _guard(store.resolve, STORAGE_ROOT, path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    media_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    return FileResponse(target, media_type=media_type, filename=target.name)


@app.get("/api/files/raw")
def raw(path: str):
    target = _guard(store.resolve, STORAGE_ROOT, path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    media_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    return FileResponse(
        target,
        media_type=media_type,
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(target.name)}",
            "Cache-Control": "no-cache",
        },
    )


@app.get("/api/files/text")
def read_text(path: str):
    target = _guard(store.resolve, STORAGE_ROOT, path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    ext = target.suffix.lower().lstrip(".")
    if ext and ext not in TEXT_PREVIEW_EXTS and target.stat().st_size > 0:
        raise HTTPException(status_code=415, detail="该类型不支持文本预览")
    with target.open("rb") as fh:
        blob = fh.read(TEXT_PREVIEW_LIMIT)
    if b"\x00" in blob[:4096]:
        raise HTTPException(status_code=415, detail="看起来是二进制文件")
    text = ""
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            text = blob.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = blob.decode("latin-1")
    return {
        "content": text,
        "truncated": target.stat().st_size > TEXT_PREVIEW_LIMIT,
        "size": target.stat().st_size,
    }


# ---------------------------------------------------------------- 共享文本


class ClipBody(BaseModel):
    content: str


class ClipPatch(BaseModel):
    content: str | None = None
    pinned: bool | None = None


@app.get("/api/clips")
def clips_list():
    return {"clips": CLIPS.list()}


@app.post("/api/clips")
def clips_add(body: ClipBody):
    try:
        return {"clip": CLIPS.add(body.content)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.put("/api/clips/{clip_id}")
def clips_update(clip_id: str, body: ClipPatch):
    try:
        clip = CLIPS.update(clip_id, body.content, body.pinned)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if clip is None:
        raise HTTPException(status_code=404, detail="文本不存在")
    return {"clip": clip}


@app.delete("/api/clips/{clip_id}")
def clips_delete(clip_id: str):
    if not CLIPS.delete(clip_id):
        raise HTTPException(status_code=404, detail="文本不存在")
    return {"ok": True}


@app.delete("/api/clips")
def clips_clear():
    return {"deleted": CLIPS.clear()}


# ---------------------------------------------------------------- 静态前端

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/favicon.svg")
def favicon():
    return FileResponse(STATIC_DIR / "favicon.svg", media_type="image/svg+xml")


def banner(port: int) -> str:
    ips = lan_ips()
    lines = [
        "",
        "  " + "=" * 52,
        f"  {CONFIG.get('name', '局域网共享')}  v{APP_VERSION}",
        "  " + "=" * 52,
        f"  本机访问   http://127.0.0.1:{port}",
    ]
    for ip in ips:
        lines.append(f"  局域网访问 http://{ip}:{port}")
    if not ips:
        lines.append("  （未检测到局域网 IP，请确认已连接网络）")
    if PIN:
        lines.append(f"  访问密码   {PIN}")
    lines.append(f"  共享目录   {STORAGE_ROOT}")
    lines.append("  按 Ctrl+C 停止服务")
    lines.append("  " + "=" * 52)
    lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    port = int(CONFIG.get("port", 8777))
    print(banner(port))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info", log_config=None)
