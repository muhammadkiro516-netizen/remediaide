"use client";

import React, { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type CalibrationStatus = "EXPERT_ESTIMATED" | "CALIBRATING" | "VALIDATED";

interface RenderedOption {
  key: string;
  text: string;
  isCorrect: boolean;
}

interface ItemVariant {
  id: string;
  questionId: string;
  variableValues: Record<string, number>;
  renderedText: string;
  renderedOptions: RenderedOption[];
  correctOptionKey: string;
  tauMinSeconds: number;
  calibrationStatus: CalibrationStatus;
  hasPotentialIssue: boolean;
  createdAt: string;
}

interface Props {
  questionId: string;
  /** Pre-loaded variants (optional); if omitted, fetched on mount */
  initialVariants?: ItemVariant[];
}

// ─── Calibration Status Badge ─────────────────────────────────────────────────

const CALIBRATION_CONFIG: Record<
  CalibrationStatus,
  { label: string; className: string }
> = {
  EXPERT_ESTIMATED: {
    label: "Expert Estimated",
    className: "bg-yellow-100 text-yellow-800 border border-yellow-300",
  },
  CALIBRATING: {
    label: "Calibrating",
    className: "bg-blue-100 text-blue-800 border border-blue-300",
  },
  VALIDATED: {
    label: "Validated",
    className: "bg-green-100 text-green-800 border border-green-300",
  },
};

function CalibrationBadge({ status }: { status: CalibrationStatus }) {
  const config = CALIBRATION_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        config.className
      )}
    >
      {config.label}
    </span>
  );
}

// ─── Calibration Update Dropdown ──────────────────────────────────────────────

