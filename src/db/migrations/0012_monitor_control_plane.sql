ALTER TABLE source_change_events ALTER COLUMN source_id DROP NOT NULL;
ALTER TABLE source_change_events ADD COLUMN IF NOT EXISTS event_kind text NOT NULL DEFAULT 'source-change';
ALTER TABLE source_change_events ADD COLUMN IF NOT EXISTS connector_type text;
ALTER TABLE source_change_events ADD COLUMN IF NOT EXISTS change_kind text NOT NULL DEFAULT 'upsert';
ALTER TABLE source_change_events ADD COLUMN IF NOT EXISTS source_object_version_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE source_change_events ADD COLUMN IF NOT EXISTS affected_resource_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE source_change_events ADD COLUMN IF NOT EXISTS routing_payload jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE source_change_events DROP CONSTRAINT IF EXISTS source_change_events_status_check;
ALTER TABLE source_change_events ADD CONSTRAINT source_change_events_status_check
  CHECK (status IN ('pending', 'queued', 'processed', 'ignored', 'failed'));
ALTER TABLE source_change_events DROP CONSTRAINT IF EXISTS source_change_events_event_kind_check;
ALTER TABLE source_change_events ADD CONSTRAINT source_change_events_event_kind_check
  CHECK (event_kind IN ('source-change', 'scheduled', 'manual', 'staleness-scan'));

CREATE TABLE IF NOT EXISTS hypothesis_records (
  resource_id uuid PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  owner_actor_id uuid NOT NULL REFERENCES users(id),
  lifecycle_status text NOT NULL DEFAULT 'proposed'
    CHECK (lifecycle_status IN ('proposed', 'active', 'superseded', 'retired')),
  epistemic_status text NOT NULL DEFAULT 'untested'
    CHECK (epistemic_status IN ('untested', 'insufficient', 'supported', 'contested', 'refuted', 'stale')),
  current_revision integer NOT NULL DEFAULT 1 CHECK (current_revision > 0),
  stale_after_seconds integer NOT NULL DEFAULT 2592000 CHECK (stale_after_seconds > 0),
  last_evaluated_at timestamptz,
  superseded_by_resource_id uuid REFERENCES resources(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hypothesis_revisions (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  hypothesis_resource_id uuid NOT NULL REFERENCES hypothesis_records(resource_id) ON DELETE CASCADE,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  statement text NOT NULL,
  scope_document jsonb NOT NULL DEFAULT '{}'::jsonb,
  predictions jsonb NOT NULL DEFAULT '[]'::jsonb,
  falsification_conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ontology_version_id uuid REFERENCES ontology_versions(id),
  process_name text NOT NULL,
  process_version text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  change_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hypothesis_resource_id, revision_number)
);

CREATE TABLE IF NOT EXISTS hypothesis_evaluations (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  hypothesis_resource_id uuid NOT NULL REFERENCES hypothesis_records(resource_id) ON DELETE CASCADE,
  monitor_run_id uuid NOT NULL REFERENCES monitor_runs(id) ON DELETE CASCADE,
  context_snapshot_id uuid NOT NULL REFERENCES context_snapshots(id),
  epistemic_status text NOT NULL
    CHECK (epistemic_status IN ('insufficient', 'supported', 'contested', 'refuted', 'stale')),
  supporting_evidence integer NOT NULL CHECK (supporting_evidence >= 0),
  contradicting_evidence integer NOT NULL CHECK (contradicting_evidence >= 0),
  rationale text NOT NULL,
  process_name text NOT NULL,
  process_version text NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hypothesis_resource_id, monitor_run_id)
);

