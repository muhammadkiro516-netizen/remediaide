"""Layer 1 M1: CO-KT — Confidence & Option Knowledge Tracing (03 §1, T23).

Interaction token at step t:
    E_q[q] + E_kc[k] + E_corr[c] + E_opt[o] + E_cri[cri in 0..5, 6 = missing] + E_gap[log-hour bucket] + E_pos[t]
A causal transformer encoder turns tokens into h_t (uses steps <= t).
Heads
  1. next-correct : query E'_q[q_{t+1}] + E'_kc[k_{t+1}] attends to h_{<=t} (SAKT-style) -> sigmoid
  2. next-option  : 4-way from the same query
  3. future-quadrant (framing b) : 4-way from h_t (masked where no label)
Loss = BCE(next-correct) + 0.5 CE(next-option) + 0.5 CE(future-quadrant).
Ablations: no_conf (cri token forced to 6), no_option (E_opt switched off).
"""

from __future__ import annotations

import math
import time
from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd

GAP_EDGES = np.array([0, 0.05, 0.5, 2, 8, 24, 72, 168, 720])  # hours -> 10 buckets (0 = first / unknown)


@dataclass
class CoktConfig:
    d_model: int = 128
    n_layers: int = 2
    n_heads: int = 4
    d_ff: int = 256
    dropout: float = 0.2
    max_len: int = 200
    lr: float = 1e-3
    weight_decay: float = 1e-5
    batch_size: int = 64
    epochs: int = 30
    patience: int = 3
    grad_clip: float = 1.0
    w_option: float = 0.5
    w_quadrant: float = 0.5
    no_conf: bool = False
    no_option: bool = False


def gap_bucket(hours: pd.Series) -> np.ndarray:
    h = hours.to_numpy(dtype=float)
    b = np.digitize(np.nan_to_num(h, nan=-1.0), GAP_EDGES) + 1  # 1..10 for observed gaps
    b[np.isnan(h)] = 0
    return np.clip(b, 0, len(GAP_EDGES) + 1).astype(np.int64)


def build_sequences(df: pd.DataFrame, q_vocab: dict, kc_vocab: dict, max_len: int = 200) -> dict[str, np.ndarray]:
    """Cut each user's time-ordered interactions into windows of max_len (stride max_len, pyKT protocol).

    Arrays are (n_windows, max_len); pad value 0 for ids (ids are 1-based) and -1 for labels.
    """
    d = df.sort_values(["UserId", "seq_pos"], kind="mergesort")
    q = d.QuestionId.map(q_vocab).fillna(0).astype(np.int64).to_numpy()
    kc = d.kc.astype("float").map(kc_vocab).fillna(0).astype(np.int64).to_numpy()
    corr = d.IsCorrect.astype(np.int64).to_numpy()
    opt = (d.AnswerValue.astype(np.int64) - 1).clip(0, 3).to_numpy()
    cri = d.cri.astype("float").fillna(6).astype(np.int64).to_numpy()
    gap = gap_bucket(d.hours_since_prev)
    quad = d.fut_quadrant.astype("object").map({"P": 0, "L": 1, "M": 2, "T": 3}).fillna(-1).astype(np.int64).to_numpy() \
        if "fut_quadrant" in d else np.full(len(d), -1)
    aid = d.AnswerId.to_numpy(np.int64)
    users = d.UserId.to_numpy()
    starts = np.r_[0, np.flatnonzero(users[1:] != users[:-1]) + 1]
    ends = np.r_[starts[1:], len(d)]
    win = [(s, min(s + max_len, e)) for s, e in zip(starts, ends, strict=True) for s in range(s, e, max_len)]
    n = len(win)
    out = {k: np.zeros((n, max_len), np.int64) for k in ("q", "kc", "corr", "opt", "cri", "gap")}
    out["quad"] = np.full((n, max_len), -1, np.int64)
    out["aid"] = np.full((n, max_len), -1, np.int64)
    out["user"] = np.empty(n, dtype=users.dtype)
    for i, (s, e) in enumerate(win):
        L = e - s
        for k, v in (("q", q), ("kc", kc), ("corr", corr), ("opt", opt), ("cri", cri), ("gap", gap), ("quad", quad),
                     ("aid", aid)):
            out[k][i, :L] = v[s:e]
        out["user"][i] = users[s]
    out["len"] = np.array([e - s for s, e in win])
    return out


