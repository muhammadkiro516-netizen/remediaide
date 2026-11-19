import { describe, expect, it, vi } from 'vitest';
import { callMlService } from '../client';

const ok = () =>
  new Response(JSON.stringify({ model_version: 't', students: [], latency_ms: 1 }), { status: 200 });

describe('callMlService auth header', () => {
  it('sends a bearer token only when one is configured', async () => {
    const f = vi.fn(async () => ok());
    await callMlService({ items: [], responses: [] } as never, { url: 'http://x', token: 'abc', fetchImpl: f as never });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc');

    const g = vi.fn(async () => ok());
    await callMlService({ items: [], responses: [] } as never, { url: 'http://x', token: '', fetchImpl: g as never });
    const init2 = (g.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init2.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('returns null (v1 fallback) when no URL is configured', async () => {
    const f = vi.fn();
    expect(await callMlService({ items: [], responses: [] } as never, { url: '', fetchImpl: f as never })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});
