# Prisma Database Setup

## Database Schema

This project uses **PostgreSQL 15+** with a **shared-schema multi-tenant architecture**. All tenant data is isolated by `school_id` using a Prisma Client Extension.

## Running Migrations

When PostgreSQL is available:

```bash
# Run all pending migrations
npx prisma migrate deploy

# Or, for development (creates migration + applies it):
npx prisma migrate dev
```

## Seeding Demo Data

After running migrations, seed the database with demo data:

```bash
npm run prisma:seed
```

This creates:
- 1 School: "SD Demo" (subdomain: `demo`)
- 1 Teacher: `demo@remediaide.app` / password dari `$SEED_PASSWORD` (lihat `prisma/seed.ts`)
- 1 Class: "Kelas 5A"
- 5 Students: `Siswa_01` … `Siswa_05`

## Prisma Client

The project exports two Prisma clients:

- **`prisma`** (base client): Use for system-level operations (seeding, auth)
- **`tenantPrisma`** (extended client): Use in route handlers — automatically filters by `school_id`

Example:

```typescript
import { tenantPrisma } from '@/lib/db/client';
import { withTenantContext } from '@/lib/db/context';

await withTenantContext(schoolId, async () => {
  // All queries here are automatically scoped to schoolId
  const teachers = await tenantPrisma.teacher.findMany();
});
```

## Schema Overview

- **School**: Multi-tenant root
- **Teacher**: Authenticated user (TEACHER or PRINCIPAL role)
- **Class**: Classroom with students
- **Student**: Anonymized via `anonymousLabel` (e.g., "Siswa_01")
- **Test**: Exit Ticket definition
- **Question**: Template-based question with variants
- **ItemVariant**: Concrete question instance (rendered from template)
- **SessionPin**: Live session (LOCKED → ACTIVE → CLOSED)
- **Response**: Student answer + CRI + response time
- **ConceptDiagnosis**: Per-student cognitive status (output of Diagnostic Engine)
- **RemedialGroup**: Grouping for differentiated remediation
- **CalibrationConfig**: System-wide calibration thresholds
- **AutoWipeLog**: Audit log for privacy-compliant data deletion

## Enums

- **TeacherRole**: `TEACHER`, `PRINCIPAL`
- **SessionState**: `LOCKED`, `ACTIVE`, `CLOSED`
- **CalibrationStatus**: `EXPERT_ESTIMATED`, `CALIBRATING`, `VALIDATED`
- **PerItemStatus**: `PAHAM_KONSEP`, `LUCKY_GUESS`, `MISKONSEPSI`, `TIDAK_PAHAM`, `INVALID`
- **FinalStatus**: `PAHAM_KONSEP`, `LUCKY_GUESS`, `MISKONSEPSI`, `TIDAK_PAHAM`, `INSUFFICIENT_DATA`
