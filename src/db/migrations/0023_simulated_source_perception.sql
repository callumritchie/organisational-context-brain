CREATE TABLE IF NOT EXISTS external_source_connections (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_binding_id uuid NOT NULL REFERENCES host_project_bindings(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES sources(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  provider text NOT NULL,
  name text NOT NULL,
  transport text NOT NULL CHECK (transport IN ('api', 'cli', 'mcp')),
  strategy text NOT NULL CHECK (strategy IN (
    'synchronised-copy', 'authoritative-snapshot', 'federated-query'
  )),
  endpoint_label text NOT NULL,
  entitlement_revision text NOT NULL,
  freshness_sla_seconds integer NOT NULL CHECK (freshness_sla_seconds >= 60),
  deletion_mode text NOT NULL CHECK (deletion_mode IN (
    'source-tombstone', 'authoritative-snapshot', 'query-time-authority'
  )),
  capabilities jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
  cursor text,
  last_successful_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(capabilities) = 'array'),
  UNIQUE (project_binding_id, provider)
);

CREATE TABLE IF NOT EXISTS external_source_sync_receipts (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  connection_id uuid NOT NULL REFERENCES external_source_connections(id) ON DELETE CASCADE,
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  operation_kind text NOT NULL CHECK (operation_kind IN ('incremental-sync', 'snapshot', 'federated-query')),
  cursor_before text,
  cursor_after text NOT NULL,
  entitlement_revision text NOT NULL,
  simulated boolean NOT NULL DEFAULT true CHECK (simulated),
  command_summary text NOT NULL,
  response_shape text NOT NULL,
  artifact_count integer NOT NULL CHECK (artifact_count >= 0),
  status text NOT NULL CHECK (status IN ('completed', 'failed')),
  input_digest text NOT NULL CHECK (input_digest ~ '^[a-f0-9]{64}$'),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, input_digest)
);

CREATE TABLE IF NOT EXISTS perception_runs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  connection_id uuid NOT NULL REFERENCES external_source_connections(id) ON DELETE CASCADE,
  source_object_version_id uuid NOT NULL REFERENCES source_object_versions(id),
  artifact_resource_id uuid NOT NULL REFERENCES resources(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  modality text NOT NULL CHECK (modality IN ('document', 'table', 'transcript', 'image')),
  process_name text NOT NULL,
  process_version text NOT NULL,
  model_route text NOT NULL DEFAULT 'no-model' CHECK (model_route = 'no-model'),
  status text NOT NULL CHECK (status IN ('completed', 'no-signal', 'failed')),
  observation_count integer NOT NULL CHECK (observation_count >= 0),
  input_digest text NOT NULL CHECK (input_digest ~ '^[a-f0-9]{64}$'),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_object_version_id, process_name, process_version, input_digest)
);

CREATE TABLE IF NOT EXISTS perception_observations (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  perception_run_id uuid NOT NULL REFERENCES perception_runs(id) ON DELETE CASCADE,
  observation_resource_id uuid NOT NULL REFERENCES resources(id),
  artifact_resource_id uuid NOT NULL REFERENCES resources(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  observation_type text NOT NULL CHECK (observation_type IN ('fact', 'metric', 'quote', 'visual-signal')),
  statement text NOT NULL,
  excerpt text NOT NULL,
  confidence real NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  locator jsonb NOT NULL,
  governed_term_keys jsonb NOT NULL,
  relationship_type text CHECK (relationship_type IN ('INDICATES', 'CHALLENGES', 'MEASURES')),
  process_name text NOT NULL,
  process_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(locator) = 'object'),
  CHECK (jsonb_typeof(governed_term_keys) = 'array'),
  UNIQUE (perception_run_id, observation_resource_id)
);

CREATE OR REPLACE FUNCTION validate_external_source_connection()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  binding_workspace uuid;
  binding_access_scope uuid;
  source_workspace uuid;
BEGIN
  SELECT workspace_id, access_scope_id INTO binding_workspace, binding_access_scope
  FROM host_project_bindings WHERE id = NEW.project_binding_id;
  SELECT workspace_id INTO source_workspace FROM sources WHERE id = NEW.source_id;
  IF binding_workspace IS DISTINCT FROM NEW.workspace_id
    OR source_workspace IS DISTINCT FROM NEW.workspace_id
    OR binding_access_scope IS DISTINCT FROM NEW.access_scope_id
  THEN
    RAISE EXCEPTION 'External source connection must use its host project workspace and access boundary';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION validate_external_source_sync_receipt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  connection_workspace uuid;
  connection_access_scope uuid;
BEGIN
  SELECT workspace_id, access_scope_id INTO connection_workspace, connection_access_scope
  FROM external_source_connections WHERE id = NEW.connection_id;
  IF connection_workspace IS DISTINCT FROM NEW.workspace_id
    OR connection_access_scope IS DISTINCT FROM NEW.access_scope_id
  THEN
    RAISE EXCEPTION 'External source receipt must match its connection boundary';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION validate_perception_run()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  connection_workspace uuid;
  version_workspace uuid;
  version_access_scope uuid;
  artifact_workspace uuid;
  artifact_access_scope uuid;
