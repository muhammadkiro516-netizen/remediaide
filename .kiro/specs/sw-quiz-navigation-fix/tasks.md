# Implementation Plan

## Overview

Bugfix untuk Service Worker yang mengintercept RSC fetch halaman kuis siswa dengan strategi `NetworkFirst` dari `defaultCache`, menyebabkan tombol "Lanjut" dan "Selesai" tidak berfungsi mulai soal ke-2. Fix: tambah dua rule `NetworkOnly` di `src/sw.ts` sebelum `...defaultCache` untuk `/student/quiz/*` dan `/dashboard/sessions/*/live`.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 0, "tasks": ["1"] },
    { "wave": 1, "tasks": ["2"] },
    { "wave": 2, "tasks": ["3.1", "3.2", "3.3"] },
    { "wave": 3, "tasks": ["3.4", "3.5"] },
    { "wave": 4, "tasks": ["4"] }
  ]
}
```

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - RSC Fetch Halaman Kuis Ditangani `NetworkFirst` bukan `NetworkOnly`
  - **IMPORTANT**: Tulis tes ini SEBELUM mengimplementasikan fix. Tes HARUS GAGAL pada kode unfixed.
  - **CRITICAL**: Jangan memperbaiki tes atau kode ketika tes gagal — kegagalan mengonfirmasi bug ada.
  - **GOAL**: Surfacing counterexample yang membuktikan `defaultCache` mengintercept RSC fetch kuis dengan strategi `NetworkFirst` alih-alih `NetworkOnly`.
  - **Scoped PBT Approach**: Scope property ke kasus konkret — path `/student/quiz/{sessionId}` dengan header `RSC: 1`. Generate berbagai `sessionId` string acak untuk memastikan semua varian URL terkena.
  - Buat file `src/sw.property.test.ts` (atau `tests/unit/sw.property.test.ts`).
  - Simulasikan RSC fetch ke `/student/quiz/abc123` dengan header `RSC: 1` menggunakan `fast-check` — generate sessionId acak berupa string alfanumerik.
  - Assert bahwa strategi rule yang match untuk request tersebut adalah `NetworkOnly`, bukan `NetworkFirst`.
  - Uji juga `/student/quiz/{id}/complete` dan `/student/quiz/{id}` dengan `Next-Router-Prefetch: 1`.
  - Jalankan tes pada kode UNFIXED (`src/sw.ts` tanpa kedua rule baru).
  - **EXPECTED OUTCOME**: Tes GAGAL — rule yang match adalah `NetworkFirst` dari `defaultCache` (ini membuktikan bug ada).
  - Document counterexample yang ditemukan, misalnya: "GET /student/quiz/abc123 dengan RSC: 1 → matched rule: pages-rsc (NetworkFirst), bukan NetworkOnly".
  - Tandai task selesai ketika tes sudah ditulis, dijalankan, dan kegagalannya didokumentasikan.
  - _Requirements: 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Route Non-Dinamis Tetap Menggunakan Strategi `defaultCache`
  - **IMPORTANT**: Ikuti observation-first methodology — jalankan dulu di kode UNFIXED untuk mengamati strategi yang berlaku sekarang.
  - Observe: `GET /login` → matched rule dari `defaultCache` (`pages` → `NetworkFirst`).
  - Observe: `GET /api/sessions/abc/quiz` → matched rule: `NetworkOnly` (rule custom sudah ada).
  - Observe: `GET /_next/static/chunks/main.js` → matched rule: `CacheFirst` (rule custom sudah ada).
  - Observe: `GET /dashboard/sessions` dengan `RSC: 1` → matched rule dari `defaultCache` (`pages-rsc` → `NetworkFirst`).
  - Tulis property-based test menggunakan `fast-check` — generate path string acak di luar domain bug condition dan verifikasi strateginya tidak berubah.
  - Sertakan test cases: halaman statis (`/login`, `/register`, `/student/join`), API routes (`/api/*`), static assets (`/_next/static/*`), dan dashboard non-dinamis.
  - Jalankan tes pada kode UNFIXED untuk membangun baseline.
  - **EXPECTED OUTCOME**: Semua tes PASS — mengonfirmasi baseline perilaku yang harus dipertahankan.
  - Tandai task selesai ketika tes sudah ditulis, dijalankan, dan passing pada kode unfixed.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Fix: Tambah rule `NetworkOnly` untuk halaman dinamis per-pengguna di `src/sw.ts`

  - [x] 3.1 Tambahkan dua rule `NetworkOnly` baru di array `runtimeCaching` SEBELUM `...defaultCache`
    - Buka `src/sw.ts`.
    - Setelah rule `// All other API routes: NetworkOnly` dan SEBELUM baris `...defaultCache`, tambahkan dua rule berikut (dalam urutan ini):
      ```typescript
      // Student quiz pages: NetworkOnly — Client Component with router.push()
      // Must be BEFORE ...defaultCache to override pages-rsc and pages-rsc-prefetch rules
      {
        matcher: /^\/student\/quiz\/.*/,
        handler: new NetworkOnly(),
      },
      // Teacher live session page: NetworkOnly — LiveSessionClient uses router.refresh()
      // which triggers RSC fetch; must not be served from stale cache
      {
        matcher: /^\/dashboard\/sessions\/[^/]+\/live/,
        handler: new NetworkOnly(),
      },
      ```
    - Verifikasi urutan akhir `runtimeCaching`:
      1. `/_next/static/*` → `CacheFirst` (sudah ada)
      2. `/api/auth/*` → `NetworkOnly` (sudah ada)
      3. `/api/sessions/*/quiz` → `NetworkOnly` (sudah ada)
      4. `POST /api/responses` → `NetworkOnly` + BackgroundSync (sudah ada)
      5. `/api/*` → `NetworkOnly` (sudah ada)
      6. `/student/quiz/*` → `NetworkOnly` **[BARU]**
      7. `/dashboard/sessions/*/live` → `NetworkOnly` **[BARU]**
      8. `...defaultCache` (di akhir)
    - Pastikan tidak ada import baru yang diperlukan — `NetworkOnly` sudah diimport di baris yang ada.
    - _Bug_Condition: `isBugCondition(X)` — `X.url.pathname MATCHES /^\/student\/quiz\/[^/]+/` AND `X.headers["RSC"] = "1"` AND `noExplicitNetworkOnlyRuleFor(X.url.pathname)`_
    - _Expected_Behavior: `handleFetch'(X).strategy = NetworkOnly`, `cacheHit = false`, `error = null` untuk semua X di mana `isBugCondition(X) = true`_
    - _Preservation: Semua request X di mana `isBugCondition(X) = false` harus menghasilkan `handleFetch(X).strategy = handleFetch'(X).strategy`_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.5, 3.7_

  - [x] 3.2 Tambahkan unit tests untuk memvalidasi urutan dan strategi rule di `sw.ts`
    - Buat atau perbarui file `tests/unit/sw.test.ts`.
    - Test bahwa `runtimeCaching` berisi rule dengan matcher `/^\/student\/quiz\/.*/`.
    - Test bahwa rule tersebut menggunakan instance `NetworkOnly` (bukan `NetworkFirst`).
    - Test bahwa rule `/^\/dashboard\/sessions\/[^/]+\/live/` juga menggunakan `NetworkOnly`.
    - Test bahwa posisi kedua rule baru dalam array < posisi `defaultCache[0]`.
    - Test edge cases: path dengan trailing slash (`/student/quiz/abc123/`), path dengan query params (`/student/quiz/abc123?foo=bar`).
    - Test bahwa semua existing rules (auth, quiz API, responses, static assets) masih ada dan dalam urutan yang benar.
    - _Requirements: 2.4, 3.7_

  - [x] 3.3 Build verification — kompilasi `src/sw.ts`
    - Jalankan `npm run build` untuk memverifikasi bahwa `src/sw.ts` berhasil dikompilasi ulang tanpa error.
    - Pastikan output `public/sw.js` diperbarui dan tidak ada TypeScript error.
    - _Requirements: 3.7_

  - [x] 3.4 Verifikasi bug condition exploration test sekarang PASS
    - **Property 1: Expected Behavior** - RSC Fetch Halaman Kuis Sekarang Menggunakan `NetworkOnly`
    - **IMPORTANT**: Jalankan ulang TES YANG SAMA dari task 1 — JANGAN tulis tes baru.
    - Tes dari task 1 meng-encode expected behavior: semua RSC fetch ke `/student/quiz/*` harus match rule `NetworkOnly`.
    - Jalankan: `npm test` (atau `npx vitest run src/sw.property.test.ts`).
    - **EXPECTED OUTCOME**: Tes PASS — mengonfirmasi bug sudah diperbaiki.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.5 Verifikasi preservation tests masih PASS
    - **Property 2: Preservation** - Route Non-Dinamis Tetap Tidak Terpengaruh
    - **IMPORTANT**: Jalankan ulang TES YANG SAMA dari task 2 — JANGAN tulis tes baru.
    - Jalankan: `npm test` (atau `npx vitest run` sesuai path file tes preservation).
    - **EXPECTED OUTCOME**: Semua tes PASS — tidak ada regresi pada routes lain.
    - Konfirmasi tidak ada cache entry baru untuk `/student/quiz/*` yang tidak diinginkan.

