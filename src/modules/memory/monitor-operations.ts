import { IDS } from '@/src/modules/canonical/ids';
import { getMemoryState, inMonitorTransaction, initializeDefaultMonitor } from './hypothesis-monitor';
import { drainMonitorJobs, enqueueManualMonitorRun } from './monitor-worker';

export class MonitorOperationPermissionError extends Error {}

export type MonitorOperation = 'pause' | 'resume' | 'run-now' | 'mark-notifications-read';

export async function operateMonitor(
  actor: { id: string; workspaceId: string; name: string; role: string },
  operation: MonitorOperation,
) {
  if (actor.id !== IDS.users.alex || actor.role !== 'Project Lead') {
    throw new MonitorOperationPermissionError(
      'Only the demo Project Lead can operate the hypothesis monitor',
    );
  }
  await initializeDefaultMonitor();
  if (operation === 'pause' || operation === 'resume') {
    await inMonitorTransaction(async (client) => {
      const status = operation === 'pause' ? 'paused' : 'active';
      await client.query(
        `UPDATE monitor_policies SET status = $2, updated_at = now() WHERE id = $1`,
        [IDS.monitors.atlasAbandonment, status],
      );
      await client.query(
        `UPDATE monitor_schedules SET enabled = $2, updated_at = now() WHERE monitor_policy_id = $1`,
        [IDS.monitors.atlasAbandonment, operation === 'resume'],
      );
    });
  } else if (operation === 'run-now') {
    await enqueueManualMonitorRun();
    await drainMonitorJobs({ limit: 1 });
  } else {
    await inMonitorTransaction(async (client) => {
      await client.query(
        `UPDATE notification_outbox SET status = 'read', read_at = now()
         WHERE recipient_actor_id = $1 AND status <> 'read'`,
        [actor.id],
      );
    });
  }
  return getMemoryState(actor);
}
