import { afterAll, describe, expect, it } from 'vitest';
import { withActorTransaction } from '@/src/db/actor-transaction';
import { getAppPool, getOwnerPool } from '@/src/db/pool';
import { IDS } from '@/src/modules/canonical/ids';
import {
  PERCEPTION_DISCOVERY_POLICY_ID,
  readSourceIntegrationState,
} from '@/src/modules/source-integration/service';

describe('permissioned simulated source integration', () => {
  afterAll(async () => {
    await getAppPool().end();
    if (globalThis.__orgBrainOwnerPool) await getOwnerPool().end();
  });

  it('exposes all four modalities to an authorised internal project member', async () => {
    const state = await withActorTransaction(
      { actorId: IDS.users.alex, workspaceId: IDS.workspace },
      (client) => readSourceIntegrationState(client),
    );

    expect(state).toMatchObject({
      configured: true,
      simulated: true,
      summary: {
        connectionCount: 3,
        artifactCount: 4,
        observationCount: 6,
        modalities: 4,
        externalCallsMade: 0,
      },
    });
    expect(state.connections.map((connection) => connection.transport)).toEqual(
      ['api', 'cli', 'mcp'],
    );
    expect(state.compounding).toMatchObject({
      schedule: 'active',
      hypothesis: {
        status: 'proposed',
        sourceDiversity: 2,
        evidenceCount: 3,
      },
    });
    expect(state.compounding?.nextEvaluationAt).toBeTruthy();
    expect(state.compounding?.hypothesis?.evidence).toHaveLength(3);
    expect(state.compounding?.hypothesis?.observationEvidence).toHaveLength(4);
    expect(
      state.compounding?.hypothesis?.observationEvidence.every(
        (item) =>
          item.role === 'supports' &&
          item.observationId.length > 0 &&
          item.assertionId.length > 0 &&
          item.locator.modality.length > 0,
      ),
    ).toBe(true);
    expect(
      state.compounding?.hypothesis?.evidence.every((item) =>
        state.artifacts.some(
          (artifact) =>
            artifact.id === item.artifactId &&
            artifact.sourceObjectVersionId === item.sourceObjectVersionId,
        ),
      ),
    ).toBe(true);
    expect(state.compounding?.hypothesis?.statement).toContain(
      'status ambiguity',
    );
    expect(
      state.artifacts
        .flatMap((artifact) => artifact.observations)
        .every(
          (observation) =>
            observation.locator.modality.length > 0 &&
            observation.assertions.length >= 2 &&
            observation.assertions.every(
              (assertion) =>
                assertion.id.length > 0 && assertion.relationshipId.length > 0,
            ),
        ),
    ).toBe(true);
  });

  it('filters the internal warehouse artifact before a non-team actor can perceive it', async () => {
    const state = await withActorTransaction(
      { actorId: IDS.users.morgan, workspaceId: IDS.workspace },
      (client) => readSourceIntegrationState(client),
    );

    expect(state.summary.connectionCount).toBe(3);
    expect(state.summary.artifactCount).toBe(3);
    expect(state.summary.observationCount).toBe(4);
    expect(state.compounding?.hypothesis?.evidenceCount).toBe(3);
    expect(state.compounding?.hypothesis?.evidence).toHaveLength(3);
    expect(state.compounding?.hypothesis?.observationEvidence).toHaveLength(4);
    const visibleArtifactIds = new Set(
      state.artifacts.map((artifact) => artifact.id),
    );
    expect(
      state.compounding?.hypothesis?.evidence.every((evidence) =>
        visibleArtifactIds.has(evidence.artifactId),
      ),
    ).toBe(true);
    expect(
      state.compounding?.hypothesis?.evidence.some(
        (evidence) => evidence.modality === 'table',
      ),
    ).toBe(false);
    expect(
      state.artifacts.some((artifact) => artifact.modality === 'table'),
    ).toBe(false);
    expect(
      state.artifacts
        .flatMap((artifact) => artifact.observations)
        .some((observation) => observation.statement.includes('38%')),
    ).toBe(false);
    expect(JSON.stringify(state)).not.toContain('38%');
    expect(
      state.compounding?.hypothesis?.observationEvidence.every((item) =>
        visibleArtifactIds.has(item.artifactId),
      ),
    ).toBe(true);
  });

  it('rejects an observation link that crosses the candidate evidence boundary', async () => {
    const owner = getOwnerPool();
    const candidate = await owner.query<{
      id: string;
      workspace_id: string;
      access_scope_id: string;
    }>(
      `SELECT id, workspace_id, access_scope_id
       FROM hypothesis_discovery_candidates
       WHERE discovery_policy_id = $1
       ORDER BY last_observed_at DESC, updated_at DESC LIMIT 1`,
      [PERCEPTION_DISCOVERY_POLICY_ID],
    );
    const internal = await owner.query<{
      artifact_resource_id: string;
      observation_resource_id: string;
      assertion_id: string;
    }>(
      `SELECT observation.artifact_resource_id,
         observation.observation_resource_id, assertion_row.id AS assertion_id
       FROM perception_observations observation
       JOIN assertions assertion_row
         ON assertion_row.subject_resource_id = observation.observation_resource_id
        AND assertion_row.predicate <> 'DERIVED_FROM'
       WHERE observation.access_scope_id = $1
       ORDER BY observation.created_at LIMIT 1`,
      [IDS.scopes.internal],
    );
    const candidateRow = candidate.rows[0]!;
    const internalRow = internal.rows[0]!;
    await expect(
      owner.query(
        `INSERT INTO hypothesis_discovery_evidence_links
          (id, workspace_id, access_scope_id, candidate_id,
           evidence_resource_id, observation_resource_id, assertion_id,
           evidence_role, rationale)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6,
           'supports', 'invalid cross-boundary test link')`,
        [
          candidateRow.workspace_id,
          candidateRow.access_scope_id,
          candidateRow.id,
          internalRow.artifact_resource_id,
          internalRow.observation_resource_id,
          internalRow.assertion_id,
        ],
      ),
    ).rejects.toThrow(
      /preserve the candidate, artifact, observation and assertion boundary/,
    );
  });
});
