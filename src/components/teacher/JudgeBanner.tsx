"use client";

/** Banner shown on every dashboard page when the signed-in account is a read-only judge (JUDGE_EMAILS). */
import { useSession } from "next-auth/react";

export function JudgeBanner() {
  const { data } = useSession();
  if (!(data as { isJudge?: boolean } | null)?.isJudge) return null;
  return (
    <div role="status" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
      Mode juri: hanya-baca · data demo sintetis
    </div>
  );
}
