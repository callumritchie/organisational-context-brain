import type { PoolClient } from 'pg';

export async function markSourceEventProcessedWhenSettled(
  client: PoolClient,
  eventId: string | null,
) {
  if (!eventId) return;
  await client.query(
    `UPDATE source_change_events event SET status = 'processed', processed_at = now()
     WHERE event.id = $1
       AND NOT EXISTS (
         SELECT 1 FROM monitor_jobs job
         WHERE job.source_change_event_id = event.id AND job.status <> 'completed'
       )
       AND NOT EXISTS (
         SELECT 1 FROM hypothesis_discovery_jobs job
         WHERE job.source_change_event_id = event.id AND job.status <> 'completed'
       )`,
    [eventId],
  );
}
