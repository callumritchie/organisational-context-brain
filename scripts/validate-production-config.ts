import dotenv from 'dotenv';
import {
  type ProductionProcess,
  validateProductionConfiguration,
} from '@/src/modules/operations/production-config';

dotenv.config({ path: '.env.local' });

const profileArgument = process.argv.find((item) =>
  item.startsWith('--profile='),
);
const profile = profileArgument?.slice('--profile='.length) as
  | ProductionProcess
  | undefined;
if (!profile || !['web', 'operations', 'release'].includes(profile)) {
  throw new Error(
    'Use --profile=web, --profile=operations or --profile=release.',
  );
}
const result = validateProductionConfiguration(profile);
console.log(
  JSON.stringify({
    status: 'valid',
    profile: result.profile,
    authentication: result.authentication,
  }),
);
