# SW Quiz Navigation Fix — Bugfix Design

## Overview

Bug ini disebabkan oleh Service Worker (SW) yang mengintercept RSC fetch (`RSC: 1` header) yang
dipicu oleh `router.push()` di halaman kuis siswa. Rules `pages-rsc`, `pages-rsc-prefetch`, dan
`pages` dari `defaultCache` (@serwist/next) menggunakan strategi `NetworkFirst` untuk semua route
same-origin non-`/api/`, termasuk `/student/quiz/[sessionId]`. Ketika SW mengembalikan respons
stale atau network gagal, RSC fetch menghasilkan error `no-response` silent sehingga tombol
"Lanjut" dan "Selesai" tidak berfungsi mulai soal ke-2.

**Fix utama:** Tambahkan rule `NetworkOnly` eksplisit untuk semua halaman dinamis per-pengguna
di `src/sw.ts`, **ditempatkan SEBELUM `...defaultCache`**, agar tidak di-override oleh rules
`pages-rsc`, `pages-rsc-prefetch`, dan `pages` dari `defaultCache`.

---

## Glossary

- **Bug_Condition (C)**: Kondisi yang memicu bug — RSC fetch ke halaman kuis siswa diintercept SW
  dan dikembalikan dengan respons stale/invalid dari cache `NetworkFirst`, bukan dari network
- **Property (P)**: Perilaku yang diinginkan — RSC fetch ke halaman kuis harus selalu menggunakan
  `NetworkOnly` (bypass cache sepenuhnya)
- **Preservation**: Perilaku yang tidak boleh berubah — semua route selain halaman dinamis
  per-pengguna yang ditambahkan tetap menggunakan strategi caching dari `defaultCache`
- **`isBugCondition(X)`**: Fungsi pseudocode yang mengidentifikasi request yang terkena bug
- **`handleFetch(X)`**: Fungsi SW asli (sebelum fix) yang menentukan strategi untuk request X
- **`handleFetch'(X)`**: Fungsi SW setelah fix
- **`defaultCache`**: Array runtime caching rules dari `@serwist/next/worker` yang mencakup
  `pages-rsc-prefetch`, `pages-rsc`, dan `pages` dengan strategi `NetworkFirst` 24 jam
- **RSC fetch**: Request `fetch` dengan header `RSC: 1` yang dikirim Next.js App Router untuk
  memperbarui konten halaman tanpa full page reload
- **`NetworkOnly`**: Strategi Serwist yang selalu meneruskan request ke network, tidak pernah
  membaca dari atau menulis ke cache
- **`NetworkFirst`**: Strategi Serwist yang mencoba network terlebih dahulu, fallback ke cache
  jika network gagal — strategi ini yang menyebabkan bug pada halaman per-pengguna

---

## Bug Details

### Bug Condition

Bug terpicu ketika SW mengintercept RSC fetch ke halaman kuis siswa (`/student/quiz/[sessionId]`)
yang dipicu oleh `router.push()` saat tombol "Lanjut"/"Selesai" ditekan. Rules `pages-rsc` dan
`pages-rsc-prefetch` dari `defaultCache` menangkap request ini dan menggunakan strategi
`NetworkFirst`. Ketika network request gagal atau SW mengembalikan payload RSC yang sudah stale,
fetch promise ditolak dengan error `no-response: no-response` secara silent tanpa feedback ke
pengguna.

**Formal Specification:**

