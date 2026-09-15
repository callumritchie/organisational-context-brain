CREATE TABLE IF NOT EXISTS memory_scopes (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  scope_kind text NOT NULL CHECK (
    scope_kind IN ('person', 'project', 'client', 'domain', 'organisation')
  ),
  name text NOT NULL,
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  subject_resource_id uuid REFERENCES resources(id),
  owner_actor_id uuid REFERENCES users(id),
  parent_scope_id uuid REFERENCES memory_scopes(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_scope_id IS NULL OR parent_scope_id <> id),
  CHECK (
    (scope_kind = 'person' AND owner_actor_id IS NOT NULL AND subject_resource_id IS NULL)
    OR (scope_kind = 'organisation' AND owner_actor_id IS NULL AND subject_resource_id IS NULL)
    OR (scope_kind IN ('project', 'client', 'domain') AND owner_actor_id IS NULL AND subject_resource_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS memory_scopes_one_person_owner
  ON memory_scopes (workspace_id, owner_actor_id) WHERE scope_kind = 'person';
CREATE UNIQUE INDEX IF NOT EXISTS memory_scopes_one_organisation
  ON memory_scopes (workspace_id) WHERE scope_kind = 'organisation';
CREATE UNIQUE INDEX IF NOT EXISTS memory_scopes_subject_kind
  ON memory_scopes (workspace_id, scope_kind, subject_resource_id)
  WHERE subject_resource_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_memory_scope() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  subject_workspace uuid;
  subject_access_scope uuid;
  parent_workspace uuid;
  parent_kind text;
  unsafe_person_grants integer;
  owner_grants integer;
BEGIN
  IF NEW.subject_resource_id IS NOT NULL THEN
    SELECT workspace_id, access_scope_id
    INTO subject_workspace, subject_access_scope
    FROM resources WHERE id = NEW.subject_resource_id;
    IF subject_workspace IS DISTINCT FROM NEW.workspace_id
      OR subject_access_scope IS DISTINCT FROM NEW.access_scope_id
    THEN
      RAISE EXCEPTION 'Memory scope must use its subject resource workspace and access scope';
    END IF;
  END IF;

  IF NEW.scope_kind = 'project' THEN
    IF NEW.parent_scope_id IS NULL THEN
      RAISE EXCEPTION 'A project memory scope requires a client parent';
    END IF;
    SELECT workspace_id, scope_kind INTO parent_workspace, parent_kind
    FROM memory_scopes WHERE id = NEW.parent_scope_id;
    IF parent_workspace IS DISTINCT FROM NEW.workspace_id OR parent_kind <> 'client' THEN
      RAISE EXCEPTION 'A project memory scope parent must be a client in the same workspace';
    END IF;
  ELSIF NEW.parent_scope_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only project memory scopes may have a parent in policy v1';
  END IF;

  IF NEW.scope_kind = 'person' THEN
    SELECT
      count(*) FILTER (WHERE NOT (
        principal_type = 'user'
        AND principal_id = NEW.owner_actor_id
        AND permission IN ('read', 'manage')
      )),
      count(*) FILTER (WHERE
        principal_type = 'user'
        AND principal_id = NEW.owner_actor_id
        AND permission IN ('read', 'manage')
      )
    INTO unsafe_person_grants, owner_grants
    FROM access_scope_grants WHERE access_scope_id = NEW.access_scope_id;
    IF unsafe_person_grants <> 0 OR owner_grants < 1 THEN
      RAISE EXCEPTION 'A person memory scope must be backed only by an owner grant';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS memory_scopes_validate ON memory_scopes;
CREATE TRIGGER memory_scopes_validate
  BEFORE INSERT OR UPDATE ON memory_scopes
  FOR EACH ROW EXECUTE FUNCTION validate_memory_scope();

CREATE OR REPLACE FUNCTION actor_can_access_memory_scope(target_scope uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM memory_scopes scope
    WHERE scope.id = target_scope
      AND scope.workspace_id = app_workspace_id()
      AND scope.status = 'active'
      AND actor_can_access_scope(scope.access_scope_id)
      AND (scope.scope_kind <> 'person' OR scope.owner_actor_id = app_actor_id())
  )
$$;

CREATE TABLE IF NOT EXISTS organisational_memories (
  resource_id uuid PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  origin_scope_id uuid NOT NULL REFERENCES memory_scopes(id),
  visibility_scope_id uuid NOT NULL REFERENCES memory_scopes(id),
  memory_type text NOT NULL CHECK (memory_type IN (
    'decision', 'approach-pattern', 'risk-response', 'constraint-adaptation',
    'anti-pattern', 'stakeholder-pattern', 'person-preference'
  )),
  statement text NOT NULL CHECK (length(statement) BETWEEN 3 AND 4000),
  statement_hash text NOT NULL CHECK (statement_hash ~ '^[a-f0-9]{64}$'),
  context_document jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  transfer_class text NOT NULL CHECK (transfer_class IN (
    'client-confidential', 'client-reusable', 'abstractable', 'firm-reusable'
  )),
  sensitivity text NOT NULL CHECK (
    sensitivity IN ('client-confidential', 'internal', 'restricted')
  ),
  lifecycle_status text NOT NULL DEFAULT 'candidate' CHECK (
    lifecycle_status IN ('candidate', 'active', 'superseded', 'retired', 'rejected')
  ),
  review_status text NOT NULL DEFAULT 'proposed' CHECK (
    review_status IN ('proposed', 'approved', 'rejected', 'correction-required')
  ),
  outcome_status text NOT NULL DEFAULT 'untested' CHECK (
    outcome_status IN ('untested', 'supported', 'validated', 'mixed', 'invalidated')
  ),
  confidence real NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  quality_score real NOT NULL DEFAULT 0 CHECK (quality_score BETWEEN 0 AND 1),
  abstraction_reviewed boolean NOT NULL DEFAULT false,
  valid_from timestamptz NOT NULL DEFAULT now(),
  stale_after_seconds integer NOT NULL DEFAULT 15552000 CHECK (stale_after_seconds > 0),
  last_outcome_at timestamptz,
  process_name text NOT NULL,
  process_version text NOT NULL,
  policy_version text NOT NULL DEFAULT 'memory-isolation-v1',
  created_by uuid NOT NULL REFERENCES users(id),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  superseded_by_memory_id uuid REFERENCES organisational_memories(resource_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (lifecycle_status <> 'active' OR review_status = 'approved'),
  CHECK (
    (review_status = 'proposed' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (review_status <> 'proposed' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  UNIQUE (visibility_scope_id, statement_hash)
);

CREATE INDEX IF NOT EXISTS organisational_memories_retrieval_idx
  ON organisational_memories (
    workspace_id, visibility_scope_id, lifecycle_status, outcome_status,
    quality_score DESC, confidence DESC, valid_from DESC
  );

CREATE OR REPLACE FUNCTION validate_organisational_memory_scope_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  origin_workspace uuid;
  origin_kind text;
  visibility_workspace uuid;
  visibility_kind text;
  resource_workspace uuid;
  resource_access_scope uuid;
  visibility_access_scope uuid;
BEGIN
  SELECT workspace_id, scope_kind
  INTO origin_workspace, origin_kind
  FROM memory_scopes WHERE id = NEW.origin_scope_id;
  SELECT workspace_id, scope_kind, access_scope_id
  INTO visibility_workspace, visibility_kind, visibility_access_scope
  FROM memory_scopes WHERE id = NEW.visibility_scope_id;
  SELECT workspace_id, access_scope_id
  INTO resource_workspace, resource_access_scope
  FROM resources WHERE id = NEW.resource_id;

  IF origin_workspace IS DISTINCT FROM NEW.workspace_id
    OR visibility_workspace IS DISTINCT FROM NEW.workspace_id
    OR resource_workspace IS DISTINCT FROM NEW.workspace_id
    OR resource_access_scope IS DISTINCT FROM visibility_access_scope
  THEN
    RAISE EXCEPTION 'Memory workspace, visibility and Resource access boundaries must agree';
  END IF;

  IF NEW.memory_type = 'person-preference' AND origin_kind <> 'person' THEN
    RAISE EXCEPTION 'Person preferences require a person origin scope';
  ELSIF origin_kind = 'person' AND NEW.memory_type <> 'person-preference' THEN
    RAISE EXCEPTION 'Person scopes may contain only person preferences';
  END IF;

  IF NEW.origin_scope_id = NEW.visibility_scope_id THEN
    RETURN NEW;
  END IF;
  IF origin_kind = 'person' OR visibility_kind = 'person' THEN
    RAISE EXCEPTION 'Policy v1 never promotes into or out of person memory';
  END IF;
  IF visibility_kind = 'client' THEN
    RAISE EXCEPTION 'Client-layer promotion is disabled in policy v1';
  END IF;
  IF visibility_kind = 'project' THEN
    RAISE EXCEPTION 'Direct project-to-project memory copying is forbidden';
  END IF;
  IF origin_kind = 'organisation' OR (origin_kind = 'domain' AND visibility_kind <> 'organisation') THEN
    RAISE EXCEPTION 'The requested memory scope transition is not permitted';
  END IF;
  IF visibility_kind NOT IN ('domain', 'organisation')
    OR NEW.transfer_class NOT IN ('abstractable', 'firm-reusable')
    OR NEW.sensitivity = 'client-confidential'
    OR NEW.review_status <> 'approved'
    OR NOT NEW.abstraction_reviewed
  THEN
    RAISE EXCEPTION 'Cross-boundary memory requires an approved non-confidential abstraction';
  END IF;
  IF origin_kind = 'domain' AND NEW.transfer_class <> 'firm-reusable' THEN
    RAISE EXCEPTION 'Domain-to-organisation memory must be firm-reusable';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS organisational_memories_validate ON organisational_memories;
CREATE TRIGGER organisational_memories_validate
  BEFORE INSERT OR UPDATE ON organisational_memories
  FOR EACH ROW EXECUTE FUNCTION validate_organisational_memory_scope_transition();

CREATE OR REPLACE FUNCTION actor_can_access_organisational_memory(target_memory uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organisational_memories memory
    WHERE memory.resource_id = target_memory
      AND memory.workspace_id = app_workspace_id()
      AND actor_can_access_memory_scope(memory.visibility_scope_id)
      AND actor_can_access_resource(memory.resource_id)
  )
$$;

CREATE TABLE IF NOT EXISTS organisational_memory_evidence (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  memory_id uuid NOT NULL REFERENCES organisational_memories(resource_id) ON DELETE CASCADE,
  evidence_resource_id uuid NOT NULL REFERENCES resources(id),
  evidence_assertion_id uuid REFERENCES assertions(id),
  evidence_scope_id uuid NOT NULL REFERENCES memory_scopes(id),
  stance text NOT NULL CHECK (stance IN ('supports', 'challenges', 'context')),
  contribution text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (memory_id, evidence_resource_id, evidence_assertion_id, stance)
);

CREATE TABLE IF NOT EXISTS organisational_memory_relations (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  from_memory_id uuid NOT NULL REFERENCES organisational_memories(resource_id) ON DELETE CASCADE,
  to_memory_id uuid NOT NULL REFERENCES organisational_memories(resource_id) ON DELETE CASCADE,
  relation_type text NOT NULL CHECK (
    relation_type IN ('corroborates', 'contradicts', 'qualifies', 'supersedes')
  ),
  rationale text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_memory_id <> to_memory_id),
  UNIQUE (from_memory_id, to_memory_id, relation_type)
);

CREATE TABLE IF NOT EXISTS organisational_memory_promotions (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  source_memory_id uuid NOT NULL REFERENCES organisational_memories(resource_id),
  promoted_memory_id uuid NOT NULL REFERENCES organisational_memories(resource_id),
  from_scope_id uuid NOT NULL REFERENCES memory_scopes(id),
  to_scope_id uuid NOT NULL REFERENCES memory_scopes(id),
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  abstraction_summary text NOT NULL,
  raw_evidence_attached boolean NOT NULL DEFAULT false CHECK (NOT raw_evidence_attached),
  policy_version text NOT NULL DEFAULT 'memory-isolation-v1',
  reviewed_by uuid NOT NULL REFERENCES users(id),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_memory_id <> promoted_memory_id),
  CHECK (from_scope_id <> to_scope_id),
  UNIQUE (source_memory_id, promoted_memory_id)
);

ALTER TABLE memory_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisational_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisational_memory_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisational_memory_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisational_memory_promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memory_scopes_actor_select ON memory_scopes;
CREATE POLICY memory_scopes_actor_select ON memory_scopes FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_memory_scope(id));

DROP POLICY IF EXISTS organisational_memories_actor_select ON organisational_memories;
CREATE POLICY organisational_memories_actor_select ON organisational_memories FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_organisational_memory(resource_id));

DROP POLICY IF EXISTS organisational_memory_evidence_actor_select ON organisational_memory_evidence;
CREATE POLICY organisational_memory_evidence_actor_select ON organisational_memory_evidence FOR SELECT TO org_brain_app
  USING (
    workspace_id = app_workspace_id()
    AND actor_can_access_organisational_memory(memory_id)
    AND actor_can_access_memory_scope(evidence_scope_id)
    AND actor_can_access_resource(evidence_resource_id)
    AND (evidence_assertion_id IS NULL OR EXISTS (
      SELECT 1 FROM assertions assertion_row WHERE assertion_row.id = evidence_assertion_id
    ))
  );

DROP POLICY IF EXISTS organisational_memory_relations_actor_select ON organisational_memory_relations;
CREATE POLICY organisational_memory_relations_actor_select ON organisational_memory_relations FOR SELECT TO org_brain_app
  USING (
    workspace_id = app_workspace_id()
    AND actor_can_access_organisational_memory(from_memory_id)
    AND actor_can_access_organisational_memory(to_memory_id)
  );

DROP POLICY IF EXISTS organisational_memory_promotions_actor_select ON organisational_memory_promotions;
CREATE POLICY organisational_memory_promotions_actor_select ON organisational_memory_promotions FOR SELECT TO org_brain_app
  USING (
    workspace_id = app_workspace_id()
    AND actor_can_access_organisational_memory(source_memory_id)
    AND actor_can_access_organisational_memory(promoted_memory_id)
  );

DROP POLICY IF EXISTS memory_scopes_ingest_all ON memory_scopes;
CREATE POLICY memory_scopes_ingest_all ON memory_scopes FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_memory_scope(id))
  WITH CHECK (
    workspace_id = app_workspace_id()
    AND actor_can_access_scope(access_scope_id)
    AND (scope_kind <> 'person' OR owner_actor_id = app_actor_id())
  );

DROP POLICY IF EXISTS organisational_memories_ingest_all ON organisational_memories;
CREATE POLICY organisational_memories_ingest_all ON organisational_memories FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_organisational_memory(resource_id))
  WITH CHECK (
    workspace_id = app_workspace_id()
    AND actor_can_access_memory_scope(origin_scope_id)
    AND actor_can_access_memory_scope(visibility_scope_id)
  );

DROP POLICY IF EXISTS organisational_memory_evidence_ingest_all ON organisational_memory_evidence;
CREATE POLICY organisational_memory_evidence_ingest_all ON organisational_memory_evidence FOR ALL TO org_brain_ingest
  USING (
    workspace_id = app_workspace_id()
    AND actor_can_access_organisational_memory(memory_id)
    AND actor_can_access_resource(evidence_resource_id)
  )
  WITH CHECK (
    workspace_id = app_workspace_id()
    AND actor_can_access_organisational_memory(memory_id)
    AND actor_can_access_memory_scope(evidence_scope_id)
    AND actor_can_access_resource(evidence_resource_id)
  );

DROP POLICY IF EXISTS organisational_memory_relations_ingest_all ON organisational_memory_relations;
CREATE POLICY organisational_memory_relations_ingest_all ON organisational_memory_relations FOR ALL TO org_brain_ingest
  USING (
    workspace_id = app_workspace_id()
    AND actor_can_access_organisational_memory(from_memory_id)
    AND actor_can_access_organisational_memory(to_memory_id)
  )
  WITH CHECK (
    workspace_id = app_workspace_id()
    AND actor_can_access_organisational_memory(from_memory_id)
    AND actor_can_access_organisational_memory(to_memory_id)
  );

DROP POLICY IF EXISTS organisational_memory_promotions_ingest_all ON organisational_memory_promotions;
CREATE POLICY organisational_memory_promotions_ingest_all ON organisational_memory_promotions FOR ALL TO org_brain_ingest
  USING (
    workspace_id = app_workspace_id()
    AND actor_can_access_organisational_memory(source_memory_id)
    AND actor_can_access_organisational_memory(promoted_memory_id)
  )
  WITH CHECK (
    workspace_id = app_workspace_id()
    AND actor_can_access_organisational_memory(source_memory_id)
    AND actor_can_access_organisational_memory(promoted_memory_id)
    AND NOT raw_evidence_attached
  );

REVOKE ALL ON memory_scopes, organisational_memories,
  organisational_memory_evidence, organisational_memory_relations,
  organisational_memory_promotions FROM PUBLIC;
GRANT SELECT ON memory_scopes, organisational_memories,
  organisational_memory_evidence, organisational_memory_relations,
  organisational_memory_promotions TO org_brain_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON memory_scopes, organisational_memories,
  organisational_memory_evidence, organisational_memory_relations,
  organisational_memory_promotions TO org_brain_ingest;

REVOKE ALL ON FUNCTION actor_can_access_memory_scope(uuid),
  actor_can_access_organisational_memory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION actor_can_access_memory_scope(uuid),
  actor_can_access_organisational_memory(uuid) TO org_brain_app, org_brain_ingest;

ALTER TABLE memory_scopes FORCE ROW LEVEL SECURITY;
ALTER TABLE organisational_memories FORCE ROW LEVEL SECURITY;
ALTER TABLE organisational_memory_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE organisational_memory_relations FORCE ROW LEVEL SECURITY;
ALTER TABLE organisational_memory_promotions FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE memory_scopes IS
  'Logical person, project, client, domain and organisation memory boundaries mapped to enforceable access scopes.';
COMMENT ON TABLE organisational_memories IS
  'Typed durable knowledge with explicit origin, visibility, transfer, review, outcome, freshness and policy context.';
COMMENT ON TABLE organisational_memory_promotions IS
  'Restricted lineage between a source memory and a separately reviewed abstraction; raw evidence never propagates.';
