import dotenv from 'dotenv';
import {
  runStagingLoad,
  type StagingLoadTarget,
} from '@/src/modules/operations/staging-load';

dotenv.config({ path: '.env.local' });

const target = (process.env.STAGING_LOAD_TARGET ??
  'ready') as StagingLoadTarget;
if (!['ready', 'session', 'context'].includes(target)) {
  throw new Error('STAGING_LOAD_TARGET must be ready, session or context.');
}

const result = await runStagingLoad({
  baseUrl: process.env.STAGING_BASE_URL ?? '',
  target,
  requests: Number(process.env.STAGING_LOAD_REQUESTS ?? 50),
  concurrency: Number(process.env.STAGING_LOAD_CONCURRENCY ?? 2),
  bearerToken: process.env.STAGING_TEST_BEARER_TOKEN,
  confirmAuthenticatedLoad:
    process.env.STAGING_LOAD_CONFIRM === 'controlled-staging-load',
  maximumP95Ms: Number(process.env.STAGING_LOAD_MAXIMUM_P95_MS ?? 2_000),
  minimumSuccessRate: Number(
    process.env.STAGING_LOAD_MINIMUM_SUCCESS_RATE ?? 0.99,
  ),
});

console.log(JSON.stringify(result, null, 2));
if (result.status === 'failed') process.exitCode = 1;
