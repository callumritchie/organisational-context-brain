import { z } from 'zod';
import { getIngestionPool } from '@/src/db/pool';
import { ELIGIBILITY_RESEARCH_MUTATION } from '@/data/sources/research/eligibility-mutation';
import { IDS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';
import { ResearchFixtureConnector } from '@/src/modules/connectors/research-fixture-connector';
import { upsertEvidenceSignals } from '@/src/modules/signals/signal-service';
import { runResearchSync } from '@/src/modules/sync/research-sync';

export const researchMutationSchema = z.object({
  mutation: z.literal('eligibility-guidance-finding'),
}).strict();

export class ResearchMutationPermissionError extends Error {}

export async function applyResearchMutation(
  actor: { id: string; role: string },
  rawInput: z.infer<typeof researchMutationSchema>,
) {
  if (actor.id !== IDS.users.alex || actor.role !== 'Project Lead') {
    throw new ResearchMutationPermissionError('Only the demo Project Lead can trigger the prepared research mutation');
  }
  researchMutationSchema.parse(rawInput);
  const pool = getIngestionPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_id', $1, true)", [IDS.users.ingestion]);
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [IDS.workspace]);
    const sync = await runResearchSync(client, new ResearchFixtureConnector(true));
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
    await client.query('COMMIT');
    return {
      applied: sync.changed > 0,
      cursor: sync.cursorAfter,
      evidenceId: stableId('evidence-resource', ELIGIBILITY_RESEARCH_MUTATION.externalId),
      finding: ELIGIBILITY_RESEARCH_MUTATION.evidence!.title,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
