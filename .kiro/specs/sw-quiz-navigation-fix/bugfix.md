# Bugfix Requirements Document

## Introduction

Saat siswa mengerjakan kuis di halaman `/student/quiz/[sessionId]`, tombol "Lanjut" (pindah ke soal berikutnya) dan tombol "Selesai" tidak berfungsi mulai dari soal ke-2 dan seterusnya. Klik tombol tidak menghasilkan respons apapun sampai halaman di-refresh manual oleh pengguna.

Akar masalah adalah Service Worker (SW) yang mengintercept RSC fetch (`RSC: 1` header) yang dipicu oleh `router.push` / state update di halaman kuis. Rules `pages-rsc-prefetch` dan `pages-rsc` dari `defaultCache` (@serwist/next) menggunakan strategi `NetworkFirst` dengan cache TTL 24 jam untuk semua route same-origin non-`/api/`, termasuk `/student/quiz/[sessionId]`. Ketika network request gagal atau SW mengembalikan respons stale yang tidak valid sebagai RSC payload, navigation/state update gagal secara silent (no-response error), mengakibatkan tombol tampak tidak bereaksi.

Bug ini serupa dengan bug "Gagal Memuat Soal" yang sebelumnya diperbaiki dengan mengubah rule API quiz ke `NetworkOnly`, namun kali ini terjadi di lapisan halaman (RSC fetch), bukan lapisan API.

Selain route kuis siswa, audit diperlukan untuk mengidentifikasi halaman dinamis lain yang menghadapi risiko serupa akibat rules `defaultCache` yang terlalu agresif men-cache halaman per-pengguna.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN siswa berada di soal ke-2 atau lebih dan menekan tombol "Lanjut" THEN sistem tidak melakukan apa-apa (tombol tidak berpindah ke soal berikutnya dan tidak ada feedback visual)

1.2 WHEN siswa berada di soal terakhir dan menekan tombol "Selesai" THEN sistem tidak menavigasi ke halaman `/student/quiz/[sessionId]/complete` dan tidak ada feedback visual

1.3 WHEN Service Worker mengintercept RSC fetch untuk route `/student/quiz/[sessionId]` dengan strategi `NetworkFirst` (dari rule `pages-rsc` atau `pages-rsc-prefetch` di `defaultCache`) THEN sistem menghasilkan error `no-response: no-response` di console dan fetch promise ditolak secara silent tanpa memunculkan pesan error ke pengguna

1.4 WHEN halaman kuis di-refresh manual oleh pengguna THEN tombol "Lanjut" dan "Selesai" kembali berfungsi normal untuk soal pertama saja, kemudian bug berulang kembali mulai soal ke-2

### Expected Behavior (Correct)

2.1 WHEN siswa berada di soal ke-2 atau lebih dan menekan tombol "Lanjut" THEN sistem SHALL langsung menampilkan soal berikutnya dengan animasi transisi seperti di soal pertama

2.2 WHEN siswa berada di soal terakhir dan menekan tombol "Selesai" THEN sistem SHALL berhasil menavigasi ke halaman `/student/quiz/[sessionId]/complete`

2.3 WHEN Service Worker mengintercept RSC fetch untuk route `/student/quiz/[sessionId]` THEN sistem SHALL melewatkan request tersebut langsung ke network tanpa intercept (strategi `NetworkOnly`) sehingga RSC fetch selalu mengambil data terbaru dari server

2.4 WHEN rule `NetworkOnly` diterapkan pada route `/student/quiz/[sessionId]` di `sw.ts` THEN sistem SHALL memastikan rule tersebut ditempatkan SEBELUM `...defaultCache` dalam array `runtimeCaching` agar tidak di-override oleh rules `pages-rsc`, `pages-rsc-prefetch`, dan `pages` dari `defaultCache`

2.5 WHEN audit `runtimeCaching` dilakukan pada seluruh rule di `sw.ts` THEN sistem SHALL memiliki rule `NetworkOnly` eksplisit untuk setiap halaman dinamis per-pengguna yang berpotensi menghasilkan respons stale jika di-cache — minimal mencakup: `/student/quiz/[sessionId]`, halaman live monitoring guru (`/teacher/session/[id]` atau sejenisnya), dan halaman hasil sesi

### Unchanged Behavior (Regression Prevention)

3.1 WHEN soal pertama dimuat setelah siswa masuk ke halaman kuis THEN sistem SHALL CONTINUE TO menampilkan soal pertama dengan benar melalui fetch awal ke `/api/sessions/[sessionId]/quiz`

3.2 WHEN tombol "Lanjut" ditekan pada soal pertama THEN sistem SHALL CONTINUE TO berpindah ke soal ke-2 dan memproses jawaban dengan benar

3.3 WHEN `POST /api/responses` dipanggil untuk menyimpan jawaban THEN sistem SHALL CONTINUE TO menggunakan rule `NetworkOnly` + BackgroundSync yang sudah ada (tidak diubah)

3.4 WHEN `GET /api/sessions/[sessionId]/quiz` dipanggil untuk memuat data soal THEN sistem SHALL CONTINUE TO menggunakan rule `NetworkOnly` yang sudah ada (tidak diubah)

3.5 WHEN halaman-halaman statis atau non-dinamis (seperti halaman login, halaman join, halaman admin) diakses THEN sistem SHALL CONTINUE TO di-serve menggunakan strategi caching dari `defaultCache` seperti sebelumnya tanpa perubahan

3.6 WHEN pengguna berada dalam kondisi offline atau jaringan terputus THEN sistem SHALL CONTINUE TO menampilkan pesan error yang informatif (behavior offline yang ada tidak diperburuk oleh penambahan rule baru)

3.7 WHEN `sw.ts` dikompilasi ulang setelah perubahan THEN sistem SHALL CONTINUE TO memuat semua custom rules yang sudah ada (auth, quiz API, responses) dengan urutan prioritas yang benar

---

## Bug Condition Pseudocode

**Bug Condition Function:**

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type FetchRequest
  OUTPUT: boolean

  // Bug terpicu ketika SW mengintercept RSC fetch ke halaman kuis
  RETURN X.url.pathname MATCHES /^\/student\/quiz\/[^/]+/
    AND X.headers["RSC"] = "1"
    AND (
      X.headers["Next-Router-Prefetch"] = "1"  // pages-rsc-prefetch rule
      OR X.headers["RSC"] = "1"                 // pages-rsc rule
    )
    AND X.sameOrigin = true
    AND noExplicitNetworkOnlyRuleFor(X.url.pathname)
END FUNCTION
```

**Property: Fix Checking**

```pascal
// Property: Fix Checking — RSC Fetch Kuis Siswa Tidak Di-Cache
FOR ALL X WHERE isBugCondition(X) DO
  result ← handleFetch'(X)  // SW setelah fix
  ASSERT result.strategy = NetworkOnly
  ASSERT result.error IS NULL
  ASSERT result.cacheHit = false
END FOR
```

**Property: Preservation Checking**

```pascal
// Property: Preservation — Halaman Non-Kuis Tidak Terpengaruh
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT handleFetch(X).strategy = handleFetch'(X).strategy
END FOR
```
