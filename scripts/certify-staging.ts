import dotenv from 'dotenv';
import { certifyStaging } from '@/src/modules/operations/staging-certification';

dotenv.config({ path: '.env.local' });

const result = await certifyStaging({
  baseUrl: process.env.STAGING_BASE_URL ?? '',
  expectedCommit: process.env.STAGING_EXPECTED_COMMIT ?? '',
  expectedIdentityOrigin: process.env.STAGING_EXPECTED_IDP_ORIGIN ?? '',
  bearerToken: process.env.STAGING_TEST_BEARER_TOKEN,
  allowPublicOnly: process.env.STAGING_PUBLIC_ONLY === 'true',
});

console.log(JSON.stringify(result, null, 2));
if (result.outcome === 'failed') process.exitCode = 1;
