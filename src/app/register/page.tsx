"use client";

/**
 * Register / Partnership Page — Ajukan Kemitraan Sekolah
 * Desain: Warm professional, violet/purple accent, split layout dengan benefit panel
 * Registrasi sekolah dilakukan oleh Tim Internal setelah verifikasi.
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle2, Loader2, Mail, Phone, Info, Building2,
  Users, Award, HeartHandshake, ArrowRight, Sparkles,
  School, ShieldCheck, BarChart3, Brain,
} from "lucide-react";

interface FormState {
  schoolName: string;
  picName: string;
  picEmail: string;
  picPhone: string;
  message: string;
}

interface FieldErrors {
  schoolName?: string;
  picName?: string;
  picEmail?: string;
}

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.schoolName.trim()) errors.schoolName = "Nama sekolah wajib diisi.";
  if (!form.picName.trim()) errors.picName = "Nama penanggung jawab wajib diisi.";
  if (!form.picEmail.trim()) {
    errors.picEmail = "Email wajib diisi.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.picEmail.trim())) {
    errors.picEmail = "Format email tidak valid.";
  }
  return errors;
}

const benefits = [
  { icon: Brain, title: "Diagnosis CRI Terstandar", desc: "Identifikasi miskonsepsi siswa dengan metode ilmiah yang tervalidasi." },
  { icon: BarChart3, title: "Analisis Makro Kepsek", desc: "Dashboard kepala sekolah untuk memantau seluruh kelas dari satu layar." },
  { icon: ShieldCheck, title: "Tenant Isolation Penuh", desc: "Data sekolah Anda terisolasi total dari sekolah lain di platform." },
  { icon: Users, title: "Tanpa Akun Siswa", desc: "Siswa bergabung hanya dengan PIN — zero-registration, UU PDP compliant." },
];

function InputField({
  id, label, type = "text", placeholder, value, onChange, error, autoComplete, disabled, required = false,
}: {
  id: string; label: string; type?: string; placeholder?: string; value: string;
  onChange: (v: string) => void; error?: string; autoComplete?: string; disabled?: boolean; required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}{required && <span className="ml-1 text-violet-600">*</span>}
      </label>
      <input
        id={id} type={type} autoComplete={autoComplete} value={value}
        onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder}
        aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
        className={[
          "w-full rounded-xl border-2 bg-white px-4 py-3 text-sm text-slate-900 transition-all",
          "placeholder:text-slate-400 focus:outline-none focus:ring-4",
          "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60",
          error
            ? "border-red-400 focus:border-red-400 focus:ring-red-100"
            : "border-slate-200 focus:border-violet-500 focus:ring-violet-100",
        ].join(" ")}
      />
      {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

export default function RegisterPage() {
  const [form, setForm] = useState<FormState>({ schoolName: "", picName: "", picEmail: "", picPhone: "", message: "" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const setField = useCallback((field: keyof FormState) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      if (!prev[field as keyof FieldErrors]) return prev;
      const next = { ...prev }; delete next[field as keyof FieldErrors]; return next;
    });
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    const errors = validate(form);
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    setIsLoading(false);
    setIsSubmitted(true);
  }, [form, isLoading]);

  return (
    <div className="flex min-h-screen">
      {/* LEFT PANEL — Benefits */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-violet-700 via-purple-700 to-fuchsia-800 p-12 lg:flex lg:w-5/12">
        <div aria-hidden className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.06) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.04) 0%, transparent 50%)" }} />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-0 h-64 w-64 rounded-full bg-white/5 blur-3xl" />

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
            <HeartHandshake className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white">RemediAide</span>
        </div>

        {/* Main copy */}
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-violet-100">
            <Sparkles className="h-3 w-3" />
            Kemitraan Institusi Pendidikan
          </div>
          <h2 className="text-3xl font-extrabold leading-tight text-white">
            Bergabunglah<br />bersama sekolah yang<br />percaya pada<br />data, bukan asumsi.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-violet-200">
            Platform RemediAide hadir untuk sekolah yang berkomitmen pada
            kualitas pembelajaran berbasis bukti. Tim kami akan membantu
            proses onboarding dari awal hingga selesai.
          </p>

          <div className="mt-8 space-y-4">
            {benefits.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="h-4 w-4 text-white" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-xs text-violet-300">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Credential badges */}
        <div className="flex flex-wrap gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white">
            <Award className="h-3 w-3" /> LIDM ITDP 2026
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white">
            <ShieldCheck className="h-3 w-3" /> UU PDP Compliant
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white">
            <School className="h-3 w-3" /> B2B Sekolah
          </span>
        </div>
      </div>

      {/* RIGHT PANEL — Form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-6 py-12 overflow-y-auto">
        {/* Mobile logo */}
        <div className="mb-6 flex flex-col items-center lg:hidden">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 shadow-lg">
            <HeartHandshake className="h-6 w-6 text-white" />
          </div>
          <span className="text-lg font-bold text-slate-900">RemediAide</span>
        </div>

        <div className="w-full max-w-sm">
          {!isSubmitted ? (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-extrabold text-slate-900">Ajukan Kemitraan Sekolah</h1>
                <p className="mt-1.5 text-sm text-slate-500">
                  Isi formulir ini dan tim kami menghubungi Anda dalam 1–2 hari kerja.
                </p>
              </div>

              {/* Info banner */}
              <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
                <p className="text-xs leading-relaxed text-violet-700">
                  Pendaftaran sekolah dilakukan oleh Tim Internal RemediAide setelah verifikasi.
                  Proses ini memastikan keamanan dan kualitas layanan untuk setiap institusi.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <InputField id="schoolName" label="Nama Sekolah" placeholder="SMA Negeri 5 Bandung"
                  value={form.schoolName} onChange={setField("schoolName")} error={fieldErrors.schoolName}
                  autoComplete="organization" disabled={isLoading} required />
                <InputField id="picName" label="Nama Penanggung Jawab" placeholder="Nama Kepala Sekolah / Koordinator"
                  value={form.picName} onChange={setField("picName")} error={fieldErrors.picName}
                  autoComplete="name" disabled={isLoading} required />
                <InputField id="picEmail" label="Email Institusi" type="email" placeholder="kontak@sekolah.sch.id"
                  value={form.picEmail} onChange={setField("picEmail")} error={fieldErrors.picEmail}
                  autoComplete="email" disabled={isLoading} required />
                <InputField id="picPhone" label="Nomor WhatsApp (opsional)" type="tel" placeholder="08xx-xxxx-xxxx"
                  value={form.picPhone} onChange={setField("picPhone")} autoComplete="tel" disabled={isLoading} />

                <div>
                  <label htmlFor="message" className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Pesan / Kebutuhan Sekolah (opsional)
                  </label>
                  <textarea id="message" rows={3} value={form.message} onChange={(e) => setField("message")(e.target.value)}
                    disabled={isLoading} placeholder="Ceritakan kebutuhan dan harapan sekolah Anda..."
                    className="w-full resize-none rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-4 focus:ring-violet-100 disabled:opacity-60 transition-all" />
                </div>

                <button type="submit" disabled={isLoading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 text-sm font-bold text-white shadow-lg shadow-violet-200 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-violet-300 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none">
                  {isLoading
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Mengirim...</>
                    : <><HeartHandshake className="h-4 w-4" />Kirim Permintaan Kemitraan <ArrowRight className="h-4 w-4" /></>}
                </button>
              </form>

              {/* Contact alternatives */}
              <div className="mt-6 border-t border-slate-200 pt-5 text-center">
                <p className="mb-2 text-xs text-slate-400">Atau hubungi kami langsung:</p>
                <div className="flex justify-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Mail className="h-3 w-3" />admin@remediaide.id</span>
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" />WhatsApp Tersedia</span>
                </div>
              </div>

              <div className="mt-4 text-center text-sm text-slate-500">
                Sudah punya akun?{" "}
                <Link href="/login" className="font-semibold text-violet-600 hover:text-violet-700 hover:underline">Masuk di sini</Link>
              </div>
            </>
          ) : (
            /* Success state */
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-purple-100">
                <CheckCircle2 className="h-10 w-10 text-violet-600" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900">Permintaan Terkirim!</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Terima kasih, <strong>{form.picName}</strong> dari <strong>{form.schoolName}</strong>.<br />
                Tim RemediAide akan menghubungi <strong>{form.picEmail}</strong> dalam 1–2 hari kerja.
              </p>
              <div className="mt-6 rounded-xl border border-violet-200 bg-violet-50 px-4 py-4">
                <p className="text-xs text-violet-700">
                  Sambil menunggu, Anda bisa mempelajari lebih lanjut tentang
                  metode CRI dan fitur RemediAide di halaman utama kami.
                </p>
              </div>
              <div className="mt-6 space-y-2">
                <Link href="/" className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 px-6 py-3 text-sm font-bold text-white hover:-translate-y-0.5 transition-all shadow-lg shadow-violet-200">
                  <Building2 className="h-4 w-4" /> Pelajari RemediAide
                </Link>
                <Link href="/login" className="block text-xs text-slate-400 hover:text-slate-600 hover:underline">
                  Sudah punya akun? Masuk di sini →
                </Link>
              </div>
            </div>
          )}

          <Link href="/" className="mt-4 block text-center text-xs text-slate-400 hover:text-slate-600 hover:underline">
            ← Kembali ke halaman utama
          </Link>
        </div>
      </div>
    </div>
  );
}
