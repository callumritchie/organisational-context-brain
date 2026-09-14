import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { IDS } from '@/src/modules/canonical/ids';
import {
  OntologyProposalPermissionError,
  proposeOntologyChange,
  reviewOntologyProposalInTransaction,
} from '@/src/modules/ontology/semantic-evolution';

describe('semantic evolution governance', () => {
  it('publishes an approved additive version with mapping and replay receipts', async () => {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL_INGEST,
    });
    const client = await pool.connect();
    const proposalId = randomUUID();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true)", [
        IDS.users.alex,
      ]);
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [
        IDS.workspace,
      ]);
      await proposeOntologyChange(client, {
        proposalId,
        accessScopeId: IDS.scopes.everyone,
        proposedBy: IDS.users.memoryAgent,
        title: 'Represent delivery partners',
        rationale:
          'Permitted evidence repeatedly uses partner as a stable organisational actor.',
        changes: [
          {
            kind: 'add-resource-type',
            name: 'DeliveryPartner',
            resourceKind: 'entity',
            description:
              'An external organisation participating in service delivery.',
          },
          {
            kind: 'add-alias',
            alias: 'delivery partner',
            target: 'DeliveryPartner',
            description:
              'Maps source wording to the canonical DeliveryPartner type.',
          },
        ],
        evidenceResourceIds: [],
      });

      await reviewOntologyProposalInTransaction(
        client,
        { id: IDS.users.alex, role: 'Project Lead' },
        proposalId,
        'approve',
      );

      const proposal = await client.query<{
        status: string;
        version: string;
        process_name: string;
      }>(
        `SELECT proposal.status, ontology.version, ontology.process_name
         FROM ontology_change_proposals proposal
         JOIN ontology_versions ontology ON ontology.id = proposal.published_ontology_version_id
         WHERE proposal.id = $1`,
        [proposalId],
      );
      const mapping = await client.query<{ canonical_target: string }>(
        `SELECT canonical_target FROM ontology_mapping_rules WHERE proposal_id = $1`,
        [proposalId],
      );
      const activation = await client.query<{
        status: string;
        replay_contract: { result: string };
      }>(
        `SELECT status, replay_contract FROM ontology_activation_runs WHERE proposal_id = $1`,
        [proposalId],
      );
      expect(proposal.rows[0]).toMatchObject({
        status: 'approved',
        process_name: 'governed-semantic-evolution',
      });
      expect(proposal.rows[0].version).toMatch(/-v\d+$/);
      expect(mapping.rows[0]).toEqual({ canonical_target: 'DeliveryPartner' });
      expect(activation.rows[0].status).toBe('completed');
      expect(activation.rows[0].replay_contract.result).toContain(
        'no existing canonical resource mutated',
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  });

  it('does not allow a non-steward to approve meaning', async () => {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL_INGEST,
    });
    const client = await pool.connect();
    try {
      await expect(
        reviewOntologyProposalInTransaction(
          client,
          { id: IDS.users.jamie, role: 'Consultant' },
          randomUUID(),
          'approve',
        ),
      ).rejects.toBeInstanceOf(OntologyProposalPermissionError);
    } finally {
      client.release();
      await pool.end();
    }
  });
});
