CREATE TABLE IF NOT EXISTS ontology_versions (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  version text NOT NULL,
  status text NOT NULL CHECK (status IN ('current', 'superseded')),
  schema_document jsonb NOT NULL,
  checksum text NOT NULL,
  process_name text NOT NULL,
  process_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS ontology_versions_current_idx
  ON ontology_versions (workspace_id) WHERE status = 'current';

CREATE TABLE IF NOT EXISTS resource_identity_keys (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  source_system text NOT NULL,
  key_type text NOT NULL,
  external_key text NOT NULL,
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source_object_version_id uuid NOT NULL REFERENCES source_object_versions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, source_system, key_type, external_key)
);

CREATE INDEX IF NOT EXISTS resource_identity_keys_resource_idx
  ON resource_identity_keys (workspace_id, resource_id);

ALTER TABLE ontology_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_identity_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ontology_versions_actor_select ON ontology_versions;
CREATE POLICY ontology_versions_actor_select ON ontology_versions FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id());

DROP POLICY IF EXISTS ontology_versions_ingest_all ON ontology_versions;
CREATE POLICY ontology_versions_ingest_all ON ontology_versions FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id()) WITH CHECK (workspace_id = app_workspace_id());

DROP POLICY IF EXISTS identity_keys_actor_select ON resource_identity_keys;
CREATE POLICY identity_keys_actor_select ON resource_identity_keys FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_resource(resource_id));

DROP POLICY IF EXISTS identity_keys_ingest_all ON resource_identity_keys;
CREATE POLICY identity_keys_ingest_all ON resource_identity_keys FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_resource(resource_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_resource(resource_id));

GRANT SELECT ON ontology_versions, resource_identity_keys TO org_brain_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ontology_versions, resource_identity_keys TO org_brain_ingest;

ALTER TABLE ontology_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE resource_identity_keys FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE ontology_versions IS 'Immutable, checksummed ontology snapshots; one current version per workspace.';
COMMENT ON TABLE resource_identity_keys IS 'Source-native identifiers resolved to canonical Resources with traceable source versions.';