CREATE TABLE IF NOT EXISTS hypothesis_transitions (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  hypothesis_resource_id uuid NOT NULL REFERENCES hypothesis_records(resource_id) ON DELETE CASCADE,
  transition_kind text NOT NULL CHECK (transition_kind IN ('lifecycle', 'epistemic')),
  from_state text NOT NULL,
  to_state text NOT NULL,
  reason text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  monitor_run_id uuid REFERENCES monitor_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_route_policies (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  name text NOT NULL,
  mode text NOT NULL DEFAULT 'deterministic-only'
    CHECK (mode IN ('deterministic-only', 'economy', 'balanced', 'high-assurance')),
  routing_rules jsonb NOT NULL,
  budget_limits jsonb NOT NULL,
  allowed_providers jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE monitor_policies ADD COLUMN IF NOT EXISTS model_route_policy_id uuid;
ALTER TABLE monitor_policies DROP CONSTRAINT IF EXISTS monitor_policies_model_route_policy_id_fkey;
ALTER TABLE monitor_policies ADD CONSTRAINT monitor_policies_model_route_policy_id_fkey
  FOREIGN KEY (model_route_policy_id) REFERENCES model_route_policies(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS monitor_jobs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  monitor_policy_id uuid NOT NULL REFERENCES monitor_policies(id) ON DELETE CASCADE,
  source_change_event_id uuid REFERENCES source_change_events(id) ON DELETE CASCADE,
  job_kind text NOT NULL CHECK (job_kind IN ('event', 'scheduled', 'manual', 'staleness-scan')),
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'leased', 'retrying', 'completed', 'dead-letter')),
  priority integer NOT NULL DEFAULT 50 CHECK (priority >= 0 AND priority <= 100),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  leased_until timestamptz,
  worker_id text,
  last_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS monitor_jobs_claim_idx
  ON monitor_jobs (status, available_at, priority DESC, created_at)
  WHERE status IN ('pending', 'retrying', 'leased');

CREATE TABLE IF NOT EXISTS monitor_schedules (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  monitor_policy_id uuid NOT NULL UNIQUE REFERENCES monitor_policies(id) ON DELETE CASCADE,
  interval_seconds integer NOT NULL CHECK (interval_seconds >= 60),
  enabled boolean NOT NULL DEFAULT true,
  next_due_at timestamptz NOT NULL,
  last_enqueued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_invocations (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  route_policy_id uuid NOT NULL REFERENCES model_route_policies(id),
  monitor_run_id uuid REFERENCES monitor_runs(id) ON DELETE SET NULL,
  monitor_job_id uuid REFERENCES monitor_jobs(id) ON DELETE SET NULL,
  purpose text NOT NULL,
  task_fingerprint text NOT NULL,
  selected_route text NOT NULL CHECK (selected_route IN ('no-model', 'economy', 'high-assurance', 'deferred')),
  decision_reason text NOT NULL,
  provider text,
  model text,
  prompt_version text NOT NULL,
  estimated_input_tokens integer NOT NULL CHECK (estimated_input_tokens >= 0),
  maximum_output_tokens integer NOT NULL CHECK (maximum_output_tokens >= 0),
  actual_input_tokens integer CHECK (actual_input_tokens IS NULL OR actual_input_tokens >= 0),
  actual_output_tokens integer CHECK (actual_output_tokens IS NULL OR actual_output_tokens >= 0),
  estimated_cost_micros bigint NOT NULL DEFAULT 0 CHECK (estimated_cost_micros >= 0),
  actual_cost_micros bigint CHECK (actual_cost_micros IS NULL OR actual_cost_micros >= 0),
  cache_hit boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('skipped', 'routed', 'completed', 'failed', 'budget-blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (workspace_id, purpose, task_fingerprint, prompt_version)
);

CREATE TABLE IF NOT EXISTS model_usage_ledger (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  invocation_id uuid NOT NULL UNIQUE REFERENCES model_invocations(id) ON DELETE CASCADE,
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cached_tokens integer NOT NULL DEFAULT 0 CHECK (cached_tokens >= 0),
  reasoning_tokens integer NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
  cost_micros bigint NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),
  price_version text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  monitor_policy_id uuid NOT NULL REFERENCES monitor_policies(id) ON DELETE CASCADE,
  memory_candidate_id uuid REFERENCES memory_candidates(id) ON DELETE SET NULL,
  recipient_actor_id uuid NOT NULL REFERENCES users(id),
  notification_type text NOT NULL CHECK (notification_type IN ('material-change', 'review-required', 'monitor-failed', 'lifecycle-change')),
  severity text NOT NULL CHECK (severity IN ('info', 'attention', 'critical')),
  deduplication_key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'read', 'suppressed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  read_at timestamptz,
  UNIQUE (workspace_id, deduplication_key)
);

ALTER TABLE memory_candidates ADD COLUMN IF NOT EXISTS proposed_scope jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE memory_candidates ADD COLUMN IF NOT EXISTS predictions jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE memory_candidates ADD COLUMN IF NOT EXISTS falsification_conditions jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE hypothesis_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_route_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitor_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitor_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_invocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hypothesis_records_actor_select ON hypothesis_records;
CREATE POLICY hypothesis_records_actor_select ON hypothesis_records FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(resource_id));
DROP POLICY IF EXISTS hypothesis_revisions_actor_select ON hypothesis_revisions;
CREATE POLICY hypothesis_revisions_actor_select ON hypothesis_revisions FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(hypothesis_resource_id));
DROP POLICY IF EXISTS hypothesis_evaluations_actor_select ON hypothesis_evaluations;
CREATE POLICY hypothesis_evaluations_actor_select ON hypothesis_evaluations FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(hypothesis_resource_id));
DROP POLICY IF EXISTS hypothesis_transitions_actor_select ON hypothesis_transitions;
CREATE POLICY hypothesis_transitions_actor_select ON hypothesis_transitions FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(hypothesis_resource_id));
DROP POLICY IF EXISTS model_route_policies_actor_select ON model_route_policies;
CREATE POLICY model_route_policies_actor_select ON model_route_policies FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS monitor_jobs_actor_select ON monitor_jobs;
CREATE POLICY monitor_jobs_actor_select ON monitor_jobs FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS monitor_schedules_actor_select ON monitor_schedules;
CREATE POLICY monitor_schedules_actor_select ON monitor_schedules FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS model_invocations_actor_select ON model_invocations;
CREATE POLICY model_invocations_actor_select ON model_invocations FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS model_usage_ledger_actor_select ON model_usage_ledger;
CREATE POLICY model_usage_ledger_actor_select ON model_usage_ledger FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS notification_outbox_actor_select ON notification_outbox;
CREATE POLICY notification_outbox_actor_select ON notification_outbox FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND recipient_actor_id = app_actor_id()
    AND actor_can_access_scope(access_scope_id));

