"""RemediAide 2.0 ML package (CAC MLSC 2026).

Modules are added task by task (see docs/cac/TASKS.md):
  cri_rule      B0 baseline, exact port of the v1 TypeScript engine (done, parity-tested)
  paths, seed   project paths and global seeding (done)
  data/         loaders + preprocessing for Eedi 2020 Task 3&4 and MAP          (T10-T13)
  features/     leakage-safe history features                                     (T14)
  l1/           Lapis 1 - mastery + option tracing (LightGBM, CO-KT transformer)  (T20-T24)
  l2/           Lapis 2 - explanation reader (multilingual encoder)               (T30-T35)
  l3/           Lapis 3 - calibration, conformal, selective prediction            (T40-T43)
  guard/        rapid-guess detector (normative threshold + GMM)                  (T44)
  eval/         metrics, bootstrap CI, DeLong, McNemar, fairness                  (T15)
"""

__version__ = "0.1.0"
