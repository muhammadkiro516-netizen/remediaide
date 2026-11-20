// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockSession = vi.fn();
vi.mock('next-auth/react', () => ({ useSession: () => mockSession() }));
import { JudgeBanner } from './JudgeBanner';

afterEach(() => cleanup());

describe('JudgeBanner', () => {
  it('shows the read-only banner for a judge account', () => {
    mockSession.mockReturnValue({ data: { isJudge: true } });
    render(<JudgeBanner />);
    expect(screen.getByRole('status')).toHaveTextContent('Mode juri: hanya-baca · data demo sintetis');
  });
  it('renders nothing for a normal teacher', () => {
    mockSession.mockReturnValue({ data: { isJudge: false } });
    const { container } = render(<JudgeBanner />);
    expect(container.firstChild).toBeNull();
  });
});
