/**
 * Admin Dashboard — Tim Internal RemediAide
 *
 * Hanya bisa diakses oleh role SUPERADMIN.
 * Menampilkan daftar seluruh sekolah (tenant) yang terdaftar.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Building2,
  GraduationCap,
  Users,
  PlusCircle,
  LogOut,
  Loader2,
  AlertCircle,
  Calendar,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SchoolSummary {
  id: string;
  name: string;
  subdomain: string;
  createdAt: string;
  _count: {
    teachers: number;
    students: number;
    classes: number;
  };
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatBadge({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {value} {label}
    </span>
  );
}

// ─── School Row ───────────────────────────────────────────────────────────────

function SchoolCard({ school }: { school: SchoolSummary }) {
  const date = new Date(school.createdAt).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="font-semibold text-foreground">{school.name}</p>
            <p className="text-xs text-muted-foreground">subdomain: {school.subdomain}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" aria-hidden="true" />
          {date}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <StatBadge icon={Users} label="guru" value={school._count.teachers} />
        <StatBadge icon={GraduationCap} label="siswa" value={school._count.students} />
        <StatBadge icon={Building2} label="kelas" value={school._count.classes} />
      </div>
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const [schools, setSchools] = useState<SchoolSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/schools")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setSchools(data.data);
        } else {
          setError(data.error?.message ?? "Gagal memuat data sekolah.");
        }
      })
      .catch(() => setError("Gagal terhubung ke server."))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
              R
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">RemediAide Admin</p>
              <p className="text-xs text-muted-foreground">Portal Tim Internal</p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground"
            aria-label="Keluar dari portal admin"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Keluar
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Page header */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Daftar Sekolah Terdaftar</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isLoading
                ? "Memuat..."
                : `${schools.length} sekolah aktif di sistem`}
            </p>
          </div>
          <Button asChild size="lg" className="min-h-[48px] gap-2">
            <Link href="/admin/schools/new">
              <PlusCircle className="h-5 w-5" aria-hidden="true" />
              Tambah Sekolah
            </Link>
          </Button>
        </div>

        {/* States */}
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" aria-hidden="true" />
            Memuat data sekolah...
          </div>
        )}

        {!isLoading && error && (
          <div className="flex items-center gap-3 rounded-xl border-2 border-destructive/30 bg-destructive/10 px-5 py-4 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {!isLoading && !error && schools.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white py-16 text-center">
            <Building2 className="mx-auto mb-3 h-10 w-10 text-slate-400" aria-hidden="true" />
            <p className="font-medium text-foreground">Belum ada sekolah terdaftar</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Klik &ldquo;Tambah Sekolah&rdquo; untuk mendaftarkan sekolah pertama.
            </p>
          </div>
        )}

        {!isLoading && !error && schools.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {schools.map((school) => (
              <SchoolCard key={school.id} school={school} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
