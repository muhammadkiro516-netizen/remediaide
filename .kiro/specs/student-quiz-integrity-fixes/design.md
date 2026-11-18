# Student Quiz Integrity Fixes — Bugfix Design

## Overview

Dokumen ini merancang perbaikan untuk 6 bug pada alur siswa RemediAide, diurutkan dari paling kritis. Bug #1 adalah celah keamanan di mana siswa lintas kelas dapat mengerjakan sesi kelas lain karena validasi autentikasi hanya memeriksa `schoolId`, bukan `classId`. Bug #2–#6 adalah gap fungsionalitas: penegakan deadline sisi-server, auto-trigger diagnosis, broadcast SSE real-time per jawaban, redirect otomatis di halaman complete, dan reset state yang benar di halaman quiz.

Pendekatan fix adalah **minimal dan targeted**: setiap bug diperbaiki di titik root cause yang sudah dikonfirmasi, tanpa refaktor besar. Bug #3 dan #4 berbagi lokasi fix di `POST /api/responses` sehingga urutan eksekusi pasca-simpan harus didefinisikan dengan jelas.


## Glossary

- **Bug_Condition (C)**: Kondisi input yang memicu bug — e.g., siswa dengan `classId` berbeda memasukkan PIN sesi kelas lain
- **Property (P)**: Perilaku yang benar setelah fix — e.g., autentikasi ditolak karena classId tidak cocok
- **Preservation**: Perilaku yang tidak boleh berubah akibat fix — e.g., siswa dari kelas yang benar tetap bisa masuk
- **SessionPin**: Record `session_pins` yang merepresentasikan satu sesi ujian aktif, berelasi ke `Test` (yang memiliki `classId`)
- **student-pin provider**: Credential provider NextAuth di `src/auth.ts` yang memverifikasi PIN + studentId dan menerbitkan JWT sesi siswa
- **enqueueRunDiagnosis**: Fungsi dari `src/workers/run-diagnosis.ts` yang menambahkan job ke BullMQ queue `run-diagnosis` untuk eksekusi `computeConceptDiagnosis`
- **buildHeatmapState**: Fungsi dari `src/lib/sse/heatmap-builder.ts` yang membangun array `HeatmapEntry[]` dari DB berdasarkan jumlah respons per siswa
- **sseManager**: Singleton dari `src/lib/sse/manager.ts` yang menyimpan state heatmap terakhir dan mem-broadcast ke semua SSE client yang terhubung
- **isBugCondition(input)**: Fungsi pseudocode yang menentukan apakah input memenuhi kondisi bug
- **F**: Fungsi original (sebelum fix)
- **F'**: Fungsi setelah fix


## Bug Details

### Bug #1 — Cross-Class Authentication Bypass (KRITIS)

Provider `student-pin` di `src/auth.ts` hanya memvalidasi `student.schoolId === sessionPin.schoolId`. Karena `SessionPin` berelasi ke `Test` yang punya `classId`, validasi seharusnya juga memastikan `student.classId === sessionPin.test.classId`.

**Formal Specification:**
```
FUNCTION isBugCondition_B1(credentials)
  INPUT: credentials { pinCode: string, studentId: string }
  OUTPUT: boolean

  sessionPin := lookup(credentials.pinCode)
  student    := lookup(credentials.studentId)

  RETURN sessionPin.state == 'ACTIVE'
         AND student.schoolId == sessionPin.schoolId
         AND student.classId  != sessionPin.test.classId
END FUNCTION
```

**Contoh manifestasi:**
- Siswa "S-B-01" (Kelas B, sekolah X) memasukkan PIN sesi Kelas A → autentikasi berhasil → JWT berisi `sessionPinId` sesi Kelas A
- "S-B-01" submit jawaban ke `POST /api/responses` → diterima karena `studentSession.sessionPinId === body.sessionId`
- `GET /api/student/join?pin=...` tanpa classId filter → menampilkan semua siswa satu sekolah, bukan hanya kelas terdaftar


### Bug #2 — Server-Side Deadline Not Enforced

`POST /api/responses` hanya memeriksa `sessionPin.state === 'ACTIVE'`, tidak memvalidasi `startedAt + durationSeconds * 1000 < Date.now()`. Jika BullMQ job auto-close terlambat (load tinggi), siswa yang seharusnya tidak bisa submit masih bisa. Di sisi klien, `startedAt` dan `durationSeconds` tidak di-expose dari API sesi sehingga tidak ada countdown timer.

