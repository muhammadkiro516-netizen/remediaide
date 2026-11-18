/**
 * GET /api/principal/overview
 *
 * Returns school-level aggregate data for the Principal dashboard.
 * Data is aggregated — no individual student identities are exposed.
 *
 * Returns:
 *  - perClassStats: per-class breakdown of finalStatus counts
 *  - sessionsPerMonth: count of completed sessions per month (last 12 months)
 *  - totalSessions: total CLOSED sessions for this school
 *
 * Auth: PRINCIPAL only (read-only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

export async function GET(_request: NextRequest) {
  let session;
  try {
    session = await requireRole('PRINCIPAL');
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }

  const schoolId = session.schoolId;

  // ── 1. All CLOSED sessions for this school ────────────────────────────────
  const sessions = await prisma.sessionPin.findMany({
    where: { schoolId, state: 'CLOSED' },
    select: {
      id: true,
      createdAt: true,
      test: {
        select: {
          classId: true,
          class: { select: { name: true, grade: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const sessionIds = sessions.map((s) => s.id);
  const totalSessions = sessions.length;

  // ── 2. ConceptDiagnosis aggregated by class ────────────────────────────────
  const diagnoses = sessionIds.length > 0
    ? await prisma.conceptDiagnosis.findMany({
        where: { sessionPinId: { in: sessionIds } },
        select: {
          finalStatus: true,
          sessionPinId: true,
        },
      })
    : [];

  // Map sessionId → classId+name
  const sessionClassMap = new Map(
    sessions.map((s) => [
      s.id,
      { classId: s.test.classId, className: s.test.class.name, grade: s.test.class.grade },
    ])
  );

  // Aggregate per class
  const classStatsMap = new Map<
    string,
    { className: string; grade: string; counts: Record<string, number> }
  >();

  for (const d of diagnoses) {
    const classInfo = sessionClassMap.get(d.sessionPinId);
    if (!classInfo) continue;

    const key = classInfo.classId;
    if (!classStatsMap.has(key)) {
      classStatsMap.set(key, {
        className: classInfo.className,
        grade: classInfo.grade,
        counts: {
          PAHAM_KONSEP: 0,
          LUCKY_GUESS: 0,
          MISKONSEPSI: 0,
          TIDAK_PAHAM: 0,
          INSUFFICIENT_DATA: 0,
        },
      });
    }
    const stats = classStatsMap.get(key)!;
    stats.counts[d.finalStatus] = (stats.counts[d.finalStatus] ?? 0) + 1;
  }

  const perClassStats = Array.from(classStatsMap.entries()).map(([classId, v]) => {
    const total = Object.values(v.counts).reduce((a, b) => a + b, 0);
    const learningLoss =
      (v.counts.MISKONSEPSI ?? 0) + (v.counts.TIDAK_PAHAM ?? 0);
    const learningLossPct = total > 0 ? Math.round((learningLoss / total) * 100) : 0;
    return {
      classId,
      className: v.className,
      grade: v.grade,
      counts: v.counts,
      total,
      learningLossPct,
    };
  });

  // ── 3. Sessions per month (last 12 months) ────────────────────────────────
  const now = new Date();
  const monthlyMap = new Map<string, number>();

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap.set(key, 0);
  }

  for (const s of sessions) {
    const d = new Date(s.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap.has(key)) {
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1);
    }
  }

  const sessionsPerMonth = Array.from(monthlyMap.entries()).map(([month, count]) => ({
    month,
    count,
  }));

  return NextResponse.json({
    success: true,
    data: {
      totalSessions,
      perClassStats,
      sessionsPerMonth,
    },
  });
}
