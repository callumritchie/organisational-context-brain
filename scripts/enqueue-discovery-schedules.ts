import dotenv from 'dotenv';
import { getAppPool, getIngestionPool } from '@/src/db/pool';
import { enqueueDueDiscoverySchedules } from '@/src/modules/discovery/discovery-worker';

dotenv.config({ path: '.env.local' });

try {
  const result = await enqueueDueDiscoverySchedules();
  console.log(`Enqueued ${result.enqueued} due discovery schedule(s).`);
} finally {
  await getAppPool().end();
  await getIngestionPool().end();
}
