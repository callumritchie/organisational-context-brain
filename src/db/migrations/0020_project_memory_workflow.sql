ALTER TABLE user_capabilities
  DROP CONSTRAINT IF EXISTS user_capabilities_capability_check;
ALTER TABLE user_capabilities
  ADD CONSTRAINT user_capabilities_capability_check CHECK (capability IN (
    'hypothesis.review', 'monitor.operate', 'ontology.review',
    'memory.capture', 'memory.review', 'kickoff.generate'
  ));

CREATE TABLE IF NOT EXISTS host_project_bindings (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  provider text NOT NULL,
  external_project_id text NOT NULL,
  project_resource_id uuid NOT NULL REFERENCES resources(id),
  client_resource_id uuid NOT NULL REFERENCES resources(id),
  project_scope_id uuid NOT NULL REFERENCES memory_scopes(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  membership_revision text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  client_memory_enabled boolean NOT NULL DEFAULT false CHECK (NOT client_memory_enabled),
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider, external_project_id),
  UNIQUE (project_resource_id)
);

CREATE TABLE IF NOT EXISTS host_project_memberships (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_binding_id uuid NOT NULL REFERENCES host_project_bindings(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id),
  project_role text NOT NULL CHECK (
    project_role IN ('lead', 'contributor', 'viewer', 'service')
  ),
  membership_status text NOT NULL DEFAULT 'active' CHECK (
    membership_status IN ('active', 'removed')
  ),
  source_revision text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_binding_id, actor_id)
);

CREATE OR REPLACE FUNCTION actor_is_host_project_member(target_binding uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM host_project_bindings binding
    JOIN host_project_memberships membership
      ON membership.project_binding_id = binding.id
    WHERE binding.id = target_binding
      AND binding.workspace_id = app_workspace_id()
      AND binding.status = 'active'
      AND membership.workspace_id = binding.workspace_id
      AND membership.actor_id = app_actor_id()
      AND membership.membership_status = 'active'
      AND actor_can_access_memory_scope(binding.project_scope_id)
      AND actor_can_access_resource(binding.project_resource_id)
  )
$$;

CREATE TABLE IF NOT EXISTS memory_capture_runs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_binding_id uuid NOT NULL REFERENCES host_project_bindings(id),
  project_scope_id uuid NOT NULL REFERENCES memory_scopes(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  capture_mode text NOT NULL CHECK (capture_mode IN ('debrief', 'background')),
  initiated_by uuid NOT NULL REFERENCES users(id),
  source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_digest text NOT NULL CHECK (input_digest ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('running', 'completed', 'no-signal', 'failed')),
  model_route text NOT NULL DEFAULT 'no-model' CHECK (model_route = 'no-model'),
  rationale text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (project_binding_id, capture_mode, input_digest)
);

CREATE TABLE IF NOT EXISTS project_memory_schedules (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_binding_id uuid NOT NULL REFERENCES host_project_bindings(id) ON DELETE CASCADE,
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  interval_seconds integer NOT NULL CHECK (interval_seconds >= 900),
  enabled boolean NOT NULL DEFAULT true,
  next_due_at timestamptz NOT NULL,
  last_enqueued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_binding_id)
);

CREATE TABLE IF NOT EXISTS project_memory_jobs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_binding_id uuid NOT NULL REFERENCES host_project_bindings(id) ON DELETE CASCADE,
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  trigger_kind text NOT NULL CHECK (trigger_kind IN ('scheduled', 'manual', 'source-change')),
  trigger_ref text NOT NULL,
  requested_by uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'running', 'completed', 'no-signal', 'retrying', 'dead-letter')
  ),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  capture_run_id uuid REFERENCES memory_capture_runs(id),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, trigger_ref)
);

CREATE INDEX IF NOT EXISTS project_memory_jobs_lease_idx
  ON project_memory_jobs (status, available_at, created_at)
  WHERE status IN ('pending', 'retrying');

