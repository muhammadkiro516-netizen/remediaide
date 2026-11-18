"use client";

/**
 * ImportQuestionsDialog — Dialog untuk mengimpor soal dari file CSV.
 *
 * Dua tab:
 *  1. "Unduh Template" — download CSV template dengan header yang sesuai
 *  2. "Upload CSV"     — pilih file CSV, preview, validasi, konfirmasi import
 *
 * Props:
 *  - testId: string   — ID paket soal yang menjadi tujuan import
 *  - onSuccess: () => void — dipanggil setelah import berhasil
 *
 * Requirements: 2.11, 2.12, 2.13
 */

import React, { useState, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  testId: string;
  onSuccess: () => void;
  /** Called when the dialog should be closed (✕ button or backdrop click) */
  onClose?: () => void;
}

const REQUIRED_COLUMNS = [
  "nomor",
  "teks_soal",
  "tipe_jawaban",
  "opsi_a",
  "opsi_b",
  "opsi_c",
  "opsi_d",
  "jawaban_benar",
] as const;

type Tab = "template" | "upload";

interface PreviewRow {
  rowIndex: number;
  nomor: string;
  teks_soal: string;
  tipe_jawaban: string;
  opsi_a: string;
  opsi_b: string;
  opsi_c: string;
  opsi_d: string;
  jawaban_benar: string;
  valid: boolean;
  error?: string;
}

// ─── CSV Parsing (client-side, for preview only) ──────────────────────────────

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

interface ParseResult {
  rows: PreviewRow[];
  headerError?: string;
}

function parseCsvForPreview(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { rows: [], headerError: "File CSV kosong." };

  const headers = parseCsvLine(lines[0].toLowerCase());

  const missingCols = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (missingCols.length > 0) {
    return {
      rows: [],
      headerError: `Kolom wajib tidak ditemukan: ${missingCols.join(", ")}`,
    };
  }

  const idx = Object.fromEntries(REQUIRED_COLUMNS.map((c) => [c, headers.indexOf(c)])) as Record<
    (typeof REQUIRED_COLUMNS)[number],
    number
  >;

  const rows: PreviewRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const nomor = fields[idx.nomor] ?? "";
    const teks_soal = fields[idx.teks_soal] ?? "";
    const tipe_jawaban = (fields[idx.tipe_jawaban] ?? "").toLowerCase();
    const opsi_a = fields[idx.opsi_a] ?? "";
    const opsi_b = fields[idx.opsi_b] ?? "";
    const opsi_c = fields[idx.opsi_c] ?? "";
    const opsi_d = fields[idx.opsi_d] ?? "";
    const jawaban_benar = (fields[idx.jawaban_benar] ?? "").toUpperCase();

    let valid = true;
    let error: string | undefined;

    if (!teks_soal.trim()) {
      valid = false;
      error = "teks_soal kosong";
    } else if (tipe_jawaban !== "teks" && tipe_jawaban !== "numerik") {
      valid = false;
      error = `tipe_jawaban tidak valid: "${tipe_jawaban}"`;
    } else if (tipe_jawaban === "teks") {
      if (!opsi_a.trim() || !opsi_b.trim() || !opsi_c.trim() || !opsi_d.trim()) {
        valid = false;
        error = "Opsi A–D harus diisi untuk tipe teks";
      } else if (!["A", "B", "C", "D"].includes(jawaban_benar)) {
        valid = false;
        error = `jawaban_benar harus A/B/C/D (diterima: "${jawaban_benar}")`;
      }
    }

    rows.push({ rowIndex: i, nomor, teks_soal, tipe_jawaban, opsi_a, opsi_b, opsi_c, opsi_d, jawaban_benar, valid, error });
  }

  return { rows };
}

// ─── Template download ────────────────────────────────────────────────────────

const TEMPLATE_HEADER = "nomor,teks_soal,tipe_jawaban,opsi_a,opsi_b,opsi_c,opsi_d,jawaban_benar";
const TEMPLATE_EXAMPLE_ROWS = [
  '1,Berapa hasil 2+2?,teks,3,4,5,6,B',
  '2,"Pecahkan: a^2 + 2a + 1 = 0 where a in [1..5]",numerik,,,,, ',
];
const TEMPLATE_CSV = [TEMPLATE_HEADER, ...TEMPLATE_EXAMPLE_ROWS].join("\r\n");

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "template_soal.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Tab: Unduh Template ──────────────────────────────────────────────────────

function TemplateTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700">
        Download template CSV untuk mengisi data soal. Isi setiap baris sesuai format berikut:
      </p>

      <div className="bg-gray-50 border border-gray-200 rounded-md p-3 overflow-x-auto">
        <table className="text-xs font-mono w-full" role="table">
          <thead>
            <tr className="border-b border-gray-200">
              {REQUIRED_COLUMNS.map((col) => (
                <th key={col} className="px-2 py-1 text-left font-semibold text-gray-700">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="px-2 py-1 text-gray-500">1</td>
              <td className="px-2 py-1 text-gray-500">Berapa hasil 2+2?</td>
              <td className="px-2 py-1 text-gray-500">teks</td>
              <td className="px-2 py-1 text-gray-500">3</td>
              <td className="px-2 py-1 text-gray-500">4</td>
              <td className="px-2 py-1 text-gray-500">5</td>
              <td className="px-2 py-1 text-gray-500">6</td>
              <td className="px-2 py-1 text-gray-500">B</td>
            </tr>
            <tr>
              <td className="px-2 py-1 text-gray-500">2</td>
              <td className="px-2 py-1 text-gray-500 italic">template numerik...</td>
              <td className="px-2 py-1 text-gray-500">numerik</td>
              <td className="px-2 py-1 text-gray-400">(kosong)</td>
              <td className="px-2 py-1 text-gray-400">(kosong)</td>
              <td className="px-2 py-1 text-gray-400">(kosong)</td>
              <td className="px-2 py-1 text-gray-400">(kosong)</td>
              <td className="px-2 py-1 text-gray-400">(kosong)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <ul className="text-xs text-gray-500 space-y-1 list-disc pl-4">
        <li>
          <strong>tipe_jawaban</strong>: gunakan <code className="bg-gray-100 px-1 rounded">teks</code> atau{" "}
          <code className="bg-gray-100 px-1 rounded">numerik</code>
        </li>
        <li>
          Untuk tipe <code className="bg-gray-100 px-1 rounded">teks</code>: isi semua opsi A–D dan kolom{" "}
          <code className="bg-gray-100 px-1 rounded">jawaban_benar</code> dengan A, B, C, atau D
        </li>
        <li>
          Untuk tipe <code className="bg-gray-100 px-1 rounded">numerik</code>: kolom opsi dan jawaban_benar boleh kosong — varian di-generate otomatis dari template
        </li>
      </ul>

      <button
        type="button"
        onClick={downloadTemplate}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors min-h-[44px]"
      >
        <span aria-hidden="true">⬇</span> Download Template CSV
      </button>
    </div>
  );
}

// ─── Tab: Upload CSV ──────────────────────────────────────────────────────────

function UploadTab({
  testId,
  onSuccess,
}: {
  testId: string;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: { row: number; message: string }[] } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFileError(null);
    setParseResult(null);
    setImportResult(null);
    setImportError(null);

    if (!selected.name.endsWith(".csv") && selected.type !== "text/csv" && selected.type !== "application/vnd.ms-excel") {
      setFileError("Hanya file .csv yang didukung.");
      return;
    }

    if (selected.size > 2 * 1024 * 1024) {
      setFileError("Ukuran file maksimal 2 MB.");
      return;
    }

    setFile(selected);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = parseCsvForPreview(text);
      setParseResult(result);
    };
    reader.onerror = () => setFileError("Gagal membaca file.");
    reader.readAsText(selected, "UTF-8");
  }

  async function handleImport() {
    if (!file) return;

    setImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/tests/${testId}/questions/csv`, {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (!result.success) {
        setImportError(result.error?.message ?? "Import gagal.");
        return;
      }

      setImportResult(result.data);
      onSuccess();
    } catch {
      setImportError("Terjadi kesalahan jaringan. Coba lagi.");
    } finally {
      setImporting(false);
    }
  }

  const validRows = parseResult?.rows.filter((r) => r.valid) ?? [];
  const invalidRows = parseResult?.rows.filter((r) => !r.valid) ?? [];
  const canImport = !importing && validRows.length > 0 && !importResult;

  return (
    <div className="space-y-4">
      {/* File input */}
      <div>
        <label
          htmlFor="csv-file-input"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Pilih file CSV{" "}
          <span aria-hidden="true" className="text-red-500">*</span>
        </label>
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            id="csv-file-input"
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="block text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            aria-describedby="file-hint"
          />
        </div>
        <p id="file-hint" className="text-xs text-gray-400 mt-1">
          Format: CSV, maksimal 2 MB
        </p>
        {fileError && (
          <p role="alert" className="text-xs text-red-600 mt-1">
            {fileError}
          </p>
        )}
      </div>

      {/* Header error */}
      {parseResult?.headerError && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
          <p className="font-medium">Format CSV tidak valid:</p>
          <p className="mt-0.5">{parseResult.headerError}</p>
        </div>
      )}

      {/* Preview table */}
      {parseResult && !parseResult.headerError && parseResult.rows.length > 0 && (
        <div className="space-y-2">
          {/* Summary badges */}
          <div className="flex gap-3 text-sm">
            <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full font-medium">
              ✓ {validRows.length} baris valid
            </span>
            {invalidRows.length > 0 && (
              <span className="bg-red-50 text-red-700 px-3 py-1 rounded-full font-medium">
                ✗ {invalidRows.length} baris error
              </span>
            )}
          </div>

          {/* Preview rows (max 10) */}
          <div className="border border-gray-200 rounded-md overflow-x-auto">
            <table className="w-full text-xs" role="table">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-2 py-2 text-left font-medium text-gray-600" scope="col">#</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600" scope="col">No</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600 max-w-[200px]" scope="col">Teks Soal</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600" scope="col">Tipe</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600" scope="col">Jawaban</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600" scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {parseResult.rows.slice(0, 10).map((row) => (
                  <tr
                    key={row.rowIndex}
                    className={`border-b border-gray-100 ${!row.valid ? "bg-red-50" : ""}`}
                  >
                    <td className="px-2 py-1.5 text-gray-400">{row.rowIndex}</td>
                    <td className="px-2 py-1.5 text-gray-700">{row.nomor}</td>
                    <td className="px-2 py-1.5 text-gray-700 max-w-[200px] truncate" title={row.teks_soal}>
                      {row.teks_soal || <span className="text-gray-400 italic">(kosong)</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          row.tipe_jawaban === "teks"
                            ? "bg-purple-50 text-purple-700"
                            : row.tipe_jawaban === "numerik"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {row.tipe_jawaban || "?"}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-gray-700 font-mono">
                      {row.tipe_jawaban === "teks" ? row.jawaban_benar : "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      {row.valid ? (
                        <span className="text-green-600 font-medium">✓</span>
                      ) : (
                        <span className="text-red-600 text-xs" title={row.error}>
                          ✗ {row.error}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {parseResult.rows.length > 10 && (
            <p className="text-xs text-gray-400">
              ...dan {parseResult.rows.length - 10} baris lainnya tidak ditampilkan
            </p>
          )}

          {/* Invalid rows detail */}
          {invalidRows.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-xs text-yellow-800">
              <p className="font-medium mb-1">Baris dengan error akan dilewati saat import:</p>
              <ul className="list-disc pl-3 space-y-0.5">
                {invalidRows.slice(0, 5).map((row) => (
                  <li key={row.rowIndex}>
                    Baris {row.rowIndex} (No. {row.nomor || "?"}): {row.error}
                  </li>
                ))}
                {invalidRows.length > 5 && (
                  <li>...dan {invalidRows.length - 5} baris lainnya</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <p className="font-semibold text-green-800">✅ Import Berhasil!</p>
          <p className="text-sm text-green-700 mt-1">
            <strong>{importResult.created}</strong> soal berhasil diimpor.
          </p>
          {importResult.errors.length > 0 && (
            <p className="text-xs text-yellow-700 mt-1">
              {importResult.errors.length} baris dilewati karena error.
            </p>
          )}
        </div>
      )}

      {/* Import error */}
      {importError && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
          <p className="font-medium">Import gagal:</p>
          <p className="mt-0.5">{importError}</p>
        </div>
      )}

      {/* Confirm button */}
      {parseResult && !parseResult.headerError && !importResult && (
        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={handleImport}
            disabled={!canImport}
            aria-disabled={!canImport}
            className="inline-flex items-center gap-2 px-5 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
          >
            {importing ? (
              <>
                <span aria-hidden="true" className="animate-spin">⟳</span>
                Mengimpor...
              </>
            ) : (
              <>
                <span aria-hidden="true">✓</span>
                Konfirmasi Import ({validRows.length} soal)
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

export default function ImportQuestionsDialog({ testId, onSuccess, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("template");

  function handleSuccess() {
    onSuccess();
  }

  function handleClose() {
    onClose?.();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        aria-hidden="true"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-questions-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h2
                id="import-questions-title"
                className="text-lg font-semibold text-gray-900"
              >
                Import Soal dari CSV
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Impor beberapa soal sekaligus menggunakan file CSV
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 p-1 rounded min-h-[36px] min-w-[36px] flex items-center justify-center"
              aria-label="Tutup dialog"
            >
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 px-6">
            <button
              type="button"
              onClick={() => setActiveTab("template")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === "template"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
              aria-selected={activeTab === "template"}
              role="tab"
            >
              Unduh Template
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === "upload"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
              aria-selected={activeTab === "upload"}
              role="tab"
            >
              Upload CSV
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {activeTab === "template" && <TemplateTab />}
            {activeTab === "upload" && (
              <UploadTab testId={testId} onSuccess={handleSuccess} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
