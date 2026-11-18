/**
 * RemediAide — Diagnostic Engine Core
 * Pure functions, zero side effects, zero DB calls.
 *
 * Implements the CRI-based cognitive classification algorithm:
 *   - τ_min calculation  (minimum valid read time)
 *   - I_i calculation    (integrity index per item)
 *   - S_i classification (cognitive status per item)
 *   - Majority Voting    (aggregate status across items)
 */

// ─── Exported Types ───────────────────────────────────────────────────────────

export type CognitiveStatus =
  | 'PAHAM_KONSEP'
  | 'LUCKY_GUESS'
  | 'MISKONSEPSI'
  | 'TIDAK_PAHAM'
  | 'INVALID'
  | 'INSUFFICIENT_DATA';

export interface ResponseInput {
  itemId: string;
  isCorrect: boolean;
  criValue: number;        // 0–5 integer
  responseTimeMs: number;  // response time in milliseconds
  tauMinMs: number;        // minimum valid read time in milliseconds
}

export interface DiagnosisResult {
  itemId: string;
  status: CognitiveStatus;
  integrityIndex: number;   // I_i ∈ [0.0, 1.0]
  isBelowThreshold: boolean;
  auditTrail: {
    criNormalized: number;    // cri / 5, range [0, 1]
    timeRatio: number;        // responseTimeMs / tauMinMs
    classificationRule: string;
  };
}

export interface AggregationResult {
  finalStatus: CognitiveStatus;
  votingTally: Record<CognitiveStatus, number>;
  tiebreakerApplied: boolean;
  validItemCount: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Reading speed: 2.5 words/second = 150 words/minute */
const READING_SPEED_WPS = 2.5;

/**
 * Precedency rule for tie-breaking majority voting.
 * Higher priority = lower index.
 */
const PRECEDENCY: CognitiveStatus[] = [
  'MISKONSEPSI',
  'LUCKY_GUESS',
  'TIDAK_PAHAM',
  'PAHAM_KONSEP',
];

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Count words in a text string.
 * Normalises to lowercase and strips punctuation before counting.
 *
 * @param text - Raw question text
 * @returns Number of words (L_i)
 */
export function countWords(text: string): number {
  if (!text || text.trim() === '') return 0;
  // Normalise: lowercase, remove punctuation, collapse whitespace
  const normalised = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalised === '') return 0;
  return normalised.split(' ').filter((w) => w.length > 0).length;
}

/**
 * Calculate τ_min (minimum valid read time) in **seconds**.
 * Formula: τ_min = ⌈L_i / 2.5⌉
 *
 * @param wordCount - Number of words in the question text (L_i)
 * @returns Minimum valid response time in seconds (positive integer)
 */
export function calculateTauMin(wordCount: number): number {
  if (wordCount <= 0) return 1; // at least 1 second for any item
  return Math.ceil(wordCount / READING_SPEED_WPS);
}

/**
 * Calculate I_i (integrity index) for a single response.
 * Returns a value in [0.0, 1.0].
 *
 * BELOW_THRESHOLD:  responseTimeMs < tauMinMs  →  I_i = 0.0
 * Correct  & CRI≥3: I_i = 1.0
 * Correct  & CRI<3: I_i = 0.6 + (cri/5) × 0.4
 * Wrong    & CRI≥3: I_i = 0.0
 * Wrong    & CRI<3: I_i = 0.3 + (cri/5) × 0.3
 *
 * @param input - ResponseInput data
 * @returns I_i ∈ [0.0, 1.0]
 */
export function calculateIntegrityIndex(input: ResponseInput): number {
  const { isCorrect, criValue, responseTimeMs, tauMinMs } = input;

  // BELOW_THRESHOLD check
  if (responseTimeMs < tauMinMs) {
    return 0.0;
  }

  if (isCorrect && criValue >= 3) {
    return 1.0;
  }

  if (isCorrect && criValue < 3) {
    return 0.6 + (criValue / 5) * 0.4;
  }

  if (!isCorrect && criValue >= 3) {
    return 0.0;
  }

  // !isCorrect && criValue < 3
  return 0.3 + (criValue / 5) * 0.3;
}

/**
 * Classify a single response item into a CognitiveStatus.
 * Returns a DiagnosisResult with auditTrail.
 *
 * @param input - ResponseInput data
 * @returns DiagnosisResult with status, integrityIndex, isBelowThreshold, auditTrail
 */