**Formal Specification:**
```
FUNCTION isBugCondition_B2(request, now)
  INPUT: request { sessionId, ... }, now := Date.now()
  OUTPUT: boolean

  sessionPin := lookup(request.sessionId)

  RETURN sessionPin.state == 'ACTIVE'
         AND sessionPin.startedAt != null
         AND sessionPin.startedAt + sessionPin.test.durationSeconds * 1000 < now
END FUNCTION
```

**Catatan data flow:** `GET /api/sessions/:id/quiz` sudah mengambil `durationSeconds` dari `test` tapi **tidak** mengambil `startedAt` dari `sessionPin`. Fix client-side hanya perlu menambah `startedAt` ke response quiz tanpa endpoint baru.

### Bug #3 — Diagnosis Tidak Pernah Di-trigger Otomatis

Setelah `prisma.response.create()` di `POST /api/responses`, tidak ada logika pengecekan apakah ini jawaban terakhir siswa. Fungsi `enqueueRunDiagnosis` ada dan siap pakai di `src/workers/run-diagnosis.ts` tetapi tidak pernah dipanggil dari route ini.

**Formal Specification:**
```
FUNCTION isBugCondition_B3(studentId, sessionId, after_save)
  INPUT: setelah response berhasil disimpan
  OUTPUT: boolean

  totalQuestions   := count questions in session.test
  studentResponses := count responses WHERE studentId AND sessionId

  RETURN studentResponses == totalQuestions
         AND NOT jobExistsInQueue('run-diagnosis', sessionId)
END FUNCTION
```


### Bug #4 — SSE Broadcast Tidak Dipanggil Setelah Submit Jawaban

Setelah `prisma.response.create()`, `sseManager.broadcast()` tidak dipanggil. Broadcast hanya terjadi di akhir `computeConceptDiagnosis` (setelah sesi tutup). Portal guru heatmap tidak berubah real-time per jawaban masuk.

**Formal Specification:**
```
FUNCTION isBugCondition_B4(sessionId, after_save)
  INPUT: setelah response berhasil disimpan
  OUTPUT: boolean

  RETURN sseManager.getLastState(sessionId) tidak mencerminkan jawaban yang baru disimpan
END FUNCTION
```

### Bug #5 — Halaman Complete Adalah Server Component Statik

`src/app/student/quiz/[sessionId]/complete/page.tsx` adalah Server Component tanpa interaktivitas. Tidak ada tombol kembali dan tidak ada countdown redirect otomatis. Siswa terjebak di halaman ini.

**Formal Specification:**
```
FUNCTION isBugCondition_B5(page)
  INPUT: rendered complete page
  OUTPUT: boolean

  RETURN NOT hasExplicitBackButton(page)
         AND NOT hasAutoRedirectCountdown(page)
END FUNCTION
```

### Bug #6 — State `animating`/`isSubmitting` Tidak Selalu Di-reset

Di `src/app/student/quiz/[sessionId]/page.tsx`, sukses path untuk soal non-terakhir menggunakan `setTimeout` yang di dalamnya memanggil `setIsSubmitting(false)`. Jika terjadi error yang tidak terkendali di luar blok `catch`, `isSubmitting` tetap `true` dan tombol tetap disabled. `setIsSubmitting(false)` tidak ada di blok `finally`.

**Formal Specification:**
```
FUNCTION isBugCondition_B6(submitFlow)
  INPUT: submitFlow execution path
  OUTPUT: boolean

  RETURN errorOccursAfterApiSuccess(submitFlow)
         AND isSubmitting remains true
         AND animating remains true
END FUNCTION
```


## Expected Behavior

### Preservation Requirements

**Perilaku yang harus tetap berjalan setelah seluruh fix:**

