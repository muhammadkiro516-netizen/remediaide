"use client";

import React, { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import ImportCsvDialog from "@/components/teacher/ImportCsvDialog";
import {
  Plus, Users, ChevronDown, ChevronUp, Trash2,
  UserPlus, Upload, Loader2, AlertCircle, X,
} from "lucide-react";

interface Student { id: string; anonymousLabel: string; classId: string; schoolId: string; createdAt: string; }
interface ClassItem {
  id: string; name: string; grade: string; academicYear: number;
  teacherId: string; schoolId: string; createdAt: string;
  _count: { students: number }; students?: Student[];
}

async function apiFetch<T>(url: string, opts?: RequestInit) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  return res.json() as Promise<{ success: true; data: T } | { success: false; error: { code: string; message: string } }>;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-slate-200", className)} />;
}

function ClassSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  );
}

// ─── Create Class Dialog ──────────────────────────────────────────────────────

function CreateClassDialog({ onCreated, onClose }: { onCreated: (c: ClassItem) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [academicYear, setAcademicYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true);
    try {
      const r = await apiFetch<ClassItem>("/api/classes", { method: "POST", body: JSON.stringify({ name, grade, academicYear }) });
      if (!r.success) { setError(r.error.message); return; }
      onCreated(r.data);
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Buat Kelas Baru</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="cls-name" className="mb-1.5 block text-sm font-medium text-slate-700">Nama Kelas</label>
            <input id="cls-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Kelas 10-A" required
              className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 min-h-[48px]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cls-grade" className="mb-1.5 block text-sm font-medium text-slate-700">Tingkat</label>
              <input id="cls-grade" type="text" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="10" required
                className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 min-h-[48px]" />
            </div>
            <div>
              <label htmlFor="cls-year" className="mb-1.5 block text-sm font-medium text-slate-700">Tahun Ajaran</label>
              <input id="cls-year" type="number" value={academicYear} onChange={(e) => setAcademicYear(Number(e.target.value))} min={2020} max={2040} required
                className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 min-h-[48px]" />
            </div>
          </div>
          {error && <div role="alert" className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Batal</button>
            <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Menyimpan...</> : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add Student Form ─────────────────────────────────────────────────────────

function AddStudentForm({ classId, onAdded }: { classId: string; onAdded: (s: Student) => void }) {
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true);
    try {
      const r = await apiFetch<Student>(`/api/classes/${classId}/students`, { method: "POST", body: JSON.stringify({ anonymousLabel: label }) });
      if (!r.success) { setError(r.error.message); return; }
      onAdded(r.data); setLabel("");
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input type="text" value={label} onChange={(e) => { setLabel(e.target.value); setError(null); }}
        placeholder="Label siswa (cth: S-001)" required aria-label="Label anonim siswa baru"
        className="flex-1 rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 min-h-[44px]" />
      <button type="submit" disabled={loading || !label.trim()}
        className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 active:scale-95 transition-all min-h-[44px]">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
      </button>
      {error && <p role="alert" className="sr-only">{error}</p>}
    </form>
  );
}

// ─── Class Card ───────────────────────────────────────────────────────────────

const GRADE_COLORS = [
  "from-violet-400 to-violet-600",
  "from-blue-400 to-blue-600",
  "from-emerald-400 to-emerald-600",
  "from-amber-400 to-amber-600",
  "from-rose-400 to-rose-600",
  "from-cyan-400 to-cyan-600",
];

function ClassCard({ cls, onDelete }: { cls: ClassItem; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [showImportCsv, setShowImportCsv] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const colorClass = GRADE_COLORS[parseInt(cls.grade) % GRADE_COLORS.length] ?? GRADE_COLORS[0];

  async function loadStudents() {
    setLoadingStudents(true);
    const r = await apiFetch<Student[]>(`/api/classes/${cls.id}/students`);
    if (r.success) setStudents(r.data);
    setLoadingStudents(false);
  }

  function handleExpand() {
    if (!expanded) loadStudents();
    setExpanded((v) => !v);
  }

  async function handleDeleteStudent(studentId: string) {
    const r = await apiFetch<{ id: string }>(`/api/classes/${cls.id}/students/${studentId}`, { method: "DELETE" });
    if (r.success) setStudents((p) => p.filter((s) => s.id !== studentId));
  }

  async function handleDeleteClass() {
    setDeleting(true);
    setDeleteError(null);
    const r = await apiFetch<{ id: string }>(`/api/classes/${cls.id}`, { method: "DELETE" });
    if (r.success) {
      onDelete(cls.id);
    } else {
      setDeleteError(r.error?.message ?? "Gagal menghapus kelas.");
    }
    setDeleting(false);
  }

  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-shadow hover:shadow-md", expanded && "shadow-md")}>
      {/* Card header */}
      <button type="button" onClick={handleExpand} aria-expanded={expanded}
        className="flex w-full items-center gap-4 p-5 text-left hover:bg-slate-50/50 transition-colors">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white font-bold text-sm shadow-sm", colorClass)}>
          {cls.grade}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-900">{cls.name}</p>
          <p className="text-sm text-slate-500">
            <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{cls._count.students} siswa</span>
            <span className="mx-2 text-slate-300">·</span>TA {cls.academicYear}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {deleteConfirm ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteClass(); }} disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Konfirmasi
            </button>
          ) : (
            <button type="button" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(true); setDeleteError(null); setTimeout(() => setDeleteConfirm(false), 3000); }}
              className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors" aria-label={`Hapus kelas ${cls.name}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      {/* Delete error message */}
      {deleteError && (
        <p role="alert" className="px-5 pb-2 text-sm text-red-600">{deleteError}</p>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4 space-y-4">
          {loadingStudents ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : (
            <>
              {students.length === 0 ? (
                <p className="text-sm text-slate-400 italic text-center py-2">Belum ada siswa di kelas ini.</p>
              ) : (
                <ul className="space-y-1" aria-label={`Daftar siswa ${cls.name}`}>
                  {students.map((s) => (
                    <li key={s.id} className="flex items-center justify-between rounded-xl bg-white px-4 py-2.5 border border-slate-100 hover:border-slate-200 transition-colors">
                      <span className="font-mono text-sm font-medium text-slate-800">{s.anonymousLabel}</span>
                      <button type="button" onClick={() => handleDeleteStudent(s.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors" aria-label={`Hapus ${s.anonymousLabel}`}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <AddStudentForm classId={cls.id} onAdded={(s) => setStudents((p) => [...p, s])} />

              <button type="button" onClick={() => setShowImportCsv(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-2.5 text-sm font-medium text-slate-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 transition-all">
                <Upload className="h-4 w-4" /> Import dari CSV
              </button>
            </>
          )}
        </div>
      )}

      {showImportCsv && (
        <ImportCsvDialog classId={cls.id} className={cls.name} onClose={() => setShowImportCsv(false)}
          onImported={(count) => { setShowImportCsv(false); loadStudents(); cls._count.students += count; }} />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await apiFetch<ClassItem[]>("/api/classes");
      if (r.success) setClasses(r.data); else setError(r.error.message);
    } catch { setError("Gagal memuat data kelas."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manajemen Kelas</h1>
          <p className="mt-0.5 text-sm text-slate-500">Kelola kelas, daftar siswa, dan import data.</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all min-h-[44px]">
          <Plus className="h-4 w-4" /> Buat Kelas
        </button>
      </div>

      {/* Loading */}
      {loading && <div className="space-y-3">{[1, 2, 3].map((i) => <ClassSkeleton key={i} />)}</div>}

      {/* Error */}
      {!loading && error && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl bg-red-50 border border-red-200 p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
          <div><p className="font-medium text-red-800">{error}</p><button onClick={load} className="mt-1 text-sm text-red-600 underline">Coba lagi</button></div>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && classes.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
            <Users className="h-8 w-8 text-slate-400" />
          </div>
          <p className="font-semibold text-slate-700">Belum ada kelas</p>
          <p className="mt-1 text-sm text-slate-500">Mulai dengan membuat kelas pertama Anda.</p>
        </div>
      )}

      {/* List */}
      {!loading && !error && classes.length > 0 && (
        <div className="space-y-3">
          {classes.map((c) => (
            <ClassCard key={c.id} cls={c} onDelete={(id) => setClasses((p) => p.filter((x) => x.id !== id))} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateClassDialog
          onCreated={(c) => { setClasses((p) => [c, ...p]); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
