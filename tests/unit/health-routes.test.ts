import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('@/src/db/pool', () => ({
  getAppPool: () => ({ query }),
}));

import { GET as live } from '@/app/api/health/live/route';
import { GET as ready } from '@/app/api/health/ready/route';

describe('deployment health contracts', () => {
  beforeEach(() => query.mockReset());

  it('keeps liveness independent from downstream services', async () => {
    const response = await live();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'live',
      service: 'organisational-context-brain',
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('reports ready only for the non-owning app role with the current session boundary', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          role_name: 'org_brain_app',
          session_boundary: 'resolve_browser_session(text,text,interval)',
        },
      ],
    });
    const response = await ready();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ready',
      database: 'available',
      migrations: 'current',
    });

    query.mockResolvedValueOnce({
      rows: [{ role_name: 'postgres', session_boundary: null }],
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unavailable = await ready();
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ status: 'not-ready' });
    errorSpy.mockRestore();
  });
});