- Siswa dari kelas yang benar dapat masuk dengan PIN sesi kelasnya (Bug #1)
- PIN salah atau sesi LOCKED/CLOSED tetap ditolak dengan error generik (Bug #1)
- Sesi ACTIVE yang belum kadaluarsa tetap menerima jawaban (Bug #2)
- Guru menutup sesi manual tetap menolak jawaban baru dengan `SESSION_CLOSED` (Bug #2)
- Siswa yang belum selesai semua soal tidak men-trigger diagnosis (Bug #3)
- Tombol "Generate Kelompok Remedial" di portal guru tetap berjalan on-demand (Bug #3)
- SSE client yang baru connect tetap mendapat state heatmap terakhir dari `getLastState()` (Bug #4)
- Broadcast state final setelah diagnosis tetap terjadi (Bug #4)
- Halaman complete tetap menampilkan centang hijau, pesan "Kuis Selesai!", dan instruksi tunggu guru (Bug #5)
- API error (non-2xx) tetap menampilkan pesan error + countdown retry tanpa pindah soal (Bug #6)
- Tombol submit tetap disabled jika belum pilih jawaban atau CRI (Bug #6)

**Scope non-regression:**
Semua perubahan bersifat additive pada kondisi success path — tidak ada perubahan pada error path yang sudah ada.


## Hypothesized Root Cause

Root cause semua bug sudah dikonfirmasi dari investigasi kode:

1. **Bug #1 — Missing classId validation in auth chain**: `SessionPin` memiliki relasi `test → classId` tapi query di provider `student-pin` hanya `select: { id, schoolId, state }` tanpa `include: { test: { select: { classId } } }`. Validasi hanya satu dimensi (schoolId) saat butuh dua dimensi (schoolId + classId). Pola ini muncul juga di `POST /api/student/join` pada blok `studentId`-provided path — meski pada blok no-studentId sudah ada filter classId.

2. **Bug #2 — Incomplete sessionPin select in POST /api/responses**: Query `prisma.sessionPin.findFirst` hanya mengambil `{ id, state, testId }`. `startedAt` dan `durationSeconds` (via test relation) tidak diambil. Tidak ada logika deadline check setelahnya.

3. **Bug #3 — No completion check after response.create()**: Setelah `prisma.response.create()`, kode langsung return `201`. Tidak ada query count respons vs total soal, tidak ada panggilan `enqueueRunDiagnosis`.

4. **Bug #4 — No broadcast call after response.create()**: Sama dengan bug #3, setelah save tidak ada `buildHeatmapState` + `sseManager.broadcast`. Broadcast hanya ada di `computeConceptDiagnosis` yang tidak pernah dipanggil otomatis.

5. **Bug #5 — Server Component without client interactivity**: File menggunakan `export default function` tanpa `"use client"` directive. `useEffect`, `useRouter`, dan state React tidak tersedia di Server Component, sehingga countdown dan redirect tidak bisa diimplementasikan tanpa konversi ke Client Component.

6. **Bug #6 — setIsSubmitting(false) missing from finally**: Pada sukses path soal non-terakhir, `setIsSubmitting(false)` ada di dalam `setTimeout` callback. Pada sukses path soal terakhir, `router.push()` dipanggil tanpa reset state. Tidak ada `finally` block yang menjamin reset state di semua jalur eksekusi.


## Correctness Properties

Property 1: Bug Condition — Cross-Class Authentication Rejected

_For any_ credential input `(pinCode, studentId)` di mana sesi PIN valid dan ACTIVE tetapi `student.classId !== sessionPin.test.classId`, fungsi provider `student-pin` yang sudah diperbaiki SHALL mengembalikan `null` (autentikasi gagal), dan `POST /api/responses` SHALL menolak jawaban dengan `403 FORBIDDEN`.

**Validates: Requirements 2.1, 2.2, 2.3**

---

Property 2: Bug Condition — Server-Side Deadline Enforced

_For any_ request submit jawaban di mana `sessionPin.state === 'ACTIVE'` tetapi `sessionPin.startedAt + test.durationSeconds * 1000 < Date.now()`, endpoint `POST /api/responses` yang sudah diperbaiki SHALL menolak request dengan HTTP `409 SESSION_EXPIRED`.

**Validates: Requirements 2.4**

---

Property 3: Bug Condition — Auto-Trigger Diagnosis on Last Answer

_For any_ jawaban yang menyebabkan `count(responses WHERE studentId AND sessionId) === totalQuestions`, endpoint `POST /api/responses` yang sudah diperbaiki SHALL memanggil `enqueueRunDiagnosis(sessionId)` sebagai efek samping, tepat satu kali per (studentId, sessionId) completion.

**Validates: Requirements 2.6**

---

Property 4: Bug Condition — SSE Broadcast per Response

_For any_ `prisma.response.create()` yang berhasil, endpoint `POST /api/responses` yang sudah diperbaiki SHALL memanggil `buildHeatmapState(sessionId, schoolId)` dan `sseManager.broadcast(sessionId, entries)` sebelum return `201`.

**Validates: Requirements 2.8**

---

Property 5: Bug Condition — Complete Page Has Redirect and Back Button

_For any_ render halaman `/student/quiz/[sessionId]/complete`, Client Component yang sudah diperbaiki SHALL memulai countdown 10 detik yang berakhir dengan `router.push('/student/join')`, DAN SHALL menampilkan tombol eksplisit "Kembali ke Halaman Awal".

**Validates: Requirements 2.10, 2.11**

---

Property 6: Bug Condition — Submit State Always Resets

_For any_ eksekusi `handleSubmit` yang berhasil (API return 201), state `isSubmitting` dan `animating` SHALL di-reset ke `false` di blok `finally`, sehingga tombol kembali aktif bahkan jika terjadi error tak terduga setelah API call.

**Validates: Requirements 2.12, 2.13**

---

Property 7: Preservation — Valid Student Auth Unchanged

_For any_ credential input `(pinCode, studentId)` di mana `student.classId === sessionPin.test.classId` DAN `student.schoolId === sessionPin.schoolId`, autentikasi SHALL tetap berhasil persis seperti sebelum fix.

**Validates: Requirements 3.1, 3.2**

---

Property 8: Preservation — Active Session Accepts Answers

_For any_ request submit di mana sesi ACTIVE dan `Date.now() < startedAt + durationSeconds * 1000`, endpoint SHALL tetap menerima jawaban dan return `201 Created`.

**Validates: Requirements 3.3, 3.4**

---

Property 9: Preservation — POST /api/responses Execution Order

_For any_ jawaban yang berhasil disimpan, urutan eksekusi pasca-save SHALL selalu: (1) simpan ke DB → (2) broadcast SSE → (3) cek completion → (4) enqueue diagnosis jika selesai → (5) return 201. Kegagalan di langkah 2–4 (fire-and-forget) tidak boleh memblokir `201` response ke klien.

**Validates: Requirements 2.8, 2.6, 3.5, 3.7**


## Fix Implementation

### Architecture Overview per File

```
src/auth.ts                                    ← Bug #1 (auth chain)
src/app/api/student/join/route.ts              ← Bug #1 (studentId verify path)
src/app/api/responses/route.ts                 ← Bug #1 cross-check + Bug #2 + Bug #3 + Bug #4
src/app/api/sessions/[id]/quiz/route.ts        ← Bug #2 (expose startedAt)
src/app/student/quiz/[sessionId]/page.tsx      ← Bug #2 (countdown) + Bug #6 (finally)
src/app/student/quiz/[sessionId]/complete/     ← Bug #5 (new Client Component)
  page.tsx  →  DELETE (Server Component)
  _client.tsx → CREATE (Client Component, countdown + redirect)
```

---

### Bug #1 — `src/auth.ts` (provider `student-pin`)

**Function:** `authorize()` in Credentials provider `student-pin`

**Perubahan:**

1. **Tambah `test.classId` ke query `sessionPin`:**
   ```ts
   // BEFORE
   select: { id: true, schoolId: true, state: true }

   // AFTER
   select: {
     id: true, schoolId: true, state: true,
     test: { select: { classId: true } }
   }
   ```

2. **Tambah `classId` ke query `student`:**
   ```ts
   // BEFORE
   select: { id: true, schoolId: true, anonymousLabel: true }

   // AFTER
   select: { id: true, schoolId: true, classId: true, anonymousLabel: true }
   ```

3. **Tambah validasi classId:**
   ```ts
   // BEFORE
   if (!student || student.schoolId !== sessionPin.schoolId) { return null; }

   // AFTER
   if (
     !student ||
     student.schoolId !== sessionPin.schoolId ||
     student.classId  !== sessionPin.test.classId
   ) { return null; }
   ```


### Bug #1 — `src/app/api/student/join/route.ts` (studentId-provided path)

**Perubahan:** Blok `if (studentId)` saat ini hanya memvalidasi `student.schoolId`. Tambah validasi classId:

```ts
// Query student dengan classId
const student = await prisma.student.findUnique({
  where: { id: studentId },
  select: { id: true, schoolId: true, classId: true, anonymousLabel: true },
});

// BEFORE
if (!student || student.schoolId !== sessionPin.schoolId) { ... }

// AFTER
if (
  !student ||
  student.schoolId !== sessionPin.schoolId ||
  student.classId  !== sessionPin.test.classId
) { ... }
```

**Catatan:** Blok `no-studentId` (return students list) sudah benar — sudah filter `{ schoolId, classId: sessionPin.test.classId }`.

### Bug #1 — `src/app/api/responses/route.ts` (cross-check layer)

**Perubahan:** Tambah validasi classId setelah load `sessionPin`. Query `sessionPin` perlu include `test.classId`, dan tambah query student untuk cross-check:

```ts
// Extend sessionPin query
const sessionPin = await prisma.sessionPin.findFirst({
  where: { id: sessionId, schoolId: studentSession.schoolId },
  select: {
    id: true, state: true, testId: true,
    test: { select: { classId: true } }   // ← tambah ini
  },
});

// Tambah cross-check setelah sessionPin validation
const student = await prisma.student.findUnique({
  where: { id: studentSession.studentId },
  select: { classId: true },
});

if (!student || student.classId !== sessionPin.test.classId) {
  return NextResponse.json(
    { success: false, error: { code: 'FORBIDDEN', message: 'Anda tidak terdaftar di kelas sesi ini.' } },
    { status: 403 }
  );
}
```


### Bug #2 — `src/app/api/responses/route.ts` (deadline check)

**Perubahan:** Extend query sessionPin + tambah deadline check sebelum duplicate check:

```ts
// Extend select
select: {
  id: true, state: true, testId: true,
  startedAt: true,                             // ← tambah
  test: {
    select: {
      classId: true,
      durationSeconds: true,                   // ← tambah
    }
  }
}

// Tambah deadline check setelah state check
if (sessionPin.startedAt) {
  const deadlineMs = sessionPin.startedAt.getTime()
    + sessionPin.test.durationSeconds * 1000;
  if (Date.now() > deadlineMs) {
    return NextResponse.json(
      { success: false, error: { code: 'SESSION_EXPIRED', message: 'Waktu sesi telah habis.' } },
      { status: 409 }
    );
  }
}
```

### Bug #2 — `src/app/api/sessions/[id]/quiz/route.ts` (expose startedAt)

**Perubahan:** Tambah `startedAt` ke query `sessionPin` dan sertakan di response:

```ts
// Extend sessionPin select
select: {
  id: true, state: true,
  startedAt: true,       // ← tambah
  test: { select: { ..., durationSeconds: true } }  // durationSeconds sudah ada
}

// Tambah ke response data
data: {
  sessionId: id,
  topic: sessionPin.test.topic,
  durationSeconds: sessionPin.test.durationSeconds,
  startedAt: sessionPin.startedAt?.toISOString() ?? null,  // ← tambah
  items: quizItems,
}
```

### Bug #2 — `src/app/student/quiz/[sessionId]/page.tsx` (countdown timer)

**Perubahan:**

1. Tambah `startedAt: string | null` ke type `QuizData`
2. Parse `raw.startedAt` saat normalize quiz data dari API response
3. Tambah state `timeExpired` dan `sessionDeadlineMs`
4. Tambah `useEffect` yang menghitung sisa waktu berdasarkan `sessionDeadlineMs - Date.now()` dan tick setiap detik
5. Ketika `timeExpired === true`, disable tombol submit dan tampilkan banner "Waktu habis"
6. Sertakan `timeExpired` dalam kondisi `canSubmit`


### Bug #3 & #4 — `src/app/api/responses/route.ts` (completion + broadcast)

Kedua bug di-fix di blok yang sama, sesudah `prisma.response.create()`. Urutan eksekusi yang benar (lihat juga bagian Execution Order di bawah):

```ts
// 1. Simpan response (existing)
const savedResponse = await prisma.response.create({ ... });

// 2. Broadcast SSE (Bug #4 fix) — fire-and-forget, tidak memblokir response
buildHeatmapState(sessionId, studentSession.schoolId)
  .then((entries) => sseManager.broadcast(sessionId, entries))
  .catch((err) => console.error('[responses] SSE broadcast failed:', err));

// 3. Cek completion + enqueue diagnosis (Bug #3 fix) — fire-and-forget
prisma.response.count({
  where: { sessionPinId: sessionId, studentId: studentSession.studentId },
}).then(async (studentResponseCount) => {
  const totalQuestions = await prisma.question.count({
    where: { testId: sessionPin.testId },
  });
  if (studentResponseCount >= totalQuestions) {
    await enqueueRunDiagnosis(sessionId);
  }
}).catch((err) => console.error('[responses] Diagnosis enqueue failed:', err));

// 4. Return 201 (tidak menunggu langkah 2 dan 3)
return NextResponse.json({ success: true, data: { responseId: savedResponse.id } }, { status: 201 });
```

**Rasional fire-and-forget:** SSE broadcast dan enqueue diagnosis adalah efek samping yang tidak boleh menghambat respons ke siswa. Kegagalan di keduanya sudah di-log dan tidak mempengaruhi integritas data inti (response sudah tersimpan).

**Import baru yang diperlukan di route:**
```ts
import { sseManager } from '@/lib/sse/manager';
import { buildHeatmapState } from '@/lib/sse/heatmap-builder';
import { enqueueRunDiagnosis } from '@/workers/run-diagnosis';
```


### Bug #5 — Complete Page: Server Component → Client Component

**Pendekatan:** Pisahkan konten statis dari logika interaktif menggunakan pola Client Component di dalam Server Component (opsional), atau langsung konversi seluruh file ke Client Component.

**Rekomendasi:** Hapus metadata export dan konversi seluruh file ke Client Component karena tidak ada data fetching server-side di halaman ini.

**File:** `src/app/student/quiz/[sessionId]/complete/page.tsx`

**Perubahan:**
1. Tambah `"use client"` di baris pertama
2. Hapus `export const metadata` (tidak bisa di Client Component)
3. Tambah imports: `useEffect`, `useState`, `useRouter` dari `next/navigation`
4. Tambah state `countdown` (initial: 10)
5. Tambah `useEffect` yang men-tick countdown setiap detik dan memanggil `router.push('/student/join')` saat countdown === 0
6. Tambah display countdown: `"Kembali otomatis dalam {countdown} detik"`
7. Tambah tombol eksplisit "Kembali ke Halaman Awal" dengan `onClick={() => router.push('/student/join')}`

**Struktur komponen baru (pseudocode):**
```
"use client"

export default function QuizCompletePage() {
  const router = useRouter()
  const [countdown, setCountdown] = useState(10)

  useEffect(() => {
    if (countdown <= 0) { router.push('/student/join'); return; }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown, router])

  return (
    <div>
      {/* existing visual content ... */}
      <p>Kembali otomatis dalam {countdown} detik</p>
      <button onClick={() => router.push('/student/join')}>
        Kembali ke Halaman Awal
      </button>
    </div>
  )
}
```


### Bug #6 — `src/app/student/quiz/[sessionId]/page.tsx` (finally block)

**Perubahan:** Restruktur `handleSubmit` agar reset state dijamin di `finally`:

```ts
// BEFORE — isSubmitting hanya di-reset di dalam setTimeout (sukses) atau catch (error)
const handleSubmit = useCallback(async () => {
  setIsSubmitting(true);
  try {
    // ...fetch...
    if (nextIndex >= quiz.items.length) {
      router.push(...);     // ← isSubmitting tidak di-reset
    } else {
      setAnimating(true);
      setTimeout(() => {
        setCurrentIndex(nextIndex);
        setIsSubmitting(false);   // ← only here
        setAnimating(false);
      }, 250);
    }
  } catch (err) {
    // ...
    setIsSubmitting(false);
  }
}, [...]);

// AFTER — reset di finally, animating di setTimeout
const handleSubmit = useCallback(async () => {
  setIsSubmitting(true);
  try {
    // ...fetch...
    if (nextIndex >= quiz.items.length) {
      router.push(...);
    } else {
      setAnimating(true);
      setTimeout(() => {
        setCurrentIndex(nextIndex);
        setAnimating(false);
        // isSubmitting akan di-reset oleh finally setelah setTimeout schedule
      }, 250);
    }
  } catch (err) {
    // ...error handling tetap sama...
  } finally {
    // Reset isSubmitting selalu, kecuali jika animating (setTimeout akan handle)
    if (!animatingRef.current) {
      setIsSubmitting(false);
    }
  }
}, [...]);
```

**Alternatif lebih sederhana** (direkomendasikan untuk menghindari ref complexity): Gunakan `try/catch/finally` dan selalu reset `isSubmitting` di `finally`, sedangkan `animating` tetap dikontrol oleh `setTimeout`. Karena `animating` hanya memblokir `canSubmit` (bukan submit button disabled), kedua state dapat di-reset secara independen.


### Execution Order di `POST /api/responses` Setelah Fix

Diagram urutan lengkap setelah ketiga bug (#1, #2, #3, #4) diperbaiki:

```
POST /api/responses
│
├─ 1. requireStudentSession()                    ← auth check
├─ 2. Input validation (sessionId, itemVariantId, etc.)
├─ 3. sessionSession.sessionPinId === body.sessionId  ← existing
├─ 4. prisma.sessionPin.findFirst(...)           ← now includes startedAt + test.classId + durationSeconds
├─ 5. sessionPin.state === 'ACTIVE' check        ← existing
├─ 6. [NEW] Deadline check: startedAt + duration < now → 409 SESSION_EXPIRED
├─ 7. [NEW] classId cross-check: student.classId === sessionPin.test.classId → 403 FORBIDDEN
├─ 8. prisma.itemVariant.findFirst(...)          ← existing
├─ 9. Deterministic variant assignment check     ← existing
├─ 10. Duplicate response check                  ← existing
├─ 11. calculateIntegrityIndex() + classifyPerItem()  ← existing
├─ 12. prisma.response.create(...)               ← existing — save to DB
│
├─ 13. [NEW] fire-and-forget: buildHeatmapState + sseManager.broadcast  ← Bug #4
├─ 14. [NEW] fire-and-forget: count student responses → if complete → enqueueRunDiagnosis  ← Bug #3
│
└─ 15. return 201 { responseId }
```

**Kunci desain:** Langkah 13 dan 14 dieksekusi sebagai fire-and-forget (`.then().catch()`). Response ke klien (langkah 15) tidak menunggu keduanya selesai.


### Data Flow: Countdown Timer (Server → Client)

```
[Server] GET /api/sessions/:id/quiz
   │  sessionPin.startedAt     (DateTime)
   │  test.durationSeconds     (Int)
   │
   ▼
[Response JSON]
   {
     sessionId, topic, items,
     durationSeconds: 900,
     startedAt: "2025-01-15T08:00:00.000Z"  ← NEW
   }

[Client] src/app/student/quiz/[sessionId]/page.tsx
   │  quizData.startedAt parsed → new Date(raw.startedAt).getTime()
   │  deadlineMs = startedAtMs + durationSeconds * 1000
   │
   ├─ useEffect (tick setiap 1000ms):
   │     remaining = deadlineMs - Date.now()
   │     if remaining <= 0 → setTimeExpired(true)
   │
   ├─ canSubmit = selectedOption && criTouched && !isSubmitting
   │              && retryCountdown === 0 && !animating
   │              && !timeExpired   ← NEW condition
   │
   └─ UI: Banner "Waktu Habis" ketika timeExpired === true
          Timer display: "Sisa waktu: MM:SS"
```

**Edge cases:**
- Jika `startedAt` null (sesi lama sebelum fix): tidak ada countdown, perilaku seperti sebelumnya
- Jika klien muat halaman setelah deadline: `timeExpired` langsung `true` dari load
- Server-side deadline check di `POST /api/responses` tetap menjadi garis pertahanan utama


## Testing Strategy

### Validation Approach

Testing mengikuti dua fase: (1) **Exploratory** — jalankan test di kode unfixed untuk konfirmasi root cause, (2) **Fix + Preservation** — jalankan setelah fix untuk memverifikasi bug diperbaiki dan perilaku lain tidak rusak.

---

### Exploratory Bug Condition Checking

**Goal:** Surfacing counterexample sebelum fix untuk konfirmasi root cause.

**Bug #1 — Cross-class auth:**
- Test: Buat siswa dari Kelas B, ambil PIN sesi Kelas A, panggil `authorize()` provider `student-pin` → ekspektasi fail tapi AKAN PASS di kode unfixed (bug!)
- Test: Panggil `POST /api/responses` dengan JWT dari sesi Kelas A menggunakan siswa Kelas B → ekspektasi reject, AKAN diterima di kode unfixed

**Bug #2 — Deadline:**
- Test: Mock `Date.now()` ke nilai setelah deadline, submit jawaban ke sesi ACTIVE → ekspektasi `409 SESSION_EXPIRED`, AKAN return `201` di kode unfixed

**Bug #3 — Auto-diagnosis:**
- Test: Submit jawaban terakhir siswa → cek apakah `enqueueRunDiagnosis` dipanggil → TIDAK akan dipanggil di kode unfixed
- Test: Mock `prisma.response.count()` dan `prisma.question.count()` → verifikasi completion logic tidak ada

**Bug #4 — SSE broadcast:**
- Test: Spy pada `sseManager.broadcast` → submit jawaban → verifikasi broadcast dipanggil → TIDAK akan dipanggil di kode unfixed

**Bug #5 — Complete page:**
- Test: Render `QuizCompletePage` → cek apakah ada elemen tombol "Kembali" → TIDAK ada di kode unfixed
- Test: Cek apakah ada `useEffect` countdown → TIDAK ada (Server Component)

**Bug #6 — State reset:**
- Test: Mock `router.push` melempar error setelah `fetch` sukses → cek `isSubmitting` setelah → AKAN tetap `true` di kode unfixed

---

### Fix Checking

**Goal:** Verifikasi bug sudah diperbaiki setelah implementation.

**Pseudocode universal:**
```
FOR ALL input WHERE isBugCondition_Bn(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior_Bn(result)
END FOR
```

**Test Cases per Bug:**

| Bug | Input | Expected Result After Fix |
|-----|-------|--------------------------|
| #1 | siswa Kelas B + PIN Kelas A | `null` dari `authorize()`, `403` dari `POST /api/responses` |
| #2 | jawaban + mock time > deadline | `409 SESSION_EXPIRED` |
| #3 | jawaban terakhir siswa | `enqueueRunDiagnosis` dipanggil sekali |
| #4 | setiap jawaban berhasil disimpan | `sseManager.broadcast` dipanggil dengan entries terbaru |
| #5 | render complete page | tombol "Kembali" ada, countdown dimulai dari 10 |
| #6 | `router.push` throw setelah fetch sukses | `isSubmitting` → `false` setelah `finally` |


### Preservation Checking

**Goal:** Verifikasi perilaku yang ada tidak rusak.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition_Bn(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach:** Property-based testing direkomendasikan untuk preservation checking karena:
- Men-generate banyak kombinasi input otomatis (classId valid, schoolId valid, waktu dalam deadline)
- Menangkap edge case yang mungkin terlewat dari unit test manual
- Memberikan jaminan kuat bahwa kode yang benar tidak terpengaruh

**Preservation Test Cases:**

1. **Valid Auth Preservation**: Siswa dengan classId yang benar → auth TETAP berhasil
2. **Session Accept Valid Answer Preservation**: Sesi ACTIVE, waktu belum habis → jawaban TETAP diterima
3. **Partial Completion No Diagnosis**: Siswa submit soal 1 dari 5 → `enqueueRunDiagnosis` TIDAK dipanggil
4. **SSE Last State Preserved**: Klien baru connect → masih mendapat state terakhir via `getLastState()`
5. **Complete Page Visual Preserved**: Halaman complete TETAP menampilkan centang hijau, "Kuis Selesai!", info tunggu guru
6. **Error Path State Reset Preserved**: API gagal (non-2xx) → `isSubmitting = false`, error message tampil, tidak pindah soal

---

### Unit Tests

- `src/auth.ts` provider `student-pin`: test semua kombinasi (schoolId match/mismatch × classId match/mismatch)
- `POST /api/responses`: test deadline check dengan berbagai `startedAt` + `durationSeconds` combinations
- `POST /api/responses`: test classId cross-check dengan mock student berbeda kelas
- `POST /api/responses`: test completion trigger dengan berbagai jumlah respons vs total soal
- `POST /api/responses`: test bahwa `201` di-return sebelum fire-and-forget selesai
- `QuizCompletePage`: test countdown decrement, test tombol redirect, test `router.push('/student/join')` dipanggil setelah countdown
- `handleSubmit` di quiz page: test `isSubmitting` di-reset ke `false` di `finally` untuk semua jalur eksekusi

### Property-Based Tests

- Generate random `(studentId, sessionId)` pairs → verifikasi hanya student dengan classId benar yang lolos auth (Property 1, 7)
- Generate random timestamps dengan `Date.now()` sebelum/sesudah deadline → verifikasi deadline enforcement konsisten (Property 2, 8)
- Generate random response count sequences → verifikasi `enqueueRunDiagnosis` dipanggil tepat saat count === totalQuestions, tidak sebelum (Property 3)
- Generate random heatmap states → verifikasi setiap `response.create` menghasilkan broadcast dengan state yang mencerminkan count terbaru (Property 4)

### Integration Tests

- Flow lengkap: siswa Kelas B mencoba masuk sesi Kelas A → ditolak di halaman join
- Flow lengkap: siswa mengerjakan semua soal → complete page ditampilkan → countdown berjalan → redirect ke join
- Flow lengkap: submit jawaban terakhir → portal guru menerima SSE event dalam < 2 detik
- Flow lengkap: semua siswa kelas selesai → `computeConceptDiagnosis` dijalankan → heatmap update dengan `cognitiveStatus`