BEGIN
  SELECT workspace_id INTO connection_workspace
  FROM external_source_connections WHERE id = NEW.connection_id;
  SELECT workspace_id, access_scope_id INTO version_workspace, version_access_scope
  FROM source_object_versions WHERE id = NEW.source_object_version_id;
  SELECT workspace_id, access_scope_id INTO artifact_workspace, artifact_access_scope
  FROM resources WHERE id = NEW.artifact_resource_id;
  IF connection_workspace IS DISTINCT FROM NEW.workspace_id
    OR version_workspace IS DISTINCT FROM NEW.workspace_id
    OR artifact_workspace IS DISTINCT FROM NEW.workspace_id
    OR version_access_scope IS DISTINCT FROM NEW.access_scope_id
    OR artifact_access_scope IS DISTINCT FROM NEW.access_scope_id
  THEN
    RAISE EXCEPTION 'Perception run must match its connection, source version and artifact boundary';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION validate_perception_observation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  run_workspace uuid;
  run_access_scope uuid;
  run_artifact uuid;
  observation_workspace uuid;
  observation_access_scope uuid;
  artifact_workspace uuid;
  artifact_access_scope uuid;
BEGIN
  SELECT workspace_id, access_scope_id, artifact_resource_id
  INTO run_workspace, run_access_scope, run_artifact
  FROM perception_runs WHERE id = NEW.perception_run_id;
  SELECT workspace_id, access_scope_id
  INTO observation_workspace, observation_access_scope
  FROM resources WHERE id = NEW.observation_resource_id;
  SELECT workspace_id, access_scope_id
  INTO artifact_workspace, artifact_access_scope
  FROM resources WHERE id = NEW.artifact_resource_id;
  IF run_workspace IS DISTINCT FROM NEW.workspace_id
    OR observation_workspace IS DISTINCT FROM NEW.workspace_id
    OR artifact_workspace IS DISTINCT FROM NEW.workspace_id
    OR run_access_scope IS DISTINCT FROM NEW.access_scope_id
    OR observation_access_scope IS DISTINCT FROM NEW.access_scope_id
    OR artifact_access_scope IS DISTINCT FROM NEW.access_scope_id
    OR run_artifact IS DISTINCT FROM NEW.artifact_resource_id
  THEN
    RAISE EXCEPTION 'Perception observation must share the run and artifact access boundary';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER external_source_connections_validate
  BEFORE INSERT OR UPDATE ON external_source_connections
  FOR EACH ROW EXECUTE FUNCTION validate_external_source_connection();
CREATE TRIGGER external_source_sync_receipts_validate
  BEFORE INSERT OR UPDATE ON external_source_sync_receipts
  FOR EACH ROW EXECUTE FUNCTION validate_external_source_sync_receipt();
CREATE TRIGGER perception_runs_validate
  BEFORE INSERT OR UPDATE ON perception_runs
  FOR EACH ROW EXECUTE FUNCTION validate_perception_run();
CREATE TRIGGER perception_observations_validate
  BEFORE INSERT OR UPDATE ON perception_observations
  FOR EACH ROW EXECUTE FUNCTION validate_perception_observation();

ALTER TABLE external_source_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_source_sync_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE perception_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE perception_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY external_source_connections_actor_select
  ON external_source_connections FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id()
    AND actor_can_access_scope(access_scope_id)
    AND actor_is_host_project_member(project_binding_id));
CREATE POLICY external_source_sync_receipts_actor_select
  ON external_source_sync_receipts FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id()
    AND actor_can_access_scope(access_scope_id)
    AND EXISTS (
      SELECT 1 FROM external_source_connections connection
      WHERE connection.id = connection_id
        AND actor_is_host_project_member(connection.project_binding_id)
    ));
CREATE POLICY perception_runs_actor_select
  ON perception_runs FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id()
    AND actor_can_access_resource(artifact_resource_id)
    AND EXISTS (
      SELECT 1 FROM external_source_connections connection
      WHERE connection.id = connection_id
        AND actor_is_host_project_member(connection.project_binding_id)
    ));
CREATE POLICY perception_observations_actor_select
  ON perception_observations FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id()
    AND actor_can_access_resource(observation_resource_id)
    AND actor_can_access_resource(artifact_resource_id)
    AND EXISTS (SELECT 1 FROM perception_runs run WHERE run.id = perception_run_id));

CREATE POLICY external_source_connections_ingest_all
  ON external_source_connections FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
CREATE POLICY external_source_sync_receipts_ingest_all
  ON external_source_sync_receipts FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
CREATE POLICY perception_runs_ingest_all
  ON perception_runs FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_resource(artifact_resource_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_resource(artifact_resource_id));
CREATE POLICY perception_observations_ingest_all
  ON perception_observations FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id()
    AND actor_can_access_resource(observation_resource_id)
    AND actor_can_access_resource(artifact_resource_id))
  WITH CHECK (workspace_id = app_workspace_id()
    AND actor_can_access_resource(observation_resource_id)
    AND actor_can_access_resource(artifact_resource_id));

REVOKE ALL ON external_source_connections, external_source_sync_receipts,
  perception_runs, perception_observations FROM PUBLIC;
GRANT SELECT ON external_source_connections, external_source_sync_receipts,
  perception_runs, perception_observations TO org_brain_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON external_source_connections,
  external_source_sync_receipts, perception_runs, perception_observations
  TO org_brain_ingest;

REVOKE ALL ON FUNCTION validate_external_source_connection(),
  validate_external_source_sync_receipt(), validate_perception_run(),
  validate_perception_observation() FROM PUBLIC;

ALTER TABLE external_source_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE external_source_sync_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE perception_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE perception_observations FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE external_source_connections IS
  'Project-scoped source contracts. This demo stores simulated API, CLI and MCP boundaries without credentials or live external calls.';
COMMENT ON TABLE external_source_sync_receipts IS
  'Immutable operational receipts proving cursor, entitlement revision, deletion semantics and simulated transport behavior.';
COMMENT ON TABLE perception_runs IS
  'Deterministic modality-specific interpretation runs over permissioned source artifact versions.';
COMMENT ON TABLE perception_observations IS
  'Fine-grained, securable observations with exact document, table, transcript or image locators.';
