DO $$
DECLARE
  bootstrap_password text := current_setting('app.bootstrap_ingest_password', true);
BEGIN
  IF bootstrap_password IS NULL OR bootstrap_password = '' THEN
    RAISE EXCEPTION 'app.bootstrap_ingest_password must be set by the migration runner';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'org_brain_ingest') THEN
    CREATE ROLE org_brain_ingest LOGIN NOBYPASSRLS;
  END IF;
  EXECUTE format('ALTER ROLE org_brain_ingest PASSWORD %L', bootstrap_password);
END
$$;

ALTER ROLE org_brain_app NOBYPASSRLS;
ALTER ROLE org_brain_ingest NOBYPASSRLS;

CREATE TABLE IF NOT EXISTS entity_aliases (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  alias_type text NOT NULL CHECK (alias_type IN ('name', 'slug', 'source-key')),
  source_system text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, normalized_alias, alias_type, source_system)
);

CREATE INDEX IF NOT EXISTS entity_aliases_lookup_idx
  ON entity_aliases (workspace_id, normalized_alias);

ALTER TABLE entity_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entity_aliases_actor_select ON entity_aliases;
CREATE POLICY entity_aliases_actor_select ON entity_aliases FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_resource(resource_id));

DROP POLICY IF EXISTS resources_ingest_all ON resources;
CREATE POLICY resources_ingest_all ON resources FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));

DROP POLICY IF EXISTS entities_ingest_all ON entities;
CREATE POLICY entities_ingest_all ON entities FOR ALL TO org_brain_ingest
  USING (actor_can_access_resource(resource_id))
  WITH CHECK (actor_can_access_resource(resource_id));

DROP POLICY IF EXISTS content_objects_ingest_all ON content_objects;
CREATE POLICY content_objects_ingest_all ON content_objects FOR ALL TO org_brain_ingest
  USING (actor_can_access_resource(resource_id))
  WITH CHECK (actor_can_access_resource(resource_id));

DROP POLICY IF EXISTS entity_aliases_ingest_all ON entity_aliases;
CREATE POLICY entity_aliases_ingest_all ON entity_aliases FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_resource(resource_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_resource(resource_id));

DROP POLICY IF EXISTS sources_ingest_all ON sources;
CREATE POLICY sources_ingest_all ON sources FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id()) WITH CHECK (workspace_id = app_workspace_id());

DROP POLICY IF EXISTS sync_runs_ingest_all ON sync_runs;
CREATE POLICY sync_runs_ingest_all ON sync_runs FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id()) WITH CHECK (workspace_id = app_workspace_id());

DROP POLICY IF EXISTS source_objects_ingest_all ON source_objects;
CREATE POLICY source_objects_ingest_all ON source_objects FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));

DROP POLICY IF EXISTS source_versions_ingest_all ON source_object_versions;
CREATE POLICY source_versions_ingest_all ON source_object_versions FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));

DROP POLICY IF EXISTS content_versions_ingest_all ON content_versions;
CREATE POLICY content_versions_ingest_all ON content_versions FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));

DROP POLICY IF EXISTS relationships_ingest_all ON relationships;
CREATE POLICY relationships_ingest_all ON relationships FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_resource(from_resource_id) AND actor_can_access_resource(to_resource_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_resource(from_resource_id) AND actor_can_access_resource(to_resource_id));

DROP POLICY IF EXISTS assertions_ingest_all ON assertions;
CREATE POLICY assertions_ingest_all ON assertions FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));

DROP POLICY IF EXISTS provenance_ingest_all ON provenance_spans;
CREATE POLICY provenance_ingest_all ON provenance_spans FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id()) WITH CHECK (workspace_id = app_workspace_id());

DROP POLICY IF EXISTS search_documents_ingest_all ON search_documents;
CREATE POLICY search_documents_ingest_all ON search_documents FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id()) WITH CHECK (workspace_id = app_workspace_id());

GRANT USAGE ON SCHEMA public TO org_brain_ingest;
GRANT SELECT, INSERT, UPDATE, DELETE ON resources, entities, content_objects, entity_aliases,
  sources, sync_runs, source_objects, source_object_versions, content_versions, relationships,
  assertions, provenance_spans, search_documents TO org_brain_ingest;
GRANT SELECT ON workspaces, users, groups, group_memberships, access_scopes, access_scope_grants TO org_brain_ingest;
GRANT SELECT ON entity_aliases TO org_brain_app;
GRANT EXECUTE ON FUNCTION app_workspace_id(), app_actor_id(), actor_can_access_scope(uuid), actor_can_access_resource(uuid) TO org_brain_ingest;

ALTER TABLE resources FORCE ROW LEVEL SECURITY;
ALTER TABLE entities FORCE ROW LEVEL SECURITY;
ALTER TABLE content_objects FORCE ROW LEVEL SECURITY;
ALTER TABLE entity_aliases FORCE ROW LEVEL SECURITY;
ALTER TABLE source_objects FORCE ROW LEVEL SECURITY;
ALTER TABLE source_object_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE content_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE relationships FORCE ROW LEVEL SECURITY;
ALTER TABLE assertions FORCE ROW LEVEL SECURITY;
ALTER TABLE provenance_spans FORCE ROW LEVEL SECURITY;
ALTER TABLE search_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE query_traces FORCE ROW LEVEL SECURITY;
ALTER TABLE trace_stages FORCE ROW LEVEL SECURITY;
ALTER TABLE sources FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_runs FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE entity_aliases IS 'Observable identity-resolution inputs mapping names, slugs and source keys to canonical Resources.';
