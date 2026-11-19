"use client";

/**
 * Student Quiz Page — Displays one question at a time with CRI slider.
 *
 * Features:
 *  - Fetches quiz from GET /api/sessions/[sessionId]/quiz
 *  - Shows ONE question at a time with answer options + MetacognitiveSlider
 *  - "Lanjut" button disabled until both answer AND CRI are selected
 *  - Timer starts when question renders, responseTimeMs calculated on submit
 *  - Submits to POST /api/responses
 *  - Saves progress to sessionStorage (currentQuestionIndex + submitted items)
 *  - Restores progress on page load (skips already-answered questions)
 *  - On last question: redirects to /student/quiz/[sessionId]/complete
 *  - Retry with exponential backoff on API error
 *
 * WCAG 2.1 AA:
 *  - All interactive elements have 48px minimum touch targets
 *  - Contrast ratios meet 4.5:1 minimum
 *  - Progress announced via aria-live
 */

import { useRouter, useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import MetacognitiveSlider from "@/components/student/MetacognitiveSlider";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RenderedOption {
  key: string;
  text: string;
}

interface QuizItem {
  itemVariantId: string;   // mapped from variantId in API response
  renderedText: string;
  renderedOptions: RenderedOption[];  // mapped from options in API response
  tauMinSeconds: number;
  requireExplanation: boolean;  // RemediAide 2.0: ask for a one-sentence reason
}

interface QuizData {
  sessionId: string;
  items: QuizItem[];
  topic: string;
  startedAt: string | null;       // ISO timestamp from API
  durationSeconds: number | null; // from API
}

interface QuizProgress {
  sessionId: string;
  currentQuestionIndex: number;
  completedItems: Array<{ itemVariantId: string; submitted: true }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RETRY_DELAYS = [1000, 2000, 4000, 8000]; // exponential backoff

// ─── Session storage helpers ──────────────────────────────────────────────────

function saveProgress(progress: QuizProgress): void {
  try {
    sessionStorage.setItem(
      `quiz_progress_${progress.sessionId}`,
      JSON.stringify(progress)
    );
  } catch {
    // sessionStorage unavailable (e.g., private browsing quota)
  }
}

function loadProgress(sessionId: string): QuizProgress | null {
  try {
    const raw = sessionStorage.getItem(`quiz_progress_${sessionId}`);
    if (!raw) return null;
    return JSON.parse(raw) as QuizProgress;
  } catch {
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StudentQuizPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params?.sessionId as string;

  // Keep a stable ref to router so fetchQuiz (which only runs on sessionId change)
  // always has the latest router without needing it as a useEffect dependency.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });

  // Quiz data state
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Question state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [criValue, setCriValue] = useState(0);
  const [criTouched, setCriTouched] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [startedAt, setStartedAt] = useState<number>(Date.now());
  const [animating, setAnimating] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [retryCountdown, setRetryCountdown] = useState(0);

  // Session deadline state
  const [timeExpired, setTimeExpired] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  // Session deadline computed from quiz data
  const sessionDeadlineMs = quiz?.startedAt && quiz?.durationSeconds
    ? new Date(quiz.startedAt).getTime() + quiz.durationSeconds * 1000
    : null;

  // ── Fetch quiz data ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) return;

    // router is intentionally excluded from deps — fetchQuiz only needs to run
    // when sessionId changes. Including router caused re-fetches (and loading=true
    // flickers) whenever router's reference changed after client-side navigation,
    // which reset the quiz page state and made soal ke-2+ appear unresponsive.
    // routerRef.current is used instead to always access the latest router.

    const fetchQuiz = async () => {
      setLoading(true);
      setFetchError(null);

      try {
        const res = await fetch(`/api/sessions/${sessionId}/quiz`, {
          cache: "no-store",
        });

        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(
            json?.error?.message ?? `Gagal memuat soal (${res.status})`
          );
        }

        const json = await res.json();
        // API returns { sessionId, topic, durationSeconds, items }
        // Each item has: variantId, renderedText, options, tauMinSeconds
        // Normalize to the shape this page expects (itemVariantId, renderedOptions)
        const raw = json.data ?? json;
        const quizData: QuizData = {
          sessionId: raw.sessionId,
          topic: raw.topic,
          startedAt: (raw.startedAt as string | null) ?? null,
          durationSeconds: (raw.durationSeconds as number | null) ?? null,
          items: (raw.items as Array<{
            variantId: string | null;
            renderedText: string;
            options: RenderedOption[];
            tauMinSeconds: number;
            requireExplanation?: boolean;
          }>)
            .filter((item) => item.variantId !== null && item.options.length > 0)
            .map((item) => ({
              itemVariantId: item.variantId as string,
              renderedText: item.renderedText,
              renderedOptions: item.options,
              tauMinSeconds: item.tauMinSeconds,
              requireExplanation: item.requireExplanation === true,
            })),
        };
        setQuiz(quizData);

        // Restore progress
        const saved = loadProgress(sessionId);
        if (saved && saved.sessionId === sessionId) {
          const nextUnanswered = saved.completedItems.length;
          if (nextUnanswered < quizData.items.length) {
            setCurrentIndex(nextUnanswered);
          } else {
            // All done — redirect to complete
            routerRef.current.replace(`/student/quiz/${sessionId}/complete`);
            return;
          }
        }
      } catch (err) {
        console.error("Quiz fetch error:", err);
        setFetchError(err instanceof Error ? err.message : "Gagal memuat soal. Coba muat ulang halaman.");
      } finally {
        setLoading(false);
      }
    };

    fetchQuiz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Reset answer state when question changes ─────────────────────────────

  useEffect(() => {
    setSelectedOption(null);
    setCriValue(0);
    setCriTouched(false);
    setExplanation("");
    setSubmitError(null);
    setRetryCount(0);
    setRetryCountdown(0);
    setStartedAt(Date.now());
  }, [currentIndex]);

  // ── Retry countdown ──────────────────────────────────────────────────────

  useEffect(() => {
    if (retryCountdown <= 0) return;
    const timer = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [retryCountdown]);

  // ── Session deadline countdown ───────────────────────────────────────────

  useEffect(() => {
    if (!sessionDeadlineMs) return;

    // Check immediately on mount (handles page load after deadline)
    const initialRemaining = Math.ceil((sessionDeadlineMs - Date.now()) / 1000);
    if (initialRemaining <= 0) {
      setTimeExpired(true);
      setRemainingSeconds(0);
      return;
    }

    setRemainingSeconds(initialRemaining);

    const interval = setInterval(() => {
      const remaining = Math.ceil((sessionDeadlineMs - Date.now()) / 1000);
      if (remaining <= 0) {
        setTimeExpired(true);
        setRemainingSeconds(0);
        clearInterval(interval);
      } else {
        setRemainingSeconds(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionDeadlineMs]);

  // ── Submit response ──────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!quiz || !selectedOption || !criTouched || isSubmitting) return;

    const item = quiz.items[currentIndex];
    if (!item) return;

    const responseTimeMs = Date.now() - startedAt;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          itemVariantId: item.itemVariantId,
          chosenOptionKey: selectedOption,
          criValue,
          responseTimeMs,
          ...(item.requireExplanation && explanation.trim() ? { explanation: explanation.trim() } : {}),
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        const message = json?.error?.message ?? `Gagal mengirim jawaban (${res.status})`;
        throw new Error(message);
      }

      // Save progress
      const existing = loadProgress(sessionId);
      const completedItems = [
        ...(existing?.completedItems ?? []),
        { itemVariantId: item.itemVariantId, submitted: true as const },
      ];
      saveProgress({
        sessionId,
        currentQuestionIndex: currentIndex + 1,
        completedItems,
      });

      // Advance or complete with animation
      const nextIndex = currentIndex + 1;
      if (nextIndex >= quiz.items.length) {
        // Last question: push to complete page.
        // isSubmitting will be reset by finally before/after push.
        router.push(`/student/quiz/${sessionId}/complete`);
      } else {
        // Non-last question: start slide animation.
        // animating=true keeps canSubmit false during the 250ms transition.
        // setIsSubmitting(false) runs in finally (after setTimeout is scheduled).
        // setAnimating(false) is called inside the setTimeout callback.
        setAnimating(true);
        setTimeout(() => {
          setCurrentIndex(nextIndex);
          setAnimating(false);
        }, 250);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Terjadi kesalahan.";
      setSubmitError(message);

      // Exponential backoff retry
      const delay = RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)];
      const countdownSec = Math.ceil(delay / 1000);
      setRetryCountdown(countdownSec);
      setRetryCount((c) => c + 1);
      // Note: setIsSubmitting(false) is intentionally removed from here;
      // the finally block below guarantees it runs for ALL execution paths.
    } finally {
      // Always reset isSubmitting regardless of success, error, or unexpected throw.
      // For the non-last-question path, animating=true still prevents premature
      // canSubmit re-enable during the slide animation (animating resets in setTimeout).
      setIsSubmitting(false);
    }
  }, [
    quiz,
    selectedOption,
    criTouched,
    criValue,
    explanation,
    currentIndex,
    isSubmitting,
    retryCount,
    router,
    sessionId,
    startedAt,
  ]);

  // ── Render states ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-base text-gray-600">Memuat soal...</p>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-2xl text-center">
          <div className="mb-4 text-5xl" aria-hidden="true">⚠️</div>
          <h1 className="mb-2 text-xl font-bold text-gray-900">Gagal Memuat Soal</h1>
          <p className="mb-6 text-base text-red-700">{fetchError}</p>
          <button
            onClick={() => window.location.reload()}
            className="min-h-[48px] w-full rounded-lg bg-blue-600 px-6 text-[18px] font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300"
          >
            Muat Ulang
          </button>
        </div>
      </div>
    );
  }

  if (!quiz || quiz.items.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-2xl text-center">
          <p className="text-base text-gray-600">Tidak ada soal yang tersedia.</p>
        </div>
      </div>
    );
  }

  const item = quiz.items[currentIndex];
  const total = quiz.items.length;
  const current = currentIndex + 1;
  const canSubmit = selectedOption !== null && criTouched && !isSubmitting && retryCountdown === 0 && !animating && !timeExpired;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header with progress */}
      <header className="sticky top-0 z-10 bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 shadow-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <span className="text-base font-bold text-white tracking-tight">RemediAide</span>
          <div
            className="text-right text-sm font-medium text-blue-100"
            aria-live="polite"
            aria-label={`Soal ${current} dari ${total}`}
          >
            <span className="text-white font-bold text-base">{current}</span>
            <span className="text-blue-200"> / {total}</span>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mx-auto mt-2.5 max-w-2xl">
          <div className="h-1.5 w-full rounded-full bg-blue-500/50" role="progressbar" aria-valuenow={current} aria-valuemin={1} aria-valuemax={total}>
            <div
              className="h-1.5 rounded-full bg-white shadow-sm transition-all duration-700 ease-out"
              style={{ width: `${(current / total) * 100}%` }}
            />
          </div>
        </div>
      </header>

      <main
        className={cn(
          "mx-auto max-w-2xl px-4 py-6 pb-32 transition-all duration-200",
          animating ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
        )}
      >
        {/* Topic label */}
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-blue-600">
          {quiz.topic}
        </p>

        {/* Session countdown timer */}
        {sessionDeadlineMs && !timeExpired && remainingSeconds !== null && (
          <div className="mb-3 flex items-center justify-end gap-1.5 text-sm font-semibold text-slate-600">
            <span aria-hidden="true">⏱</span>
            <span aria-live="polite" aria-label={`Sisa waktu ${Math.floor(remainingSeconds / 60)} menit ${remainingSeconds % 60} detik`}>
              {`Sisa waktu: ${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`}
            </span>
          </div>
        )}

        {/* Waktu Habis banner */}
        {timeExpired && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-4 rounded-lg border-2 border-red-400 bg-red-50 px-4 py-3 text-center font-bold text-red-700"
          >
            ⏰ Waktu sesi telah habis. Jawaban tidak dapat dikirim.
          </div>
        )}

        {/* Question */}
        <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900 leading-relaxed">
            {item.renderedText}
          </h2>
        </div>

        {/* Answer options */}
        <fieldset className="mb-6 space-y-2.5" aria-label="Pilihan jawaban">
          <legend className="mb-3 text-sm font-semibold text-slate-600">
            Pilih jawaban yang benar:
          </legend>
          {item.renderedOptions.map((option) => {
            const isSelected = selectedOption === option.key;
            return (
              <label
                key={option.key}
                className={cn(
                  "flex min-h-[52px] cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 transition-all duration-150",
                  "focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2",
                  isSelected
                    ? "border-blue-500 bg-blue-50 shadow-sm shadow-blue-100"
                    : "border-slate-200 bg-white text-slate-900 hover:border-blue-300 hover:bg-blue-50/40"
                )}
              >
                <input
                  type="radio"
                  name="quizAnswer"
                  value={option.key}
                  checked={isSelected}
                  onChange={() => setSelectedOption(option.key)}
                  className="sr-only"
                  aria-label={`Opsi ${option.key}: ${option.text}`}
                />
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border-2 font-bold text-sm transition-all duration-150",
                    isSelected
                      ? "border-blue-500 bg-blue-500 text-white scale-110"
                      : "border-slate-300 text-slate-500"
                  )}
                  aria-hidden="true"
                >
                  {option.key}
                </span>
                <span className={cn("text-base leading-snug", isSelected ? "text-blue-900 font-medium" : "text-slate-800")}>
                  {option.text}
                </span>
              </label>
            );
          })}
        </fieldset>

        {/* CRI Slider */}
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm border border-slate-100">
          <h3 className="mb-1 text-sm font-semibold text-slate-700">
            Seberapa yakin kamu dengan jawabanmu?
          </h3>
          <p className="mb-4 text-xs text-slate-400">
            Geser slider atau tekan angka 0–5 sesuai tingkat keyakinanmu.
          </p>
          <MetacognitiveSlider
            key={currentIndex}
            value={criValue}
            onChange={setCriValue}
            onTouch={() => setCriTouched(true)}
            disabled={isSubmitting}
          />
        </div>

        {/* RemediAide 2.0: optional one-sentence explanation on key questions */}
        {item.requireExplanation && (
          <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm border border-slate-100">
            <label htmlFor="explanation" className="mb-1 block text-sm font-semibold text-slate-700">
              Tulis alasanmu dalam satu kalimat
            </label>
            <p className="mb-3 text-xs text-slate-400">Boleh dikosongkan. Maksimal 280 karakter.</p>
            <textarea
              id="explanation"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value.slice(0, 280))}
              maxLength={280}
              rows={2}
              disabled={isSubmitting}
              className="w-full rounded-xl border border-slate-200 p-3 text-base text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Contoh: karena 6,2 punya nilai persepuluhan lebih besar"
            />
            <p className="mt-1 text-right text-xs text-slate-400" aria-live="polite">{explanation.length}/280</p>
          </div>
        )}

        {/* Instruction when not all filled */}
        {(!selectedOption || !criTouched) && (
          <p className="mb-4 text-center text-sm text-gray-500" aria-live="polite">
            {!selectedOption && !criTouched
              ? "Pilih jawaban dan tingkat keyakinan untuk melanjutkan"
              : !selectedOption
              ? "Pilih jawaban terlebih dahulu"
              : "Pilih tingkat keyakinan kamu"}
          </p>
        )}

        {/* Submit error */}
        {submitError && (
          <div
            role="alert"
            aria-live="polite"
            className="mb-4 rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
          >
            {submitError}
            {retryCountdown > 0 && (
              <span className="ml-2 font-bold">
                (coba lagi dalam {retryCountdown} detik)
              </span>
            )}
          </div>
        )}
      </main>

      {/* Fixed bottom submit button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md px-4 py-4 shadow-2xl border-t border-slate-200">
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "flex min-h-[52px] w-full items-center justify-center rounded-2xl px-6 text-[18px] font-bold text-white shadow-lg transition-all duration-200",
              "focus:outline-none focus:ring-4 focus:ring-blue-300",
              canSubmit
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-200 active:scale-[0.98]"
                : "cursor-not-allowed bg-slate-300"
            )}
            aria-disabled={!canSubmit}
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Mengirim jawaban...</span>
              </div>
            ) : animating ? (
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Memuat soal...</span>
              </div>
            ) : retryCountdown > 0 ? (
              `Coba lagi (${retryCountdown}s)`
            ) : current < total ? (
              <span className="flex items-center gap-2">Lanjut <span aria-hidden="true">→</span></span>
            ) : (
              <span className="flex items-center gap-2">Selesai <span aria-hidden="true">✓</span></span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
