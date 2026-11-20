"""Example Indonesian reasons for the synthetic judge demo class (butir 2). Source: MAP (MIT) + our MAP-ID translation.

  python scripts/demo_explanations.py   -> docs/cac/demo/demo_explanations.json
For each of the 15 instrument questions and each option key: up to 4 machine-translated reasons per MAP category
(True_Correct, True_Misconception, True_Neither, False_Misconception, False_Neither), filtered to translations whose
digits were kept and where the hallucination guard did not fire, <= 160 characters. Deterministic (seed 20261118).
These texts are used ONLY for synthetic demo responses labelled "data demo sintetis"; they are not pilot data.
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd

from remediaide_ml.paths import INTERIM, PILOT_DOCS, PROCESSED, REPO_ROOT
from remediaide_ml.seed import GLOBAL_SEED

OUT = REPO_ROOT / "docs" / "cac" / "demo" / "demo_explanations.json"


def main():
    inst = json.loads((PILOT_DOCS / "instrument_map_id.json").read_text())
    m = pd.read_parquet(INTERIM / "map.parquet")
    t = pd.read_parquet(PROCESSED / "map_id.parquet")
    d = m.merge(t[["row_id", "StudentExplanation_id", "StudentExplanation_digits_ok", "StudentExplanation_hallucination"]],
                on="row_id")
    d = d[d.StudentExplanation_digits_ok.astype(bool) & ~d.StudentExplanation_hallucination.astype(bool)]
    d = d[d.StudentExplanation_id.str.len().between(15, 160)]
    rng = np.random.default_rng(GLOBAL_SEED)
    out = {"source": "MAP (MIT) + terjemahan mesin MAP-ID; hanya untuk data demo sintetis", "questions": {}}
    for it in inst["items"]:
        q = it["map_question_id"]
        key_of = {o["text_en"]: o["key"] for o in it["options"]}
        g = d[d.QuestionId == q]
        per = {}
        for (ans, cat), h in g.groupby(["MC_Answer", "Category"]):
            k = key_of.get(ans)
            if k is None:
                continue
            h = h.iloc[rng.permutation(len(h))].head(4)
            per.setdefault(k, {})[cat] = [{"text": r.StudentExplanation_id, "misconception": r.misconception}
                                          for r in h.itertuples()]
        out["questions"][str(q)] = {"correct_key": it["correct_key"], "by_option": per}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    n = sum(len(v) for q in out["questions"].values() for o in q["by_option"].values() for v in o.values())
    print(f"{n} alasan -> {OUT}")


if __name__ == "__main__":
    main()
