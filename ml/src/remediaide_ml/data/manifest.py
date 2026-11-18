"""data/manifest.json: provenance of every raw download (source URL, date, size, sha256, license)."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
from pathlib import Path

from remediaide_ml.paths import DATA, ML_ROOT

MANIFEST = DATA / "manifest.json"


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while b := f.read(chunk):
            h.update(b)
    return h.hexdigest()


def load() -> dict:
    return json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {"files": {}}


def record(path: Path, source: str, license: str, note: str = "") -> dict:
    """Add/replace a manifest entry for `path` (stored relative to ml/)."""
    path = Path(path)
    m = load()
    entry = {
        "source": source,
        "license": license,
        "size_bytes": path.stat().st_size,
        "sha256": sha256_file(path),
        "recorded": dt.datetime.now().isoformat(timespec="seconds"),
    }
    if note:
        entry["note"] = note
    m["files"][str(path.resolve().relative_to(ML_ROOT))] = entry
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(m, indent=2, ensure_ascii=False) + "\n")
    return entry
