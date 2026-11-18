/**
 * Property-Based Tests for Exit Ticket Token Utilities
 * 
 * Using Vitest + fast-check with ≥100 iterations per property
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  generateToken,
  buildQrUrl,
  isValidTokenFormat,
} from './token';

// ─── Property 1: Token uniqueness ─────────────────────────────────────────────

describe('Property 1: Token generation produces unique values', () => {
  // Feature: exit-ticket-feature, Property 1: Token generation produces unique values
  // **Validates: Requirements 1.2, 6.1**
  
  it('generates 100 unique tokens with no duplicates', () => {
    const tokens: string[] = [];
    
    for (let i = 0; i < 100; i++) {
      tokens.push(generateToken());
    }
    
    const uniqueTokens = new Set(tokens);
    expect(uniqueTokens.size).toBe(tokens.length);
    expect(uniqueTokens.size).toBe(100);
  });
});

// ─── Property 2: Token format ─────────────────────────────────────────────────

describe('Property 2: Token format is always valid', () => {
  // Feature: exit-ticket-feature, Property 2: Token format is always valid
  // **Validates: Requirements 1.1, 6.1**
  
  it('generates tokens that are always exactly 64 hex characters', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const token = generateToken();
        return (
          token.length === 64 &&
          /^[0-9a-f]{64}$/.test(token)
        );
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 3: buildQrUrl path correctness ──────────────────────────────────

describe('Property 3: buildQrUrl produces correct path', () => {
  // Feature: exit-ticket-feature, Property 3: buildQrUrl produces correct path
  // **Validates: Requirements 1.4, 2.2, 2.4**
  
  it('produces URLs with correct path and protocol', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9-]{8,64}$/),
        fc.constantFrom('https://a.com', 'http://b.io'),
        (token, base) => {
          const result = buildQrUrl(token, base);
          
          // Assert contains /exit-ticket/${token} exactly
          const expectedPath = `/exit-ticket/${token}`;
          const containsPath = result.includes(expectedPath);
          
          // Assert starts with http:// or https://
          const hasProtocol = result.startsWith('http://') || result.startsWith('https://');
          
          return containsPath && hasProtocol;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 4: buildQrUrl trailing slash normalization ──────────────────────

describe('Property 4: buildQrUrl eliminates trailing slashes', () => {
  // Feature: exit-ticket-feature, Property 4: buildQrUrl eliminates trailing slashes
  // **Validates: Requirements 2.3**
  
  it('never produces // after :// when base URL has trailing slashes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('https://app.com', 'http://b.io'),
        fc.integer({ min: 1, max: 5 }),
        fc.stringMatching(/^[a-zA-Z0-9-]{8,32}$/),
        (base, slashCount, token) => {
          const baseWithSlashes = base + '/'.repeat(slashCount);
          const result = buildQrUrl(token, baseWithSlashes);
          
          // After the protocol (://), there should be no double slashes
          const afterProtocol = result.substring(result.indexOf('://') + 3);
          const hasDoubleSlash = afterProtocol.includes('//');
          
          return !hasDoubleSlash;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 5: isValidTokenFormat rejects invalid tokens ────────────────────

describe('Property 5: isValidTokenFormat rejects invalid tokens', () => {
  // Feature: exit-ticket-feature, Property 5: isValidTokenFormat rejects invalid tokens
  // **Validates: Requirements 4.3**
  
  it('rejects tokens that are too short (< 8 chars)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 7 }),
        (token) => {
          return isValidTokenFormat(token) === false;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  it('rejects tokens that are too long (> 128 chars)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 129, maxLength: 200 }),
        (token) => {
          return isValidTokenFormat(token) === false;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  it('rejects tokens with invalid characters (not [a-zA-Z0-9-])', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 8, maxLength: 128 }).filter(s => /[^a-zA-Z0-9-]/.test(s)),
        (token) => {
          return isValidTokenFormat(token) === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});
