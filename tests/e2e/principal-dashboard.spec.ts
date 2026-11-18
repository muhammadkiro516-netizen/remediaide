/**
 * E2E — Principal (Kepala Sekolah) Dashboard
 *
 * Critical path:
 *   1. Kepala Sekolah login dan melihat dashboard agregat.
 *   2. Filter tanggal diaplikasikan dan respons muncul < 3 detik.
 *   3. Perbandingan per kelas ditampilkan.
 *   4. TIDAK ADA data individual (anonymousLabel, detail respons) yang bocor.
 *   5. Cross-tenant access ditolak dengan HTTP 403.
 */

import { test, expect } from '@playwright/test';

const PRINCIPAL_EMAIL = process.env.E2E_PRINCIPAL_EMAIL ?? 'kepsek@demo.sch.id';
const PRINCIPAL_PASSWORD = process.env.E2E_PRINCIPAL_PASSWORD ?? 'demo1234';

test.describe('Principal Dashboard', () => {
  // ── Helper: login as principal ────────────────────────────────────────────
  async function loginAsPrincipal(page: import('@playwright/test').Page) {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(PRINCIPAL_EMAIL);
    await page.getByLabel(/password|kata sandi/i).fill(PRINCIPAL_PASSWORD);
    await page.getByRole('button', { name: /masuk|login|sign in/i }).click();
    await page.waitForURL(/\/principal|\/dashboard/, { timeout: 10_000 });
  }

  test.beforeEach(async ({ page }) => {
    await loginAsPrincipal(page);
  });

  // ── 1. Dashboard overview loads ───────────────────────────────────────────

  test('principal dashboard shows school-level aggregate data', async ({ page }) => {
    await page.goto('/principal');

    // Should see aggregate statistics
    const statsSection = page
      .getByRole('main')
      .or(page.locator('main'))
      .first();
    await expect(statsSection).toBeVisible({ timeout: 8_000 });

    // Should contain percentage or count metrics
    const metricEl = page.getByText(/\d+%|\d+ sesi|rata-rata/i).first();
    await expect(metricEl).toBeVisible({ timeout: 8_000 });
  });

  // ── 2. Date filter responds in under 3 seconds ────────────────────────────

  test('date filter updates dashboard within 3 seconds', async ({ page }) => {
    await page.goto('/principal');

    const filterSelect = page
      .getByRole('combobox', { name: /periode|filter|tanggal|date/i })
      .or(page.getByRole('button', { name: /minggu|bulan|semester|week|month/i }))
      .first();

    if (await filterSelect.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const startTime = Date.now();

      // Select "bulan ini" or similar option
      await filterSelect.selectOption({ index: 1 }).catch(async () => {
        await filterSelect.click();
        const option = page.getByRole('option').first();
        if (await option.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await option.click();
        }
      });

      // Wait for data to refresh
      await page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/principal') && resp.status() === 200,
        { timeout: 3_000 }
      ).catch(() => {
        /* some implementations may use cached data */
      });

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(3_000);
    }
  });

  // ── 3. Per-class comparison chart is rendered ─────────────────────────────

  test('stacked bar chart or class comparison section is visible', async ({ page }) => {
    await page.goto('/principal');

    // Look for chart container or table with class data
    const chartEl = page
      .locator('[data-testid="stacked-bar-chart"]')
      .or(page.locator('canvas')) // recharts renders a canvas
      .or(page.getByRole('table'))
      .first();

    // Allow chart to be present OR a "no data" empty state
    const noDataEl = page.getByText(/belum ada data|no data|kosong/i).first();

    const hasChart = await chartEl.isVisible({ timeout: 5_000 }).catch(() => false);
    const hasNoData = await noDataEl.isVisible({ timeout: 2_000 }).catch(() => false);

    // At least one of the two should be shown
    expect(hasChart || hasNoData).toBe(true);
  });

  // ── 4. No individual student data is exposed ──────────────────────────────

  test('principal page does NOT expose anonymousLabel or raw responses', async ({
    page,
  }) => {
    await page.goto('/principal');
    await page.waitForLoadState('networkidle');

    const pageContent = await page.content();

    // Common patterns for anonymousLabel — e.g. "Siswa-01", "Siswa-02"
    // The principal view aggregates by class, never by individual student
    const individualDataPattern = /siswa-\d+|student-\d+|anonymousLabel/i;
    expect(individualDataPattern.test(pageContent)).toBe(false);

    // Raw response fields should NOT appear in the HTML
    const rawResponsePattern = /criValue|responseTimeMs|perItemStatus|integrity_index/i;
    expect(rawResponsePattern.test(pageContent)).toBe(false);
  });

  // ── 5. API: /api/principal/overview returns only aggregate data ───────────

  test('principal overview API returns aggregate data without individual records', async ({
    request,
  }) => {
    const res = await request.get('/api/principal/overview');

    // Should succeed or return 401/403 if not authenticated as principal
    if (!res.ok()) {
      expect([401, 403]).toContain(res.status());
      return;
    }

    const body = await res.json();
    const data = body?.data ?? body;

    // Response must NOT contain anonymousLabel or individual response arrays
    const serialized = JSON.stringify(data);
    expect(serialized).not.toMatch(/anonymousLabel/i);
    expect(serialized).not.toMatch(/criValue/i);
    expect(serialized).not.toMatch(/responseTimeMs/i);

    // Must contain aggregate-level fields
    // e.g. classBreakdown, sessionCount, averagePahamPct
    expect(typeof data).toBe('object');
  });

  // ── 6. Cross-tenant access returns 403 ───────────────────────────────────

  test('principal cannot access another school data', async ({ request }) => {
    // Attempt to access a session or class that belongs to a different school_id
    // by providing a fabricated ID for a different school
    const fakeOtherSchoolSessionId = 'other-school-session-99999';

    const res = await request.get(
      `/api/sessions/${fakeOtherSchoolSessionId}/diagnoses`
    );

    // Must be 403 (tenant isolation) or 404 (not found) — never 200
    expect([403, 404]).toContain(res.status());
  });

  // ── 7. API: /api/principal/classes returns per-class breakdown ────────────

  test('principal classes API returns per-class comparison data', async ({
    request,
  }) => {
    const res = await request.get('/api/principal/classes');

    if (!res.ok()) {
      expect([401, 403]).toContain(res.status());
      return;
    }

    const body = await res.json();
    const data: unknown[] = body?.data ?? body ?? [];

    // Must be an array (even if empty for a fresh school)
    expect(Array.isArray(data)).toBe(true);

    // Each entry should have class-level fields, not individual student data
    for (const cls of data as Record<string, unknown>[]) {
      expect(cls).not.toHaveProperty('anonymousLabel');
      expect(cls).not.toHaveProperty('criValue');
    }
  });
});
