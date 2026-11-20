/**
 * Frames for docs/media/demo.gif (butir 6): judge login -> demo class -> diagnosis results -> Mode AI -> "Perlu dicek
 * guru" -> one SHAP reason. Runs against a local server seeded with scripts/seed-demo-judge.ts (synthetic demo data).
 *   BASE_URL=http://localhost:3100 JUDGE_PASSWORD=... npx tsx scripts/record-demo-gif.ts <frames-dir>
 * Then: ml/.venv/bin/python scripts/frames_to_gif.py <frames-dir> docs/media/demo.gif
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const out = process.argv[2] ?? 'test-results/gif-frames';
let n = 0;
const timing: number[] = [];

async function snap(page: Page, ms: number, count = 1) {
  await page.evaluate(() => window.scrollTo({ left: 0, top: window.scrollY, behavior: 'instant' })); // never show a horizontally scrolled page
  await page.waitForTimeout(400); // let scrolling settle
  for (let i = 0; i < count; i++) {
    writeFileSync(join(out, `${String(n++).padStart(3, '0')}.png`), await page.screenshot());
    timing.push(ms);
  }
}

async function main() {
  const pw = process.env.JUDGE_PASSWORD;
  if (!pw) throw new Error('JUDGE_PASSWORD wajib diisi');
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/login`);
  await page.locator('#email').fill('juri@remediaide.id');
  await snap(page, 1800);
  await page.locator('#password').fill(pw);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL('**/dashboard**', { timeout: 30_000 });
  await page.goto(`${BASE}/dashboard/classes`);
  await page.waitForLoadState('networkidle');
  await snap(page, 2600);
  await page.goto(`${BASE}/dashboard/sessions/demo-session-hasil/results`);
  await page.waitForLoadState('networkidle');
  await snap(page, 3200);
  await page.getByRole('button', { name: /^Mode AI/ }).click();
  const queue = page.getByRole('region', { name: 'Perlu dicek guru' });
  await queue.waitFor({ timeout: 30_000 });
  await queue.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, -120);
  await snap(page, 3600);
  for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 160); await page.waitForTimeout(150); await snap(page, 600); }
  const per = page.getByRole('region', { name: 'Diagnosis AI per siswa' });
  await per.scrollIntoViewIfNeeded();
  const reason = per.locator('li').first();
  await reason.scrollIntoViewIfNeeded();
  await reason.evaluate((el) => { (el as HTMLElement).style.outline = '3px solid #f59e0b'; (el as HTMLElement).style.outlineOffset = '2px'; });
  await snap(page, 4200);
  writeFileSync(join(out, 'timing.json'), JSON.stringify(timing));
  await browser.close();
  console.log(`${n} frames, ${timing.reduce((a, b) => a + b, 0) / 1000} s -> ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
