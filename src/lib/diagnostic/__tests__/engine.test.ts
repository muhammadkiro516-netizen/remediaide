/**
 * RemediAide — Diagnostic Engine Unit Tests
 * Sub-task 4.1
 *
 * Tests all 4 branches of I_i calculation, BELOW_THRESHOLD checks,
 * every combination of classifyPerItem, and majority voting scenarios.
 */

import { describe, it, expect } from 'vitest';
import {
  countWords,
  calculateTauMin,
  calculateIntegrityIndex,
  classifyPerItem,
  aggregateMajorityVoting,
  type ResponseInput,
  type DiagnosisResult,
} from '../engine';

// ─── countWords & calculateTauMin ─────────────────────────────────────────────

describe('countWords', () => {
  it('should count words correctly', () => {
    expect(countWords('Berapa hasil dari 2 + 2?')).toBe(5);
  });

  it('should handle empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('should handle string with only punctuation', () => {
    expect(countWords('!!!')).toBe(0);
  });

  it('should normalise multiple spaces', () => {
    expect(countWords('a   b    c')).toBe(3);
  });

  it('should strip punctuation before counting', () => {
    expect(countWords('Hello, world!')).toBe(2);
  });
});

describe('calculateTauMin', () => {
  it('should return ceiling of wordCount / 2.5', () => {
    expect(calculateTauMin(5)).toBe(2); // 5 / 2.5 = 2.0 → 2
    expect(calculateTauMin(10)).toBe(4); // 10 / 2.5 = 4.0 → 4
    expect(calculateTauMin(11)).toBe(5); // 11 / 2.5 = 4.4 → 5
  });

  it('should return at least 1 second for wordCount <= 0', () => {
    expect(calculateTauMin(0)).toBe(1);
    expect(calculateTauMin(-5)).toBe(1);
  });

  it('should always return a positive integer', () => {
    expect(Number.isInteger(calculateTauMin(7))).toBe(true);
    expect(calculateTauMin(7)).toBeGreaterThan(0);
  });
});

// ─── calculateIntegrityIndex ──────────────────────────────────────────────────

describe('calculateIntegrityIndex', () => {
  it('BELOW_THRESHOLD: should return 0.0 when responseTimeMs < tauMinMs', () => {
    const input: ResponseInput = {
      itemId: 'item1',
      isCorrect: true,
      criValue: 5,
      responseTimeMs: 1000,
      tauMinMs: 2000,
    };
    expect(calculateIntegrityIndex(input)).toBe(0.0);
  });

  it('Branch 1: CORRECT & CRI≥3 → I_i = 1.0', () => {
    const input: ResponseInput = {
      itemId: 'item1',
      isCorrect: true,
      criValue: 3,
      responseTimeMs: 5000,
      tauMinMs: 3000,
    };
    expect(calculateIntegrityIndex(input)).toBe(1.0);

    const input2 = { ...input, criValue: 5 };
    expect(calculateIntegrityIndex(input2)).toBe(1.0);
  });

  it('Branch 2: CORRECT & CRI<3 → I_i = 0.6 + (cri/5)*0.4', () => {
    const input: ResponseInput = {
      itemId: 'item1',
      isCorrect: true,
      criValue: 0,
      responseTimeMs: 5000,
      tauMinMs: 3000,
    };
    // I_i = 0.6 + (0/5)*0.4 = 0.6
    expect(calculateIntegrityIndex(input)).toBeCloseTo(0.6, 3);

    const input2 = { ...input, criValue: 2 };
    // I_i = 0.6 + (2/5)*0.4 = 0.6 + 0.16 = 0.76
    expect(calculateIntegrityIndex(input2)).toBeCloseTo(0.76, 3);
  });

  it('Branch 3: WRONG & CRI≥3 → I_i = 0.0', () => {
    const input: ResponseInput = {
      itemId: 'item1',
      isCorrect: false,
      criValue: 3,
      responseTimeMs: 5000,
      tauMinMs: 3000,
    };
    expect(calculateIntegrityIndex(input)).toBe(0.0);

    const input2 = { ...input, criValue: 5 };
    expect(calculateIntegrityIndex(input2)).toBe(0.0);
  });

  it('Branch 4: WRONG & CRI<3 → I_i = 0.3 + (cri/5)*0.3', () => {
    const input: ResponseInput = {
      itemId: 'item1',
      isCorrect: false,
      criValue: 0,
      responseTimeMs: 5000,
      tauMinMs: 3000,
    };
    // I_i = 0.3 + (0/5)*0.3 = 0.3
    expect(calculateIntegrityIndex(input)).toBeCloseTo(0.3, 3);

    const input2 = { ...input, criValue: 2 };
    // I_i = 0.3 + (2/5)*0.3 = 0.3 + 0.12 = 0.42
    expect(calculateIntegrityIndex(input2)).toBeCloseTo(0.42, 3);
  });

  it('should always return value in [0.0, 1.0]', () => {
    const testCases: ResponseInput[] = [
      { itemId: 'a', isCorrect: true, criValue: 5, responseTimeMs: 5000, tauMinMs: 1000 },
      { itemId: 'b', isCorrect: false, criValue: 0, responseTimeMs: 5000, tauMinMs: 1000 },
      { itemId: 'c', isCorrect: true, criValue: 2, responseTimeMs: 5000, tauMinMs: 1000 },
      { itemId: 'd', isCorrect: false, criValue: 2, responseTimeMs: 5000, tauMinMs: 1000 },
      { itemId: 'e', isCorrect: false, criValue: 4, responseTimeMs: 100, tauMinMs: 2000 },
    ];

    testCases.forEach((tc) => {
      const result = calculateIntegrityIndex(tc);
      expect(result).toBeGreaterThanOrEqual(0.0);
      expect(result).toBeLessThanOrEqual(1.0);
    });
  });
});

