import Link from "next/link";
import {
  BookOpen,
  LayoutDashboard,
  School,
  ShieldCheck,
  Zap,
  Lock,
  Building2,
  ChevronRight,
  Brain,
  Target,
  BarChart3,
  FileText,
  Clock,
  Users,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Lightbulb,
  ArrowRight,
  Globe,
  Award,
  Database,
  Cpu,
  QrCode,
  TrendingUp,
  Eye,
  RefreshCw,
} from "lucide-react";

// ─────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────

const portals = [
  {
    href: "/student/join",
    label: "Portal Siswa",
    description: "Ikuti sesi dengan PIN tanpa akun. Zero-registration, UU PDP compliant.",
    icon: BookOpen,
    accent: "from-emerald-500 to-teal-600",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    border: "border-emerald-200 dark:border-emerald-800",
    badge: "Stateless via PIN",
    badgeColor: "bg-emerald-100 text-emerald-700",
  },
  {
    href: "/login",
    label: "Dashboard Guru",
    description: "Buat soal dinamis, pantau live heatmap, & unduh LKPD-KK ber-QR Code.",
    icon: LayoutDashboard,
    accent: "from-blue-500 to-indigo-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-800",
    badge: "Akun Guru",
    badgeColor: "bg-blue-100 text-blue-700",
  },
  {
    href: "/login",
    label: "Portal Kepala Sekolah",
    description: "Analisis makro performa kelas & guru. Tenant-isolated per sekolah.",
    icon: School,
    accent: "from-violet-500 to-purple-600",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    border: "border-violet-200 dark:border-violet-800",
    badge: "Akun Kepala Sekolah",
    badgeColor: "bg-violet-100 text-violet-700",
  },
  {
    href: "/admin/login",
    label: "Portal Tim RemediAide",
    description: "Super-admin untuk onboarding sekolah, manajemen lisensi & kemitraan B2B.",
    icon: ShieldCheck,
    accent: "from-slate-500 to-slate-700",
    bg: "bg-slate-50 dark:bg-slate-900/40",
    border: "border-slate-200 dark:border-slate-700",
    badge: "Super-Admin",
    badgeColor: "bg-slate-100 text-slate-700",
  },
];

const pisaStats = [
  { value: "66", unit: "poin", label: "Di bawah rata-rata OECD", sub: "Skor Matematika PISA 2022", color: "text-red-600" },
  { value: "18%", unit: "", label: "Siswa mencapai level profisiensi", sub: "Literasi Sains Minimum", color: "text-orange-600" },
  { value: "3×", unit: "lebih", label: "Berbahaya dari 'tidak tahu'", sub: "Siswa Yakin Tapi Salah (Miskonsepsi)", color: "text-red-700" },
  { value: "68%", unit: "", label: "Belum terdiagnosis miskonsepsinya", sub: "Tanpa alat diagnosis CRI", color: "text-amber-600" },
];

const criQuadrants = [
  {
    label: "Paham Konsep",
    short: "PK",
    condition: "Jawaban Benar + CRI Tinggi (≥3)",
    action: "Pertahankan & Perkaya",
    color: "bg-emerald-50 border-emerald-400 text-emerald-800",
    dot: "bg-emerald-500",
    icon: CheckCircle2,
    iconColor: "text-emerald-600",
    priority: false,
  },
  {
    label: "Lucky Guess",
    short: "LG",
    condition: "Jawaban Benar + CRI Rendah (≤2)",
    action: "Penguatan Konsep Dasar",
    color: "bg-amber-50 border-amber-400 text-amber-800",
    dot: "bg-amber-500",
    icon: HelpCircle,
    iconColor: "text-amber-600",
    priority: false,
  },
  {
    label: "Miskonsepsi",
    short: "MK",
    condition: "Jawaban Salah + CRI Tinggi (≥3)",
    action: "Intervensi Segera",
    color: "bg-red-50 border-red-400 text-red-800",
    dot: "bg-red-500",
    icon: AlertTriangle,
    iconColor: "text-red-600",
    priority: true,
  },
  {
    label: "Tidak Paham Konsep",
    short: "TPK",
    condition: "Jawaban Salah + CRI Rendah (≤2)",
    action: "Reteaching Materi",
    color: "bg-blue-50 border-blue-400 text-blue-800",
    dot: "bg-blue-500",
    icon: Lightbulb,
    iconColor: "text-blue-600",
    priority: false,
  },
];

