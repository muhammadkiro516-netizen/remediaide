/**
 * RemediAide — Bug Condition Exploration Test
 * Task 1: Bug #1 — aggregateMajorityVoting threshold terlalu tinggi
 *
 * **EXPECTED TO FAIL on unfixed code.**
 * Failure confirms that aggregateMajorityVoting incorrectly returns
 * INSUFFICIENT_DATA when validItemCount = 1 (the bug condition).
 *
 * After the fix (task 3.2), this test is expected to PASS.
 *
 * Validates: Requirements 1.2
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  aggregateMajorityVoting,
  type CognitiveStatus,
  type DiagnosisResult,
} from '../engine';

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Build a DiagnosisResult with a given non-INVALID status */
function makeSingleValidResult(status: CognitiveStatus): DiagnosisResult {
  return {
    itemId: 'single-item',
    status,
    integrityIndex: 1.0,
    isBelowThreshold: false,
    auditTrail: {
      criNormalized: 0.8,
      timeRatio: 2.5,
      classificationRule: `${status} rule`,
    },
  };
}

/**
 * isBugCondition: exactly 1 valid (non-INVALID) item in the results array.
 * This is the condition that triggers Bug #1.
 */
function isBugCondition(results: DiagnosisResult[]): boolean {
  return results.filter((r) => r.status !== 'INVALID').length === 1;
}

// ─── Bug Condition Exploration Tests ──────────────────────────────────────────

describe('Bug Condition Exploration — aggregateMajorityVoting with exactly 1 valid item', () => {
  /**
   * Test case A: Single PAHAM_KONSEP item.
   * Expected (after fix): finalStatus = 'PAHAM_KONSEP'
   * Actual (unfixed code): INSUFFICIENT_DATA  ← BUG
   */
  it('Test A: aggregateMajorityVoting([PAHAM_KONSEP]) should return PAHAM_KONSEP, not INSUFFICIENT_DATA', () => {
    const results = [makeSingleValidResult('PAHAM_KONSEP')];
    expect(isBugCondition(results)).toBe(true); // confirms we are in the bug condition

    const result = aggregateMajorityVoting(results);
    // This assertion FAILS on unfixed code (returns INSUFFICIENT_DATA instead)
    expect(result.finalStatus).toBe('PAHAM_KONSEP');
    expect(result.finalStatus).not.toBe('INSUFFICIENT_DATA');
  });

  /**
   * Test case B: Single MISKONSEPSI item.
   * Expected (after fix): finalStatus = 'MISKONSEPSI'
   * Actual (unfixed code): INSUFFICIENT_DATA  ← BUG
   */
  it('Test B: aggregateMajorityVoting([MISKONSEPSI]) should return MISKONSEPSI, not INSUFFICIENT_DATA', () => {
    const results = [makeSingleValidResult('MISKONSEPSI')];
    expect(isBugCondition(results)).toBe(true);

    const result = aggregateMajorityVoting(results);
    expect(result.finalStatus).toBe('MISKONSEPSI');
    expect(result.finalStatus).not.toBe('INSUFFICIENT_DATA');
  });

  /**
   * Test case C: Single LUCKY_GUESS item.
   * Expected (after fix): finalStatus = 'LUCKY_GUESS'
   * Actual (unfixed code): INSUFFICIENT_DATA  ← BUG
   */
  it('Test C: aggregateMajorityVoting([LUCKY_GUESS]) should return LUCKY_GUESS, not INSUFFICIENT_DATA', () => {
    const results = [makeSingleValidResult('LUCKY_GUESS')];
    expect(isBugCondition(results)).toBe(true);

    const result = aggregateMajorityVoting(results);
    expect(result.finalStatus).toBe('LUCKY_GUESS');
    expect(result.finalStatus).not.toBe('INSUFFICIENT_DATA');
  });

  /**
   * Test case D: Single TIDAK_PAHAM item.
   * Expected (after fix): finalStatus = 'TIDAK_PAHAM'
   * Actual (unfixed code): INSUFFICIENT_DATA  ← BUG
   */
  it('Test D: aggregateMajorityVoting([TIDAK_PAHAM]) should return TIDAK_PAHAM, not INSUFFICIENT_DATA', () => {
    const results = [makeSingleValidResult('TIDAK_PAHAM')];
    expect(isBugCondition(results)).toBe(true);

    const result = aggregateMajorityVoting(results);
    expect(result.finalStatus).toBe('TIDAK_PAHAM');
    expect(result.finalStatus).not.toBe('INSUFFICIENT_DATA');
  });

  /**
   * Property-based version: for any single valid item (all 4 cognitive statuses),
   * aggregateMajorityVoting should return that item's status directly.
   *
   * **Validates: Requirements 1.2**
   */
  it('Property: for any single valid cognitive status item, finalStatus equals that item status', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<CognitiveStatus>('PAHAM_KONSEP', 'LUCKY_GUESS', 'MISKONSEPSI', 'TIDAK_PAHAM'),
        (cogStatus) => {
          const results = [makeSingleValidResult(cogStatus)];
          expect(isBugCondition(results)).toBe(true);

          const agg = aggregateMajorityVoting(results);
          // Must return the item's status, never INSUFFICIENT_DATA
          return agg.finalStatus === cogStatus && agg.finalStatus !== 'INSUFFICIENT_DATA';
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Edge: 1 valid item + surrounding INVALID items (mixed array).
   * The 1 valid item should still be returned directly after fix.
   */
  it('Property: 1 valid item among multiple INVALID items → returns the valid item status', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<CognitiveStatus>('PAHAM_KONSEP', 'LUCKY_GUESS', 'MISKONSEPSI', 'TIDAK_PAHAM'),
        fc.integer({ min: 1, max: 4 }),
        (cogStatus, numInvalid) => {
          const invalidItem: DiagnosisResult = {
            itemId: 'invalid-item',
            status: 'INVALID',
            integrityIndex: 0.0,
            isBelowThreshold: true,
            auditTrail: { criNormalized: 0, timeRatio: 0.1, classificationRule: 'BELOW_THRESHOLD' },
          };
          const results: DiagnosisResult[] = [
            makeSingleValidResult(cogStatus),
            ...Array(numInvalid).fill(invalidItem),
          ];

          expect(isBugCondition(results)).toBe(true); // exactly 1 valid

          const agg = aggregateMajorityVoting(results);
          return agg.finalStatus === cogStatus && agg.finalStatus !== 'INSUFFICIENT_DATA';
        }
      ),
      { numRuns: 100 }
    );
  });
});
