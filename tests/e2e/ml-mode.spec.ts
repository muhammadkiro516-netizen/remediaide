/**
 * RemediAide 2.0 — Mode AI end-to-end (P6). Needs: seeded DB, ML service (ml/service) and an ML diagnosis run for the
 * seeded ACTIVE session (scripts/e2e-ml.ts). Credentials default to prisma/seed.ts (override with E2E_TEACHER_*).
 */
import { expect, test } from '@playwright/test';

const EMAIL = process.env.E2E_TEACHER_EMAIL ?? 'demo@remediaide.app';
const PASSWORD = process.env.E2E_TEACHER_PASSWORD ?? 'demo123';
const SESSION = process.env.E2E_SESSION_ID ?? 'seed-session-active-123456';

test('public methodology page shows sourced numbers', async ({ page }) => {
  await page.goto('/metodologi');
  await expect(page.getByRole('heading', { name: /Metodologi Mesin AI/ })).toBeVisible();
  await expect(page.getByText('45,1%')).toBeVisible();
});

test('landing page has the 3-layer AI section and no unsourced stats', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mesin AI 3 Lapis' })).toBeVisible();
  await expect(page.getByText('68%')).toHaveCount(0);
});

test('teacher sees Mode AI with the teacher queue and can give feedback', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL('**/dashboard**', { timeout: 20_000 });
  await page.goto(`/dashboard/sessions/${SESSION}/results`);
  await page.getByRole('button', { name: /^Mode AI/ }).click();
  await expect(page.getByRole('heading', { name: /Perlu dicek guru/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Diagnosis AI per siswa' })).toBeVisible();
  await page.getByRole('button', { name: 'Setuju' }).first().click();
  await expect(page.getByText('Tersimpan ✓').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/ml-mode.png', fullPage: true });
});
