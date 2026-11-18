"use client";

import React, { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow {
  anonymousLabel: string;
  valid: boolean;
  error?: string;
}

type Step = "upload" | "preview" | "confirm";

interface Props {
  classId: string;
  className: string;
  onClose: () => void;
  onImported: (count: number) => void;
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCsv(content: string): ParsedRow[] {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  // Detect if first line is a header
  const firstLine = lines[0].toLowerCase();
  const hasHeader =
    firstLine === "label" ||
    firstLine === "anonymous_label" ||
    firstLine === "anonymouslabel" ||
    firstLine === "nama" ||
    firstLine.includes(","); // CSV with multiple columns

  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line) => {
    // Handle CSV with multiple columns: take the first column, or find "label" column
    const columns = line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));

    // If it's a multi-column CSV and the header declared a "label" column index
    let labelValue = "";
    if (hasHeader && firstLine.includes(",")) {
      const headers = firstLine.split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
      const labelIdx = headers.findIndex(
        (h) => h === "label" || h === "anonymous_label" || h === "anonymouslabel"
      );
      labelValue = labelIdx >= 0 ? (columns[labelIdx] ?? "") : (columns[0] ?? "");
    } else {
      labelValue = columns[0] ?? "";
    }

    const trimmed = labelValue.trim();

    if (!trimmed) {
      return { anonymousLabel: trimmed, valid: false, error: "Label kosong" };
    }

    if (trimmed.length > 100) {
      return {
        anonymousLabel: trimmed,
        valid: false,
        error: "Label terlalu panjang (maks 100 karakter)",
      };
    }

    // Disallow special chars that could cause issues
    if (/[<>"'/\\]/.test(trimmed)) {
      return {
        anonymousLabel: trimmed,
        valid: false,
        error: "Label mengandung karakter tidak valid",
      };
    }

    return { anonymousLabel: trimmed, valid: true };
  });
}

// ─── Step 1: Upload ───────────────────────────────────────────────────────────

