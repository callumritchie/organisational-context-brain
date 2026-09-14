import { IDS } from '@/src/modules/canonical/ids';
import {
  actorHasCapability,
  type ActorCapability,
} from '@/src/modules/identity/authorization';
import { inMonitorTransaction } from '@/src/modules/memory/hypothesis-monitor';
import { getDiscoveryState } from './discovery-demo';
import {
  drainDiscoveryJobs,
  enqueueManualDiscoveryRun,
} from './discovery-worker';

export class DiscoveryOperationPermissionError extends Error {}

export type DiscoveryOperation = 'pause' | 'resume' | 'run-now';

export async function operateDiscovery(
  actor: {
    id: string;
    workspaceId: string;
    name: string;
    role: string;
    capabilities?: ActorCapability[];
  },
  operation: DiscoveryOperation,
) {
  if (!actorHasCapability(actor, 'monitor.operate')) {
    throw new DiscoveryOperationPermissionError(
      'A monitor.operate capability is required to operate continual discovery',
    );
  }
  if (operation === 'pause' || operation === 'resume') {
    await inMonitorTransaction(async (client) => {
      const status = operation === 'pause' ? 'paused' : 'active';
      await client.query(
        `UPDATE hypothesis_discovery_policies SET status = $2,
         updated_at = now() WHERE id = $1`,
        [IDS.discoveryPolicies.supplierOnboarding, status],
      );
      await client.query(
        `UPDATE hypothesis_discovery_schedules SET enabled = $2,
         updated_at = now() WHERE discovery_policy_id = $1`,
        [IDS.discoveryPolicies.supplierOnboarding, operation === 'resume'],
      );
    });
  } else {
    await enqueueManualDiscoveryRun(IDS.discoveryPolicies.supplierOnboarding);
    await drainDiscoveryJobs({ limit: 1 });
  }
  return getDiscoveryState(actor);
}
