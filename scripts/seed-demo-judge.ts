/**
 * Judge demo (CAC MLSC 2026): read-only judge account + one synthetic demo class with stored v1 and ML results.
 * Idempotent: stable ids; the demo results session is rebuilt from a fixed random seed on every run.
 *
 *   JUDGE_PASSWORD='<kuat>' DATABASE_URL=... [ML_SERVICE_URL=... RESEARCH_EXPORT_SALT=...] [DEMO_PIN=826730] \
 *     npx tsx scripts/seed-demo-judge.ts
 * - Teacher juri@remediaide.id (password from JUDGE_PASSWORD, no default; read-only via env JUDGE_EMAILS on the server).
 * - School "Sekolah Demo RemediAide", class "Kelas Demo 8A", 32 anonymous synthetic students (DEMO-01..32).
 * - Test with the 15 MAP questions in Indonesian (docs/cac/pilot/instrument_map_id.json; no Eedi images, D-17), every
 *   question asks for a one-sentence reason.
 * - Session "hasil" (CLOSED): synthetic answers, confidence, time and reasons from five profiles (Paham, Miskonsepsi
 *   berulang, Tebakan beruntung, Tidak paham, benar tapi nalar keliru). Reasons are MAP-ID machine translations (MIT,
 *   docs/cac/demo/demo_explanations.json). v1 rule results + remedial groups are always computed; ML results are
 *   computed by the REAL ML service when ML_SERVICE_URL is set (they are stored, so the panel works without the service).
 * - Session "coba" (ACTIVE, PIN DEMO_PIN) without responses, for trying the student flow.
 * Everything is labelled "data demo sintetis".
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/db/client';
import { calculateIntegrityIndex, classifyPerItem } from '../src/lib/diagnostic/engine';
import { computeConceptDiagnosis } from '../src/lib/diagnosis/compute';
import { tauMinSeconds, type PilotItem } from '../src/lib/pilot/instrument';

type Reason = { text: string; misconception: string };
type Expl = { questions: Record<string, { correct_key: string; by_option: Record<string, Record<string, Reason[]>> }> };

const ID = {
  school: 'demo-school-remediaide', teacher: 'demo-teacher-juri', class: 'demo-class-8a', test: 'demo-test-pecahan',
  sessionResults: 'demo-session-hasil', sessionTry: 'demo-session-coba',
};
const EMAIL = 'juri@remediaide.id';
const TAG = 'data demo sintetis';
const PROFILES = ['PAHAM', 'MISKONSEPSI', 'TEBAKAN', 'TIDAK_PAHAM', 'BENAR_NALAR_KELIRU'] as const;
type Profile = (typeof PROFILES)[number];
// 32 students: 8 Paham, 7 Miskonsepsi berulang, 5 Tebakan beruntung, 6 Tidak paham, 6 benar tapi nalar keliru
const MIX: Profile[] = [...Array(8).fill('PAHAM'), ...Array(7).fill('MISKONSEPSI'), ...Array(5).fill('TEBAKAN'),
  ...Array(6).fill('TIDAK_PAHAM'), ...Array(6).fill('BENAR_NALAR_KELIRU')];

function rng(seed: number) { // mulberry32, deterministic
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const pw = process.env.JUDGE_PASSWORD ?? '';
  if (pw.length < 16) throw new Error('JUDGE_PASSWORD wajib diisi (minimal 16 karakter); tidak ada default.');
  const inst = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/cac/pilot/instrument_map_id.json'), 'utf8')) as { items: PilotItem[] };
  const expl = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/cac/demo/demo_explanations.json'), 'utf8')) as Expl;
  const pin = process.env.DEMO_PIN ?? '826730';
  if (!/^\d{6}$/.test(pin)) throw new Error('DEMO_PIN harus 6 digit');

  const school = await prisma.school.upsert({ where: { id: ID.school }, update: { name: 'Sekolah Demo RemediAide' },
    create: { id: ID.school, name: 'Sekolah Demo RemediAide', subdomain: 'demo-remediaide' } });
  const passwordHash = await bcrypt.hash(pw, 12);
  const teacher = await prisma.teacher.upsert({ where: { email: EMAIL },
    update: { passwordHash, schoolId: school.id, role: 'TEACHER', name: `Akun Juri (${TAG})` },
    create: { id: ID.teacher, email: EMAIL, passwordHash, schoolId: school.id, role: 'TEACHER', name: `Akun Juri (${TAG})` } });
  const cls = await prisma.class.upsert({ where: { id: ID.class }, update: { name: 'Kelas Demo 8A' },
    create: { id: ID.class, schoolId: school.id, teacherId: teacher.id, name: 'Kelas Demo 8A', grade: '8', academicYear: 2026 } });
  const students = [];
  for (let i = 1; i <= 32; i++) {
    const label = `DEMO-${String(i).padStart(2, '0')}`;
    students.push(await prisma.student.upsert({ where: { anonymousLabel: label }, update: {},
      create: { id: `demo-student-${i}`, schoolId: school.id, classId: cls.id, anonymousLabel: label } }));
  }
  const test = await prisma.test.upsert({ where: { id: ID.test }, update: { topic: `Pecahan & desimal (${TAG})` },
    create: { id: ID.test, schoolId: school.id, classId: cls.id, teacherId: teacher.id, topic: `Pecahan & desimal (${TAG})`,
              durationSeconds: 20 * 60 } });
  const variants: { item: PilotItem; variantId: string; tauMs: number }[] = [];
  for (const it of inst.items) {
    const qid = `demo-q-${it.map_question_id}`;
    const data = { templateText: it.stem_id, templateAst: { type: 'root', children: [{ type: 'text', value: it.stem_id }] },
                   variableDefinitions: {}, constraints: [], itemOrder: it.order, requireExplanation: true,
                   mapQuestionId: it.map_question_id };
    await prisma.question.upsert({ where: { id: qid }, update: data, create: { id: qid, testId: test.id, schoolId: school.id, ...data } });
    const tau = tauMinSeconds(it);
    const vdata = { variableValues: {}, renderedText: it.stem_id, correctOptionKey: it.correct_key, tauMinSeconds: tau,
                    renderedOptions: Object.fromEntries(it.options.map((o) => [o.key, o.text_id])),
                    calibrationStatus: 'EXPERT_ESTIMATED' as const };
    await prisma.itemVariant.upsert({ where: { id: `${qid}-v1` }, update: vdata, create: { id: `${qid}-v1`, questionId: qid, ...vdata } });
    variants.push({ item: it, variantId: `${qid}-v1`, tauMs: tau * 1000 });
  }

  // ── results session: rebuilt deterministically on every run
  const t0 = new Date(Date.UTC(2026, 10, 19, 1, 0, 0));
  await prisma.sessionPin.upsert({ where: { id: ID.sessionResults },
    update: { state: 'CLOSED', startedAt: t0, closedAt: new Date(t0.getTime() + 25 * 60_000), testId: test.id },
    create: { id: ID.sessionResults, testId: test.id, schoolId: school.id, pinCode: '000000'.replace(/0/g, () => String(Math.floor(Math.random() * 10))),
              state: 'CLOSED', startedAt: t0, closedAt: new Date(t0.getTime() + 25 * 60_000) } });
  const sid = ID.sessionResults;
  // stored ML results are only replaced when the ML service can recompute them (answers are deterministic, so old ones stay valid)
  if (process.env.ML_SERVICE_URL) {
    await prisma.mlFeedback.deleteMany({ where: { diagnosis: { sessionPinId: sid } } });
    await prisma.mlDiagnosis.deleteMany({ where: { sessionPinId: sid } });
  } else {
    console.warn('ML_SERVICE_URL kosong: hasil ML tersimpan dipertahankan (tidak dihitung ulang).');
  }
  await prisma.exitTicketToken.deleteMany({ where: { sessionPinId: sid } });
  await prisma.remedialGroup.deleteMany({ where: { sessionPinId: sid } });
  await prisma.conceptDiagnosis.deleteMany({ where: { sessionPinId: sid } });
  await prisma.response.deleteMany({ where: { sessionPinId: sid } });

  const r = rng(20261118);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const rows = [];
  for (let si = 0; si < students.length; si++) {
    const st = students[si];
    const profile = MIX[si];
    let clock = t0.getTime() + Math.floor(r() * 60_000);
    for (const v of variants) {
      const ex = expl.questions[String(v.item.map_question_id)];
      const wrongKeys = v.item.options.filter((o) => !o.is_correct).map((o) => o.key);
      const misKeys = wrongKeys.filter((k) => (ex?.by_option[k]?.False_Misconception ?? []).length > 0);
      let key: string; let cri: number; let cats: string[];
      switch (profile) {
        case 'PAHAM': key = r() < 0.9 ? v.item.correct_key : pick(wrongKeys); cri = 4 + Math.floor(r() * 2); cats = ['True_Correct', 'False_Neither']; break;
        case 'MISKONSEPSI': key = r() < 0.75 && misKeys.length ? misKeys[0] : r() < 0.5 ? v.item.correct_key : pick(wrongKeys);
          cri = 3 + Math.floor(r() * 3); cats = ['False_Misconception', 'True_Correct']; break;
        case 'TEBAKAN': key = r() < 0.6 ? v.item.correct_key : pick(wrongKeys); cri = Math.floor(r() * 3); cats = ['True_Neither', 'False_Neither']; break;
        case 'TIDAK_PAHAM': key = r() < 0.2 ? v.item.correct_key : pick(wrongKeys); cri = Math.floor(r() * 3); cats = ['False_Neither', 'True_Neither']; break;
        default: key = r() < 0.85 ? v.item.correct_key : pick(misKeys.length ? misKeys : wrongKeys); cri = 4 + Math.floor(r() * 2);
          cats = ['True_Misconception', 'False_Misconception', 'True_Correct'];
      }
      const pool = cats.map((c) => ex?.by_option[key]?.[c] ?? []).find((p) => p.length) ?? [];
      const explanation = pool.length ? pick(pool).text.slice(0, 280) : null;
      const rapid = r() < 0.03; // a few rapid guesses for the v1 guard
      const rt = rapid ? Math.floor(800 + r() * 1500) : Math.floor(v.tauMs * (1.2 + r() * 2.5));
      clock += rt + 3000;
      const isCorrect = key === v.item.correct_key;
      const input = { itemId: v.variantId, isCorrect, criValue: cri, responseTimeMs: rt, tauMinMs: v.tauMs };
      const res = classifyPerItem(input);
      rows.push({ sessionPinId: sid, studentId: st.id, itemVariantId: v.variantId, schoolId: school.id, chosenOptionKey: key,
                  criValue: cri, responseTimeMs: rt, integrityIndex: calculateIntegrityIndex(input),
                  isBelowThreshold: res.isBelowThreshold,
                  perItemStatus: (['PAHAM_KONSEP', 'LUCKY_GUESS', 'MISKONSEPSI', 'TIDAK_PAHAM'].includes(res.status) ? res.status : 'INVALID') as
                    'PAHAM_KONSEP' | 'LUCKY_GUESS' | 'MISKONSEPSI' | 'TIDAK_PAHAM' | 'INVALID',
                  explanation, submittedAt: new Date(clock) });
    }
  }
  await prisma.response.createMany({ data: rows });
  await computeConceptDiagnosis(sid); // v1 rule + remedial groups (+ real ML service when ML_SERVICE_URL is set)

  // ── try-out session for the student flow
  const tryS = await prisma.sessionPin.upsert({ where: { id: ID.sessionTry },
    update: { pinCode: pin, state: 'ACTIVE', startedAt: new Date(), closedAt: null, testId: test.id },
    create: { id: ID.sessionTry, testId: test.id, schoolId: school.id, pinCode: pin, state: 'ACTIVE', startedAt: new Date() } });

  const ml = await prisma.mlDiagnosis.count({ where: { sessionPinId: sid } });
  const mlv = await prisma.mlDiagnosis.findFirst({ where: { sessionPinId: sid }, select: { modelVersion: true } });
  const deferred = await prisma.mlDiagnosis.count({ where: { sessionPinId: sid, questionId: null, deferred: true } });
  console.log(JSON.stringify({ judge: EMAIL, school: school.name, class: cls.name, students: students.length,
    questions: variants.length, responses: rows.length, withReason: rows.filter((x) => x.explanation).length,
    conceptDiagnoses: await prisma.conceptDiagnosis.count({ where: { sessionPinId: sid } }),
    remedialGroups: await prisma.remedialGroup.count({ where: { sessionPinId: sid } }),
    mlDiagnoses: ml, mlModel: mlv?.modelVersion ?? null, deferredStudents: deferred,
    resultsSessionId: sid, tryPin: tryS.pinCode }, null, 1));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