// ─── classifyPerItem ──────────────────────────────────────────────────────────

describe('classifyPerItem', () => {
  it('BELOW_THRESHOLD → status INVALID', () => {
    const input: ResponseInput = {
      itemId: 'item1',
      isCorrect: true,
      criValue: 5,
      responseTimeMs: 500,
      tauMinMs: 2000,
    };
    const result = classifyPerItem(input);
    expect(result.status).toBe('INVALID');
    expect(result.isBelowThreshold).toBe(true);
    expect(result.integrityIndex).toBe(0.0);
  });

  it('CORRECT & CRI≥3 → status PAHAM_KONSEP', () => {
    const input: ResponseInput = {
      itemId: 'item1',
      isCorrect: true,
      criValue: 4,
      responseTimeMs: 5000,
      tauMinMs: 2000,
    };
    const result = classifyPerItem(input);
    expect(result.status).toBe('PAHAM_KONSEP');
    expect(result.integrityIndex).toBe(1.0);
    expect(result.isBelowThreshold).toBe(false);
  });

  it('CORRECT & CRI<3 → status LUCKY_GUESS', () => {
    const input: ResponseInput = {
      itemId: 'item1',
      isCorrect: true,
      criValue: 1,
      responseTimeMs: 5000,
      tauMinMs: 2000,
    };
    const result = classifyPerItem(input);
    expect(result.status).toBe('LUCKY_GUESS');
    expect(result.integrityIndex).toBeGreaterThan(0.6);
    expect(result.isBelowThreshold).toBe(false);
  });

  it('WRONG & CRI≥3 → status MISKONSEPSI', () => {
    const input: ResponseInput = {
      itemId: 'item1',
      isCorrect: false,
      criValue: 5,
      responseTimeMs: 5000,
      tauMinMs: 2000,
    };
    const result = classifyPerItem(input);
    expect(result.status).toBe('MISKONSEPSI');
    expect(result.integrityIndex).toBe(0.0);
    expect(result.isBelowThreshold).toBe(false);
  });

  it('WRONG & CRI<3 → status TIDAK_PAHAM', () => {
    const input: ResponseInput = {
      itemId: 'item1',
      isCorrect: false,
      criValue: 1,
      responseTimeMs: 5000,
      tauMinMs: 2000,
    };
    const result = classifyPerItem(input);
    expect(result.status).toBe('TIDAK_PAHAM');
    expect(result.integrityIndex).toBeGreaterThan(0.3);
    expect(result.isBelowThreshold).toBe(false);
  });

  it('should include auditTrail in result', () => {
    const input: ResponseInput = {
      itemId: 'item1',
      isCorrect: true,
      criValue: 4,
      responseTimeMs: 5000,
      tauMinMs: 2000,
    };
    const result = classifyPerItem(input);
    expect(result.auditTrail).toBeDefined();
    expect(result.auditTrail.criNormalized).toBeCloseTo(0.8, 3); // 4/5
    expect(result.auditTrail.timeRatio).toBeCloseTo(2.5, 3); // 5000/2000
    expect(result.auditTrail.classificationRule).toContain('PAHAM_KONSEP');
  });
});

