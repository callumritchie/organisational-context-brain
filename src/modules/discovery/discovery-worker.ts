import { randomUUID } from 'node:crypto';
import { stableId } from '@/src/modules/canonical/stable-id';
import { markSourceEventProcessedWhenSettled } from '@/src/modules/events/event-status';
import { inMonitorTransaction } from '@/src/modules/memory/hypothesis-monitor';
import { executeDiscoveryPolicy } from './discovery-runner';

interface ClaimedDiscoveryJob {
  id: string;
  discovery_policy_id: string;
  source_change_event_id: string | null;
  job_kind: 'event' | 'scheduled' | 'manual';
  attempts: number;
  max_attempts: number;
  trigger_ref: string | null;
}

export async function claimDiscoveryJob(workerId: string) {
  return inMonitorTransaction(async (client) => {
    const result = await client.query<ClaimedDiscoveryJob>(
      `WITH candidate AS (
         SELECT job.id FROM hypothesis_discovery_jobs job
         JOIN hypothesis_discovery_policies policy
           ON policy.id = job.discovery_policy_id
         WHERE policy.status = 'active'
           AND job.available_at <= now()
           AND (
             job.status IN ('pending', 'retrying') OR
             (job.status = 'leased' AND job.leased_until < now())
           )
         ORDER BY job.priority DESC, job.created_at
         FOR UPDATE OF job SKIP LOCKED
         LIMIT 1
       )
       UPDATE hypothesis_discovery_jobs job SET status = 'leased',
         attempts = attempts + 1, worker_id = $1,
         leased_until = now() + interval '2 minutes', updated_at = now()
       FROM candidate
       WHERE job.id = candidate.id
       RETURNING job.id, job.discovery_policy_id, job.source_change_event_id,
         job.job_kind, job.attempts, job.max_attempts,
         (SELECT trigger_ref FROM source_change_events
          WHERE id = job.source_change_event_id) AS trigger_ref`,
      [workerId],
    );
    return result.rows[0] ?? null;
  });
}

async function completeDiscoveryJob(job: ClaimedDiscoveryJob) {
  await inMonitorTransaction(async (client) => {
    await client.query(
      `UPDATE hypothesis_discovery_jobs SET status = 'completed',
       completed_at = now(), leased_until = NULL, worker_id = NULL, updated_at = now()
       WHERE id = $1`,
      [job.id],
    );
    await markSourceEventProcessedWhenSettled(
      client,
      job.source_change_event_id,
    );
  });
}

async function failDiscoveryJob(job: ClaimedDiscoveryJob, error: unknown) {
  await inMonitorTransaction(async (client) => {
    const terminal = job.attempts >= job.max_attempts;
    const message =
      error instanceof Error ? error.message : 'Unknown discovery failure';
    await client.query(
      `UPDATE hypothesis_discovery_jobs SET status = $2, last_error = $3,
       leased_until = NULL, worker_id = NULL,
       available_at = CASE WHEN $2 = 'retrying'
         THEN now() + make_interval(secs => LEAST(300, attempts * 15))
         ELSE available_at END,
       updated_at = now() WHERE id = $1`,
      [job.id, terminal ? 'dead-letter' : 'retrying', message.slice(0, 2_000)],
    );
    if (terminal) {
      if (job.source_change_event_id) {
        await client.query(
          `UPDATE source_change_events SET status = 'failed', processed_at = now()
           WHERE id = $1`,
          [job.source_change_event_id],
        );
      }
      await client.query(
        `INSERT INTO notification_outbox
          (id, workspace_id, access_scope_id, monitor_policy_id,
           discovery_policy_id, recipient_actor_id, notification_type,
           severity, deduplication_key, payload)
         SELECT $1, job.workspace_id, job.access_scope_id, NULL,
           job.discovery_policy_id, policy.owner_actor_id, 'discovery-failed',
           'critical', $2, $3
         FROM hypothesis_discovery_jobs job
         JOIN hypothesis_discovery_policies policy
           ON policy.id = job.discovery_policy_id
         WHERE job.id = $4
         ON CONFLICT (workspace_id, deduplication_key) DO NOTHING`,
        [
          stableId('notification', `discovery-failed:${job.id}`),
          `discovery-failed:${job.id}`,
          { title: 'A continual discovery job needs attention', jobId: job.id },
          job.id,
        ],
      );
    }
  });
}

export async function drainDiscoveryJobs(options: { limit?: number } = {}) {
  const workerId = `discovery-${randomUUID()}`;
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  let processed = 0;
  let failed = 0;
  for (let index = 0; index < limit; index += 1) {
    const job = await claimDiscoveryJob(workerId);
    if (!job) break;
    try {
      await inMonitorTransaction((client) =>
        executeDiscoveryPolicy(client, {
          policyId: job.discovery_policy_id,
          triggerRef: job.trigger_ref ?? `${job.job_kind}:${job.id}`,
          jobId: job.id,
        }),
      );
      await completeDiscoveryJob(job);
      processed += 1;
    } catch (error) {
      await failDiscoveryJob(job, error);
      failed += 1;
    }
  }
  return { workerId, processed, failed };
}