CREATE TABLE IF NOT EXISTS organisational_memory_reviews (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  memory_id uuid NOT NULL REFERENCES organisational_memories(resource_id) ON DELETE CASCADE,
  reviewer_actor_id uuid NOT NULL REFERENCES users(id),
  decision text NOT NULL CHECK (
    decision IN ('approved', 'rejected', 'correction-requested', 'corrected')
  ),
  review_note text NOT NULL,
  previous_statement text,
  replacement_memory_id uuid REFERENCES organisational_memories(resource_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (decision = 'corrected' AND replacement_memory_id IS NOT NULL AND previous_statement IS NOT NULL)
    OR (decision <> 'corrected' AND replacement_memory_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS kickoff_packs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_binding_id uuid NOT NULL REFERENCES host_project_bindings(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  generated_for_actor_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'superseded')),
  generation_reason text NOT NULL,
  memory_count integer NOT NULL CHECK (memory_count >= 0),
  policy_version text NOT NULL DEFAULT 'memory-isolation-v1',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kickoff_pack_items (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  kickoff_pack_id uuid NOT NULL REFERENCES kickoff_packs(id) ON DELETE CASCADE,
  memory_id uuid NOT NULL REFERENCES organisational_memories(resource_id),
  position integer NOT NULL CHECK (position > 0),
  relevance_score real NOT NULL CHECK (relevance_score BETWEEN 0 AND 1),
  rationale text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kickoff_pack_id, memory_id),
  UNIQUE (kickoff_pack_id, position)
);

CREATE OR REPLACE FUNCTION validate_host_project_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  project_workspace uuid;
  project_access_scope uuid;
  project_type text;
  client_workspace uuid;
  client_type text;
  scope_workspace uuid;
  scope_access_scope uuid;
  scope_kind text;
  scope_subject uuid;
  client_scope_subject uuid;
BEGIN
  SELECT workspace_id, access_scope_id, semantic_type
  INTO project_workspace, project_access_scope, project_type
  FROM resources WHERE id = NEW.project_resource_id;
  SELECT workspace_id, semantic_type
  INTO client_workspace, client_type
  FROM resources WHERE id = NEW.client_resource_id;
  SELECT scope.workspace_id, scope.access_scope_id, scope.scope_kind,
    scope.subject_resource_id, parent.subject_resource_id
  INTO scope_workspace, scope_access_scope, scope_kind, scope_subject,
    client_scope_subject
  FROM memory_scopes scope
  LEFT JOIN memory_scopes parent ON parent.id = scope.parent_scope_id
  WHERE scope.id = NEW.project_scope_id;

  IF project_workspace IS DISTINCT FROM NEW.workspace_id
    OR client_workspace IS DISTINCT FROM NEW.workspace_id
    OR scope_workspace IS DISTINCT FROM NEW.workspace_id
    OR project_access_scope IS DISTINCT FROM NEW.access_scope_id
    OR scope_access_scope IS DISTINCT FROM NEW.access_scope_id
    OR project_type <> 'Project'
    OR client_type <> 'Client'
    OR scope_kind <> 'project'
    OR scope_subject IS DISTINCT FROM NEW.project_resource_id
    OR client_scope_subject IS DISTINCT FROM NEW.client_resource_id
  THEN
    RAISE EXCEPTION 'Host project binding must match canonical project, client, scope and access boundary';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION validate_host_project_membership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  binding_workspace uuid;
  actor_workspace uuid;
BEGIN
  SELECT workspace_id INTO binding_workspace
  FROM host_project_bindings WHERE id = NEW.project_binding_id;
  SELECT workspace_id INTO actor_workspace
  FROM users WHERE id = NEW.actor_id;
  IF binding_workspace IS DISTINCT FROM NEW.workspace_id
    OR actor_workspace IS DISTINCT FROM NEW.workspace_id
  THEN
    RAISE EXCEPTION 'Host project membership must remain inside one workspace';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION validate_memory_capture_run()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  binding_workspace uuid;
  binding_scope uuid;
  binding_access_scope uuid;
  actor_workspace uuid;
BEGIN
  SELECT workspace_id, project_scope_id, access_scope_id
  INTO binding_workspace, binding_scope, binding_access_scope
  FROM host_project_bindings WHERE id = NEW.project_binding_id;
  SELECT workspace_id INTO actor_workspace
  FROM users WHERE id = NEW.initiated_by;
  IF binding_workspace IS DISTINCT FROM NEW.workspace_id
    OR actor_workspace IS DISTINCT FROM NEW.workspace_id
    OR binding_scope IS DISTINCT FROM NEW.project_scope_id
    OR binding_access_scope IS DISTINCT FROM NEW.access_scope_id
  THEN
    RAISE EXCEPTION 'Memory capture run must use its host project boundary';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION validate_organisational_memory_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  memory_workspace uuid;
  reviewer_workspace uuid;
  replacement_workspace uuid;
BEGIN
  SELECT workspace_id INTO memory_workspace
  FROM organisational_memories WHERE resource_id = NEW.memory_id;
  SELECT workspace_id INTO reviewer_workspace
  FROM users WHERE id = NEW.reviewer_actor_id;
  IF NEW.replacement_memory_id IS NOT NULL THEN
    SELECT workspace_id INTO replacement_workspace
    FROM organisational_memories WHERE resource_id = NEW.replacement_memory_id;
  END IF;
  IF memory_workspace IS DISTINCT FROM NEW.workspace_id
    OR reviewer_workspace IS DISTINCT FROM NEW.workspace_id
    OR (NEW.replacement_memory_id IS NOT NULL
      AND replacement_workspace IS DISTINCT FROM NEW.workspace_id)
  THEN
    RAISE EXCEPTION 'Memory review must remain inside one workspace';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION validate_project_memory_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  binding_workspace uuid;
  binding_access_scope uuid;
BEGIN
  SELECT workspace_id, access_scope_id
  INTO binding_workspace, binding_access_scope
  FROM host_project_bindings WHERE id = NEW.project_binding_id;
  IF binding_workspace IS DISTINCT FROM NEW.workspace_id
    OR binding_access_scope IS DISTINCT FROM NEW.access_scope_id
  THEN
    RAISE EXCEPTION 'Project memory schedule must use its host project boundary';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION validate_project_memory_job()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  binding_workspace uuid;
  binding_access_scope uuid;
  requester_workspace uuid;
BEGIN
  SELECT workspace_id, access_scope_id
  INTO binding_workspace, binding_access_scope
  FROM host_project_bindings WHERE id = NEW.project_binding_id;
  IF NEW.requested_by IS NOT NULL THEN
    SELECT workspace_id INTO requester_workspace
    FROM users WHERE id = NEW.requested_by;
  END IF;
  IF binding_workspace IS DISTINCT FROM NEW.workspace_id
    OR binding_access_scope IS DISTINCT FROM NEW.access_scope_id
    OR (NEW.requested_by IS NOT NULL
      AND requester_workspace IS DISTINCT FROM NEW.workspace_id)
  THEN
    RAISE EXCEPTION 'Project memory job must use its host project boundary';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION validate_kickoff_pack()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  binding_workspace uuid;
  binding_access_scope uuid;
  actor_workspace uuid;
BEGIN
  SELECT workspace_id, access_scope_id
  INTO binding_workspace, binding_access_scope
  FROM host_project_bindings WHERE id = NEW.project_binding_id;
  SELECT workspace_id INTO actor_workspace
  FROM users WHERE id = NEW.generated_for_actor_id;
  IF binding_workspace IS DISTINCT FROM NEW.workspace_id
    OR actor_workspace IS DISTINCT FROM NEW.workspace_id
    OR binding_access_scope IS DISTINCT FROM NEW.access_scope_id
  THEN
    RAISE EXCEPTION 'Kickoff pack must use its target project boundary';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION validate_kickoff_pack_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  pack_workspace uuid;
  memory_workspace uuid;
  lifecycle text;
  review_state text;
BEGIN
  SELECT workspace_id INTO pack_workspace
  FROM kickoff_packs WHERE id = NEW.kickoff_pack_id;
  SELECT workspace_id, lifecycle_status, review_status
  INTO memory_workspace, lifecycle, review_state
  FROM organisational_memories WHERE resource_id = NEW.memory_id;
  IF pack_workspace IS DISTINCT FROM NEW.workspace_id
    OR memory_workspace IS DISTINCT FROM NEW.workspace_id
    OR lifecycle <> 'active'
    OR review_state <> 'approved'
  THEN
    RAISE EXCEPTION 'Kickoff pack items must be active approved memories in the same workspace';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER host_project_bindings_validate
  BEFORE INSERT OR UPDATE ON host_project_bindings
  FOR EACH ROW EXECUTE FUNCTION validate_host_project_binding();
CREATE TRIGGER host_project_memberships_validate
  BEFORE INSERT OR UPDATE ON host_project_memberships
  FOR EACH ROW EXECUTE FUNCTION validate_host_project_membership();
CREATE TRIGGER memory_capture_runs_validate
  BEFORE INSERT OR UPDATE ON memory_capture_runs
  FOR EACH ROW EXECUTE FUNCTION validate_memory_capture_run();
CREATE TRIGGER project_memory_schedules_validate
  BEFORE INSERT OR UPDATE ON project_memory_schedules
  FOR EACH ROW EXECUTE FUNCTION validate_project_memory_schedule();
CREATE TRIGGER project_memory_jobs_validate
  BEFORE INSERT OR UPDATE ON project_memory_jobs
  FOR EACH ROW EXECUTE FUNCTION validate_project_memory_job();
CREATE TRIGGER organisational_memory_reviews_validate
  BEFORE INSERT OR UPDATE ON organisational_memory_reviews
  FOR EACH ROW EXECUTE FUNCTION validate_organisational_memory_review();
CREATE TRIGGER kickoff_packs_validate
  BEFORE INSERT OR UPDATE ON kickoff_packs
  FOR EACH ROW EXECUTE FUNCTION validate_kickoff_pack();
CREATE TRIGGER kickoff_pack_items_validate
  BEFORE INSERT OR UPDATE ON kickoff_pack_items
  FOR EACH ROW EXECUTE FUNCTION validate_kickoff_pack_item();

ALTER TABLE host_project_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE host_project_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_capture_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_memory_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_memory_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisational_memory_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE kickoff_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kickoff_pack_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY host_project_bindings_actor_select
  ON host_project_bindings FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_is_host_project_member(id));
