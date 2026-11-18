"use client";

/**
 * /principal/teachers — Kelola Guru
 *
 * Kepala Sekolah dapat:
 *   - Melihat daftar semua guru di sekolahnya
 *   - Menambahkan guru baru (nama, email, password awal)
 *   - Mengedit nama guru
 *   - Menghapus guru (dengan konfirmasi)
 *
 * Hanya PRINCIPAL yang bisa mengakses halaman ini (dijaga middleware).
 */

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  UserPlus,
  Trash2,
  Pencil,
  Loader2,
  AlertCircle,
  X,
  Check,
  BookOpen,
  ClipboardList,
  Calendar,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Teacher {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  _count: { classes: number; tests: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Input Field ──────────────────────────────────────────────────────────────

function Field({
  id,
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  disabled,
  hint,
}: {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      {hint && <p className="mb-1 text-xs text-gray-500">{hint}</p>}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        className={[
          "w-full rounded-lg border-2 bg-white px-3 py-2.5 text-sm text-gray-900",
          "placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300",
          "disabled:cursor-not-allowed disabled:opacity-60 transition-colors",
          error ? "border-red-400 focus:border-red-400" : "border-gray-300 focus:border-blue-500",
        ].join(" ")}
      />
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Add Teacher Modal ────────────────────────────────────────────────────────

interface AddForm {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface AddErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

function validateAdd(form: AddForm): AddErrors {
  const e: AddErrors = {};
  if (!form.name.trim()) e.name = "Nama wajib diisi.";
  if (!form.email.trim()) e.email = "Email wajib diisi.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Format email tidak valid.";
  if (!form.password) e.password = "Password wajib diisi.";
  else if (form.password.length < 8) e.password = "Password minimal 8 karakter.";
  if (!form.confirmPassword) e.confirmPassword = "Konfirmasi password wajib diisi.";
  else if (form.password !== form.confirmPassword) e.confirmPassword = "Password tidak cocok.";
  return e;
}

function AddTeacherModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (t: Teacher) => void;
}) {
  const [form, setForm] = useState<AddForm>({ name: "", email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState<AddErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const setField = (field: keyof AddForm) => (v: string) => {
    setForm((p) => ({ ...p, [field]: v }));
    setErrors((p) => { const n = { ...p }; delete n[field]; return n; });
    setServerError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateAdd(form);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setIsLoading(true);
    try {
      const res = await fetch("/api/principal/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error?.code === "EMAIL_EXISTS") setErrors({ email: "Email ini sudah terdaftar." });
        else setServerError(data?.error?.message ?? "Terjadi kesalahan.");
        return;
      }
      onAdded(data.data);
    } catch {
      setServerError("Gagal terhubung ke server.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-teacher-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="add-teacher-title" className="text-lg font-bold text-gray-900">
            Tambah Guru Baru
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Field
            id="add-name"
            label="Nama Lengkap"
            placeholder="Budi Santoso, S.Pd."
            value={form.name}
            onChange={setField("name")}
            error={errors.name}
            disabled={isLoading}
          />
          <Field
            id="add-email"
            label="Email"
            type="email"
            placeholder="guru@sekolah.sch.id"
            value={form.email}
            onChange={setField("email")}
            error={errors.email}
            disabled={isLoading}
          />
          <Field
            id="add-password"
            label="Password Awal"
            type="password"
            placeholder="Minimal 8 karakter"
            value={form.password}
            onChange={setField("password")}
            error={errors.password}
            disabled={isLoading}
            hint="Guru disarankan mengganti password setelah login pertama."
          />
          <Field
            id="add-confirm"
            label="Konfirmasi Password"
            type="password"
            placeholder="Ulangi password"
            value={form.confirmPassword}
            onChange={setField("confirmPassword")}
            error={errors.confirmPassword}
            disabled={isLoading}
          />

          {serverError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {serverError}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading} className="flex-1">
              Batal
            </Button>
            <Button type="submit" disabled={isLoading} className="flex-1">
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Menyimpan...
                </span>
              ) : (
                "Tambah Guru"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Name Inline ─────────────────────────────────────────────────────────

function EditNameRow({
  teacher,
  onSaved,
  onCancel,
}: {
  teacher: Teacher;
  onSaved: (t: Teacher) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(teacher.name);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { setError("Nama tidak boleh kosong."); return; }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/principal/teachers/${teacher.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error?.message ?? "Gagal menyimpan."); return; }
      onSaved(data.data);
    } catch {
      setError("Gagal terhubung ke server.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 min-w-0">
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          disabled={isLoading}
          aria-label="Edit nama guru"
          className="w-full rounded-md border-2 border-blue-400 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onCancel(); }}
          autoFocus
        />
        {error && <p className="mt-0.5 text-xs text-red-600">{error}</p>}
      </div>
      <button
        onClick={handleSave}
        disabled={isLoading}
        className="rounded-md p-1.5 text-green-600 hover:bg-green-50 disabled:opacity-50"
        aria-label="Simpan nama"
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </button>
      <button
        onClick={onCancel}
        disabled={isLoading}
        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
        aria-label="Batal edit"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

function DeleteConfirmDialog({
  teacher,
  onConfirm,
  onCancel,
  isLoading,
}: {
  teacher: Teacher;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const hasData = teacher._count.classes > 0 || teacher._count.tests > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-title"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <Trash2 className="h-6 w-6 text-red-600" aria-hidden="true" />
        </div>
        <h2 id="delete-title" className="text-base font-bold text-gray-900">
          Hapus Akun Guru?
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Akun <span className="font-medium">{teacher.name}</span> ({teacher.email}) akan dihapus
          secara permanen.
        </p>

        {hasData && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Guru ini memiliki {teacher._count.classes} kelas dan {teacher._count.tests} soal.
              Data terkait mungkin terpengaruh.
            </span>
          </div>
        )}

        <div className="mt-5 flex gap-3">
          <Button variant="outline" onClick={onCancel} disabled={isLoading} className="flex-1">
            Batal
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Menghapus...
              </span>
            ) : (
              "Ya, Hapus"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Teacher Card (mobile) / Row (desktop) ────────────────────────────────────

function TeacherRow({
  teacher,
  onDeleted,
  onUpdated,
}: {
  teacher: Teacher;
  onDeleted: (id: string) => void;
  onUpdated: (t: Teacher) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/principal/teachers/${teacher.id}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted(teacher.id);
      }
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  }, [teacher.id, onDeleted]);

  return (
    <>
      {confirmDelete && (
        <DeleteConfirmDialog
          teacher={teacher}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
          isLoading={isDeleting}
        />
      )}

      {/* Desktop row */}
      <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
        <td className="py-3 px-4">
          {isEditing ? (
            <EditNameRow
              teacher={teacher}
              onSaved={(t) => { onUpdated(t); setIsEditing(false); }}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <span className="font-medium text-gray-900 text-sm">{teacher.name}</span>
          )}
        </td>
        <td className="py-3 px-4 text-sm text-gray-600 hidden sm:table-cell">{teacher.email}</td>
        <td className="py-3 px-4 text-sm text-gray-500 hidden md:table-cell">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              {teacher._count.classes} kelas
            </span>
            <span className="flex items-center gap-1">
              <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
              {teacher._count.tests} soal
            </span>
          </span>
        </td>
        <td className="py-3 px-4 text-xs text-gray-400 hidden lg:table-cell">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" aria-hidden="true" />
            {formatDate(teacher.createdAt)}
          </span>
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => setIsEditing(true)}
              disabled={isEditing}
              className="rounded-md p-2 text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors disabled:opacity-40 min-h-[40px] min-w-[40px] flex items-center justify-center"
              aria-label={`Edit nama ${teacher.name}`}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-md p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
              aria-label={`Hapus ${teacher.name}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </td>
      </tr>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TeachersManagementPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    fetch("/api/principal/teachers")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setTeachers(data.data);
        else setError(data.error?.message ?? "Gagal memuat data guru.");
      })
      .catch(() => setError("Gagal terhubung ke server."))
      .finally(() => setIsLoading(false));
  }, []);

  const handleAdded = useCallback((teacher: Teacher) => {
    setTeachers((prev) => [teacher, ...prev]);
    setShowAddModal(false);
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setTeachers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleUpdated = useCallback((updated: Teacher) => {
    setTeachers((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }, []);

  return (
    <>
      {showAddModal && (
        <AddTeacherModal onClose={() => setShowAddModal(false)} onAdded={handleAdded} />
      )}

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Kelola Guru</h1>
            <p className="mt-1 text-sm text-gray-500">
              {isLoading
                ? "Memuat..."
                : `${teachers.length} guru terdaftar di sekolah ini`}
            </p>
          </div>
          <Button
            onClick={() => setShowAddModal(true)}
            className="gap-2 min-h-[48px]"
            disabled={isLoading}
          >
            <UserPlus className="h-5 w-5" aria-hidden="true" />
            <span className="hidden sm:inline">Tambah Guru</span>
            <span className="sm:hidden">Tambah</span>
          </Button>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" aria-hidden="true" />
            Memuat data guru...
          </div>
        )}

        {/* Error state */}
        {!isLoading && error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && teachers.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white py-16 text-center">
            <UserPlus className="mx-auto mb-3 h-10 w-10 text-gray-400" aria-hidden="true" />
            <p className="font-medium text-gray-700">Belum ada guru terdaftar</p>
            <p className="mt-1 text-sm text-gray-500">
              Klik &ldquo;Tambah Guru&rdquo; untuk menambahkan guru pertama.
            </p>
          </div>
        )}

        {/* Table */}
        {!isLoading && !error && teachers.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-left">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Nama
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500 hidden sm:table-cell">
                    Email
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500 hidden md:table-cell">
                    Aktivitas
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500 hidden lg:table-cell">
                    Bergabung
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500 text-right">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((teacher) => (
                  <TeacherRow
                    key={teacher.id}
                    teacher={teacher}
                    onDeleted={handleDeleted}
                    onUpdated={handleUpdated}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
