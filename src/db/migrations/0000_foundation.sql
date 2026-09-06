CREATE EXTENSION IF NOT EXISTS vector;

DO $$
DECLARE
  bootstrap_password text := current_setting('app.bootstrap_app_password', true);
BEGIN
  IF bootstrap_password IS NULL OR bootstrap_password = '' THEN
    RAISE EXCEPTION 'app.bootstrap_app_password must be set by the migration runner';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'org_brain_app') THEN
    CREATE ROLE org_brain_app LOGIN NOBYPASSRLS;
  END IF;
  EXECUTE format('ALTER ROLE org_brain_app PASSWORD %L', bootstrap_password);
END
$$;

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  name text NOT NULL,
  role_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_memberships (
  group_id uuid NOT NULL REFERENCES groups(id),
  user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS access_scopes (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS access_scope_grants (
  id uuid PRIMARY KEY,
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  principal_type text NOT NULL CHECK (principal_type IN ('user', 'group', 'everyone')),
  principal_id uuid,
  permission text NOT NULL DEFAULT 'read' CHECK (permission IN ('read', 'manage'))
);

CREATE TABLE IF NOT EXISTS resources (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  resource_kind text NOT NULL CHECK (resource_kind IN ('entity', 'content')),
  semantic_type text NOT NULL,
  canonical_name text NOT NULL,
  summary text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entities (
  resource_id uuid PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
  normalized_name text NOT NULL
);

CREATE TABLE IF NOT EXISTS content_objects (
  resource_id uuid PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
  content_type text NOT NULL,
  current_version_id uuid
);

CREATE TABLE IF NOT EXISTS sources (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  source_type text NOT NULL,
  name text NOT NULL,
  cursor text,
  status text NOT NULL DEFAULT 'pending',
  last_successful_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  source_id uuid NOT NULL REFERENCES sources(id),
  status text NOT NULL,
  cursor_before text,
  cursor_after text,
  objects_seen integer NOT NULL DEFAULT 0,
  objects_changed integer NOT NULL DEFAULT 0,
  error_summary text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS source_objects (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  source_id uuid NOT NULL REFERENCES sources(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  external_id text NOT NULL,
  source_uri text NOT NULL,
  source_created_at timestamptz NOT NULL,
  source_updated_at timestamptz NOT NULL,
  current_content_hash text,
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id)
);

CREATE TABLE IF NOT EXISTS source_object_versions (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  source_object_id uuid NOT NULL REFERENCES source_objects(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  content_hash text NOT NULL,
  raw_payload jsonb NOT NULL,
  source_updated_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_object_id, content_hash)
);

CREATE TABLE IF NOT EXISTS content_versions (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  content_resource_id uuid NOT NULL REFERENCES resources(id),
  source_object_version_id uuid NOT NULL REFERENCES source_object_versions(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  body text NOT NULL,
  content_hash text NOT NULL,
  version_number integer NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_objects
  DROP CONSTRAINT IF EXISTS content_objects_current_version_id_fkey;
ALTER TABLE content_objects
  ADD CONSTRAINT content_objects_current_version_id_fkey
  FOREIGN KEY (current_version_id) REFERENCES content_versions(id);

CREATE TABLE IF NOT EXISTS relationships (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  from_resource_id uuid NOT NULL REFERENCES resources(id),
  to_resource_id uuid NOT NULL REFERENCES resources(id),
  relationship_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, from_resource_id, to_resource_id, relationship_type)
);

CREATE TABLE IF NOT EXISTS assertions (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  subject_resource_id uuid NOT NULL REFERENCES resources(id),
  predicate text NOT NULL,
  object_resource_id uuid REFERENCES resources(id),
  relationship_id uuid REFERENCES relationships(id),
  value jsonb,
  assertion_kind text NOT NULL CHECK (assertion_kind IN ('source-backed', 'rule-derived', 'AI-inferred')),
  source_object_version_id uuid REFERENCES source_object_versions(id),
  process_name text NOT NULL,
  process_version text NOT NULL,
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provenance_spans (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  assertion_id uuid NOT NULL REFERENCES assertions(id),
  source_object_version_id uuid NOT NULL REFERENCES source_object_versions(id),
  start_offset integer NOT NULL,
  end_offset integer NOT NULL,
  excerpt text NOT NULL
);

CREATE TABLE IF NOT EXISTS search_documents (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  resource_id uuid NOT NULL REFERENCES resources(id),
  assertion_id uuid REFERENCES assertions(id),
  content_version_id uuid REFERENCES content_versions(id),
  body text NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', body)) STORED,
  authority real NOT NULL DEFAULT 0.5,
  confidence real NOT NULL DEFAULT 0.5,
  source_updated_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS search_documents_vector_idx ON search_documents USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS relationships_from_idx ON relationships (workspace_id, from_resource_id, relationship_type);
CREATE INDEX IF NOT EXISTS relationships_to_idx ON relationships (workspace_id, to_resource_id, relationship_type);
CREATE INDEX IF NOT EXISTS assertions_relationship_idx ON assertions (relationship_id, access_scope_id);

CREATE TABLE IF NOT EXISTS query_traces (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  query_text text NOT NULL,
  ranking_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trace_stages (
  id uuid PRIMARY KEY,
  trace_id uuid NOT NULL REFERENCES query_traces(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  stage text NOT NULL,
  ordinal integer NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION app_workspace_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.workspace_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_actor_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.actor_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION actor_can_access_scope(target_scope uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT app_actor_id() IS NOT NULL
    AND app_workspace_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM access_scopes scope
      JOIN access_scope_grants grant_row ON grant_row.access_scope_id = scope.id
      WHERE scope.id = target_scope
        AND scope.workspace_id = app_workspace_id()
        AND grant_row.permission IN ('read', 'manage')
        AND (
          grant_row.principal_type = 'everyone'
          OR (grant_row.principal_type = 'user' AND grant_row.principal_id = app_actor_id())
          OR (
            grant_row.principal_type = 'group'
            AND EXISTS (
              SELECT 1 FROM group_memberships membership
              WHERE membership.group_id = grant_row.principal_id
                AND membership.user_id = app_actor_id()
            )
          )
        )
    )
$$;

CREATE OR REPLACE FUNCTION actor_can_access_resource(target_resource uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM resources resource
    WHERE resource.id = target_resource
      AND resource.workspace_id = app_workspace_id()
      AND actor_can_access_scope(resource.access_scope_id)
  )
$$;

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_object_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE assertions ENABLE ROW LEVEL SECURITY;
ALTER TABLE provenance_spans ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE trace_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resources_actor_select ON resources;
CREATE POLICY resources_actor_select ON resources FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));

DROP POLICY IF EXISTS entities_actor_select ON entities;
CREATE POLICY entities_actor_select ON entities FOR SELECT TO org_brain_app
  USING (actor_can_access_resource(resource_id));

DROP POLICY IF EXISTS content_objects_actor_select ON content_objects;
CREATE POLICY content_objects_actor_select ON content_objects FOR SELECT TO org_brain_app
  USING (actor_can_access_resource(resource_id));

DROP POLICY IF EXISTS source_objects_actor_select ON source_objects;
CREATE POLICY source_objects_actor_select ON source_objects FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));

DROP POLICY IF EXISTS source_versions_actor_select ON source_object_versions;
CREATE POLICY source_versions_actor_select ON source_object_versions FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));

DROP POLICY IF EXISTS content_versions_actor_select ON content_versions;
CREATE POLICY content_versions_actor_select ON content_versions FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));

DROP POLICY IF EXISTS assertions_actor_select ON assertions;
CREATE POLICY assertions_actor_select ON assertions FOR SELECT TO org_brain_app
  USING (
    workspace_id = app_workspace_id()
    AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(subject_resource_id)
    AND (object_resource_id IS NULL OR actor_can_access_resource(object_resource_id))
  );

DROP POLICY IF EXISTS relationships_actor_select ON relationships;
CREATE POLICY relationships_actor_select ON relationships FOR SELECT TO org_brain_app
  USING (
    workspace_id = app_workspace_id()
    AND actor_can_access_resource(from_resource_id)
    AND actor_can_access_resource(to_resource_id)
    AND EXISTS (
      SELECT 1 FROM assertions assertion_row
      WHERE assertion_row.relationship_id = relationships.id
    )
  );

DROP POLICY IF EXISTS provenance_actor_select ON provenance_spans;
CREATE POLICY provenance_actor_select ON provenance_spans FOR SELECT TO org_brain_app
  USING (
    workspace_id = app_workspace_id()
    AND EXISTS (SELECT 1 FROM assertions assertion_row WHERE assertion_row.id = provenance_spans.assertion_id)
    AND EXISTS (
      SELECT 1 FROM source_object_versions source_version
      WHERE source_version.id = provenance_spans.source_object_version_id
    )
  );

DROP POLICY IF EXISTS search_documents_actor_select ON search_documents;
CREATE POLICY search_documents_actor_select ON search_documents FOR SELECT TO org_brain_app
  USING (
    workspace_id = app_workspace_id()
    AND active
    AND actor_can_access_resource(resource_id)
    AND (assertion_id IS NULL OR EXISTS (
      SELECT 1 FROM assertions assertion_row WHERE assertion_row.id = search_documents.assertion_id
    ))
  );

DROP POLICY IF EXISTS sources_actor_select ON sources;
CREATE POLICY sources_actor_select ON sources FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id());

DROP POLICY IF EXISTS sync_runs_actor_select ON sync_runs;
CREATE POLICY sync_runs_actor_select ON sync_runs FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id());

