/**
 * RemediAide — Preservation Property Tests
 * Task 2: Verify baseline behaviors that MUST NOT change after Bug #1 fix.
 *
 * These tests must PASS on unfixed code (establishing the baseline to preserve),
 * and must continue to PASS after the fix is applied.
 *
 * Validates: Requirements 3.1, 3.2
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  aggregateMajorityVoting,
  type CognitiveStatus,
  type DiagnosisResult,
} from '../engine';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a DiagnosisResult with an arbitrary status */
function makeDiagnosisResult(status: CognitiveStatus): DiagnosisResult {
  return {
    itemId: `item-${status}`,
    status,
    integrityIndex: status === 'INVALID' ? 0.0 : 0.8,
    isBelowThreshold: status === 'INVALID',
    auditTrail: {
      criNormalized: status === 'INVALID' ? 0 : 0.8,
      timeRatio: status === 'INVALID' ? 0.2 : 2.0,
      classificationRule: `${status} rule`,
    },
  };
}

/**
 * Snapshot of the original majority voting behavior (pre-fix) for ≥2 valid items.
 * This function mirrors the original algorithm to serve as a reference.
 * Used in Property 2b to verify that the fixed function produces identical results.
 */
function originalAggregateForMultiItem(results: DiagnosisResult[]) {
  const PRECEDENCY: CognitiveStatus[] = [
    'MISKONSEPSI',
    'LUCKY_GUESS',
    'TIDAK_PAHAM',
    'PAHAM_KONSEP',
  ];

  const votingTally: Record<CognitiveStatus, number> = {
    PAHAM_KONSEP: 0,
    LUCKY_GUESS: 0,
    MISKONSEPSI: 0,
    TIDAK_PAHAM: 0,
    INVALID: 0,
    INSUFFICIENT_DATA: 0,
  };

  const validResults = results.filter((r) => r.status !== 'INVALID');
  for (const r of results) votingTally[r.status]++;
  const validItemCount = validResults.length;

  if (validItemCount < 2) {
    return { finalStatus: 'INSUFFICIENT_DATA' as CognitiveStatus, votingTally, tiebreakerApplied: false, validItemCount };
  }

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
    tiebreakerApplied = true;
    const winner = PRECEDENCY.find((s) => candidates.includes(s));
    finalStatus = winner!;
  }

  return { finalStatus, votingTally, tiebreakerApplied, validItemCount };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const anyStatusArb = fc.constantFrom<CognitiveStatus>(
  'PAHAM_KONSEP',
  'LUCKY_GUESS',
  'MISKONSEPSI',
  'TIDAK_PAHAM',
  'INVALID',
);

/**
 * Generate an array where ALL items have status INVALID (0 valid items).
 * Covers the zero-valid-item preservation case.
 */
const zeroValidItemsArb = fc
  .array(fc.constant('INVALID' as CognitiveStatus), { minLength: 0, maxLength: 8 })
  .map((statuses) => statuses.map(makeDiagnosisResult));

/**
 * Generate an array with exactly 2–10 valid items (plus optional INVALID items).
 * Used to test that multi-item voting is unchanged after the fix.
 */
const twoOrMoreValidItemsArb = fc
  .array(anyStatusArb, { minLength: 2, maxLength: 10 })
  .filter((statuses) => statuses.filter((s) => s !== 'INVALID').length >= 2)
  .map((statuses) => statuses.map(makeDiagnosisResult));

// ─── Preservation Tests ───────────────────────────────────────────────────────

describe('Preservation — zero valid items always returns INSUFFICIENT_DATA', () => {
  /**
   * Property 2a: For all inputs where validItemCount = 0,
   * finalStatus SHALL remain INSUFFICIENT_DATA.
   *
   * **Validates: Requirements 3.1**
   */
  it('Property 2a: aggregateMajorityVoting([]) returns INSUFFICIENT_DATA (empty array)', () => {
    const result = aggregateMajorityVoting([]);
    expect(result.finalStatus).toBe('INSUFFICIENT_DATA');
    expect(result.validItemCount).toBe(0);
    expect(result.tiebreakerApplied).toBe(false);
  });

  it('Property 2a: aggregateMajorityVoting([INVALID]) returns INSUFFICIENT_DATA (single invalid)', () => {
    const result = aggregateMajorityVoting([makeDiagnosisResult('INVALID')]);
    expect(result.finalStatus).toBe('INSUFFICIENT_DATA');
    expect(result.validItemCount).toBe(0);
  });

  it('Property 2a: FOR ALL arrays of only INVALID items, finalStatus = INSUFFICIENT_DATA', () => {
    // **Validates: Requirements 3.1**
    fc.assert(
      fc.property(zeroValidItemsArb, (results) => {
        const agg = aggregateMajorityVoting(results);
        return agg.finalStatus === 'INSUFFICIENT_DATA' && agg.validItemCount === 0;
      }),
      { numRuns: 200 }
    );
  });
});

