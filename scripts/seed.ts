import dotenv from 'dotenv';
import { getAppPool, getIngestionPool, getOwnerPool } from '@/src/db/pool';
import { MeetingFixtureConnector } from '@/src/modules/connectors/meeting-fixture-connector';
import { CrmFixtureConnector } from '@/src/modules/connectors/crm-fixture-connector';
import { DocumentFixtureConnector } from '@/src/modules/connectors/document-fixture-connector';
import { MessageFixtureConnector } from '@/src/modules/connectors/message-fixture-connector';
import { ResearchFixtureConnector } from '@/src/modules/connectors/research-fixture-connector';
import {
  runDocumentSync,
  runMeetingSync,
  runMessageSync,
  runResearchSync,
  seedIdentityAndScopes,
} from '@/src/modules/sync/research-sync';
import { IDS } from '@/src/modules/canonical/ids';
import { storeCurrentOntology } from '@/src/modules/ontology/ontology-repository';
import { runCrmSync } from '@/src/modules/sync/crm-sync';
import { seedInitialSignals } from '@/src/modules/signals/signal-service';
import { initializeDefaultMonitor } from '@/src/modules/memory/hypothesis-monitor';
import { initializeDiscoveryDemo } from '@/src/modules/discovery/discovery-demo';
import { initializeSemanticEvolutionDemo } from '@/src/modules/ontology/semantic-evolution';

dotenv.config({ path: '.env.local' });

const ownerPool = getOwnerPool();
const ownerClient = await ownerPool.connect();

try {
  await ownerClient.query('BEGIN');
  await ownerClient.query(`TRUNCATE TABLE
    external_identities, identity_providers, user_capabilities,
    ontology_activation_runs, ontology_mapping_rules, ontology_change_proposals,
    hypothesis_discovery_candidate_observations, hypothesis_discovery_schedules,
    hypothesis_discovery_jobs,
    hypothesis_discovery_candidates, hypothesis_discovery_runs, hypothesis_discovery_policies,
    notification_outbox, model_usage_ledger, model_invocations, monitor_schedules, monitor_jobs,
    hypothesis_transitions, hypothesis_evaluations, hypothesis_revisions, hypothesis_records,
    memory_candidates, evidence_deltas, context_snapshots, monitor_runs, source_change_events, monitor_policies,
    model_route_policies,
    trace_stages, query_traces, search_embeddings, signal_snapshots, signal_observations, search_documents,
    provenance_spans, assertions, relationships,
    identity_resolution_candidates, resource_identity_keys, ontology_versions,
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
  await ingestionClient.query("SELECT set_config('app.actor_id', $1, true)", [
    IDS.users.ingestion,
  ]);
  await ingestionClient.query(
    "SELECT set_config('app.workspace_id', $1, true)",
    [IDS.workspace],
  );
  const research = await runResearchSync(
    ingestionClient,
    new ResearchFixtureConnector(),
  );
  const meetings = await runMeetingSync(
    ingestionClient,
    new MeetingFixtureConnector(),
  );
  const crm = await runCrmSync(ingestionClient, new CrmFixtureConnector());
  const documents = await runDocumentSync(
    ingestionClient,
    new DocumentFixtureConnector(),
  );
  const messages = await runMessageSync(
    ingestionClient,
    new MessageFixtureConnector(),
  );
  const signals = await seedInitialSignals(ingestionClient);
  await storeCurrentOntology(ingestionClient);
  await ingestionClient.query('COMMIT');
  await initializeDefaultMonitor();
  const discovery = await initializeDiscoveryDemo();
  await initializeSemanticEvolutionDemo();
  console.log(
    `Seeded Northstar Labs: ${research.changed} research, ${meetings.changed} meeting, ${crm.changed} CRM, ${documents.changed} document, ${messages.changed} message, and ${signals.observations} signal observations.`,
  );
  console.log(
    `Discovery ready: ${discovery.documents} unlabeled inputs produced ${discovery.candidates} review candidate(s).`,
  );
  console.log(
    'Semantic evolution ready: one evidence-linked ontology proposal awaits steward review.',
  );
} catch (error) {
  await ingestionClient.query('ROLLBACK');
  throw error;
} finally {
  ingestionClient.release();
  await ingestionPool.end();
  await getAppPool().end();
}
