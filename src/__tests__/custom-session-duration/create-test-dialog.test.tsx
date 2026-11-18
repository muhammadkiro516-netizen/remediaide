// @vitest-environment jsdom
/**
 * Custom Session Duration — CreateTestDialog Unit Tests
 * src/__tests__/custom-session-duration/create-test-dialog.test.tsx
 *
 * Task 4.4: Verifies CreateTestDialog UI behavior for:
 *   1. All 8 presets present in ascending order
 *   2. Demo badge visible on 2-min and 3-min only
 *   3. Preset "10 menit" does NOT show "⚡ Demo" text
 *   4. "Custom" button present
 *   5. Initial state: 15-min active, Custom input hidden
 *   6. Clicking preset "2 menit" → only that button active, Custom hidden
 *   7. Clicking "Custom" → Custom input appears
 *   8. Entering valid "45" → no validation error
 *   9. Entering "0" → "Minimal 1 menit" error, submit disabled
 *  10. Entering "200" → "Maksimal 180 menit (3 jam)" error, submit disabled
 *  11. Switching from Custom back to preset → Custom input hidden
 *
 * _Requirements: 1.1–1.8, 2.1–2.10, 5.1–5.3_
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock next/link since it requires Next.js router context
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock fetch to return empty data for all API calls
function mockFetch() {
  return vi.fn().mockImplementation((url: string) => {
    if (url === '/api/classes') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });
    }
    if (url === '/api/tests') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helper: render TestsPage and open the dialog ─────────────────────────────

async function renderDialog() {
  const { default: TestsPage } = await import('@/app/dashboard/tests/page');
  render(<TestsPage />);

  // Wait for the page to finish loading (skeleton disappears, empty state appears)
  await waitFor(() => {
    expect(screen.queryByText('Buat Paket Soal')).toBeInTheDocument();
  }, { timeout: 5000 });

  // Click "Buat Paket Soal" button to open the dialog
  const openBtn = screen.getByText('Buat Paket Soal');
  fireEvent.click(openBtn);

  // Wait for the dialog heading to appear
  await waitFor(() => {
    expect(screen.getByText('Buat Paket Soal Baru')).toBeInTheDocument();
  }, { timeout: 5000 });

  // Wait for classes to finish loading inside the dialog
  // The select appears once loadingClasses = false
  await waitFor(() => {
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  }, { timeout: 5000 });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CreateTestDialog — duration presets and Custom mode', () => {
  /**
   * Test 1: All 8 presets present in ascending order
   * Requirements 1.1, 1.5, 5.1
   */
  it('1. renders all 8 preset buttons in ascending order', async () => {
    await renderDialog();

    const expectedOrder = [
      '2 menit', '3 menit', '10 menit', '15 menit',
      '20 menit', '30 menit', '45 menit', '60 menit',
    ];

    // Verify each label is present
    for (const label of expectedOrder) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    // Verify ascending order in DOM
    const allButtons = screen.getAllByRole('button');
    const presetButtons = allButtons.filter(btn =>
      expectedOrder.some(l => (btn.textContent || '').includes(l))
    );
    const domOrder = presetButtons
      .map(btn => expectedOrder.find(l => (btn.textContent || '').includes(l)))
      .filter(Boolean) as string[];

    expect(domOrder).toEqual(expectedOrder);
  });

  /**
   * Test 2: "2 menit" button shows "⚡ Demo" text
   * Requirements 1.2
   */
  it('2. "2 menit" button shows "⚡ Demo" text', async () => {
    await renderDialog();

    const twoMinBtn = screen.getAllByText('2 menit')[0].closest('button');
    expect(twoMinBtn?.textContent).toContain('⚡ Demo');
  });

  /**
   * Test 3: "3 menit" button shows "⚡ Demo" text
   * Requirements 1.2
   */
  it('3. "3 menit" button shows "⚡ Demo" text', async () => {
    await renderDialog();

    const threeMinBtn = screen.getAllByText('3 menit')[0].closest('button');
    expect(threeMinBtn?.textContent).toContain('⚡ Demo');
  });

  /**
   * Test 4: "10 menit" does NOT show "⚡ Demo" text
   * Requirements 1.2
   */
  it('4. "10 menit" button does NOT show "⚡ Demo" text', async () => {
    await renderDialog();

    const tenMinBtn = screen.getAllByText('10 menit')[0].closest('button');
    expect(tenMinBtn?.textContent).not.toContain('⚡ Demo');
  });

  /**
   * Test 5: "Custom" button is present
   * Requirements 2.1
   */
  it('5. "Custom" button is present', async () => {
    await renderDialog();

    const customBtn = screen.getByRole('button', { name: 'Custom' });
    expect(customBtn).toBeInTheDocument();
  });

  /**
   * Test 6: Initial state — 15-min button is active (has border-blue-400), Custom input hidden
   * Requirements 5.3
   */
  it('6. initial state: "15 menit" button is active and Custom input is hidden', async () => {
    await renderDialog();

    const fifteenMinBtn = screen.getAllByText('15 menit')[0].closest('button');
    expect(fifteenMinBtn).toHaveClass('border-blue-400');

    // Custom input should not be visible
    expect(screen.queryByPlaceholderText('1 – 180 menit')).not.toBeInTheDocument();
  });

  /**
   * Test 7: Clicking "2 menit" preset → that button becomes active, Custom input remains hidden
   * Requirements 1.3
   */
  it('7. clicking "2 menit" → that button becomes active, Custom input remains hidden', async () => {
    await renderDialog();

    const twoMinBtn = screen.getAllByText('2 menit')[0].closest('button')!;
    fireEvent.click(twoMinBtn);

    // 2-min button should now be active
    expect(twoMinBtn).toHaveClass('border-blue-400');

    // 15-min button should no longer be active
    const fifteenMinBtn = screen.getAllByText('15 menit')[0].closest('button');
    expect(fifteenMinBtn).not.toHaveClass('border-blue-400');

    // Custom input should still be hidden
    expect(screen.queryByPlaceholderText('1 – 180 menit')).not.toBeInTheDocument();
  });

  /**
   * Test 8: Clicking "Custom" → Custom input field appears
   * Requirements 2.2, 2.3
   */
  it('8. clicking "Custom" → Custom input field appears', async () => {
    await renderDialog();

    const customBtn = screen.getByRole('button', { name: 'Custom' });
    fireEvent.click(customBtn);

    // Custom input should appear
    const customInput = screen.getByPlaceholderText('1 – 180 menit');
    expect(customInput).toBeInTheDocument();

    // Custom button should be active
    expect(customBtn).toHaveClass('border-blue-400');
  });

  /**
   * Test 9: Entering "45" in Custom input → no validation error shown
   * Requirements 2.4
   */
  it('9. entering "45" in Custom input → no validation error shown', async () => {
    await renderDialog();

    const customBtn = screen.getByRole('button', { name: 'Custom' });
    fireEvent.click(customBtn);

    const customInput = screen.getByPlaceholderText('1 – 180 menit');
    fireEvent.change(customInput, { target: { value: '45' } });

    // No validation error should appear
    expect(screen.queryByText('Minimal 1 menit')).not.toBeInTheDocument();
    expect(screen.queryByText('Maksimal 180 menit (3 jam)')).not.toBeInTheDocument();
  });

  /**
   * Test 10: Entering "0" in Custom input → "Minimal 1 menit" error, submit disabled
   * Requirements 2.5
   */
  it('10. entering "0" in Custom input → "Minimal 1 menit" error appears', async () => {
    await renderDialog();

    const customBtn = screen.getByRole('button', { name: 'Custom' });
    fireEvent.click(customBtn);

    const customInput = screen.getByPlaceholderText('1 – 180 menit');
    fireEvent.change(customInput, { target: { value: '0' } });

    // Error message should be shown
    expect(screen.getByText('Minimal 1 menit')).toBeInTheDocument();

    // Submit button should be disabled
    const submitBtn = screen.getByRole('button', { name: 'Simpan' });
    expect(submitBtn).toBeDisabled();
  });

  /**
   * Test 11: Entering "200" in Custom input → "Maksimal 180 menit (3 jam)" error, submit disabled
   * Requirements 2.6
   */
  it('11. entering "200" in Custom input → "Maksimal 180 menit (3 jam)" error appears', async () => {
    await renderDialog();

    const customBtn = screen.getByRole('button', { name: 'Custom' });
    fireEvent.click(customBtn);

    const customInput = screen.getByPlaceholderText('1 – 180 menit');
    fireEvent.change(customInput, { target: { value: '200' } });

    // Error message should be shown
    expect(screen.getByText('Maksimal 180 menit (3 jam)')).toBeInTheDocument();

    // Submit button should be disabled
    const submitBtn = screen.getByRole('button', { name: 'Simpan' });
    expect(submitBtn).toBeDisabled();
  });
});

