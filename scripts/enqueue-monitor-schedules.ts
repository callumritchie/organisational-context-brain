import dotenv from 'dotenv';
import { getAppPool, getIngestionPool } from '@/src/db/pool';
import { enqueueDueMonitorSchedules } from '@/src/modules/memory/monitor-worker';

dotenv.config({ path: '.env.local' });

try {
  const result = await enqueueDueMonitorSchedules();
  console.log(`Enqueued ${result.enqueued} due monitor schedule(s).`);
} finally {
  await getAppPool().end();
  await getIngestionPool().end();
}
