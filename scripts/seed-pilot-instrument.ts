/**
 * T70: load the pilot instrument (15 MAP questions in Indonesian) into the app as one Test (no template variables).
 * Source: docs/cac/pilot/instrument_map_id.json (ml/scripts/pilot_materials.py). Idempotent (stable ids).
 *
 *   PILOT_TEACHER_EMAIL=guru@sekolah.sch.id PILOT_CLASS_NAME="X-A Pilot" npx tsx scripts/seed-pilot-instrument.ts
 * Options (env):
 *   PILOT_DUMMY_STUDENTS=3   also create N anonymous dummy students (dry run only; real classes use the dashboard)
 *   PILOT_PIN=424242         create/refresh a session with this PIN (default: no session, create it in the dashboard)
 *   PILOT_ACTIVE=1           set that session ACTIVE (dry run); default LOCKED
 * Every question gets mapQuestionId; the 5 key questions get requireExplanation = true (D-25). tauMin = ceil(words/2.5) s
 * on the Indonesian text (same rule as v1).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

interface Option { key: string; text_id: string; is_correct: boolean }
interface Item { order: number; map_question_id: number; stem_id: string; options: Option[]; correct_key: string;
  require_explanation: boolean; figure: string | null; needs_teacher_check: boolean }

const prisma = new PrismaClient();

function countWords(text: string): number {
  const n = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return n ? n.split(' ').length : 0;
}

export function tauMinSeconds(item: Item): number {
  const words = countWords(`${item.stem_id} ${item.options.map((o) => o.text_id).join(' ')}`);
  return Math.max(1, Math.ceil(words / 2.5));
}

async function main() {
  const inst = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/cac/pilot/instrument_map_id.json'), 'utf8')) as { items: Item[] };
  const email = process.env.PILOT_TEACHER_EMAIL ?? 'guru@remediaide.app';
  const className = process.env.PILOT_CLASS_NAME ?? 'Pilot RemediAide-ID';
  const teacher = await prisma.teacher.findUnique({ where: { email } });
  if (!teacher) throw new Error(`Guru ${email} tidak ditemukan. Buat akunnya dulu (dashboard / seed).`);
  const slug = `${teacher.id.slice(0, 8)}-${className.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(0, 48);

  const cls = await prisma.class.upsert({
    where: { id: `pilot-class-${slug}` }, update: {},
    create: { id: `pilot-class-${slug}`, schoolId: teacher.schoolId, teacherId: teacher.id, name: className, grade: '10',
              academicYear: new Date().getFullYear() },
  });
  const nDummy = Number(process.env.PILOT_DUMMY_STUDENTS ?? 0);
  for (let i = 1; i <= nDummy; i++) {
    const label = `UJI-${slug.slice(0, 6)}-${String(i).padStart(2, '0')}`;
    await prisma.student.upsert({ where: { anonymousLabel: label }, update: {},
      create: { schoolId: teacher.schoolId, classId: cls.id, anonymousLabel: label } });
  }
  const test = await prisma.test.upsert({
    where: { id: `pilot-test-${slug}` }, update: {},
    create: { id: `pilot-test-${slug}`, schoolId: teacher.schoolId, classId: cls.id, teacherId: teacher.id,
              topic: 'Pilot RemediAide-ID: 15 soal MAP', durationSeconds: 20 * 60 },
  });
  for (const it of inst.items) {
    const qid = `pilot-q-${slug}-${it.map_question_id}`;
    const data = { templateText: it.stem_id, templateAst: { type: 'root', children: [{ type: 'text', value: it.stem_id }] },
                   variableDefinitions: {}, constraints: [], itemOrder: it.order, requireExplanation: it.require_explanation,
                   mapQuestionId: it.map_question_id };
    await prisma.question.upsert({ where: { id: qid }, update: data,
      create: { id: qid, testId: test.id, schoolId: teacher.schoolId, ...data } });
    const vdata = { variableValues: {}, renderedText: it.stem_id,
                    renderedOptions: Object.fromEntries(it.options.map((o) => [o.key, o.text_id])),
                    correctOptionKey: it.correct_key, tauMinSeconds: tauMinSeconds(it),
                    calibrationStatus: 'EXPERT_ESTIMATED' as const, hasPotentialIssue: it.needs_teacher_check };
    await prisma.itemVariant.upsert({ where: { id: `${qid}-v1` }, update: vdata,
      create: { id: `${qid}-v1`, questionId: qid, ...vdata } });
  }
  let session = null;
  if (process.env.PILOT_PIN) {
    const pin = process.env.PILOT_PIN;
    if (!/^\d{6}$/.test(pin)) throw new Error('PILOT_PIN harus 6 digit');
    const state = process.env.PILOT_ACTIVE === '1' ? 'ACTIVE' : 'LOCKED';
    session = await prisma.sessionPin.upsert({
      where: { pinCode: pin },
      update: { testId: test.id, state, startedAt: state === 'ACTIVE' ? new Date() : null, closedAt: null },
      create: { testId: test.id, schoolId: teacher.schoolId, pinCode: pin, state,
                startedAt: state === 'ACTIVE' ? new Date() : null },
    });
  }
  const nExpl = inst.items.filter((i) => i.require_explanation).length;
  const nCheck = inst.items.filter((i) => i.needs_teacher_check).length;
  console.log(JSON.stringify({ teacher: email, classId: cls.id, testId: test.id, questions: inst.items.length,
    requireExplanation: nExpl, flaggedForTeacherCheck: nCheck, dummyStudents: nDummy,
    session: session && { id: session.id, pin: session.pinCode, state: session.state } }, null, 1));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
