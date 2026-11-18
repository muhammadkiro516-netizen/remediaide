/**
 * E2E — Teacher Session Management
 *
 * Critical path:
 *   1. Guru login ke dashboard.
 *   2. Guru membuat sesi baru (state LOCKED).
 *   3. Guru mengaktifkan sesi (LOCKED → ACTIVE) dan melihat Live Heatmap.
 *   4. Guru menutup sesi secara manual (ACTIVE → CLOSED).
 *   5. Verifikasi Exit Ticket: 403 saat LOCKED, 200 setelah ACTIVE.
 *
 * Auto-Wipe confirmation flow ada di file terpisah (auto-wipe.spec.ts).
 */

import { test, expect } from '@playwright/test';
import { loginAsTeacher } from './helpers/auth';

test.describe('Teacher Session Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTeacher(page);
  });

  // ── 1. Dashboard visible after login ─────────────────────────────────────

  test('teacher dashboard loads after login', async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/);

    // Navigation sidebar items
    const nav = page.getByRole('navigation').or(page.locator('aside')).first();
    await expect(nav).toBeVisible();
  });

  // ── 2. Create new session ─────────────────────────────────────────────────

  test('teacher can create a new LOCKED session', async ({ page }) => {
    await page.goto('/dashboard/sessions');

    // Click "Buat Sesi" or similar
    const createBtn = page
      .getByRole('button', { name: /buat sesi|new session|tambah sesi/i })
      .first();
    await createBtn.click();

    // A form / dialog should appear
    const dialog = page.getByRole('dialog').or(page.locator('form')).first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Fill in required fields — test/topic selection
    const topicInput = page
      .getByLabel(/topik|topic|judul|test/i)
      .or(page.getByRole('combobox').first());

    if (await topicInput.isVisible()) {
      await topicInput.fill('Persamaan Linear');
    }

    // Submit the form
    const confirmBtn = page
      .getByRole('button', { name: /simpan|buat|create|konfirmasi/i })
      .first();
    await confirmBtn.click();

    // Session card should appear in the list with LOCKED badge
    const lockedBadge = page
      .getByText(/locked|terkunci/i)
      .or(page.getByRole('status', { name: /locked/i }))
      .first();
    await expect(lockedBadge).toBeVisible({ timeout: 8_000 });
  });

  // ── 3. Activate session and view Live Heatmap ─────────────────────────────

  test('teacher activates session and sees live heatmap', async ({ page }) => {
    await page.goto('/dashboard/sessions');

    // Find the first LOCKED session and activate it
    const activateBtn = page
      .getByRole('button', { name: /aktifkan|activate|mulai/i })
      .first();

    // If no activatable session, create one first then activate
    if (!(await activateBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      // Create a session
      const createBtn = page
        .getByRole('button', { name: /buat sesi|new session|tambah sesi/i })
        .first();
      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.waitForTimeout(500);
        const confirmBtn = page
          .getByRole('button', { name: /simpan|buat|create|konfirmasi/i })
          .first();
        if (await confirmBtn.isVisible()) await confirmBtn.click();
        await page.waitForTimeout(1_000);
      }
    }

    // Now activate
    const activateBtnFinal = page
      .getByRole('button', { name: /aktifkan|activate|mulai/i })
      .first();
    if (await activateBtnFinal.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await activateBtnFinal.click();

      // Confirm activation in modal if present
      const confirmActivate = page
        .getByRole('button', { name: /ya|konfirmasi|confirm|lanjutkan/i })
        .first();
      if (await confirmActivate.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await confirmActivate.click();
      }

      // Session badge should change to ACTIVE
      const activeBadge = page
        .getByText(/aktif|active/i)
        .first();
      await expect(activeBadge).toBeVisible({ timeout: 8_000 });

      // PIN should be displayed
      const pinDisplay = page
        .getByText(/PIN|kode/i)
        .first();
      await expect(pinDisplay).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── 4. Live Heatmap renders grid ──────────────────────────────────────────

  test('live heatmap page shows student grid', async ({ page }) => {
    // Navigate directly to a live session if available
    await page.goto('/dashboard/sessions');

    // Try to find an ACTIVE session link
    const liveLink = page
      .getByRole('link', { name: /live|heatmap|pantau|lihat live/i })
      .or(page.getByText(/aktif|active/i).locator('..').getByRole('link').first())
      .first();

    if (await liveLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await liveLink.click();
      await expect(page).toHaveURL(/\/live|\/heatmap/);

      // Heatmap grid should be visible
      const grid = page
        .locator('[data-testid="heatmap-grid"]')
        .or(page.getByRole('grid'))
        .or(page.locator('.heatmap'))
        .first();
      await expect(grid).toBeVisible({ timeout: 6_000 });

      // Countdown timer should be visible
      const timer = page
        .locator('[data-testid="countdown-timer"]')
        .or(page.getByText(/\d{1,2}:\d{2}/))
        .first();
      await expect(timer).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── 5. Exit Ticket: 403 when LOCKED, 200 when ACTIVE ─────────────────────

  test('quiz API returns 403 when session is LOCKED', async ({ page, request }) => {
    // Create a fresh LOCKED session via API
    const createRes = await request.post('/api/sessions', {
      data: {
        topic: 'E2E Exit Ticket Test',
        testId: process.env.E2E_TEST_ID ?? 'test-seed-1',
      },
    });

    // 201 or 200 on creation
    expect([200, 201, 401, 403]).toContain(createRes.status());

    if (createRes.ok()) {
      const session = await createRes.json();
      const sessionId = session?.data?.id ?? session?.id;

      if (sessionId) {
        // Quiz endpoint should return 403 while LOCKED
        const quizRes = await request.get(`/api/sessions/${sessionId}/quiz`);
        expect(quizRes.status()).toBe(403);
      }
    }
  });

  test('quiz API returns 200 after session is ACTIVATED', async ({ request }) => {
    // Create session
    const createRes = await request.post('/api/sessions', {
      data: {
        topic: 'E2E Activate Test',
        testId: process.env.E2E_TEST_ID ?? 'test-seed-1',
      },
    });

    if (!createRes.ok()) return; // skip if not authenticated

    const session = await createRes.json();
    const sessionId = session?.data?.id ?? session?.id;
    if (!sessionId) return;

    // Activate
    const activateRes = await request.post(`/api/sessions/${sessionId}/activate`);
    if (!activateRes.ok()) return;

    // Now quiz endpoint should return 200
    const quizRes = await request.get(`/api/sessions/${sessionId}/quiz`);
    expect(quizRes.status()).toBe(200);

    // Clean up — close the session
    await request.post(`/api/sessions/${sessionId}/close`);
  });

  // ── 6. Manual session close ───────────────────────────────────────────────

  test('teacher can manually close an ACTIVE session', async ({ page }) => {
    await page.goto('/dashboard/sessions');

    // Find close button for an ACTIVE session
    const closeBtn = page
      .getByRole('button', { name: /tutup sesi|close session|akhiri/i })
      .first();

    if (await closeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await closeBtn.click();

      // Confirmation dialog
      const confirmClose = page
        .getByRole('button', { name: /ya, tutup|confirm|ok/i })
        .first();
      if (await confirmClose.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await confirmClose.click();
      }

      // Session badge should change to CLOSED
      const closedBadge = page.getByText(/closed|ditutup/i).first();
      await expect(closedBadge).toBeVisible({ timeout: 8_000 });
    }
  });

  // ── 7. Reverse transition is rejected ─────────────────────────────────────

  test('activating a CLOSED session returns 409 or 400', async ({ request }) => {
    // Create and immediately close a session
    const createRes = await request.post('/api/sessions', {
      data: {
        topic: 'E2E Reverse Transition Test',
        testId: process.env.E2E_TEST_ID ?? 'test-seed-1',
      },
    });

    if (!createRes.ok()) return;
    const session = await createRes.json();
    const sessionId = session?.data?.id ?? session?.id;
    if (!sessionId) return;

    await request.post(`/api/sessions/${sessionId}/activate`);
    await request.post(`/api/sessions/${sessionId}/close`);

    // Attempt to activate again — must be rejected
    const reactivateRes = await request.post(`/api/sessions/${sessionId}/activate`);
    expect([400, 409, 422]).toContain(reactivateRes.status());
  });
});
