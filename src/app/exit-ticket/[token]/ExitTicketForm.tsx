/**
 * ExitTicketForm — Interactive student reflection form
 *
 * Allows students to:
 *  1. Write a reflection response to a category-specific question
 *  2. Select their confidence level (CRI scale 0–5)
 *  3. Submit the form via POST /api/exit-ticket/[token]/submit
 *
 * Handles all states: idle, submitting, success, already-used, and error.
 */

'use client';

import { useState } from 'react';
import {
  CATEGORY_THEMES,
  CONFIDENCE_LABELS,
  type CognitiveGroupType,
} from '@/lib/exit-ticket/theme';
import ConfirmationPage from './ConfirmationPage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ValidationErrors {
  reflectionText?: string;
  confidenceScore?: string;
}

interface ExitTicketFormProps {
  token: string;
  topicName: string;
  cognitiveCategory: CognitiveGroupType;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExitTicketForm({
  token,
  topicName,
  cognitiveCategory,
}: ExitTicketFormProps) {
  const theme = CATEGORY_THEMES[cognitiveCategory] ?? CATEGORY_THEMES['INSUFFICIENT_DATA'];

  // ── State ──────────────────────────────────────────────────────────────
  const [reflectionText, setReflectionText] = useState('');
  const [confidenceScore, setConfidenceScore] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isAlreadySubmitted, setIsAlreadySubmitted] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  // ── Derived state ───────────────────────────────────────────────────────
  const confidenceScoreLabels = Object.entries(CONFIDENCE_LABELS) as [string, string][];

  // ── Handlers ────────────────────────────────────────────────────────────

  function validate(): ValidationErrors {
    const errors: ValidationErrors = {};
    if (reflectionText.trim().length === 0) {
      errors.reflectionText = 'Jawaban tidak boleh kosong';
    }
    if (confidenceScore === null) {
      errors.confidenceScore = 'Pilih dulu tingkat keyakinanmu';
    }
    return errors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Client-side validation
    const errors = validate();
    setValidationErrors(errors);

    if (Object.keys(errors).length > 0) {
      return; // Never send request if validation fails
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/exit-ticket/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reflectionText: reflectionText.trim(),
          confidenceScore,
        }),
      });

      if (res.status === 200) {
        setIsSuccess(true);
        return;
      }

      if (res.status === 409) {
        setIsAlreadySubmitted(true);
        return;
      }

      // Any other status (4xx, 5xx) → show error and re-enable button
      setSubmitError('Terjadi kesalahan, coba lagi.');
    } catch {
      setSubmitError('Terjadi kesalahan, coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Success/already-submitted states ───────────────────────────────────

  if (isSuccess) {
    return <ConfirmationPage />;
  }

  if (isAlreadySubmitted) {
    return <ConfirmationPage alreadySubmitted />;
  }

  // ── Form render ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      {/* noscript fallback */}
      <noscript>
        <div className="max-w-md mx-auto px-4 mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
          Formulir ini memerlukan JavaScript. Aktifkan JavaScript di browser untuk mengisi refleksi.
        </div>
      </noscript>

      <div className="max-w-md mx-auto px-4">
        {/* Header */}
        <div className={`${theme.bgClass} rounded-t-xl px-6 py-5`}>
          <p className="text-white text-xs font-medium opacity-80 mb-1">Exit Ticket</p>
          <h1 className="text-white text-lg font-bold leading-tight">{topicName}</h1>
          <span className="inline-block mt-2 px-2 py-0.5 rounded-full bg-white/20 text-white text-xs font-medium">
            {theme.label}
          </span>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-b-xl shadow-sm px-6 py-6 space-y-6">
          <form onSubmit={handleSubmit} noValidate>

            {/* Reflection question */}
            <div className="space-y-3">
              <label
                htmlFor="reflection"
                className={`block text-sm font-semibold ${theme.headingClass}`}
              >
                {theme.reflectionQuestion}
              </label>
              <textarea
                id="reflection"
                name="reflectionText"
                value={reflectionText}
                onChange={(e) => {
                  setReflectionText(e.target.value);
                  if (validationErrors.reflectionText) {
                    setValidationErrors((prev) => ({ ...prev, reflectionText: undefined }));
                  }
                }}
                maxLength={1000}
                className="w-full text-base border border-gray-300 rounded-lg px-3 py-2 min-h-[120px] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Tulis jawabanmu di sini..."
                disabled={isSubmitting}
                aria-describedby={
                  validationErrors.reflectionText ? 'reflection-error' : undefined
                }
              />
              {validationErrors.reflectionText && (
                <p id="reflection-error" className="text-sm text-red-600" role="alert">
                  {validationErrors.reflectionText}
                </p>
              )}
              <p className="text-xs text-gray-400 text-right">
                {reflectionText.length}/1000
              </p>
            </div>

            {/* Confidence scale */}
            <div className="space-y-3 mt-6">
              <p className="text-sm font-semibold text-gray-800">
                Seberapa yakin kamu dengan jawabanmu?
              </p>
              <p className="text-xs text-gray-500">
                Pilih tingkat keyakinanmu (0 = menebak, 5 = sangat yakin)
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {confidenceScoreLabels.map(([value, label]) => {
                  const numValue = Number(value);
                  const isSelected = confidenceScore === numValue;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setConfidenceScore(numValue);
                        if (validationErrors.confidenceScore) {
                          setValidationErrors((prev) => ({ ...prev, confidenceScore: undefined }));
                        }
                      }}
                      disabled={isSubmitting}
                      aria-label={`Tingkat keyakinan ${numValue}: ${label}`}
                      aria-pressed={isSelected}
                      className={`min-h-[44px] flex flex-col items-center justify-center px-1 py-2 rounded-lg border-2 text-xs font-medium transition-colors ${
                        isSelected
                          ? `${theme.buttonClass} border-transparent text-white`
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <span className="text-base font-bold">{value}</span>
                      <span className="mt-0.5 text-center leading-tight">{label}</span>
                    </button>
                  );
                })}
              </div>
              {validationErrors.confidenceScore && (
                <p className="text-sm text-red-600" role="alert">
                  {validationErrors.confidenceScore}
                </p>
              )}
            </div>

            {/* Submit error */}
            {submitError && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200" role="alert">
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`mt-6 w-full min-h-[48px] rounded-lg ${theme.buttonClass} text-white font-semibold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {isSubmitting ? 'Mengirim...' : 'Kirim Refleksi'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
