import { describe, expect, it, vi } from 'vitest';
import {
  latencySummary,
  runStagingLoad,
} from '@/src/modules/operations/staging-load';

describe('controlled staging load', () => {
  it('calculates deterministic latency percentiles', () => {
    expect(latencySummary([100, 20, 40, 80, 60])).toEqual({
      p50: 60,
      p95: 100,
      p99: 100,
      maximum: 100,
    });
  });

  it('runs a bounded readiness probe without credentials', async () => {
    const request = vi.fn(async () => new Response(null, { status: 200 }));
    const result = await runStagingLoad({
      baseUrl: 'https://brain.example.test',
      target: 'ready',
      requests: 5,
      concurrency: 2,
      maximumP95Ms: 2_000,
      fetchImplementation: request as unknown as typeof fetch,
    });
    expect(result).toMatchObject({
      status: 'passed',
      requests: 5,
      concurrency: 2,
      successes: 5,
      failures: 0,
    });
    expect(request).toHaveBeenCalledTimes(5);
  });

  it('requires an explicit confirmation before authenticated load', async () => {
    await expect(
      runStagingLoad({
        baseUrl: 'https://brain.example.test',
        target: 'context',
        requests: 5,
        concurrency: 1,
        bearerToken: 'secret-token',
      }),
    ).rejects.toThrow('STAGING_LOAD_CONFIRM');
  });
});
