/**
 * RemediAide — Diagnosis Pipeline
 *
 * computeConceptDiagnosis: aggregates per-item responses into per-concept
 * ConceptDiagnosis records using Majority Voting + Precedency Rule.
 *
 * generateRemedialGroups: groups students by their dominant finalStatus
 * and writes RemedialGroup records with hardcoded pedagogical prescriptions.
 */

import { prisma } from '@/lib/db/client';
import { classifyPerItem, aggregateMajorityVoting } from '@/lib/diagnostic/engine';
import { sseManager } from '@/lib/sse/manager';
import { buildHeatmapState } from '@/lib/sse/heatmap-builder';
import type { ResponseInput, DiagnosisResult } from '@/lib/diagnostic/engine';
import { runMlDiagnosis } from '@/lib/ml/pipeline';

// ─── Pedagogical prescriptions per cognitive status ───────────────────────────

export const PRESCRIPTIONS: Record<string, string> = {
  PAHAM_KONSEP:
    'Pengayaan: Berikan soal tantangan berbasis masalah terbuka untuk memperdalam pemahaman.',
  LUCKY_GUESS:
    'Konfirmasi: Berikan latihan soal isomorfik tambahan dengan umpan balik langsung untuk mengkonfirmasi pemahaman.',
  MISKONSEPSI:
    'Rekonstruksi Konsep: Gunakan aktivitas Cognitive Conflict (Posner et al., 1982) untuk menantang miskonsepsi dan membangun ulang pemahaman yang benar.',
  TIDAK_PAHAM:
    'Re-Teaching: Lakukan pengajaran ulang menggunakan scaffolding berbasis manipulatif konkret (Generative Learning). Mulai dari konsep dasar.',
  INSUFFICIENT_DATA:
    'Observasi Langsung: Data respons tidak mencukupi untuk diagnosis otomatis. Guru diharapkan melakukan observasi langsung terhadap siswa ini.',
};

// ─── computeConceptDiagnosis ──────────────────────────────────────────────────

/**
 * Run the full diagnosis pipeline for a session:
 *  1. Load all responses with item metadata
 *  2. Group by (studentId, questionId)
 *  3. Classify each response with DiagnosticEngine
 *  4. Aggregate per group with Majority Voting + Precedency Rule
 *  5. Upsert ConceptDiagnosis records
 *  6. Generate remedial groups
 *  7. Broadcast updated heatmap via SSE
 */