DROP POLICY IF EXISTS hypothesis_records_ingest_all ON hypothesis_records;
CREATE POLICY hypothesis_records_ingest_all ON hypothesis_records FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(resource_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(resource_id));
DROP POLICY IF EXISTS hypothesis_revisions_ingest_all ON hypothesis_revisions;
CREATE POLICY hypothesis_revisions_ingest_all ON hypothesis_revisions FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(hypothesis_resource_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(hypothesis_resource_id));
DROP POLICY IF EXISTS hypothesis_evaluations_ingest_all ON hypothesis_evaluations;
CREATE POLICY hypothesis_evaluations_ingest_all ON hypothesis_evaluations FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS hypothesis_transitions_ingest_all ON hypothesis_transitions;
CREATE POLICY hypothesis_transitions_ingest_all ON hypothesis_transitions FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS model_route_policies_ingest_all ON model_route_policies;
CREATE POLICY model_route_policies_ingest_all ON model_route_policies FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS monitor_jobs_ingest_all ON monitor_jobs;
CREATE POLICY monitor_jobs_ingest_all ON monitor_jobs FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS monitor_schedules_ingest_all ON monitor_schedules;
CREATE POLICY monitor_schedules_ingest_all ON monitor_schedules FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS model_invocations_ingest_all ON model_invocations;
CREATE POLICY model_invocations_ingest_all ON model_invocations FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS model_usage_ledger_ingest_all ON model_usage_ledger;
CREATE POLICY model_usage_ledger_ingest_all ON model_usage_ledger FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS notification_outbox_ingest_all ON notification_outbox;
CREATE POLICY notification_outbox_ingest_all ON notification_outbox FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));

GRANT SELECT ON hypothesis_records, hypothesis_revisions, hypothesis_evaluations,
  hypothesis_transitions, model_route_policies, monitor_jobs, monitor_schedules,
  model_invocations, model_usage_ledger, notification_outbox TO org_brain_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON hypothesis_records, hypothesis_revisions,
  hypothesis_evaluations, hypothesis_transitions, model_route_policies, monitor_jobs,
  monitor_schedules, model_invocations, model_usage_ledger, notification_outbox TO org_brain_ingest;

ALTER TABLE hypothesis_records FORCE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_evaluations FORCE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_transitions FORCE ROW LEVEL SECURITY;
ALTER TABLE model_route_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE monitor_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE monitor_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE model_invocations FORCE ROW LEVEL SECURITY;
ALTER TABLE model_usage_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_outbox FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE hypothesis_records IS 'Administrative lifecycle and current evidence state for each canonical Hypothesis Resource.';
COMMENT ON TABLE hypothesis_revisions IS 'Immutable, testable statements, predictions and falsification conditions.';
COMMENT ON TABLE monitor_jobs IS 'PostgreSQL-backed leased jobs for event, scheduled and manual monitor evaluation.';
COMMENT ON TABLE model_invocations IS 'Every model-routing decision, including zero-token and budget-blocked decisions.';
COMMENT ON TABLE notification_outbox IS 'Permission-scoped, deduplicated notifications created transactionally with monitor outcomes.';
