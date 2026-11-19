import Link from "next/link";

export const metadata = { title: "Metodologi Mesin AI — RemediAide 2.0" };

// All numbers below come from ml/reports/RESULTS.md (Eedi test set, opened once; MAP numbers are cross-validation).
const rows = [
  ["Salah kelompok (uji Eedi): aturan CRI v1 → RemediAide 2.0", "45,1% → 34,7% (selisih −10,3 poin, CI −10,9 s.d. −9,7)"],
  ["Baseline regresi logistik sederhana (B1b) → RemediAide 2.0", "40,1% → 34,7% (selisih −5,3 poin, CI −5,9 s.d. −4,8)"],
  ["Recall Miskonsepsi per kasus (uji Eedi): aturan v1 → RemediAide 2.0", "40,0% → 36,8% (lebih rendah; keunggulan berasal dari kelas Paham dan Tidak paham)"],
  ["Kasus diserahkan ke guru (aturan v1 tidak pernah menyerahkan)", "20,6% → sisa salah kelompok 28,3% (aturan v1 pada kasus yang sama: 39,2%)"],
  ["Target awal: defer menurunkan salah kelompok ≥ 25%", "tidak tercapai (turun 18,5%); dipakai cadangan 20% sesuai aturan yang dikunci"],
  ["Cakupan himpunan prediksi, target 90% (aturan v1: tidak ada)", "90,0%; rata-rata 1,90 dari 4 kuadran"],
  ["Jebakan jawaban benar tertangkap (aturan v1: 0%)", "37,5%, presisi 82,1% (validasi silang MAP)"],
  ["MAP@3 alasan berbahasa Indonesia, terjemahan mesin (TF-IDF: 0,766)", "0,895"],
];

export default function MetodologiPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
      <Link href="/" className="text-sm text-blue-600 underline">← Kembali</Link>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">Metodologi Mesin AI RemediAide 2.0</h1>
      <p className="mt-4 leading-relaxed">
        RemediAide v1 memakai aturan CRI 2×2 (benar/salah × yakin/tidak). RemediAide 2.0 menambahkan tiga lapis machine
        learning: <strong>Lapis 1</strong> memprediksi kondisi siswa per konsep dari jawaban, keyakinan, dan riwayat
        (transformer knowledge tracing); <strong>Lapis 2</strong> membaca alasan satu kalimat dan menamai miskonsepsi;
        <strong> Lapis 3</strong> mengkalibrasi probabilitas, membentuk himpunan prediksi dengan target cakupan 90%, dan menyerahkan kasus ragu ke guru.
      </p>
      <h2 className="mt-10 text-xl font-bold text-slate-900">Hasil evaluasi</h2>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-t border-slate-200">
              <td className="py-2 pr-4">{k}</td>
              <td className="py-2 font-semibold">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-slate-500">
        Data: Eedi NeurIPS 2020 (CC BY-NC-ND 4.0) dan MAP (MIT). Angka uji Eedi berasal dari 20% siswa yang dikunci sejak awal
        dan dibuka satu kali. Label adalah kondisi siswa tiga soal berikutnya, bukan penilaian guru.
      </p>
      <h2 className="mt-10 text-xl font-bold text-slate-900">Keterbatasan</h2>
      <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">
        <li>Model dilatih pada data siswa Inggris dan AS; validasi dengan guru Indonesia direncanakan pada pilot.</li>
        <li>Alasan berbahasa Indonesia diuji dengan terjemahan mesin, bukan tulisan asli siswa.</li>
        <li>Model lebih sering salah untuk siswa berkemampuan rendah dan siswa dari keluarga kurang mampu (pupil premium); kesenjangan ini tidak hilang. Kasus ragu di kelompok ini lebih sering diserahkan ke guru.</li>
        <li>Hasil AI tidak boleh dipakai untuk nilai rapor atau kenaikan kelas.</li>
      </ul>
      <h2 id="privasi" className="mt-10 text-xl font-bold text-slate-900">Privasi & Data (UU PDP)</h2>
      <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">
        <li>Siswa memakai label anonim; jawaban mentah dan alasan dihapus oleh Auto-Wipe setelah siklus remediasi.</li>
        <li>Layanan AI menerima ID siswa yang sudah di-hash (HMAC), tidak menyimpan data, dan tidak mencatat teks alasan.</li>
        <li>Ekspor riset hanya tersedia bila persetujuan orang tua/wali sudah dicatat guru (UU PDP Pasal 25), tanpa nama atau label siswa.</li>
      </ul>
    </main>
  );
}
