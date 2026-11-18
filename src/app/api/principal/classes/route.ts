/**
 * GET /api/principal/classes
 *
 * Returns per-class comparison of cognitive status distributions for the
 * Principal's stacked bar chart. Aggregated — no individual data exposed.
 *
 * Query params:
 *  - from: ISO date string (optional, default: 6 months ago)
 *  - to:   ISO date string (optional, default: now)
 *
 * Auth: PRINCIPAL only
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  let session;
  try {
    session = await requireRole('PRINCIPAL');
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  const now = new Date();
  const from = fromParam ? new Date(fromParam) : new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const to = toParam ? new Date(toParam) : now;

  const sessions = await prisma.sessionPin.findMany({
    where: {
      schoolId: session.schoolId,
      state: 'CLOSED',
      createdAt: { gte: from, lte: to },
    },
    select: {
      id: true,
      test: {
        select: {
          classId: true,
          class: { select: { name: true, grade: true } },
        },
      },
    },
  });

  if (sessions.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  const sessionIds = sessions.map((s) => s.id);
  const sessionClassMap = new Map(
    sessions.map((s) => [
      s.id,
      { classId: s.test.classId, className: s.test.class.name, grade: s.test.class.grade },
    ])
  );

  const diagnoses = await prisma.conceptDiagnosis.findMany({
    where: { sessionPinId: { in: sessionIds } },
    select: { finalStatus: true, sessionPinId: true },
  });

  const classMap = new Map<
    string,
    { className: string; grade: string; counts: Record<string, number> }
  >();

  for (const d of diagnoses) {
    const info = sessionClassMap.get(d.sessionPinId);
    if (!info) continue;
    if (!classMap.has(info.classId)) {
      classMap.set(info.classId, {
        className: info.className,
        grade: info.grade,
        counts: { PAHAM_KONSEP: 0, LUCKY_GUESS: 0, MISKONSEPSI: 0, TIDAK_PAHAM: 0, INSUFFICIENT_DATA: 0 },
      });
    }
    const c = classMap.get(info.classId)!;
    c.counts[d.finalStatus] = (c.counts[d.finalStatus] ?? 0) + 1;
  }

  const data = Array.from(classMap.entries()).map(([classId, v]) => {
    const total = Object.values(v.counts).reduce((a, b) => a + b, 0);
    return {
      classId,
      className: v.className,
      grade: v.grade,
      total,
      PAHAM_KONSEP: v.counts.PAHAM_KONSEP ?? 0,
      LUCKY_GUESS: v.counts.LUCKY_GUESS ?? 0,
      MISKONSEPSI: v.counts.MISKONSEPSI ?? 0,
      TIDAK_PAHAM: v.counts.TIDAK_PAHAM ?? 0,
      INSUFFICIENT_DATA: v.counts.INSUFFICIENT_DATA ?? 0,
      learningLossPct:
        total > 0
          ? Math.round(((v.counts.MISKONSEPSI + v.counts.TIDAK_PAHAM) / total) * 100)
          : 0,
    };
  });

  return NextResponse.json({ success: true, data });
}
