CREATE TABLE IF NOT EXISTS ontology_change_proposals (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  base_ontology_version_id uuid NOT NULL REFERENCES ontology_versions(id),
  source_candidate_id uuid REFERENCES hypothesis_discovery_candidates(id) ON DELETE SET NULL,
  proposed_by uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  rationale text NOT NULL,
  change_set jsonb NOT NULL,
  evidence_resource_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  impact_analysis jsonb NOT NULL,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected', 'superseded')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_note text,
  published_ontology_version_id uuid REFERENCES ontology_versions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(change_set) = 'array'),
  CHECK (jsonb_typeof(evidence_resource_ids) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS ontology_change_proposals_source_candidate_idx
  ON ontology_change_proposals (workspace_id, source_candidate_id)
  WHERE source_candidate_id IS NOT NULL AND status = 'proposed';

CREATE TABLE IF NOT EXISTS ontology_mapping_rules (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  ontology_version_id uuid NOT NULL REFERENCES ontology_versions(id),
  proposal_id uuid NOT NULL REFERENCES ontology_change_proposals(id),
  alias text NOT NULL,
  canonical_target text NOT NULL,
  description text NOT NULL,
  process_name text NOT NULL,
  process_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ontology_version_id, alias)
);

CREATE TABLE IF NOT EXISTS ontology_activation_runs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  proposal_id uuid NOT NULL REFERENCES ontology_change_proposals(id),
  from_ontology_version_id uuid NOT NULL REFERENCES ontology_versions(id),
  to_ontology_version_id uuid NOT NULL REFERENCES ontology_versions(id),
  status text NOT NULL CHECK (status IN ('completed', 'failed')),
  affected_resource_ids jsonb NOT NULL,
  affected_hypothesis_ids jsonb NOT NULL,
  replay_contract jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hypothesis_discovery_runs
  ADD COLUMN IF NOT EXISTS ontology_version_id uuid REFERENCES ontology_versions(id);
UPDATE hypothesis_discovery_runs run
SET ontology_version_id = policy.ontology_version_id
FROM hypothesis_discovery_policies policy
WHERE run.discovery_policy_id = policy.id AND run.ontology_version_id IS NULL;
ALTER TABLE hypothesis_discovery_runs ALTER COLUMN ontology_version_id SET NOT NULL;

ALTER TABLE ontology_change_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ontology_mapping_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE ontology_activation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ontology_change_proposals_actor_select ON ontology_change_proposals;
CREATE POLICY ontology_change_proposals_actor_select ON ontology_change_proposals FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS ontology_mapping_rules_actor_select ON ontology_mapping_rules;
CREATE POLICY ontology_mapping_rules_actor_select ON ontology_mapping_rules FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id());
DROP POLICY IF EXISTS ontology_activation_runs_actor_select ON ontology_activation_runs;
CREATE POLICY ontology_activation_runs_actor_select ON ontology_activation_runs FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));

DROP POLICY IF EXISTS ontology_change_proposals_ingest_all ON ontology_change_proposals;
CREATE POLICY ontology_change_proposals_ingest_all ON ontology_change_proposals FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS ontology_mapping_rules_ingest_all ON ontology_mapping_rules;
CREATE POLICY ontology_mapping_rules_ingest_all ON ontology_mapping_rules FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id()) WITH CHECK (workspace_id = app_workspace_id());
DROP POLICY IF EXISTS ontology_activation_runs_ingest_all ON ontology_activation_runs;
CREATE POLICY ontology_activation_runs_ingest_all ON ontology_activation_runs FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));

GRANT SELECT ON ontology_change_proposals, ontology_mapping_rules,
  ontology_activation_runs TO org_brain_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ontology_change_proposals,
  ontology_mapping_rules, ontology_activation_runs TO org_brain_ingest;

ALTER TABLE ontology_change_proposals FORCE ROW LEVEL SECURITY;
ALTER TABLE ontology_mapping_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE ontology_activation_runs FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE ontology_change_proposals IS
  'Untrusted, evidence-linked semantic change sets awaiting steward review.';
COMMENT ON TABLE ontology_mapping_rules IS
  'Version-bound aliases activated only through an approved ontology proposal.';
COMMENT ON TABLE ontology_activation_runs IS
  'Replayable impact trace recording which context must be reconsidered after semantic activation.';
