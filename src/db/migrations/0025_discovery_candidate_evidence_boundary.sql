CREATE OR REPLACE FUNCTION validate_discovery_candidate_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  invalid_evidence integer;
BEGIN
  IF jsonb_typeof(NEW.evidence_resource_ids) <> 'array'
    OR jsonb_array_length(NEW.evidence_resource_ids) = 0
  THEN
    RAISE EXCEPTION 'A discovery candidate requires an evidence Resource array';
  END IF;
  SELECT count(*) INTO invalid_evidence
  FROM jsonb_array_elements_text(NEW.evidence_resource_ids) evidence_id
  LEFT JOIN resources resource ON resource.id = evidence_id::uuid
  WHERE resource.id IS NULL
    OR resource.workspace_id IS DISTINCT FROM NEW.workspace_id
    OR resource.access_scope_id IS DISTINCT FROM NEW.access_scope_id;
  IF invalid_evidence > 0 THEN
    RAISE EXCEPTION 'Discovery candidate evidence must share the candidate workspace and exact access boundary';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION validate_discovery_candidate_observation_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  candidate_workspace uuid;
  candidate_access_scope uuid;
  invalid_evidence integer;
BEGIN
  SELECT workspace_id, access_scope_id
  INTO candidate_workspace, candidate_access_scope
  FROM hypothesis_discovery_candidates WHERE id = NEW.candidate_id;
  IF candidate_workspace IS DISTINCT FROM NEW.workspace_id
    OR candidate_access_scope IS DISTINCT FROM NEW.access_scope_id
  THEN
    RAISE EXCEPTION 'Discovery candidate observation must match its candidate boundary';
  END IF;
  SELECT count(*) INTO invalid_evidence
  FROM jsonb_array_elements_text(NEW.evidence_resource_ids) evidence_id
  LEFT JOIN resources resource ON resource.id = evidence_id::uuid
  WHERE resource.id IS NULL
    OR resource.workspace_id IS DISTINCT FROM NEW.workspace_id
    OR resource.access_scope_id IS DISTINCT FROM NEW.access_scope_id;
  IF invalid_evidence > 0 THEN
    RAISE EXCEPTION 'Discovery observation evidence must share its exact access boundary';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS hypothesis_discovery_candidates_validate_evidence
  ON hypothesis_discovery_candidates;
CREATE TRIGGER hypothesis_discovery_candidates_validate_evidence
  BEFORE INSERT OR UPDATE ON hypothesis_discovery_candidates
  FOR EACH ROW EXECUTE FUNCTION validate_discovery_candidate_evidence();

DROP TRIGGER IF EXISTS hypothesis_discovery_candidate_observations_validate_evidence
  ON hypothesis_discovery_candidate_observations;
CREATE TRIGGER hypothesis_discovery_candidate_observations_validate_evidence
  BEFORE INSERT OR UPDATE ON hypothesis_discovery_candidate_observations
  FOR EACH ROW EXECUTE FUNCTION validate_discovery_candidate_observation_evidence();

DROP POLICY IF EXISTS hypothesis_discovery_candidates_actor_select
  ON hypothesis_discovery_candidates;
CREATE POLICY hypothesis_discovery_candidates_actor_select
  ON hypothesis_discovery_candidates FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id()
    AND actor_can_access_scope(access_scope_id)
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(evidence_resource_ids) evidence_id
      WHERE NOT actor_can_access_resource(evidence_id::uuid)
    ));

DROP POLICY IF EXISTS hypothesis_discovery_candidate_observations_actor_select
  ON hypothesis_discovery_candidate_observations;
CREATE POLICY hypothesis_discovery_candidate_observations_actor_select
  ON hypothesis_discovery_candidate_observations FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id()
    AND actor_can_access_scope(access_scope_id)
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(evidence_resource_ids) evidence_id
      WHERE NOT actor_can_access_resource(evidence_id::uuid)
    ));

REVOKE ALL ON FUNCTION validate_discovery_candidate_evidence(),
  validate_discovery_candidate_observation_evidence() FROM PUBLIC;

COMMENT ON FUNCTION validate_discovery_candidate_evidence() IS
  'Prevents a visible hypothesis candidate from carrying IDs or source locators derived from a more restricted evidence boundary.';
