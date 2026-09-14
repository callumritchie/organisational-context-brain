ALTER TABLE hypothesis_discovery_policies
  ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT 'Organisational outcome';
ALTER TABLE hypothesis_discovery_policies
  ADD COLUMN IF NOT EXISTS last_successful_run_at timestamptz;

ALTER TABLE hypothesis_discovery_runs
  ADD COLUMN IF NOT EXISTS candidates_reobserved integer NOT NULL DEFAULT 0
  CHECK (candidates_reobserved >= 0);

ALTER TABLE hypothesis_discovery_candidates
  ADD COLUMN IF NOT EXISTS last_observed_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE hypothesis_discovery_candidates
  ADD COLUMN IF NOT EXISTS missing_run_count integer NOT NULL DEFAULT 0
  CHECK (missing_run_count >= 0);

CREATE TABLE IF NOT EXISTS hypothesis_discovery_jobs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  discovery_policy_id uuid NOT NULL REFERENCES hypothesis_discovery_policies(id) ON DELETE CASCADE,
  source_change_event_id uuid REFERENCES source_change_events(id) ON DELETE CASCADE,
  job_kind text NOT NULL CHECK (job_kind IN ('event', 'scheduled', 'manual')),
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

ALTER TABLE model_invocations ADD COLUMN IF NOT EXISTS discovery_job_id uuid;
ALTER TABLE model_invocations
  DROP CONSTRAINT IF EXISTS model_invocations_discovery_job_id_fkey;
ALTER TABLE model_invocations
  ADD CONSTRAINT model_invocations_discovery_job_id_fkey
  FOREIGN KEY (discovery_job_id) REFERENCES hypothesis_discovery_jobs(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS hypothesis_discovery_jobs_claim_idx
  ON hypothesis_discovery_jobs (status, available_at, priority DESC, created_at)
  WHERE status IN ('pending', 'retrying', 'leased');

CREATE TABLE IF NOT EXISTS hypothesis_discovery_schedules (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  discovery_policy_id uuid NOT NULL UNIQUE
    REFERENCES hypothesis_discovery_policies(id) ON DELETE CASCADE,
  interval_seconds integer NOT NULL CHECK (interval_seconds >= 60),
  enabled boolean NOT NULL DEFAULT true,
  next_due_at timestamptz NOT NULL,
  last_enqueued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hypothesis_discovery_candidate_observations (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  candidate_id uuid NOT NULL
    REFERENCES hypothesis_discovery_candidates(id) ON DELETE CASCADE,
  discovery_run_id uuid NOT NULL
    REFERENCES hypothesis_discovery_runs(id) ON DELETE CASCADE,
  observation_kind text NOT NULL CHECK (observation_kind IN ('formed', 'reobserved', 'reactivated')),
  evidence_resource_ids jsonb NOT NULL,
  source_systems jsonb NOT NULL,
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, discovery_run_id)
);

ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_notification_type_check;
ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_notification_type_check
  CHECK (notification_type IN ('material-change', 'review-required', 'monitor-failed',
    'lifecycle-change', 'discovery-failed'));

ALTER TABLE hypothesis_discovery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_discovery_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_discovery_candidate_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hypothesis_discovery_jobs_actor_select ON hypothesis_discovery_jobs;
CREATE POLICY hypothesis_discovery_jobs_actor_select ON hypothesis_discovery_jobs FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS hypothesis_discovery_schedules_actor_select ON hypothesis_discovery_schedules;
CREATE POLICY hypothesis_discovery_schedules_actor_select ON hypothesis_discovery_schedules FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS hypothesis_discovery_candidate_observations_actor_select
  ON hypothesis_discovery_candidate_observations;
CREATE POLICY hypothesis_discovery_candidate_observations_actor_select
  ON hypothesis_discovery_candidate_observations FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));

DROP POLICY IF EXISTS hypothesis_discovery_jobs_ingest_all ON hypothesis_discovery_jobs;
CREATE POLICY hypothesis_discovery_jobs_ingest_all ON hypothesis_discovery_jobs FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS hypothesis_discovery_schedules_ingest_all ON hypothesis_discovery_schedules;
CREATE POLICY hypothesis_discovery_schedules_ingest_all ON hypothesis_discovery_schedules FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));
DROP POLICY IF EXISTS hypothesis_discovery_candidate_observations_ingest_all
  ON hypothesis_discovery_candidate_observations;
CREATE POLICY hypothesis_discovery_candidate_observations_ingest_all
  ON hypothesis_discovery_candidate_observations FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));

GRANT SELECT ON hypothesis_discovery_jobs, hypothesis_discovery_schedules,
  hypothesis_discovery_candidate_observations TO org_brain_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON hypothesis_discovery_jobs,
  hypothesis_discovery_schedules, hypothesis_discovery_candidate_observations TO org_brain_ingest;

ALTER TABLE hypothesis_discovery_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_discovery_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_discovery_candidate_observations FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE hypothesis_discovery_jobs IS
  'PostgreSQL-backed leased jobs for event, scheduled and manual open-ended discovery.';
COMMENT ON TABLE hypothesis_discovery_candidate_observations IS
  'Immutable per-run evidence observations for deduplicated discovery candidates.';
