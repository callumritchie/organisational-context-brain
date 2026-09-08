import type { PoolClient } from 'pg';
import { INITIAL_SIGNAL_FIXTURES } from '@/data/signals/initial';
import { IDS } from '@/src/modules/canonical/ids';
import { stableId } from '@/src/modules/canonical/stable-id';

export const SIGNAL_SNAPSHOT_VERSION = 'northstar-signal-snapshot-v1';

const SOURCE_KINDS = {
  authority: 'source-backed',
  freshness: 'rule-derived',
  engagement: 'fixture',
  affinity: 'rule-derived',
  epistemicConfidence: 'source-backed',
} as const;

const DATABASE_SIGNAL_NAMES = {
  authority: 'authority',
  freshness: 'freshness',
  engagement: 'engagement',
  affinity: 'affinity',
  epistemicConfidence: 'epistemic-confidence',
} as const;

export interface EvidenceSignalInput {
  sourceExternalId: string;
  accessScopeId: string;
  observedAt: string;
  values: {
    authority: number;
    freshness: number;
    engagement: number;
    affinity: number;
    epistemicConfidence: number;
  };
}

export async function upsertEvidenceSignals(client: PoolClient, fixture: EvidenceSignalInput) {
  const evidenceResourceId = stableId('evidence-resource', fixture.sourceExternalId);
  const sourceVersion = await client.query<{ id: string }>(
    `SELECT assertion_row.source_object_version_id AS id
     FROM assertions assertion_row
     WHERE assertion_row.subject_resource_id = $1
       AND assertion_row.predicate IN ('SUPPORTS', 'CONTRADICTS')
     ORDER BY assertion_row.created_at DESC
     LIMIT 1`,
    [evidenceResourceId],
  );
  const sourceVersionId = sourceVersion.rows[0]?.id;
  if (!sourceVersionId) throw new Error(`No source version for signal fixture ${fixture.sourceExternalId}`);
  let observations = 0;
  for (const [signalKey, value] of Object.entries(fixture.values) as Array<
    [keyof EvidenceSignalInput['values'], number]
  >) {
    const signalType = DATABASE_SIGNAL_NAMES[signalKey];
    const sourceKind = SOURCE_KINDS[signalKey];
    await client.query(
      `INSERT INTO signal_observations
        (id, workspace_id, access_scope_id, resource_id, signal_type, value, source_kind,
         source_object_version_id, observed_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (workspace_id, resource_id, signal_type, observed_at, source_kind) DO NOTHING`,
      [stableId('signal-observation', `${evidenceResourceId}:${signalType}:${SIGNAL_SNAPSHOT_VERSION}`),
        IDS.workspace, fixture.accessScopeId, evidenceResourceId, signalType, value, sourceKind,
        sourceVersionId, fixture.observedAt, { fixture: SIGNAL_SNAPSHOT_VERSION }],
    );
    observations += 1;
  }
  await client.query(
    `INSERT INTO signal_snapshots
      (id, workspace_id, access_scope_id, resource_id, authority, freshness, engagement,
       affinity, epistemic_confidence, model_version, captured_at, is_current)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
     ON CONFLICT (workspace_id, resource_id) WHERE is_current DO UPDATE SET
       access_scope_id = EXCLUDED.access_scope_id,
       authority = EXCLUDED.authority,
       freshness = EXCLUDED.freshness,
       engagement = EXCLUDED.engagement,
       affinity = EXCLUDED.affinity,
       epistemic_confidence = EXCLUDED.epistemic_confidence,
       model_version = EXCLUDED.model_version,
       captured_at = EXCLUDED.captured_at`,
    [stableId('signal-snapshot', `${evidenceResourceId}:${SIGNAL_SNAPSHOT_VERSION}`), IDS.workspace,
      fixture.accessScopeId, evidenceResourceId, fixture.values.authority, fixture.values.freshness,
      fixture.values.engagement, fixture.values.affinity, fixture.values.epistemicConfidence,
      SIGNAL_SNAPSHOT_VERSION, fixture.observedAt],
  );
  return { observations, snapshots: 1 };
}

export async function seedInitialSignals(client: PoolClient) {
  let observationCount = 0;
  for (const fixture of INITIAL_SIGNAL_FIXTURES) {
    const result = await upsertEvidenceSignals(client, fixture);
    observationCount += result.observations;
  }
  return { observations: observationCount, snapshots: INITIAL_SIGNAL_FIXTURES.length };
}
