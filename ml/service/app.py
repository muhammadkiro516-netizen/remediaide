"""RemediAide 2.0 ML service (T63, docs/cac/05_INTEGRATION_SPEC.md §4).

  uvicorn service.app:app --host 0.0.0.0 --port 8000        (from ml/)
Env: RA_MODELS_DIR (default ml/models), RA_L2_LANG = id | en (default id: Indonesian explanations -> mDeBERTa, D-21),
RA_L2 = 1 | 0 (load Layer 2). The service never stores student data and never logs explanation text.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from remediaide_ml.bundle import load_bundle
from remediaide_ml.diagnose import ValidationError, diagnose
from remediaide_ml.paths import MODELS

log = logging.getLogger("remediaide.service")
app = FastAPI(title="RemediAide 2.0 ML", version="2.0")
_state: dict[str, Any] = {}


def get_bundle():
    if "bundle" not in _state:
        d = Path(os.environ.get("RA_MODELS_DIR", MODELS))
        _state["bundle"] = load_bundle(d, with_l2=os.environ.get("RA_L2", "1") == "1", l2_lang=os.environ.get("RA_L2_LANG", "id"))
    return _state["bundle"]


@app.get("/health")
def health():
    try:
        b = get_bundle()
    except Exception as e:  # noqa: BLE001 - report, do not crash the health probe
        return JSONResponse(status_code=503, content={"status": "error", "detail": type(e).__name__})
    return {"status": "ok", "model_version": b.model_version,
            "loaded": {"l1": type(b.l1).__name__, "l2": type(b.l2).__name__ if b.l2 else None, "l3": True}}


@app.post("/v1/diagnose")
def v1_diagnose(payload: dict[str, Any]):
    try:
        out = diagnose(payload, get_bundle())
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    # log only sizes and latency, never student keys or explanation text
    log.info("diagnose: %d responses, %d ms", len(payload.get("responses", [])), out["latency_ms"])
    return out
