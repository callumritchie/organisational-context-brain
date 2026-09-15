import { afterAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { IDS } from '@/src/modules/canonical/ids';

const scopeIds = {
  cedarClient: '51000000-0000-4000-8000-000000000001',
  cedarProject: '51000000-0000-4000-8000-000000000002',
  harbourClient: '51000000-0000-4000-8000-000000000003',
  harbourProject: '51000000-0000-4000-8000-000000000004',
  organisation: '51000000-0000-4000-8000-000000000005',
  alexPerson: '51000000-0000-4000-8000-000000000006',
  alexPersonAccess: '55000000-0000-4000-8000-000000000001',
};

const memoryIds = {
  cedar: '52000000-0000-4000-8000-000000000001',
  harbour: '52000000-0000-4000-8000-000000000002',
  organisation: '52000000-0000-4000-8000-000000000003',
  alexPerson: '52000000-0000-4000-8000-000000000004',
  invalidPromotion: '52000000-0000-4000-8000-000000000005',
};

const owner = new Pool({ connectionString: process.env.DATABASE_URL_OWNER });

async function insertFixture(client: PoolClient) {
  await client.query(
    `INSERT INTO access_scopes (id, workspace_id, name)
     VALUES ($1, $2, 'Alex private memory access')`,
    [scopeIds.alexPersonAccess, IDS.workspace],
  );
  await client.query(
    `INSERT INTO access_scope_grants (
       id, access_scope_id, principal_type, principal_id, permission
     ) VALUES (
       '56000000-0000-4000-8000-000000000001', $1, 'user', $2, 'manage'
     )`,
    [scopeIds.alexPersonAccess, IDS.users.alex],
  );
  await client.query(
    `INSERT INTO memory_scopes (
       id, workspace_id, scope_kind, name, access_scope_id,
       subject_resource_id, owner_actor_id, parent_scope_id
     ) VALUES
       ($1, $7, 'client', 'Cedar client', $8, $9, NULL, NULL),
       ($2, $7, 'project', 'Cedar project', $8, $10, NULL, $1),
       ($3, $7, 'client', 'Harbour client', $11, $12, NULL, NULL),
       ($4, $7, 'project', 'Harbour project', $11, $13, NULL, $3),
       ($5, $7, 'organisation', 'Northstar organisation', $14, NULL, NULL, NULL),
       ($6, $7, 'person', 'Alex private memory', $15, NULL, $16, NULL)`,
    [
      scopeIds.cedarClient,
      scopeIds.cedarProject,
      scopeIds.harbourClient,
      scopeIds.harbourProject,
      scopeIds.organisation,
      scopeIds.alexPerson,
      IDS.workspace,
      IDS.scopes.alexOnly,
      IDS.resources.cedar,
      IDS.resources.cedarProject,
      IDS.scopes.jamieOnly,
      IDS.resources.harbour,
      IDS.resources.harbourProject,
      IDS.scopes.internal,
      scopeIds.alexPersonAccess,
      IDS.users.alex,
    ],
  );
  await client.query(
    `INSERT INTO resources (
       id, workspace_id, access_scope_id, resource_kind, semantic_type,
       canonical_name, summary, properties
     ) VALUES
       ($1, $5, $6, 'content', 'OrganisationalMemory', 'Cedar delivery decision', 'cedar-only-memory-marker', '{}'),
       ($2, $5, $7, 'content', 'OrganisationalMemory', 'Harbour delivery decision', 'harbour-only-memory-marker', '{}'),
       ($3, $5, $8, 'content', 'OrganisationalMemory', 'Reviewed delivery pattern', 'reviewed-org-memory-marker', '{}'),
       ($4, $5, $9, 'content', 'OrganisationalMemory', 'Alex communication preference', 'alex-private-memory-marker', '{}')`,
    [
      memoryIds.cedar,
      memoryIds.harbour,
      memoryIds.organisation,
      memoryIds.alexPerson,
      IDS.workspace,
      IDS.scopes.alexOnly,
      IDS.scopes.jamieOnly,
      IDS.scopes.internal,
      scopeIds.alexPersonAccess,
    ],
  );
  await client.query(
    `INSERT INTO organisational_memories (
       resource_id, workspace_id, origin_scope_id, visibility_scope_id,
       memory_type, statement, statement_hash, transfer_class, sensitivity,
       lifecycle_status, review_status, outcome_status, confidence,
       quality_score, abstraction_reviewed, process_name, process_version,
       created_by, reviewed_by, reviewed_at
     ) VALUES
       ($1, $5, $6, $6, 'decision', 'Cedar chose a client-specific control.', repeat('a', 64),
        'client-confidential', 'client-confidential', 'active', 'approved',
        'validated', 0.9, 0.9, false, 'debrief', 'v1', $10, $10, now()),
       ($2, $5, $7, $7, 'risk-response', 'Harbour used a distinct mitigation.', repeat('b', 64),
        'client-confidential', 'client-confidential', 'active', 'approved',
        'supported', 0.8, 0.8, false, 'debrief', 'v1', $11, $11, now()),
       ($3, $5, $6, $8, 'approach-pattern', 'Short discovery loops reduce rework under tight access constraints.', repeat('c', 64),
        'abstractable', 'internal', 'active', 'approved', 'validated',
        0.85, 0.9, true, 'reviewed-promotion', 'v1', $10, $10, now()),
       ($4, $5, $9, $9, 'person-preference', 'Alex prefers concise written decision summaries.', repeat('d', 64),
        'client-confidential', 'restricted', 'active', 'approved', 'validated',
        0.9, 0.9, false, 'explicit-preference', 'v1', $10, $10, now())`,
    [
      memoryIds.cedar,
      memoryIds.harbour,
      memoryIds.organisation,
      memoryIds.alexPerson,
      IDS.workspace,
      scopeIds.cedarProject,
      scopeIds.harbourProject,
      scopeIds.organisation,
      scopeIds.alexPerson,
      IDS.users.alex,
      IDS.users.jamie,
    ],
  );
  await client.query(
    `INSERT INTO organisational_memory_evidence (
       id, workspace_id, memory_id, evidence_resource_id, evidence_scope_id,
       stance, contribution
     ) VALUES (
       '53000000-0000-4000-8000-000000000001', $1, $2, $3, $4,
       'supports', 'Restricted Cedar evidence behind reviewed abstraction.'
     )`,
    [
      IDS.workspace,
      memoryIds.organisation,
      IDS.resources.cedarProject,
      scopeIds.cedarProject,
    ],
  );
  await client.query(
    `INSERT INTO organisational_memory_promotions (
       id, workspace_id, source_memory_id, promoted_memory_id,
       from_scope_id, to_scope_id, decision, abstraction_summary, reviewed_by
     ) VALUES (
       '54000000-0000-4000-8000-000000000001', $1, $2, $3, $4, $5,
       'approved', 'Client identifiers and substantive findings removed.', $6
     )`,
    [
      IDS.workspace,
      memoryIds.cedar,
      memoryIds.organisation,
      scopeIds.cedarProject,
      scopeIds.organisation,
      IDS.users.alex,
    ],
  );
}

async function visibleMemories(client: PoolClient, actorId: string) {
  await client.query("SELECT set_config('app.actor_id', $1, true)", [actorId]);
  await client.query("SELECT set_config('app.workspace_id', $1, true)", [
    IDS.workspace,
  ]);
  return client.query<{ resource_id: string; statement: string }>(
    'SELECT resource_id, statement FROM organisational_memories ORDER BY resource_id',
  );
}

async function visibleMemoryResources(client: PoolClient) {
  return client.query<{ id: string; summary: string }>(
    `SELECT id, summary FROM resources
     WHERE id = ANY($1::uuid[])
     ORDER BY id`,
    [Object.values(memoryIds)],
  );
}

describe('database-enforced organisational memory isolation', () => {
  afterAll(async () => owner.end());

  it('separates private, project and reviewed organisation memory without lineage leaks', async () => {
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await insertFixture(client);

      await client.query('SAVEPOINT invalid_person_grant');
      await expect(
        client.query(
          `INSERT INTO access_scope_grants (
             id, access_scope_id, principal_type, principal_id, permission
           ) VALUES (
             '56000000-0000-4000-8000-000000000002', $1, 'user', $2, 'read'
           )`,
          [scopeIds.alexPersonAccess, IDS.users.jamie],
        ),
      ).rejects.toThrow('granted only to its owner');
      await client.query('ROLLBACK TO SAVEPOINT invalid_person_grant');

      await client.query('SAVEPOINT invalid_evidence_scope');
      await expect(
        client.query(
          `INSERT INTO organisational_memory_evidence (
             id, workspace_id, memory_id, evidence_resource_id,
             evidence_scope_id, stance, contribution
           ) VALUES (
             '53000000-0000-4000-8000-000000000002', $1, $2, $3, $4,
             'supports', 'Deliberately mismatched synthetic fixture.'
           )`,
          [
            IDS.workspace,
            memoryIds.organisation,
            IDS.resources.harbourProject,
            scopeIds.cedarProject,
          ],
        ),
      ).rejects.toThrow('Resource and declared scope must agree');
      await client.query('ROLLBACK TO SAVEPOINT invalid_evidence_scope');

      await client.query('SAVEPOINT invalid_promotion_lineage');
      await expect(
        client.query(
          `INSERT INTO organisational_memory_promotions (
             id, workspace_id, source_memory_id, promoted_memory_id,
             from_scope_id, to_scope_id, decision, abstraction_summary,
             reviewed_by
           ) VALUES (
             '54000000-0000-4000-8000-000000000002', $1, $2, $3, $4, $5,
             'approved', 'Deliberately mismatched synthetic lineage.', $6
           )`,
          [
            IDS.workspace,
            memoryIds.harbour,
            memoryIds.organisation,
            scopeIds.harbourProject,
            scopeIds.organisation,
            IDS.users.jamie,
          ],
        ),
      ).rejects.toThrow('must match source origin');
      await client.query('ROLLBACK TO SAVEPOINT invalid_promotion_lineage');

      await client.query('SAVEPOINT invalid_promotion');
      await client.query(
        `INSERT INTO resources (
           id, workspace_id, access_scope_id, resource_kind, semantic_type,
           canonical_name, summary, properties
         ) VALUES (
           $1, $2, $3, 'content', 'OrganisationalMemory',
           'Unsafe copied memory', 'unsafe-copy-marker', '{}'
         )`,
        [memoryIds.invalidPromotion, IDS.workspace, IDS.scopes.internal],
      );
      await expect(
        client.query(
          `INSERT INTO organisational_memories (
             resource_id, workspace_id, origin_scope_id, visibility_scope_id,
             memory_type, statement, statement_hash, transfer_class, sensitivity,
             lifecycle_status, review_status, outcome_status, confidence,
             quality_score, abstraction_reviewed, process_name, process_version,
             created_by, reviewed_by, reviewed_at
           ) VALUES (
             $1, $2, $3, $4, 'decision', 'Unsafe client copy', repeat('e', 64),
             'client-confidential', 'client-confidential', 'active', 'approved',
             'supported', 0.8, 0.8, true, 'unsafe-copy', 'v1', $5, $5, now()
           )`,
          [
            memoryIds.invalidPromotion,
            IDS.workspace,
            scopeIds.cedarProject,
            scopeIds.organisation,
            IDS.users.alex,
          ],
        ),
      ).rejects.toThrow('approved non-confidential abstraction');
      await client.query('ROLLBACK TO SAVEPOINT invalid_promotion');

      await client.query('SET LOCAL ROLE org_brain_app');
      const alex = await visibleMemories(client, IDS.users.alex);
      const jamie = await visibleMemories(client, IDS.users.jamie);
      const jamieResources = await visibleMemoryResources(client);
      const morgan = await visibleMemories(client, IDS.users.morgan);

      expect(alex.rows.map((row) => row.resource_id)).toEqual([
        memoryIds.cedar,
        memoryIds.organisation,
        memoryIds.alexPerson,
      ]);
      expect(jamie.rows.map((row) => row.resource_id)).toEqual([
        memoryIds.harbour,
        memoryIds.organisation,
      ]);
      expect(jamieResources.rows.map((row) => row.summary)).toEqual([
        'harbour-only-memory-marker',
        'reviewed-org-memory-marker',
      ]);
      expect(jamieResources.rows.map((row) => row.summary)).not.toContain(
        'cedar-only-memory-marker',
      );
      expect(jamieResources.rows.map((row) => row.summary)).not.toContain(
        'alex-private-memory-marker',
      );
      expect(morgan.rows).toEqual([]);

      await client.query("SELECT set_config('app.actor_id', $1, true)", [
        IDS.users.jamie,
      ]);
      const hiddenEvidence = await client.query(
        'SELECT * FROM organisational_memory_evidence',
      );
      const hiddenLineage = await client.query(
        'SELECT * FROM organisational_memory_promotions',
      );
      expect(hiddenEvidence.rows).toEqual([]);
      expect(hiddenLineage.rows).toEqual([]);

      await client.query("SELECT set_config('app.actor_id', $1, true)", [
        IDS.users.alex,
      ]);
      expect(
        (await client.query('SELECT * FROM organisational_memory_evidence'))
          .rows,
      ).toHaveLength(1);
      expect(
        (await client.query('SELECT * FROM organisational_memory_promotions'))
          .rows,
      ).toHaveLength(1);
      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
