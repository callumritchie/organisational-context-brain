import dotenv from 'dotenv';
import { getAppPool, getIngestionPool } from '@/src/db/pool';
import { syncSimulatedExternalSources } from '@/src/modules/source-integration/service';

dotenv.config({ path: '.env.local' });

try {
  const result = await syncSimulatedExternalSources();
  console.log(JSON.stringify(result, null, 2));
} finally {
  await getIngestionPool().end();
  if (globalThis.__orgBrainAppPool) await getAppPool().end();
}