def _model(n_q: int, n_kc: int, cfg: CoktConfig):
    import torch
    from torch import nn

    class CoKT(nn.Module):
        def __init__(self):
            super().__init__()
            D = cfg.d_model
            self.e_q, self.e_kc = nn.Embedding(n_q + 1, D, padding_idx=0), nn.Embedding(n_kc + 1, D, padding_idx=0)
            self.e_corr, self.e_opt, self.e_cri = nn.Embedding(2, D), nn.Embedding(4, D), nn.Embedding(7, D)
            self.e_gap, self.e_pos = nn.Embedding(len(GAP_EDGES) + 2, D), nn.Embedding(cfg.max_len, D)
            self.qq, self.qkc = nn.Embedding(n_q + 1, D, padding_idx=0), nn.Embedding(n_kc + 1, D, padding_idx=0)
            layer = nn.TransformerEncoderLayer(D, cfg.n_heads, cfg.d_ff, cfg.dropout, batch_first=True, norm_first=True)
            self.enc = nn.TransformerEncoder(layer, cfg.n_layers, enable_nested_tensor=False)
            self.attn = nn.MultiheadAttention(D, cfg.n_heads, dropout=cfg.dropout, batch_first=True)
            self.norm = nn.LayerNorm(D)
            self.head_next = nn.Sequential(nn.Linear(2 * D, D), nn.GELU(), nn.Dropout(cfg.dropout), nn.Linear(D, 5))
            self.head_quad = nn.Sequential(nn.Linear(D, D), nn.GELU(), nn.Dropout(cfg.dropout), nn.Linear(D, 4))

        def forward(self, b):
            B, T = b["q"].shape
            pos = torch.arange(T, device=b["q"].device)
            cri = torch.full_like(b["cri"], 6) if cfg.no_conf else b["cri"]
            x = (self.e_q(b["q"]) + self.e_kc(b["kc"]) + self.e_corr(b["corr"]) + self.e_cri(cri) + self.e_gap(b["gap"])
                 + self.e_pos(pos)[None])
            if not cfg.no_option:
                x = x + self.e_opt(b["opt"])
            causal = torch.triu(torch.ones(T, T, dtype=torch.bool, device=x.device), 1)
            # explicit mask (serving: unknown items use id 0 = zero embedding but are real steps); training: q == 0
            pad = b["pad"] if "pad" in b else b["q"] == 0
            h = self.enc(x, mask=causal, src_key_padding_mask=pad)
            # next-step query for position t uses item at t+1, attends to h_{<=t}
            qn = self.qq(b["q"][:, 1:]) + self.qkc(b["kc"][:, 1:]) + self.e_pos(pos[1:])[None]
            a, _ = self.attn(qn, h[:, :-1], h[:, :-1], attn_mask=causal[: T - 1, : T - 1], key_padding_mask=pad[:, :-1])
            z = self.head_next(torch.cat([self.norm(a + qn), h[:, :-1]], -1))
            return z[..., 0], z[..., 1:], self.head_quad(h)

    return CoKT()


def _batches(seq: dict, idx: np.ndarray, bs: int, device, shuffle: bool, rng: np.random.Generator):
    import torch

    if shuffle:
        idx = rng.permutation(idx)
    for i in range(0, len(idx), bs):
        j = idx[i : i + bs]
        L = int(seq["len"][j].max())
        keys = ("q", "kc", "corr", "opt", "cri", "gap", "quad") + (("pad",) if "pad" in seq else ())
        yield {k: torch.as_tensor(seq[k][j, :L], device=device) for k in keys}, j, L


