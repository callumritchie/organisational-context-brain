import dotenv from 'dotenv';
import { getAppPool, getIngestionPool } from '@/src/db/pool';
import { drainDiscoveryJobs } from '@/src/modules/discovery/discovery-worker';

dotenv.config({ path: '.env.local' });

try {
  const result = await drainDiscoveryJobs({ limit: 100 });
  console.log(
    `Discovery worker completed ${result.processed} job(s); ${result.failed} failed.`,
  );
} finally {
  await getAppPool().end();
  await getIngestionPool().end();
}
