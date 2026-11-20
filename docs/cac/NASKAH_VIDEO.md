# Naskah video demo 2 menit — RemediAide 2.0

Untuk direkam oleh Salman (M20). Bahasa lisan, santai tetapi jelas. Sekitar 260 kata, kira-kira 2 menit dengan jeda.
Rekam layar dengan akun juri di https://remediaide.vercel.app (data demo sintetis). Angka di naskah berasal dari
`ml/reports/tables/headline.json` dan `ml/reports/RESULTS.md`; jangan mengubahnya saat merekam.

## Urutan layar dan narasi

| Waktu | Layar yang direkam | Narasi |
| --- | --- | --- |
| 0:00–0:15 | Halaman utama remediaide.vercel.app, gulir ke bagian "Mesin AI 3 Lapis" | "Guru matematika sering memakai tes keyakinan CRI untuk tahu siapa yang perlu remediasi. Masalahnya, aturan CRI yang tetap itu salah mengelompokkan hampir separuh kasus." |
| 0:15–0:35 | `/metodologi`, sorot tabel hasil | "Kami menguji di data Eedi, pada siswa yang tidak pernah dilihat model. Aturan lama salah 45,1 persen. RemediAide 2.0 turun ke 34,7 persen. Kasus yang paling meragukan, sekitar seperlimanya, diserahkan ke guru." |
| 0:35–0:50 | Login sebagai juri, tunjukkan banner "Mode juri" lalu Kelas Demo 8A | "Ini kelas demo dengan 32 siswa sintetis. Mereka menjawab 15 soal pecahan dan desimal, menggeser tingkat keyakinan, dan menulis alasan satu kalimat." |
| 0:50–1:15 | Hasil sesi → tombol Mode AI → panel "Perlu dicek guru" | "Lapis satu membaca riwayat jawaban dan keyakinan. Lapis dua membaca alasan siswa dan menamai miskonsepsinya. Lapis tiga tahu kapan ragu, lalu memasukkan siswa ke antrean ini supaya guru yang memutuskan." |
| 1:15–1:35 | Buka satu siswa di antrean, sorot tiga alasan dan label miskonsepsi | "Setiap keputusan punya alasan yang bisa dibaca guru, misalnya jawaban saat ini salah, atau akurasi keseluruhan masih rendah. Ada juga siswa yang jawabannya benar tetapi nalarnya keliru. Aturan lama tidak bisa menangkap mereka." |
| 1:35–1:50 | Kelompok remedial per miskonsepsi → tombol "Unduh LKPD" (tunjuk saja) | "Guru langsung mendapat kelompok remedial per miskonsepsi, lengkap dengan lembar kerja." |
| 1:50–2:00 | README di GitHub (bagian "Yang jujur kami akui") | "Kami juga jujur soal batasnya: label masih proxy, dan alasan berbahasa Indonesia baru diuji dengan terjemahan mesin. Semua kode dan data ada di GitHub. Terima kasih." |

## Catatan rekaman
- Resolusi 1080p, mode terang. Matikan notifikasi. Jangan memperlihatkan email pribadi, password, atau tab lain.
- Unggah ke YouTube (*Unlisted*) atau Google Drive (akses "siapa saja yang punya tautan"), lalu isi `[ISI: URL video]` di
  `README.md` dan `docs/cac/FORMULIR_SUBMISI.md`.
