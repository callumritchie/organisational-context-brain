import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { IDS } from '@/src/modules/canonical/ids';
import { executeDiscoveryPolicy } from '@/src/modules/discovery/discovery-runner';
import { recordKnowledgeChangeEvents } from '@/src/modules/events/knowledge-change';

describe('continual discovery control plane', () => {
  it('routes connector changes idempotently and reobserves a candidate without duplicating it', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_INGEST });
    const client = await pool.connect();
    await client.query('BEGIN');
    try {
      await client.query("SELECT set_config('app.actor_id', $1, true)", [
        IDS.users.memoryAgent,
      ]);
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [
        IDS.workspace,
      ]);
      const connectorSources = [
        [IDS.sources.discoveryResearch, 'research'],
        [IDS.sources.discoveryMeetings, 'meetings'],
        [IDS.sources.discoveryCrm, 'crm'],
        [IDS.sources.discoveryDocuments, 'documents'],
        [IDS.sources.discoveryMessages, 'messages'],
      ] as const;
      const routedEvents = [];
      for (const [sourceId, connectorType] of connectorSources) {
        const batch = {
          sourceId,
          connectorType,
          syncRunId: randomUUID(),
          changes: [
            {
              accessScopeId: IDS.scopes.everyone,
              sourceObjectVersionId: randomUUID(),
              affectedResourceIds: [IDS.resources.supplierOnboarding],
              changeKind: 'updated' as const,
            },
          ],
        };
        const firstRouting = await recordKnowledgeChangeEvents(client, batch);
        const replayedRouting = await recordKnowledgeChangeEvents(client, batch);
        expect(firstRouting[0]).toMatchObject({ status: 'queued' });
        expect(replayedRouting[0]?.jobIds).toEqual(firstRouting[0]?.jobIds);
        routedEvents.push(firstRouting[0]!);
      }

      const jobs = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM hypothesis_discovery_jobs
         WHERE source_change_event_id = ANY($1::uuid[])`,
        [routedEvents.map((event) => event.eventId)],
      );
      expect(jobs.rows[0]?.count).toBe('5');

      const candidateCountBefore = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM hypothesis_discovery_candidates
         WHERE discovery_policy_id = $1`,
        [IDS.discoveryPolicies.supplierOnboarding],
      );
      const triggerRef = `integration-discovery:${randomUUID()}`;
      const firstRun = await executeDiscoveryPolicy(client, {
        policyId: IDS.discoveryPolicies.supplierOnboarding,
        triggerRef,
      });
      const replayedRun = await executeDiscoveryPolicy(client, {
        policyId: IDS.discoveryPolicies.supplierOnboarding,
        triggerRef,
      });
      const candidateCountAfter = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM hypothesis_discovery_candidates
         WHERE discovery_policy_id = $1`,
        [IDS.discoveryPolicies.supplierOnboarding],
      );
      const observations = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM hypothesis_discovery_candidate_observations
         WHERE discovery_run_id = $1`,
        [firstRun.runId],
      );

      expect(firstRun).toMatchObject({
        documentsScanned: 5,
        sourceSystemsScanned: 5,
        candidatesFormed: 0,
        candidatesReobserved: 1,
        duplicateRun: false,
      });
      expect(replayedRun.duplicateRun).toBe(true);
      expect(candidateCountAfter.rows[0]?.count).toBe(
        candidateCountBefore.rows[0]?.count,
      );
      expect(observations.rows[0]?.count).toBe('1');
      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  });
});
