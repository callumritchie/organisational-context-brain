import dotenv from 'dotenv';
import { getAppPool, getIngestionPool } from '@/src/db/pool';
import { bootstrapContextFoundation } from '@/src/modules/context-assets/foundation';

dotenv.config({ path: '.env.local' });

try {
  const result = await bootstrapContextFoundation();
  console.log(
    JSON.stringify(
      {
        assets: result.assets,
        ready: result.assessments.filter(
          (assessment) => assessment.status === 'ready',
        ).length,
        blocked: result.assessments.filter(
          (assessment) => assessment.status === 'blocked',
        ).length,
        evaluator: 'context-quality-v1',
      },
      null,
      2,
    ),
  );
} finally {
  await getIngestionPool().end();
  if (globalThis.__orgBrainAppPool) await getAppPool().end();
}
