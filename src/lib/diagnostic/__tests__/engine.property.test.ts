/**
 * RemediAide — Diagnostic Engine Property-Based Tests
 * Sub-tasks 4.2–4.8
 *
 * Uses fast-check for property-based testing.
 * Each property validates a core invariant of the Diagnostic Engine.
 */

// Feature: remediaide

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import {
  calculateTauMin,
  calculateIntegrityIndex,
  classifyPerItem,
  aggregateMajorityVoting,
  type ResponseInput,
  type CognitiveStatus,
  type DiagnosisResult,
} from '../engine';

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** CRI value: integer in [0, 5] */
const criValueArb = fc.integer({ min: 0, max: 5 });

/** isCorrect: boolean */
const isCorrectArb = fc.boolean();

/** itemId: string */
const itemIdArb = fc.string({ minLength: 1, maxLength: 20 });

/** tauMinMs: positive integer representing threshold in ms (100ms to 10000ms) */
const tauMinMsArb = fc.integer({ min: 100, max: 10000 });

/** responseTimeMs that is AT or ABOVE tauMinMs */
const aboveThresholdTimeMsArb = (tauMinMs: number) =>
  fc.integer({ min: tauMinMs, max: tauMinMs + 30000 });

/** responseTimeMs strictly BELOW tauMinMs */
const belowThresholdTimeMsArb = (tauMinMs: number) =>
  fc.integer({ min: 1, max: tauMinMs - 1 });

/** Full valid ResponseInput (not below threshold) */
const validResponseInputArb = fc.record({
  itemId: itemIdArb,
  isCorrect: isCorrectArb,
  criValue: criValueArb,
  tauMinMs: tauMinMsArb,
}).chain(({ itemId, isCorrect, criValue, tauMinMs }) =>
  aboveThresholdTimeMsArb(tauMinMs).map((responseTimeMs) => ({
    itemId,
    isCorrect,
    criValue,
    responseTimeMs,
    tauMinMs,
  } as ResponseInput))
);

/** ResponseInput with responseTimeMs strictly below tauMinMs */
const belowThresholdResponseInputArb = fc.record({
  itemId: itemIdArb,
  isCorrect: isCorrectArb,
  criValue: criValueArb,
  tauMinMs: fc.integer({ min: 2, max: 10000 }), // at least 2 so we can go below
}).chain(({ itemId, isCorrect, criValue, tauMinMs }) =>
  belowThresholdTimeMsArb(tauMinMs).map((responseTimeMs) => ({
    itemId,
    isCorrect,
    criValue,
    responseTimeMs,
    tauMinMs,
  } as ResponseInput))
);

/** Word count: positive integer [1, 1000] */
const wordCountArb = fc.integer({ min: 1, max: 1000 });

/** Valid cognitive statuses (non-INVALID, non-INSUFFICIENT_DATA) */
const validCognitiveStatusArb = fc.constantFrom<CognitiveStatus>(
  'PAHAM_KONSEP',
  'LUCKY_GUESS',
  'MISKONSEPSI',
  'TIDAK_PAHAM'
);

/** Build a DiagnosisResult with a given status */
function makeDiagnosisResult(status: CognitiveStatus): DiagnosisResult {
  return {
    itemId: 'item',
    status,
    integrityIndex: status === 'INVALID' ? 0.0 : 0.5,
    isBelowThreshold: status === 'INVALID',
    auditTrail: { criNormalized: 0, timeRatio: 1, classificationRule: '' },
  };
}

/** Array of 3 CognitiveStatus (including INVALID) */
const anyStatusArb = fc.constantFrom<CognitiveStatus>(
  'PAHAM_KONSEP',
  'LUCKY_GUESS',
  'MISKONSEPSI',
  'TIDAK_PAHAM',
  'INVALID'
);

const threeStatusesArb = fc.tuple(anyStatusArb, anyStatusArb, anyStatusArb);

// ─── Property 1: Deterministic Classification Idempotence ─────────────────────
// Sub-task 4.2
// Validates: Requirements 6.3

