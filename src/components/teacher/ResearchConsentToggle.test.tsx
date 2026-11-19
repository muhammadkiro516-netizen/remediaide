// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ResearchConsentToggle } from './ResearchConsentToggle';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ResearchConsentToggle', () => {
  it('asks for confirmation, posts consent=true, then shows the recorded state', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"success":true}', { status: 200 }));
    render(<ResearchConsentToggle sessionId="s1" initialConsent={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Catat persetujuan riset' }));
    await waitFor(() => expect(screen.getByText(/Persetujuan riset tercatat/)).toBeInTheDocument());
    expect(f).toHaveBeenCalledWith('/api/sessions/s1/research-consent', expect.objectContaining({ method: 'POST', body: '{"consent":true}' }));
  });

  it('does nothing when the teacher cancels the confirmation', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const f = vi.spyOn(globalThis, 'fetch');
    render(<ResearchConsentToggle sessionId="s1" initialConsent={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Catat persetujuan riset' }));
    expect(f).not.toHaveBeenCalled();
  });
});
