import dotenv from 'dotenv';
import { getAppPool, getIngestionPool } from '@/src/db/pool';
import { drainMonitorJobs } from '@/src/modules/memory/monitor-worker';

dotenv.config({ path: '.env.local' });

try {
  const result = await drainMonitorJobs({ limit: 100 });
  console.log(`Monitor worker completed ${result.processed} job(s); ${result.failed} failed.`);
} finally {
  await getAppPool().end();
  await getIngestionPool().end();
}
