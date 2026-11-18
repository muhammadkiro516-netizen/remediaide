/**
 * Prisma Seed — Demo Data (lengkap)
 *
 * Ekosistem data demo untuk semua role dan skenario pengujian:
 *
 *  Sekolah A — "SMA Negeri 1 Demo" (subdomain: sman1)
 *    - guru@remediaide.app      → TEACHER
 *    - kepsek@remediaide.app    → PRINCIPAL
 *    - demo@remediaide.app      → TEACHER  (kompatibilitas mundur)
 *    - 1 Kelas: "Kelas X-A" dengan 6 siswa
 *    - 1 Test: "Hukum Newton" dengan 2 soal, masing-masing 2 variant
 *    - 1 SessionPin ACTIVE  PIN: 123456
 *    - 1 SessionPin LOCKED  PIN: 999999 (untuk tes state)
 *
 *  Sekolah B — "SMA Negeri 2 Demo" (subdomain: sman2)
 *    - guru2@remediaide.app     → TEACHER
 *    - 1 Kelas: "Kelas X-B" dengan 3 siswa
 *    (untuk tes tenant isolation — data tidak boleh muncul di Sekolah A)
 *
 * Password seragam: demo123
 *
 * Jalankan dengan:
 *   npm run prisma:seed
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = 'demo123';
const SUPERADMIN_PASSWORD = 'remedi123';
const HASH_ROUNDS = 12;

// ─── Stable seed IDs ──────────────────────────────────────────────────────────
// Pakai ID statis supaya upsert bisa memakai where: { id } sebagai unique selector

const ID = {
  // Schools
  schoolInternal: 'seed-school-internal',    // RemediAide internal (SUPERADMIN)
  schoolA: 'seed-school-sman1',
  schoolB: 'seed-school-sman2',

  // Teachers — Internal
  teacherSuperAdmin: 'seed-teacher-superadmin', // superadmin@remediaide.app

  // Teachers — School A
  teacherDemo:    'seed-teacher-demo',       // demo@remediaide.app (legacy)
  teacherGuru:    'seed-teacher-guru',       // guru@remediaide.app
  teacherKepsek:  'seed-teacher-kepsek',     // kepsek@remediaide.app

  // Teachers — School B
  teacherGuru2:   'seed-teacher-guru2',      // guru2@remediaide.app

  // Classes
  classA: 'seed-class-kelas-xa',
  classB: 'seed-class-kelas-xb',

  // Test & questions — School A
  testA:        'seed-test-hukum-newton',
  question1:    'seed-q1-gaya-percepatan',
  question2:    'seed-q2-hukum-ketiga',

  // Item variants
  varQ1V1: 'seed-var-q1v1',
  varQ1V2: 'seed-var-q1v2',
  varQ2V1: 'seed-var-q2v1',
  varQ2V2: 'seed-var-q2v2',

  // Sessions
  sessionActive: 'seed-session-active-123456',
  sessionLocked: 'seed-session-locked-999999',
} as const;

// ─── Helper: minimal template AST placeholder ─────────────────────────────────
function minimalAst(text: string) {
  return { type: 'root', children: [{ type: 'text', value: text }] };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding demo data (lengkap)...\n');

  const hash = await bcrypt.hash(PASSWORD, HASH_ROUNDS);
  const superadminHash = await bcrypt.hash(SUPERADMIN_PASSWORD, HASH_ROUNDS);

  // ══════════════════════════════════════════════════════════════════════════
  // 1. SCHOOLS
  // ══════════════════════════════════════════════════════════════════════════

  // Internal school — anchor for SUPERADMIN account (not a real school tenant)
  const schoolInternal = await prisma.school.upsert({
    where: { id: ID.schoolInternal },
    update: { name: 'RemediAide Internal', subdomain: 'remediaide-internal' },
    create: { id: ID.schoolInternal, name: 'RemediAide Internal', subdomain: 'remediaide-internal' },
  });
  console.log(`✔ School Internal: ${schoolInternal.name}`);

  const schoolA = await prisma.school.upsert({
    where: { id: ID.schoolA },
    update: { name: 'SMA Negeri 1 Demo', subdomain: 'sman1' },
    create: { id: ID.schoolA, name: 'SMA Negeri 1 Demo', subdomain: 'sman1' },
  });
  console.log(`✔ School A: ${schoolA.name}`);

  const schoolB = await prisma.school.upsert({
    where: { id: ID.schoolB },
    update: { name: 'SMA Negeri 2 Demo', subdomain: 'sman2' },
    create: { id: ID.schoolB, name: 'SMA Negeri 2 Demo', subdomain: 'sman2' },
  });
  console.log(`✔ School B: ${schoolB.name}`);

  // ══════════════════════════════════════════════════════════════════════════
  // 2. TEACHERS
  // ══════════════════════════════════════════════════════════════════════════

  // Internal — SUPERADMIN
  await prisma.teacher.upsert({
    where: { email: 'superadmin@remediaide.app' },
    update: { name: 'Tim Internal RemediAide', schoolId: schoolInternal.id, role: 'SUPERADMIN' },
    create: {
      id: ID.teacherSuperAdmin,
      schoolId: schoolInternal.id,
      email: 'superadmin@remediaide.app',
      name: 'Tim Internal RemediAide',
      passwordHash: superadminHash,
      role: 'SUPERADMIN',
    },
  });
  console.log('✔ Teacher (SUPERADMIN): superadmin@remediaide.app');

  // School A — legacy demo account (kompatibilitas mundur)
  await prisma.teacher.upsert({
    where: { email: 'demo@remediaide.app' },
    update: { name: 'Guru Demo (Legacy)', schoolId: schoolA.id, role: 'TEACHER' },
    create: {
      id: ID.teacherDemo,
      schoolId: schoolA.id,
      email: 'demo@remediaide.app',
      name: 'Guru Demo (Legacy)',
      passwordHash: hash,
      role: 'TEACHER',
    },
  });
  console.log('✔ Teacher (legacy):  demo@remediaide.app');

  // School A — guru
  const teacherGuru = await prisma.teacher.upsert({
    where: { email: 'guru@remediaide.app' },
    update: { name: 'Guru Demo SMAN 1', schoolId: schoolA.id, role: 'TEACHER' },
    create: {
      id: ID.teacherGuru,
      schoolId: schoolA.id,
      email: 'guru@remediaide.app',
      name: 'Guru Demo SMAN 1',
      passwordHash: hash,
      role: 'TEACHER',
    },
  });
  console.log('✔ Teacher (TEACHER): guru@remediaide.app');

  // School A — kepsek
  await prisma.teacher.upsert({
    where: { email: 'kepsek@remediaide.app' },
    update: { name: 'Kepala Sekolah SMAN 1', schoolId: schoolA.id, role: 'PRINCIPAL' },
    create: {
      id: ID.teacherKepsek,
      schoolId: schoolA.id,
      email: 'kepsek@remediaide.app',
      name: 'Kepala Sekolah SMAN 1',
      passwordHash: hash,
      role: 'PRINCIPAL',
    },
  });
  console.log('✔ Teacher (PRINCIPAL): kepsek@remediaide.app');

  // School B — guru2
  const teacherGuru2 = await prisma.teacher.upsert({
    where: { email: 'guru2@remediaide.app' },
    update: { name: 'Guru Demo SMAN 2', schoolId: schoolB.id, role: 'TEACHER' },
    create: {
      id: ID.teacherGuru2,
      schoolId: schoolB.id,
      email: 'guru2@remediaide.app',
      name: 'Guru Demo SMAN 2',
      passwordHash: hash,
      role: 'TEACHER',
    },
  });
  console.log('✔ Teacher (TEACHER, School B): guru2@remediaide.app');

  // ══════════════════════════════════════════════════════════════════════════
  // 3. CLASSES
  // ══════════════════════════════════════════════════════════════════════════

  const classA = await prisma.class.upsert({
    where: { id: ID.classA },
    update: {},
    create: {
      id: ID.classA,
      schoolId: schoolA.id,
      teacherId: teacherGuru.id,
      name: 'Kelas X-A',
      grade: '10',
      academicYear: 2024,
    },
  });
  console.log(`✔ Class A: ${classA.name}`);

  const classB = await prisma.class.upsert({
    where: { id: ID.classB },
    update: {},
    create: {
      id: ID.classB,
      schoolId: schoolB.id,
      teacherId: teacherGuru2.id,
      name: 'Kelas X-B',
      grade: '10',
      academicYear: 2024,
    },
  });
  console.log(`✔ Class B: ${classB.name}`);

  // ══════════════════════════════════════════════════════════════════════════
  // 4. STUDENTS
  // ══════════════════════════════════════════════════════════════════════════

  // School A — 6 siswa
  const studentsA = ['A_Siswa_01', 'A_Siswa_02', 'A_Siswa_03', 'A_Siswa_04', 'A_Siswa_05', 'A_Siswa_06'];
  for (const label of studentsA) {
    await prisma.student.upsert({
      where: { anonymousLabel: label },
      update: {},
      create: {
        schoolId: schoolA.id,
        classId: classA.id,
        anonymousLabel: label,
      },
    });
  }
  console.log(`✔ Students School A: ${studentsA.join(', ')}`);

  // School B — 3 siswa (untuk tes tenant isolation)
  const studentsB = ['B_Siswa_01', 'B_Siswa_02', 'B_Siswa_03'];
  for (const label of studentsB) {
    await prisma.student.upsert({
      where: { anonymousLabel: label },
      update: {},
      create: {
        schoolId: schoolB.id,
        classId: classB.id,
        anonymousLabel: label,
      },
    });
  }
  console.log(`✔ Students School B: ${studentsB.join(', ')}`);

  // ══════════════════════════════════════════════════════════════════════════
  // 5. TEST — "Hukum Newton" (School A)
  // ══════════════════════════════════════════════════════════════════════════

  const testA = await prisma.test.upsert({
    where: { id: ID.testA },
    update: {},
    create: {
      id: ID.testA,
      schoolId: schoolA.id,
      classId: classA.id,
      teacherId: teacherGuru.id,
      topic: 'Hukum Newton',
      durationSeconds: 900,
    },
  });
  console.log(`✔ Test: "${testA.topic}"`);

  // ── Question 1: Hukum II Newton (F = ma) ──────────────────────────────────
  const q1Text = 'Sebuah benda bermassa {m} kg dikenai gaya {F} N. Berapa percepatan benda tersebut?';
  const q1 = await prisma.question.upsert({
    where: { id: ID.question1 },
    update: {},
    create: {
      id: ID.question1,
      testId: testA.id,
      schoolId: schoolA.id,
      templateText: q1Text,
      templateAst: minimalAst(q1Text),
      variableDefinitions: { m: { type: 'integer', min: 1, max: 10 }, F: { type: 'integer', min: 5, max: 50 } },
      constraints: [],
      itemOrder: 1,
    },
  });

  // Variant 1 — m=2, F=10 → a=5
  await prisma.itemVariant.upsert({
    where: { id: ID.varQ1V1 },
    update: {},
    create: {
      id: ID.varQ1V1,
      questionId: q1.id,
      variableValues: { m: 2, F: 10 },
      renderedText: 'Sebuah benda bermassa 2 kg dikenai gaya 10 N. Berapa percepatan benda tersebut?',
      renderedOptions: {
        A: '2 m/s²',
        B: '5 m/s²',
        C: '8 m/s²',
        D: '20 m/s²',
      },
      correctOptionKey: 'B',
      tauMinSeconds: 30,
      calibrationStatus: 'EXPERT_ESTIMATED',
    },
  });

  // Variant 2 — m=5, F=20 → a=4
  await prisma.itemVariant.upsert({
    where: { id: ID.varQ1V2 },
    update: {},
    create: {
      id: ID.varQ1V2,
      questionId: q1.id,
      variableValues: { m: 5, F: 20 },
      renderedText: 'Sebuah benda bermassa 5 kg dikenai gaya 20 N. Berapa percepatan benda tersebut?',
      renderedOptions: {
        A: '100 m/s²',
        B: '25 m/s²',
        C: '4 m/s²',
        D: '0,25 m/s²',
      },
      correctOptionKey: 'C',
      tauMinSeconds: 30,
      calibrationStatus: 'EXPERT_ESTIMATED',
    },
  });
  console.log(`✔ Question 1: "${q1Text.substring(0, 50)}..." (2 variants)`);

  // ── Question 2: Hukum III Newton (aksi-reaksi) ────────────────────────────
  const q2Text = 'Buku bermassa {m} kg diam di atas meja. Gaya normal meja pada buku adalah pasangan gaya aksi-reaksi dari gaya apa?';
  const q2 = await prisma.question.upsert({
    where: { id: ID.question2 },
    update: {},
    create: {
      id: ID.question2,
      testId: testA.id,
      schoolId: schoolA.id,
      templateText: q2Text,
      templateAst: minimalAst(q2Text),
      variableDefinitions: { m: { type: 'integer', min: 1, max: 5 } },
      constraints: [],
      itemOrder: 2,
    },
  });

  // Variant 1 — m=1
  await prisma.itemVariant.upsert({
    where: { id: ID.varQ2V1 },
    update: {},
    create: {
      id: ID.varQ2V1,
      questionId: q2.id,
      variableValues: { m: 1 },
      renderedText: 'Buku bermassa 1 kg diam di atas meja. Gaya normal meja pada buku adalah pasangan gaya aksi-reaksi dari gaya apa?',
      renderedOptions: {
        A: 'Gaya gravitasi bumi pada meja',
        B: 'Gaya gravitasi bumi pada buku',
        C: 'Gaya normal buku pada meja',
        D: 'Gaya gesek buku pada meja',
      },
      correctOptionKey: 'C',
      tauMinSeconds: 45,
      calibrationStatus: 'EXPERT_ESTIMATED',
    },
  });

  // Variant 2 — m=3
  await prisma.itemVariant.upsert({
    where: { id: ID.varQ2V2 },
    update: {},
    create: {
      id: ID.varQ2V2,
      questionId: q2.id,
      variableValues: { m: 3 },
      renderedText: 'Buku bermassa 3 kg diam di atas meja. Gaya normal meja pada buku adalah pasangan gaya aksi-reaksi dari gaya apa?',
      renderedOptions: {
        A: 'Gaya gravitasi bumi pada meja',
        B: 'Gaya gravitasi bumi pada buku',
        C: 'Gaya normal buku pada meja',
        D: 'Gaya gesek buku pada meja',
      },
      correctOptionKey: 'C',
      tauMinSeconds: 45,
      calibrationStatus: 'EXPERT_ESTIMATED',
    },
  });
  console.log(`✔ Question 2: "${q2Text.substring(0, 50)}..." (2 variants)`);

  // ══════════════════════════════════════════════════════════════════════════
  // 6. SESSION PINS
  // ══════════════════════════════════════════════════════════════════════════

  // Active session — PIN 123456
  const sessionActive = await prisma.sessionPin.upsert({
    where: { id: ID.sessionActive },
    update: { state: 'ACTIVE', startedAt: new Date(), pinCode: '123456' },
    create: {
      id: ID.sessionActive,
      testId: testA.id,
      schoolId: schoolA.id,
      pinCode: '123456',
      state: 'ACTIVE',
      startedAt: new Date(),
      pinFallbackEnabled: false,
    },
  });
  console.log(`✔ SessionPin ACTIVE: PIN=${sessionActive.pinCode} (id: ${sessionActive.id})`);

  // Locked session — PIN 999999 (untuk tes state machine)
  const sessionLocked = await prisma.sessionPin.upsert({
    where: { id: ID.sessionLocked },
    update: { state: 'LOCKED', pinCode: '999999' },
    create: {
      id: ID.sessionLocked,
      testId: testA.id,
      schoolId: schoolA.id,
      pinCode: '999999',
      state: 'LOCKED',
      pinFallbackEnabled: false,
    },
  });
  console.log(`✔ SessionPin LOCKED: PIN=${sessionLocked.pinCode} (id: ${sessionLocked.id})`);

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                   SEED SELESAI — KREDENSIAL                  ║
╠══════════════════════════════════════════════════════════════╣
║  Role        Email                      Password   Sekolah   ║
╠══════════════════════════════════════════════════════════════╣
║  SUPERADMIN  superadmin@remediaide.app  remedi123  Internal  ║
║  TEACHER     demo@remediaide.app        demo123    SMAN 1    ║
║  TEACHER     guru@remediaide.app        demo123    SMAN 1    ║
║  PRINCIPAL   kepsek@remediaide.app      demo123    SMAN 1    ║
║  TEACHER     guru2@remediaide.app       demo123    SMAN 2    ║
╠══════════════════════════════════════════════════════════════╣
║  PIN Sesi ACTIVE : 123456                                    ║
║  PIN Sesi LOCKED : 999999                                    ║
╠══════════════════════════════════════════════════════════════╣
║  Admin Portal: /admin/dashboard  (login sebagai SUPERADMIN)  ║
╚══════════════════════════════════════════════════════════════╝
`);
}

main()
  .catch((e) => {
    console.error('❌ Seed gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
