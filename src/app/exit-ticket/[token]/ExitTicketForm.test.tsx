// @vitest-environment jsdom

/**
 * ExitTicketForm Component Tests
 *
 * Tests the interactive form behavior including validation, submission,
 * and state transitions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ExitTicketForm from './ExitTicketForm';
import { CONFIDENCE_LABELS } from '@/lib/exit-ticket/theme';

describe('ExitTicketForm', () => {
  const mockProps = {
    token: 'test-token-123',
    topicName: 'Matematika Dasar',
    cognitiveCategory: 'PAHAM_KONSEP' as const,
  };

  // Store original fetch
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Reset fetch before each test
    global.fetch = originalFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the reflection question matching the given cognitiveCategory', () => {
    render(<ExitTicketForm {...mockProps} />);
    
    // PAHAM_KONSEP question
    expect(
      screen.getByText(/Coba jelaskan dengan kata-katamu sendiri/i)
    ).toBeInTheDocument();
  });

  it('shows "Jawaban tidak boleh kosong" and does not call fetch when submitting with empty textarea', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;
    
    const user = userEvent.setup();
    render(<ExitTicketForm {...mockProps} />);

    // Click submit without filling anything
    const submitButton = screen.getByRole('button', { name: /kirim refleksi/i });
    await user.click(submitButton);

    // Validation error should appear
    await waitFor(() => {
      expect(screen.getByText(/jawaban tidak boleh kosong/i)).toBeInTheDocument();
    });

    // fetch should NOT have been called
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows "Pilih dulu tingkat keyakinanmu" and does not call fetch when submitting without selecting confidence', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;
    
    const user = userEvent.setup();
    render(<ExitTicketForm {...mockProps} />);

    // Fill textarea but don't select confidence
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Some reflection text');

    // Submit
    const submitButton = screen.getByRole('button', { name: /kirim refleksi/i });
    await user.click(submitButton);

    // Validation error should appear
    await waitFor(() => {
      expect(screen.getByText(/pilih dulu tingkat keyakinanmu/i)).toBeInTheDocument();
    });

    // fetch should NOT have been called
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('disables submit button and shows loading text while request is in-flight', async () => {
    // Mock fetch with a delay
    let resolvePromise: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolvePromise = resolve;
    });
    global.fetch = vi.fn(() => fetchPromise);

    const user = userEvent.setup();
    render(<ExitTicketForm {...mockProps} />);

    // Fill form
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Valid reflection');
    
    // Select confidence level 3
    const confidenceButton = screen.getByRole('button', { name: /tingkat keyakinan 3/i });
    await user.click(confidenceButton);

    // Submit
    const submitButton = screen.getByRole('button', { name: /kirim refleksi/i });
    await user.click(submitButton);

    // Button should be disabled and show loading text
    await waitFor(() => {
      expect(submitButton).toBeDisabled();
      expect(submitButton).toHaveTextContent(/mengirim/i);
    });

    // Resolve the promise
    resolvePromise!(new Response(JSON.stringify({ success: true }), { status: 200 }));
  });

  it('shows confirmation message "Terima kasih, refleksimu sudah tersimpan!" on 200 response', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      )
    );

    const user = userEvent.setup();
    render(<ExitTicketForm {...mockProps} />);

    // Fill form
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Valid reflection');
    
    const confidenceButton = screen.getByRole('button', { name: /tingkat keyakinan 3/i });
    await user.click(confidenceButton);

    // Submit
    const submitButton = screen.getByRole('button', { name: /kirim refleksi/i });
    await user.click(submitButton);

    // Wait for success message
    await waitFor(() => {
      expect(screen.getByText(/terima kasih, refleksimu sudah tersimpan!/i)).toBeInTheDocument();
    });
  });

  it('shows "Refleksimu sudah tercatat sebelumnya" message on 409 response', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'TOKEN_ALREADY_USED' }), { status: 409 })
      )
    );

    const user = userEvent.setup();
    render(<ExitTicketForm {...mockProps} />);

    // Fill form
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Valid reflection');
    
    const confidenceButton = screen.getByRole('button', { name: /tingkat keyakinan 3/i });
    await user.click(confidenceButton);

    // Submit
    const submitButton = screen.getByRole('button', { name: /kirim refleksi/i });
    await user.click(submitButton);

    // Wait for already-submitted message
    await waitFor(() => {
      expect(screen.getByText(/refleksimu sudah tercatat sebelumnya/i)).toBeInTheDocument();
    });
  });

  it('shows "Terjadi kesalahan, coba lagi" and re-enables button on 500 response', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'INTERNAL_ERROR' }), { status: 500 })
      )
    );

    const user = userEvent.setup();
    render(<ExitTicketForm {...mockProps} />);

    // Fill form
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Valid reflection');
    
    const confidenceButton = screen.getByRole('button', { name: /tingkat keyakinan 3/i });
    await user.click(confidenceButton);

    // Submit
    const submitButton = screen.getByRole('button', { name: /kirim refleksi/i });
    await user.click(submitButton);

    // Wait for error message and button to be re-enabled
    await waitFor(() => {
      expect(screen.getByText(/terjadi kesalahan, coba lagi/i)).toBeInTheDocument();
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('textarea has maxLength attribute set to 1000', () => {
    render(<ExitTicketForm {...mockProps} />);
    
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveAttribute('maxLength', '1000');
  });

  it('confidence scale renders exactly 6 buttons with labels from CONFIDENCE_LABELS', () => {
    render(<ExitTicketForm {...mockProps} />);
    
    // Check all 6 labels exist
    Object.entries(CONFIDENCE_LABELS).forEach(([value, label]) => {
      const button = screen.getByRole('button', { name: new RegExp(`tingkat keyakinan ${value}`, 'i') });
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent(label);
    });

    // Verify exactly 6 confidence buttons (excluding the submit button)
    const allButtons = screen.getAllByRole('button');
    const confidenceButtons = allButtons.filter((btn) => 
      btn.getAttribute('aria-label')?.includes('Tingkat keyakinan')
    );
    expect(confidenceButtons).toHaveLength(6);
  });
});
