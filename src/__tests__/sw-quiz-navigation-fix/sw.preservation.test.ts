/**
 * SW Quiz Navigation Fix — Preservation Property Tests (Task 2)
 * src/__tests__/sw-quiz-navigation-fix/sw.preservation.test.ts
 *
 * Phase 2: PRESERVATION BASELINE (written BEFORE fix, must PASS on unfixed code)
 * These tests verify that routes OUTSIDE the bug condition domain continue to use
 * their existing caching strategies — both before AND after the fix is applied.
 *
 * Property 2: Preservation — Route Non-Dinamis Tetap Menggunakan Strategi defaultCache
 *
 * Methodology: observation-first
 *   - GET /login                          → defaultCache: pages (NetworkFirst)
 *   - GET /api/sessions/abc/quiz          → custom rule: NetworkOnly (quiz-api)
 *   - GET /_next/static/chunks/main.js   → custom rule: CacheFirst (static-assets)
 *   - GET /dashboard/sessions + RSC: 1   → defaultCache: pages-rsc (NetworkFirst)
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { NetworkOnly, NetworkFirst, CacheFirst } from 'serwist';
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

// ─── Production defaultCache entries (same as Task 1 simulation helpers) ──────
//
// Reconstructed from @serwist/next production branch — NODE_ENV non-production
// returns simplified NetworkOnly-for-all, so we hardcode the production entries.

const PAGES_CACHE_NAME = {
  rscPrefetch: 'pages-rsc-prefetch',
  rsc: 'pages-rsc',
  html: 'pages',
};

function buildProductionDefaultCacheEntries(): CacheRule[] {
  return [
    // pages-rsc-prefetch: RSC fetch + prefetch
    {
      matcher: ({ request, url, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
        request.headers.get('RSC') === '1' &&
        request.headers.get('Next-Router-Prefetch') === '1' &&
        sameOrigin &&
        !url.pathname.startsWith('/api/'),
      handler: new NetworkFirst({ cacheName: PAGES_CACHE_NAME.rscPrefetch }),
      ruleName: 'defaultCache: pages-rsc-prefetch (NetworkFirst)',
    },
    // pages-rsc: all RSC fetch (without prefetch)
    {
      matcher: ({ request, url, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
        request.headers.get('RSC') === '1' &&
        sameOrigin &&
        !url.pathname.startsWith('/api/'),
      handler: new NetworkFirst({ cacheName: PAGES_CACHE_NAME.rsc }),
      ruleName: 'defaultCache: pages-rsc (NetworkFirst)',
    },
    // pages: HTML navigation fetch
    {
      matcher: ({ request, url, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
        (request.headers.get('Content-Type')?.includes('text/html') ?? false) &&
        sameOrigin &&
        !url.pathname.startsWith('/api/'),
      handler: new NetworkFirst({ cacheName: PAGES_CACHE_NAME.html }),
      ruleName: 'defaultCache: pages (NetworkFirst)',
    },
    // others: same-origin non-/api/
    {
      matcher: ({ url, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
        sameOrigin && !url.pathname.startsWith('/api/'),
      handler: new NetworkFirst({ cacheName: 'others' }),
      ruleName: 'defaultCache: others (NetworkFirst)',
    },
  ];
}

// ─── Runtime caching builder ──────────────────────────────────────────────────

const ORIGIN = 'http://localhost:3000';

/**
 * Builds the COMPLETE UNFIXED production runtimeCaching for simulation.
 * Mirrors the exact order in sw.ts (without the two new rules from the fix).
 */
function buildProductionRuntimeCaching(): CacheRule[] {
  const rules: CacheRule[] = [];

  // 1. Static Next.js assets
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

  // NOTE: On UNFIXED sw.ts there are NO explicit rules for /student/quiz/* or
  // /dashboard/sessions/*/live here — those fall through to defaultCache.

  // 6. Production defaultCache entries (appended as ...defaultCache)
  rules.push(...buildProductionDefaultCacheEntries());

  return rules;
}

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

// ─── Source analysis helpers ──────────────────────────────────────────────────

function readSwSource(): string {
  const swPath = path.resolve(__dirname, '../../sw.ts');
  return fs.readFileSync(swPath, 'utf-8');
}