const innovations = [
  {
    icon: ShieldCheck,
    title: "Anti-Cheating ItemVariant Engine",
    desc: "Satu soal menghasilkan puluhan variasi angka dinamis berbeda per siswa. Mencegah contek-menyontek tanpa kamera pengawas yang memicu kecemasan kognitif.",
    tag: "Eksklusif",
    color: "text-violet-600",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    border: "border-violet-200",
  },
  {
    icon: Zap,
    title: "Live Heatmap via SSE",
    desc: "Pemantauan kognitif kelas berdenyut dan berubah warna secara real-time di layar guru menggunakan Server-Sent Events — tanpa perlu refresh halaman.",
    tag: "Real-Time",
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200",
  },
  {
    icon: Lock,
    title: "Zero-Registration & UU PDP Compliant",
    desc: "Siswa masuk hanya dengan PIN Sesi tanpa email/password. Fitur Auto-Wipe melindungi data anak di bawah umur sesuai regulasi perlindungan data pribadi.",
    tag: "Privasi",
    color: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    border: "border-emerald-200",
  },
  {
    icon: Building2,
    title: "Tenant Isolation B2B",
    desc: "Data kelas SMAN 1 terisolasi penuh dan tidak pernah bocor ke SMAN 2. Portal analisis makro eksklusif untuk Kepala Sekolah per instansi.",
    tag: "Enterprise",
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200",
  },
];

const steps = [
  {
    num: "01",
    icon: Brain,
    title: "Guru Buat Sesi & Soal Dinamis",
    desc: "Guru membuat bank soal dengan ItemVariant Engine. Sistem otomatis menghasilkan variasi angka unik per siswa. Aktifkan Sesi PIN dengan sekali klik.",
    color: "bg-blue-600",
  },
  {
    num: "02",
    icon: Target,
    title: "Siswa Jawab + Metacognitive Slider CRI",
    desc: "Siswa masuk dengan PIN Sesi (tanpa akun). Setiap jawaban disertai Metacognitive Slider CRI 0–5 untuk mengukur tingkat keyakinan secara akurat.",
    color: "bg-indigo-600",
  },
  {
    num: "03",
    icon: Eye,
    title: "Guru Pantau Live Heatmap Real-Time",
    desc: "Layar guru menampilkan heatmap kelas yang berubah warna secara langsung via SSE. Identifikasi pola miskonsepsi kelas dalam hitungan detik.",
    color: "bg-violet-600",
  },
  {
    num: "04",
    icon: FileText,
    title: "Sistem Hasilkan Kelompok & LKPD-KK",
    desc: "Algoritma CRI mengelompokkan siswa otomatis (Rekonstruksi Konsep vs Reteaching). Unduh LKPD-KK ber-QR Code siap cetak untuk remediasi tepat sasaran.",
    color: "bg-emerald-600",
  },
];

