/**
 * Heatmap State Builder
 *
 * Builds the current heatmap state for a session from the database.
 * Used both by the SSE endpoint (initial payload) and the HTTP polling fallback.
 *
 * Logic per student:
 *   - 0 responses       → NOT_SUBMITTED
 *   - 0 < n < total     → PARTIAL
 *   - n >= total        → COMPLETE
 *   + cognitiveStatus from ConceptDiagnosis majority vote (if CLOSED)
 *
 * Returns HeatmapEntry[] sorted alphabetically by anonymousLabel.
 */

import { prisma } from '@/lib/db/client';
import type { HeatmapEntry, CognitiveStatus } from '@/types';

// ─── FinalStatus → CognitiveStatus mapping ────────────────────────────────────
// Prisma FinalStatus does not include 'INVALID' — only INSUFFICIENT_DATA is the
// "no-data" value. CognitiveStatus is a superset used by the heatmap.

const finalStatusToCognitive: Record<string, CognitiveStatus> = {
  PAHAM_KONSEP:      'PAHAM_KONSEP',
  LUCKY_GUESS:       'LUCKY_GUESS',
  MISKONSEPSI:       'MISKONSEPSI',
  TIDAK_PAHAM:       'TIDAK_PAHAM',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
};

// ─── Main builder function ────────────────────────────────────────────────────

/**
 * Build the current heatmap state from the database.
 *
 * @param sessionId - SessionPin.id
 * @param schoolId  - Teacher's school_id (used for tenant validation)
 * @returns HeatmapEntry[] sorted by anonymousLabel
 */
export async function buildHeatmapState(
  sessionId: string,
  schoolId: string
): Promise<HeatmapEntry[]> {
  // ── 1. Load session with test + class info ──────────────────────────────────
  const sessionPin = await prisma.sessionPin.findFirst({
    where: { id: sessionId, schoolId },
    select: {
      id: true,
      state: true,
      test: {
        select: {
          classId: true,
          _count: { select: { questions: true } },
        },
      },
    },
  });

  if (!sessionPin) return [];

  const classId = sessionPin.test.classId;
  const totalQuestions = sessionPin.test._count.questions;

  // ── 2. Load all students in the class ──────────────────────────────────────
  const students = await prisma.student.findMany({
    where: { classId, schoolId },
    select: { id: true, anonymousLabel: true },
    orderBy: { anonymousLabel: 'asc' },
  });

  if (students.length === 0) return [];

  // ── 3. Load response counts per student for this session ───────────────────
  // Group by studentId using Prisma's groupBy
  const responseCounts = await prisma.response.groupBy({
    by: ['studentId'],
    where: { sessionPinId: sessionId },
    _count: { id: true },
  });

  const responseCountMap = new Map<string, number>(
    responseCounts.map((r) => [r.studentId, r._count.id])
  );

  // ── 4. Load ConceptDiagnosis for majority-vote cognitive status ─────────────
  // Only relevant when session is CLOSED and diagnosis has run.
  // We derive a single cognitiveStatus per student using a simple majority
  // across all question diagnoses for that student.
  let cognitiveStatusMap = new Map<string, CognitiveStatus>();

  if (sessionPin.state === 'CLOSED') {
    const diagnoses = await prisma.conceptDiagnosis.findMany({
      where: { sessionPinId: sessionId },
      select: { studentId: true, finalStatus: true },
    });

    // Tally per student
    const tallyMap = new Map<string, Map<string, number>>();
    for (const d of diagnoses) {
      if (!tallyMap.has(d.studentId)) {
        tallyMap.set(d.studentId, new Map());
      }
      const tally = tallyMap.get(d.studentId)!;
      tally.set(d.finalStatus, (tally.get(d.finalStatus) ?? 0) + 1);
    }

    // Precedency order (highest priority first)
    const PRECEDENCY: string[] = [
      'MISKONSEPSI',
      'LUCKY_GUESS',
      'TIDAK_PAHAM',
      'PAHAM_KONSEP',
      'INSUFFICIENT_DATA',
    ];

    for (const [studentId, tally] of Array.from(tallyMap.entries())) {
      if (tally.size === 0) continue;

      // Find max frequency
      let maxFreq = 0;
      for (const count of Array.from(tally.values())) {
        if (count > maxFreq) maxFreq = count;
      }

      // Collect candidates with max frequency
      const candidates: string[] = [];
      for (const [status, count] of Array.from(tally.entries())) {
        if (count === maxFreq) candidates.push(status);
      }

      // Apply precedency rule for ties
      let dominantStatus: string;
      if (candidates.length === 1) {
        dominantStatus = candidates[0];
      } else {
        dominantStatus =
          PRECEDENCY.find((p) => candidates.includes(p)) ?? candidates[0];
      }

      const cognitive = finalStatusToCognitive[dominantStatus];
      if (cognitive) {
        cognitiveStatusMap.set(studentId, cognitive);
      }
    }
  }

  // ── 5. Build HeatmapEntry[] ─────────────────────────────────────────────────
  const entries: HeatmapEntry[] = students.map((student) => {
    const submittedCount = responseCountMap.get(student.id) ?? 0;

    let submissionStatus: HeatmapEntry['submissionStatus'];
    if (submittedCount === 0) {
      submissionStatus = 'NOT_SUBMITTED';
    } else if (totalQuestions > 0 && submittedCount >= totalQuestions) {
      submissionStatus = 'COMPLETE';
    } else {
      submissionStatus = 'PARTIAL';
    }

    const entry: HeatmapEntry = {
      anonymousLabel: student.anonymousLabel,
      submissionStatus,
    };

    const cognitive = cognitiveStatusMap.get(student.id);
    if (cognitive) {
      entry.cognitiveStatus = cognitive;
    }

    return entry;
  });

  return entries;
}