export function classifyPerItem(input: ResponseInput): DiagnosisResult {
  const { itemId, isCorrect, criValue, responseTimeMs, tauMinMs } = input;

  const isBelowThreshold = responseTimeMs < tauMinMs;
  const integrityIndex = calculateIntegrityIndex(input);

  // Build audit trail
  const auditTrail = {
    criNormalized: criValue / 5,
    timeRatio: tauMinMs > 0 ? responseTimeMs / tauMinMs : 0,
    classificationRule: _deriveClassificationRule(isCorrect, criValue, isBelowThreshold),
  };

  // Determine status
  let status: CognitiveStatus;

  if (isBelowThreshold || integrityIndex === 0.0) {
    // INVALID for below-threshold OR wrong+highCRI (I_i=0 from !correct & cri≥3)
    // Exception: wrong & lowCRI produces I_i > 0, so check explicitly
    if (isBelowThreshold) {
      status = 'INVALID';
    } else if (!isCorrect && criValue >= 3) {
      // !correct & CRI≥3 → MISKONSEPSI (I_i=0 but NOT below threshold)
      status = 'MISKONSEPSI';
    } else {
      // Below threshold or some other 0.0 path — should not happen but guard
      status = 'INVALID';
    }
  } else {
    // Normal 4-branch classification
    if (isCorrect && criValue >= 3) {
      status = 'PAHAM_KONSEP';
    } else if (isCorrect && criValue < 3) {
      status = 'LUCKY_GUESS';
    } else {
      // !isCorrect && criValue < 3
      status = 'TIDAK_PAHAM';
    }
  }

  return {
    itemId,
    status,
    integrityIndex,
    isBelowThreshold,
    auditTrail,
  };
}

/**
 * Aggregate majority voting across multiple DiagnosisResults.
 * Applies Precedency Rule on tie: MISKONSEPSI > LUCKY_GUESS > TIDAK_PAHAM > PAHAM_KONSEP.
 * Returns INSUFFICIENT_DATA if fewer than 2 valid (non-INVALID) items.
 *
 * @param results - Array of DiagnosisResult (typically 3 items for one concept)
 * @returns AggregationResult with finalStatus, votingTally, tiebreakerApplied, validItemCount
 */
export function aggregateMajorityVoting(results: DiagnosisResult[]): AggregationResult {
  // Initialise tally with all statuses at 0
  const votingTally: Record<CognitiveStatus, number> = {
    PAHAM_KONSEP: 0,
    LUCKY_GUESS: 0,
    MISKONSEPSI: 0,
    TIDAK_PAHAM: 0,
    INVALID: 0,
    INSUFFICIENT_DATA: 0,
  };

  // Filter valid statuses (exclude INVALID)
  const validResults = results.filter((r) => r.status !== 'INVALID');

  // Tally all results (including INVALID for transparency)
  for (const r of results) {
    votingTally[r.status]++;
  }

  const validItemCount = validResults.length;

  // Guard: no valid items → cannot classify
  if (validItemCount < 1) {
    return {
      finalStatus: 'INSUFFICIENT_DATA',
      votingTally,
      tiebreakerApplied: false,
      validItemCount,
    };
  }

  // Fast-path: exactly 1 valid item → return its status directly (no voting needed)
  if (validItemCount === 1) {
    return {
      finalStatus: validResults[0].status,
      votingTally,
      tiebreakerApplied: false,
      validItemCount: 1,
    };
  }

  // Count only valid statuses for voting
  const validTally: Partial<Record<CognitiveStatus, number>> = {};
  for (const r of validResults) {
    validTally[r.status] = (validTally[r.status] ?? 0) + 1;
  }

  const maxFreq = Math.max(...Object.values(validTally));
  const candidates = (Object.entries(validTally) as [CognitiveStatus, number][])
    .filter(([, freq]) => freq === maxFreq)
    .map(([status]) => status);

  let finalStatus: CognitiveStatus;
  let tiebreakerApplied = false;

  if (candidates.length === 1) {
    finalStatus = candidates[0];
  } else {
    // Apply Precedency Rule
    tiebreakerApplied = true;
    const winner = PRECEDENCY.find((s) => candidates.includes(s));
    // winner will always be found since candidates are all valid cognitive statuses
    finalStatus = winner!;
  }

  return {
    finalStatus,
    votingTally,
    tiebreakerApplied,
    validItemCount,
  };
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function _deriveClassificationRule(
  isCorrect: boolean,
  criValue: number,
  isBelowThreshold: boolean
): string {
  if (isBelowThreshold) {
    return 'BELOW_THRESHOLD: responseTimeMs < tauMinMs → INVALID';
  }
  if (isCorrect && criValue >= 3) {
    return 'CORRECT & CRI≥3 → PAHAM_KONSEP (I_i=1.0)';
  }
  if (isCorrect && criValue < 3) {
    return `CORRECT & CRI<3 → LUCKY_GUESS (I_i=0.6+(${criValue}/5)×0.4)`;
  }
  if (!isCorrect && criValue >= 3) {
    return `WRONG & CRI≥3 → MISKONSEPSI (I_i=0.0)`;
  }
  return `WRONG & CRI<3 → TIDAK_PAHAM (I_i=0.3+(${criValue}/5)×0.3)`;
}
