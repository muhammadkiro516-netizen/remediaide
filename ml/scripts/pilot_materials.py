"""T70/T71: generate the pilot materials (no student data involved).

  python scripts/pilot_materials.py      (needs the optional extra: pip install -e ".[pilot]")
Writes to docs/cac/pilot/:
  instrument_map_id.json / instrument_map_id.md   15 MAP questions in Indonesian (+ English + auto translation)
  figures/map-*.svg                               redrawn pictures (flagged for teacher review)
  consent_form.pdf                                parent/guardian consent, A4, 1 page (06 §4)
  teacher_info.pdf                                information sheet for the teachers (session + labeling)
  labeling_sheet.xlsx                             rubric dropdowns per question, guide sheet, 20 practice + 200 rows
and reports/tables/T70_key_question_selection.csv (D-25).
"""

from __future__ import annotations

import pandas as pd

from remediaide_ml.paths import INTERIM, PROCESSED, REPO_ROOT, TABLES
from remediaide_ml.pilot.instrument import build_instrument, key_question_ranking, write_instrument, write_svgs

PILOT = REPO_ROOT / "docs" / "cac" / "pilot"
EXTRA_CODES = [("BENAR", "Benar dengan nalar benar"), ("TIDAK_JELAS", "Tidak jelas / tidak cukup informasi"),
               ("LAIN", "Miskonsepsi lain (tulis di kolom catatan)")]


def instrument_md(inst: dict) -> str:
    out = [f"# {inst['name']}", "", f"Versi {inst['version']}. Sumber: {inst['source']}. Aturan soal kunci: {inst['key_question_rule']}.",
           "Dibuat otomatis oleh `ml/scripts/pilot_materials.py`; teks Indonesia adalah revisi manual dari terjemahan mesin.",
           "Soal bertanda **[cek guru]** perlu diperiksa guru sebelum dipakai.", ""]
    for it in inst["items"]:
        flag = " **[cek guru]**" if it["needs_teacher_check"] else ""
        alasan = " · *minta alasan*" if it["require_explanation"] else ""
        out += [f"## {it['order']}. MAP {it['map_question_id']}{flag}{alasan}", "", it["stem_id"], ""]
        if it["figure"]:
            out += [f"![gambar soal {it['map_question_id']}](figures/{it['figure']})", ""]
        for o in it["options"]:
            out.append(f"- **{o['key']}.** {o['text_id']}{'  ✔' if o['is_correct'] else ''}")
        out += ["", f"<sub>Asli: {it['stem_en']} · Terjemahan mesin: {it['stem_auto_id']}</sub>"]
        if it["teacher_check"]:
            out += ["", f"> Catatan untuk guru: {it['teacher_check']}"]
        out.append("")
    return "\n".join(out)


def _pdf(path, title, blocks):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    ss = getSampleStyleSheet()
    body = ParagraphStyle("b", parent=ss["BodyText"], fontSize=10, leading=13.5)
    head = ParagraphStyle("h", parent=ss["Heading2"], fontSize=13, spaceAfter=6)
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=1.6 * cm,
                            bottomMargin=1.6 * cm, title=title, author="Tim RemediAide", invariant=1)  # reproducible bytes
    story = [Paragraph(title, head)]
    for b in blocks:
        story += [Paragraph(b, body), Spacer(1, 5)]
    doc.build(story)


def consent_pdf(path):
    _pdf(path, "Permohonan Persetujuan Keikutsertaan dalam Uji Coba Aplikasi Pembelajaran RemediAide", [
        "Yth. Bapak/Ibu Orang Tua/Wali dari ________________________________ (kelas ______)",
        "Tim mahasiswa Universitas Pancasila sedang menguji aplikasi <b>RemediAide</b>, yang membantu guru mengenali "
        "kesalahan konsep matematika siswa supaya remediasi lebih tepat sasaran. Kegiatan ini bekerja sama dengan "
        "SMA Advent Tanjung Barat.",
        "<b>Kegiatan:</b> siswa mengerjakan 15 soal pilihan ganda di HP selama sekitar 20 menit pada jam pelajaran "
        "matematika, menggeser tingkat keyakinan untuk tiap jawaban, dan menulis alasan singkat pada 5 soal.",
        "<b>Data yang dicatat:</b> jawaban, tingkat keyakinan, lama mengerjakan tiap soal, dan alasan tertulis. "
        "<b>Tidak dicatat:</b> nama, NIS, nomor HP, foto, atau lokasi. Data disimpan dengan kode acak, hanya dipakai "
        "untuk penelitian dan pengembangan aplikasi ini, tidak dikirim ke layanan pihak ketiga, dan dihapus paling "
        "lambat tanggal ______________.",
        "<b>Hak Bapak/Ibu dan anak:</b> keikutsertaan sukarela. Bapak/Ibu atau anak boleh menolak atau berhenti kapan "
        "saja tanpa konsekuensi apa pun, dan hasilnya <b>tidak memengaruhi nilai</b>. Siswa yang tidak ikut tetap boleh "
        "mengerjakan soal sebagai latihan kelas, tetapi datanya tidak dipakai untuk penelitian. Permintaan penghapusan "
        "data bisa diajukan ke kontak di bawah. Dasar hukum: UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi, "
        "Pasal 25 (data pribadi anak).",
        "<b>Kontak:</b> ketua tim ________________________ (email/HP ________________________), "
        "dosen pendamping ________________________.",
        "[&nbsp;&nbsp;&nbsp;] Saya <b>setuju</b> anak saya ikut serta dan datanya dipakai sesuai keterangan di atas.",
        "[&nbsp;&nbsp;&nbsp;] Saya <b>tidak setuju</b>.",
        "Nama orang tua/wali: ______________________ Tanda tangan: ______________________ Tanggal: ____________",
        "<i>Persetujuan siswa (assent):</i> [&nbsp;&nbsp;&nbsp;] Saya mengerti dan mau ikut. Nama panggilan/inisial: ________ "
        "Tanda tangan: ____________",
    ])


