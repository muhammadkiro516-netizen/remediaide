"""Layer 1 B2: LightGBM (03 §1, T22).

* tune(): Optuna TPE (seeded) on fold 0, search space from 03 §1, early stopping 100 rounds.
* fit_predict(): train on a fold with given params, return validation probabilities + best iteration.
* ABLATION_STAGES: E2 cumulative signal groups S0..S6 (framing b).
"""

from __future__ import annotations

import lightgbm as lgb
import pandas as pd

from remediaide_ml.features.history import FEATURES_A, FEATURES_B_CUR

ABLATION_STAGES: dict[str, list[str]] = {
    "S0_cur_correct": ["cur_correct"],
    "S1_keyakinan": ["cur_cri", "cur_has_conf"],
    "S2_riwayat_benar": ["n_prev", "acc_prev", "n_prev_kc", "acc_prev_kc", "ewm_acc_kc", "attempt_no"],
    "S3_riwayat_keyakinan": ["conf_mean_prev", "conf_mean_prev_kc", "overconf_prev", "cnt_P_kc", "cnt_L_kc", "cnt_M_kc",
                             "cnt_T_kc", "last_quadrant_kc", "cur_quadrant_b0"],
    "S4_kesulitan": ["item_diff_oof", "kc_diff_oof"],
    "S5_opsi": ["cur_option_share_oof"],
    "S6_waktu": ["hours_since_prev", "hours_since_prev_kc"],
}


def stage_features(stage: str) -> list[str]:
    out: list[str] = []
    for name, cols in ABLATION_STAGES.items():
        out += cols
        if name == stage:
            return out
    raise KeyError(stage)


ALL_B = stage_features("S6_waktu")
assert set(ALL_B) == set(FEATURES_A + FEATURES_B_CUR + ["item_diff_oof", "kc_diff_oof", "cur_option_share_oof"]), \
    "ablation stages must cover the full framing-(b) feature set"

BASE_PARAMS = {"verbosity": -1, "bagging_freq": 1, "num_threads": 0, "deterministic": True, "force_col_wise": True}


def objective_params(task: str) -> dict:
    if task == "binary":
        return {"objective": "binary", "metric": "auc"}
    return {"objective": "multiclass", "num_class": 4, "metric": "multi_logloss"}


def fit_predict(X_tr: pd.DataFrame, y_tr, X_va: pd.DataFrame, y_va, params: dict, task: str, seed: int,
                num_boost_round: int = 3000, early_stopping: int = 100, w_tr=None):
    p = BASE_PARAMS | objective_params(task) | params | {"seed": seed}
    dtr = lgb.Dataset(X_tr, y_tr, weight=w_tr, free_raw_data=True)
    dva = lgb.Dataset(X_va, y_va, reference=dtr)
    booster = lgb.train(p, dtr, num_boost_round=num_boost_round, valid_sets=[dva],
                        callbacks=[lgb.early_stopping(early_stopping, verbose=False), lgb.log_evaluation(0)])
    prob = booster.predict(X_va, num_iteration=booster.best_iteration)
    return prob, booster


def tune(X_tr, y_tr, X_va, y_va, task: str, n_trials: int, seed: int, log=print) -> tuple[dict, list]:
    import optuna

    optuna.logging.set_verbosity(optuna.logging.WARNING)
    from remediaide_ml.eval import metrics as M

    history = []

    def obj(trial):
        params = {
            "num_leaves": trial.suggest_int("num_leaves", 15, 255),
            "learning_rate": trial.suggest_float("learning_rate", 0.02, 0.2, log=True),
            "min_child_samples": trial.suggest_int("min_child_samples", 20, 500),
            "feature_fraction": trial.suggest_float("feature_fraction", 0.5, 1.0),
            "bagging_fraction": trial.suggest_float("bagging_fraction", 0.5, 1.0),
            "lambda_l2": trial.suggest_float("lambda_l2", 1e-3, 10, log=True),
        }
        prob, booster = fit_predict(X_tr, y_tr, X_va, y_va, params, task, seed)
        score = M.auc(y_va, prob) if task == "binary" else -M.logloss(y_va, prob, labels=[0, 1, 2, 3])
        history.append({"trial": trial.number, "score": score, "best_iter": booster.best_iteration, **params})
        log(f"trial {trial.number}: score {score:.5f} iters {booster.best_iteration}")
        return score

    study = optuna.create_study(direction="maximize", sampler=optuna.samplers.TPESampler(seed=seed))
    study.optimize(obj, n_trials=n_trials)
    return study.best_params, history
