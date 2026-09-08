CREATE TABLE IF NOT EXISTS identity_resolution_candidates (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  source_system text NOT NULL,
  key_type text NOT NULL,
  external_key text NOT NULL,
  candidate_resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  source_object_version_id uuid NOT NULL REFERENCES source_object_versions(id),
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  status text NOT NULL CHECK (status IN ('resolved', 'ambiguous', 'rejected')),
  rationale text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, source_system, key_type, external_key, candidate_resource_id, source_object_version_id)
);

CREATE INDEX IF NOT EXISTS identity_resolution_candidates_lookup_idx
  ON identity_resolution_candidates (workspace_id, source_system, key_type, external_key, status);
CREATE INDEX IF NOT EXISTS identity_resolution_candidates_resource_idx
  ON identity_resolution_candidates (workspace_id, candidate_resource_id, status);

ALTER TABLE identity_resolution_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS identity_resolution_candidates_actor_select ON identity_resolution_candidates;
CREATE POLICY identity_resolution_candidates_actor_select ON identity_resolution_candidates FOR SELECT TO org_brain_app
  USING (
    workspace_id = app_workspace_id()
    AND actor_can_access_resource(candidate_resource_id)
    AND EXISTS (
      SELECT 1 FROM source_object_versions source_version
      WHERE source_version.id = identity_resolution_candidates.source_object_version_id
    )
  );

DROP POLICY IF EXISTS identity_resolution_candidates_ingest_all ON identity_resolution_candidates;
CREATE POLICY identity_resolution_candidates_ingest_all ON identity_resolution_candidates FOR ALL TO org_brain_ingest
  USING (
    workspace_id = app_workspace_id()
    AND actor_can_access_resource(candidate_resource_id)
  )
  WITH CHECK (
    workspace_id = app_workspace_id()
    AND actor_can_access_resource(candidate_resource_id)
  );

GRANT SELECT ON identity_resolution_candidates TO org_brain_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON identity_resolution_candidates TO org_brain_ingest;

ALTER TABLE identity_resolution_candidates FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE identity_resolution_candidates IS
  'Traceable source-identity candidates, including deliberately unresolved ambiguity; only resolved candidates may be promoted to resource_identity_keys.';