def teacher_pdf(path, inst):
    keys = ", ".join(str(i["map_question_id"]) for i in inst["items"] if i["require_explanation"])
    _pdf(path, "Lembar Informasi untuk Guru — Pilot RemediAide", [
        "<b>Tujuan.</b> Menguji apakah RemediAide 2.0 membantu guru mengelompokkan siswa untuk remediasi dan mengenali "
        "miskonsepsi dari alasan singkat siswa. Hasil uji tidak dipakai untuk nilai rapor.",
        "<b>Peran Bapak/Ibu.</b> (1) Mendampingi satu sesi 30 menit per kelas (5 menit penjelasan, 20 menit mengerjakan, "
        "5 menit penutup). (2) Melabeli alasan siswa secara <b>mandiri</b> di <i>labeling_sheet.xlsx</i>: 20 contoh latihan "
        "bersama, lalu 200 alasan inti, tanpa melihat label model atau label guru lain (±2 jam).",
        f"<b>Instrumen.</b> 15 soal MAP berbahasa Indonesia; 5 soal meminta alasan satu kalimat (MAP {keys}). Tiga soal "
        "bergambar digambar ulang; mohon dicek sebelum sesi (daftar di <i>instrument_map_id.md</i>).",
        "<b>Data.</b> Hanya siswa dengan persetujuan orang tua/wali yang datanya diekspor. Tidak ada nama atau NIS dalam "
        "data riset. Data disimpan di laptop tim, tidak di-commit, tidak dikirim ke pihak ketiga, dan dihapus sesuai tanggal "
        "di formulir persetujuan.",
        "<b>Rubrik pelabelan.</b> Setiap soal punya daftar kode miskonsepsi dari kamus MAP (deskripsi Bahasa Indonesia), "
        "ditambah tiga kode umum: <i>Benar dengan nalar benar</i>, <i>Tidak jelas / tidak cukup informasi</i>, dan "
        "<i>Miskonsepsi lain (tulis)</i>. Definisi dan contoh ada di sheet <i>Panduan</i>.",
        "<b>Setelah sesi.</b> Guru menekan <i>Ekspor riset</i> di dasbor sebelum Auto-Wipe. Ketidaksepakatan label "
        "diselesaikan lewat diskusi menjadi label konsensus.",
        "<b>Kontak tim:</b> ________________________",
    ])


