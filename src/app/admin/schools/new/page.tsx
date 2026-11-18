/**
 * /admin/schools/new — Buat Sekolah + Akun Kepala Sekolah Baru
 *
 * Hanya bisa diakses oleh SUPERADMIN.
 * Middleware sudah menjaga rute ini; halaman ini hanya render untuk SUPERADMIN.
 */

"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, Loader2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  schoolName: string;
  principalName: string;
  principalEmail: string;
  principalPassword: string;
  confirmPassword: string;
}

interface FieldErrors {
  schoolName?: string;
  principalName?: string;
  principalEmail?: string;
  principalPassword?: string;
  confirmPassword?: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.schoolName.trim()) errors.schoolName = "Nama sekolah wajib diisi.";
  if (!form.principalName.trim()) errors.principalName = "Nama Kepala Sekolah wajib diisi.";
  if (!form.principalEmail.trim()) {
    errors.principalEmail = "Email wajib diisi.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.principalEmail.trim())) {
    errors.principalEmail = "Format email tidak valid.";
  }
  if (!form.principalPassword) {
    errors.principalPassword = "Password wajib diisi.";
  } else if (form.principalPassword.length < 8) {
    errors.principalPassword = "Password minimal 8 karakter.";
  }
  if (!form.confirmPassword) {
    errors.confirmPassword = "Konfirmasi password wajib diisi.";
  } else if (form.principalPassword !== form.confirmPassword) {
    errors.confirmPassword = "Password tidak cocok.";
  }
  return errors;
}

// ─── Field component ──────────────────────────────────────────────────────────

function Field({
  id,
  label,
  hint,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  autoComplete,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-foreground">
        {label}
      </label>
      {hint && <p className="mb-1.5 text-xs text-muted-foreground">{hint}</p>}
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={[
          "w-full rounded-lg border-2 bg-background px-4 py-2.5 text-sm text-foreground",
          "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30",
          "disabled:cursor-not-allowed disabled:opacity-60 transition-colors",
          error ? "border-destructive focus:border-destructive" : "border-input focus:border-ring",
        ].join(" ")}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Success state ────────────────────────────────────────────────────────────

interface SuccessData {
  schoolName: string;
  subdomain: string;
  principalEmail: string;
}

function SuccessPanel({ data }: { data: SuccessData }) {
  return (
    <div className="rounded-xl border-2 border-green-300 bg-green-50 p-6">
      <div className="flex items-start gap-3">
        <CheckCircle className="mt-0.5 h-6 w-6 shrink-0 text-green-500" aria-hidden="true" />
        <div>
          <p className="font-semibold text-green-800">Sekolah berhasil didaftarkan!</p>
          <ul className="mt-2 space-y-1 text-sm text-green-700">
            <li>
              <span className="font-medium">Sekolah:</span> {data.schoolName}
            </li>
            <li>
              <span className="font-medium">Subdomain:</span> {data.subdomain}
            </li>
            <li>
              <span className="font-medium">Email Kepsek:</span> {data.principalEmail}
            </li>
          </ul>
          <p className="mt-3 text-xs text-green-600">
            Kepala Sekolah dapat langsung masuk menggunakan email dan password yang telah dibuat.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminNewSchoolPage() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>({
    schoolName: "",
    principalName: "",
    principalEmail: "",
    principalPassword: "",
    confirmPassword: "",
  });

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);

  const setField = useCallback(
    (field: keyof FormState) => (value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setFieldErrors((prev) => {
        if (!prev[field]) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
      setServerError(null);
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isLoading) return;

      const errors = validate(form);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }

      setIsLoading(true);
      setServerError(null);

      try {
        const res = await fetch("/api/admin/schools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schoolName: form.schoolName.trim(),
            principalName: form.principalName.trim(),
            principalEmail: form.principalEmail.trim().toLowerCase(),
            principalPassword: form.principalPassword,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (data?.error?.code === "EMAIL_EXISTS") {
            setFieldErrors({ principalEmail: "Email ini sudah terdaftar." });
          } else {
            setServerError(data?.error?.message ?? "Terjadi kesalahan. Silakan coba lagi.");
          }
          return;
        }

        setSuccessData({
          schoolName: data.data.schoolName,
          subdomain: data.data.subdomain,
          principalEmail: data.data.principalEmail,
        });
      } catch {
        setServerError("Gagal terhubung ke server.");
      } finally {
        setIsLoading(false);
      }
    },
    [form, isLoading]
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link
            href="/admin/dashboard"
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Kembali ke Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Daftarkan Sekolah Baru</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Buat tenant sekolah baru beserta akun Kepala Sekolah (PRINCIPAL).
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {successData ? (
            <div className="space-y-4">
              <SuccessPanel data={successData} />
              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    setSuccessData(null);
                    setForm({
                      schoolName: "",
                      principalName: "",
                      principalEmail: "",
                      principalPassword: "",
                      confirmPassword: "",
                    });
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Tambah Sekolah Lain
                </Button>
                <Button onClick={() => router.push("/admin/dashboard")} className="flex-1">
                  Kembali ke Dashboard
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Section: School */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Data Sekolah
                </p>
                <Field
                  id="schoolName"
                  label="Nama Sekolah"
                  placeholder="SMA Negeri 3 Jakarta"
                  value={form.schoolName}
                  onChange={setField("schoolName")}
                  error={fieldErrors.schoolName}
                  autoComplete="organization"
                  disabled={isLoading}
                  hint="Subdomain akan digenerate otomatis dari nama sekolah."
                />
              </div>

              {/* Divider */}
              <hr className="border-slate-200" />

              {/* Section: Principal */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Akun Kepala Sekolah (PRINCIPAL)
                </p>
                <div className="space-y-4">
                  <Field
                    id="principalName"
                    label="Nama Lengkap"
                    placeholder="Dr. Siti Rahayu, M.Pd."
                    value={form.principalName}
                    onChange={setField("principalName")}
                    error={fieldErrors.principalName}
                    autoComplete="name"
                    disabled={isLoading}
                  />
                  <Field
                    id="principalEmail"
                    label="Email"
                    type="email"
                    placeholder="kepsek@sekolah.sch.id"
                    value={form.principalEmail}
                    onChange={setField("principalEmail")}
                    error={fieldErrors.principalEmail}
                    autoComplete="email"
                    disabled={isLoading}
                  />
                  <Field
                    id="principalPassword"
                    label="Password Awal"
                    type="password"
                    placeholder="Minimal 8 karakter"
                    value={form.principalPassword}
                    onChange={setField("principalPassword")}
                    error={fieldErrors.principalPassword}
                    autoComplete="new-password"
                    disabled={isLoading}
                    hint="Kepala Sekolah disarankan mengganti password setelah login pertama."
                  />
                  <Field
                    id="confirmPassword"
                    label="Konfirmasi Password"
                    type="password"
                    placeholder="Ulangi password"
                    value={form.confirmPassword}
                    onChange={setField("confirmPassword")}
                    error={fieldErrors.confirmPassword}
                    autoComplete="new-password"
                    disabled={isLoading}
                  />
                </div>
              </div>

              {serverError && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="rounded-lg border-2 border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
                >
                  {serverError}
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                size="lg"
                className="min-h-[48px] w-full font-semibold"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    Mendaftarkan...
                  </span>
                ) : (
                  "Daftarkan Sekolah"
                )}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
