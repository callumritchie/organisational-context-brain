CREATE TABLE IF NOT EXISTS monitor_policies (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  hypothesis_resource_id uuid NOT NULL REFERENCES resources(id),
  owner_actor_id uuid NOT NULL REFERENCES users(id),
  service_actor_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  query_text text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'stopped')),
  trigger_policy jsonb NOT NULL,
  materiality_policy jsonb NOT NULL,
  review_policy jsonb NOT NULL,
  stop_conditions jsonb NOT NULL,
  latest_snapshot_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_change_events (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  source_id uuid NOT NULL REFERENCES sources(id),
  trigger_ref text NOT NULL,
  changed_objects integer NOT NULL CHECK (changed_objects >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'ignored', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (workspace_id, trigger_ref)
);

CREATE TABLE IF NOT EXISTS monitor_runs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  monitor_policy_id uuid NOT NULL REFERENCES monitor_policies(id) ON DELETE CASCADE,
  source_change_event_id uuid NOT NULL REFERENCES source_change_events(id),
  service_actor_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('running', 'completed', 'no-change', 'failed')),
  material boolean NOT NULL DEFAULT false,
  before_snapshot_id uuid,
  after_snapshot_id uuid,
  rationale text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (monitor_policy_id, source_change_event_id)
);

CREATE TABLE IF NOT EXISTS context_snapshots (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  monitor_policy_id uuid NOT NULL REFERENCES monitor_policies(id) ON DELETE CASCADE,
  monitor_run_id uuid REFERENCES monitor_runs(id) ON DELETE SET NULL,
  trace_id uuid REFERENCES query_traces(id) ON DELETE SET NULL,
  context_hash text NOT NULL,
  epistemic_status text NOT NULL CHECK (epistemic_status IN ('supported', 'contested', 'insufficient')),
  supporting_evidence integer NOT NULL CHECK (supporting_evidence >= 0),
  contradicting_evidence integer NOT NULL CHECK (contradicting_evidence >= 0),
  evidence_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE monitor_policies DROP CONSTRAINT IF EXISTS monitor_policies_latest_snapshot_id_fkey;
ALTER TABLE monitor_policies ADD CONSTRAINT monitor_policies_latest_snapshot_id_fkey
  FOREIGN KEY (latest_snapshot_id) REFERENCES context_snapshots(id) ON DELETE SET NULL;
ALTER TABLE monitor_runs DROP CONSTRAINT IF EXISTS monitor_runs_before_snapshot_id_fkey;
ALTER TABLE monitor_runs ADD CONSTRAINT monitor_runs_before_snapshot_id_fkey
  FOREIGN KEY (before_snapshot_id) REFERENCES context_snapshots(id) ON DELETE SET NULL;
ALTER TABLE monitor_runs DROP CONSTRAINT IF EXISTS monitor_runs_after_snapshot_id_fkey;
ALTER TABLE monitor_runs ADD CONSTRAINT monitor_runs_after_snapshot_id_fkey
  FOREIGN KEY (after_snapshot_id) REFERENCES context_snapshots(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS evidence_deltas (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  monitor_run_id uuid NOT NULL REFERENCES monitor_runs(id) ON DELETE CASCADE,
  evidence_resource_id uuid NOT NULL REFERENCES resources(id),
  delta_type text NOT NULL CHECK (delta_type IN ('added', 'removed', 'stance-changed')),
  previous_stance text CHECK (previous_stance IS NULL OR previous_stance IN ('SUPPORTS', 'CONTRADICTS')),
  current_stance text CHECK (current_stance IS NULL OR current_stance IN ('SUPPORTS', 'CONTRADICTS')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memory_candidates (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  monitor_policy_id uuid NOT NULL REFERENCES monitor_policies(id) ON DELETE CASCADE,
  monitor_run_id uuid NOT NULL REFERENCES monitor_runs(id) ON DELETE CASCADE,
  hypothesis_resource_id uuid NOT NULL REFERENCES resources(id),
  evidence_resource_id uuid NOT NULL REFERENCES resources(id),
  evidence_assertion_id uuid NOT NULL REFERENCES assertions(id),
  candidate_kind text NOT NULL CHECK (candidate_kind IN ('counter-hypothesis', 'supporting-memory', 'qualifying-memory')),
  statement text NOT NULL,
  rationale text NOT NULL,
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'dismissed', 'superseded')),
  process_name text NOT NULL,
  process_version text NOT NULL,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_note text,
  promoted_resource_id uuid REFERENCES resources(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS monitor_runs_policy_idx ON monitor_runs (monitor_policy_id, started_at DESC);
CREATE INDEX IF NOT EXISTS context_snapshots_policy_idx ON context_snapshots (monitor_policy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS memory_candidates_policy_idx ON memory_candidates (monitor_policy_id, created_at DESC);

ALTER TABLE monitor_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_change_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitor_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_deltas ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS monitor_policies_actor_select ON monitor_policies;
CREATE POLICY monitor_policies_actor_select ON monitor_policies FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(hypothesis_resource_id));
DROP POLICY IF EXISTS source_change_events_actor_select ON source_change_events;
CREATE POLICY source_change_events_actor_select ON source_change_events FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS monitor_runs_actor_select ON monitor_runs;
CREATE POLICY monitor_runs_actor_select ON monitor_runs FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS context_snapshots_actor_select ON context_snapshots;
CREATE POLICY context_snapshots_actor_select ON context_snapshots FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS evidence_deltas_actor_select ON evidence_deltas;
CREATE POLICY evidence_deltas_actor_select ON evidence_deltas FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(evidence_resource_id));
DROP POLICY IF EXISTS memory_candidates_actor_select ON memory_candidates;
CREATE POLICY memory_candidates_actor_select ON memory_candidates FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(hypothesis_resource_id)
    AND actor_can_access_resource(evidence_resource_id));

DROP POLICY IF EXISTS monitor_policies_ingest_all ON monitor_policies;
CREATE POLICY monitor_policies_ingest_all ON monitor_policies FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS source_change_events_ingest_all ON source_change_events;
CREATE POLICY source_change_events_ingest_all ON source_change_events FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS monitor_runs_ingest_all ON monitor_runs;
CREATE POLICY monitor_runs_ingest_all ON monitor_runs FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS context_snapshots_ingest_all ON context_snapshots;
CREATE POLICY context_snapshots_ingest_all ON context_snapshots FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS evidence_deltas_ingest_all ON evidence_deltas;
CREATE POLICY evidence_deltas_ingest_all ON evidence_deltas FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(evidence_resource_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(evidence_resource_id));
DROP POLICY IF EXISTS memory_candidates_ingest_all ON memory_candidates;
CREATE POLICY memory_candidates_ingest_all ON memory_candidates FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(hypothesis_resource_id)
    AND actor_can_access_resource(evidence_resource_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(hypothesis_resource_id)
    AND actor_can_access_resource(evidence_resource_id));

GRANT SELECT ON monitor_policies, source_change_events, monitor_runs, context_snapshots,
  evidence_deltas, memory_candidates TO org_brain_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON monitor_policies, source_change_events, monitor_runs,
  context_snapshots, evidence_deltas, memory_candidates TO org_brain_ingest;

ALTER TABLE monitor_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE source_change_events FORCE ROW LEVEL SECURITY;
ALTER TABLE monitor_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE context_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence_deltas FORCE ROW LEVEL SECURITY;
ALTER TABLE memory_candidates FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE monitor_policies IS 'Explicit owner, scope and review contract for continual hypothesis evaluation.';
COMMENT ON TABLE context_snapshots IS 'Permission-scoped checkpoints used to compare organisational context over time.';
COMMENT ON TABLE memory_candidates IS 'Attributable latent learnings awaiting review before promotion to trusted Resource memory.';