def labeling_xlsx(path, inst, dictionary: pd.DataFrame, examples: pd.DataFrame):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.workbook.defined_name import DefinedName
    from openpyxl.worksheet.datavalidation import DataValidation

    wb = Workbook()
    ws = wb.active
    ws.title = "Label"
    rub = wb.create_sheet("Rubrik")
    guide = wb.create_sheet("Panduan")
    head = Font(bold=True, color="FFFFFF")
    fill = PatternFill("solid", fgColor="1E3A8A")
    # rubric: one column per question, defined name Q<id>
    for c, it in enumerate(inst["items"], 1):
        q = it["map_question_id"]
        labs = dictionary[dictionary.question_ids.astype(str).str.split(r"[;,| ]").map(lambda xs, q=q: str(q) in xs)]
        codes = [f"{r.label} — {r.deskripsi_id}" for r in labs.itertuples()] + [f"{k} — {v}" for k, v in EXTRA_CODES]
        rub.cell(1, c, f"MAP {q}").font = Font(bold=True)
        for r, code in enumerate(codes, 2):
            rub.cell(r, c, code)
        col = rub.cell(1, c).column_letter
        wb.defined_names[f"Q{q}"] = DefinedName(f"Q{q}", attr_text=f"Rubrik!${col}$2:${col}${len(codes) + 1}")
    cols = ["no", "jenis", "map_question_id", "soal", "jawaban_siswa", "benar", "alasan_siswa", "kode_label", "catatan",
            "id_baris"]
    widths = [5, 9, 10, 50, 14, 7, 60, 55, 30, 14]
    for c, (name, w) in enumerate(zip(cols, widths, strict=True), 1):
        cell = ws.cell(1, c, name)
        cell.font, cell.fill = head, fill
        ws.column_dimensions[cell.column_letter].width = w
    ws.freeze_panes = "A2"
    n_rows = 220  # 20 practice + 200 core (06 §5)
    for r in range(2, n_rows + 2):
        ws.cell(r, 1, r - 1)
        ws.cell(r, 2, "latihan" if r - 1 <= 20 else "inti")
        for c in (4, 7):
            ws.cell(r, c).alignment = Alignment(wrap_text=True, vertical="top")
    dv = DataValidation(type="list", formula1='=INDIRECT("Q"&$C2)', allow_blank=True, showErrorMessage=True,
                        errorTitle="Kode tidak valid", error="Pilih kode dari daftar rubrik soal ini.")
    dv.add(f"H2:H{n_rows + 1}")
    ws.add_data_validation(dv)
    # guide
    g = ["Panduan pelabelan (06_PILOT_PROTOCOL §5)", "",
         "1. Labeli secara mandiri. Jangan melihat label guru lain atau label model.",
         "2. Isi kolom kode_label dengan dropdown. Daftar kode berbeda per soal (kolom map_question_id).",
         "3. Pakai 'BENAR' bila jawaban benar dan nalarnya benar; 'TIDAK_JELAS' bila alasan terlalu pendek atau tidak "
         "menjelaskan; 'LAIN' bila ada miskonsepsi yang tidak ada di daftar (tulis di kolom catatan).",
         "4. Baris 'latihan' (1–20) dikerjakan bersama untuk kalibrasi dan tidak dihitung dalam kappa.",
         "5. Jangan mengubah kolom selain kode_label dan catatan.", "",
         "Definisi kode dan contoh (contoh dari data MAP berbahasa Inggris, diterjemahkan mesin; MIT):"]
    for r, line in enumerate(g, 1):
        guide.cell(r, 1, line).font = Font(bold=(r == 1))
    hdr = ["kode", "soal (MAP)", "topik", "definisi", "contoh alasan (terjemahan mesin)"]
    base = len(g) + 2
    for c, h in enumerate(hdr, 1):
        guide.cell(base, c, h).font = Font(bold=True)
    r = base + 1
    for row in dictionary.itertuples():
        ex = examples.get(row.label, "")
        for c, v in enumerate([row.label, str(row.question_ids), row.topik_id, row.deskripsi_id, ex], 1):
            guide.cell(r, c, v).alignment = Alignment(wrap_text=True, vertical="top")
        r += 1
    for k, v in EXTRA_CODES:
        guide.cell(r, 1, k)
        guide.cell(r, 2, "semua")
        guide.cell(r, 4, v)
        r += 1
    for c, w in zip("ABCDE", [16, 16, 24, 60, 70], strict=True):
        guide.column_dimensions[c].width = w
    import datetime as dt

    fixed = dt.datetime(2026, 11, 19)  # fixed metadata -> reproducible file
    wb.properties.created = wb.properties.modified = fixed
    wb.properties.creator = wb.properties.lastModifiedBy = "Tim RemediAide"
    wb.save(path)
    _fix_zip_times(path)


def _fix_zip_times(path) -> None:
    """xlsx is a zip; rewrite every entry with a fixed timestamp so the file is byte-reproducible."""
    import zipfile

    with zipfile.ZipFile(path) as z:
        entries = [(i, z.read(i.filename)) for i in z.infolist()]
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for info, data in entries:
            zi = zipfile.ZipInfo(info.filename, date_time=(2026, 11, 19, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(zi, data)


def main():
    m = pd.read_parquet(INTERIM / "map.parquet")
    map_id = pd.read_parquet(PROCESSED / "map_id.parquet")
    TABLES.mkdir(parents=True, exist_ok=True)
    key_question_ranking(m).to_csv(TABLES / "T70_key_question_selection.csv", index=False)
    inst = build_instrument(m, map_id)
    PILOT.mkdir(parents=True, exist_ok=True)
    write_instrument(inst, PILOT / "instrument_map_id.json")
    (PILOT / "instrument_map_id.md").write_text(instrument_md(inst) + "\n")
    write_svgs(PILOT / "figures")
    consent_pdf(PILOT / "consent_form.pdf")
    teacher_pdf(PILOT / "teacher_info.pdf", inst)
    dictionary = pd.read_csv(TABLES / "map_misconception_dictionary.csv")
    d = m.merge(map_id[["row_id", "StudentExplanation_id"]], on="row_id")
    d = d[d.category3 == "Misconception"].sort_values("row_id")
    examples = {lab: g.StudentExplanation_id.iloc[0] for lab, g in d.groupby("misconception")}
    labeling_xlsx(PILOT / "labeling_sheet.xlsx", inst, dictionary, examples)
    keys = [i["map_question_id"] for i in inst["items"] if i["require_explanation"]]
    print(f"instrument: {len(inst['items'])} questions, key questions {keys}; files in {PILOT}")


if __name__ == "__main__":
    main()
