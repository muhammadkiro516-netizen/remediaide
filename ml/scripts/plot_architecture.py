"""Architecture figure for README/REPORT: reports/figures/arsitektur.png (dpi 200, Indonesian labels)."""
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

from remediaide_ml.paths import FIGURES

fig, ax = plt.subplots(figsize=(11, 6.2))
ax.set_xlim(0, 11)
ax.set_ylim(0, 6.7)
ax.axis("off")


def box(x, y, w, h, title, body, color):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.04,rounding_size=0.12", fc=color, ec="#333", lw=1))
    ax.text(x + w / 2, y + h - 0.25, title, ha="center", va="top", fontsize=10.5, weight="bold")
    ax.text(x + w / 2, y + h - (0.95 if "\n" in title else 0.62), body, ha="center", va="top", fontsize=8.3, linespacing=1.35)


def arrow(x1, y1, x2, y2):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle="-|>", mutation_scale=14, lw=1.2, color="#333"))


box(0.2, 2.2, 2.3, 2.6, "Sinyal per jawaban",
    "opsi dipilih\nbenar / salah\nkeyakinan 0–5 (CRI)\nriwayat per konsep\nalasan 1 kalimat\nwaktu respons", "#EEF2F7")
box(3.1, 3.7, 3.2, 2.2, "Lapis 1 — Pelacak Penguasaan",
    "CO-KT transformer (5 seed)\nkuadran masa depan P/L/M/T\n+ peluang benar berikutnya\nLightGBM: alasan SHAP + cadangan\ndata: Eedi 2020 (1,38 jt jawaban)", "#DCEBFA")
box(3.1, 0.9, 3.2, 2.4, "Lapis 2 — Pembaca Alasan",
    "TF-IDF+LR (input Inggris)\nmDeBERTa-v3 (input Indonesia)\nkategori + nama miskonsepsi\n'benar tapi nalar keliru'\ndata: MAP (36.696 alasan)", "#E3F4E1")
box(6.9, 2.0, 2.4, 3.0, "Lapis 3 —\nPengambil Keputusan",
    "kalibrasi temperature\nfusi naive-Bayes L1 × L2\nconformal LAC α = 0,1\nselective prediction:\nkasus ragu → guru", "#FFF1D6")
box(9.6, 3.4, 1.25, 1.6, "Guru", "kelompok\nremediasi\n+ antrean\n\"perlu dicek\"", "#F6E0E0")
box(9.6, 1.2, 1.25, 1.6, "Aturan v1", "fallback &\npembanding\n(B0)", "#EEEEEE")
box(0.2, 0.3, 2.3, 1.4, "Pengaman", "deteksi tebakan cepat\n(NT10 / GMM / τmin)\nmenunggu data pilot", "#F2F2F2")
arrow(2.5, 4.0, 3.1, 4.6)
arrow(2.5, 3.0, 3.1, 2.3)
arrow(6.3, 4.6, 6.9, 4.0)
arrow(6.3, 2.1, 6.9, 2.9)
arrow(9.3, 3.8, 9.6, 4.1)
arrow(9.3, 2.6, 9.6, 2.1)
ax.text(5.5, 6.65, "RemediAide 2.0: diagnosis miskonsepsi 3 lapis ML + 1 pengaman", ha="center", va="top", fontsize=12.5, weight="bold")
FIGURES.mkdir(parents=True, exist_ok=True)
fig.savefig(FIGURES / "arsitektur.png", dpi=200, bbox_inches="tight")
print(FIGURES / "arsitektur.png")
