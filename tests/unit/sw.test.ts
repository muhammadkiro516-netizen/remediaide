/**
 * SW Quiz Navigation Fix - Unit Tests for runtimeCaching Rule Order & Strategy
 * tests/unit/sw.test.ts
 *
 * Task 3.2 - SOURCE ANALYSIS unit tests.
 * Reads src/sw.ts as text and asserts on its rule order, strategies, and matchers.
 * These tests do NOT execute the Service Worker at runtime.
 *
 * What is tested:
 *   1. Rule for /student/quiz/* is present with the correct regex matcher
 *   2. Rule for /student/quiz/* uses NetworkOnly (not NetworkFirst)
 *   3. Rule for /dashboard/sessions/[id]/live uses NetworkOnly
 *   4. Both new rules appear BEFORE ...defaultCache in the array
 *   5. Edge cases: trailing slash, query params (regexp coverage)
 *   6. All existing rules are present and in the correct order
 *
 * Requirements: 2.4, 3.7
 *
 * **Validates: Requirements 2.4, 3.7**
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Source loading
// ---------------------------------------------------------------------------

const SW_PATH = path.resolve(__dirname, '../../src/sw.ts');

let swSource: string;

beforeAll(() => {
  swSource = fs.readFileSync(SW_PATH, 'utf-8');
});

// ---------------------------------------------------------------------------
// Matcher literals as they appear in sw.ts source text
// In sw.ts regex literals use single backslash: /^\/student\/quiz\/.*/
// In a JS string to search for that text we need to escape the backslash: /^\\/.../
// ---------------------------------------------------------------------------