function UploadStep({
  onParsed,
  onCancel,
}: {
  onParsed: (rows: ParsedRow[], preview: ParsedRow[]) => void;
  onCancel: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function processFile(file: File) {
    setError(null);

    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      setError("Hanya file .csv yang didukung.");
      return;
    }

    if (file.size > 1024 * 1024) {
      setError("Ukuran file maksimal 1 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const rows = parseCsv(content);

      if (rows.length === 0) {
        setError("File CSV kosong atau tidak valid.");
        return;
      }

      const preview = rows.slice(0, 5);
      onParsed(rows, preview);
    };
    reader.onerror = () => setError("Gagal membaca file.");
    reader.readAsText(file, "UTF-8");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragging ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Klik atau seret file CSV ke sini"
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        <div className="text-3xl mb-2" aria-hidden="true">📄</div>
        <p className="text-sm font-medium text-gray-700">
          Klik atau seret file CSV ke sini
        </p>
        <p className="text-xs text-gray-400 mt-1">Format: satu label per baris, atau kolom "label"</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="sr-only"
          aria-label="Pilih file CSV"
        />
      </div>

      {/* Format hint */}
      <div className="bg-gray-50 rounded-md p-3 text-xs text-gray-600">
        <p className="font-medium mb-1">Format CSV yang didukung:</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>Satu label per baris: <code className="bg-gray-200 px-1 rounded">S-001</code></li>
          <li>Dengan header: <code className="bg-gray-200 px-1 rounded">label{"\n"}S-001{"\n"}S-002</code></li>
        </ul>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 min-h-[44px]"
        >
          Batal
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Preview ──────────────────────────────────────────────────────────

function PreviewStep({
  allRows,
  onConfirm,
  onBack,
}: {
  allRows: ParsedRow[];
  onConfirm: () => void;
  onBack: () => void;
}) {
  const validRows = allRows.filter((r) => r.valid);
  const invalidRows = allRows.filter((r) => !r.valid);

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-sm">
        <span className="text-green-700 bg-green-50 px-3 py-1 rounded-full font-medium">
          ✓ {validRows.length} valid
        </span>
        {invalidRows.length > 0 && (
          <span className="text-red-700 bg-red-50 px-3 py-1 rounded-full font-medium">
            ✗ {invalidRows.length} error
          </span>
        )}
      </div>

      {/* Valid rows table */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Preview (maks 10 baris):</p>
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-medium text-gray-600" scope="col">#</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600" scope="col">Label Anonim</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600" scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {allRows.slice(0, 10).map((row, i) => (
                <tr key={i} className={`border-b border-gray-100 ${!row.valid ? "bg-red-50" : ""}`}>
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 font-mono">{row.anonymousLabel || "(kosong)"}</td>
                  <td className="px-3 py-2">
                    {row.valid ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-red-600 text-xs">✗ {row.error}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {allRows.length > 10 && (
          <p className="text-xs text-gray-400 mt-1">
            ...dan {allRows.length - 10} baris lainnya
          </p>
        )}
      </div>

      {/* Invalid rows summary */}
      {invalidRows.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
          <p className="font-medium mb-1">Baris tidak valid akan dilewati:</p>
          <ul className="list-disc pl-4 space-y-0.5 text-xs">
            {invalidRows.slice(0, 5).map((row, i) => (
              <li key={i}>
                &quot;{row.anonymousLabel}&quot;: {row.error}
              </li>
            ))}
            {invalidRows.length > 5 && <li>...dan {invalidRows.length - 5} lainnya</li>}
          </ul>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 min-h-[44px]"
        >
          ← Kembali
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={validRows.length === 0}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
        >
          Lanjut → ({validRows.length} siswa)
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Confirm ──────────────────────────────────────────────────────────

function ConfirmStep({
  classId,
  validRows,
  onSuccess,
  onBack,
}: {
  classId: string;
  validRows: ParsedRow[];
  onSuccess: (count: number, skipped: number) => void;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/classes/${classId}/students/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          students: validRows.map((r) => ({ anonymousLabel: r.anonymousLabel })),
        }),
      });

      const result = await res.json();

      if (!result.success) {
        setError(result.error?.message ?? "Import gagal.");
        return;
      }

      onSuccess(result.data.created, result.data.skipped);
    } catch {
      setError("Terjadi kesalahan jaringan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-800">
        <p className="font-medium">Siap mengimpor <strong>{validRows.length} siswa</strong> ke kelas ini.</p>
        <p className="text-xs mt-1">
          Siswa dengan label yang sudah ada akan dilewati secara otomatis.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 min-h-[44px]"
        >
          ← Kembali
        </button>
        <button
          type="button"
          onClick={handleImport}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 min-h-[44px]"
        >
          {loading ? "Mengimpor..." : "✓ Konfirmasi Import"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

export default function ImportCsvDialog({ classId, className, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [allRows, setAllRows] = useState<ParsedRow[]>([]);
  const [successInfo, setSuccessInfo] = useState<{ created: number; skipped: number } | null>(null);

  const validRows = allRows.filter((r) => r.valid);

  const stepLabel: Record<Step, string> = {
    upload: "Langkah 1: Upload File",
    preview: "Langkah 2: Preview Data",
    confirm: "Langkah 3: Konfirmasi Import",
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg w-full" aria-labelledby="import-csv-title">
        <DialogHeader>
          <DialogTitle id="import-csv-title">Import Siswa via CSV</DialogTitle>
          <DialogDescription>
            {successInfo
              ? `Import selesai untuk kelas ${className}.`
              : `${stepLabel[step]} — Kelas: ${className}`}
          </DialogDescription>
        </DialogHeader>

        {successInfo ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-md p-4 text-green-800">
              <p className="font-semibold text-lg">✅ Import Berhasil!</p>
              <p className="text-sm mt-1">
                <strong>{successInfo.created}</strong> siswa berhasil ditambahkan.
                {successInfo.skipped > 0 && (
                  <span> <strong>{successInfo.skipped}</strong> label dilewati (sudah ada).</span>
                )}
              </p>
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={onClose}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 min-h-[48px]"
              >
                Tutup
              </button>
            </DialogFooter>
          </div>
        ) : (
          <>
            {step === "upload" && (
              <UploadStep
                onParsed={(rows) => {
                  setAllRows(rows);
                  setStep("preview");
                }}
                onCancel={onClose}
              />
            )}

            {step === "preview" && (
              <PreviewStep
                allRows={allRows}
                onConfirm={() => setStep("confirm")}
                onBack={() => setStep("upload")}
              />
            )}

            {step === "confirm" && (
              <ConfirmStep
                classId={classId}
                validRows={validRows}
                onSuccess={(created, skipped) => {
                  setSuccessInfo({ created, skipped });
                  onImported(created);
                }}
                onBack={() => setStep("preview")}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
