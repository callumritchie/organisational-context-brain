import dotenv from 'dotenv';
import { getIngestionPool, getOwnerPool } from '@/src/db/pool';
import { MeetingFixtureConnector } from '@/src/modules/connectors/meeting-fixture-connector';
import { ResearchFixtureConnector } from '@/src/modules/connectors/research-fixture-connector';
import { runMeetingSync, runResearchSync, seedIdentityAndScopes } from '@/src/modules/sync/research-sync';
import { IDS } from '@/src/modules/canonical/ids';

dotenv.config({ path: '.env.local' });

const ownerPool = getOwnerPool();
const ownerClient = await ownerPool.connect();

try {
  await ownerClient.query('BEGIN');
  await ownerClient.query(`TRUNCATE TABLE
    trace_stages, query_traces, search_documents, provenance_spans, assertions, relationships,
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
  await ingestionClient.query("SELECT set_config('app.actor_id', $1, true)", [IDS.users.jamie]);
  await ingestionClient.query("SELECT set_config('app.workspace_id', $1, true)", [IDS.workspace]);
  const research = await runResearchSync(ingestionClient, new ResearchFixtureConnector());
  const meetings = await runMeetingSync(ingestionClient, new MeetingFixtureConnector());
  await ingestionClient.query('COMMIT');
  console.log(`Seeded Northstar Labs: ${research.changed} research and ${meetings.changed} meeting records ingested via connectors.`);
} catch (error) {
  await ingestionClient.query('ROLLBACK');
  throw error;
} finally {
  ingestionClient.release();
  await ingestionPool.end();
}
