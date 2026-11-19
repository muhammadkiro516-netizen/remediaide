/**
 * Rotate the passwords of the seed accounts in an existing database (e.g. production Neon).
 * The repository is public, so the seed defaults (demo123 / remedi123) are public too.
 *
 *   DATABASE_URL="..." SEED_PASSWORD="..." SEED_SUPERADMIN_PASSWORD="..." npx tsx scripts/rotate-seed-passwords.ts
 *
 * Only the five seed accounts are touched. Passwords are never printed. See docs/cac/SECURITY_NOTES.md §3.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const SEED_TEACHERS = ['demo@remediaide.app', 'guru@remediaide.app', 'kepsek@remediaide.app', 'guru2@remediaide.app'];
const SEED_SUPERADMIN = 'superadmin@remediaide.app';
const MIN_LENGTH = 12;

async function main() {
  const pw = process.env.SEED_PASSWORD ?? '';
  const sa = process.env.SEED_SUPERADMIN_PASSWORD ?? '';
  if (pw.length < MIN_LENGTH || sa.length < MIN_LENGTH) {
    throw new Error(`SEED_PASSWORD dan SEED_SUPERADMIN_PASSWORD wajib diisi, minimal ${MIN_LENGTH} karakter.`);
  }
  if (pw === sa) throw new Error('Gunakan password berbeda untuk superadmin.');
  const prisma = new PrismaClient();
  try {
    const t = await prisma.teacher.updateMany({
      where: { email: { in: SEED_TEACHERS } },
      data: { passwordHash: await bcrypt.hash(pw, 12) },
    });
    const s = await prisma.teacher.updateMany({
      where: { email: SEED_SUPERADMIN },
      data: { passwordHash: await bcrypt.hash(sa, 12) },
    });
    console.log(`Password diganti: ${t.count} akun demo, ${s.count} akun superadmin.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