export async function enqueueDueDiscoverySchedules(limit = 50) {
  return inMonitorTransaction(async (client) => {
    const due = await client.query<{
      id: string;
      workspace_id: string;
      access_scope_id: string;
      discovery_policy_id: string;
      next_due_at: Date;
      interval_seconds: number;
    }>(
      `SELECT schedule.* FROM hypothesis_discovery_schedules schedule
       JOIN hypothesis_discovery_policies policy
         ON policy.id = schedule.discovery_policy_id
       WHERE schedule.enabled AND policy.status = 'active'
         AND schedule.next_due_at <= now()
       ORDER BY schedule.next_due_at
       FOR UPDATE OF schedule SKIP LOCKED LIMIT $1`,
      [Math.max(1, Math.min(limit, 200))],
    );
    for (const schedule of due.rows) {
      const triggerRef = `discovery-schedule:${schedule.id}:${schedule.next_due_at.toISOString()}`;
      const eventId = stableId('source-change-event', triggerRef);
      const idempotencyKey = `scheduled-discovery:${schedule.discovery_policy_id}:${eventId}`;
      await client.query(
        `INSERT INTO source_change_events
          (id, workspace_id, access_scope_id, source_id, trigger_ref,
           changed_objects, event_kind, connector_type, change_kind, status,
           routing_payload)
         VALUES ($1, $2, $3, NULL, $4, 0, 'scheduled', 'discovery-scheduler',
           'refresh', 'queued', $5)
         ON CONFLICT (workspace_id, trigger_ref) DO NOTHING`,
        [
          eventId,
          schedule.workspace_id,
          schedule.access_scope_id,
          triggerRef,
          { discoveryScheduleId: schedule.id },
        ],
      );
      await client.query(
        `INSERT INTO hypothesis_discovery_jobs
          (id, workspace_id, access_scope_id, discovery_policy_id,
           source_change_event_id, job_kind, idempotency_key, status, priority,
           payload)
         VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, 'pending', 40, $7)
         ON CONFLICT (workspace_id, idempotency_key) DO NOTHING`,
        [
          stableId('hypothesis-discovery-job', idempotencyKey),
          schedule.workspace_id,
          schedule.access_scope_id,
          schedule.discovery_policy_id,
          eventId,
          idempotencyKey,
          { discoveryScheduleId: schedule.id },
        ],
      );
      await client.query(
        `UPDATE hypothesis_discovery_schedules SET last_enqueued_at = now(),
         next_due_at = now() + make_interval(secs => interval_seconds),
         updated_at = now() WHERE id = $1`,
        [schedule.id],
      );
    }
    return { enqueued: due.rowCount ?? 0 };
  });
}

export async function enqueueManualDiscoveryRun(policyId: string) {
  return inMonitorTransaction(async (client) => {
    const policy = await client.query<{
      workspace_id: string;
      access_scope_id: string;
    }>(
      `SELECT workspace_id, access_scope_id FROM hypothesis_discovery_policies
       WHERE id = $1 AND status = 'active'`,
      [policyId],
    );
    if (!policy.rows[0]) throw new Error('The discovery policy is not active');
    const triggerRef = `manual-discovery:${randomUUID()}`;
    const eventId = stableId('source-change-event', triggerRef);
    const idempotencyKey = `manual-discovery:${policyId}:${eventId}`;
    const jobId = stableId('hypothesis-discovery-job', idempotencyKey);
    await client.query(
      `INSERT INTO source_change_events
        (id, workspace_id, access_scope_id, source_id, trigger_ref,
         changed_objects, event_kind, connector_type, change_kind, status)
       VALUES ($1, $2, $3, NULL, $4, 0, 'manual', 'discovery-operations',
         'refresh', 'queued')`,
      [
        eventId,
        policy.rows[0].workspace_id,
        policy.rows[0].access_scope_id,
        triggerRef,
      ],
    );
    await client.query(
      `INSERT INTO hypothesis_discovery_jobs
        (id, workspace_id, access_scope_id, discovery_policy_id,
         source_change_event_id, job_kind, idempotency_key, status, priority,
         payload)
       VALUES ($1, $2, $3, $4, $5, 'manual', $6, 'pending', 90, '{}')`,
      [
        jobId,
        policy.rows[0].workspace_id,
        policy.rows[0].access_scope_id,
        policyId,
        eventId,
        idempotencyKey,
      ],
    );
    return { eventId, jobId };
  });
}
