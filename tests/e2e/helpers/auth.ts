/**
 * E2E Auth Helpers — RemediAide
 *
 * Shared utilities for authenticating as teacher or student in Playwright tests.
 */

import type { Page } from '@playwright/test';

// ─── Seed constants (must match prisma/seed.ts) ───────────────────────────────

export const SEED = {
  teacher: {
    email: 'guru@demo.sch.id',
    password: 'demo1234',
  },
  /** PIN is set by the teacher when a session is activated in the live test. */
  studentPin: process.env.E2E_STUDENT_PIN ?? '123456',
};

// ─── Teacher Login ────────────────────────────────────────────────────────────

/**
 * Navigate to /login and sign in as the demo teacher.
 * Waits until the dashboard is visible before returning.
 */
export async function loginAsTeacher(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(SEED.teacher.email);
  await page.getByLabel(/password|kata sandi/i).fill(SEED.teacher.password);
  await page.getByRole('button', { name: /masuk|login|sign in/i }).click();
  // Dashboard is the post-login destination
  await page.waitForURL('**/dashboard**', { timeout: 10_000 });
}

// ─── Student PIN Join ─────────────────────────────────────────────────────────

/**
 * Navigate to /student/join and submit a session PIN.
 * Does NOT assert the result — caller handles assertions.
 */
export async function submitStudentPin(page: Page, pin: string): Promise<void> {
  await page.goto('/student/join');
  // The PIN input can be a single field or six separate digit boxes
  const pinInput = page.getByPlaceholder(/PIN|pin|kode/i).first();
  await pinInput.fill(pin);
  await page.getByRole('button', { name: /gabung|join|masuk/i }).click();
}