// These are the EXACT string snippets as they appear literally in sw.ts:
const MATCHERS = {
  static:   String.raw`/^\/_next\/static\/.*/`,
  auth:     String.raw`/^\/api\/auth\/.*/`,
  quizApi:  String.raw`/\/api\/sessions\/[^/]+\/quiz/`,
  apiAll:   String.raw`/^\/api\/.*/`,
  studentQuiz: String.raw`/^\/student\/quiz\/.*/`,
  liveSession: String.raw`/^\/dashboard\/sessions\/[^/]+\/live/`,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the runtimeCaching array content from swSource.
 * Returns the text between "runtimeCaching: [" and the end of the array.
 */
function getRuntimeCachingBlock(): string {
  const start = swSource.indexOf('runtimeCaching: [');
  if (start === -1) throw new Error('runtimeCaching array not found in sw.ts');
  let depth = 0;
  let i = start + 'runtimeCaching: ['.length - 1; // position of opening '['
  while (i < swSource.length) {
    if (swSource[i] === '[') depth++;
    if (swSource[i] === ']') {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }
  return swSource.slice(start, i + 1);
}

/**
 * Returns the sub-string of the runtimeCaching block BEFORE the ACTUAL ...defaultCache spread.
 * This is where explicit pre-defaultCache rules live.
 *
 * Note: ...defaultCache can appear in comments too (e.g., "Must be BEFORE ...defaultCache").
 * We find the actual spread by looking for the pattern that is NOT preceded by a comment marker.
 * The actual spread is on its own line (preceded by whitespace, not "//").
 */
function getPreDefaultCacheSection(): string {
  const block = getRuntimeCachingBlock();
  // Find all occurrences of ...defaultCache
  let searchFrom = 0;
  while (searchFrom < block.length) {
    const idx = block.indexOf('...defaultCache', searchFrom);
    if (idx === -1) break;
    // Check if this occurrence is in a comment (preceded by // on the same line)
    const lineStart = block.lastIndexOf('\n', idx) + 1;
    const linePrefix = block.slice(lineStart, idx).trim();
    if (!linePrefix.startsWith('//')) {
      // This is the actual spread, not a comment
      return block.slice(0, idx);
    }
    searchFrom = idx + 1;
  }
  return block; // fallback
}

/**
 * Returns the position of the ACTUAL ...defaultCache spread in a runtimeCaching block string.
 * Skips occurrences that are inside comments (lines starting with //).
 */
function findActualDefaultCachePos(block: string): number {
  let searchFrom = 0;
  while (searchFrom < block.length) {
    const idx = block.indexOf('...defaultCache', searchFrom);
    if (idx === -1) return -1;
    const lineStart = block.lastIndexOf('\n', idx) + 1;
    const linePrefix = block.slice(lineStart, idx).trim();
    if (!linePrefix.startsWith('//')) {
      return idx;
    }
    searchFrom = idx + 1;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// 1. Presence of the new rules
// ---------------------------------------------------------------------------

describe('Rule presence - /student/quiz/* and /dashboard/sessions/*/live', () => {
  it('sw.ts contains a matcher for student quiz pages', () => {
    expect(swSource).toContain(MATCHERS.studentQuiz);
  });

  it('sw.ts contains a matcher for dashboard live session pages', () => {
    expect(swSource).toContain(MATCHERS.liveSession);
  });

  it('runtimeCaching block contains both new matchers', () => {
    const block = getRuntimeCachingBlock();
    expect(block).toContain(MATCHERS.studentQuiz);
    expect(block).toContain(MATCHERS.liveSession);
  });
});

// ---------------------------------------------------------------------------
// 2. Strategy: both new rules use NetworkOnly
// ---------------------------------------------------------------------------

describe('Strategy - new rules must use NetworkOnly, not NetworkFirst', () => {
  /**
   * Validates: Requirements 2.4, 3.7
   */

  it('/student/quiz/* rule uses NetworkOnly', () => {
    const block = getPreDefaultCacheSection();
    const ruleStart = block.indexOf(MATCHERS.studentQuiz);
    expect(ruleStart, 'student quiz matcher not found in pre-defaultCache section').toBeGreaterThan(-1);

    const ruleFragment = block.slice(ruleStart, ruleStart + 400);
    expect(ruleFragment).toContain('NetworkOnly');
    expect(ruleFragment).not.toContain('NetworkFirst');
  });

  it('/student/quiz/* handler is new NetworkOnly() instance', () => {
    const block = getPreDefaultCacheSection();
    const ruleStart = block.indexOf(MATCHERS.studentQuiz);
    const ruleFragment = block.slice(ruleStart, ruleStart + 400);

    expect(ruleFragment).toMatch(/handler\s*:\s*new NetworkOnly\s*\(/);
  });

  it('/dashboard/sessions/[id]/live rule uses NetworkOnly', () => {
    const block = getPreDefaultCacheSection();
    const ruleStart = block.indexOf(MATCHERS.liveSession);
    expect(ruleStart, 'live session matcher not found in pre-defaultCache section').toBeGreaterThan(-1);

    const ruleFragment = block.slice(ruleStart, ruleStart + 400);
    expect(ruleFragment).toContain('NetworkOnly');
    expect(ruleFragment).not.toContain('NetworkFirst');
  });

  it('/dashboard/sessions/[id]/live handler is new NetworkOnly() instance', () => {
    const block = getPreDefaultCacheSection();
    const ruleStart = block.indexOf(MATCHERS.liveSession);
    const ruleFragment = block.slice(ruleStart, ruleStart + 400);

    expect(ruleFragment).toMatch(/handler\s*:\s*new NetworkOnly\s*\(/);
  });
});

// ---------------------------------------------------------------------------
// 3. Ordering: new rules must come BEFORE ...defaultCache
// ---------------------------------------------------------------------------

describe('Rule ordering - new rules must appear before ...defaultCache', () => {
  /**
   * Validates: Requirements 2.4, 3.7
   *
   * The fix depends on explicit rules being placed before defaultCache.
   * If they appear after, defaultCache rules take priority and the bug persists.
   */

  it('/student/quiz/* rule is in the pre-defaultCache section', () => {
    const preSection = getPreDefaultCacheSection();
    expect(preSection).toContain(MATCHERS.studentQuiz);
  });

  it('/dashboard/sessions/[id]/live rule is in the pre-defaultCache section', () => {
    const preSection = getPreDefaultCacheSection();
    expect(preSection).toContain(MATCHERS.liveSession);
  });

  it('student quiz rule position < defaultCache position in runtimeCaching block', () => {
    const block = getRuntimeCachingBlock();
    const quizRulePos = block.indexOf(MATCHERS.studentQuiz);
    const defaultCachePos = findActualDefaultCachePos(block);

    expect(quizRulePos, 'student quiz matcher not found').toBeGreaterThan(-1);
    expect(defaultCachePos, '...defaultCache not found').toBeGreaterThan(-1);
    expect(quizRulePos).toBeLessThan(defaultCachePos);
  });

  it('live session rule position < defaultCache position in runtimeCaching block', () => {
    const block = getRuntimeCachingBlock();
    const liveRulePos = block.indexOf(MATCHERS.liveSession);
    const defaultCachePos = findActualDefaultCachePos(block);

    expect(liveRulePos, 'live session matcher not found').toBeGreaterThan(-1);
    expect(defaultCachePos, '...defaultCache not found').toBeGreaterThan(-1);
    expect(liveRulePos).toBeLessThan(defaultCachePos);
  });

  it('both new rules appear after the generic /api/* catch-all rule', () => {
    const block = getRuntimeCachingBlock();
    const apiAllRulePos = block.indexOf(MATCHERS.apiAll);
    const quizRulePos = block.indexOf(MATCHERS.studentQuiz);
    const liveRulePos = block.indexOf(MATCHERS.liveSession);

    expect(apiAllRulePos).toBeGreaterThan(-1);
    expect(quizRulePos).toBeGreaterThan(apiAllRulePos);
    expect(liveRulePos).toBeGreaterThan(apiAllRulePos);
  });
});

// ---------------------------------------------------------------------------
// 4. Regex edge cases
// ---------------------------------------------------------------------------

describe('Regex edge cases - student quiz matcher', () => {
  // The exact regex that should be in sw.ts
  const QUIZ_REGEX = /^\/student\/quiz\/.*/;

  it('matches basic quiz path: /student/quiz/abc123', () => {
    expect(QUIZ_REGEX.test('/student/quiz/abc123')).toBe(true);
  });

  it('matches path with trailing slash: /student/quiz/abc123/', () => {
    expect(QUIZ_REGEX.test('/student/quiz/abc123/')).toBe(true);
  });

  it('matches sub-path: /student/quiz/abc123/complete', () => {
    expect(QUIZ_REGEX.test('/student/quiz/abc123/complete')).toBe(true);
  });

  it('matches pathname when URL has query params (/student/quiz/abc123?foo=bar)', () => {
    // Service Workers test URL.pathname against regex matchers, not the full href.
    const url = new URL('/student/quiz/abc123?foo=bar', 'http://localhost');
    expect(QUIZ_REGEX.test(url.pathname)).toBe(true);
  });

  it('does NOT match /student/join (unrelated student path)', () => {
    expect(QUIZ_REGEX.test('/student/join')).toBe(false);
  });

  it('does NOT match /api/sessions/abc/quiz (quiz API route, not quiz page)', () => {
    expect(QUIZ_REGEX.test('/api/sessions/abc/quiz')).toBe(false);
  });

  it('does NOT match /student/quiz (missing session id segment)', () => {
    expect(QUIZ_REGEX.test('/student/quiz')).toBe(false);
  });
});

describe('Regex edge cases - live session matcher', () => {
  const LIVE_REGEX = /^\/dashboard\/sessions\/[^/]+\/live/;

  it('matches basic live session path: /dashboard/sessions/xyz/live', () => {
    expect(LIVE_REGEX.test('/dashboard/sessions/xyz/live')).toBe(true);
  });

  it('matches alphanumeric session id: /dashboard/sessions/abc123/live', () => {
    expect(LIVE_REGEX.test('/dashboard/sessions/abc123/live')).toBe(true);
  });

  it('matches pathname when URL has query params (/dashboard/sessions/abc123/live?tab=overview)', () => {
    const url = new URL('/dashboard/sessions/abc123/live?tab=overview', 'http://localhost');
    expect(LIVE_REGEX.test(url.pathname)).toBe(true);
  });

  it('does NOT match /dashboard/sessions (no session id)', () => {
    expect(LIVE_REGEX.test('/dashboard/sessions')).toBe(false);
  });

  it('does NOT match /dashboard/sessions/xyz/results (different sub-page)', () => {
    expect(LIVE_REGEX.test('/dashboard/sessions/xyz/results')).toBe(false);
  });

  it('does NOT match /dashboard/sessions//live (empty id - [^/]+ requires 1+ chars)', () => {
    expect(LIVE_REGEX.test('/dashboard/sessions//live')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Existing rule preservation
// ---------------------------------------------------------------------------

describe('Existing rule preservation - all rules still present and correctly ordered', () => {
  /**
   * Validates: Requirements 3.7
   *
   * Ensures no existing rule was accidentally removed or reordered.
   *
   * Expected order in runtimeCaching:
   *   1. /_next/static/*       - CacheFirst (static-assets)
   *   2. /api/auth/*           - NetworkOnly
   *   3. /api/sessions/id/quiz - NetworkOnly
   *   4. POST /api/responses   - NetworkOnly + BackgroundSync
   *   5. /api/*                - NetworkOnly
   *   6. /student/quiz/*       - NetworkOnly [NEW]
   *   7. /dashboard/sessions/id/live - NetworkOnly [NEW]
   *   8. ...defaultCache
   */

  it('rule 1 present: /_next/static/* with CacheFirst strategy and static-assets cache name', () => {
    const block = getRuntimeCachingBlock();
    expect(block).toContain(MATCHERS.static);
    const ruleStart = block.indexOf(MATCHERS.static);
    const ruleFragment = block.slice(ruleStart, ruleStart + 400);
    expect(ruleFragment).toContain('CacheFirst');
    expect(ruleFragment).toContain('static-assets');
  });

  it('rule 2 present: /api/auth/* with NetworkOnly strategy', () => {
    const block = getRuntimeCachingBlock();
    expect(block).toContain(MATCHERS.auth);
    const ruleStart = block.indexOf(MATCHERS.auth);
    const ruleFragment = block.slice(ruleStart, ruleStart + 200);
    expect(ruleFragment).toContain('NetworkOnly');
  });

  it('rule 3 present: /api/sessions/[id]/quiz with NetworkOnly strategy', () => {
    const block = getRuntimeCachingBlock();
    expect(block).toContain(MATCHERS.quizApi);
    const ruleStart = block.indexOf(MATCHERS.quizApi);
    const ruleFragment = block.slice(ruleStart, ruleStart + 200);
    expect(ruleFragment).toContain('NetworkOnly');
  });

  it('rule 4 present: POST /api/responses with BackgroundSyncPlugin', () => {
    expect(swSource).toContain('/api/responses');
    expect(swSource).toContain('BackgroundSyncPlugin');
    expect(swSource).toContain('bgSyncPlugin');
  });

  it('rule 5 present: /api/* catch-all with NetworkOnly strategy', () => {
    const block = getRuntimeCachingBlock();
    expect(block).toContain(MATCHERS.apiAll);
    const ruleStart = block.indexOf(MATCHERS.apiAll);
    const ruleFragment = block.slice(ruleStart, ruleStart + 200);
    expect(ruleFragment).toContain('NetworkOnly');
  });

  it('...defaultCache spread is present in runtimeCaching', () => {
    const block = getRuntimeCachingBlock();
    expect(findActualDefaultCachePos(block)).toBeGreaterThan(-1);
  });

  it('ordering: static assets rule is before auth rule', () => {
    const block = getRuntimeCachingBlock();
    const staticPos = block.indexOf(MATCHERS.static);
    const authPos = block.indexOf(MATCHERS.auth);
    expect(staticPos).toBeLessThan(authPos);
  });

  it('ordering: auth rule is before generic /api/* catch-all', () => {
    const block = getRuntimeCachingBlock();
    const authPos = block.indexOf(MATCHERS.auth);
    const apiAllPos = block.indexOf(MATCHERS.apiAll);
    expect(authPos).toBeLessThan(apiAllPos);
  });

  it('ordering: quiz API rule is before generic /api/* catch-all', () => {
    const block = getRuntimeCachingBlock();
    const quizApiPos = block.indexOf(MATCHERS.quizApi);
    const apiAllPos = block.indexOf(MATCHERS.apiAll);
    expect(quizApiPos).toBeLessThan(apiAllPos);
  });

  it('ordering: /student/quiz/* rule is before /dashboard/sessions/*/live rule', () => {
    const block = getRuntimeCachingBlock();
    const quizPos = block.indexOf(MATCHERS.studentQuiz);
    const livePos = block.indexOf(MATCHERS.liveSession);
    expect(quizPos).toBeLessThan(livePos);
  });

  it('ordering: both new rules come before ...defaultCache', () => {
    const block = getRuntimeCachingBlock();
    const quizPos = block.indexOf(MATCHERS.studentQuiz);
    const livePos = block.indexOf(MATCHERS.liveSession);
    const defaultPos = findActualDefaultCachePos(block);

    expect(quizPos).toBeLessThan(defaultPos);
    expect(livePos).toBeLessThan(defaultPos);
  });

  it('complete sequence check: static < auth < quizApi < apiAll < studentQuiz < live < defaultCache', () => {
    const block = getRuntimeCachingBlock();

    const positions = {
      static: block.indexOf(MATCHERS.static),
      auth: block.indexOf(MATCHERS.auth),
      quizApi: block.indexOf(MATCHERS.quizApi),
      apiAll: block.indexOf(MATCHERS.apiAll),
      studentQuiz: block.indexOf(MATCHERS.studentQuiz),
      liveSession: block.indexOf(MATCHERS.liveSession),
      defaultCache: findActualDefaultCachePos(block),
    };

    // All rules must be found
    for (const [name, pos] of Object.entries(positions)) {
      expect(pos, `Rule "${name}" must be present in runtimeCaching`).toBeGreaterThan(-1);
    }

    // Ordering invariants
    expect(positions.static).toBeLessThan(positions.auth);
    expect(positions.auth).toBeLessThan(positions.quizApi);
    expect(positions.quizApi).toBeLessThan(positions.apiAll);
    expect(positions.apiAll).toBeLessThan(positions.studentQuiz);
    expect(positions.studentQuiz).toBeLessThan(positions.liveSession);
    expect(positions.liveSession).toBeLessThan(positions.defaultCache);
  });
});

// ---------------------------------------------------------------------------
// 6. Structural sanity checks
// ---------------------------------------------------------------------------

describe('Structural sanity - sw.ts imports and Serwist configuration', () => {
  it('NetworkOnly is imported from serwist', () => {
    // sw.ts uses a multi-symbol import from serwist that includes NetworkOnly
    expect(swSource).toContain('NetworkOnly');
    // Confirm it is in an import statement (not just mentioned in a comment)
    const lines = swSource.split('\n');
    const importLineWithNetworkOnly = lines.find(
      (line) => line.trim().startsWith('import') && line.includes('NetworkOnly')
        || (line.includes('NetworkOnly') && lines.some(
          (l) => l.includes('import') && l.includes('serwist') && l.includes('{')
        ))
    );
    // Check for multi-line import block containing NetworkOnly
    const importBlock = swSource.match(/import\s*\{[^}]+\}\s*from\s*["']serwist["']/s);
    expect(importBlock).not.toBeNull();
    expect(importBlock![0]).toContain('NetworkOnly');
  });

  it('sw.ts does not use string shorthand strategies (Serwist 9.x requires class instances)', () => {
    expect(swSource).not.toMatch(/handler\s*:\s*["']NetworkOnly["']/);
    expect(swSource).not.toMatch(/handler\s*:\s*["']NetworkFirst["']/);
    expect(swSource).not.toMatch(/handler\s*:\s*["']CacheFirst["']/);
  });

  it('Serwist instance is created with runtimeCaching config', () => {
    expect(swSource).toContain('new Serwist(');
    expect(swSource).toContain('runtimeCaching');
  });

  it('sw.ts calls serwist.addEventListeners()', () => {
    expect(swSource).toContain('serwist.addEventListeners()');
  });
});
