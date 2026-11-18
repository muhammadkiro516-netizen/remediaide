'use client';

/**
 * AutoWipeDialog — Two-step confirmation dialog for Auto-Wipe.
 *
 * Step 1: Shows a preview (how many records will be deleted),
 *         asks teacher to type "HAPUS DATA RESPONS" to proceed.
 * Step 2: Final confirmation modal before executing the irreversible wipe.
 *
 * Calls:
 *   POST /api/sessions/:id/wipe/preview  → preview count
 *   POST /api/sessions/:id/wipe/confirm  → execute wipe
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7
 */

import React, { useState, useCallback } from 'react';

const REQUIRED_TEXT = 'HAPUS DATA RESPONS';

interface AutoWipeDialogProps {
  sessionId: string;
  onWipeComplete?: (recordsDeleted: number) => void;
}

type DialogStep = 'closed' | 'preview-loading' | 'step1' | 'step2' | 'wiping' | 'done' | 'error';

interface PreviewData {
  responseCount: number;
  studentCount: number;
  sessionTopic: string;
}

export function AutoWipeDialog({ sessionId, onWipeComplete }: AutoWipeDialogProps) {
  const [step, setStep] = useState<DialogStep>('closed');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [wipedCount, setWipedCount] = useState<number>(0);

  // ── Open: load preview ─────────────────────────────────────────────────────
  const handleOpen = useCallback(async () => {
    setStep('preview-loading');
    setErrorMessage(null);
    setConfirmText('');
    setPreview(null);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/wipe/preview`, {
        method: 'POST',
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: PreviewData;
        error?: { message: string };
      };
      if (json.success && json.data) {
        setPreview(json.data);
        setStep('step1');
      } else {
        setErrorMessage(json.error?.message ?? 'Gagal memuat pratinjau.');
        setStep('error');
      }
    } catch {
      setErrorMessage('Terjadi kesalahan jaringan.');
      setStep('error');
    }
  }, [sessionId]);

  // ── Step 1 → Step 2 ────────────────────────────────────────────────────────
  const handleProceedToStep2 = useCallback(() => {
    if (confirmText !== REQUIRED_TEXT) return;
    setStep('step2');
  }, [confirmText]);

  // ── Execute wipe ───────────────────────────────────────────────────────────
  const handleConfirmWipe = useCallback(async () => {
    setStep('wiping');
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/wipe/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationText: REQUIRED_TEXT }),
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { recordsDeleted: number; message: string };
        error?: { message: string };
      };

      if (json.success && json.data) {
        setWipedCount(json.data.recordsDeleted);
        setStep('done');
        onWipeComplete?.(json.data.recordsDeleted);
      } else {
        setErrorMessage(json.error?.message ?? 'Wipe gagal. Tidak ada data yang dihapus.');
        setStep('error');
      }
    } catch {
      setErrorMessage('Terjadi kesalahan jaringan. Tidak ada data yang dihapus.');
      setStep('error');
    }
  }, [sessionId, onWipeComplete]);

  // ── Close ──────────────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    setStep('closed');
    setConfirmText('');
    setErrorMessage(null);
    setPreview(null);
  }, []);

  const isConfirmTextCorrect = confirmText === REQUIRED_TEXT;

  // ── Render: trigger button always visible ─────────────────────────────────
  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        disabled={step === 'preview-loading' || step === 'wiping'}
        className="min-h-[48px] px-4 py-2 rounded-lg border-2 border-red-600 text-red-600 font-semibold text-sm hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Konfirmasi remediasi selesai dan hapus data respons"
      >
        {step === 'preview-loading' ? 'Memuat...' : '🗑 Konfirmasi Remediasi Selesai'}
      </button>

      {/* Modal overlay */}
      {step !== 'closed' && step !== 'preview-loading' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wipe-dialog-title"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">

            {/* ── STEP 1: Preview + type confirmation ─────────────────────── */}
            {step === 'step1' && preview && (
              <div className="p-6 space-y-5">
                <div className="flex items-start gap-3">
                  <span className="text-3xl flex-shrink-0" aria-hidden="true">⚠️</span>
                  <div>
                    <h2 id="wipe-dialog-title" className="text-lg font-bold text-gray-900">
                      Konfirmasi Remediasi Selesai
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Tindakan ini <strong>tidak dapat dibatalkan</strong>.
                    </p>
                  </div>
                </div>

                {/* What will be deleted */}
                <div className="rounded-xl bg-red-50 border border-red-200 p-4 space-y-1 text-sm">
                  <p className="font-semibold text-red-800">Data yang akan dihapus permanen:</p>
                  <ul className="list-disc list-inside text-red-700 space-y-0.5 mt-2">
                    <li><strong>{preview.responseCount}</strong> baris data respons mentah</li>
                    <li>Dari <strong>{preview.studentCount}</strong> siswa</li>
                    <li>Sesi: <strong>{preview.sessionTopic}</strong></li>
                  </ul>
                </div>

                {/* What is preserved */}
                <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-sm">
                  <p className="font-semibold text-green-800">Yang tetap tersimpan:</p>
                  <ul className="list-disc list-inside text-green-700 mt-2 space-y-0.5">
                    <li>Label anonim siswa (Siswa_01, dst.)</li>
                    <li>Status kognitif final (ConceptDiagnosis)</li>
                    <li>Kelompok remedial dan preskripsi</li>
                    <li>Log audit penghapusan ini</li>
                  </ul>
                </div>

                {/* Confirmation text input */}
                <div className="space-y-2">
                  <label htmlFor="confirm-text" className="block text-sm font-medium text-gray-700">
                    Ketik <code className="bg-gray-100 px-1 rounded text-red-700 font-mono">{REQUIRED_TEXT}</code> untuk melanjutkan:
                  </label>
                  <input
                    id="confirm-text"
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={REQUIRED_TEXT}
                    className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 font-mono text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors min-h-[44px]"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleProceedToStep2}
                    disabled={!isConfirmTextCorrect}
                    className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
                  >
                    Lanjutkan →
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 2: Final confirmation ──────────────────────────────── */}
            {step === 'step2' && (
              <div className="p-6 space-y-5">
                <div className="text-center">
                  <span className="text-5xl" aria-hidden="true">🗑️</span>
                  <h2 id="wipe-dialog-title" className="text-lg font-bold text-gray-900 mt-3">
                    Konfirmasi Akhir
                  </h2>
                  <p className="text-sm text-gray-600 mt-2">
                    Apakah Anda benar-benar yakin? Seluruh{' '}
                    <strong>{preview?.responseCount ?? 0} baris data respons</strong>{' '}
                    akan dihapus secara permanen dari database.
                  </p>
                </div>
                <div className="flex gap-3 justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('step1')}
                    className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 min-h-[44px]"
                  >
                    ← Kembali
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmWipe}
                    className="px-5 py-2 rounded-lg bg-red-700 text-white text-sm font-bold hover:bg-red-800 transition-colors min-h-[44px]"
                  >
                    Ya, Hapus Sekarang
                  </button>
                </div>
              </div>
            )}

            {/* ── WIPING ─────────────────────────────────────────────────── */}
            {step === 'wiping' && (
              <div className="p-8 text-center space-y-4">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
                <p className="text-sm font-medium text-gray-700">Menghapus data respons...</p>
              </div>
            )}

            {/* ── DONE ───────────────────────────────────────────────────── */}
            {step === 'done' && (
              <div className="p-6 space-y-4 text-center">
                <span className="text-5xl" aria-hidden="true">✅</span>
                <h2 id="wipe-dialog-title" className="text-lg font-bold text-gray-900">
                  Penghapusan Berhasil
                </h2>
                <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-sm text-green-800">
                  <p>
                    <strong>{wipedCount}</strong> baris data respons telah dihapus secara permanen.
                  </p>
                  <p className="mt-1 text-green-700">
                    Status ketuntasan konsep tetap tersimpan untuk pelaporan sekolah.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="mt-2 px-6 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800 min-h-[44px]"
                >
                  Tutup
                </button>
              </div>
            )}

            {/* ── ERROR ─────────────────────────────────────────────────── */}
            {step === 'error' && (
              <div className="p-6 space-y-4 text-center">
                <span className="text-5xl" aria-hidden="true">❌</span>
                <h2 id="wipe-dialog-title" className="text-lg font-bold text-gray-900">
                  Terjadi Kesalahan
                </h2>
                <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3">
                  {errorMessage}
                </p>
                <p className="text-sm text-gray-500">
                  Tidak ada data yang dihapus. Coba lagi.
                </p>
                <div className="flex gap-3 justify-center">
                  <button type="button" onClick={handleClose}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm min-h-[44px]">
                    Tutup
                  </button>
                  <button type="button" onClick={handleOpen}
                    className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold min-h-[44px]">
                    Coba Lagi
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </>
  );
}

export default AutoWipeDialog;
