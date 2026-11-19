/**
 * T70 dry run of the pilot session (06 §2.5): 3 dummy students answer the 15-question MAP-ID instrument through the real
 * UI, then the teacher records research consent and downloads the anonymous research CSV, which must match the schema.
 * Needs a DB prepared with scripts/seed-pilot-instrument.ts (PILOT_DUMMY_STUDENTS=3 PILOT_PIN=424242 PILOT_ACTIVE=1).
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 E2E_TEACHER_PASSWORD=... npx playwright test -c playwright.ml.config.ts pilot-dry-run
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const PIN = process.env.PILOT_PIN ?? '424242';
const EMAIL = process.env.E2E_TEACHER_EMAIL ?? 'guru@remediaide.app';
const PASSWORD = process.env.E2E_TEACHER_PASSWORD ?? 'demo123';
const COLUMNS = 'student_key,session_id,question_id,chosen_option,is_correct,cri,response_time_ms,tau_min_ms,explanation,answered_at,consent';
const REASONS = ['saya samakan dulu penyebutnya lalu dijumlahkan', 'karena angka yang lebih panjang lebih besar', 'dibagi dua dulu'];

test.describe.configure({ mode: 'serial' });
let sessionId = '';

for (let s = 0; s < 3; s++) {
  test(`dummy student ${s + 1} completes the 15 questions`, async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/student/join');
    await page.locator('#pinCode').fill(PIN);
    await page.getByRole('button', { name: /Lanjut/ }).click();
    const labels = page.locator('label').filter({ hasText: /^UJI-/ });
    await expect(labels.first()).toBeVisible({ timeout: 20_000 });
    await labels.nth(s).click();
    await page.locator('form button[type="submit"]').last().click();
    await page.waitForURL('**/student/quiz/**', { timeout: 30_000 });
    sessionId = page.url().split('/student/quiz/')[1].split(/[/?#]/)[0];
    let sawFigure = false;
    for (let q = 1; q <= 15; q++) {
      await expect(page.getByLabel(`Soal ${q} dari 15`)).toBeVisible({ timeout: 30_000 });
      if (await page.locator('img[src^="/pilot/map-"]').count()) sawFigure = true;
      const opts = page.locator('fieldset[aria-label="Pilihan jawaban"] label');
      await opts.nth((q + s) % 4).click();
      await expect(opts.nth((q + s) % 4).locator('input[type="radio"]')).toBeChecked();
      await page.getByRole('button', { name: new RegExp(`^Nilai ${(q + 2 * s) % 6}:`) }).click();
      const expl = page.locator('#explanation');
      if (await expl.count()) await expl.fill(REASONS[s]);
      await page.getByRole('button', { name: q < 15 ? /Lanjut/ : /Selesai/ }).click();
    }
    await page.waitForURL('**/complete**', { timeout: 30_000 });
    expect(sawFigure).toBe(true);
    await ctx.close();
  });
}

test('teacher records consent and exports the research CSV (schema check)', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL('**/dashboard**', { timeout: 30_000 });
  const before = await page.request.get(`/api/sessions/${sessionId}/export/research`);
  expect(before.status()).toBe(403); // no consent recorded yet (UU PDP Pasal 25)
  const c = await page.request.post(`/api/sessions/${sessionId}/research-consent`, { data: { consent: true } });
  expect(c.ok()).toBe(true);
  const res = await page.request.get(`/api/sessions/${sessionId}/export/research`);
  expect(res.status()).toBe(200);
  const csv = await res.text();
  const lines = csv.trim().split('\n');
  expect(lines[0]).toBe(COLUMNS);
  expect(lines.length - 1).toBe(45); // 3 students x 15 questions
  expect(csv).not.toMatch(/UJI-/); // no anonymous labels / names in the export
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/pilot_dry_run_export.csv', csv);
});
