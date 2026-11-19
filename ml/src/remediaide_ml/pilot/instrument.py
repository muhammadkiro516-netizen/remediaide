"""T70: pilot instrument — the 15 MAP questions in Indonesian (06_PILOT_PROTOCOL §2).

Options come from the MAP data (unique MC_Answer per QuestionId, correct = True_ prefix). Indonesian wording is a manual
revision of the opus-mt-en-id output (stored side by side). Math is written as plain text because the app does not
render LaTeX. Questions that depend on a picture get a redrawn SVG (FIGURES) and are flagged for teacher review.
Key questions that ask for a one-sentence reason: top-5 by entropy of misconception labels in MAP (D-25).
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

# QuestionId -> (Indonesian stem, {MAP MC_Answer -> Indonesian option}, note for the teacher check)
MANUAL_ID: dict[int, tuple[str, dict[str, str], str]] = {
    31772: ("Berapa bagian dari bangun segitiga di bawah ini yang TIDAK diarsir? Tuliskan dalam bentuk pecahan paling "
            "sederhana.",
            {r"\( \frac{1}{3} \)": "1/3", r"\( \frac{3}{6} \)": "3/6", r"\( \frac{3}{8} \)": "3/8",
             r"\( \frac{3}{9} \)": "3/9"},
            "Gambar digambar ulang: segitiga dibagi 9 segitiga kecil sama besar, 6 diarsir. Letak arsiran asli tidak "
            "diketahui; cek apakah gambar jelas."),
    31774: ("Hitunglah 1/2 ÷ 6.",
            {r"\( 3 \)": "3", r"\( \frac{1}{12} \)": "1/12", r"\( \frac{1}{3} \)": "1/3", r"\( \frac{6}{2} \)": "6/2"}, ""),
    31777: ("Sebuah kotak berisi 120 keping. Setiap keping berwarna merah atau biru. Sebanyak 3/5 dari keping itu "
            "berwarna merah. Berapa banyak keping merah?",
            {r"\( 24 \)": "24", r"\( 48 \)": "48", r"\( 60 \)": "60", r"\( 72 \)": "72"},
            "'counters' diterjemahkan 'keping'."),
    31778: ("A/10 = 9/15. Berapa nilai A?",
            {r"\( 3 \)": "3", r"\( 4 \)": "4", r"\( 6 \)": "6", r"\( 9 \)": "9"}, ""),
    32829: ("2y = 24. Berapa nilai y?",
            {r"\( 4 \)": "4", r"\( 12 \)": "12", r"\( 22 \)": "22", r"\( 48 \)": "48"}, ""),
    32833: ("Hitunglah 2/3 × 5.",
            {r"\( 3 \frac{1}{3} \)": "3 1/3", r"\( 5 \frac{2}{3} \)": "5 2/3", r"\( \frac{10}{15} \)": "10/15",
             r"\( \frac{2}{15} \)": "2/15"},
            "Pecahan campuran ditulis '3 1/3'; cek apakah siswa terbiasa dengan penulisan ini."),
    32835: ("Bilangan manakah yang paling besar?",
            {r"\( 6 \)": "6", r"\( 6.0001 \)": "6,0001", r"\( 6.079 \)": "6,079", r"\( 6.2 \)": "6,2"},
            "Tanda desimal diubah ke koma (Indonesia). Miskonsepsi 'lebih banyak angka = lebih besar' tetap teruji."),
    33471: ("Sebuah kantong berisi 24 bola berwarna kuning dan hijau. Sebanyak 3/8 dari bola itu berwarna kuning. "
            "Berapa banyak bola hijau?",
            {r"\( 3 \)": "3", r"\( 8 \)": "8", r"\( 9 \)": "9", r"\( 15 \)": "15"}, ""),
    33472: ("1/3 + 2/5 = ...",
            {r"\( \frac{3}{8} \)": "3/8", r"\( \frac{3}{15} \)": "3/15", r"\( \frac{11}{15} \)": "11/15",
             r"\( \frac{11}{30} \)": "11/30"}, ""),
    33474: ("Sari punya 2/3 bagian dari sebuah kue utuh di kulkas. Rudi memakan 1/3 dari potongan kue itu. Berapa bagian "
            "dari kue utuh yang dimakan Rudi? Pilih kalimat matematika yang tepat untuk menyelesaikan soal ini.",
            {r"\( \frac{1}{3} \times \frac{2}{3} \)": "1/3 × 2/3", r"\( \frac{1}{3}+\frac{2}{3} \)": "1/3 + 2/3",
             r"\( \frac{2}{3} \div \frac{1}{3} \)": "2/3 ÷ 1/3", r"\( \frac{2}{3}-\frac{1}{3} \)": "2/3 − 1/3"},
            "Nama Sally/Robert diganti Sari/Rudi."),
    76870: ("Gambar di bawah ini adalah bagian dari sebuah segi banyak beraturan. Berapa banyak sisi segi banyak itu?",
            {r"\( 5 \)": "5", r"\( 6 \)": "6", r"\( 10 \)": "10", "Not enough information": "Informasi tidak cukup"},
            "Gambar digambar ulang: dua sisi bertemu pada sudut dalam 144°. Cek apakah sudut terbaca sebagai sudut dalam."),
    89443: ("Bilangan berapa yang tepat untuk mengisi kotak?  (−8) − (−5) = □",
            {r"\( -13 \)": "−13", r"\( -3 \)": "−3", r"\( 3 \)": "3", r"\( 13 \)": "13"}, ""),
    91695: ("Titik-titik disusun membentuk pola seperti gambar. Pola 1 terdiri atas 6 titik, Pola 2 terdiri atas 10 titik, "
            "Pola 3 terdiri atas 14 titik, dan Pola 4 terdiri atas 18 titik. Berapa banyak titik pada Pola 6?",
            {r"\( 20 \)": "20", r"\( 22 \)": "22", r"\( 26 \)": "26", r"\( 36 \)": "36"},
            "Gambar digambar ulang (dua baris titik). Susunan titik asli tidak diketahui; jumlah titik sesuai soal."),
    104665: ("Tiga orang membutuhkan total 192 jam untuk membangun sebuah tembok. Berapa lama waktu yang dibutuhkan jika "
             "12 orang membangun tembok yang sama?",
             {r"\( 48 \) hours": "48 jam", r"\( 64 \) hours": "64 jam", r"\( 192 \) hours": "192 jam",
              r"\( 768 \) hours": "768 jam"}, ""),
    109465: ("Peluang terjadinya suatu kejadian adalah 0,9. Pernyataan manakah yang paling tepat menggambarkan kemungkinan "
             "kejadian itu?",
             {"Certain": "Pasti terjadi", "Likely": "Kemungkinan besar terjadi", "Unlikely": "Kemungkinan kecil terjadi",
              "Impossible": "Mustahil terjadi"},
             "Tanda desimal diubah ke koma."),
}
OPTION_ORDER = "ABCD"
FIGURES = {31772: "map-31772.svg", 76870: "map-76870.svg", 91695: "map-91695.svg"}
N_KEY = 5


def key_question_ranking(m: pd.DataFrame) -> pd.DataFrame:
    """D-25: entropy (bits) of misconception labels among Misconception rows; ties broken by Misconception share."""
    rows = []
    for q, d in m.groupby("QuestionId"):
        mis = d[d.category3 == "Misconception"].misconception
        p = mis.value_counts(normalize=True).to_numpy()
        rows.append({"QuestionId": int(q), "n_baris": len(d), "porsi_miskonsepsi": float((d.category3 == "Misconception").mean()),
                     "n_label_miskonsepsi": int(mis.nunique()), "entropi_bit": float(-(p * np.log2(p)).sum()) if len(p) else 0.0})
    r = pd.DataFrame(rows).sort_values(["entropi_bit", "porsi_miskonsepsi"], ascending=False).reset_index(drop=True)
    r["peringkat"] = np.arange(1, len(r) + 1)
    r["minta_alasan"] = r.peringkat <= N_KEY
    return r


def _sort_key(s: str):
    try:
        return (0, float(s.replace("−", "-").replace(",", ".").split()[0].split("/")[0]))
    except ValueError:
        return (1, s)


def build_instrument(m: pd.DataFrame, map_id: pd.DataFrame) -> dict:
    """m = interim map.parquet, map_id = processed map_id.parquet (auto translation)."""
    rank = key_question_ranking(m).set_index("QuestionId")
    d = m.merge(map_id[["row_id", "QuestionText_id", "MC_Answer_id"]], on="row_id", how="left")
    items = []
    for order, (q, g) in enumerate(sorted(d.groupby("QuestionId"), key=lambda t: t[0]), 1):
        stem_id, opt_map, note = MANUAL_ID[int(q)]
        opts = g.groupby("MC_Answer").agg(correct=("is_correct_answer", "first"), auto_id=("MC_Answer_id", "first"),
                                          n=("row_id", "size"))
        assert len(opts) == 4, f"{q}: {len(opts)} options"
        assert int(opts.correct.sum()) == 1, f"{q}: not exactly one correct option"
        assert set(opts.index) == set(opt_map), f"{q}: option text mismatch {set(opts.index) ^ set(opt_map)}"
        ordered = sorted(opts.index, key=lambda o: _sort_key(opt_map[o]))
        options = []
        for k, o in zip(OPTION_ORDER, ordered, strict=True):
            options.append({"key": k, "text_id": opt_map[o], "text_en": o, "auto_id": opts.loc[o, "auto_id"],
                            "is_correct": bool(opts.loc[o, "correct"]), "n_map": int(opts.loc[o, "n"])})
        first = g.iloc[0]
        items.append({"order": order, "map_question_id": int(q), "stem_id": stem_id, "stem_en": first.QuestionText,
                      "stem_auto_id": first.QuestionText_id, "options": options,
                      "correct_key": next(x["key"] for x in options if x["is_correct"]),
                      "require_explanation": bool(rank.loc[q, "minta_alasan"]),
                      "figure": FIGURES.get(int(q)), "teacher_check": note,
                      "needs_teacher_check": bool(note) or int(q) in FIGURES})
    return {"name": "Instrumen pilot RemediAide-ID (15 soal MAP)", "version": "1.0", "source": "MAP (MIT), terjemahan manual",
            "key_question_rule": "D-25: 5 soal dengan entropi label miskonsepsi tertinggi di MAP", "items": items}


# ------------------------------------------------------------------ SVG figures (simple redraws)
def svg_31772() -> str:
    """Triangle split into 9 equal triangles (rows of 1, 3, 5); the 6 triangles of the top and bottom rows shaded."""
    A, B, C = np.array([150, 15]), np.array([15, 249]), np.array([285, 249])

    def p(i, j):  # lattice point: i steps down from A (0..3), j steps right (0..i)
        return A + (B - A) * i / 3 + (C - B) * j / 3

    tris = []
    for i in range(3):
        for j in range(i + 1):
            tris.append(("up", i, (p(i, j), p(i + 1, j), p(i + 1, j + 1))))
            if j < i:
                tris.append(("down", i, (p(i, j), p(i, j + 1), p(i + 1, j + 1))))
    shaded = {0, 2}  # rows with 1 and 5 small triangles -> 6 shaded, 3 not shaded
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 265" width="300" height="265" role="img" '
           'aria-label="Segitiga dibagi 9 segitiga kecil, 6 diarsir">']
    for _, row, pts in tris:
        fill = "#94a3b8" if row in shaded else "#ffffff"
        out.append(f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" fill="{fill}" stroke="#0f172a" stroke-width="2"/>')
    out.append("</svg>")
    return "\n".join(out)


def svg_76870() -> str:
    """Part of a regular polygon: two sides meeting at an interior angle of 144 degrees (exterior turn 36 degrees);
    the neighbouring sides are dashed and turn by the same 36 degrees."""
    import math

    v = np.array([160.0, 150.0])
    L = 110.0
    a1, a2 = math.radians(198), math.radians(198 - 144)
    p1 = v + L * np.array([math.cos(a1), -math.sin(a1)])
    p2 = v + L * np.array([math.cos(a2), -math.sin(a2)])

    def rot(d, ang):
        c, s_ = math.cos(ang), math.sin(ang)
        return np.array([c * d[0] - s_ * d[1], s_ * d[0] + c * d[1]])

    d1 = (v - p1) / np.linalg.norm(v - p1)
    d2 = (p2 - v) / np.linalg.norm(p2 - v)
    turn = math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1 @ d2)  # signed exterior angle (36 deg)
    p3 = p2 + 0.45 * L * rot(d2, turn)
    p0 = p1 - 0.45 * L * rot(d1, -turn)
    r = 30
    s = v + r * np.array([math.cos(a1), -math.sin(a1)])
    e = v + r * np.array([math.cos(a2), -math.sin(a2)])
    return "\n".join([
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="320" height="200" role="img" '
        'aria-label="Dua sisi segi banyak beraturan dengan sudut dalam 144 derajat">',
        f'<line x1="{p1[0]:.1f}" y1="{p1[1]:.1f}" x2="{v[0]:.1f}" y2="{v[1]:.1f}" stroke="#0f172a" stroke-width="3"/>',
        f'<line x1="{v[0]:.1f}" y1="{v[1]:.1f}" x2="{p2[0]:.1f}" y2="{p2[1]:.1f}" stroke="#0f172a" stroke-width="3"/>',
        f'<path d="M {s[0]:.1f} {s[1]:.1f} A {r} {r} 0 0 1 {e[0]:.1f} {e[1]:.1f}" fill="none" stroke="#2563eb" stroke-width="2"/>',
        f'<text x="{v[0] - 18:.1f}" y="{v[1] - 40:.1f}" font-family="sans-serif" font-size="18" fill="#1e3a8a">144°</text>',
        f'<line x1="{p0[0]:.1f}" y1="{p0[1]:.1f}" x2="{p1[0]:.1f}" y2="{p1[1]:.1f}" stroke="#0f172a" stroke-width="2" stroke-dasharray="5,5"/>',
        f'<line x1="{p2[0]:.1f}" y1="{p2[1]:.1f}" x2="{p3[0]:.1f}" y2="{p3[1]:.1f}" stroke="#0f172a" stroke-width="2" stroke-dasharray="5,5"/>',
        "</svg>"])


def svg_91695() -> str:
    """Patterns 1-4 with 6, 10, 14, 18 dots: two rows of (2n + 1) dots."""
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 120" width="560" height="120" role="img" '
           'aria-label="Pola titik 1 sampai 4 dengan 6, 10, 14, dan 18 titik">']
    x0 = 10
    for n in range(1, 5):
        k = 2 * n + 1
        for row in range(2):
            for c in range(k):
                out.append(f'<circle cx="{x0 + c * 14 + 6}" cy="{30 + row * 16}" r="5" fill="#0f172a"/>')
        out.append(f'<text x="{x0}" y="90" font-family="sans-serif" font-size="14" fill="#334155">Pola {n}</text>')
        x0 += k * 14 + 26
    out.append("</svg>")
    return "\n".join(out)


SVG = {"map-31772.svg": svg_31772, "map-76870.svg": svg_76870, "map-91695.svg": svg_91695}


def write_svgs(out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for name, f in SVG.items():
        (out_dir / name).write_text(f() + "\n")
        paths.append(out_dir / name)
    return paths


def write_instrument(inst: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(inst, ensure_ascii=False, indent=2) + "\n")