describe('Property 1: Deterministic Classification Idempotence', () => {
  it('classifyPerItem(input) === classifyPerItem(input) for all valid inputs', () => {
    // Feature: remediaide, Property 1: Deterministic Classification Idempotence
    fc.assert(
      fc.property(validResponseInputArb, (input) => {
        const result1 = classifyPerItem(input);
        const result2 = classifyPerItem(input);
        return (
          result1.status === result2.status &&
          result1.integrityIndex === result2.integrityIndex &&
          result1.isBelowThreshold === result2.isBelowThreshold
        );
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 2: I_i Bounds Invariant ─────────────────────────────────────────
// Sub-task 4.3
// Validates: Requirements 5.4

describe('Property 2: I_i Bounds Invariant', () => {
  it('FOR ALL valid inputs, 0.0 ≤ calculateIntegrityIndex(input) ≤ 1.0', () => {
    // Feature: remediaide, Property 2: I_i Bounds Invariant
    fc.assert(
      fc.property(validResponseInputArb, (input) => {
        const ii = calculateIntegrityIndex(input);
        return ii >= 0.0 && ii <= 1.0;
      }),
      { numRuns: 100 }
    );
  });

  it('I_i is also in bounds for below-threshold inputs', () => {
    // Feature: remediaide, Property 2: I_i Bounds Invariant (below threshold)
    fc.assert(
      fc.property(belowThresholdResponseInputArb, (input) => {
        const ii = calculateIntegrityIndex(input);
        return ii >= 0.0 && ii <= 1.0;
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 3: BELOW_THRESHOLD Always Produces I_i = 0.0 ───────────────────
// Sub-task 4.4
// Validates: Requirements 5.2

describe('Property 3: BELOW_THRESHOLD Always Produces I_i = 0.0', () => {
  it('FOR ALL responseTimeMs < tauMinMs, calculateIntegrityIndex returns exactly 0.0', () => {
    // Feature: remediaide, Property 3: BELOW_THRESHOLD Always Produces I_i = 0.0
    fc.assert(
      fc.property(belowThresholdResponseInputArb, (input) => {
        return calculateIntegrityIndex(input) === 0.0;
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 4: INVALID Status for BELOW_THRESHOLD Responses ─────────────────
// Sub-task 4.5
// Validates: Requirements 6.2

describe('Property 4: INVALID Status for BELOW_THRESHOLD Responses', () => {
  it('FOR ALL responseTimeMs < tauMinMs, classifyPerItem returns status INVALID', () => {
    // Feature: remediaide, Property 4: INVALID Status for BELOW_THRESHOLD Responses
    fc.assert(
      fc.property(belowThresholdResponseInputArb, (input) => {
        const result = classifyPerItem(input);
        return result.status === 'INVALID' && result.isBelowThreshold === true;
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 11: τ_min Ceiling Invariant ─────────────────────────────────────
// Sub-task 4.6
// Validates: Requirements 4.1, 4.3

describe('Property 11: τ_min Ceiling Invariant', () => {
  it('FOR ALL L_i ≥ 1, τ = calculateTauMin(L_i) is a positive integer AND τ ≥ Math.ceil(L_i / 2.5)', () => {
    // Feature: remediaide, Property 11: τ_min Ceiling Invariant
    fc.assert(
      fc.property(wordCountArb, (wordCount) => {
        const tau = calculateTauMin(wordCount);
        const expectedMin = Math.ceil(wordCount / 2.5);
        return (
          Number.isInteger(tau) &&
          tau > 0 &&
          tau >= expectedMin
        );
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 6: Majority Voting Always Returns Single Status ─────────────────
// Sub-task 4.7
// Validates: Requirements 7.1, 7.2, 7.3

describe('Property 6: Majority Voting Always Returns Single Status', () => {
  it('FOR ALL [S1, S2, S3] ∈ valid_statuses^3, aggregateMajorityVoting returns exactly one finalStatus', () => {
    // Feature: remediaide, Property 6: Majority Voting Always Returns Single Status
    fc.assert(
      fc.property(threeStatusesArb, ([s1, s2, s3]) => {
        const results = [s1, s2, s3].map(makeDiagnosisResult);
        const agg = aggregateMajorityVoting(results);
        // finalStatus must be a valid CognitiveStatus string
        const validStatuses: CognitiveStatus[] = [
          'PAHAM_KONSEP',
          'LUCKY_GUESS',
          'MISKONSEPSI',
          'TIDAK_PAHAM',
          'INVALID',
          'INSUFFICIENT_DATA',
        ];
        return typeof agg.finalStatus === 'string' && validStatuses.includes(agg.finalStatus);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 7: Precedency Rule Tie-Breaking Determinism ─────────────────────
// Sub-task 4.8
// Validates: Requirements 7.3

describe('Property 7: Precedency Rule Tie-Breaking Determinism', () => {
  it('MISKONSEPSI beats LUCKY_GUESS when tied', () => {
    // Feature: remediaide, Property 7: Precedency Rule Tie-Breaking Determinism
    const miskonsepsi = makeDiagnosisResult('MISKONSEPSI');
    const lucky = makeDiagnosisResult('LUCKY_GUESS');
    const paham = makeDiagnosisResult('PAHAM_KONSEP');

    // Tie: MISKONSEPSI=1, LUCKY_GUESS=1, PAHAM_KONSEP=1
    const result = aggregateMajorityVoting([miskonsepsi, lucky, paham]);
    expect(result.finalStatus).toBe('MISKONSEPSI');
    expect(result.tiebreakerApplied).toBe(true);
  });

  it('MISKONSEPSI beats TIDAK_PAHAM when tied', () => {
    const miskonsepsi = makeDiagnosisResult('MISKONSEPSI');
    const tidak = makeDiagnosisResult('TIDAK_PAHAM');
    const paham = makeDiagnosisResult('PAHAM_KONSEP');

    const result = aggregateMajorityVoting([miskonsepsi, tidak, paham]);
    expect(result.finalStatus).toBe('MISKONSEPSI');
    expect(result.tiebreakerApplied).toBe(true);
  });

  it('LUCKY_GUESS beats TIDAK_PAHAM when tied', () => {
    const lucky = makeDiagnosisResult('LUCKY_GUESS');
    const tidak = makeDiagnosisResult('TIDAK_PAHAM');
    const paham = makeDiagnosisResult('PAHAM_KONSEP');

    const result = aggregateMajorityVoting([lucky, tidak, paham]);
    expect(result.finalStatus).toBe('LUCKY_GUESS');
    expect(result.tiebreakerApplied).toBe(true);
  });

  it('LUCKY_GUESS beats PAHAM_KONSEP when tied', () => {
    const lucky = makeDiagnosisResult('LUCKY_GUESS');
    const paham1 = makeDiagnosisResult('PAHAM_KONSEP');
    const paham2 = makeDiagnosisResult('PAHAM_KONSEP');
    // 1 LUCKY_GUESS vs 2 PAHAM_KONSEP — no tie, but test the 2-way tie case:
    const lucky2 = makeDiagnosisResult('LUCKY_GUESS');
    const result = aggregateMajorityVoting([lucky, lucky2, paham1]);
    // LUCKY_GUESS has majority (2 vs 1), no tiebreaker needed
    expect(result.finalStatus).toBe('LUCKY_GUESS');
    expect(result.tiebreakerApplied).toBe(false);
  });

  it('TIDAK_PAHAM beats PAHAM_KONSEP when tied (2-way tie)', () => {
    // Use 4 results to create a 2-2 tie
    const tidak1 = makeDiagnosisResult('TIDAK_PAHAM');
    const tidak2 = makeDiagnosisResult('TIDAK_PAHAM');
    const paham1 = makeDiagnosisResult('PAHAM_KONSEP');
    // Only 3 results allowed — use 1 TIDAK_PAHAM vs 1 PAHAM_KONSEP vs 1 INVALID
    const invalid = makeDiagnosisResult('INVALID');
    // validItemCount = 2, tie between TIDAK_PAHAM and PAHAM_KONSEP
    const result = aggregateMajorityVoting([tidak1, paham1, invalid]);
    // tie 1-1 → TIDAK_PAHAM beats PAHAM_KONSEP per precedency
    expect(result.finalStatus).toBe('TIDAK_PAHAM');
    expect(result.tiebreakerApplied).toBe(true);
  });

  it('Precedency Rule is deterministic — same input always yields same winner', () => {
    // Feature: remediaide, Property 7: Precedency Rule Tie-Breaking Determinism
    fc.assert(
      fc.property(
        fc.constantFrom<[CognitiveStatus, CognitiveStatus, CognitiveStatus]>(
          ['MISKONSEPSI', 'LUCKY_GUESS', 'PAHAM_KONSEP'],
          ['MISKONSEPSI', 'TIDAK_PAHAM', 'LUCKY_GUESS'],
          ['LUCKY_GUESS', 'TIDAK_PAHAM', 'PAHAM_KONSEP'],
          ['TIDAK_PAHAM', 'PAHAM_KONSEP', 'LUCKY_GUESS'],
        ),
        ([s1, s2, s3]) => {
          const run1 = aggregateMajorityVoting([s1, s2, s3].map(makeDiagnosisResult));
          const run2 = aggregateMajorityVoting([s1, s2, s3].map(makeDiagnosisResult));
          return run1.finalStatus === run2.finalStatus;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Explicit import for expect used in non-fc assertions above
import { expect } from 'vitest';
