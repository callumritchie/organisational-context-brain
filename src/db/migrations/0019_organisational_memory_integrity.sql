CREATE OR REPLACE FUNCTION validate_person_memory_scope_grant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  person_owner uuid;
BEGIN
  SELECT owner_actor_id
  INTO person_owner
  FROM memory_scopes
  WHERE access_scope_id = NEW.access_scope_id
    AND scope_kind = 'person';

  IF FOUND AND NOT (
    NEW.principal_type = 'user'
    AND NEW.principal_id = person_owner
    AND NEW.permission IN ('read', 'manage')
  ) THEN
    RAISE EXCEPTION 'A person memory access scope may be granted only to its owner';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS access_scope_grants_validate_person_memory
  ON access_scope_grants;
CREATE TRIGGER access_scope_grants_validate_person_memory
  BEFORE INSERT OR UPDATE ON access_scope_grants
  FOR EACH ROW EXECUTE FUNCTION validate_person_memory_scope_grant();

CREATE OR REPLACE FUNCTION validate_organisational_memory_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  memory_workspace uuid;
  evidence_workspace uuid;
  evidence_access_scope uuid;
  declared_scope_workspace uuid;
  declared_access_scope uuid;
  assertion_workspace uuid;
  assertion_subject uuid;
BEGIN
  SELECT workspace_id INTO memory_workspace
  FROM organisational_memories WHERE resource_id = NEW.memory_id;
  SELECT workspace_id, access_scope_id
  INTO evidence_workspace, evidence_access_scope
  FROM resources WHERE id = NEW.evidence_resource_id;
  SELECT workspace_id, access_scope_id
  INTO declared_scope_workspace, declared_access_scope
  FROM memory_scopes WHERE id = NEW.evidence_scope_id;

  IF memory_workspace IS DISTINCT FROM NEW.workspace_id
    OR evidence_workspace IS DISTINCT FROM NEW.workspace_id
    OR declared_scope_workspace IS DISTINCT FROM NEW.workspace_id
    OR evidence_access_scope IS DISTINCT FROM declared_access_scope
  THEN
    RAISE EXCEPTION 'Memory evidence workspace, Resource and declared scope must agree';
  END IF;

  IF NEW.evidence_assertion_id IS NOT NULL THEN
    SELECT workspace_id, subject_resource_id
    INTO assertion_workspace, assertion_subject
    FROM assertions WHERE id = NEW.evidence_assertion_id;
    IF assertion_workspace IS DISTINCT FROM NEW.workspace_id
      OR assertion_subject IS DISTINCT FROM NEW.evidence_resource_id
    THEN
      RAISE EXCEPTION 'Memory evidence assertion must describe the declared evidence Resource';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS organisational_memory_evidence_validate
  ON organisational_memory_evidence;
CREATE TRIGGER organisational_memory_evidence_validate
  BEFORE INSERT OR UPDATE ON organisational_memory_evidence
  FOR EACH ROW EXECUTE FUNCTION validate_organisational_memory_evidence();

CREATE OR REPLACE FUNCTION validate_organisational_memory_relation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  from_workspace uuid;
  to_workspace uuid;
BEGIN
  SELECT workspace_id INTO from_workspace
  FROM organisational_memories WHERE resource_id = NEW.from_memory_id;
  SELECT workspace_id INTO to_workspace
  FROM organisational_memories WHERE resource_id = NEW.to_memory_id;
  IF from_workspace IS DISTINCT FROM NEW.workspace_id
    OR to_workspace IS DISTINCT FROM NEW.workspace_id
  THEN
    RAISE EXCEPTION 'Related memories must belong to the declared workspace';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS organisational_memory_relations_validate
  ON organisational_memory_relations;
CREATE TRIGGER organisational_memory_relations_validate
  BEFORE INSERT OR UPDATE ON organisational_memory_relations
  FOR EACH ROW EXECUTE FUNCTION validate_organisational_memory_relation();

CREATE OR REPLACE FUNCTION validate_organisational_memory_promotion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  source_workspace uuid;
  source_visibility_scope uuid;
  promoted_workspace uuid;
  promoted_origin_scope uuid;
  promoted_visibility_scope uuid;
  promoted_review_status text;
  promoted_abstraction_reviewed boolean;
BEGIN
  SELECT workspace_id, visibility_scope_id
  INTO source_workspace, source_visibility_scope
  FROM organisational_memories WHERE resource_id = NEW.source_memory_id;
  SELECT workspace_id, origin_scope_id, visibility_scope_id,
    review_status, abstraction_reviewed
  INTO promoted_workspace, promoted_origin_scope, promoted_visibility_scope,
    promoted_review_status, promoted_abstraction_reviewed
  FROM organisational_memories WHERE resource_id = NEW.promoted_memory_id;

  IF source_workspace IS DISTINCT FROM NEW.workspace_id
    OR promoted_workspace IS DISTINCT FROM NEW.workspace_id
    OR source_visibility_scope IS DISTINCT FROM NEW.from_scope_id
    OR promoted_origin_scope IS DISTINCT FROM NEW.from_scope_id
    OR promoted_visibility_scope IS DISTINCT FROM NEW.to_scope_id
  THEN
    RAISE EXCEPTION 'Promotion lineage must match source origin and promoted visibility scopes';
  END IF;
  IF NEW.decision = 'approved' AND (
    promoted_review_status <> 'approved'
    OR NOT promoted_abstraction_reviewed
  ) THEN
    RAISE EXCEPTION 'An approved promotion requires an approved reviewed abstraction';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS organisational_memory_promotions_validate
  ON organisational_memory_promotions;
CREATE TRIGGER organisational_memory_promotions_validate
  BEFORE INSERT OR UPDATE ON organisational_memory_promotions
  FOR EACH ROW EXECUTE FUNCTION validate_organisational_memory_promotion();

REVOKE ALL ON FUNCTION validate_person_memory_scope_grant(),
  validate_organisational_memory_evidence(),
  validate_organisational_memory_relation(),
  validate_organisational_memory_promotion() FROM PUBLIC;

COMMENT ON FUNCTION validate_person_memory_scope_grant() IS
  'Prevents later ACL changes from broadening an owner-only person memory scope.';
COMMENT ON FUNCTION validate_organisational_memory_promotion() IS
  'Makes promotion lineage describe a new reviewed abstraction rather than an access-scope mutation.';