export async function computeConceptDiagnosis(sessionId: string): Promise<void> {
  // ── 1. Load session + schoolId ────────────────────────────────────────────
  const sessionPin = await prisma.sessionPin.findUnique({
    where: { id: sessionId },
    select: { id: true, schoolId: true },
  });

  if (!sessionPin) {
    console.error(`[compute] Session ${sessionId} not found.`);
    return;
  }

  const { schoolId } = sessionPin;

  // ── 2. Load all responses for the session ─────────────────────────────────
  const responses = await prisma.response.findMany({
    where: { sessionPinId: sessionId },
    select: {
      id: true,
      studentId: true,
      chosenOptionKey: true,
      criValue: true,
      responseTimeMs: true,
      itemVariantId: true,
    },
  });

  // Load itemVariants separately to get tauMinSeconds + questionId + correctOptionKey
  const variantIds = Array.from(new Set(responses.map((r) => r.itemVariantId)));
  const variants = await prisma.itemVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, tauMinSeconds: true, questionId: true, correctOptionKey: true },
  });
  const variantMap = new Map(variants.map((v) => [v.id, v]));

  if (responses.length === 0) {
    console.info(`[compute] No responses found for session ${sessionId}.`);
    await generateRemedialGroups(sessionId, schoolId);
    return;
  }

  // ── 3. Group by (studentId, questionId) ──────────────────────────────────
  type GroupKey = `${string}:${string}`;
  const groups = new Map<GroupKey, typeof responses>();

  for (const r of responses) {
    const variant = variantMap.get(r.itemVariantId);
    if (!variant) continue;
    const key: GroupKey = `${r.studentId}:${variant.questionId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  // ── 4 & 5. Classify + aggregate + upsert per group ────────────────────────
  const upsertPromises: Promise<unknown>[] = [];

  for (const [key, groupResponses] of Array.from(groups.entries())) {
    const [studentId, questionId] = key.split(':') as [string, string];

    // Classify each response in the group
    const diagnosisResults: DiagnosisResult[] = groupResponses.map((r) => {
      const variant = variantMap.get(r.itemVariantId)!;
      const isCorrect = r.chosenOptionKey === variant.correctOptionKey;
      const input: ResponseInput = {
        itemId: r.itemVariantId,
        isCorrect,
        criValue: r.criValue,
        responseTimeMs: r.responseTimeMs,
        tauMinMs: variant.tauMinSeconds * 1000,
      };
      return classifyPerItem(input);
    });

    // Aggregate with Majority Voting
    const aggregation = aggregateMajorityVoting(diagnosisResults);

    // Map CognitiveStatus → FinalStatus (they share the same values except INVALID)
    const finalStatus = aggregation.finalStatus === 'INVALID'
      ? 'INSUFFICIENT_DATA'
      : aggregation.finalStatus;

    // Upsert ConceptDiagnosis
    upsertPromises.push(
      prisma.conceptDiagnosis.upsert({
        where: {
          sessionPinId_studentId_questionId: {
            sessionPinId: sessionId,
            studentId,
            questionId,
          },
        },
        update: {
          finalStatus: finalStatus as 'PAHAM_KONSEP' | 'LUCKY_GUESS' | 'MISKONSEPSI' | 'TIDAK_PAHAM' | 'INSUFFICIENT_DATA',
          votingTally: aggregation.votingTally as unknown as import('@prisma/client').Prisma.InputJsonValue,
          tiebreakerApplied: aggregation.tiebreakerApplied,
          validItemCount: aggregation.validItemCount,
          manuallyOverridden: false,
        },
        create: {
          sessionPinId: sessionId,
          studentId,
          questionId,
          schoolId,
          finalStatus: finalStatus as 'PAHAM_KONSEP' | 'LUCKY_GUESS' | 'MISKONSEPSI' | 'TIDAK_PAHAM' | 'INSUFFICIENT_DATA',
          votingTally: aggregation.votingTally as unknown as import('@prisma/client').Prisma.InputJsonValue,
          tiebreakerApplied: aggregation.tiebreakerApplied,
          validItemCount: aggregation.validItemCount,
          manuallyOverridden: false,
        },
      })
    );
  }

  await Promise.all(upsertPromises);
  console.info(
    `[compute] Session ${sessionId}: ${upsertPromises.length} ConceptDiagnosis records upserted.`
  );

  // ── 6. Generate remedial groups ───────────────────────────────────────────
  await generateRemedialGroups(sessionId, schoolId);

  // ── 6b. RemediAide 2.0: ML diagnosis (optional; never fails the v1 pipeline) ─
  await runMlDiagnosis(sessionId, schoolId);

  // ── 7. Broadcast final heatmap state via SSE ──────────────────────────────
  try {
    const heatmapEntries = await buildHeatmapState(sessionId, schoolId);
    sseManager.broadcast(sessionId, heatmapEntries);
  } catch (err) {
    console.error(`[compute] Failed to broadcast heatmap for session ${sessionId}:`, err);
  }
}

// ─── computeDominantStatus ────────────────────────────────────────────────────

/**
 * Compute the dominant cognitive status from an array of status strings
 * using majority voting + precedency rule for tie-breaking.
 *
 * Precedency rule (highest priority first):
 *   MISKONSEPSI > LUCKY_GUESS > TIDAK_PAHAM > PAHAM_KONSEP
 *
 * @param statuses - Array of finalStatus strings for a single student
 * @returns The dominant status, or 'INSUFFICIENT_DATA' if the array is empty
 */
export function computeDominantStatus(statuses: string[]): string {
  if (statuses.length === 0) return 'INSUFFICIENT_DATA';

  // Tally frequency of each status
  const tally: Record<string, number> = {};
  for (const s of statuses) {
    tally[s] = (tally[s] ?? 0) + 1;
  }

  const maxFreq = Math.max(...Object.values(tally));
  const candidates = Object.entries(tally)
    .filter(([, freq]) => freq === maxFreq)
    .map(([s]) => s);

  // Single clear winner
  if (candidates.length === 1) return candidates[0];

  // Tie-break with precedency rule
  const PRECEDENCY = ['MISKONSEPSI', 'LUCKY_GUESS', 'TIDAK_PAHAM', 'PAHAM_KONSEP'];
  return PRECEDENCY.find((s) => candidates.includes(s)) ?? 'INSUFFICIENT_DATA';
}

// ─── generateRemedialGroups ───────────────────────────────────────────────────

/**
 * Group students by their dominant cognitive status and write RemedialGroup records.
 * Deletes existing groups for the session before recreating them (clean regeneration).
 *
 * Algorithm:
 *  1. Load all ConceptDiagnosis rows for the session
 *  2. Aggregate per-student: collect all finalStatus values per studentId
 *  3. Compute dominant status per student using majority voting + precedency rule
 *  4. Group students by their dominant status
 *  5. Delete existing groups and recreate (clean regeneration / idempotent)
 */
export async function generateRemedialGroups(
  sessionId: string,
  schoolIdArg?: string
): Promise<void> {
  // Resolve schoolId if not provided
  let schoolId = schoolIdArg;
  if (!schoolId) {
    const session = await prisma.sessionPin.findUnique({
      where: { id: sessionId },
      select: { schoolId: true },
    });
    if (!session) return;
    schoolId = session.schoolId;
  }

  // Load all ConceptDiagnosis for session with student anonymousLabel
  const diagnoses = await prisma.conceptDiagnosis.findMany({
    where: { sessionPinId: sessionId },
    select: {
      finalStatus: true,
      studentId: true,
      student: { select: { anonymousLabel: true } },
    },
  });

  // ── Tahap 1: Aggregasi per siswa ──────────────────────────────────────────
  // Collect all finalStatus values per studentId
  const perStudent = new Map<string, { label: string; statuses: string[] }>();
  for (const d of diagnoses) {
    if (!perStudent.has(d.studentId)) {
      perStudent.set(d.studentId, { label: d.student.anonymousLabel, statuses: [] });
    }
    perStudent.get(d.studentId)!.statuses.push(d.finalStatus as string);
  }

  // ── Tahap 2: Hitung status dominan per siswa ─────────────────────────────
  // Apply majority voting + precedency rule per student
  const studentDominant = new Map<string, { label: string; dominantStatus: string }>();
  for (const [studentId, data] of Array.from(perStudent.entries())) {
    const dominant = computeDominantStatus(data.statuses);
    studentDominant.set(studentId, { label: data.label, dominantStatus: dominant });
  }

  // ── Tahap 3: Kelompokkan berdasarkan status dominan ───────────────────────
  // Each student appears in exactly ONE group (their dominant status group)
  const grouped = new Map<string, string[]>();
  for (const { label, dominantStatus } of Array.from(studentDominant.values())) {
    if (!grouped.has(dominantStatus)) grouped.set(dominantStatus, []);
    grouped.get(dominantStatus)!.push(label);
  }

  // Delete existing groups for clean regeneration
  await prisma.remedialGroup.deleteMany({ where: { sessionPinId: sessionId } });

  if (grouped.size === 0) {
    console.info(`[groups] No diagnoses found for session ${sessionId} — no groups created.`);
    return;
  }

  // Create new groups
  const createOps = Array.from(grouped.entries()).map(([status, labels]) =>
    prisma.remedialGroup.create({
      data: {
        sessionPinId: sessionId,
        schoolId: schoolId!,
        cognitiveStatus: status as 'PAHAM_KONSEP' | 'LUCKY_GUESS' | 'MISKONSEPSI' | 'TIDAK_PAHAM' | 'INSUFFICIENT_DATA',
        memberLabels: labels,
        prescription: PRESCRIPTIONS[status] ?? 'Tidak ada preskripsi.',
      },
    })
  );

  await Promise.all(createOps);
  console.info(
    `[groups] Session ${sessionId}: ${createOps.length} RemedialGroup records created.`
  );
}