CREATE POLICY host_project_memberships_actor_select
  ON host_project_memberships FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id()
    AND actor_is_host_project_member(project_binding_id));
CREATE POLICY memory_capture_runs_actor_select
  ON memory_capture_runs FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id()
    AND actor_is_host_project_member(project_binding_id));
CREATE POLICY project_memory_schedules_actor_select
  ON project_memory_schedules FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id()
    AND actor_is_host_project_member(project_binding_id));
CREATE POLICY project_memory_jobs_actor_select
  ON project_memory_jobs FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id()
    AND actor_is_host_project_member(project_binding_id));
CREATE POLICY organisational_memory_reviews_actor_select
  ON organisational_memory_reviews FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id()
    AND actor_can_access_organisational_memory(memory_id)
    AND (replacement_memory_id IS NULL
      OR actor_can_access_organisational_memory(replacement_memory_id)));
CREATE POLICY kickoff_packs_actor_select
  ON kickoff_packs FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id()
    AND actor_is_host_project_member(project_binding_id));
CREATE POLICY kickoff_pack_items_actor_select
  ON kickoff_pack_items FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id()
    AND actor_can_access_organisational_memory(memory_id)
    AND EXISTS (
      SELECT 1 FROM kickoff_packs pack
      WHERE pack.id = kickoff_pack_id
    ));

