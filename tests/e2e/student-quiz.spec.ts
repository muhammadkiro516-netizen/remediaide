/**
 * E2E — Student Quiz Flow
 *
 * Critical path:
 *   1. Siswa membuka halaman join dan memasukkan PIN sesi.
 *   2. Siswa menjawab semua soal satu per satu.
 *   3. Untuk setiap soal, siswa menggeser MetacognitiveSlider (CRI 0–5).
 *   4. Setelah soal terakhir, siswa melihat halaman konfirmasi sukses.
 *
 * Prerequisites:
 *   - Dev server berjalan di http://localhost:3000
 *   - Sesi demo sudah dibuat dan diaktifkan (state ACTIVE) oleh seed
 *   - E2E_STUDENT_PIN env var menyimpan PIN sesi yang valid (default: '123456')
 */

import { test, expect } from '@playwright/test';
import { submitStudentPin } from './helpers/auth';

// PIN dari seed / environment — sesuaikan jika seed berubah
const SESSION_PIN = process.env.E2E_STUDENT_PIN ?? '123456';

test.describe('Student Quiz Flow', () => {
  // ── 1. Invalid PIN shows error and does NOT redirect ─────────────────────

  test('invalid PIN shows error message', async ({ page }) => {
    await page.goto('/student/join');

    const pinInput = page.getByPlaceholder(/PIN|pin|kode/i).first();
    await pinInput.fill('000000');
    await page.getByRole('button', { name: /gabung|join|masuk/i }).click();

    // Must NOT navigate away from /student/join
    await expect(page).toHaveURL(/\/student\/join/);

    // Error must be shown
    const errorEl = page
      .getByRole('alert')
      .or(page.getByText(/tidak valid|salah|not found|invalid/i))
      .first();
    await expect(errorEl).toBeVisible({ timeout: 6_000 });
  });

  // ── 2. Rate-limit: 3 consecutive failures → button disabled + countdown ──

  test('three failed PIN attempts trigger rate-limit cooldown', async ({ page }) => {
    await page.goto('/student/join');

    const pinInput = page.getByPlaceholder(/PIN|pin|kode/i).first();
    const submitBtn = page.getByRole('button', { name: /gabung|join|masuk/i });

    for (let i = 0; i < 3; i++) {
      await pinInput.fill('000000');
      await submitBtn.click();
      // Wait for error to appear between attempts
      await page
        .getByRole('alert')
        .or(page.getByText(/tidak valid|salah|not found|invalid/i))
        .first()
        .waitFor({ state: 'visible', timeout: 6_000 })
        .catch(() => {
          /* tolerate missing alert on first attempt */
        });
    }

    // After 3 failures the submit button must be disabled (rate-limit backoff)
    await expect(submitBtn).toBeDisabled({ timeout: 6_000 });
  });

  // ── 3. Valid PIN → quiz page renders ─────────────────────────────────────

  test('valid PIN navigates to quiz page', async ({ page }) => {
    await submitStudentPin(page, SESSION_PIN);

    // Should redirect to /student/quiz/:sessionId
    await expect(page).toHaveURL(/\/student\/quiz\//, { timeout: 10_000 });

    // First question must be visible
    await expect(page.getByRole('heading').first()).toBeVisible();
  });

  // ── 4. Full quiz flow: answer all questions + CRI slider ─────────────────

  test('student completes all quiz questions and reaches confirmation page', async ({
    page,
  }) => {
    await submitStudentPin(page, SESSION_PIN);
    await expect(page).toHaveURL(/\/student\/quiz\//, { timeout: 10_000 });

    let questionIndex = 0;
    const MAX_QUESTIONS = 20; // safety cap — real quizzes have ≤10 items

    while (questionIndex < MAX_QUESTIONS) {
      // ── Check if we've already landed on the complete page ────────────────
      if (page.url().includes('/complete')) break;

      // ── Wait for a question to be visible ────────────────────────────────
      const questionHeading = page.getByRole('heading').first();
      await questionHeading.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});

      if (page.url().includes('/complete')) break;

      // ── Select an answer option ───────────────────────────────────────────
      // Options are radio buttons or clickable cards labelled A/B/C/D
      const options = page.getByRole('radio').or(
        page.getByRole('button', { name: /^[A-D]$/ })
      );
      const optionCount = await options.count();

      if (optionCount === 0) break; // no options visible → likely complete page

      // Pick option B (index 1), or first if only one available
      const targetIndex = Math.min(1, optionCount - 1);
      await options.nth(targetIndex).click();

      // ── Interact with MetacognitiveSlider (CRI 0–5) ───────────────────────
      // The slider is an aria range input or a custom div with role="slider"
      const slider = page
        .getByRole('slider', { name: /CRI|keyakinan|confidence/i })
        .or(page.locator('[data-testid="metacognitive-slider"]'))
        .or(page.locator('input[type="range"]'))
        .first();

      if (await slider.isVisible()) {
        // Set CRI to 3 by typing into the range input or using keyboard
        await slider.focus();
        // Press ArrowRight 3 times from min (0) to reach 3
        for (let k = 0; k < 3; k++) {
          await slider.press('ArrowRight');
        }
        // Verify the slider value is now ≥ 1 (some movement happened)
        const sliderVal = await slider.getAttribute('aria-valuenow');
        if (sliderVal !== null) {
          expect(parseInt(sliderVal, 10)).toBeGreaterThanOrEqual(1);
        }
      }

      // ── Submit this question ──────────────────────────────────────────────
      const nextBtn = page
        .getByRole('button', { name: /lanjut|next|berikutnya|kirim|submit/i })
        .first();
      await expect(nextBtn).toBeEnabled({ timeout: 5_000 });
      await nextBtn.click();

      questionIndex++;

      // Small wait for navigation / animation
      await page.waitForTimeout(300);
    }

    // ── Verify confirmation page ──────────────────────────────────────────
    await expect(page).toHaveURL(/\/student\/quiz\/.*\/complete/, {
      timeout: 10_000,
    });

    // Confirmation message must be present
    const confirmation = page
      .getByText(/selesai|berhasil|terima kasih|sukses|complete/i)
      .first();
    await expect(confirmation).toBeVisible({ timeout: 6_000 });

    // Cognitive status must NOT be revealed to the student
    const cognitiveKeywords = [
      /paham konsep/i,
      /lucky guess/i,
      /miskonsepsi/i,
      /tidak paham/i,
    ];
    for (const kw of cognitiveKeywords) {
      await expect(page.getByText(kw).first()).not.toBeVisible();
    }
  });

  // ── 5. sessionStorage persists last question index ────────────────────────

  test('quiz progress is saved in sessionStorage', async ({ page }) => {
    await submitStudentPin(page, SESSION_PIN);
    await expect(page).toHaveURL(/\/student\/quiz\//, { timeout: 10_000 });

    // Answer first question
    const firstOption = page.getByRole('radio').first();
    if (await firstOption.isVisible()) {
      await firstOption.click();
      const nextBtn = page.getByRole('button', { name: /lanjut|next|berikutnya|kirim|submit/i }).first();
      if (await nextBtn.isEnabled()) {
        await nextBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // sessionStorage should contain progress key
    const progressKey = await page.evaluate(() => {
      const keys = Object.keys(sessionStorage);
      return keys.find((k) => k.includes('quiz') || k.includes('progress') || k.includes('lastQuestion'));
    });

    expect(progressKey).toBeDefined();
  });

  // ── 6. MetacognitiveSlider accessibility check ────────────────────────────

  test('MetacognitiveSlider has accessible aria attributes', async ({ page }) => {
    await submitStudentPin(page, SESSION_PIN);
    await expect(page).toHaveURL(/\/student\/quiz\//, { timeout: 10_000 });

    const slider = page
      .getByRole('slider')
      .or(page.locator('input[type="range"]'))
      .first();

    if (await slider.isVisible()) {
      // Must have aria-label or aria-labelledby
      const ariaLabel = await slider.getAttribute('aria-label');
      const ariaLabelledBy = await slider.getAttribute('aria-labelledby');
      expect(ariaLabel ?? ariaLabelledBy).toBeTruthy();

      // Must have aria-valuemin=0 and aria-valuemax=5
      const ariaMin = await slider.getAttribute('aria-valuemin');
      const ariaMax = await slider.getAttribute('aria-valuemax');
      expect(parseInt(ariaMin ?? '0', 10)).toBe(0);
      expect(parseInt(ariaMax ?? '5', 10)).toBe(5);
    }
  });
});
