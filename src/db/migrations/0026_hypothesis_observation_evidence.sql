CREATE TABLE IF NOT EXISTS hypothesis_discovery_evidence_links (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  candidate_id uuid NOT NULL
    REFERENCES hypothesis_discovery_candidates(id) ON DELETE CASCADE,
  evidence_resource_id uuid NOT NULL REFERENCES resources(id),
  observation_resource_id uuid NOT NULL REFERENCES resources(id),
  assertion_id uuid NOT NULL REFERENCES assertions(id),
  evidence_role text NOT NULL CHECK (evidence_role IN ('supports', 'challenges')),
  rationale text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, observation_resource_id, assertion_id, evidence_role)
);

CREATE OR REPLACE FUNCTION validate_hypothesis_discovery_evidence_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  candidate_record hypothesis_discovery_candidates%ROWTYPE;
  observation_artifact uuid;
  observation_scope uuid;
  assertion_subject uuid;
  assertion_scope uuid;
BEGIN
  SELECT * INTO candidate_record
  FROM hypothesis_discovery_candidates WHERE id = NEW.candidate_id;

  SELECT artifact_resource_id, access_scope_id
  INTO observation_artifact, observation_scope
  FROM perception_observations
  WHERE observation_resource_id = NEW.observation_resource_id;

  SELECT subject_resource_id, access_scope_id
  INTO assertion_subject, assertion_scope
  FROM assertions WHERE id = NEW.assertion_id;

  IF candidate_record.id IS NULL
    OR observation_artifact IS NULL
    OR assertion_subject IS NULL
    OR NEW.workspace_id IS DISTINCT FROM candidate_record.workspace_id
    OR NEW.access_scope_id IS DISTINCT FROM candidate_record.access_scope_id
    OR observation_scope IS DISTINCT FROM NEW.access_scope_id
    OR assertion_scope IS DISTINCT FROM NEW.access_scope_id
    OR observation_artifact IS DISTINCT FROM NEW.evidence_resource_id
    OR assertion_subject IS DISTINCT FROM NEW.observation_resource_id
    OR NOT (candidate_record.evidence_resource_ids ? NEW.evidence_resource_id::text)
  THEN
    RAISE EXCEPTION 'Hypothesis observation evidence must preserve the candidate, artifact, observation and assertion boundary';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS hypothesis_discovery_evidence_links_validate
  ON hypothesis_discovery_evidence_links;
CREATE TRIGGER hypothesis_discovery_evidence_links_validate
  BEFORE INSERT OR UPDATE ON hypothesis_discovery_evidence_links
  FOR EACH ROW EXECUTE FUNCTION validate_hypothesis_discovery_evidence_link();

INSERT INTO hypothesis_discovery_evidence_links
  (id, workspace_id, access_scope_id, candidate_id, evidence_resource_id,
   observation_resource_id, assertion_id, evidence_role, rationale)
SELECT gen_random_uuid(), candidate.workspace_id, candidate.access_scope_id,
  candidate.id, observation.artifact_resource_id,
  observation.observation_resource_id, semantic_assertion.id, 'supports',
  'The observation was extracted from an artifact selected by the discovery policy and established an actor-visible semantic assertion.'
FROM hypothesis_discovery_candidates candidate
CROSS JOIN LATERAL
  jsonb_array_elements_text(candidate.evidence_resource_ids) evidence_id
JOIN perception_observations observation
  ON observation.artifact_resource_id = evidence_id::uuid
JOIN LATERAL (
  SELECT assertion_row.id
  FROM assertions assertion_row
  WHERE assertion_row.subject_resource_id = observation.observation_resource_id
    AND assertion_row.access_scope_id = candidate.access_scope_id
    AND assertion_row.predicate <> 'DERIVED_FROM'
    AND assertion_row.valid_to IS NULL
  ORDER BY assertion_row.confidence DESC, assertion_row.id
  LIMIT 1
) semantic_assertion ON true
ON CONFLICT (candidate_id, observation_resource_id, assertion_id, evidence_role)
  DO NOTHING;

ALTER TABLE hypothesis_discovery_evidence_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY hypothesis_discovery_evidence_links_actor_select
  ON hypothesis_discovery_evidence_links FOR SELECT TO org_brain_app
  USING (
    workspace_id = app_workspace_id()
    AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(evidence_resource_id)
    AND actor_can_access_resource(observation_resource_id)
  );

CREATE POLICY hypothesis_discovery_evidence_links_ingest_all
  ON hypothesis_discovery_evidence_links FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));

REVOKE ALL ON hypothesis_discovery_evidence_links FROM PUBLIC;
GRANT SELECT ON hypothesis_discovery_evidence_links TO org_brain_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON hypothesis_discovery_evidence_links
  TO org_brain_ingest;

ALTER TABLE hypothesis_discovery_evidence_links FORCE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION validate_hypothesis_discovery_evidence_link() FROM PUBLIC;

COMMENT ON TABLE hypothesis_discovery_evidence_links IS
  'Attributable observation and assertion links beneath a discovery candidate evidence Resource; never widens the candidate access boundary.';