CREATE POLICY host_project_bindings_ingest_all
  ON host_project_bindings FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id()
    AND actor_can_access_memory_scope(project_scope_id))
  WITH CHECK (workspace_id = app_workspace_id()
    AND actor_can_access_memory_scope(project_scope_id));
CREATE POLICY host_project_memberships_ingest_all
  ON host_project_memberships FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND EXISTS (
    SELECT 1 FROM host_project_bindings binding
    WHERE binding.id = project_binding_id
      AND actor_can_access_memory_scope(binding.project_scope_id)
  ))
  WITH CHECK (workspace_id = app_workspace_id() AND EXISTS (
    SELECT 1 FROM host_project_bindings binding
    WHERE binding.id = project_binding_id
      AND actor_can_access_memory_scope(binding.project_scope_id)
  ));
CREATE POLICY memory_capture_runs_ingest_all
  ON memory_capture_runs FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id()
    AND actor_can_access_memory_scope(project_scope_id))
  WITH CHECK (workspace_id = app_workspace_id()
    AND actor_can_access_memory_scope(project_scope_id));
CREATE POLICY project_memory_schedules_ingest_all
  ON project_memory_schedules FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND EXISTS (
    SELECT 1 FROM host_project_bindings binding
    WHERE binding.id = project_binding_id
      AND actor_can_access_memory_scope(binding.project_scope_id)
  ))
  WITH CHECK (workspace_id = app_workspace_id() AND EXISTS (
    SELECT 1 FROM host_project_bindings binding
    WHERE binding.id = project_binding_id
      AND actor_can_access_memory_scope(binding.project_scope_id)
  ));
