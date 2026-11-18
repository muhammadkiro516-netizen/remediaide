import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Test dengan DATABASE_URL (pgbouncer, port 6543) — persis seperti Vercel
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL!,
    },
  },
});

async function main() {
  console.log('Using URL:', process.env.DATABASE_URL?.substring(0, 60) + '...');

  try {
    const teacher = await prisma.teacher.findUnique({
      where: { email: 'guru@remediaide.app' },
      select: { id: true, email: true, role: true, passwordHash: true },
    });

    if (!teacher) {
      console.log('❌ Teacher NOT FOUND — DB mungkin berbeda atau data belum di-seed');
      return;
    }

    console.log('✅ Teacher found:', teacher.email, '| role:', teacher.role);
    const match = await bcrypt.compare('demo123', teacher.passwordHash);
    console.log('🔑 Password match:', match);

  } catch (e: unknown) {
    const err = e as Error & { code?: string };
    console.error('❌ DB Error:', err.code, err.message);
  }
}

main().finally(() => prisma.$disconnect());
