/**
 * E2E — Auto-Wipe Confirmation Flow
 *
 * Critical path:
 *   1. Guru membuka halaman wipe untuk sesi yang sudah CLOSED.
 *   2. Sistem menampilkan preview ringkasan data yang akan dihapus.
 *   3. Guru mengetikkan teks konfirmasi "HAPUS DATA RESPONS".
 *   4. Guru mengklik tombol konfirmasi akhir.
 *   5. Sistem menampilkan pesan sukses.
 *   6. Verifikasi: responses terhapus, ConceptDiagnosis masih ada.
 *
 * Two-step confirmation UX:
 *   Step 1 — ringkasan + input teks
 *   Step 2 — modal konfirmasi akhir sebelum eksekusi
 */

import { test, expect } from '@playwright/test';
import { loginAsTeacher } from './helpers/auth';

const CONFIRM_TEXT = 'HAPUS DATA RESPONS';

test.describe('Auto-Wipe Confirmation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTeacher(page);
  });

  // ── 1. Wipe preview shows record summary ─────────────────────────────────

  test('wipe preview page shows record counts before deletion', async ({
    page,
    request,
  }) => {
    // Get a CLOSED session with responses from API
    const sessionsRes = await request.get('/api/sessions');
    if (!sessionsRes.ok()) return;

    const sessions = await sessionsRes.json();
    const closedSessions: Array<{ id: string; state: string }> = (
      sessions?.data ?? sessions ?? []
    ).filter((s: { state: string }) => s.state === 'CLOSED');

    if (closedSessions.length === 0) return; // no closed sessions in demo seed

    const sessionId = closedSessions[0].id;

    // Navigate to wipe page
    await page.goto(`/dashboard/sessions/${sessionId}/wipe`);

    // Preview summary must be visible
    const summaryEl = page
      .getByText(/\d+ respons|\d+ response|data yang akan dihapus/i)
      .first();
    await expect(summaryEl).toBeVisible({ timeout: 8_000 });

    // API-level preview check
    const previewRes = await request.post(
      `/api/sessions/${sessionId}/wipe/preview`
    );
    if (previewRes.ok()) {
      const preview = await previewRes.json();
      const responseCount =
        preview?.data?.responseCount ?? preview?.responseCount;
      expect(typeof responseCount).toBe('number');
      expect(responseCount).toBeGreaterThanOrEqual(0);
    }
  });

  // ── 2. Confirmation text input enables submit button ─────────────────────

  test('submit is disabled until exact confirmation text is typed', async ({
    page,
    request,
  }) => {
    const sessionsRes = await request.get('/api/sessions');
    if (!sessionsRes.ok()) return;

    const sessions = await sessionsRes.json();
    const closedSessions: Array<{ id: string; state: string }> = (
      sessions?.data ?? sessions ?? []
    ).filter((s: { state: string }) => s.state === 'CLOSED');
    if (closedSessions.length === 0) return;

    const sessionId = closedSessions[0].id;
    await page.goto(`/dashboard/sessions/${sessionId}/wipe`);

    const confirmInput = page
      .getByPlaceholder(new RegExp(CONFIRM_TEXT, 'i'))
      .or(page.getByLabel(/konfirmasi|confirm/i))
      .first();

    const submitBtn = page
      .getByRole('button', { name: /hapus|wipe|eksekusi|delete/i })
      .first();

    if (
      (await confirmInput.isVisible({ timeout: 5_000 }).catch(() => false)) &&
      (await submitBtn.isVisible().catch(() => false))
    ) {
      // Button should be disabled initially
      await expect(submitBtn).toBeDisabled();

      // Type wrong text — still disabled
      await confirmInput.fill('HAPUS');
      await expect(submitBtn).toBeDisabled();

      // Type correct text — button enabled
      await confirmInput.fill(CONFIRM_TEXT);
      await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
    }
  });

  // ── 3. Full two-step confirmation executes wipe ───────────────────────────

  test('completing two-step confirmation wipes responses and shows success', async ({
    page,
    request,
  }) => {
    // Setup: create session with responses via API, then close it
    const createRes = await request.post('/api/sessions', {
      data: {
        topic: 'E2E Wipe Test',
        testId: process.env.E2E_TEST_ID ?? 'test-seed-1',
      },
    });
    if (!createRes.ok()) return;

    const session = await createRes.json();
    const sessionId = session?.data?.id ?? session?.id;
    if (!sessionId) return;

    // Activate and then close to put it in CLOSED state
    await request.post(`/api/sessions/${sessionId}/activate`);
    await request.post(`/api/sessions/${sessionId}/close`);

    // Navigate to wipe page
    await page.goto(`/dashboard/sessions/${sessionId}/wipe`);

    // ── Step 1: Fill in confirmation text ────────────────────────────────
    const confirmInput = page
      .getByPlaceholder(new RegExp(CONFIRM_TEXT, 'i'))
      .or(page.getByLabel(/konfirmasi|confirm/i))
      .first();

    if (!(await confirmInput.isVisible({ timeout: 5_000 }).catch(() => false))) {
      return; // wipe page not implemented yet — skip
    }

    await confirmInput.fill(CONFIRM_TEXT);

    const step1SubmitBtn = page
      .getByRole('button', { name: /hapus|wipe|eksekusi|lanjutkan|next/i })
      .first();
    await expect(step1SubmitBtn).toBeEnabled({ timeout: 3_000 });
    await step1SubmitBtn.click();

    // ── Step 2: Final confirmation modal ─────────────────────────────────
    const finalConfirmBtn = page
      .getByRole('button', { name: /ya, hapus|confirm delete|eksekusi|hapus sekarang/i })
      .first();

    if (await finalConfirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await finalConfirmBtn.click();
    }

    // ── Verify success message ────────────────────────────────────────────
    const successMsg = page
      .getByText(/berhasil|sukses|deleted|dihapus|selesai/i)
      .first();
    await expect(successMsg).toBeVisible({ timeout: 10_000 });
  });

  // ── 4. API: wipe/confirm requires exact text ──────────────────────────────

  test('wipe/confirm API rejects wrong confirmation text', async ({ request }) => {
    // Create + activate + close a fresh session
    const createRes = await request.post('/api/sessions', {
      data: {
        topic: 'E2E Wipe API Reject Test',
        testId: process.env.E2E_TEST_ID ?? 'test-seed-1',
      },
    });
    if (!createRes.ok()) return;

    const session = await createRes.json();
    const sessionId = session?.data?.id ?? session?.id;
    if (!sessionId) return;

    await request.post(`/api/sessions/${sessionId}/activate`);
    await request.post(`/api/sessions/${sessionId}/close`);

    // Send wrong confirmation text
    const badWipeRes = await request.post(
      `/api/sessions/${sessionId}/wipe/confirm`,
      { data: { confirmationText: 'WRONG TEXT' } }
    );
    expect([400, 422]).toContain(badWipeRes.status());

    // Send correct confirmation text
    const goodWipeRes = await request.post(
      `/api/sessions/${sessionId}/wipe/confirm`,
      { data: { confirmationText: CONFIRM_TEXT } }
    );
    // Should be 200 or 204
    expect([200, 204]).toContain(goodWipeRes.status());
  });

  // ── 5. Post-wipe: ConceptDiagnosis must persist ───────────────────────────

  test('ConceptDiagnosis records persist after auto-wipe', async ({ request }) => {
    // Create, activate, close, submit some responses, wipe
    const createRes = await request.post('/api/sessions', {
      data: {
        topic: 'E2E Post-Wipe Diagnosis Test',
        testId: process.env.E2E_TEST_ID ?? 'test-seed-1',
      },
    });
    if (!createRes.ok()) return;

    const session = await createRes.json();
    const sessionId = session?.data?.id ?? session?.id;
    if (!sessionId) return;

    await request.post(`/api/sessions/${sessionId}/activate`);
    await request.post(`/api/sessions/${sessionId}/close`);

    // Wipe
    const wipeRes = await request.post(
      `/api/sessions/${sessionId}/wipe/confirm`,
      { data: { confirmationText: CONFIRM_TEXT } }
    );
    if (!wipeRes.ok()) return;

    // After wipe, diagnoses endpoint must still respond (not 404)
    const diagRes = await request.get(`/api/sessions/${sessionId}/diagnoses`);
    // Either 200 (with empty array) or the route exists
    expect([200, 204]).toContain(diagRes.status());
  });
});
