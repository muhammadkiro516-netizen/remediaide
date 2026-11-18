/**
 * Property-Based Tests for Exit Ticket Theme Utilities
 * 
 * Using Vitest + fast-check with ≥100 iterations per property
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  CATEGORY_THEMES,
  CONFIDENCE_LABELS,
  isValidReflectionText,
  type CognitiveGroupType,
} from './theme';

// ─── Property 6: CATEGORY_THEMES completeness ─────────────────────────────────

describe('Property 6: CATEGORY_THEMES completeness', () => {
  // Feature: exit-ticket-feature, Property 6: CATEGORY_THEMES completeness
  // **Validates: Requirements 3.1, 3.2, 3.5**
  
  const allCategories: CognitiveGroupType[] = [
    'PAHAM_KONSEP',
    'MISKONSEPSI',
    'LUCKY_GUESS',
    'TIDAK_PAHAM',
    'INSUFFICIENT_DATA',
  ];
  
  it('has non-empty reflectionQuestion and bgClass for all categories', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allCategories),
        (category) => {
          const theme = CATEGORY_THEMES[category];
          
          const hasReflectionQuestion = typeof theme.reflectionQuestion === 'string' &&
            theme.reflectionQuestion.length > 0;
          
          const hasBgClass = typeof theme.bgClass === 'string' &&
            theme.bgClass.length > 0;
          
          return hasReflectionQuestion && hasBgClass;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 7: CONFIDENCE_LABELS completeness ───────────────────────────────

describe('Property 7: CONFIDENCE_LABELS completeness', () => {
  // Feature: exit-ticket-feature, Property 7: CONFIDENCE_LABELS completeness
  // **Validates: Requirements 3.4**
  
  it('has non-empty string labels for all confidence scores 0-5', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        (n) => {
          const label = CONFIDENCE_LABELS[n];
          return typeof label === 'string' && label.length > 0;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 8: isValidReflectionText rejects whitespace-only ────────────────

describe('Property 8: isValidReflectionText rejects whitespace-only', () => {
  // Feature: exit-ticket-feature, Property 8: isValidReflectionText rejects whitespace-only
  // **Validates: Requirements 5.3**
  
  it('rejects strings containing only whitespace characters', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 1000 }).map(arr => arr.join('')),
        (s) => {
          return !isValidReflectionText(s);
        }
      ),
      { numRuns: 100 }
    );
  });
});
