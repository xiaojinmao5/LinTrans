"""文件系统与共享文本的存储逻辑（不依赖 FastAPI）。"""

from __future__ import annotations

import os
import re
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any

_INVALID = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_RESERVED = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}


def clean_filename(name: str) -> str:
    name = (name or "").replace("\\", "/").split("/")[-1]
    name = _INVALID.sub("_", name).strip().strip(".")
    if not name:
        return ""
    stem = name.split(".")[0].upper()
    if stem in _RESERVED:
        name = "_" + name
    if len(name) > 180:
        stem, dot, ext = name.rpartition(".")
        if dot and len(ext) <= 12:
            name = stem[: 180 - len(ext) - 1] + "." + ext
        else:
            name = name[:180]
    return name


def safe_rel(rel: str | None) -> str:
    parts: list[str] = []
    for raw in (rel or "").replace("\\", "/").split("/"):
        part = raw.strip()
        if part in ("", "."):
            continue
        if part == ".." or part.endswith(":"):
            raise ValueError("非法路径")
        parts.append(part)
    return "/".join(parts)


def resolve(root: Path, rel: str | None) -> Path:
    rel = safe_rel(rel)
    root = root.resolve()
    target = (root / rel).resolve() if rel else root
    if target != root and not target.is_relative_to(root):
        raise ValueError("非法路径")
    return target


def unique_path(path: Path) -> Path:
    if not path.exists():
        return path
    stem, suffix = path.stem, path.suffix
    for i in range(1, 10000):
        candidate = path.with_name(f"{stem} ({i}){suffix}")
        if not candidate.exists():
            return candidate
    raise RuntimeError("同名文件过多")


def fit_name(name: str, budget: int) -> str:
    if budget < 12:
        raise ValueError("目录层级过深，文件无法保存，请换一个更浅的目录")
    if len(name) <= budget:
        return name
    stem, dot, ext = name.rpartition(".")
    if dot and 0 < len(ext) <= 12:
        keep = budget - len(ext) - 1
        return stem[:keep] + "." + ext
    return name[:budget]


def _natural_key(text: str) -> list[Any]:
    return [int(tok) if tok.isdigit() else tok.lower() for tok in re.split(r"(\d+)", text)]


def _rel_to(root: Path, path: Path) -> str:
    rel = path.relative_to(root).as_posix()
    return "" if rel == "." else rel


def entry_info(root: Path, path: Path) -> dict[str, Any] | None:
    try:
        stat = path.stat()
    except OSError:
        return None
    is_dir = path.is_dir()
    return {
        "name": path.name,
        "path": _rel_to(root, path),
        "type": "dir" if is_dir else "file",
        "size": 0 if is_dir else stat.st_size,
        "mtime": int(stat.st_mtime),
        "ext": "" if is_dir else path.suffix.lower().lstrip("."),
    }


def list_dir(root: Path, rel: str | None) -> dict[str, Any]:
    target = resolve(root, rel)
    if not target.exists():
        raise FileNotFoundError("目录不存在")
    if not target.is_dir():
        raise NotADirectoryError("不是目录")

    entries: list[dict[str, Any]] = []
    with os.scandir(target) as it:
        for item in it:
            info = entry_info(root, Path(item.path))
            if info is not None:
                entries.append(info)
    entries.sort(key=lambda e: (e["type"] != "dir", _natural_key(e["name"])))

    current = _rel_to(root.resolve(), target)
    parent = None
    if current:
        parent = current.rsplit("/", 1)[0] if "/" in current else ""

    crumbs = [{"name": "共享根目录", "path": ""}]
    acc: list[str] = []
    for part in current.split("/") if current else []:
        acc.append(part)
        crumbs.append({"name": part, "path": "/".join(acc)})

    return {"path": current, "parent": parent, "breadcrumb": crumbs, "entries": entries}


def search_files(root: Path, keyword: str, limit: int = 200) -> list[dict[str, Any]]:
    keyword = (keyword or "").strip().lower()
    if not keyword:
        return []
    root = root.resolve()
    results: list[dict[str, Any]] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith("."))
        base = Path(dirpath)
        for name in dirnames + filenames:
            if keyword not in name.lower():
                continue
            info = entry_info(root, base / name)
            if info:
                results.append(info)
                if len(results) >= limit:
                    return results
    return results


def disk_info(root: Path) -> dict[str, int]:
    import shutil

    total, used, free = shutil.disk_usage(root)
    return {"total": total, "used": used, "free": free}


class ClipStore:
    def __init__(self, db_path: Path, max_items: int = 300) -> None:
        self.db_path = db_path
        self.max_items = max_items
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS clips (
                    id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    pinned INTEGER NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                )
                """
            )

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "content": row["content"],
            "pinned": bool(row["pinned"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def list(self, limit: int = 300) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM clips ORDER BY pinned DESC, updated_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [self._row(r) for r in rows]

    def add(self, content: str) -> dict[str, Any]:
        content = (content or "").strip()
        if not content:
            raise ValueError("内容不能为空")
        now = time.time()
        clip_id = uuid.uuid4().hex
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO clips (id, content, pinned, created_at, updated_at) VALUES (?,?,0,?,?)",
                (clip_id, content, now, now),
            )
            conn.execute(
                """
                DELETE FROM clips WHERE pinned = 0 AND id NOT IN (
                    SELECT id FROM clips WHERE pinned = 0
                    ORDER BY updated_at DESC LIMIT ?
                )
                """,
                (self.max_items,),
            )
            row = conn.execute("SELECT * FROM clips WHERE id = ?", (clip_id,)).fetchone()
        return self._row(row)

    def update(self, clip_id: str, content: str | None = None, pinned: bool | None = None):
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM clips WHERE id = ?", (clip_id,)).fetchone()
            if row is None:
                return None
            new_content = row["content"] if content is None else content.strip()
            if not new_content:
                raise ValueError("内容不能为空")
            new_pinned = row["pinned"] if pinned is None else int(pinned)
            conn.execute(
                "UPDATE clips SET content = ?, pinned = ?, updated_at = ? WHERE id = ?",
                (new_content, new_pinned, time.time(), clip_id),
            )
            row = conn.execute("SELECT * FROM clips WHERE id = ?", (clip_id,)).fetchone()
        return self._row(row)

    def delete(self, clip_id: str) -> bool:
        with self._conn() as conn:
            cur = conn.execute("DELETE FROM clips WHERE id = ?", (clip_id,))
        return cur.rowcount > 0

    def clear(self) -> int:
        with self._conn() as conn:
            cur = conn.execute("DELETE FROM clips WHERE pinned = 0")
        return cur.rowcount
