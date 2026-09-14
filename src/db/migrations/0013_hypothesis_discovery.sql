CREATE TABLE IF NOT EXISTS hypothesis_discovery_policies (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  owner_actor_id uuid NOT NULL REFERENCES users(id),
  service_actor_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  project_resource_id uuid NOT NULL REFERENCES resources(id),
  source_ids jsonb NOT NULL,
  concept_rules jsonb NOT NULL,
  minimum_source_diversity integer NOT NULL DEFAULT 3 CHECK (minimum_source_diversity >= 2),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'stopped')),
  model_route_policy_id uuid NOT NULL REFERENCES model_route_policies(id),
  ontology_version_id uuid NOT NULL REFERENCES ontology_versions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hypothesis_discovery_policies ADD COLUMN IF NOT EXISTS ontology_version_id uuid;
UPDATE hypothesis_discovery_policies policy
SET ontology_version_id = ontology.id
FROM ontology_versions ontology
WHERE policy.ontology_version_id IS NULL
  AND ontology.workspace_id = policy.workspace_id
  AND ontology.status = 'current';
ALTER TABLE hypothesis_discovery_policies ALTER COLUMN ontology_version_id SET NOT NULL;
ALTER TABLE hypothesis_discovery_policies
  DROP CONSTRAINT IF EXISTS hypothesis_discovery_policies_ontology_version_id_fkey;
ALTER TABLE hypothesis_discovery_policies
  ADD CONSTRAINT hypothesis_discovery_policies_ontology_version_id_fkey
  FOREIGN KEY (ontology_version_id) REFERENCES ontology_versions(id);

CREATE TABLE IF NOT EXISTS hypothesis_discovery_runs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  discovery_policy_id uuid NOT NULL REFERENCES hypothesis_discovery_policies(id) ON DELETE CASCADE,
  trigger_ref text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'no-candidate', 'failed')),
  documents_scanned integer NOT NULL DEFAULT 0 CHECK (documents_scanned >= 0),
  source_systems_scanned integer NOT NULL DEFAULT 0 CHECK (source_systems_scanned >= 0),
  candidates_formed integer NOT NULL DEFAULT 0 CHECK (candidates_formed >= 0),
  selected_route text NOT NULL CHECK (selected_route IN ('no-model', 'economy', 'high-assurance', 'deferred')),
  rationale text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (workspace_id, discovery_policy_id, trigger_ref)
);

CREATE TABLE IF NOT EXISTS hypothesis_discovery_candidates (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  discovery_policy_id uuid NOT NULL REFERENCES hypothesis_discovery_policies(id) ON DELETE CASCADE,
  discovery_run_id uuid NOT NULL REFERENCES hypothesis_discovery_runs(id) ON DELETE CASCADE,
  statement_hash text NOT NULL,
  statement text NOT NULL,
  rationale text NOT NULL,
  concepts jsonb NOT NULL,
  evidence_resource_ids jsonb NOT NULL,
  source_uris jsonb NOT NULL,
  source_systems jsonb NOT NULL,
  predictions jsonb NOT NULL,
  falsification_conditions jsonb NOT NULL,
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  novelty_score real NOT NULL CHECK (novelty_score >= 0 AND novelty_score <= 1),
  source_diversity integer NOT NULL CHECK (source_diversity >= 1),
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'accepted', 'dismissed', 'superseded')),
  process_name text NOT NULL,
  process_version text NOT NULL,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  promoted_resource_id uuid REFERENCES resources(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, discovery_policy_id, statement_hash)
);

ALTER TABLE model_invocations ADD COLUMN IF NOT EXISTS discovery_run_id uuid;
ALTER TABLE model_invocations DROP CONSTRAINT IF EXISTS model_invocations_discovery_run_id_fkey;
ALTER TABLE model_invocations ADD CONSTRAINT model_invocations_discovery_run_id_fkey
  FOREIGN KEY (discovery_run_id) REFERENCES hypothesis_discovery_runs(id) ON DELETE SET NULL;

ALTER TABLE notification_outbox ALTER COLUMN monitor_policy_id DROP NOT NULL;
ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS discovery_policy_id uuid;
ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_discovery_policy_id_fkey;
ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_discovery_policy_id_fkey
  FOREIGN KEY (discovery_policy_id) REFERENCES hypothesis_discovery_policies(id) ON DELETE CASCADE;
ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_target_check;
ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_target_check CHECK (
  (monitor_policy_id IS NOT NULL AND discovery_policy_id IS NULL) OR
  (monitor_policy_id IS NULL AND discovery_policy_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS hypothesis_discovery_candidates_status_idx
  ON hypothesis_discovery_candidates (discovery_policy_id, status, created_at DESC);

ALTER TABLE hypothesis_discovery_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_discovery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_discovery_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hypothesis_discovery_policies_actor_select ON hypothesis_discovery_policies;
CREATE POLICY hypothesis_discovery_policies_actor_select ON hypothesis_discovery_policies FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(project_resource_id));
DROP POLICY IF EXISTS hypothesis_discovery_runs_actor_select ON hypothesis_discovery_runs;
CREATE POLICY hypothesis_discovery_runs_actor_select ON hypothesis_discovery_runs FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS hypothesis_discovery_candidates_actor_select ON hypothesis_discovery_candidates;
CREATE POLICY hypothesis_discovery_candidates_actor_select ON hypothesis_discovery_candidates FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));

DROP POLICY IF EXISTS hypothesis_discovery_policies_ingest_all ON hypothesis_discovery_policies;
CREATE POLICY hypothesis_discovery_policies_ingest_all ON hypothesis_discovery_policies FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS hypothesis_discovery_runs_ingest_all ON hypothesis_discovery_runs;
CREATE POLICY hypothesis_discovery_runs_ingest_all ON hypothesis_discovery_runs FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS hypothesis_discovery_candidates_ingest_all ON hypothesis_discovery_candidates;
CREATE POLICY hypothesis_discovery_candidates_ingest_all ON hypothesis_discovery_candidates FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));

GRANT SELECT ON hypothesis_discovery_policies, hypothesis_discovery_runs,
  hypothesis_discovery_candidates TO org_brain_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON hypothesis_discovery_policies,
  hypothesis_discovery_runs, hypothesis_discovery_candidates TO org_brain_ingest;

ALTER TABLE hypothesis_discovery_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_discovery_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_discovery_candidates FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE hypothesis_discovery_policies IS 'Governed concept and evidence-diversity contract for unprompted hypothesis discovery.';
COMMENT ON TABLE hypothesis_discovery_candidates IS 'Untrusted hypotheses derived from unlabeled content and awaiting human review.';