// ─── aggregateMajorityVoting ──────────────────────────────────────────────────

describe('aggregateMajorityVoting', () => {
  it('should return INSUFFICIENT_DATA only when validItemCount = 0 (zero valid items)', () => {
    // Zero valid items → INSUFFICIENT_DATA
    const emptyResult = aggregateMajorityVoting([]);
    expect(emptyResult.finalStatus).toBe('INSUFFICIENT_DATA');
    expect(emptyResult.validItemCount).toBe(0);

    const singleInvalidResult = aggregateMajorityVoting([
      {
        itemId: 'item1',
        status: 'INVALID',
        integrityIndex: 0.0,
        isBelowThreshold: true,
        auditTrail: { criNormalized: 0, timeRatio: 0, classificationRule: '' },
      },
    ]);
    expect(singleInvalidResult.finalStatus).toBe('INSUFFICIENT_DATA');
    expect(singleInvalidResult.validItemCount).toBe(0);
  });

  it('should return the cognitive status directly when validItemCount = 1 (single valid item)', () => {
    const results: DiagnosisResult[] = [
      {
        itemId: 'item1',
        status: 'INVALID',
        integrityIndex: 0.0,
        isBelowThreshold: true,
        auditTrail: { criNormalized: 0, timeRatio: 0, classificationRule: '' },
      },
      {
        itemId: 'item2',
        status: 'PAHAM_KONSEP',
        integrityIndex: 1.0,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 1, timeRatio: 2, classificationRule: '' },
      },
    ];
    // 1 valid item → returns that item's status directly (fast-path)
    const result = aggregateMajorityVoting(results);
    expect(result.finalStatus).toBe('PAHAM_KONSEP');
    expect(result.validItemCount).toBe(1);
    expect(result.tiebreakerApplied).toBe(false);
  });

  it('should return consensus status when all 3 valid items agree', () => {
    const results: DiagnosisResult[] = [
      {
        itemId: 'item1',
        status: 'PAHAM_KONSEP',
        integrityIndex: 1.0,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 1, timeRatio: 2, classificationRule: '' },
      },
      {
        itemId: 'item2',
        status: 'PAHAM_KONSEP',
        integrityIndex: 1.0,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 1, timeRatio: 2, classificationRule: '' },
      },
      {
        itemId: 'item3',
        status: 'PAHAM_KONSEP',
        integrityIndex: 1.0,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 1, timeRatio: 2, classificationRule: '' },
      },
    ];
    const result = aggregateMajorityVoting(results);
    expect(result.finalStatus).toBe('PAHAM_KONSEP');
    expect(result.validItemCount).toBe(3);
    expect(result.tiebreakerApplied).toBe(false);
  });

  it('should return majority status in 2-1 split', () => {
    const results: DiagnosisResult[] = [
      {
        itemId: 'item1',
        status: 'LUCKY_GUESS',
        integrityIndex: 0.7,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 0.4, timeRatio: 1.5, classificationRule: '' },
      },
      {
        itemId: 'item2',
        status: 'LUCKY_GUESS',
        integrityIndex: 0.7,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 0.4, timeRatio: 1.5, classificationRule: '' },
      },
      {
        itemId: 'item3',
        status: 'PAHAM_KONSEP',
        integrityIndex: 1.0,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 1, timeRatio: 2, classificationRule: '' },
      },
    ];
    const result = aggregateMajorityVoting(results);
    expect(result.finalStatus).toBe('LUCKY_GUESS');
    expect(result.validItemCount).toBe(3);
    expect(result.tiebreakerApplied).toBe(false);
  });

  it('should apply Precedency Rule in 3-way tie (all different)', () => {
    const results: DiagnosisResult[] = [
      {
        itemId: 'item1',
        status: 'PAHAM_KONSEP',
        integrityIndex: 1.0,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 1, timeRatio: 2, classificationRule: '' },
      },
      {
        itemId: 'item2',
        status: 'LUCKY_GUESS',
        integrityIndex: 0.7,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 0.4, timeRatio: 1.5, classificationRule: '' },
      },
      {
        itemId: 'item3',
        status: 'TIDAK_PAHAM',
        integrityIndex: 0.4,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 0.2, timeRatio: 1.2, classificationRule: '' },
      },
    ];
    // Precedency: MISKONSEPSI > LUCKY_GUESS > TIDAK_PAHAM > PAHAM_KONSEP
    // Winner: LUCKY_GUESS
    const result = aggregateMajorityVoting(results);
    expect(result.finalStatus).toBe('LUCKY_GUESS');
    expect(result.validItemCount).toBe(3);
    expect(result.tiebreakerApplied).toBe(true);
  });

  it('should prioritise MISKONSEPSI in tie', () => {
    const results: DiagnosisResult[] = [
      {
        itemId: 'item1',
        status: 'MISKONSEPSI',
        integrityIndex: 0.0,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 0.8, timeRatio: 2, classificationRule: '' },
      },
      {
        itemId: 'item2',
        status: 'LUCKY_GUESS',
        integrityIndex: 0.7,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 0.4, timeRatio: 1.5, classificationRule: '' },
      },
      {
        itemId: 'item3',
        status: 'PAHAM_KONSEP',
        integrityIndex: 1.0,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 1, timeRatio: 2, classificationRule: '' },
      },
    ];
    const result = aggregateMajorityVoting(results);
    expect(result.finalStatus).toBe('MISKONSEPSI');
    expect(result.tiebreakerApplied).toBe(true);
  });

  it('should prioritise LUCKY_GUESS over TIDAK_PAHAM and PAHAM_KONSEP in tie', () => {
    const results: DiagnosisResult[] = [
      {
        itemId: 'item1',
        status: 'LUCKY_GUESS',
        integrityIndex: 0.7,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 0.4, timeRatio: 1.5, classificationRule: '' },
      },
      {
        itemId: 'item2',
        status: 'TIDAK_PAHAM',
        integrityIndex: 0.4,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 0.2, timeRatio: 1.2, classificationRule: '' },
      },
      {
        itemId: 'item3',
        status: 'PAHAM_KONSEP',
        integrityIndex: 1.0,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 1, timeRatio: 2, classificationRule: '' },
      },
    ];
    const result = aggregateMajorityVoting(results);
    expect(result.finalStatus).toBe('LUCKY_GUESS');
    expect(result.tiebreakerApplied).toBe(true);
  });

  it('should handle mix of valid and INVALID items correctly', () => {
    const results: DiagnosisResult[] = [
      {
        itemId: 'item1',
        status: 'INVALID',
        integrityIndex: 0.0,
        isBelowThreshold: true,
        auditTrail: { criNormalized: 0, timeRatio: 0, classificationRule: '' },
      },
      {
        itemId: 'item2',
        status: 'PAHAM_KONSEP',
        integrityIndex: 1.0,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 1, timeRatio: 2, classificationRule: '' },
      },
      {
        itemId: 'item3',
        status: 'PAHAM_KONSEP',
        integrityIndex: 1.0,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 1, timeRatio: 2, classificationRule: '' },
      },
    ];
    const result = aggregateMajorityVoting(results);
    expect(result.finalStatus).toBe('PAHAM_KONSEP');
    expect(result.validItemCount).toBe(2);
    expect(result.tiebreakerApplied).toBe(false);
  });

  it('should include votingTally in result', () => {
    const results: DiagnosisResult[] = [
      {
        itemId: 'item1',
        status: 'PAHAM_KONSEP',
        integrityIndex: 1.0,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 1, timeRatio: 2, classificationRule: '' },
      },
      {
        itemId: 'item2',
        status: 'LUCKY_GUESS',
        integrityIndex: 0.7,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 0.4, timeRatio: 1.5, classificationRule: '' },
      },
      {
        itemId: 'item3',
        status: 'PAHAM_KONSEP',
        integrityIndex: 1.0,
        isBelowThreshold: false,
        auditTrail: { criNormalized: 1, timeRatio: 2, classificationRule: '' },
      },
    ];
    const result = aggregateMajorityVoting(results);
    expect(result.votingTally.PAHAM_KONSEP).toBe(2);
    expect(result.votingTally.LUCKY_GUESS).toBe(1);
    expect(result.votingTally.INVALID).toBe(0);
  });
});
