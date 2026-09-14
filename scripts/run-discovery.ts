import dotenv from 'dotenv';
import { getAppPool, getIngestionPool } from '@/src/db/pool';
import { initializeDiscoveryDemo } from '@/src/modules/discovery/discovery-demo';

dotenv.config({ path: '.env.local' });

try {
  const result = await initializeDiscoveryDemo();
  console.log(JSON.stringify(result, null, 2));
} finally {
  await getAppPool().end();
  await getIngestionPool().end();
}
