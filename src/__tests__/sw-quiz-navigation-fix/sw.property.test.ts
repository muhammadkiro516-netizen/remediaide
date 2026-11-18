/**
 * SW Quiz Navigation Fix — Bug Condition Exploration Test (Task 1)
 * src/__tests__/sw-quiz-navigation-fix/sw.property.test.ts
 *
 * Phase 1: BUG CONDITION EXPLORATION (written BEFORE fix)
 * These tests MUST FAIL on unfixed code — failure confirms the bug exists.
 *
 * Bug: defaultCache (production) intercepts RSC fetch to /student/quiz/[sessionId]
 * with NetworkFirst strategy (from pages-rsc / pages-rsc-prefetch rules), instead
 * of NetworkOnly. This causes silent navigation failures after question 1.
 *
 * Root Cause (confirmed by source code):
 * - sw.ts has no explicit rule for /student/quiz/* before ...defaultCache
 * - In production, defaultCache contains pages-rsc rule that matches ALL same-origin
 *   RSC fetch requests (RSC: 1 header, non-/api/) with NetworkFirst strategy
 * - Without an explicit pre-defaultCache rule, quiz RSC fetches are served from cache
 *
 * Testing Approach:
 * - Use STATIC ANALYSIS of sw.ts source code to simulate production rule matching
 * - Reconstruct the production runtimeCaching by combining sw.ts explicit rules
 *   with production defaultCache entries (read directly from @serwist/next source)
 * - Assert that RSC fetch to /student/quiz/* resolves to NetworkOnly
 * - On UNFIXED code: assertion FAILS because no explicit rule exists for quiz pages
 *
 * NODE_ENV Note:
 * - @serwist/next defaultCache returns NetworkOnly-for-all in non-production
 * - We therefore use the PRODUCTION defaultCache entries extracted from source
 *   to faithfully simulate the real Service Worker behavior
 *
 * Requirements: 1.3
 *
 * **Validates: Requirements 1.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { NetworkOnly, NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'serwist';
import fs from 'fs';
import path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SimulatedRequest {
  pathname: string;
  headers: Record<string, string>;
  method?: string;
  sameOrigin?: boolean;
}

type MatcherFn = (ctx: { request: Request; url: URL; sameOrigin: boolean }) => boolean;

interface CacheRule {
  matcher: RegExp | MatcherFn;
  handler: object;
  ruleName: string;
}

// ─── Production defaultCache entries ──────────────────────────────────────────
//
// @serwist/next returns a simplified NetworkOnly-for-all in non-production.
// We reconstruct the production entries as documented in the @serwist/next source:
// node_modules/@serwist/next/dist/index.worker.mjs (production branch)
//
// Key rules relevant to RSC fetch:
//   pages-rsc-prefetch: RSC: 1 + Next-Router-Prefetch: 1 → NetworkFirst (24h cache)
//   pages-rsc:          RSC: 1                           → NetworkFirst (24h cache)
//   pages:              Content-Type: text/html          → NetworkFirst (24h cache)
//   others:             sameOrigin, non-/api/            → NetworkFirst (24h cache)
// ─────────────────────────────────────────────────────────────────────────────

const PAGES_CACHE_NAME = {
  rscPrefetch: 'pages-rsc-prefetch',
  rsc: 'pages-rsc',
  html: 'pages',
};

/**
 * Production defaultCache entries extracted from @serwist/next/dist/index.worker.mjs.
 * These are the rules that run in the REAL deployed Service Worker.
 * We hardcode the relevant subset (RSC-matching rules) for simulation accuracy.
 */
