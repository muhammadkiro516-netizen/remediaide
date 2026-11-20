/**
 * Akun juri hanya-baca (CAC MLSC 2026).
 *
 * Akun juri adalah akun guru biasa di database. Bedanya, emailnya terdaftar di env JUDGE_EMAILS
 * (dipisah koma). Middleware memanggil judgeBlock() di setiap request: juri boleh membuka semua
 * halaman dan GET API, tetapi tidak boleh mengubah data (POST/PUT/PATCH/DELETE) dan tidak boleh
 * mengekspor data. Tidak butuh migrasi database; aman untuk Edge runtime (tanpa Prisma).
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const EXPORT_PATHS: RegExp[] = [/\/export(\/|$)/, /\/csv$/, /\/research-consent$/];

export function judgeEmails(raw: string | undefined = process.env.JUDGE_EMAILS): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isJudge(email: string | null | undefined, raw?: string): boolean {
  if (!email) return false;
  return judgeEmails(raw).has(email.trim().toLowerCase());
}

/** Alasan penolakan, atau null bila request boleh lewat. */
export function judgeBlock(
  email: string | null | undefined,
  method: string,
  pathname: string,
  raw?: string
): "WRITE" | "EXPORT" | null {
  if (!isJudge(email, raw)) return null;
  if (pathname.startsWith("/api/auth/")) return null; // login/logout tetap boleh
  if (!SAFE_METHODS.has(method.toUpperCase())) return "WRITE";
  if (EXPORT_PATHS.some((r) => r.test(pathname))) return "EXPORT";
  return null;
}
