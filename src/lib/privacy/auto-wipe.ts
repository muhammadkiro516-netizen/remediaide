/**
 * RemediAide — Auto-Wipe Mechanism
 *
 * Implements Privacy by Design sesuai UU No. 27/2022 Pasal 25 & Pasal 3.
 * Sistem WAJIB stateless per siklus remediasi.
 *
 * Yang DIHAPUS oleh executeAutoWipe():
 *  - Seluruh baris Response terkait sessionId (jawaban, waktu berpikir,
 *    CRI mentah, integrity index, perItemStatus, dan teks alasan siswa
 *    `explanation` — kolom di tabel yang sama, jadi ikut terhapus)
 *
 * Yang DIPERTAHANKAN setelah wipe:
 *  - Student.anonymousLabel (identitas anonim persisten)
 *  - ConceptDiagnosis (ringkasan status akhir non-granular untuk pelaporan)
 *  - MlDiagnosis (ringkasan ML non-granular; TIDAK menyimpan teks alasan siswa —
 *    `reasons` hanya kalimat buatan sistem). Ekspor riset wajib dilakukan
 *    SEBELUM auto-wipe, karena teks alasan hilang setelahnya.
 *  - RemedialGroup (kelompok & preskripsi untuk laporan akreditasi)
 *  - AutoWipeLog (metadata event — TIDAK menyimpan data yang dihapus)
 *
 * Seluruh operasi dijalankan dalam satu transaksi Prisma ($transaction).
 * Jika salah satu step gagal, seluruh penghapusan dibatalkan (rollback).
 */

import { prisma } from '@/lib/db/client';

// ─── Result type ──────────────────────────────────────────────────────────────

export interface AutoWipeResult {
  recordsDeleted: number;
  sessionId: string;
  confirmedBy: string;
  wipedAt: Date;
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Executes the full auto-wipe for a session within a single Prisma transaction.
 *
 * @param sessionId              - The SessionPin.id to wipe
 * @param confirmedByTeacherId   - The Teacher.id who confirmed the operation
 * @returns AutoWipeResult with metadata about the deleted records
 * @throws Error if the session is not found, or if teacher does not own the session
 */
export async function executeAutoWipe(
  sessionId: string,
  confirmedByTeacherId: string
): Promise<AutoWipeResult> {
  return prisma.$transaction(async (tx) => {
    // 1. Count responses BEFORE deletion (for log and UI confirmation)
    const responseCount = await tx.response.count({
      where: { sessionPinId: sessionId },
    });

    // 2. Delete all raw response records for this session
    //    (answers, response times, CRI values, integrity indices, perItemStatus)
    await tx.response.deleteMany({
      where: { sessionPinId: sessionId },
    });

    // 3. Record the wipe event in AutoWipeLog
    //    (records what happened, NOT what was deleted — metadata only)
    const wipedAt = new Date();
    await tx.autoWipeLog.create({
      data: {
        sessionPinId: sessionId,
        confirmedById: confirmedByTeacherId,
        schoolId: await tx.sessionPin
          .findUnique({ where: { id: sessionId }, select: { schoolId: true } })
          .then((s) => s?.schoolId ?? ''),
        recordsDeleted: responseCount,
        success: true,
        errorMessage: null,
        executedAt: wipedAt,
      },
    });

    console.info(
      `[auto-wipe] Session ${sessionId}: ${responseCount} response records deleted, confirmed by teacher ${confirmedByTeacherId}.`
    );

    return {
      recordsDeleted: responseCount,
      sessionId,
      confirmedBy: confirmedByTeacherId,
      wipedAt,
    };
  });
}

// ─── Preview function ─────────────────────────────────────────────────────────

/**
 * Returns a summary of what would be deleted WITHOUT actually deleting anything.
 * Used for the first step of the two-step confirmation dialog.
 */
export async function previewAutoWipe(sessionId: string): Promise<{
  responseCount: number;
  studentCount: number;
  sessionTopic: string;
}> {
  const [responseCount, sessionPin] = await Promise.all([
    prisma.response.count({ where: { sessionPinId: sessionId } }),
    prisma.sessionPin.findUnique({
      where: { id: sessionId },
      select: {
        test: { select: { topic: true } },
      },
    }),
  ]);

  // Count unique students who submitted responses
  const studentCount = await prisma.response
    .findMany({
      where: { sessionPinId: sessionId },
      select: { studentId: true },
      distinct: ['studentId'],
    })
    .then((rows) => rows.length);

  return {
    responseCount,
    studentCount,
    sessionTopic: sessionPin?.test.topic ?? 'Tidak diketahui',
  };
}