```
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

### Examples

- **Soal ke-2 (bug utama)**: Siswa menjawab soal pertama → klik "Lanjut" → `router.push` memicu
  RSC fetch ke `/student/quiz/abc123` → SW mengembalikan stale RSC payload → soal tidak berubah,
  tombol tidak bereaksi
- **Tombol "Selesai" (bug utama)**: Siswa menjawab soal terakhir → klik "Selesai" → `router.push`
  ke `/student/quiz/abc123/complete` → RSC fetch di-cache dengan `NetworkFirst` → navigasi gagal
  silent
- **Setelah refresh manual**: Halaman dimuat ulang penuh → soal pertama muncul normal → `router.push`
  ke soal ke-2 kembali gagal karena bug berulang
- **Route `/student/quiz/[sessionId]/complete`** (risiko tambahan): Halaman ini juga Client
  Component dengan `router.push("/student/join")` yang bisa terkena RSC intercept yang sama
- **Route `/dashboard/sessions/[id]/live`** (risiko sekunder): `LiveSessionClient` menggunakan
  `router.refresh()` yang juga memicu RSC fetch — berpotensi mengembalikan data monitoring sesi
  yang stale saat guru menekan tombol "Mulai Sesi" atau "Tutup Sesi"

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Mouse clicks, touch inputs, dan keyboard interactions pada semua halaman non-kuis tidak boleh
  terpengaruh
- Halaman statis (login, register, join, admin dashboard) harus tetap di-serve menggunakan
  strategi caching dari `defaultCache` seperti sebelumnya
- Rule `NetworkOnly` yang sudah ada untuk `/api/auth/*`, `/api/sessions/[id]/quiz`,
  `POST /api/responses`, dan semua `/api/*` tidak boleh diubah
- Precaching manifest (`__SW_MANIFEST`) untuk static assets tidak boleh terpengaruh
- Rule `CacheFirst` 30 hari untuk `/_next/static/*` tidak boleh terpengaruh
- Background Sync plugin pada `POST /api/responses` harus tetap berfungsi
- Perilaku offline (error informatif untuk routes yang NetworkOnly) tidak boleh diperburuk

**Scope:**
Semua request yang TIDAK memenuhi `isBugCondition(X)` harus menghasilkan strategi yang sama
persis antara `handleFetch(X)` (sebelum fix) dan `handleFetch'(X)` (sesudah fix). Ini mencakup:
- Semua `/api/*` routes (sudah `NetworkOnly`)
- `/_next/static/*` (sudah `CacheFirst`)
- Semua halaman statis: `/login`, `/register`, `/student/join`, `/admin/*`, `/principal/*`,
  `/dashboard` (non-dynamic), `/dashboard/sessions`, `/dashboard/classes`, dll.

---

## Hypothesized Root Cause

Root cause sudah dikonfirmasi melalui pembacaan langsung kode `src/sw.ts` dan dokumentasi
`@serwist/next`. Tidak perlu hipotesis lagi — ini adalah kepastian:

1. **`defaultCache` mencakup rules untuk halaman dinamis**: Rules `pages-rsc-prefetch`,
   `pages-rsc`, dan `pages` di `defaultCache` menggunakan matcher berbasis header RSC dan
   bukan path-based, sehingga menangkap SEMUA request RSC ke semua route non-`/api/`, termasuk
   `/student/quiz/[sessionId]`

2. **Strategi `NetworkFirst` tidak cocok untuk halaman per-pengguna**: Halaman kuis adalah Client
   Component yang mengandalkan RSC fetch untuk state transitions. `NetworkFirst` dengan TTL 24
   jam bisa mengembalikan cached RSC payload yang sudah tidak valid karena state soal berubah
   setiap klik "Lanjut"

3. **Urutan rule dalam array `runtimeCaching` menentukan prioritas**: Karena rule kuis belum
   ada sebelum `...defaultCache`, rules dari `defaultCache` selalu match lebih dulu untuk path
   `/student/quiz/[sessionId]`

4. **Error terjadi secara silent**: Next.js App Router tidak menampilkan error UI saat RSC fetch
   gagal dengan `no-response` — hanya terlihat di DevTools console — sehingga pengguna tidak
   mendapat feedback apapun

5. **Halaman dinamis lain juga berisiko**: Audit `src/app/` mengidentifikasi route-route
   berikut yang juga menggunakan Client Component dengan `router.push()` atau `router.refresh()`:
   - `/student/quiz/[sessionId]/complete` — Client Component, `router.push("/student/join")`
   - `/dashboard/sessions/[id]/live` — `LiveSessionClient` dengan `router.refresh()` untuk
     sinkronisasi state setelah aktivasi/penutupan sesi

---

## Correctness Properties

Property 1: Bug Condition — RSC Fetch Halaman Kuis Selalu NetworkOnly

_For any_ request X di mana `isBugCondition(X)` bernilai true (RSC fetch ke
`/student/quiz/[sessionId]` atau route dinamis per-pengguna lainnya yang ditambahkan), Service
Worker yang sudah diperbaiki (`handleFetch'(X)`) SHALL meneruskan request langsung ke network
tanpa membaca atau menulis cache (`strategy = NetworkOnly`, `cacheHit = false`, `error = null`).

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation — Halaman Non-Dinamis Tidak Terpengaruh

_For any_ request X di mana `isBugCondition(X)` bernilai false (route bukan halaman dinamis
per-pengguna yang baru ditambahkan), Service Worker yang sudah diperbaiki SHALL menggunakan
strategi yang sama persis dengan Service Worker sebelum fix: `handleFetch(X).strategy =
handleFetch'(X).strategy` untuk semua X di domain ¬C.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

---

## Fix Implementation

### Changes Required

**File**: `src/sw.ts`

**Lokasi**: Array `runtimeCaching`, SEBELUM `...defaultCache`

**Specific Changes:**

1. **Tambah rule `NetworkOnly` untuk `/student/quiz/[sessionId]`** (fix bug utama):
   ```typescript
   // Student quiz pages: NetworkOnly — Client Component with router.push()
   // Must be BEFORE ...defaultCache to override pages-rsc and pages-rsc-prefetch rules
   {
     matcher: /^\/student\/quiz\/.*/,
     handler: new NetworkOnly(),
   },
   ```

2. **Tambah rule `NetworkOnly` untuk `/student/quiz/[sessionId]/complete`** (fix risiko tambahan):
   - Sudah tercakup oleh pattern `/^\/student\/quiz\/.*/` pada poin 1 di atas
   - Tidak perlu rule terpisah

3. **Tambah rule `NetworkOnly` untuk `/dashboard/sessions/[id]/live`** (fix risiko sekunder):
   ```typescript
   // Teacher live session page: NetworkOnly — LiveSessionClient uses router.refresh()
   // which triggers RSC fetch; must not be served from stale cache
   {
     matcher: /^\/dashboard\/sessions\/[^/]+\/live/,
     handler: new NetworkOnly(),
   },
   ```

4. **Urutan penempatan yang benar** dalam `runtimeCaching`:
   ```
   1. /_next/static/*   → CacheFirst 30d   (sudah ada)
   2. /api/auth/*       → NetworkOnly      (sudah ada)
   3. /api/sessions/*/quiz → NetworkOnly   (sudah ada)
   4. POST /api/responses → NetworkOnly+BGSync (sudah ada)
   5. /api/*            → NetworkOnly      (sudah ada)
   6. /student/quiz/*   → NetworkOnly      [BARU — sebelum defaultCache]
   7. /dashboard/sessions/*/live → NetworkOnly [BARU — sebelum defaultCache]
   8. ...defaultCache                      (sudah ada, di akhir)
   ```

5. **Instruksi post-deploy** (harus dilakukan oleh pengguna setelah deploy):
   - Unregister Service Worker lama: DevTools → Application → Service Workers → Unregister
   - Atau instruksikan pengguna: hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
   - Atau implementasikan `skipWaiting: true` + `clientsClaim: true` (sudah ada di config
     Serwist) — SW baru akan otomatis aktif saat pengguna membuka tab baru

### Daftar Route Dinamis Per-Pengguna (Hasil Audit `src/app/`)

| Route | Tipe | Berisiko? | Alasan | Aksi |
|-------|------|-----------|--------|------|
| `/student/quiz/[sessionId]` | Client Component | ✅ HIGH | `router.push()`, state per-soal | Tambah rule |
| `/student/quiz/[sessionId]/complete` | Client Component | ✅ HIGH | `router.push("/student/join")` | Tercakup `/student/quiz/*` |
| `/dashboard/sessions/[id]/live` | Server+Client | ✅ MEDIUM | `router.refresh()` di `LiveSessionClient` | Tambah rule |
| `/dashboard/sessions/[id]/results` | Server+Client | ⚠️ LOW | `force-dynamic`, tidak ada `router.push` ke dynamic path | Monitor |
| `/dashboard/tests/[testId]/questions` | Server Component | ✅ SAFE | Server Component, tidak ada client navigation | Tidak perlu |
| `/admin/*` | Server Component | ✅ SAFE | Server Component | Tidak perlu |
| `/principal/*` | Server Component | ✅ SAFE | Server Component | Tidak perlu |

---

## Testing Strategy

### Validation Approach

Strategi testing mengikuti dua fase: pertama, **eksplorasi bug** — menjalankan tes pada kode
SEBELUM fix untuk mengonfirmasi root cause; kedua, **verifikasi fix** — memastikan fix bekerja
benar dan tidak merusak perilaku yang sudah ada.

### Exploratory Bug Condition Checking

**Goal**: Surfacing counterexample yang membuktikan bug ada SEBELUM fix diimplementasikan.
Mengonfirmasi bahwa strategi `NetworkFirst` dari `defaultCache` memang menangkap RSC fetch ke
`/student/quiz/[sessionId]`.

**Test Plan**: Tulis unit test untuk `sw.ts` yang mensimulasikan RSC fetch ke halaman kuis dan
mengecek strategi mana yang dipilih SW. Jalankan di kode UNFIXED untuk melihat kegagalan.

**Test Cases**:
1. **Quiz RSC Fetch Test**: Simulate `GET /student/quiz/abc123` dengan header `RSC: 1` →
   assert strategi = `NetworkOnly` (akan **FAIL** di kode unfixed karena `defaultCache` menangkap)
2. **Quiz RSC Prefetch Test**: Simulate request yang sama dengan tambahan
   `Next-Router-Prefetch: 1` → assert strategi = `NetworkOnly` (akan **FAIL** di kode unfixed)
3. **Quiz Complete RSC Test**: Simulate `GET /student/quiz/abc123/complete` dengan `RSC: 1` →
   assert strategi = `NetworkOnly` (akan **FAIL** di kode unfixed)
4. **Live Session RSC Test**: Simulate `GET /dashboard/sessions/xyz/live` dengan `RSC: 1` →
   assert strategi = `NetworkOnly` (akan **FAIL** di kode unfixed)

**Expected Counterexamples**:
- Strategi yang dikembalikan adalah `NetworkFirst` bukan `NetworkOnly` untuk path kuis
- Menunjukkan bahwa `defaultCache` mengambil alih sebelum ada rule eksplisit untuk path ini

### Fix Checking

**Goal**: Verifikasi bahwa untuk semua input di mana `isBugCondition(X)` bernilai true, fungsi
SW setelah fix menggunakan strategi `NetworkOnly`.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  result := handleFetch'(X)  // SW setelah fix
  ASSERT result.strategy = NetworkOnly
  ASSERT result.cacheHit = false
  ASSERT result.error IS NULL
END FOR
```

**Test Cases**:
1. `GET /student/quiz/[id]` dengan `RSC: 1` → strategi harus `NetworkOnly`
2. `GET /student/quiz/[id]` dengan `RSC: 1` + `Next-Router-Prefetch: 1` → `NetworkOnly`
3. `GET /student/quiz/[id]/complete` dengan `RSC: 1` → `NetworkOnly`
4. `GET /dashboard/sessions/[id]/live` dengan `RSC: 1` → `NetworkOnly`
5. `GET /dashboard/sessions/[id]/live` dengan `RSC: 1` + `router.refresh()` pattern → `NetworkOnly`

### Preservation Checking

**Goal**: Verifikasi bahwa untuk semua input di mana `isBugCondition(X)` bernilai false, strategi
SW tidak berubah dibanding sebelum fix.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT handleFetch(X).strategy = handleFetch'(X).strategy
END FOR
```

**Testing Approach**: Property-based testing direkomendasikan karena:
- Menghasilkan banyak test case otomatis dari domain input yang luas
- Menangkap edge cases yang mungkin terlewat oleh unit test manual
- Memberikan jaminan kuat bahwa strategi caching halaman non-dinamis tidak berubah

**Test Cases**:
1. **Static Pages Preservation**: `GET /login`, `/register`, `/student/join` (tanpa `RSC: 1`) →
   strategi harus sama antara sebelum dan sesudah fix (biasanya `NetworkFirst` dari `defaultCache`)
2. **API Routes Preservation**: `GET /api/sessions/abc/quiz` → tetap `NetworkOnly` (sudah ada rule)
3. **Static Assets Preservation**: `GET /_next/static/chunks/main.js` → tetap `CacheFirst`
4. **Dashboard Non-Dynamic Preservation**: `GET /dashboard/sessions` (tanpa dynamic segment)
   dengan `RSC: 1` → strategi dari `defaultCache` tidak berubah
5. **Other Dynamic Pages Preservation**: `GET /dashboard/sessions/[id]/results` → tetap menggunakan
   `defaultCache` strategy (bukan `NetworkOnly` kecuali kita tambahkan)

### Unit Tests

- Test bahwa `runtimeCaching` berisi rule `/student/quiz/` sebelum `defaultCache` entries
- Test bahwa rule `/student/quiz/` menggunakan instance `NetworkOnly`
- Test bahwa rule `/dashboard/sessions/*/live` menggunakan instance `NetworkOnly`
- Test edge cases: path dengan trailing slash, path dengan query params
- Test bahwa semua existing rules masih ada dan dalam urutan yang benar

### Property-Based Tests

- Generate random `sessionId` strings dan verifikasi bahwa semua pola URL `/student/quiz/{id}`
  dipetakan ke strategi `NetworkOnly`
- Generate random path strings untuk non-quiz routes dan verifikasi bahwa strateginya tidak
  berubah dibanding baseline (sebelum fix)
- Test bahwa posisi rule dalam array memenuhi invariant: index rule kuis < index `defaultCache[0]`

### Integration Tests

- Test full flow: buka halaman kuis → jawab soal 1 → tekan "Lanjut" → soal 2 muncul (tanpa SW bug)
- Test navigation: jawab soal terakhir → tekan "Selesai" → navigasi ke `/complete` berhasil
- Test teacher flow: buka live session → tekan "Mulai Sesi" → `router.refresh()` memperbarui UI
- Test offline behavior: tidak memperburuk error handling yang sudah ada untuk halaman NetworkOnly
- Test SW update: setelah deploy ulang, SW baru mengambil alih dan rules baru aktif

### Post-Deploy Steps

Setelah fix di-deploy, lakukan langkah berikut untuk membersihkan SW lama:

1. **Otomatis** (sudah dikonfigurasi di `sw.ts`): `skipWaiting: true` + `clientsClaim: true`
   memastikan SW baru langsung aktif untuk tab baru yang dibuka
2. **Manual untuk pengguna yang sedang aktif**: Instruksikan pengguna untuk melakukan
   hard refresh (Ctrl+Shift+R / Cmd+Shift+R) atau tutup semua tab dan buka kembali
3. **Verifikasi via DevTools**: Application → Service Workers → pastikan SW baru aktif →
   Application → Cache Storage → verifikasi tidak ada cache entry untuk `/student/quiz/*`
