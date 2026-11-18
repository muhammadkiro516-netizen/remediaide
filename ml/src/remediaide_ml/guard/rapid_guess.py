"""Guard: rapid-guess detection from response times (docs/cac/03_MODEL_SPEC.md §4, T44).

NOT reported as a result until pilot data with real response times exists (06_PILOT_PROTOCOL).

Methods (thresholds are per item):
* NT-p      : threshold_i = p% of the item's mean response time (NT10, NT20, NT30).
* GMM       : 2-component Gaussian mixture on log RT per item (>= min_n responses, else pooled by word-count
              bucket); threshold = RT where posterior of the fast component = 0.5.
* B0 tau_min: ceil(words / 2.5) s, the v1 rule (cri_rule.calculate_tau_min_seconds).
Unlabelled evaluation: accuracy of flagged responses (pure guessing ~ 25% on 4 options), flag rate, agreement.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.mixture import GaussianMixture

from remediaide_ml.cri_rule import calculate_tau_min_seconds


def nt_thresholds(df: pd.DataFrame, pct: float = 0.10, item_col: str = "item_id", rt_col: str = "rt_ms") -> pd.Series:
    """Per-item normative threshold: pct x mean RT of the item."""
    return df.groupby(item_col)[rt_col].mean() * pct


def _gmm_threshold(log_rt: np.ndarray, seed: int = 0) -> float:
    g = GaussianMixture(2, random_state=seed).fit(log_rt.reshape(-1, 1))
    fast = int(np.argmin(g.means_.ravel()))
    lo, hi = float(np.min(log_rt)), float(g.means_.ravel()[1 - fast])
    grid = np.linspace(lo, max(hi, lo + 1e-6), 400).reshape(-1, 1)
    post = g.predict_proba(grid)[:, fast]
    cross = np.where(post < 0.5)[0]
    return float(np.exp(grid[cross[0], 0])) if len(cross) else float(np.exp(lo))


def gmm_thresholds(df: pd.DataFrame, item_col: str = "item_id", rt_col: str = "rt_ms", words_col: str | None = "n_words",
                   min_n: int = 30, seed: int = 0) -> pd.Series:
    """Per-item GMM threshold; items with < min_n responses use their word-count bucket's pooled threshold."""
    out = {}
    small = []
    for item, s in df.groupby(item_col):
        rt = s[rt_col].to_numpy(float)
        rt = rt[rt > 0]
        if len(rt) >= min_n:
            out[item] = _gmm_threshold(np.log(rt), seed)
        else:
            small.append(item)
    if small:
        sub = df[df[item_col].isin(small)]
        if words_col and words_col in df:
            bucket = pd.cut(sub[words_col], [-1, 10, 20, 40, 1e9], labels=False)
            for b, s in sub.groupby(bucket):
                rt = s[rt_col].to_numpy(float)
                rt = rt[rt > 0]
                thr = _gmm_threshold(np.log(rt), seed) if len(rt) >= min_n else np.nan
                for item in s[item_col].unique():
                    out[item] = thr
        else:
            for item in small:
                out[item] = np.nan
    return pd.Series(out, name="gmm_threshold_ms")


def tau_min_b0_ms(n_words: pd.Series) -> pd.Series:
    return n_words.map(lambda w: calculate_tau_min_seconds(int(w)) * 1000)


def flag(df: pd.DataFrame, thresholds: pd.Series, item_col: str = "item_id", rt_col: str = "rt_ms") -> pd.Series:
    thr = df[item_col].map(thresholds)
    return (df[rt_col] < thr).fillna(False)


def evaluate_flags(df: pd.DataFrame, flags: dict[str, pd.Series], correct_col: str = "is_correct") -> pd.DataFrame:
    """Unlabelled diagnostics per method: flag rate, accuracy of flagged vs unflagged responses."""
    rows = []
    for name, f in flags.items():
        f = f.astype(bool)
        rows.append({"method": name, "flag_rate": float(f.mean()),
                     "acc_flagged": float(df.loc[f, correct_col].mean()) if f.any() else np.nan,
                     "acc_unflagged": float(df.loc[~f, correct_col].mean()) if (~f).any() else np.nan,
                     "n_flagged": int(f.sum())})
    return pd.DataFrame(rows)


def agreement(flags: dict[str, pd.Series]) -> pd.DataFrame:
    """Pairwise Cohen's kappa between methods."""
    from sklearn.metrics import cohen_kappa_score

    names = list(flags)
    m = pd.DataFrame(np.eye(len(names)), index=names, columns=names)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            k = cohen_kappa_score(flags[a].astype(int), flags[b].astype(int))
            m.loc[a, b] = m.loc[b, a] = k
    return m


def simulate(n_items: int = 15, n_students: int = 200, guess_rate: float = 0.1, seed: int = 0) -> pd.DataFrame:
    """Synthetic responses: solution behaviour ~ lognormal around item time; rapid guesses ~ 1-3 s, 25% correct."""
    rng = np.random.default_rng(seed)
    rows = []
    words = rng.integers(8, 40, n_items)
    for i in range(n_items):
        base = 4000 + 600 * words[i]
        for s in range(n_students):
            guess = rng.random() < guess_rate
            rt = rng.uniform(800, 3000) if guess else rng.lognormal(np.log(base), 0.35)
            corr = rng.random() < (0.25 if guess else 0.7)
            rows.append({"item_id": i, "student": s, "rt_ms": rt, "is_correct": int(corr), "n_words": int(words[i]),
                         "true_guess": int(guess)})
    return pd.DataFrame(rows)
