"""Small derived tables from already-computed confusion matrices (no model or label access):
reports/tables/E1_cokt_test_per_class.csv (per-class recall + share of future-M predicted P)."""
import numpy as np
import pandas as pd

from remediaide_ml.paths import TABLES

c = pd.read_csv(TABLES / "E1_confusion_cokt_test.csv", index_col=0)
m = c.to_numpy()
names = ["Paham", "Tebakan beruntung", "Miskonsepsi", "Tidak paham"]
out = pd.DataFrame({"kuadran_masa_depan": names, "n": m.sum(1), "recall": np.round(np.diag(m) / m.sum(1), 3),
                    "porsi_diprediksi_paham": np.round(m[:, 0] / m.sum(1), 3)})
out.to_csv(TABLES / "E1_cokt_test_per_class.csv", index=False)
print(out.to_string())

# E2: per-stage increments of the LightGBM ablation (CV)
e2 = pd.read_csv(TABLES / "E2_ablation_cv.csv")
inc = pd.DataFrame({"tahap": e2.tahap, "macro_f1": e2.macro_f1.round(4), "kenaikan_macro_f1": e2.macro_f1.diff().round(4),
                    "kenaikan_auc_bin": e2.auc_bin.diff().round(4), "perubahan_salah_kelompok": e2.misgroup.diff().round(4)})
inc.to_csv(TABLES / "E2_ablation_increments_cv.csv", index=False)
print(inc.to_string())
