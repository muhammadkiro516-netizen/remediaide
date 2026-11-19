/**
 * Local end-to-end check (T60/T64): run the real diagnosis pipeline on every seeded session that has responses,
 * against the real ML service, and report MlDiagnosis rows written. Usage: npx tsx scripts/e2e-ml.ts
 */
import { prisma } from '@/lib/db/client';
import { computeConceptDiagnosis } from '@/lib/diagnosis/compute';

// Dev only: if the seed has no responses, every student of the ACTIVE session answers every question (synthetic).
async function ensureResponses() {
  if ((await prisma.response.count()) > 0) return;
  const pin = await prisma.sessionPin.findFirst({ where: { state: 'ACTIVE' }, include: { test: { include: { questions: { include: { variants: true } } } } } });
  if (!pin) return;
  const students = await prisma.student.findMany({ where: { classId: pin.test.classId } });
  const keys = ['A', 'B', 'C', 'D'];
  let n = 0;
  for (const [i, st] of students.entries()) {
    for (const [j, q] of pin.test.questions.entries()) {
      const v = q.variants[0];
      if (!v) continue;
      const correct = (i + j) % 3 !== 0;
      const wrong = keys.find((k) => k !== v.correctOptionKey) ?? 'A';
      await prisma.response.create({ data: {
        sessionPinId: pin.id, studentId: st.id, itemVariantId: v.id, schoolId: pin.schoolId,
        chosenOptionKey: correct ? v.correctOptionKey : wrong, criValue: (i * 2 + j) % 6, responseTimeMs: 8000 + 1000 * j,
        integrityIndex: 1, isBelowThreshold: false, perItemStatus: 'PAHAM_KONSEP',
        explanation: j === 0 ? 'karena angkanya lebih panjang jadi lebih besar' : null,
        submittedAt: new Date(Date.UTC(2026, 10, 30, 8, i, j)),
      } });
      n++;
    }
  }
  console.log(`synthetic responses created: ${n}`);
}

async function main() {
  await ensureResponses();
  const sessions = await prisma.sessionPin.findMany({ select: { id: true, pinCode: true, _count: { select: { responses: true } } } });
  for (const s of sessions.filter((x) => x._count.responses > 0)) {
    const t0 = Date.now();
    await computeConceptDiagnosis(s.id);
    const ml = await prisma.mlDiagnosis.count({ where: { sessionPinId: s.id } });
    const cd = await prisma.conceptDiagnosis.count({ where: { sessionPinId: s.id } });
    const sample = await prisma.mlDiagnosis.findFirst({ where: { sessionPinId: s.id, questionId: null } });
    console.log(JSON.stringify({ pin: s.pinCode, responses: s._count.responses, conceptDiagnoses: cd, mlDiagnoses: ml,
      ms: Date.now() - t0, sample: sample && { quadrant: sample.quadrant, deferred: sample.deferred, model: sample.modelVersion,
      reasons: sample.reasons } }));
  }
  await prisma.$disconnect();
}
main();