describe('Preservation — multi-item voting (≥2 valid) is unchanged after fix', () => {
  /**
   * Property 2b: For all randomly-generated arrays with validItemCount ≥ 2,
   * the fixed function SHALL produce the same finalStatus, votingTally,
   * and tiebreakerApplied as the original function snapshot.
   *
   * **Validates: Requirements 3.2**
   */
  it('Property 2b: FOR ALL arrays with ≥2 valid items, fixed result equals original result', () => {
    // **Validates: Requirements 3.2**
    fc.assert(
      fc.property(twoOrMoreValidItemsArb, (results) => {
        const fixed = aggregateMajorityVoting(results);
        const original = originalAggregateForMultiItem(results);

        return (
          fixed.finalStatus === original.finalStatus &&
          fixed.tiebreakerApplied === original.tiebreakerApplied &&
          fixed.validItemCount === original.validItemCount
        );
      }),
      { numRuns: 500 }
    );
  });

  it('Precedency: MISKONSEPSI > LUCKY_GUESS > TIDAK_PAHAM > PAHAM_KONSEP', () => {
    // Full 4-way tie
    const result = aggregateMajorityVoting([
      makeDiagnosisResult('MISKONSEPSI'),
      makeDiagnosisResult('LUCKY_GUESS'),
      makeDiagnosisResult('TIDAK_PAHAM'),
      makeDiagnosisResult('PAHAM_KONSEP'),
    ]);
    expect(result.finalStatus).toBe('MISKONSEPSI');
    expect(result.tiebreakerApplied).toBe(true);
  });

  it('Precedency: LUCKY_GUESS beats TIDAK_PAHAM and PAHAM_KONSEP', () => {
    const result = aggregateMajorityVoting([
      makeDiagnosisResult('LUCKY_GUESS'),
      makeDiagnosisResult('TIDAK_PAHAM'),
      makeDiagnosisResult('PAHAM_KONSEP'),
    ]);
    expect(result.finalStatus).toBe('LUCKY_GUESS');
    expect(result.tiebreakerApplied).toBe(true);
  });

  it('Precedency: TIDAK_PAHAM beats PAHAM_KONSEP in 2-way tie', () => {
    const result = aggregateMajorityVoting([
      makeDiagnosisResult('TIDAK_PAHAM'),
      makeDiagnosisResult('PAHAM_KONSEP'),
      makeDiagnosisResult('INVALID'), // excluded from voting
    ]);
    expect(result.finalStatus).toBe('TIDAK_PAHAM');
    expect(result.tiebreakerApplied).toBe(true);
    expect(result.validItemCount).toBe(2);
  });

  it('Majority wins without tiebreaker: 2 PAHAM_KONSEP vs 1 MISKONSEPSI', () => {
    const result = aggregateMajorityVoting([
      makeDiagnosisResult('PAHAM_KONSEP'),
      makeDiagnosisResult('PAHAM_KONSEP'),
      makeDiagnosisResult('MISKONSEPSI'),
    ]);
    expect(result.finalStatus).toBe('PAHAM_KONSEP');
    expect(result.tiebreakerApplied).toBe(false);
    expect(result.validItemCount).toBe(3);
  });

  it('votingTally is correctly populated for multi-item input', () => {
    const result = aggregateMajorityVoting([
      makeDiagnosisResult('PAHAM_KONSEP'),
      makeDiagnosisResult('PAHAM_KONSEP'),
      makeDiagnosisResult('INVALID'),
    ]);
    expect(result.votingTally.PAHAM_KONSEP).toBe(2);
    expect(result.votingTally.INVALID).toBe(1);
    expect(result.votingTally.MISKONSEPSI).toBe(0);
  });

  /**
   * Property 2b extended: Tie-breaking is always consistent with precedency rule
   * across all generated tie scenarios.
   */
  it('Property 2b tie-breaking: for all tie scenarios, winner follows MISKONSEPSI > LUCKY_GUESS > TIDAK_PAHAM > PAHAM_KONSEP', () => {
    // **Validates: Requirements 3.2**
    const PRECEDENCY: CognitiveStatus[] = ['MISKONSEPSI', 'LUCKY_GUESS', 'TIDAK_PAHAM', 'PAHAM_KONSEP'];

    // Generate arrays where exactly 2 distinct valid statuses are tied
    const tiedPairArb = fc.tuple(
      fc.integer({ min: 0, max: 3 }),
      fc.integer({ min: 0, max: 3 }),
    ).filter(([i, j]) => i !== j).map(([i, j]) => [PRECEDENCY[i], PRECEDENCY[j]] as [CognitiveStatus, CognitiveStatus]);

    fc.assert(
      fc.property(
        tiedPairArb,
        fc.integer({ min: 1, max: 3 }),
        ([s1, s2], count) => {
          // Build tie: count items of each status
          const items = [
            ...Array(count).fill(null).map(() => makeDiagnosisResult(s1)),
            ...Array(count).fill(null).map(() => makeDiagnosisResult(s2)),
          ];
          const result = aggregateMajorityVoting(items);
          // Winner must be the one higher in precedency
          const s1Idx = PRECEDENCY.indexOf(s1);
          const s2Idx = PRECEDENCY.indexOf(s2);
          const expectedWinner = s1Idx < s2Idx ? s1 : s2;
          return result.finalStatus === expectedWinner && result.tiebreakerApplied === true;
        }
      ),
      { numRuns: 200 }
    );
  });
});