DROP POLICY IF EXISTS query_traces_actor_all ON query_traces;
CREATE POLICY query_traces_actor_all ON query_traces FOR ALL TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_id = app_actor_id())
  WITH CHECK (workspace_id = app_workspace_id() AND actor_id = app_actor_id());

DROP POLICY IF EXISTS trace_stages_actor_all ON trace_stages;
CREATE POLICY trace_stages_actor_all ON trace_stages FOR ALL TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_id = app_actor_id())
  WITH CHECK (workspace_id = app_workspace_id() AND actor_id = app_actor_id());

GRANT USAGE ON SCHEMA public TO org_brain_app;
GRANT SELECT ON resources, entities, content_objects, sources, sync_runs, source_objects,
  source_object_versions, content_versions, relationships, assertions, provenance_spans,
  search_documents TO org_brain_app;
GRANT SELECT, INSERT ON query_traces, trace_stages TO org_brain_app;
GRANT EXECUTE ON FUNCTION app_workspace_id(), app_actor_id(), actor_can_access_scope(uuid), actor_can_access_resource(uuid) TO org_brain_app;

COMMENT ON TABLE resources IS 'Canonical identity for every securable, citable, connectable knowledge object.';
COMMENT ON TABLE assertions IS 'Source-backed or derived claims with independent provenance, confidence and access scope.';
COMMENT ON TABLE relationships IS 'Canonical resource-to-resource edges; visible only through at least one actor-visible assertion.';
