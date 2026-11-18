"use client";

/**
 * MetacognitiveSlider — CRI (Certainty of Response Index) input
 *
 * An accessible, mobile-friendly slider for selecting a CRI value 0–5.
 *
 * Accessibility:
 *  - role="slider", aria-valuemin, aria-valuemax, aria-valuenow, aria-label
 *  - Keyboard: ArrowLeft / ArrowRight to decrement / increment value
 *  - Minimum 48px touch target height (WCAG AA)
 *
 * Behaviour:
 *  - Starts as "untouched" — parent can detect first interaction via onTouch callback
 *  - Each of the 6 discrete steps shows a coloured indicator when active
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// ─── CRI labels (0–5) ─────────────────────────────────────────────────────────

export const CRI_LABELS: readonly string[] = [
  "Menebak Sepenuhnya", // 0
  "Hampir Menebak",     // 1
  "Tidak Yakin",        // 2
  "Yakin",              // 3
  "Sangat Yakin",       // 4
  "Mutlak Yakin",       // 5
] as const;

// Colour accent per level — lower = cooler, higher = warmer/more confident
const LEVEL_COLORS: readonly string[] = [
  "bg-slate-400",  // 0 — guessing
  "bg-orange-400", // 1
  "bg-amber-400",  // 2
  "bg-lime-500",   // 3
  "bg-green-600",  // 4
  "bg-emerald-700",// 5 — absolutely certain
] as const;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MetacognitiveSliderProps {
  /** Current CRI value 0–5 */
  value: number;
  /** Called whenever the value changes */
  onChange: (value: number) => void;
  /**
   * Called the first time the user interacts with the slider.
   * Parent uses this to know the slider has been "touched".
   */
  onTouch?: () => void;
  /** Whether the slider is disabled (e.g., during submission) */
  disabled?: boolean;
  /** Extra className applied to the outermost container */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MetacognitiveSlider({
  value,
  onChange,
  onTouch,
  disabled = false,
  className,
}: MetacognitiveSliderProps) {
  const [touched, setTouched] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const clamp = (v: number) => Math.max(0, Math.min(5, v));

  const handleChange = useCallback(
    (newValue: number) => {
      if (disabled) return;
      const clamped = clamp(newValue);
      if (!touched) {
        setTouched(true);
        onTouch?.();
      }
      onChange(clamped);
    },
    [disabled, onChange, onTouch, touched]
  );

  // ── Keyboard navigation ──────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault();
        handleChange(value - 1);
      } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        e.preventDefault();
        handleChange(value + 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        handleChange(0);
      } else if (e.key === "End") {
        e.preventDefault();
        handleChange(5);
      }
    },
    [disabled, handleChange, value]
  );

  // ── Pointer / touch drag on track ────────────────────────────────────────

  const getValueFromPointer = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track) return value;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(ratio * 5);
    },
    [value]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      handleChange(getValueFromPointer(e.clientX));
    },
    [disabled, getValueFromPointer, handleChange]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.buttons === 0) return; // no button held
      handleChange(getValueFromPointer(e.clientX));
    },
    [disabled, getValueFromPointer, handleChange]
  );

  // ── Step button click ────────────────────────────────────────────────────

  const handleStepClick = useCallback(
    (stepValue: number) => {
      if (disabled) return;
      handleChange(stepValue);
    },
    [disabled, handleChange]
  );

  // ── Percentage fill for the track ────────────────────────────────────────
  const fillPercent = (value / 5) * 100;

  return (
    <div className={cn("w-full select-none", className)}>
      {/* Label */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          Tingkat keyakinan kamu:
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-sm font-semibold text-white transition-colors",
            LEVEL_COLORS[value]
          )}
          aria-live="polite"
        >
          {value} — {CRI_LABELS[value]}
        </span>
      </div>

      {/* Track + thumb — the focusable slider element */}
      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={value}
        aria-label="Tingkat keyakinan jawaban"
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        className={cn(
          // 48px minimum height for WCAG touch target
          "relative flex min-h-[48px] w-full cursor-pointer items-center rounded-lg px-1 py-3",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
          disabled && "cursor-not-allowed opacity-50"
        )}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        {/* Background rail */}
        <div className="absolute inset-x-1 top-1/2 h-2 -translate-y-1/2 rounded-full bg-gray-200" />

        {/* Filled portion */}
        <div
          className={cn(
            "absolute left-1 top-1/2 h-2 -translate-y-1/2 rounded-full transition-all duration-150",
            LEVEL_COLORS[value]
          )}
          style={{ width: `calc((100% - 8px) * ${fillPercent / 100})` }}
          aria-hidden="true"
        />

        {/* Thumb — positioned at the correct percentage along the track */}
        <div
          className={cn(
            "absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition-all duration-150",
            LEVEL_COLORS[value]
          )}
          style={{
            // Linear interpolation: at 0% → left:4px (start of rail), at 100% → right:4px (end of rail)
            left: `calc(4px + (100% - 8px) * ${fillPercent / 100})`,
          }}
          aria-hidden="true"
        />

        {/* Invisible spacer to give the div natural height */}
        <div className="h-6 w-full" aria-hidden="true" />
      </div>

      {/* Step buttons — discrete tappable steps */}
      <div className="mt-1 flex w-full justify-between gap-1" role="group" aria-label="Pilih tingkat keyakinan">
        {CRI_LABELS.map((label, idx) => (
          <button
            key={idx}
            type="button"
            aria-label={`Nilai ${idx}: ${label}`}
            aria-pressed={value === idx}
            disabled={disabled}
            onClick={() => handleStepClick(idx)}
            className={cn(
              // Each step: minimum 48px height, flex-1 for even distribution
              "flex min-h-[48px] flex-1 flex-col items-center justify-center rounded-md border-2 px-0.5 py-1 text-xs font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1",
              value === idx
                ? cn(
                    "border-transparent text-white",
                    LEVEL_COLORS[idx]
                  )
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-400",
              disabled && "cursor-not-allowed opacity-50"
            )}
          >
            <span className="text-base font-bold leading-none">{idx}</span>
            <span className="mt-0.5 text-center leading-tight hidden sm:block">
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* Mobile: show current label below */}
      <p className="mt-2 text-center text-sm text-gray-600 sm:hidden" aria-live="polite">
        {CRI_LABELS[value]}
      </p>
    </div>
  );
}

export default MetacognitiveSlider;
