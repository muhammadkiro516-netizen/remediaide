"""Local explanations for Layer 1 (T24): top-3 SHAP reasons in Indonesian for a predicted quadrant.

Uses LightGBM's native `pred_contrib=True` (exact TreeSHAP, no extra dependency at serving time).
Reasons are phrased from the feature value, e.g. "salah 3× di topik ini dengan keyakinan tinggi".
"""

from __future__ import annotations

import lightgbm as lgb
import numpy as np
import pandas as pd

QUAD = ("P", "L", "M", "T")
QUAD_ID = {"P": "Paham", "L": "Tebakan beruntung", "M": "Miskonsepsi", "T": "Tidak paham"}


def _fmt(name: str, v) -> str:
    if v is None or pd.isna(v):
        return {"acc_prev_kc": "belum ada riwayat di topik ini", "ewm_acc_kc": "belum ada riwayat di topik ini",
                "acc_prev": "belum ada riwayat jawaban", "conf_mean_prev": "belum ada riwayat keyakinan",
                "overconf_prev": "belum ada riwayat keyakinan", "hours_since_prev": "jawaban pertama siswa",
                "last_quadrant_kc": "belum ada kuadran sebelumnya di topik ini", "cur_cri": "keyakinan saat ini tidak diisi",
                "conf_mean_prev_kc": "belum ada riwayat keyakinan di topik ini",
                "hours_since_prev_kc": "pertama kali mengerjakan topik ini"}.get(name, f"{name} kosong")
    v = float(v)
    match name:
        case "cur_correct":
            return "jawaban saat ini benar" if v >= 0.5 else "jawaban saat ini salah"
        case "cur_cri":
            return f"keyakinan saat ini {int(v)} dari 5" + (" (tinggi)" if v >= 3 else " (rendah)")
        case "cur_has_conf":
            return "keyakinan diisi" if v >= 0.5 else "keyakinan tidak diisi"
        case "acc_prev_kc":
            return f"akurasi di topik ini sejauh ini {v:.0%}"
        case "ewm_acc_kc":
            return f"akurasi terbaru di topik ini {v:.0%}"
        case "acc_prev":
            return f"akurasi keseluruhan sejauh ini {v:.0%}"
        case "n_prev_kc":
            return f"sudah {int(v)} soal di topik ini"
        case "n_prev":
            return f"sudah {int(v)} soal dikerjakan"
        case "cnt_M_kc":
            return f"salah {int(v)}× di topik ini dengan keyakinan tinggi"
        case "cnt_T_kc":
            return f"salah {int(v)}× di topik ini dengan keyakinan rendah"
        case "cnt_P_kc":
            return f"benar {int(v)}× di topik ini dengan keyakinan tinggi"
        case "cnt_L_kc":
            return f"benar {int(v)}× di topik ini dengan keyakinan rendah"
        case "overconf_prev":
            if v > 0.1:
                return "cenderung terlalu yakin"
            return "cenderung kurang yakin" if v < -0.1 else "keyakinan sejalan dengan hasil"
        case "conf_mean_prev_kc":
            return f"rata-rata keyakinan di topik ini {v:.1f} dari 5"
        case "conf_mean_prev":
            return f"rata-rata keyakinan {v:.1f} dari 5"
        case "item_diff_oof":
            return f"soal ini dijawab benar oleh {v:.0%} siswa"
        case "kc_diff_oof":
            return f"topik ini dijawab benar oleh {v:.0%} siswa"
        case "cur_option_share_oof":
            return f"opsi salah yang dipilih juga dipilih {v:.0%} siswa yang salah" if v > 0 else "opsi salah yang jarang dipilih"
        case "last_quadrant_kc" | "cur_quadrant_b0":
            q = QUAD[int(v)] if 0 <= v < 4 else None
            pre = "kuadran terakhir di topik ini" if name == "last_quadrant_kc" else "aturan v1 saat ini"
            return f"{pre}: {QUAD_ID[q]}" if q else f"{pre}: tidak ada"
        case "hours_since_prev":
            return f"{v:.0f} jam sejak jawaban sebelumnya"
        case "hours_since_prev_kc":
            return f"{v:.0f} jam sejak terakhir mengerjakan topik ini"
        case "attempt_no":
            return f"percobaan ke-{int(v)} untuk soal ini"
    return f"{name} = {v:g}"


def explain(booster: lgb.Booster, X: pd.DataFrame, k: int = 3, target_class: np.ndarray | None = None) -> list[list[dict]]:
    """Top-k reasons per row for the predicted (or given) class. impact = SHAP value in log-odds (signed)."""
    contrib = booster.predict(X, pred_contrib=True)
    n, f = X.shape
    n_cls = contrib.shape[1] // (f + 1)
    C = contrib.reshape(n, n_cls, f + 1)[:, :, :f]
    if target_class is None:
        prob = booster.predict(X)
        target_class = prob.argmax(1) if prob.ndim == 2 else (prob >= 0.5).astype(int) * 0
    cols = list(X.columns)
    out = []
    for i in range(n):
        c = C[i, int(target_class[i]) if n_cls > 1 else 0]
        top = np.argsort(-np.abs(c), kind="stable")[:k]
        out.append([{"feature": cols[j], "text": _fmt(cols[j], X.iat[i, j]), "impact": round(float(c[j]), 4)} for j in top])
    return out