CREATE POLICY project_memory_jobs_ingest_all
  ON project_memory_jobs FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND EXISTS (
    SELECT 1 FROM host_project_bindings binding
    WHERE binding.id = project_binding_id
      AND actor_can_access_memory_scope(binding.project_scope_id)
  ))
  WITH CHECK (workspace_id = app_workspace_id() AND EXISTS (
    SELECT 1 FROM host_project_bindings binding
    WHERE binding.id = project_binding_id
      AND actor_can_access_memory_scope(binding.project_scope_id)
  ));
CREATE POLICY organisational_memory_reviews_ingest_all
  ON organisational_memory_reviews FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id()
    AND actor_can_access_organisational_memory(memory_id))
  WITH CHECK (workspace_id = app_workspace_id()
    AND actor_can_access_organisational_memory(memory_id)
    AND (replacement_memory_id IS NULL
      OR actor_can_access_organisational_memory(replacement_memory_id)));
CREATE POLICY kickoff_packs_ingest_all
  ON kickoff_packs FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND EXISTS (
    SELECT 1 FROM host_project_bindings binding
    WHERE binding.id = project_binding_id
      AND actor_can_access_memory_scope(binding.project_scope_id)
  ))
  WITH CHECK (workspace_id = app_workspace_id() AND EXISTS (
    SELECT 1 FROM host_project_bindings binding
    WHERE binding.id = project_binding_id
      AND actor_can_access_memory_scope(binding.project_scope_id)
  ));
CREATE POLICY kickoff_pack_items_ingest_all
  ON kickoff_pack_items FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id()
    AND actor_can_access_organisational_memory(memory_id))
  WITH CHECK (workspace_id = app_workspace_id()
    AND actor_can_access_organisational_memory(memory_id)
    AND EXISTS (SELECT 1 FROM kickoff_packs pack WHERE pack.id = kickoff_pack_id));

REVOKE ALL ON host_project_bindings, host_project_memberships,
  memory_capture_runs, project_memory_schedules, project_memory_jobs,
  organisational_memory_reviews, kickoff_packs, kickoff_pack_items FROM PUBLIC;
GRANT SELECT ON host_project_bindings, host_project_memberships,
  memory_capture_runs, project_memory_schedules, project_memory_jobs,
  organisational_memory_reviews, kickoff_packs, kickoff_pack_items TO org_brain_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON host_project_bindings,
  host_project_memberships, memory_capture_runs, project_memory_schedules,
  project_memory_jobs, organisational_memory_reviews, kickoff_packs,
  kickoff_pack_items TO org_brain_ingest;

REVOKE ALL ON FUNCTION actor_is_host_project_member(uuid),
  validate_host_project_binding(), validate_host_project_membership(),
  validate_memory_capture_run(), validate_project_memory_schedule(),
  validate_project_memory_job(),
  validate_organisational_memory_review(), validate_kickoff_pack(),
  validate_kickoff_pack_item() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION actor_is_host_project_member(uuid)
  TO org_brain_app, org_brain_ingest;

ALTER TABLE host_project_bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE host_project_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE memory_capture_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE project_memory_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE project_memory_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE organisational_memory_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE kickoff_packs FORCE ROW LEVEL SECURITY;
ALTER TABLE kickoff_pack_items FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE host_project_bindings IS
  'Contract binding a host-product project and membership revision to canonical project/client Resources and one project memory scope.';
COMMENT ON COLUMN host_project_bindings.client_memory_enabled IS
  'Hard-disabled in policy v1 until authoritative client relationship access is integrated.';
COMMENT ON TABLE memory_capture_runs IS
  'Auditable debrief and deterministic background formation runs; raw source text remains in canonical content Resources.';
COMMENT ON TABLE kickoff_packs IS
  'Actor-requested project-start context assembled only from active approved memories visible to that actor.';