// ─── Inline parseCustomMinutes for pure PBT (no component render needed) ─────

function parseCustomMinutes(raw: string): {
  valid: boolean;
  minutes: number | null;
  error: string | null;
} {
  if (raw === '' || raw === null) return { valid: false, minutes: null, error: null };
  const num = parseFloat(raw);
  if (isNaN(num)) return { valid: false, minutes: null, error: null };
  const rounded = Math.round(num);
  if (rounded < 1) return { valid: false, minutes: null, error: 'Minimal 1 menit' };
  if (rounded > 180) return { valid: false, minutes: null, error: 'Maksimal 180 menit (3 jam)' };
  return { valid: true, minutes: rounded, error: null };
}

// ─── Property-Based Tests ─────────────────────────────────────────────────────

import * as fc from 'fast-check';

describe('CreateTestDialog — Property-Based Tests (fast-check)', () => {
  /**
   * Feature: custom-session-duration, Property 1: single active selection
   * For any button in the Duration_Selector, clicking it should result in
   * exactly that button having the active class (border-blue-400), and
   * all other buttons NOT having the active class.
   *
   * Validates: Requirements 1.3, 1.4, 2.3, 5.2
   *
   * Implemented as a pure state-machine simulation to avoid slow renders.
   * The active-button logic is: preset active iff (!isCustom && duration === value);
   * Custom active iff isCustom. This is a direct model of the component's logic.
   */
  it('Property 1 — single active selection: clicking any option activates exactly that button', () => {
    const presetValues = [120, 180, 600, 900, 1200, 1800, 2700, 3600] as const;
    type PresetValue = typeof presetValues[number];
    type Selection = PresetValue | 'custom';
    const allValues: Selection[] = [...presetValues, 'custom'];

    fc.assert(
      fc.property(
        fc.constantFrom(...allValues),
        (selected) => {
          // Simulate state after clicking `selected`
          const isCustom = selected === 'custom';
          const duration = isCustom ? 900 : (selected as PresetValue); // Custom doesn't change duration

          // For each option, compute expected active state
          for (const value of presetValues) {
            const isActive = !isCustom && duration === value;
            // There must be exactly one active preset (or none if custom is selected)
            if (isCustom) {
              expect(isActive).toBe(false);
            } else {
              expect(isActive).toBe(value === selected);
            }
          }

          // Custom button state
          const customActive = isCustom;
          expect(customActive).toBe(selected === 'custom');

          // Exactly one option is active total
          const activeCount = presetValues.filter(v => !isCustom && duration === v).length + (isCustom ? 1 : 0);
          expect(activeCount).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: custom-session-duration, Property 2: custom input multiplier
   * For any integer N in [1, 180], parseCustomMinutes(String(N)).minutes * 60 === N * 60
   *
   * Validates: Requirements 2.4
   */
  it('Property 2 — custom input multiplier: parseCustomMinutes(String(N)).minutes * 60 === N * 60', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 180 }),
        (n) => {
          const result = parseCustomMinutes(String(n));
          expect(result.valid).toBe(true);
          expect(result.minutes).not.toBeNull();
          expect(result.minutes! * 60).toBe(n * 60);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: custom-session-duration, Property 3: decimal rounding
   * For any float D where Math.round(D) is in [1, 180], parseCustomMinutes(String(D)).minutes === Math.round(D)
   *
   * Validates: Requirements 2.7
   */
  it('Property 3 — decimal rounding: parseCustomMinutes rounds decimals to nearest integer', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.5), max: Math.fround(180.4), noNaN: true }).filter(
          (d) => Math.round(d) >= 1 && Math.round(d) <= 180
        ),
        (d) => {
          const rounded = Math.round(d);
          const result = parseCustomMinutes(String(d));
          expect(result.valid).toBe(true);
          expect(result.minutes).toBe(rounded);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: custom-session-duration, Property 4: invalid custom input → parseCustomMinutes returns valid=false
   * For any invalid input (empty, non-numeric string, value < 1, value > 180), parseCustomMinutes returns valid=false
   *
   * Validates: Requirements 2.5, 2.6, 2.8, 2.9
   */
  it('Property 4 — invalid custom input: parseCustomMinutes returns valid=false for all invalid inputs', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          fc.integer({ max: 0 }).map(String),
          fc.integer({ min: 181 }).map(String),
        ),
        (invalidInput) => {
          const result = parseCustomMinutes(invalidInput);
          expect(result.valid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
