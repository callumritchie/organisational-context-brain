import { z } from 'zod';
import { getIngestionPool } from '@/src/db/pool';
import { ELIGIBILITY_RESEARCH_MUTATION } from '@/data/sources/research/eligibility-mutation';
import { IDS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';
import { ResearchFixtureConnector } from '@/src/modules/connectors/research-fixture-connector';
import { upsertEvidenceSignals } from '@/src/modules/signals/signal-service';
import { runResearchSync } from '@/src/modules/sync/research-sync';
import {
  getMemoryState,
  initializeDefaultMonitor,
} from '@/src/modules/memory/hypothesis-monitor';
import { drainMonitorJobs } from '@/src/modules/memory/monitor-worker';

export const researchMutationSchema = z
  .object({
    mutation: z.literal('eligibility-guidance-finding'),
  })
  .strict();

export class ResearchMutationPermissionError extends Error {}

export async function applyResearchMutation(
  actor: { id: string; role: string },
  rawInput: z.infer<typeof researchMutationSchema>,
) {
  if (actor.id !== IDS.users.alex || actor.role !== 'Project Lead') {
    throw new ResearchMutationPermissionError(
      'Only the demo Project Lead can trigger the prepared research mutation',
    );
  }
  researchMutationSchema.parse(rawInput);
  await initializeDefaultMonitor({ catchUpPreparedMutation: true });
  const pool = getIngestionPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_id', $1, true)", [
      IDS.users.ingestion,
    ]);
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [
      IDS.workspace,
    ]);
    const sync = await runResearchSync(
      client,
      new ResearchFixtureConnector(true),
    );
    const evidenceId = stableId(
      'evidence-resource',
      ELIGIBILITY_RESEARCH_MUTATION.externalId,
    );
    await upsertEvidenceSignals(client, {
      sourceExternalId: ELIGIBILITY_RESEARCH_MUTATION.externalId,
      accessScopeId: IDS.scopes.everyone,
      observedAt: ELIGIBILITY_RESEARCH_MUTATION.updatedAt,
      values: {
        authority: ELIGIBILITY_RESEARCH_MUTATION.authority,
        freshness: 0.99,
        engagement: 0.78,
        affinity: 0.93,
        epistemicConfidence: ELIGIBILITY_RESEARCH_MUTATION.evidence!.confidence,
      },
    });
    const provenance = await client.query<{
      source_object_version_id: string;
      assertion_id: string;
      predicate: string;
      process_name: string;
      process_version: string;
    }>(
      `SELECT source_version.id AS source_object_version_id,
         assertion_row.id AS assertion_id, assertion_row.predicate,
         assertion_row.process_name, assertion_row.process_version
       FROM source_objects source_object
       JOIN source_object_versions source_version
         ON source_version.source_object_id = source_object.id
       JOIN assertions assertion_row
         ON assertion_row.source_object_version_id = source_version.id
        AND assertion_row.subject_resource_id = $2
        AND assertion_row.object_resource_id = $4
       WHERE source_object.source_id = $1
         AND source_object.external_id = $3
       ORDER BY source_version.source_updated_at DESC,
         source_version.id DESC, assertion_row.confidence DESC
       LIMIT 1`,
      [
        IDS.sources.research,
        evidenceId,
        ELIGIBILITY_RESEARCH_MUTATION.externalId,
        IDS.resources.hypothesis,
      ],
    );
    await client.query('COMMIT');
    await drainMonitorJobs({ limit: 20 });
    const memory = await getMemoryState({
      id: actor.id,
      workspaceId: IDS.workspace,
      name: 'Alex Chen',
      role: actor.role,
    });
    const provenanceRecord = provenance.rows[0];
    const candidate = memory.candidates.find(
      (item) => item.sourceUri === ELIGIBILITY_RESEARCH_MUTATION.uri,
    );
    const event = sync.events[0];
    return {
      applied: sync.changed > 0,
      cursor: sync.cursorAfter,
      evidenceId,
      finding: ELIGIBILITY_RESEARCH_MUTATION.evidence!.title,
      memory,
      propagation: {
        source: {
          connector: 'research-fixture',
          syncRunId: sync.runId,
          eventId: event?.eventId ?? null,
          outcome:
            sync.changed > 0
              ? ('version-created' as const)
              : ('duplicate' as const),
        },
        version: {
          id: provenanceRecord?.source_object_version_id ?? null,
          sourceUri: ELIGIBILITY_RESEARCH_MUTATION.uri,
          updatedAt: ELIGIBILITY_RESEARCH_MUTATION.updatedAt,
        },
        observation: {
          id: evidenceId,
          title: ELIGIBILITY_RESEARCH_MUTATION.evidence!.title,
          process: provenanceRecord
            ? `${provenanceRecord.process_name}@${provenanceRecord.process_version}`
            : 'research-semantic-mapper',
        },
        assertion: {
          id: provenanceRecord?.assertion_id ?? null,
          predicate:
            provenanceRecord?.predicate ??
            ELIGIBILITY_RESEARCH_MUTATION.evidence!.stance,
        },
        hypothesis: {
          evaluationRunId: memory.latestRun?.id ?? null,
          candidateId: candidate?.id ?? null,
          candidateStatus: candidate?.status ?? null,
        },
        answerImpact: {
          before: memory.latestRun?.before?.epistemicStatus ?? null,
          after: memory.latestRun?.after?.epistemicStatus ?? null,
          evidenceDeltas: memory.latestRun?.deltas.length ?? 0,
          explanation:
            memory.latestRun?.rationale ??
            'No new material answer impact was detected.',
        },
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
