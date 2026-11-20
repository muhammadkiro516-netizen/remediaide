/**
 * Read-only judge account (CAC MLSC 2026). Needs a DB seeded with scripts/seed-demo-judge.ts and the server started
 * with JUDGE_EMAILS=juri@remediaide.id.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 JUDGE_PASSWORD=... npx playwright test -c playwright.ml.config.ts judge
 */
import { expect, test } from '@playwright/test';

const EMAIL = process.env.JUDGE_EMAIL ?? 'juri@remediaide.id';
const PASSWORD = process.env.JUDGE_PASSWORD ?? '';
const RESULTS = process.env.DEMO_RESULTS_SESSION ?? 'demo-session-hasil';

test.describe.configure({ mode: 'serial' });

test('judge can read every teacher page, cannot write or export', async ({ page }) => {
  test.skip(!PASSWORD, 'JUDGE_PASSWORD not set');
  test.setTimeout(120_000);
  await page.goto('/login');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL('**/dashboard**', { timeout: 30_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Mode juri: hanya-baca · data demo sintetis' })).toBeVisible();
  for (const path of ['/dashboard/classes', '/dashboard/sessions', '/dashboard/tests', '/dashboard/results',
                      `/dashboard/sessions/${RESULTS}/results`]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
  }
  await page.getByRole('button', { name: /^Mode AI/ }).click();
  await expect(page.getByRole('heading', { name: /Perlu dicek guru/ })).toBeVisible({ timeout: 30_000 });
  const api = page.request;
  expect((await api.get('/api/classes')).status()).toBe(200);
  expect((await api.post('/api/classes', { data: { name: 'x', grade: '8', academicYear: 2026 } })).status()).toBe(403);
  expect((await api.put(`/api/sessions/${RESULTS}`, { data: {} })).status()).toBe(403);
  expect((await api.patch(`/api/sessions/${RESULTS}`, { data: {} })).status()).toBe(403);
  expect((await api.delete(`/api/sessions/${RESULTS}`)).status()).toBe(403);
  expect((await api.post(`/api/sessions/${RESULTS}/groups`)).status()).toBe(403);
  expect((await api.get(`/api/sessions/${RESULTS}/export/csv`)).status()).toBe(403);
  expect((await api.get(`/api/sessions/${RESULTS}/export/research`)).status()).toBe(403);
});
