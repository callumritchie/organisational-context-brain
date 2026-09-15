export type StagingLoadTarget = 'ready' | 'session' | 'context';

export interface StagingLoadOptions {
  baseUrl: string;
  target: StagingLoadTarget;
  requests: number;
  concurrency: number;
  bearerToken?: string;
  confirmAuthenticatedLoad?: boolean;
  query?: string;
  timeoutMs?: number;
  maximumP95Ms?: number;
  minimumSuccessRate?: number;
  fetchImplementation?: typeof fetch;
}

export interface StagingLoadResult {
  status: 'passed' | 'failed';
  target: StagingLoadTarget;
  requests: number;
  concurrency: number;
  successes: number;
  failures: number;
  rateLimited: number;
  successRate: number;
  latencyMs: { p50: number; p95: number; p99: number; maximum: number };
  thresholds: { maximumP95Ms: number; minimumSuccessRate: number };
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${label} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return value;
}

function percentile(sorted: number[], quantile: number) {
  if (!sorted.length) return 0;
  return sorted[Math.ceil(sorted.length * quantile) - 1] ?? sorted.at(-1) ?? 0;
}

export function latencySummary(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    maximum: sorted.at(-1) ?? 0,
  };
}

export async function runStagingLoad(
  options: StagingLoadOptions,
): Promise<StagingLoadResult> {
  const origin = new URL(options.baseUrl);
  if (
    origin.protocol !== 'https:' ||
    origin.origin !== origin.toString().replace(/\/$/, '')
  ) {
    throw new Error('STAGING_BASE_URL must be a bare HTTPS origin.');
  }
  const requests = boundedInteger(
    options.requests,
    1,
    500,
    'STAGING_LOAD_REQUESTS',
  );
  const concurrency = boundedInteger(
    options.concurrency,
    1,
    Math.min(10, requests),
    'STAGING_LOAD_CONCURRENCY',
  );
  const authenticated = options.target !== 'ready';
  if (
    authenticated &&
    (!options.bearerToken || !options.confirmAuthenticatedLoad)
  ) {
    throw new Error(
      'Authenticated load requires STAGING_TEST_BEARER_TOKEN and STAGING_LOAD_CONFIRM=controlled-staging-load.',
    );
  }
  const target =
    options.target === 'ready'
      ? '/api/health/ready'
      : options.target === 'session'
        ? '/api/v1/session'
        : '/api/v1/context';
  const maximumP95Ms = Math.max(
    100,
    Math.min(options.maximumP95Ms ?? 2_000, 30_000),
  );
  const minimumSuccessRate = Math.max(
    0.5,
    Math.min(options.minimumSuccessRate ?? 0.99, 1),
  );
  const request = options.fetchImplementation ?? fetch;
  const durations: number[] = [];
  const statuses: number[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < requests) {
      cursor += 1;
      const started = performance.now();
      let status = 0;
      try {
        const response = await request(new URL(target, `${origin.origin}/`), {
          method: options.target === 'context' ? 'POST' : 'GET',
          redirect: 'manual',
          signal: AbortSignal.timeout(
            Math.max(1_000, Math.min(options.timeoutMs ?? 10_000, 30_000)),
          ),
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'user-agent': 'org-brain-staging-load/1',
            ...(options.bearerToken
              ? { authorization: `Bearer ${options.bearerToken}` }
              : {}),
          },
          body:
            options.target === 'context'
              ? JSON.stringify({
                  query:
                    options.query ??
                    'What evidence currently supports or challenges the delivery risk?',
                  maxEvidence: 6,
                })
              : undefined,
        });
        status = response.status;
        await response.body?.cancel();
      } catch {
        status = 0;
      }
      statuses.push(status);
      durations.push(Math.round(performance.now() - started));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const successes = statuses.filter((status) => status === 200).length;
  const rateLimited = statuses.filter((status) => status === 429).length;
  const summary = latencySummary(durations);
  const successRate = Number((successes / requests).toFixed(4));
  return {
    status:
      successRate >= minimumSuccessRate && summary.p95 <= maximumP95Ms
        ? 'passed'
        : 'failed',
    target: options.target,
    requests,
    concurrency,
    successes,
    failures: requests - successes,
    rateLimited,
    successRate,
    latencyMs: summary,
    thresholds: { maximumP95Ms, minimumSuccessRate },
  };
}
