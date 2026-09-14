import { randomUUID } from 'node:crypto';
import { IDS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';
import { markStaleHypotheses } from '@/src/modules/hypotheses/lifecycle';
import { markSourceEventProcessedWhenSettled } from '@/src/modules/events/event-status';
import { evaluateMonitorEvent, inMonitorTransaction } from './hypothesis-monitor';

interface ClaimedJob {
  id: string;
  monitor_policy_id: string;
  source_change_event_id: string | null;
  job_kind: 'event' | 'scheduled' | 'manual' | 'staleness-scan';
  attempts: number;
  max_attempts: number;
}

export async function claimMonitorJob(workerId: string) {
  return inMonitorTransaction(async (client) => {
    const result = await client.query<ClaimedJob>(
      `WITH candidate AS (
         SELECT job.id FROM monitor_jobs job
         JOIN monitor_policies policy ON policy.id = job.monitor_policy_id
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
       UPDATE monitor_jobs job SET status = 'leased', attempts = attempts + 1,
         worker_id = $1, leased_until = now() + interval '2 minutes', updated_at = now()
       FROM candidate WHERE job.id = candidate.id
       RETURNING job.id, job.monitor_policy_id, job.source_change_event_id,
         job.job_kind, job.attempts, job.max_attempts`,
      [workerId],
    );
    return result.rows[0] ?? null;
  });
}

async function completeJob(jobId: string) {
  await inMonitorTransaction(async (client) => {
    const event = await client.query<{ source_change_event_id: string | null }>(
      'SELECT source_change_event_id FROM monitor_jobs WHERE id = $1',
      [jobId],
    );
    await client.query(
      `UPDATE monitor_jobs SET status = 'completed', completed_at = now(), leased_until = NULL,
       worker_id = NULL, updated_at = now() WHERE id = $1`,
      [jobId],
    );
    await markSourceEventProcessedWhenSettled(
      client,
      event.rows[0]?.source_change_event_id ?? null,
    );
  });
}

async function failJob(job: ClaimedJob, error: unknown) {
  await inMonitorTransaction(async (client) => {
    const terminal = job.attempts >= job.max_attempts;
    const message = error instanceof Error ? error.message : 'Unknown monitor failure';
    await client.query(
      `UPDATE monitor_jobs SET status = $2, last_error = $3, leased_until = NULL,
       worker_id = NULL, available_at = CASE WHEN $2 = 'retrying'
         THEN now() + make_interval(secs => LEAST(300, attempts * 15)) ELSE available_at END,
       updated_at = now() WHERE id = $1`,
      [job.id, terminal ? 'dead-letter' : 'retrying', message.slice(0, 2_000)],
    );
    if (terminal && job.source_change_event_id) {
      await client.query(
        `UPDATE source_change_events SET status = 'failed', processed_at = now() WHERE id = $1`,
        [job.source_change_event_id],
      );
      await client.query(
        `INSERT INTO notification_outbox
          (id, workspace_id, access_scope_id, monitor_policy_id, recipient_actor_id,
           notification_type, severity, deduplication_key, payload)
         SELECT $1, job.workspace_id, job.access_scope_id, job.monitor_policy_id,
           policy.owner_actor_id, 'monitor-failed', 'critical', $2, $3
         FROM monitor_jobs job JOIN monitor_policies policy ON policy.id = job.monitor_policy_id
         WHERE job.id = $4
         ON CONFLICT (workspace_id, deduplication_key) DO NOTHING`,
        [
          stableId('notification', `monitor-failed:${job.id}`),
          `monitor-failed:${job.id}`,
          { title: 'A hypothesis monitor needs attention', jobId: job.id },
          job.id,
        ],
      );
    }
  });
}

export async function drainMonitorJobs(options: { limit?: number } = {}) {
  const workerId = `local-${randomUUID()}`;
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  let processed = 0;
  let failed = 0;
  for (let index = 0; index < limit; index += 1) {
    const job = await claimMonitorJob(workerId);
    if (!job) break;
    try {
      if (!job.source_change_event_id) {
        throw new Error('The monitor job has no source event');
      }
      if (job.job_kind === 'staleness-scan') {
        await inMonitorTransaction((client) => markStaleHypotheses(client));
      } else {
        if (job.job_kind === 'scheduled') {
          await inMonitorTransaction((client) => markStaleHypotheses(client));
        }
        await evaluateMonitorEvent(job.source_change_event_id, {
          monitorJobId: job.id,
          monitorPolicyId: job.monitor_policy_id,
        });
      }
      await completeJob(job.id);
      processed += 1;
    } catch (error) {
      await failJob(job, error);
      failed += 1;
    }
  }
  return { workerId, processed, failed };
}

export async function enqueueDueMonitorSchedules(limit = 50) {
  return inMonitorTransaction(async (client) => {
    const due = await client.query<{
      id: string;
      workspace_id: string;
      access_scope_id: string;
      monitor_policy_id: string;
      next_due_at: Date;
      interval_seconds: number;
    }>(
      `SELECT schedule.* FROM monitor_schedules schedule
       JOIN monitor_policies policy ON policy.id = schedule.monitor_policy_id
       WHERE schedule.enabled AND policy.status = 'active' AND schedule.next_due_at <= now()
       ORDER BY schedule.next_due_at FOR UPDATE OF schedule SKIP LOCKED LIMIT $1`,
      [Math.max(1, Math.min(limit, 200))],
    );
    for (const schedule of due.rows) {
      const triggerRef = `schedule:${schedule.id}:${schedule.next_due_at.toISOString()}`;
      const eventId = stableId('source-change-event', triggerRef);
      const idempotencyKey = `scheduled:${schedule.monitor_policy_id}:${eventId}`;
      await client.query(
        `INSERT INTO source_change_events
          (id, workspace_id, access_scope_id, source_id, trigger_ref, changed_objects,
           event_kind, connector_type, change_kind, status, routing_payload)
         VALUES ($1, $2, $3, NULL, $4, 0, 'scheduled', 'scheduler', 'refresh', 'queued', $5)
         ON CONFLICT (workspace_id, trigger_ref) DO NOTHING`,
        [eventId, schedule.workspace_id, schedule.access_scope_id, triggerRef, { scheduleId: schedule.id }],
      );
      await client.query(
        `INSERT INTO monitor_jobs
          (id, workspace_id, access_scope_id, monitor_policy_id, source_change_event_id,
           job_kind, idempotency_key, status, priority, payload)
         VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, 'pending', 40, $7)
         ON CONFLICT (workspace_id, idempotency_key) DO NOTHING`,
        [
          stableId('monitor-job', idempotencyKey),
          schedule.workspace_id,
          schedule.access_scope_id,
          schedule.monitor_policy_id,
          eventId,
          idempotencyKey,
          { scheduleId: schedule.id },
        ],
      );
      await client.query(
        `UPDATE monitor_schedules SET last_enqueued_at = now(),
         next_due_at = now() + make_interval(secs => interval_seconds), updated_at = now()
         WHERE id = $1`,
        [schedule.id],
      );
    }
    return { enqueued: due.rowCount ?? 0 };
  });
}

export async function enqueueManualMonitorRun() {
  return inMonitorTransaction(async (client) => {
    const triggerRef = `manual:${randomUUID()}`;
    const eventId = stableId('source-change-event', triggerRef);
    const idempotencyKey = `manual:${IDS.monitors.atlasAbandonment}:${eventId}`;
    await client.query(
      `INSERT INTO source_change_events
        (id, workspace_id, access_scope_id, source_id, trigger_ref, changed_objects,
         event_kind, connector_type, change_kind, status)
       VALUES ($1, $2, $3, NULL, $4, 0, 'manual', 'monitor-operations', 'refresh', 'queued')`,
      [eventId, IDS.workspace, IDS.scopes.everyone, triggerRef],
    );
    const jobId = stableId('monitor-job', idempotencyKey);
    await client.query(
      `INSERT INTO monitor_jobs
        (id, workspace_id, access_scope_id, monitor_policy_id, source_change_event_id,
         job_kind, idempotency_key, status, priority, payload)
       VALUES ($1, $2, $3, $4, $5, 'manual', $6, 'pending', 90, '{}')`,
      [jobId, IDS.workspace, IDS.scopes.everyone, IDS.monitors.atlasAbandonment, eventId, idempotencyKey],
    );
    return { eventId, jobId };
  });
}
