// @vitest-environment jsdom

/**
 * ExitTicketSummaryBadge Component Tests
 *
 * Tests the conditional rendering logic based on submission counts.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ExitTicketSummaryBadge } from './ExitTicketSummaryBadge';

describe('ExitTicketSummaryBadge', () => {
  it('returns null (renders nothing) when totalTokens === 0', () => {
    const { container } = render(
      <ExitTicketSummaryBadge submittedCount={0} totalTokens={0} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows "Belum ada yang submit Exit Ticket" when submittedCount === 0 and totalTokens > 0', () => {
    render(<ExitTicketSummaryBadge submittedCount={0} totalTokens={5} />);
    expect(screen.getByText(/belum ada yang submit exit ticket/i)).toBeInTheDocument();
  });

  it('shows correct numeric count in output when submittedCount > 0', () => {
    render(<ExitTicketSummaryBadge submittedCount={3} totalTokens={5} />);
    
    // Should show "3 dari 5 kelompok sudah submit Exit Ticket"
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/dari 5 kelompok sudah submit exit ticket/i)).toBeInTheDocument();
  });

  it('highlights submitted count with green color', () => {
    render(<ExitTicketSummaryBadge submittedCount={2} totalTokens={4} />);
    
    const submittedCountSpan = screen.getByText('2');
    expect(submittedCountSpan).toHaveClass('text-green-700');
    expect(submittedCountSpan).toHaveClass('font-semibold');
  });
});
