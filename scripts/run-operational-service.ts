import dotenv from 'dotenv';
import { getAppPool, getIngestionPool } from '@/src/db/pool';
import {
  drainDiscoveryJobs,
  enqueueDueDiscoverySchedules,
} from '@/src/modules/discovery/discovery-worker';
import {
  drainMonitorJobs,
  enqueueDueMonitorSchedules,
} from '@/src/modules/memory/monitor-worker';
import { validateProductionConfiguration } from '@/src/modules/operations/production-config';

dotenv.config({ path: '.env.local' });

const mode = process.argv.includes('--scheduler') ? 'scheduler' : 'worker';
const intervalMs = Math.max(
  250,
  Math.min(
    Number(
      process.env.OPERATIONS_INTERVAL_MS ??
        (mode === 'worker' ? 2_000 : 60_000),
    ),
    300_000,
  ),
);
if (!Number.isFinite(intervalMs))
  throw new Error('OPERATIONS_INTERVAL_MS is invalid.');
if (process.env.DEPLOYMENT_ENFORCE_CONFIG === 'true') {
  validateProductionConfiguration('operations');
}

let stopping = false;
let wake: (() => void) | undefined;
function stop(signal: string) {
  stopping = true;
  wake?.();
  console.info(
    JSON.stringify({
      level: 'info',
      event: 'operations_stopping',
      mode,
      signal,
    }),
  );
}
process.once('SIGTERM', () => stop('SIGTERM'));
process.once('SIGINT', () => stop('SIGINT'));

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => {
    wake = resolve;
    const timeout = setTimeout(resolve, milliseconds);
    const original = wake;
    wake = () => {
      clearTimeout(timeout);
      original();
    };
  }).finally(() => {
    wake = undefined;
  });
}

async function verifyConnections() {
  await Promise.all([
    getAppPool().query('SELECT 1'),
    getIngestionPool().query('SELECT 1'),
  ]);
}

async function iteration() {
  if (mode === 'worker') {
    const [monitor, discovery] = await Promise.all([
      drainMonitorJobs({ limit: 25 }),
      drainDiscoveryJobs({ limit: 25 }),
    ]);
    return {
      monitorProcessed: monitor.processed,
      monitorFailed: monitor.failed,
      discoveryProcessed: discovery.processed,
      discoveryFailed: discovery.failed,
    };
  }
  const [monitor, discovery] = await Promise.all([
    enqueueDueMonitorSchedules(),
    enqueueDueDiscoverySchedules(),
  ]);
  return {
    monitorEnqueued: monitor.enqueued,
    discoveryEnqueued: discovery.enqueued,
  };
}

let exitCode = 0;
let lastHeartbeatAt = 0;
try {
  await verifyConnections();
  console.info(
    JSON.stringify({
      level: 'info',
      event: 'operations_started',
      mode,
      intervalMs,
      commit: process.env.APP_COMMIT_SHA ?? 'development',
    }),
  );
  while (!stopping) {
    const startedAt = Date.now();
    try {
      const result = await iteration();
      const hasActivity = Object.values(result).some((value) => value > 0);
      if (hasActivity || Date.now() - lastHeartbeatAt >= 5 * 60_000) {
        lastHeartbeatAt = Date.now();
        console.info(
          JSON.stringify({
            level: 'info',
            event: hasActivity
              ? 'operations_iteration'
              : 'operations_heartbeat',
            mode,
            durationMs: Date.now() - startedAt,
            ...result,
          }),
        );
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'operations_iteration_failed',
          mode,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
    }
    if (!stopping) await delay(intervalMs);
  }
} catch (error) {
  exitCode = 1;
  console.error(
    JSON.stringify({
      level: 'fatal',
      event: 'operations_start_failed',
      mode,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }),
  );
} finally {
  await Promise.allSettled([getAppPool().end(), getIngestionPool().end()]);
}
process.exitCode = exitCode;
