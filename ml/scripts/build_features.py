"""T14: build fold-independent L1 features + labels.

Writes data/processed/eedi_features_a.parquet (KT framing: past-only features, target IsCorrect)
and data/processed/eedi_features_b.parquet (diagnostic framing: + cur_* signals, future-quadrant labels).
Fold-dependent encodings (item/KC difficulty, option share) are added per fold at training time.
"""

from __future__ import annotations

import json
import time

import pandas as pd

from remediaide_ml.features.history import FEATURES_A, FEATURES_B_CUR, add_history_features
from remediaide_ml.features.labels import add_future_labels
from remediaide_ml.paths import INTERIM, PROCESSED

KEYS = ["UserId", "QuestionId", "AnswerId", "kc", "kc_l2", "DateAnswered", "seq_pos", "AnswerValue", "CorrectAnswer",
        "IsCorrect", "has_conf", "cri", "Gender", "PremiumPupil"]


def main() -> None:
    t0 = time.time()
    df = pd.read_parquet(INTERIM / "eedi_t34.parquet")
    df = df[df.kc.notna()].reset_index(drop=True)
    f = add_history_features(df)
    t1 = time.time()
    f = add_future_labels(f)
    t2 = time.time()
    PROCESSED.mkdir(parents=True, exist_ok=True)
    f[KEYS + FEATURES_A].to_parquet(PROCESSED / "eedi_features_a.parquet", index=False)
    cols_b = KEYS + FEATURES_A + FEATURES_B_CUR + ["quadrant_b0", "n_future", "fut_acc", "fut_conf", "fut_quadrant",
                                                   "needs_remediation"]
    f[cols_b].to_parquet(PROCESSED / "eedi_features_b.parquet", index=False)
    info = {"rows": len(f), "sec_history": round(t1 - t0, 1), "sec_labels": round(t2 - t1, 1),
            "sec_total": round(time.time() - t0, 1),
            "rows_with_binary_label": int(f.needs_remediation.notna().sum()),
            "rows_with_quadrant_label": int(f.fut_quadrant.notna().sum()),
            "rows_with_quadrant_label_and_cur_conf": int((f.fut_quadrant.notna() & f.has_conf).sum()),
            "rows_excluded_lt2_future": int(f.needs_remediation.isna().sum()),
            "fut_quadrant_dist": f.fut_quadrant.value_counts(normalize=True).round(4).to_dict()}
    (PROCESSED / "eedi_features_info.json").write_text(json.dumps(info, indent=2))
    print(json.dumps(info, indent=2))


if __name__ == "__main__":
    main()