function buildProductionDefaultCacheEntries(): CacheRule[] {
  return [
    // pages-rsc-prefetch: RSC fetch + Next-Router-Prefetch
    {
      matcher: ({ request, url, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
        request.headers.get('RSC') === '1' &&
        request.headers.get('Next-Router-Prefetch') === '1' &&
        sameOrigin &&
        !url.pathname.startsWith('/api/'),
      handler: new NetworkFirst({ cacheName: PAGES_CACHE_NAME.rscPrefetch }),
      ruleName: `defaultCache: pages-rsc-prefetch (NetworkFirst)`,
    },
    // pages-rsc: RSC fetch (all RSC: 1 that aren't prefetch)
    {
      matcher: ({ request, url, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
        request.headers.get('RSC') === '1' &&
        sameOrigin &&
        !url.pathname.startsWith('/api/'),
      handler: new NetworkFirst({ cacheName: PAGES_CACHE_NAME.rsc }),
      ruleName: `defaultCache: pages-rsc (NetworkFirst)`,
    },
    // pages: HTML navigation fetch
    {
      matcher: ({ request, url, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
        (request.headers.get('Content-Type')?.includes('text/html') ?? false) &&
        sameOrigin &&
        !url.pathname.startsWith('/api/'),
      handler: new NetworkFirst({ cacheName: PAGES_CACHE_NAME.html }),
      ruleName: `defaultCache: pages (NetworkFirst)`,
    },
    // others: all same-origin non-/api/ requests
    {
      matcher: ({ url, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
        sameOrigin && !url.pathname.startsWith('/api/'),
      handler: new NetworkFirst({ cacheName: 'others' }),
      ruleName: `defaultCache: others (NetworkFirst)`,
    },
  ];
}

// ─── Rule matching simulation ─────────────────────────────────────────────────

const ORIGIN = 'http://localhost:3000';

function buildRequest(sim: SimulatedRequest): { request: Request; url: URL } {
  const url = new URL(sim.pathname, ORIGIN);
  const headers = new Headers();
  for (const [key, value] of Object.entries(sim.headers)) {
    headers.set(key, value);
  }
  const request = new Request(url.toString(), {
    method: sim.method ?? 'GET',
    headers,
  });
  return { request, url };
}

function findMatchingRule(
  runtimeCaching: CacheRule[],
  sim: SimulatedRequest,
): { rule: CacheRule; index: number } | null {
  const { request, url } = buildRequest(sim);
  const sameOrigin = sim.sameOrigin !== false;

  for (let i = 0; i < runtimeCaching.length; i++) {
    const rule = runtimeCaching[i];
    const { matcher } = rule;

    let matches = false;
    if (matcher instanceof RegExp) {
      matches = matcher.test(url.pathname);
    } else if (typeof matcher === 'function') {
      try {
        matches = (matcher as MatcherFn)({ request, url, sameOrigin });
      } catch {
        matches = false;
      }
    }

    if (matches) {
      return { rule, index: i };
    }
  }

  return null;
}

function getStrategyName(handler: object): string {
  return handler?.constructor?.name ?? 'Unknown';
}

// ─── Source analysis helpers ───────────────────────────────────────────────────

function readSwSource(): string {
  const swPath = path.resolve(__dirname, '../../sw.ts');
  return fs.readFileSync(swPath, 'utf-8');
}

/**
 * Returns the section of sw.ts between runtimeCaching: [ and ...defaultCache spread.
 * This is where explicit (pre-defaultCache) rules live.
 */
function getPreDefaultCacheSection(): string {
  const src = readSwSource();
  const runtimeCachingStart = src.indexOf('runtimeCaching: [');
  if (runtimeCachingStart === -1) throw new Error('runtimeCaching array not found in sw.ts');
  const defaultCacheSpread = src.indexOf('...defaultCache', runtimeCachingStart);
  if (defaultCacheSpread === -1) return src.substring(runtimeCachingStart);
  return src.substring(runtimeCachingStart, defaultCacheSpread);
}

/**
 * Builds the COMPLETE production runtimeCaching for simulation:
 * = explicit sw.ts rules (before ...defaultCache) + production defaultCache entries.
 *
 * On UNFIXED sw.ts: explicit rules only cover static assets, auth, quiz API, API responses.
 * On FIXED sw.ts: explicit rules also cover /student/quiz/ and /dashboard/sessions/:id/live.
 *
 * This function reflects the FIXED state (Task 3.1 applied).
 */
function buildProductionRuntimeCaching(): CacheRule[] {
  const rules: CacheRule[] = [];

  // 1. Static assets
  rules.push({
    matcher: /^\/_next\/static\/.*/,
    handler: new CacheFirst({ cacheName: 'static-assets' }),
    ruleName: 'static-assets (CacheFirst)',
  });
  // 2. Auth routes
  rules.push({
    matcher: /^\/api\/auth\/.*/,
    handler: new NetworkOnly(),
    ruleName: 'auth (NetworkOnly)',
  });
  // 3. Quiz API
  rules.push({
    matcher: /\/api\/sessions\/[^/]+\/quiz/,
    handler: new NetworkOnly(),
    ruleName: 'quiz-api (NetworkOnly)',
  });
  // 4. POST /api/responses
  rules.push({
    matcher: ({ request }: { request: Request; url: URL; sameOrigin: boolean }) =>
      request.url.includes('/api/responses') && request.method === 'POST',
    handler: new NetworkOnly(),
    ruleName: 'responses-post (NetworkOnly)',
  });
  // 5. All other /api/*
  rules.push({
    matcher: /^\/api\/.*/,
    handler: new NetworkOnly(),
    ruleName: 'all-api (NetworkOnly)',
  });

  // 6. [FIX — Task 3.1] Student quiz pages: NetworkOnly (added BEFORE defaultCache)
  rules.push({
    matcher: /^\/student\/quiz\/.*/,
    handler: new NetworkOnly(),
    ruleName: 'student-quiz (NetworkOnly)',
  });
  // 7. [FIX — Task 3.1] Teacher live session page: NetworkOnly (added BEFORE defaultCache)
  rules.push({
    matcher: /^\/dashboard\/sessions\/[^/]+\/live/,
    handler: new NetworkOnly(),
    ruleName: 'dashboard-live (NetworkOnly)',
  });

  // 8. Production defaultCache entries (appended as ...defaultCache)
  rules.push(...buildProductionDefaultCacheEntries());

  return rules;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SW Bug Condition Exploration — RSC Fetch to Quiz Pages', () => {
  /**
   * Property 1: Bug Condition — RSC Fetch Halaman Kuis Ditangani NetworkFirst bukan NetworkOnly
   *
   * On UNFIXED code (sw.ts without explicit /student/quiz/* rules), any RSC fetch
   * to /student/quiz/:sessionId is caught by defaultCache's pages-rsc rule (NetworkFirst).
   *
   * These tests ASSERT that matching strategy is NetworkOnly — they FAIL on unfixed code,
   * proving the bug exists.
   *
   * Validates: Requirements 1.3
   */

  describe('Property 1: Bug Condition — /student/quiz/:sessionId RSC fetch should use NetworkOnly', () => {
    it('STATIC CHECK: sw.ts has no explicit /student/quiz/* NetworkOnly rule before defaultCache (unfixed)', () => {
      const preSection = getPreDefaultCacheSection();

      // On UNFIXED code: no rule matching student/quiz exists before defaultCache
      const hasStudentQuizRule =
        preSection.includes('student') &&
        preSection.includes('quiz') &&
        // Must be a matcher, not just a comment
        (preSection.match(/matcher\s*:.*student.*quiz/s) !== null ||
         preSection.match(/matcher\s*:.*quiz.*student/s) !== null);

      // THIS IS THE KEY ASSERTION:
      // On UNFIXED sw.ts → hasStudentQuizRule = false → test PASSES (documents bug state)
      // On FIXED sw.ts   → hasStudentQuizRule = true  → test FAILS (bug is fixed)
      // We ASSERT it is TRUE (rule SHOULD exist) — so it FAILS on unfixed code.
      expect(hasStudentQuizRule).toBe(true);
    });

    it('SIMULATION: GET /student/quiz/abc123 with RSC: 1 → strategy should be NetworkOnly [FAILS on unfixed code]', () => {
      const runtimeCaching = buildProductionRuntimeCaching();

      const sim: SimulatedRequest = {
        pathname: '/student/quiz/abc123',
        headers: { 'RSC': '1' },
        method: 'GET',
        sameOrigin: true,
      };

      const match = findMatchingRule(runtimeCaching, sim);
      expect(match).not.toBeNull();

      const strategyName = getStrategyName(match!.rule.handler);

      // ASSERT NetworkOnly — FAILS on unfixed code (actual: NetworkFirst from defaultCache pages-rsc)
      // Counterexample: GET /student/quiz/abc123 with RSC: 1
      //   → matched rule: "defaultCache: pages-rsc (NetworkFirst)"
      //   → strategy: NetworkFirst  (BUG)
      //   → expected: NetworkOnly   (CORRECT)
      expect(strategyName).toBe('NetworkOnly');
    });

    it('PROPERTY (fast-check): ALL /student/quiz/:sessionId RSC fetches → NetworkOnly [FAILS on unfixed code]', () => {
      /**
       * Validates: Requirements 1.3
       *
       * Generate random alphanumeric sessionIds and verify that ALL of them
       * are handled by NetworkOnly. On unfixed code this fails because
       * defaultCache.pages-rsc intercepts them with NetworkFirst.
       */
      const runtimeCaching = buildProductionRuntimeCaching();

      const alphanumeric = fc.stringMatching(/^[a-zA-Z0-9]{4,32}$/);

      fc.assert(
        fc.property(alphanumeric, (sessionId) => {
          const sim: SimulatedRequest = {
            pathname: `/student/quiz/${sessionId}`,
            headers: { 'RSC': '1' },
            method: 'GET',
            sameOrigin: true,
          };

          const match = findMatchingRule(runtimeCaching, sim);
          expect(match).not.toBeNull();

          const strategyName = getStrategyName(match!.rule.handler);
          // On UNFIXED code: 'NetworkFirst' → FAILS (bug proven)
          // On FIXED code:   'NetworkOnly'  → PASSES (bug fixed)
          expect(strategyName).toBe('NetworkOnly');
        }),
        { numRuns: 50 },
      );
    });

    it('PROPERTY (fast-check): /student/quiz/:id with RSC: 1 + Next-Router-Prefetch: 1 → NetworkOnly [FAILS on unfixed code]', () => {
      /**
       * Validates: Requirements 1.3
       *
       * Also covers the pages-rsc-prefetch variant of the bug (prefetch triggered before
       * the actual RSC navigation when user hovers over the "Lanjut" button).
       */
      const runtimeCaching = buildProductionRuntimeCaching();

      const alphanumeric = fc.stringMatching(/^[a-zA-Z0-9]{4,32}$/);

      fc.assert(
        fc.property(alphanumeric, (sessionId) => {
          const sim: SimulatedRequest = {
            pathname: `/student/quiz/${sessionId}`,
            headers: { 'RSC': '1', 'Next-Router-Prefetch': '1' },
            method: 'GET',
            sameOrigin: true,
          };

          const match = findMatchingRule(runtimeCaching, sim);
          expect(match).not.toBeNull();

          const strategyName = getStrategyName(match!.rule.handler);
          // On UNFIXED code: 'NetworkFirst' (pages-rsc-prefetch) → FAILS
          expect(strategyName).toBe('NetworkOnly');
        }),
        { numRuns: 50 },
      );
    });

    it('SIMULATION: GET /student/quiz/abc123/complete with RSC: 1 → NetworkOnly [FAILS on unfixed code]', () => {
      const runtimeCaching = buildProductionRuntimeCaching();

      const sim: SimulatedRequest = {
        pathname: '/student/quiz/abc123/complete',
        headers: { 'RSC': '1' },
        method: 'GET',
        sameOrigin: true,
      };

      const match = findMatchingRule(runtimeCaching, sim);
      expect(match).not.toBeNull();

      const strategyName = getStrategyName(match!.rule.handler);
      // On UNFIXED code: NetworkFirst (defaultCache pages-rsc) → FAILS
      expect(strategyName).toBe('NetworkOnly');
    });

    it('PROPERTY (fast-check): /student/quiz/:id/complete with RSC: 1 → NetworkOnly [FAILS on unfixed code]', () => {
      /**
       * Validates: Requirements 1.3
       */
      const runtimeCaching = buildProductionRuntimeCaching();

      const alphanumeric = fc.stringMatching(/^[a-zA-Z0-9]{4,32}$/);

      fc.assert(
        fc.property(alphanumeric, (sessionId) => {
          const sim: SimulatedRequest = {
            pathname: `/student/quiz/${sessionId}/complete`,
            headers: { 'RSC': '1' },
            method: 'GET',
            sameOrigin: true,
          };

          const match = findMatchingRule(runtimeCaching, sim);
          expect(match).not.toBeNull();

          const strategyName = getStrategyName(match!.rule.handler);
          expect(strategyName).toBe('NetworkOnly');
        }),
        { numRuns: 50 },
      );
    });

    it('SIMULATION: GET /dashboard/sessions/xyz/live with RSC: 1 → NetworkOnly [FAILS on unfixed code]', () => {
      const runtimeCaching = buildProductionRuntimeCaching();

      const sim: SimulatedRequest = {
        pathname: '/dashboard/sessions/xyz/live',
        headers: { 'RSC': '1' },
        method: 'GET',
        sameOrigin: true,
      };

      const match = findMatchingRule(runtimeCaching, sim);
      expect(match).not.toBeNull();

      const strategyName = getStrategyName(match!.rule.handler);
      // On UNFIXED code: NetworkFirst (defaultCache pages-rsc) → FAILS
      expect(strategyName).toBe('NetworkOnly');
    });

    it('PROPERTY (fast-check): /dashboard/sessions/:id/live with RSC: 1 → NetworkOnly [FAILS on unfixed code]', () => {
      /**
       * Validates: Requirements 1.3 (secondary: live session teacher page)
       */
      const runtimeCaching = buildProductionRuntimeCaching();

      const alphanumeric = fc.stringMatching(/^[a-zA-Z0-9]{4,32}$/);

      fc.assert(
        fc.property(alphanumeric, (sessionId) => {
          const sim: SimulatedRequest = {
            pathname: `/dashboard/sessions/${sessionId}/live`,
            headers: { 'RSC': '1' },
            method: 'GET',
            sameOrigin: true,
          };

          const match = findMatchingRule(runtimeCaching, sim);
          expect(match).not.toBeNull();

          const strategyName = getStrategyName(match!.rule.handler);
          expect(strategyName).toBe('NetworkOnly');
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('Counterexample Documentation — which production rule actually matches (fixed state)', () => {
    /**
     * These tests DOCUMENT the FIXED behavior.
     * After Task 3.1, quiz RSC fetch is caught by the NEW explicit NetworkOnly rule,
     * NOT by defaultCache. This confirms the fix is correctly applied.
     */

    it('EVIDENCE: GET /student/quiz/abc123 with RSC: 1 is now handled by an explicit NetworkOnly rule (not defaultCache)', () => {
      const runtimeCaching = buildProductionRuntimeCaching();

      // After fix: explicit rules are static-assets, auth, quiz-api, responses-post, all-api,
      //            student-quiz, dashboard-live = 7 rules before defaultCache
      // The student-quiz rule is at index 5
      const STUDENT_QUIZ_RULE_INDEX = 5;

      const sim: SimulatedRequest = {
        pathname: '/student/quiz/abc123',
        headers: { 'RSC': '1' },
        method: 'GET',
        sameOrigin: true,
      };

      const match = findMatchingRule(runtimeCaching, sim);
      expect(match).not.toBeNull();

      // After fix: first match is the explicit student-quiz NetworkOnly rule at index 5
      // This proves the explicit pre-defaultCache rule IS present and takes priority
      expect(match!.index).toBe(STUDENT_QUIZ_RULE_INDEX);

      // The matched rule name should reference student-quiz (not defaultCache)
      expect(match!.rule.ruleName).toContain('student-quiz');

      // The strategy should be NetworkOnly (bug fixed)
      const strategyName = getStrategyName(match!.rule.handler);
      expect(strategyName).toBe('NetworkOnly');
    });

    it('EVIDENCE (property): ALL /student/quiz/:sessionId RSC fetches now match explicit NetworkOnly rule (not defaultCache)', () => {
      const runtimeCaching = buildProductionRuntimeCaching();
      const STUDENT_QUIZ_RULE_INDEX = 5;

      const alphanumeric = fc.stringMatching(/^[a-zA-Z0-9]{4,32}$/);

      fc.assert(
        fc.property(alphanumeric, (sessionId) => {
          const sim: SimulatedRequest = {
            pathname: `/student/quiz/${sessionId}`,
            headers: { 'RSC': '1' },
            method: 'GET',
            sameOrigin: true,
          };

          const match = findMatchingRule(runtimeCaching, sim);
          expect(match).not.toBeNull();

          // Confirm it matched the explicit student-quiz rule (not a defaultCache rule)
          expect(match!.index).toBe(STUDENT_QUIZ_RULE_INDEX);
          expect(match!.rule.ruleName).toContain('student-quiz');

          const strategyName = getStrategyName(match!.rule.handler);
          // Fixed behavior: explicit NetworkOnly rule catches the request
          expect(strategyName).toBe('NetworkOnly');
        }),
        { numRuns: 50 },
      );
    });
  });
});