const features = [
  { icon: Cpu, label: "Next.js 14 App Router", sub: "Performa tinggi & SEO optimal" },
  { icon: Database, label: "PostgreSQL + Prisma ORM", sub: "Data reliabel & terstruktur" },
  { icon: ShieldCheck, label: "RBAC Multi-Peran", sub: "Siswa, Guru, Kepsek, Admin" },
  { icon: BarChart3, label: "Ekspor CSV & PDF", sub: "Laporan diagnosis lengkap" },
  { icon: QrCode, label: "LKPD-KK ber-QR Code", sub: "Siap cetak & distribusi" },
  { icon: RefreshCw, label: "Auto-Wipe & Privasi", sub: "UU PDP compliant" },
  { icon: TrendingUp, label: "Analytics Makro Kepsek", sub: "Dashboard multi-kelas" },
  { icon: Globe, label: "Progressive Web App", sub: "Instalasi di semua perangkat" },
];

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">

      {/* ══════════════════════════════════════════
          NAVIGATION BAR
      ══════════════════════════════════════════ */}
      <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700">
              <Brain className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">
              Remedi<span className="text-blue-600">Aide</span>
            </span>
          </div>
          <div className="hidden items-center gap-6 text-sm font-medium text-slate-600 sm:flex">
            <a href="#why" className="hover:text-blue-600 transition-colors">Mengapa CRI?</a>
            <a href="#algorithm" className="hover:text-blue-600 transition-colors">Algoritma</a>
            <a href="#how" className="hover:text-blue-600 transition-colors">Cara Pakai</a>
            <Link href="/student/join" className="rounded-lg bg-blue-600 px-4 py-1.5 text-white hover:bg-blue-700 transition-colors">
              Mulai Sekarang
            </Link>
          </div>
        </div>
      </nav>

      {/* ══════════════════════════════════════════
          1. HERO SECTION
      ══════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white px-6 pb-20 pt-20">
        {/* Background grid decoration */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(rgba(99,102,241,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.08) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative mx-auto max-w-5xl text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700">
            <Award className="h-4 w-4" />
            Kompetisi LIDM ITDP 2026 · Inovasi Teknologi Pendidikan
          </div>

          {/* Headline */}
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Sistem Diagnosis Kognitif &{" "}
            <span className="bg-gradient-to-r from-blue-600 to-indigo-700 bg-clip-text text-transparent">
              Remediasi Pembelajaran
            </span>{" "}
            Berbasis Bukti
          </h1>

          {/* Sub-headline */}
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            Membantu guru mengidentifikasi miskonsepsi siswa secara presisi menggunakan metode{" "}
            <strong className="text-slate-800">Certainty of Response Index (CRI)</strong> dalam kerangka{" "}
            <strong className="text-slate-800">Kurikulum Merdeka</strong> — bukan sekadar kuis benar/salah.
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/student/join"
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-200 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-300"
            >
              <BookOpen className="h-5 w-5" />
              Mulai Sesi Siswa via PIN
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="flex items-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-8 py-3.5 text-base font-semibold text-slate-700 transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:text-blue-700 hover:shadow-md"
            >
              <LayoutDashboard className="h-5 w-5" />
              Masuk Portal Guru
            </Link>
          </div>

          {/* Trust badges */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
            {["Berbasis Riset Pedagogis", "Zero-Registration Siswa", "UU PDP Compliant", "Open Source Ready"].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          2. PORTAL GATEWAY SECTION
      ══════════════════════════════════════════ */}
      <section id="portal" className="bg-slate-50 px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-blue-600">Akses Multi-Peran</p>
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Pilih Portal Anda</h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-600">
              Setiap peran memiliki antarmuka dan kewenangan yang dirancang khusus untuk kebutuhan spesifiknya.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {portals.map(({ href, label, description, icon: Icon, accent, bg, border, badge, badgeColor }) => (
              <Link key={href + label} href={href} className="group focus:outline-none">
                <div
                  className={`flex h-full flex-col rounded-2xl border p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${bg} ${border}`}
                >
                  {/* Icon */}
                  <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${accent} shadow-md`}>
                    <Icon className="h-6 w-6 text-white" aria-hidden />
                  </div>

                  {/* Badge */}
                  <span className={`mb-3 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeColor}`}>
                    {badge}
                  </span>

                  <h3 className="mb-2 text-base font-bold text-slate-900">{label}</h3>
                  <p className="mb-4 flex-1 text-sm leading-relaxed text-slate-600">{description}</p>

                  <span className="flex items-center gap-1 text-sm font-semibold text-blue-600 group-hover:gap-2 transition-all">
                    Masuk <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          3. WHY REMEDIAIDE? — DATA & URGENSI
      ══════════════════════════════════════════ */}
      <section id="why" className="bg-white px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-red-600">Urgensi Berdasarkan Data</p>
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Mengapa Indonesia Membutuhkan RemediAide?</h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-600">
              Krisis kompetensi sains dan matematika Indonesia terungkap jelas dalam data PISA 2022.
              Akar masalahnya bukan sekadar kurangnya latihan soal — tetapi <strong>miskonsepsi yang tidak terdeteksi</strong>.
            </p>
          </div>

          {/* PISA Stats */}
          <div className="mb-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {pisaStats.map(({ value, unit, label, sub, color }) => (
              <div key={sub} className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                <div className={`text-4xl font-extrabold ${color}`}>
                  {value}<span className="text-2xl">{unit}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-800">{label}</p>
                <p className="mt-1 text-xs text-slate-500">{sub}</p>
              </div>
            ))}
          </div>

          {/* Explanation grid */}
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
                <Brain className="h-5 w-5 text-white" />
              </div>
              <h3 className="mb-2 font-bold text-slate-900">Miskonsepsi vs Tidak Tahu</h3>
              <p className="text-sm leading-relaxed text-slate-700">
                Siswa yang <strong>yakin tapi salah</strong> (miskonsepsi) jauh lebih berbahaya bagi pondasi belajar
                dibanding siswa yang tahu dirinya tidak tahu. Miskonsepsi membentuk pola berpikir keliru yang
                sulit dihapus tanpa intervensi spesifik.
              </p>
            </div>
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600">
                <Target className="h-5 w-5 text-white" />
              </div>
              <h3 className="mb-2 font-bold text-slate-900">Metode CRI (0–5)</h3>
              <p className="text-sm leading-relaxed text-slate-700">
                Certainty of Response Index mengukur <strong>tingkat keyakinan</strong> siswa pada setiap jawaban
                menggunakan skala 0–5. Kombinasi benar/salah dengan tingkat keyakinan menghasilkan
                4 kategori diagnostik yang presisi dan berbasis riset pedagogis.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600">
                <Award className="h-5 w-5 text-white" />
              </div>
              <h3 className="mb-2 font-bold text-slate-900">Solusi Kurikulum Merdeka</h3>
              <p className="text-sm leading-relaxed text-slate-700">
                RemediAide mendukung amanat Kurikulum Merdeka untuk <strong>asesmen diagnostik</strong> dan
                <strong> pembelajaran terdiferensiasi</strong>. Setiap siswa mendapatkan jalur remediasi
                yang sesuai dengan profil kognitif individualnya.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          4. ALGORITMA & PERHITUNGAN ILMIAH
      ══════════════════════════════════════════ */}
      <section id="algorithm" className="bg-gradient-to-b from-slate-900 to-slate-800 px-6 py-20 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-blue-400">Dapur Algoritma</p>
            <h2 className="text-3xl font-bold sm:text-4xl">Presisi Ilmiah di Balik Setiap Diagnosis</h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-400">
              RemediAide bukan sekadar kuis benar/salah. Ini adalah <strong className="text-white">mesin diagnostik kognitif</strong> berbasis
              riset pedagogis dan rekayasa perangkat lunak yang terukur.
            </p>
          </div>

          {/* CRI Quadrant Matrix */}
          <div className="mb-12">
            <h3 className="mb-2 text-center text-lg font-bold text-slate-200">Matriks 4 Kuadran CRI</h3>
            <p className="mb-6 text-center text-sm text-slate-400">
              Setiap respons siswa diklasifikasikan ke salah satu dari 4 kuadran berikut:
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {criQuadrants.map(({ label, short, condition, action, color, dot, icon: Icon, iconColor, priority }) => (
                <div
                  key={short}
                  className={`relative rounded-2xl border-2 p-5 ${color} ${priority ? "ring-2 ring-red-400 ring-offset-2 ring-offset-slate-900 shadow-lg shadow-red-900/40" : ""}`}
                >
                  {priority && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-red-500 px-3 py-0.5 text-xs font-bold text-white shadow-md">
                      ⚠ Prioritas Intervensi!
                    </div>
                  )}
                  <div className="mb-3 flex items-center gap-2">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-white/80`}>
                      <Icon className={`h-5 w-5 ${iconColor}`} />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider opacity-70">{short}</span>
                  </div>
                  <h4 className="mb-1 text-sm font-bold">{label}</h4>
                  <p className="mb-2 text-xs opacity-80">{condition}</p>
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${dot}`} />
                    <span className="text-xs font-semibold">{action}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Two algorithm highlights */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Integrity Index */}
            <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20">
                  <Clock className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Deteksi Anomali Waktu</h3>
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">Integrity Index</span>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-slate-400">
                Sistem merekam <strong className="text-white">durasi pengerjaan per soal dalam milidetik</strong> lalu
                membandingkannya dengan tingkat keyakinan CRI. Jika siswa menjawab dalam 2 detik dengan CRI tinggi,
                sistem otomatis menandai sebagai <strong className="text-amber-400">speed-guessing</strong> —
                tanpa perlu proctoring berbasis kamera yang memicu kecemasan kognitif.
              </p>
            </div>

            {/* Automated Clustering */}
            <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20">
                  <Users className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Automated Remediation Clustering</h3>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">Auto-Cluster</span>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-slate-400">
                Algoritma CRI secara otomatis mengelompokkan siswa menjadi{" "}
                <strong className="text-white">Kelompok Rekonstruksi Konsep</strong> (miskonsepsi) vs{" "}
                <strong className="text-white">Kelompok Reteaching</strong> (tidak paham).
                Setiap kelompok langsung menghasilkan <strong className="text-emerald-400">LKPD-KK ber-QR Code</strong> siap cetak
                tanpa input manual dari guru.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          5. KEUNIKAN & INOVASI EKSKLUSIF
      ══════════════════════════════════════════ */}
      <section className="bg-white px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-indigo-600">Inovasi Eksklusif</p>
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Mengapa RemediAide Berbeda?</h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-600">
              Bukan CBT konvensional. RemediAide dirancang dari nol dengan teknologi enterprise
              untuk menjawab tantangan spesifik pendidikan Indonesia.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {innovations.map(({ icon: Icon, title, desc, tag, color, bg, border }) => (
              <div
                key={title}
                className={`group rounded-2xl border p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${bg} ${border}`}
              >
                <div className="mb-4 flex items-start gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm`}>
                    <Icon className={`h-6 w-6 ${color}`} />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="font-bold text-slate-900">{title}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${color} bg-white/80`}>{tag}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-700">{desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Comparison callout */}
          <div className="mt-10 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900">CBT Konvensional vs RemediAide</h3>
                <p className="mt-1 text-sm text-slate-700">
                  CBT konvensional hanya memberi tahu siswa <em>apakah</em> jawaban benar atau salah.
                  RemediAide memberi tahu guru <strong>mengapa</strong> siswa salah, <strong>seberapa yakin</strong> mereka,
                  dan <strong>apa tindakan remediasi yang tepat</strong> — semua secara otomatis dan berbasis data.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          6. HOW IT WORKS — 4 LANGKAH
      ══════════════════════════════════════════ */}
      <section id="how" className="bg-slate-50 px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-blue-600">Cara Penggunaan</p>
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">4 Langkah Mudah ke Diagnosis Presisi</h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-600">
              Dari pembuatan soal hingga LKPD-KK siap cetak — seluruh alur dirancang agar bisa selesai dalam satu sesi pembelajaran.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ num, icon: Icon, title, desc, color }, idx) => (
              <div key={num} className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                {/* Connector line for desktop */}
                {idx < steps.length - 1 && (
                  <div
                    aria-hidden
                    className="absolute right-0 top-10 hidden h-0.5 w-6 bg-slate-200 lg:block"
                    style={{ right: "-1.5rem" }}
                  />
                )}
                <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Langkah {num}</div>
                <h3 className="mb-2 font-bold text-slate-900">{title}</h3>
                <p className="text-sm leading-relaxed text-slate-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          7. FITUR UNGGULAN & KEAMANAN
      ══════════════════════════════════════════ */}
      <section className="bg-white px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-slate-500">Spesifikasi Teknis</p>
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Standar Enterprise, Gratis untuk Sekolah</h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-600">
              Dibangun di atas stack teknologi modern dengan keamanan dan skalabilitas kelas enterprise.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, label, sub }) => (
              <div
                key={label}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                  <Icon className="h-4 w-4 text-blue-700" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{label}</p>
                  <p className="text-xs text-slate-500">{sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Security & CTA row */}
          <div className="mt-12 flex flex-col items-center justify-between gap-6 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 p-8 sm:flex-row">
            <div>
              <h3 className="text-lg font-bold text-white">Siap mencoba RemediAide sekarang?</h3>
              <p className="mt-1 text-sm text-slate-400">
                Tidak perlu instalasi. Tidak perlu daftar untuk siswa. Langsung pakai.
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-col gap-3 sm:flex-row">
              <Link
                href="/student/join"
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                <BookOpen className="h-4 w-4" />
                Mulai via PIN Siswa
              </Link>
              <Link
                href="/login"
                className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-700 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-600 transition-colors"
              >
                <LayoutDashboard className="h-4 w-4" />
                Portal Guru
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          8. FOOTER
      ══════════════════════════════════════════ */}
      <footer className="border-t border-slate-200 bg-slate-50 px-6 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col items-start justify-between gap-8 sm:flex-row">
            {/* Brand */}
            <div className="max-w-sm">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700">
                  <Brain className="h-4 w-4 text-white" />
                </div>
                <span className="text-lg font-bold">
                  Remedi<span className="text-blue-600">Aide</span>
                </span>
              </div>
              <p className="text-sm leading-relaxed text-slate-600">
                Inovasi Digital Pendidikan untuk Indonesia.
                Sistem diagnosis kognitif berbasis CRI untuk remediasi pembelajaran yang presisi dan berkeadilan.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                <Award className="h-3 w-3" />
                Kompetisi LIDM ITDP 2026
              </div>
            </div>

            {/* Links */}
            <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
              <div>
                <p className="mb-3 font-semibold text-slate-900">Akses Cepat</p>
                <ul className="space-y-2 text-slate-600">
                  <li><Link href="/student/join" className="hover:text-blue-600">Portal Siswa (PIN)</Link></li>
                  <li><Link href="/login" className="hover:text-blue-600">Dashboard Guru</Link></li>
                  <li><Link href="/login" className="hover:text-blue-600">Portal Kepala Sekolah</Link></li>
                  <li><Link href="/admin" className="hover:text-blue-600">Portal Admin</Link></li>
                </ul>
              </div>
              <div>
                <p className="mb-3 font-semibold text-slate-900">Legal & Privasi</p>
                <ul className="space-y-2 text-slate-600">
                  <li><a href="#" className="hover:text-blue-600">Kebijakan Privasi (UU PDP)</a></li>
                  <li><a href="#" className="hover:text-blue-600">Syarat & Ketentuan</a></li>
                  <li><a href="#" className="hover:text-blue-600">Keamanan Data</a></li>
                </ul>
              </div>
              <div>
                <p className="mb-3 font-semibold text-slate-900">Kontak & Kemitraan</p>
                <ul className="space-y-2 text-slate-600">
                  <li><a href="mailto:tim@remediaide.id" className="hover:text-blue-600">tim@remediaide.id</a></li>
                  <li><a href="#" className="hover:text-blue-600">Kemitraan Sekolah B2B</a></li>
                  <li><a href="#" className="hover:text-blue-600">Dokumentasi API</a></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-slate-200 pt-6 text-xs text-slate-400 sm:flex-row">
            <p>© 2026 RemediAide. Semua hak dilindungi undang-undang.</p>
            <p>
              Dibangun dengan ❤️ untuk Indonesia · Next.js 14 · Prisma · PostgreSQL · Tailwind CSS
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