function CalibrationUpdater({
  variantId,
  currentStatus,
  onUpdated,
}: {
  variantId: string;
  currentStatus: CalibrationStatus;
  onUpdated: (newStatus: CalibrationStatus) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSelect(status: CalibrationStatus) {
    setOpen(false);
    if (status === currentStatus) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/variants/${variantId}/calibration`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await res.json();
      if (result.success) {
        onUpdated(status);
      }
    } finally {
      setLoading(false);
    }
  }

  const statuses: CalibrationStatus[] = ["EXPERT_ESTIMATED", "CALIBRATING", "VALIDATED"];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className="text-xs text-gray-500 hover:text-gray-700 underline disabled:opacity-50"
        aria-label={`Ubah status kalibrasi varian`}
        aria-expanded={open}
      >
        {loading ? "..." : "Ubah"}
      </button>

      {open && (
        <div
          className="absolute right-0 z-10 mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[160px]"
          role="menu"
        >
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSelect(s)}
              role="menuitem"
              className={cn(
                "w-full text-left px-3 py-2 text-xs hover:bg-gray-50",
                s === currentStatus && "font-semibold text-blue-600"
              )}
            >
              {CALIBRATION_CONFIG[s].label}
              {s === currentStatus && " ✓"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VariantPreview({ questionId, initialVariants }: Props) {
  const [variants, setVariants] = useState<ItemVariant[]>(initialVariants ?? []);
  const [loading, setLoading] = useState(!initialVariants);
  const [error, setError] = useState<string | null>(null);

  const loadVariants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/questions/${questionId}/variants`);
      const result = await res.json();
      if (result.success) {
        setVariants(result.data);
      } else {
        setError(result.error?.message ?? "Gagal memuat variant.");
      }
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
    }
  }, [questionId]);

  // Load on mount if no initial data
  React.useEffect(() => {
    if (!initialVariants) loadVariants();
  }, [initialVariants, loadVariants]);

  // Check if ALL variants are expert_estimated → show warning
  const allExpertEstimated =
    variants.length > 0 &&
    variants.every((v) => v.calibrationStatus === "EXPERT_ESTIMATED");

  function handleCalibrationUpdated(variantId: string, newStatus: CalibrationStatus) {
    setVariants((prev) =>
      prev.map((v) => (v.id === variantId ? { ...v, calibrationStatus: newStatus } : v))
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          Varian Soal ({variants.length})
        </h3>
        <button
          type="button"
          onClick={loadVariants}
          disabled={loading}
          className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded disabled:opacity-50 min-h-[36px]"
          aria-label="Refresh daftar varian"
        >
          {loading ? "Memuat..." : "↺ Refresh"}
        </button>
      </div>

      {/* Warning banner: all variants are expert_estimated */}
      {allExpertEstimated && (
        <div
          role="alert"
          className="flex items-start gap-2 bg-yellow-50 border border-yellow-300 rounded-md px-4 py-3 text-yellow-800 text-sm"
        >
          <span className="text-yellow-500 text-base leading-none mt-0.5" aria-hidden="true">⚠️</span>
          <p>
            <span className="font-semibold">Semua varian soal ini belum terkalibrasi (Expert Estimated).</span>{" "}
            Hasil diagnosis mungkin perlu diverifikasi. Pertimbangkan untuk mengkalibrasi
            varian setelah digunakan dalam beberapa sesi.
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-2" aria-live="polite" aria-label="Memuat varian">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 animate-pulse rounded" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
          {error}
          <button
            type="button"
            role="button"
            onClick={loadVariants}
            className="block mt-2 text-red-600 underline hover:text-red-800"
          >
            ↺ Coba lagi
          </button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && variants.length === 0 && (
        <p className="text-sm text-gray-400 italic text-center py-4">
          Belum ada varian untuk soal ini. Jika soal sudah disimpan, klik Refresh untuk memuat ulang. Jika belum, simpan ulang template untuk men-generate varian.
        </p>
      )}

      {/* Variants table */}
      {!loading && !error && variants.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-md">
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-3 py-2 font-medium text-gray-600 w-10" scope="col">#</th>
                <th className="px-3 py-2 font-medium text-gray-600" scope="col">Teks Soal</th>
                <th className="px-3 py-2 font-medium text-gray-600 w-32" scope="col">Opsi (A–D)</th>
                <th className="px-3 py-2 font-medium text-gray-600 w-20" scope="col">τ_min</th>
                <th className="px-3 py-2 font-medium text-gray-600 w-36" scope="col">Status Kalibrasi</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((variant, idx) => (
                <tr
                  key={variant.id}
                  className={cn(
                    "border-b border-gray-100 hover:bg-gray-50",
                    variant.hasPotentialIssue && "bg-orange-50"
                  )}
                >
                  {/* Index */}
                  <td className="px-3 py-3 text-gray-400 font-mono">{idx + 1}</td>

                  {/* Rendered text */}
                  <td className="px-3 py-3">
                    <p className="text-gray-800 line-clamp-2 leading-relaxed">
                      {variant.renderedText}
                    </p>
                    {variant.hasPotentialIssue && (
                      <span className="inline-block mt-1 text-xs text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">
                        ⚠ Potensi masalah
                      </span>
                    )}
                  </td>

                  {/* Options */}
                  <td className="px-3 py-3">
                    <ul className="space-y-0.5" aria-label="Pilihan jawaban">
                      {(variant.renderedOptions as RenderedOption[]).map((opt) => (
                        <li
                          key={opt.key}
                          className={cn(
                            "text-xs",
                            opt.isCorrect
                              ? "font-semibold text-green-700"
                              : "text-gray-500"
                          )}
                        >
                          <span aria-label={opt.isCorrect ? "Kunci jawaban" : undefined}>
                            {opt.key}. {opt.text}
                            {opt.isCorrect && " ✓"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </td>

                  {/* τ_min */}
                  <td className="px-3 py-3 text-gray-600 font-mono text-xs">
                    {variant.tauMinSeconds}s
                  </td>

                  {/* Calibration status */}
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1.5">
                      <CalibrationBadge status={variant.calibrationStatus} />
                      <CalibrationUpdater
                        variantId={variant.id}
                        currentStatus={variant.calibrationStatus}
                        onUpdated={(newStatus) =>
                          handleCalibrationUpdated(variant.id, newStatus)
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