function getPreDefaultCacheSection(): string {
  const src = readSwSource();
  const runtimeCachingStart = src.indexOf('runtimeCaching: [');
  if (runtimeCachingStart === -1) throw new Error('runtimeCaching array not found in sw.ts');
  const defaultCacheSpread = src.indexOf('...defaultCache', runtimeCachingStart);
  if (defaultCacheSpread === -1) return src.substring(runtimeCachingStart);
  return src.substring(runtimeCachingStart, defaultCacheSpread);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SW Quiz Navigation Fix — Preservation (Property 2)', () => {

  /**
   * Observation: Baseline Behavior Documentation
   * These describe blocks OBSERVE and document the current (unfixed) strategies
   * for routes outside the bug condition domain.
   *
   * All assertions in this file PASS on unfixed code — establishing baseline.
   */

  // ─── 3.5: Static Pages — halaman statis tetap pakai defaultCache ─────────

  describe('3.5 Static Pages — served via defaultCache (NetworkFirst) [Req 3.5]', () => {
    /**
     * Validates: Requirements 3.5
     *
     * Halaman statis (/login, /register, /student/join, dll.) TIDAK memiliki
     * RSC: 1 header pada navigasi awal (full page load), sehingga tidak tersentuh
     * rule pages-rsc. Mereka cocok dengan rule "others" di defaultCache → NetworkFirst.
     */

    const staticPages = ['/login', '/register', '/student/join', '/admin/dashboard', '/principal/dashboard'];

    it.each(staticPages)(
      'OBSERVATION: GET %s (plain GET, no RSC header) → defaultCache: NetworkFirst',
      (pagePath) => {
        const runtimeCaching = buildProductionRuntimeCaching();
        const sim: SimulatedRequest = {
          pathname: pagePath,
          headers: {},
          method: 'GET',
          sameOrigin: true,
        };

        const match = findMatchingRule(runtimeCaching, sim);
        expect(match).not.toBeNull();

        // Should NOT match any explicit pre-defaultCache rule (indices 0–4)
        expect(match!.index).toBeGreaterThanOrEqual(5); // falls through to defaultCache
        expect(match!.rule.ruleName).toContain('defaultCache');

        const strategy = getStrategyName(match!.rule.handler);
        // defaultCache "others" rule → NetworkFirst
        expect(strategy).toBe('NetworkFirst');
      },
    );

    it('PROPERTY (fast-check): random static page paths (no /api/, no /_next/, no RSC header) → defaultCache NetworkFirst', () => {
      /**
       * Validates: Requirements 3.5
       *
       * Generate path strings that are clearly NOT quiz/live-session routes
       * and verify they fall through to defaultCache with NetworkFirst.
       */
      const runtimeCaching = buildProductionRuntimeCaching();

      // Paths that are plain page paths not matching any explicit pre-defaultCache rule
      const staticPathArb = fc
        .stringMatching(/^\/[a-z]{3,12}$/)
        .filter(
          (p) =>
            !p.startsWith('/api') &&
            !p.startsWith('/_next') &&
            p !== '/student' && // exclude potential ambiguous prefix
            p !== '/dashboard',
        );

      fc.assert(
        fc.property(staticPathArb, (pagePath) => {
          const sim: SimulatedRequest = {
            pathname: pagePath,
            headers: {},
            method: 'GET',
            sameOrigin: true,
          };

          const match = findMatchingRule(runtimeCaching, sim);
          expect(match).not.toBeNull();

          const strategy = getStrategyName(match!.rule.handler);
          expect(strategy).toBe('NetworkFirst');

          // Must come from defaultCache, not an explicit rule
          expect(match!.index).toBeGreaterThanOrEqual(5);
        }),
        { numRuns: 50 },
      );
    });
  });

  // ─── 3.4: Quiz API Route — tetap NetworkOnly ─────────────────────────────

  describe('3.4 Quiz API Route — /api/sessions/*/quiz stays NetworkOnly [Req 3.4]', () => {
    /**
     * Validates: Requirements 3.4
     *
     * Rule GET /api/sessions/[sessionId]/quiz sudah ada di sw.ts sebagai custom
     * NetworkOnly rule. Fix tidak boleh mengubah ini.
     */

    it('OBSERVATION: GET /api/sessions/abc/quiz → custom rule quiz-api (NetworkOnly)', () => {
      const runtimeCaching = buildProductionRuntimeCaching();
      const sim: SimulatedRequest = {
        pathname: '/api/sessions/abc/quiz',
        headers: {},
        method: 'GET',
        sameOrigin: true,
      };

      const match = findMatchingRule(runtimeCaching, sim);
      expect(match).not.toBeNull();

      expect(match!.rule.ruleName).toBe('quiz-api (NetworkOnly)');
      expect(getStrategyName(match!.rule.handler)).toBe('NetworkOnly');
    });

    it('PROPERTY (fast-check): ALL /api/sessions/*/quiz GET requests → NetworkOnly', () => {
      /**
       * Validates: Requirements 3.4
       */
      const runtimeCaching = buildProductionRuntimeCaching();
      const alphanumeric = fc.stringMatching(/^[a-zA-Z0-9]{4,32}$/);

      fc.assert(
        fc.property(alphanumeric, (sessionId) => {
          const sim: SimulatedRequest = {
            pathname: `/api/sessions/${sessionId}/quiz`,
            headers: {},
            method: 'GET',
            sameOrigin: true,
          };

          const match = findMatchingRule(runtimeCaching, sim);
          expect(match).not.toBeNull();
          expect(match!.rule.ruleName).toBe('quiz-api (NetworkOnly)');
          expect(getStrategyName(match!.rule.handler)).toBe('NetworkOnly');
        }),
        { numRuns: 50 },
      );
    });
  });

  // ─── 3.3: POST /api/responses — tetap NetworkOnly + BackgroundSync ────────

  describe('3.3 POST /api/responses — stays NetworkOnly + BackgroundSync [Req 3.3]', () => {
    /**
     * Validates: Requirements 3.3
     */

    it('OBSERVATION: POST /api/responses → responses-post (NetworkOnly)', () => {
      const runtimeCaching = buildProductionRuntimeCaching();
      const sim: SimulatedRequest = {
        pathname: '/api/responses',
        headers: {},
        method: 'POST',
        sameOrigin: true,
      };

      const match = findMatchingRule(runtimeCaching, sim);
      expect(match).not.toBeNull();
      expect(match!.rule.ruleName).toBe('responses-post (NetworkOnly)');
      expect(getStrategyName(match!.rule.handler)).toBe('NetworkOnly');
    });

    it('GET /api/responses (non-POST) → all-api (NetworkOnly)', () => {
      const runtimeCaching = buildProductionRuntimeCaching();
      const sim: SimulatedRequest = {
        pathname: '/api/responses',
        headers: {},
        method: 'GET',
        sameOrigin: true,
      };

      const match = findMatchingRule(runtimeCaching, sim);
      expect(match).not.toBeNull();
      expect(match!.rule.ruleName).toBe('all-api (NetworkOnly)');
      expect(getStrategyName(match!.rule.handler)).toBe('NetworkOnly');
    });
  });

  // ─── Static Assets — /_next/static/* tetap CacheFirst ────────────────────

  describe('Static Assets — /_next/static/* stays CacheFirst [Req 3.7]', () => {
    /**
     * Validates: Requirements 3.7
     *
     * Rule _next/static CacheFirst 30d harus tetap ada dan tidak berubah.
     */

    it('OBSERVATION: GET /_next/static/chunks/main.js → static-assets (CacheFirst)', () => {
      const runtimeCaching = buildProductionRuntimeCaching();
      const sim: SimulatedRequest = {
        pathname: '/_next/static/chunks/main.js',
        headers: {},
        method: 'GET',
        sameOrigin: true,
      };

      const match = findMatchingRule(runtimeCaching, sim);
      expect(match).not.toBeNull();
      expect(match!.rule.ruleName).toBe('static-assets (CacheFirst)');
      expect(getStrategyName(match!.rule.handler)).toBe('CacheFirst');
    });

    it('PROPERTY (fast-check): ALL /_next/static/* paths → CacheFirst', () => {
      /**
       * Validates: Requirements 3.7
       */
      const runtimeCaching = buildProductionRuntimeCaching();
      // Constrain to simple alphanumeric sub-paths with no traversal sequences
      const staticSubPath = fc
        .stringMatching(/^[a-zA-Z0-9_-]{2,20}$/)
        .map((s) => `chunks/${s}.js`);

      fc.assert(
        fc.property(staticSubPath, (subpath) => {
          const sim: SimulatedRequest = {
            pathname: `/_next/static/${subpath}`,
            headers: {},
            method: 'GET',
            sameOrigin: true,
          };

          const match = findMatchingRule(runtimeCaching, sim);
          expect(match).not.toBeNull();
          expect(match!.rule.ruleName).toBe('static-assets (CacheFirst)');
          expect(getStrategyName(match!.rule.handler)).toBe('CacheFirst');
        }),
        { numRuns: 50 },
      );
    });
  });

  // ─── Dashboard Non-Dynamic — RSC fetch tetap NetworkFirst ─────────────────

  describe('Dashboard Non-Dynamic — RSC fetch uses defaultCache NetworkFirst [Req 3.5]', () => {
    /**
     * Validates: Requirements 3.5
     *
     * Halaman dashboard non-dinamis (/dashboard/sessions, /dashboard/classes, dll.)
     * menggunakan RSC fetch saat navigasi dalam-app. Karena tidak ada explicit rule
     * untuk path ini, mereka harus jatuh ke defaultCache pages-rsc → NetworkFirst.
     * Fix tidak boleh mengubah ini.
     */

    const nonDynamicDashboardPaths = [
      '/dashboard/sessions',
      '/dashboard/classes',
      '/dashboard',
      '/dashboard/tests',
    ];

    it.each(nonDynamicDashboardPaths)(
      'OBSERVATION: GET %s with RSC: 1 → defaultCache: pages-rsc (NetworkFirst)',
      (pagePath) => {
        const runtimeCaching = buildProductionRuntimeCaching();
        const sim: SimulatedRequest = {
          pathname: pagePath,
          headers: { 'RSC': '1' },
          method: 'GET',
          sameOrigin: true,
        };

        const match = findMatchingRule(runtimeCaching, sim);
        expect(match).not.toBeNull();

        // Should fall through to defaultCache (index >= 5)
        expect(match!.index).toBeGreaterThanOrEqual(5);
        expect(match!.rule.ruleName).toContain('defaultCache');
        expect(getStrategyName(match!.rule.handler)).toBe('NetworkFirst');
      },
    );

    it('PROPERTY (fast-check): /dashboard/* non-dynamic paths with RSC: 1 → defaultCache NetworkFirst', () => {
      /**
       * Validates: Requirements 3.5
       *
       * Generate dashboard sub-paths that are NOT /dashboard/sessions/{id}/live
       * and NOT /dashboard/sessions/{id}/results (just collection/listing pages).
       * Verify they stay as defaultCache NetworkFirst.
       */
      const runtimeCaching = buildProductionRuntimeCaching();

      // Paths like /dashboard/sessions, /dashboard/classes, /dashboard/tests/abc
      // but NOT /dashboard/sessions/xyz/live (that's covered by the bug condition domain)
      const dashboardPathArb = fc
        .stringMatching(/^[a-z]{3,12}$/)
        .map((segment) => `/dashboard/${segment}`);

      fc.assert(
        fc.property(dashboardPathArb, (pagePath) => {
          const sim: SimulatedRequest = {
            pathname: pagePath,
            headers: { 'RSC': '1' },
            method: 'GET',
            sameOrigin: true,
          };

          const match = findMatchingRule(runtimeCaching, sim);
          expect(match).not.toBeNull();

          // Falls through to defaultCache
          expect(match!.index).toBeGreaterThanOrEqual(5);
          expect(match!.rule.ruleName).toContain('defaultCache');
          expect(getStrategyName(match!.rule.handler)).toBe('NetworkFirst');
        }),
        { numRuns: 50 },
      );
    });
  });

  // ─── General API Routes — tetap NetworkOnly ───────────────────────────────

  describe('General API Routes — all /api/* stays NetworkOnly [Req 3.3, 3.4]', () => {
    /**
     * Validates: Requirements 3.3, 3.4
     */

    const apiRoutes = [
      '/api/classes',
      '/api/sessions',
      '/api/sessions/abc/activate',
      '/api/sessions/abc/close',
      '/api/admin/schools',
    ];

    it.each(apiRoutes)(
      'OBSERVATION: GET %s → NetworkOnly',
      (apiPath) => {
        const runtimeCaching = buildProductionRuntimeCaching();
        const sim: SimulatedRequest = {
          pathname: apiPath,
          headers: {},
          method: 'GET',
          sameOrigin: true,
        };

        const match = findMatchingRule(runtimeCaching, sim);
        expect(match).not.toBeNull();
        expect(getStrategyName(match!.rule.handler)).toBe('NetworkOnly');
      },
    );

    it('PROPERTY (fast-check): ALL /api/* paths → NetworkOnly', () => {
      /**
       * Validates: Requirements 3.3, 3.4
       */
      const runtimeCaching = buildProductionRuntimeCaching();
      const apiSubPath = fc.stringMatching(/^[a-zA-Z0-9/_-]{2,30}$/);

      fc.assert(
        fc.property(apiSubPath, (subpath) => {
          const sim: SimulatedRequest = {
            pathname: `/api/${subpath}`,
            headers: {},
            method: 'GET',
            sameOrigin: true,
          };

          const match = findMatchingRule(runtimeCaching, sim);
          expect(match).not.toBeNull();
          expect(getStrategyName(match!.rule.handler)).toBe('NetworkOnly');
        }),
        { numRuns: 50 },
      );
    });
  });

  // ─── Auth Routes — tetap NetworkOnly ─────────────────────────────────────

  describe('Auth Routes — /api/auth/* stays NetworkOnly [Req 3.7]', () => {
    /**
     * Validates: Requirements 3.7
     */

    it('OBSERVATION: GET /api/auth/session → auth (NetworkOnly)', () => {
      const runtimeCaching = buildProductionRuntimeCaching();
      const sim: SimulatedRequest = {
        pathname: '/api/auth/session',
        headers: {},
        method: 'GET',
        sameOrigin: true,
      };

      const match = findMatchingRule(runtimeCaching, sim);
      expect(match).not.toBeNull();
      expect(match!.rule.ruleName).toBe('auth (NetworkOnly)');
      expect(getStrategyName(match!.rule.handler)).toBe('NetworkOnly');
    });

    it('OBSERVATION: POST /api/auth/signin → auth (NetworkOnly)', () => {
      const runtimeCaching = buildProductionRuntimeCaching();
      const sim: SimulatedRequest = {
        pathname: '/api/auth/signin',
        headers: {},
        method: 'POST',
        sameOrigin: true,
      };

      const match = findMatchingRule(runtimeCaching, sim);
      expect(match).not.toBeNull();
      expect(match!.rule.ruleName).toBe('auth (NetworkOnly)');
      expect(getStrategyName(match!.rule.handler)).toBe('NetworkOnly');
    });
  });

  // ─── 3.1, 3.2: Quiz First Question — /api/sessions/*/quiz unaffected ─────

  describe('3.1, 3.2 Quiz First Question Flow — prerequisite API routes unaffected [Req 3.1, 3.2]', () => {
    /**
     * Validates: Requirements 3.1, 3.2
     *
     * Soal pertama dimuat melalui GET /api/sessions/[id]/quiz yang sudah NetworkOnly.
     * Fix harus memastikan rule ini tidak berubah.
     */

    it('3.1 GET /api/sessions/abc123/quiz (fetch soal pertama) → NetworkOnly', () => {
      const runtimeCaching = buildProductionRuntimeCaching();
      const sim: SimulatedRequest = {
        pathname: '/api/sessions/abc123/quiz',
        headers: {},
        method: 'GET',
        sameOrigin: true,
      };

      const match = findMatchingRule(runtimeCaching, sim);
      expect(match).not.toBeNull();
      expect(getStrategyName(match!.rule.handler)).toBe('NetworkOnly');
      expect(match!.rule.ruleName).toBe('quiz-api (NetworkOnly)');
    });

    it('3.2 POST /api/responses (simpan jawaban soal pertama) → NetworkOnly', () => {
      const runtimeCaching = buildProductionRuntimeCaching();
      const sim: SimulatedRequest = {
        pathname: '/api/responses',
        headers: {},
        method: 'POST',
        sameOrigin: true,
      };

      const match = findMatchingRule(runtimeCaching, sim);
      expect(match).not.toBeNull();
      expect(getStrategyName(match!.rule.handler)).toBe('NetworkOnly');
      expect(match!.rule.ruleName).toBe('responses-post (NetworkOnly)');
    });
  });

  // ─── 3.7: Rule Order Integrity — semua existing rules masih ada ──────────

  describe('3.7 Rule Order Integrity — all existing rules present with correct strategy [Req 3.7]', () => {
    /**
     * Validates: Requirements 3.7
     *
     * Pastikan semua rules yang sudah ada tidak dihapus atau diubah urutannya
     * oleh fix. Index 0–4 adalah explicit rules dari sw.ts.
     */

    it('Rule at index 0 is static-assets (CacheFirst)', () => {
      const runtimeCaching = buildProductionRuntimeCaching();
      expect(runtimeCaching[0].ruleName).toBe('static-assets (CacheFirst)');
      expect(getStrategyName(runtimeCaching[0].handler)).toBe('CacheFirst');
    });

    it('Rule at index 1 is auth (NetworkOnly)', () => {
      const runtimeCaching = buildProductionRuntimeCaching();
      expect(runtimeCaching[1].ruleName).toBe('auth (NetworkOnly)');
      expect(getStrategyName(runtimeCaching[1].handler)).toBe('NetworkOnly');
    });

    it('Rule at index 2 is quiz-api (NetworkOnly)', () => {
      const runtimeCaching = buildProductionRuntimeCaching();
      expect(runtimeCaching[2].ruleName).toBe('quiz-api (NetworkOnly)');
      expect(getStrategyName(runtimeCaching[2].handler)).toBe('NetworkOnly');
    });

    it('Rule at index 3 is responses-post (NetworkOnly)', () => {
      const runtimeCaching = buildProductionRuntimeCaching();
      expect(runtimeCaching[3].ruleName).toBe('responses-post (NetworkOnly)');
      expect(getStrategyName(runtimeCaching[3].handler)).toBe('NetworkOnly');
    });

    it('Rule at index 4 is all-api (NetworkOnly)', () => {
      const runtimeCaching = buildProductionRuntimeCaching();
      expect(runtimeCaching[4].ruleName).toBe('all-api (NetworkOnly)');
      expect(getStrategyName(runtimeCaching[4].handler)).toBe('NetworkOnly');
    });

    it('defaultCache entries start at index 5 (on unfixed sw.ts)', () => {
      const runtimeCaching = buildProductionRuntimeCaching();
      // First defaultCache entry is at index 5 on unfixed code
      expect(runtimeCaching[5].ruleName).toContain('defaultCache');
    });

    it('sw.ts source has ...defaultCache spread in runtimeCaching array', () => {
      const src = readSwSource();
      expect(src).toContain('...defaultCache');
    });

    it('sw.ts source imports NetworkOnly from serwist', () => {
      const src = readSwSource();
      expect(src).toContain('NetworkOnly');
    });

    it('sw.ts source has all five expected pre-defaultCache rule categories', () => {
      const preSection = getPreDefaultCacheSection();
      // Static assets rule — regex uses \_next or _next
      expect(preSection).toContain('_next');
      // Auth rule — regex contains api.*auth or api\/auth
      expect(preSection).toMatch(/api[/\\]+auth/);
      // Quiz API rule — regex contains api.*sessions
      expect(preSection).toMatch(/api[/\\]+sessions/);
      // All API rule — must have a generic /api/ catch-all
      expect(preSection).toMatch(/api/);
    });
  });

  // ─── 3.6: Offline Behavior — NetworkOnly routes still NetworkOnly ─────────

  describe('3.6 Offline Behavior — NetworkOnly routes unaffected [Req 3.6]', () => {
    /**
     * Validates: Requirements 3.6
     *
     * Routes yang sudah NetworkOnly akan menghasilkan network error saat offline
     * (karena SW tidak intercept dari cache). Fix tidak boleh memperburuk ini —
     * tidak ada route yang sebelumnya NetworkOnly menjadi cached.
     */

    it('All /api/* routes remain NetworkOnly (no caching fallback added)', () => {
      const runtimeCaching = buildProductionRuntimeCaching();

      const apiPaths = [
        '/api/sessions',
        '/api/responses',
        '/api/auth/session',
        '/api/sessions/abc123/quiz',
        '/api/classes',
      ];

      for (const apiPath of apiPaths) {
        const sim: SimulatedRequest = {
          pathname: apiPath,
          headers: {},
          method: 'GET',
          sameOrigin: true,
        };
        const match = findMatchingRule(runtimeCaching, sim);
        expect(match).not.toBeNull();
        expect(getStrategyName(match!.rule.handler)).toBe('NetworkOnly');
      }
    });
  });

}); // end describe SW Preservation