def train_eval(seq: dict, tr_idx: np.ndarray, va_idx: np.ndarray, n_q: int, n_kc: int, cfg: CoktConfig, seed: int,
               device: str = "cpu", max_epochs: int | None = None, log=print):
    """Train with early stopping on validation next-correct AUC. Returns (preds DataFrame for va, report)."""
    import torch
    import torch.nn.functional as F

    from remediaide_ml.eval.metrics import auc

    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    dev = torch.device(device)
    model = _model(n_q, n_kc, cfg).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay)
    best, best_state, bad, hist = -1.0, None, 0, []
    epochs = max_epochs or cfg.epochs
    for ep in range(epochs):
        model.train()
        t0, tot, nb = time.time(), 0.0, 0
        for b, _, _ in _batches(seq, tr_idx, cfg.batch_size, dev, True, rng):
            lc, lo, lq = model(b)
            m = b["q"][:, 1:] > 0
            loss = F.binary_cross_entropy_with_logits(lc[m], b["corr"][:, 1:][m].float())
            loss = loss + cfg.w_option * F.cross_entropy(lo[m], b["opt"][:, 1:][m])
            mq = b["quad"] >= 0
            if mq.any():
                loss = loss + cfg.w_quadrant * F.cross_entropy(lq[mq], b["quad"][mq])
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), cfg.grad_clip)
            opt.step()
            tot += float(loss.detach())
            nb += 1
        pred = predict(model, seq, va_idx, cfg, dev)
        pv = pred.dropna(subset=["p_next"])
        v_auc = auc(pv.y_next.astype(int), pv.p_next)
        hist.append({"epoch": ep, "train_loss": tot / max(nb, 1), "val_auc": v_auc, "sec": round(time.time() - t0, 1)})
        log(f"epoch {ep}: loss {tot / max(nb, 1):.4f} val AUC {v_auc:.4f} ({time.time() - t0:.0f}s)")
        if v_auc > best + 1e-4:
            best, bad = v_auc, 0
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
        else:
            bad += 1
            if bad >= cfg.patience:
                break
    model.load_state_dict(best_state)
    return predict(model, seq, va_idx, cfg, dev), {"best_val_auc": best, "history": hist, "cfg": asdict(cfg)}, model


def predict(model, seq: dict, idx: np.ndarray, cfg: CoktConfig, dev) -> pd.DataFrame:
    """Per-interaction predictions. next-* rows are for step t+1 (AnswerId of t+1); quad rows for step t."""
    import torch

    model.eval()
    rows = []
    with torch.no_grad():
        for b, j, L in _batches(seq, idx, cfg.batch_size * 4, dev, False, np.random.default_rng(0)):
            lc, lo, lq = model(b)
            pc = torch.sigmoid(lc).cpu().numpy()
            po = torch.softmax(lo, -1).cpu().numpy()
            pq = torch.softmax(lq, -1).cpu().numpy()
            for r, w in enumerate(j):
                n = int(seq["len"][w])
                aid = seq["aid"][w, :n]
                rows.append(pd.DataFrame({
                    "AnswerId": aid[1:], "p_next": pc[r, : n - 1], "y_next": seq["corr"][w, 1:n],
                    **{f"p_opt{o}": po[r, : n - 1, o] for o in range(4)}, "y_opt": seq["opt"][w, 1:n]}))
                rows.append(pd.DataFrame({"AnswerId": aid, **{f"pq_{q}": pq[r, :n, i] for i, q in enumerate("PLMT")},
                                          "y_quad": seq["quad"][w, :n], "_quad_row": True}))
    out = pd.concat(rows, ignore_index=True)
    nxt = out[out._quad_row.isna()].drop(columns=["_quad_row"] + [f"pq_{q}" for q in "PLMT"] + ["y_quad"])
    quad = out[out._quad_row.notna()][["AnswerId", *[f"pq_{q}" for q in "PLMT"], "y_quad"]]
    res = nxt.merge(quad, on="AnswerId", how="outer")
    res.attrs["n_params"] = sum(p.numel() for p in model.parameters())
    return res


def vocabularies(df: pd.DataFrame) -> tuple[dict, dict]:
    qs = np.sort(df.QuestionId.unique())
    ks = np.sort(df.kc.dropna().astype(float).unique())
    return {q: i + 1 for i, q in enumerate(qs)}, {k: i + 1 for i, k in enumerate(ks)}


def n_windows_hint(n_rows: int, max_len: int) -> int:
    return math.ceil(n_rows / max_len)
