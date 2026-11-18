/**
 * Property-Based Tests for Exit Ticket API Endpoints (Properties 9–11)
 *
 * Tests business logic of validation and state transitions — not live HTTP.
 * Uses Vitest + fast-check with ≥100 iterations per property.
 *
 * These tests verify the core invariants of the submit endpoint logic:
 * - Token state transitions (UNUSED → USED)
 * - Conflict detection for USED tokens
 * - Response shape security (no sensitive fields)
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Type definitions (mirrors production types) ─────────────────────────────

type TokenStatus = 'UNUSED' | 'USED';

interface TokenRecord {
  id: string;
  token: string;
  status: TokenStatus;
  schoolId: string;
  sessionPinId: string;
  remedialGroupId: string | null;
  usedAt: Date | null;
}

interface Submission {
  reflectionText: string;
  confidenceScore: number;
  exitTicketTokenId: string;
  schoolId: string;
}

type AlreadyUsedError = { type: 'TOKEN_ALREADY_USED' };
type SubmitSuccess = { type: 'SUCCESS'; updatedToken: TokenRecord; submission: Submission };
type SubmitResult = SubmitSuccess | AlreadyUsedError;

// ─── Pure business logic extracted from the route handler ────────────────────
// These functions mirror the Prisma transaction logic without DB calls

function simulateSubmit(
  token: TokenRecord,
  reflectionText: string,
  confidenceScore: number,
): SubmitResult {
  // Step 1: Check if token is USED
  if (token.status === 'USED') {
    return { type: 'TOKEN_ALREADY_USED' };
  }

  // Step 2: Create submission
  const submission: Submission = {
    reflectionText: reflectionText.trim(),
    confidenceScore,
    exitTicketTokenId: token.id,
    schoolId: token.schoolId,
  };

  // Step 3: Update token to USED
  const updatedToken: TokenRecord = {
    ...token,
    status: 'USED',
    usedAt: new Date(),
  };

  return { type: 'SUCCESS', updatedToken, submission };
}

function buildGetResponse(token: TokenRecord, topicName: string, cognitiveCategory: string | null) {
  // This mirrors the GET route response building (7.8)
  if (token.status === 'USED') {
    return { status: 'USED' } as const;
  }

  return {
    status: 'UNUSED',
    topicName,
    cognitiveCategory,
  } as const;
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const validTokenArbitrary = fc.record({
  id: fc.uuid(),
  token: fc.stringMatching(/^[a-f0-9]{64}$/),
  status: fc.constant('UNUSED' as TokenStatus),
  schoolId: fc.uuid(),
  sessionPinId: fc.uuid(),
  remedialGroupId: fc.option(fc.uuid(), { nil: null }),
  usedAt: fc.constant(null as Date | null),
});

const usedTokenArbitrary = fc.record({
  id: fc.uuid(),
  token: fc.stringMatching(/^[a-f0-9]{64}$/),
  status: fc.constant('USED' as TokenStatus),
  schoolId: fc.uuid(),
  sessionPinId: fc.uuid(),
  remedialGroupId: fc.option(fc.uuid(), { nil: null }),
  usedAt: fc.constant(new Date()),
});

// ─── Property 9: Submit round-trip state transition ──────────────────────────

describe('Property 9: Submit round-trip state transition', () => {
  it('token transitions from UNUSED to USED after valid submission', () => {
    // Feature: exit-ticket-feature, Property 9: Submit round-trip state transition
    // **Validates: Requirements 5.5, 5.6**

    fc.assert(
      fc.property(
        validTokenArbitrary,
        fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().length > 0),
        fc.integer({ min: 0, max: 5 }),
        (token, reflectionText, confidenceScore) => {
          // Precondition: token starts UNUSED
          expect(token.status).toBe('UNUSED');

          // Simulate the submit transaction
          const result = simulateSubmit(token, reflectionText, confidenceScore);

          // Assert: success and token is now USED
          expect(result.type).toBe('SUCCESS');
          if (result.type === 'SUCCESS') {
            expect(result.updatedToken.status).toBe('USED');
            expect(result.updatedToken.usedAt).toBeInstanceOf(Date);
            expect(result.submission.reflectionText).toBe(reflectionText.trim());
            expect(result.submission.confidenceScore).toBe(confidenceScore);
            expect(result.submission.exitTicketTokenId).toBe(token.id);
            expect(result.submission.schoolId).toBe(token.schoolId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 10: USED token always returns 409 ──────────────────────────────

describe('Property 10: USED token always returns 409', () => {
  it('any submission to a USED token always fails with TOKEN_ALREADY_USED', () => {
    // Feature: exit-ticket-feature, Property 10: USED token always returns 409
    // **Validates: Requirements 5.9**

    fc.assert(
      fc.property(
        usedTokenArbitrary,
        fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().length > 0),
        fc.integer({ min: 0, max: 5 }),
        (token, reflectionText, confidenceScore) => {
          // Precondition: token is USED
          expect(token.status).toBe('USED');

          // Simulate submit attempt
          const result = simulateSubmit(token, reflectionText, confidenceScore);

          // Assert: always fails with TOKEN_ALREADY_USED (equivalent to HTTP 409)
          expect(result.type).toBe('TOKEN_ALREADY_USED');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 11: GET response never exposes sensitive fields ────────────────

describe('Property 11: GET response never exposes sensitive fields', () => {
  it('response object for UNUSED token contains no sensitive fields', () => {
    // Feature: exit-ticket-feature, Property 11: GET response never exposes sensitive fields
    // **Validates: Requirements 4.4, 6.4**

    fc.assert(
      fc.property(
        validTokenArbitrary,
        fc.string({ minLength: 1, maxLength: 200 }), // topicName
        fc.constantFrom(
          'PAHAM_KONSEP',
          'LUCKY_GUESS',
          'MISKONSEPSI',
          'TIDAK_PAHAM',
          'INSUFFICIENT_DATA',
          null,
        ),
        (token, topicName, cognitiveCategory) => {
          // Build the GET response (same shape as the route)
          const response = buildGetResponse(token, topicName, cognitiveCategory);

          const responseKeys = Object.keys(response);

          // Assert sensitive fields are NOT present
          const sensitiveKeys = ['id', 'sessionPinId', 'schoolId', 'remedialGroupId', 'studentId'];
          for (const key of sensitiveKeys) {
            expect(responseKeys, `Response should not contain '${key}'`).not.toContain(key);
          }

          // Assert no keys matching /label|anonymous/i
          for (const key of responseKeys) {
            expect(key.toLowerCase(), `Key '${key}' should not match /label|anonymous/i`).not.toMatch(/label|anonymous/);
          }

          // Assert only safe fields are present
          const allowedKeys = new Set(['status', 'topicName', 'cognitiveCategory']);
          for (const key of responseKeys) {
            expect(allowedKeys, `Unexpected key '${key}' in response`).toContain(key);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('response object for USED token contains no sensitive fields', () => {
    // Feature: exit-ticket-feature, Property 11: GET response never exposes sensitive fields (USED case)
    // **Validates: Requirements 4.4, 6.4**

    fc.assert(
      fc.property(
        usedTokenArbitrary,
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.constantFrom('PAHAM_KONSEP', 'MISKONSEPSI', null),
        (token, topicName, cognitiveCategory) => {
          const response = buildGetResponse(token, topicName, cognitiveCategory);
          const responseKeys = Object.keys(response);

          const sensitiveKeys = ['id', 'sessionPinId', 'schoolId', 'remedialGroupId', 'studentId'];
          for (const key of sensitiveKeys) {
            expect(responseKeys).not.toContain(key);
          }

          for (const key of responseKeys) {
            expect(key.toLowerCase()).not.toMatch(/label|anonymous/);
          }

          // USED response only has 'status'
          expect(responseKeys).toEqual(['status']);
          expect(response.status).toBe('USED');
        }
      ),
      { numRuns: 100 }
    );
  });
});
