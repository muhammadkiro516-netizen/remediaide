# RemediAide

> **RemediAide 2.0 — CAC Machine Learning Solution Challenge 2026.** Mesin diagnosis miskonsepsi 3 lapis ML
> (kode, data, eksperimen, laporan): **[`ml/README.md`](ml/README.md)** · laporan teknis [`ml/REPORT.md`](ml/REPORT.md) ·
> hasil [`ml/reports/RESULTS.md`](ml/reports/RESULTS.md). Integrasi web (Mode AI, antrean "Perlu dicek guru", alasan
> siswa) ada di aplikasi Next.js ini, dengan fallback ke aturan CRI v1.

Sistem diagnosis kognitif siswa berbasis CRI (Certainty of Response Index) untuk remediasi terdiferensiasi.

## Stack Teknologi

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: PostgreSQL + Prisma ORM
- **Queue & Scheduler**: BullMQ + Redis
- **Real-time**: Server-Sent Events (SSE)
- **Testing**: Vitest + fast-check (property-based testing)

## Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- npm 9+

## Environment Variables

Copy `.env.example` to `.env.local` and update with your database and Redis connection strings:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/remediaide?schema=public"
REDIS_URL="redis://localhost:6379"
NEXTAUTH_SECRET="your-nextauth-secret-here"
NEXTAUTH_URL="http://localhost:3000"
```

## Installation

```bash
npm install
```

## Development

```bash
# Start development server
npm run dev

# Open http://localhost:3000
```

## Database

```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Open Prisma Studio
npm run prisma:studio
```

## Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Project Structure

```
src/
├── app/                 # Next.js App Router pages
├── components/          # React components
│   └── ui/             # shadcn/ui components
├── lib/                # Utility functions and services
│   └── db/             # Database client
└── types/              # TypeScript type definitions

prisma/
└── schema.prisma       # Database schema
```

## Features (Planned)

- ✅ Task 1: Setup proyek dan infrastruktur dasar (COMPLETED)
- ⏳ Task 2: Database schema dan migrasi
- ⏳ Task 3: Autentikasi dan otorisasi berbasis peran
- ⏳ Task 4: Diagnostic Engine Core
- ... (see tasks.md for full implementation plan)

## Documentation

- [Requirements](.kiro/specs/remediaide/requirements.md)
- [Design](.kiro/specs/remediaide/design.md)
- [Tasks](.kiro/specs/remediaide/tasks.md)

## License

Proprietary
