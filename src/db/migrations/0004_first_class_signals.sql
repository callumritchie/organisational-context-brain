CREATE TABLE IF NOT EXISTS signal_observations (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  signal_type text NOT NULL CHECK (signal_type IN ('authority', 'freshness', 'engagement', 'affinity', 'epistemic-confidence')),
  value real NOT NULL CHECK (value >= 0 AND value <= 1),
  source_kind text NOT NULL CHECK (source_kind IN ('source-backed', 'rule-derived', 'fixture')),
  source_object_version_id uuid REFERENCES source_object_versions(id),
  observed_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, resource_id, signal_type, observed_at, source_kind)
);

CREATE TABLE IF NOT EXISTS signal_snapshots (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  authority real NOT NULL CHECK (authority >= 0 AND authority <= 1),
  freshness real NOT NULL CHECK (freshness >= 0 AND freshness <= 1),
  engagement real NOT NULL CHECK (engagement >= 0 AND engagement <= 1),
  affinity real NOT NULL CHECK (affinity >= 0 AND affinity <= 1),
  epistemic_confidence real NOT NULL CHECK (epistemic_confidence >= 0 AND epistemic_confidence <= 1),
  model_version text NOT NULL,
  captured_at timestamptz NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS signal_snapshots_current_idx
  ON signal_snapshots (workspace_id, resource_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS signal_observations_resource_idx
  ON signal_observations (workspace_id, resource_id, signal_type, observed_at DESC);

ALTER TABLE signal_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signal_observations_actor_select ON signal_observations;
CREATE POLICY signal_observations_actor_select ON signal_observations FOR SELECT TO org_brain_app
  USING (
    workspace_id = app_workspace_id()
    AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(resource_id)
  );

DROP POLICY IF EXISTS signal_snapshots_actor_select ON signal_snapshots;
CREATE POLICY signal_snapshots_actor_select ON signal_snapshots FOR SELECT TO org_brain_app
  USING (
    workspace_id = app_workspace_id()
    AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(resource_id)
  );

DROP POLICY IF EXISTS signal_observations_ingest_all ON signal_observations;
CREATE POLICY signal_observations_ingest_all ON signal_observations FOR ALL TO org_brain_ingest
  USING (
    workspace_id = app_workspace_id()
    AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(resource_id)
  )
  WITH CHECK (
    workspace_id = app_workspace_id()
    AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(resource_id)
  );

DROP POLICY IF EXISTS signal_snapshots_ingest_all ON signal_snapshots;
CREATE POLICY signal_snapshots_ingest_all ON signal_snapshots FOR ALL TO org_brain_ingest
  USING (
    workspace_id = app_workspace_id()
    AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(resource_id)
  )
  WITH CHECK (
    workspace_id = app_workspace_id()
    AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(resource_id)
  );

GRANT SELECT ON signal_observations, signal_snapshots TO org_brain_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON signal_observations, signal_snapshots TO org_brain_ingest;

ALTER TABLE signal_observations FORCE ROW LEVEL SECURITY;
ALTER TABLE signal_snapshots FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE signal_observations IS 'Traceable point-in-time measurements used to derive ranking signals.';
COMMENT ON TABLE signal_snapshots IS 'Materialised current signal values used by permission-filtered retrieval.';