- [x] 4. Checkpoint — Pastikan semua tes pass dan instruksi post-deploy selesai
  - Jalankan full test suite: `npm test` — semua tes harus hijau.
  - Pastikan `npm run build` selesai tanpa error (TypeScript + Next.js build).
  - Lakukan instruksi unregister SW lama pada browser development:
    - Buka DevTools → Application → Service Workers → klik "Unregister" pada SW lama.
    - Atau lakukan hard refresh: Ctrl+Shift+R (Windows/Linux) / Cmd+Shift+R (Mac).
    - Buka Application → Cache Storage → verifikasi tidak ada cache entry untuk `/student/quiz/*`.
  - Verifikasi di browser bahwa `skipWaiting: true` + `clientsClaim: true` (sudah dikonfigurasi di `sw.ts`) memastikan SW baru langsung aktif untuk tab baru.
  - Instruksikan pengguna aktif untuk melakukan hard refresh atau tutup semua tab dan buka kembali setelah deploy.
  - Tanyakan kepada user jika ada pertanyaan sebelum merge.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

## Notes

- Test framework: **Vitest** + **fast-check** (sudah tersedia di devDependencies).
- Jalankan tes dengan: `npm test` atau `npx vitest run` untuk single-run tanpa watch mode.
- File tes property-based: `src/sw.property.test.ts` atau `tests/unit/sw.property.test.ts` (keduanya dicakup oleh `vitest.config.ts`).
- File unit test: `tests/unit/sw.test.ts`.
- Tes di Task 1 **diharapkan GAGAL** pada kode unfixed — ini adalah perilaku yang benar, bukan kesalahan.
- Tes di Task 2 **diharapkan PASS** pada kode unfixed — ini membangun baseline preservation.
- `NetworkOnly` sudah diimport di `src/sw.ts`, tidak perlu import baru.
- Post-deploy: `skipWaiting: true` dan `clientsClaim: true` sudah dikonfigurasi — SW baru otomatis aktif pada tab baru. Pengguna aktif perlu hard refresh.
