import dotenv from 'dotenv';
import { getIngestionPool, getOwnerPool } from '@/src/db/pool';
import { MeetingFixtureConnector } from '@/src/modules/connectors/meeting-fixture-connector';
import { CrmFixtureConnector } from '@/src/modules/connectors/crm-fixture-connector';
import { DocumentFixtureConnector } from '@/src/modules/connectors/document-fixture-connector';
import { MessageFixtureConnector } from '@/src/modules/connectors/message-fixture-connector';
import { ResearchFixtureConnector } from '@/src/modules/connectors/research-fixture-connector';
import { runDocumentSync, runMeetingSync, runMessageSync, runResearchSync, seedIdentityAndScopes } from '@/src/modules/sync/research-sync';
import { IDS } from '@/src/modules/canonical/ids';
import { storeCurrentOntology } from '@/src/modules/ontology/ontology-repository';
import { runCrmSync } from '@/src/modules/sync/crm-sync';
import { seedInitialSignals } from '@/src/modules/signals/signal-service';

dotenv.config({ path: '.env.local' });

const ownerPool = getOwnerPool();
const ownerClient = await ownerPool.connect();

try {
  await ownerClient.query('BEGIN');
  await ownerClient.query(`TRUNCATE TABLE
    trace_stages, query_traces, search_embeddings, signal_snapshots, signal_observations, search_documents,
    provenance_spans, assertions, relationships,
    resource_identity_keys, ontology_versions,
    entity_aliases, content_objects, content_versions, entities, resources, source_object_versions, source_objects,
    sync_runs, sources, access_scope_grants, access_scopes, group_memberships, groups, users,
    workspaces CASCADE`);
  await seedIdentityAndScopes(ownerClient);
  await ownerClient.query('COMMIT');
} catch (error) {
  await ownerClient.query('ROLLBACK');
  throw error;
} finally {
  ownerClient.release();
  await ownerPool.end();
}

const ingestionPool = getIngestionPool();
const ingestionClient = await ingestionPool.connect();
try {
  await ingestionClient.query('BEGIN');
  await ingestionClient.query("SELECT set_config('app.actor_id', $1, true)", [IDS.users.ingestion]);
  await ingestionClient.query("SELECT set_config('app.workspace_id', $1, true)", [IDS.workspace]);
  const research = await runResearchSync(ingestionClient, new ResearchFixtureConnector());
  const meetings = await runMeetingSync(ingestionClient, new MeetingFixtureConnector());
  const crm = await runCrmSync(ingestionClient, new CrmFixtureConnector());
  const documents = await runDocumentSync(ingestionClient, new DocumentFixtureConnector());
  const messages = await runMessageSync(ingestionClient, new MessageFixtureConnector());
  const signals = await seedInitialSignals(ingestionClient);
  await storeCurrentOntology(ingestionClient);
  await ingestionClient.query('COMMIT');
  console.log(`Seeded Northstar Labs: ${research.changed} research, ${meetings.changed} meeting, ${crm.changed} CRM, ${documents.changed} document, ${messages.changed} message, and ${signals.observations} signal observations.`);
} catch (error) {
  await ingestionClient.query('ROLLBACK');
  throw error;
} finally {
  ingestionClient.release();
  await ingestionPool.end();
}
