CREATE TABLE IF NOT EXISTS context_assets (
  resource_id uuid PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  stable_key text NOT NULL CHECK (stable_key ~ '^[a-z][a-z0-9.-]{2,127}$'),
  semantic_uri text NOT NULL CHECK (length(semantic_uri) BETWEEN 3 AND 500),
  asset_kind text NOT NULL CHECK (asset_kind IN (
    'term', 'taxonomy-concept', 'ontology-component', 'metric', 'policy',
    'norm', 'skill', 'memory'
  )),
  scope_kind text NOT NULL CHECK (scope_kind IN (
    'person', 'project', 'client', 'domain', 'organisation'
  )),
  scope_subject_resource_id uuid REFERENCES resources(id),
  owner_actor_id uuid REFERENCES users(id),
  lifecycle_status text NOT NULL CHECK (lifecycle_status IN (
    'draft', 'candidate', 'certified', 'superseded', 'retired'
  )),
  authority_class text NOT NULL CHECK (authority_class IN (
    'authoritative', 'governed', 'expert', 'observed', 'inferred'
  )),
  definition text NOT NULL CHECK (length(definition) BETWEEN 20 AND 4000),
  confidence real NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  version_number integer NOT NULL CHECK (version_number > 0),
  specification jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  last_verified_at timestamptz,
  next_review_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  CHECK (
    (scope_kind IN ('project', 'client', 'domain') AND scope_subject_resource_id IS NOT NULL)
    OR (scope_kind IN ('person', 'organisation') AND scope_subject_resource_id IS NULL)
  ),
  UNIQUE (workspace_id, stable_key, version_number),
  UNIQUE (workspace_id, semantic_uri, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS context_assets_one_current_version
  ON context_assets (workspace_id, stable_key)
  WHERE lifecycle_status IN ('candidate', 'certified');

CREATE TABLE IF NOT EXISTS context_asset_sources (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  asset_resource_id uuid NOT NULL REFERENCES context_assets(resource_id) ON DELETE CASCADE,
  source_resource_id uuid NOT NULL REFERENCES resources(id),
  contribution text NOT NULL CHECK (length(contribution) BETWEEN 10 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_resource_id, source_resource_id)
);

CREATE TABLE IF NOT EXISTS context_asset_dependencies (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  from_resource_id uuid NOT NULL REFERENCES context_assets(resource_id) ON DELETE CASCADE,
  to_resource_id uuid NOT NULL REFERENCES context_assets(resource_id) ON DELETE CASCADE,
  dependency_type text NOT NULL CHECK (dependency_type IN (
    'depends-on', 'defines', 'governs', 'measures', 'executes', 'uses-evidence'
  )),
  rationale text NOT NULL CHECK (length(rationale) BETWEEN 10 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_resource_id <> to_resource_id),
  UNIQUE (from_resource_id, to_resource_id, dependency_type)
);

CREATE TABLE IF NOT EXISTS metric_definitions (
  resource_id uuid PRIMARY KEY REFERENCES context_assets(resource_id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  measure text NOT NULL,
  unit text NOT NULL CHECK (unit IN (
    'count', 'percentage', 'ratio', 'currency', 'duration'
  )),
  formula text NOT NULL,
  grain text NOT NULL,
  dimensions jsonb NOT NULL,
  source_of_truth jsonb NOT NULL,
  observation_window text NOT NULL,
  exclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(dimensions) = 'array' AND jsonb_array_length(dimensions) > 0),
  CHECK (jsonb_typeof(source_of_truth) = 'object'),
  CHECK (jsonb_typeof(exclusions) = 'array')
);

CREATE TABLE IF NOT EXISTS context_asset_quality_assessments (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  asset_resource_id uuid NOT NULL REFERENCES context_assets(resource_id) ON DELETE CASCADE,
  evaluator_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('ready', 'attention', 'blocked')),
  score real NOT NULL CHECK (score BETWEEN 0 AND 1),
  dimensions jsonb NOT NULL,
  issues jsonb NOT NULL,
  input_digest text NOT NULL CHECK (input_digest ~ '^[a-f0-9]{64}$'),
  assessed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(dimensions) = 'object'),
  CHECK (jsonb_typeof(issues) = 'array'),
  UNIQUE (asset_resource_id, evaluator_version, input_digest)
);

CREATE OR REPLACE FUNCTION validate_context_asset() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  resource_workspace uuid;
  resource_type text;
  owner_workspace uuid;
  subject_workspace uuid;
BEGIN
  SELECT workspace_id, semantic_type INTO resource_workspace, resource_type
  FROM resources WHERE id = NEW.resource_id;
  IF NEW.owner_actor_id IS NOT NULL THEN
    SELECT workspace_id INTO owner_workspace FROM users WHERE id = NEW.owner_actor_id;
  END IF;
  IF NEW.scope_subject_resource_id IS NOT NULL THEN
    SELECT workspace_id INTO subject_workspace
    FROM resources WHERE id = NEW.scope_subject_resource_id;
  END IF;
  IF resource_workspace IS DISTINCT FROM NEW.workspace_id
    OR (NEW.owner_actor_id IS NOT NULL AND owner_workspace IS DISTINCT FROM NEW.workspace_id)
    OR (NEW.scope_subject_resource_id IS NOT NULL AND subject_workspace IS DISTINCT FROM NEW.workspace_id)
  THEN
    RAISE EXCEPTION 'Context asset, owner, scope subject and Resource must remain in one workspace';
  END IF;
  IF NEW.asset_kind = 'metric' AND resource_type <> 'MetricDefinition' THEN
    RAISE EXCEPTION 'Metric context assets require a MetricDefinition Resource';
  ELSIF NEW.asset_kind = 'term' AND resource_type <> 'ContextTerm' THEN
    RAISE EXCEPTION 'Term context assets require a ContextTerm Resource';
  ELSIF NEW.asset_kind = 'skill' AND resource_type <> 'DiagnosticSkill' THEN
    RAISE EXCEPTION 'Skill context assets require a DiagnosticSkill Resource';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION validate_context_asset_source() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  asset_workspace uuid;
  source_workspace uuid;
BEGIN
  SELECT workspace_id INTO asset_workspace
  FROM context_assets WHERE resource_id = NEW.asset_resource_id;
  SELECT workspace_id INTO source_workspace
  FROM resources WHERE id = NEW.source_resource_id;
  IF asset_workspace IS DISTINCT FROM NEW.workspace_id
    OR source_workspace IS DISTINCT FROM NEW.workspace_id
  THEN
    RAISE EXCEPTION 'Context asset provenance must remain inside one workspace';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION validate_context_asset_dependency() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  from_workspace uuid;
  to_workspace uuid;
BEGIN
  SELECT workspace_id INTO from_workspace
  FROM context_assets WHERE resource_id = NEW.from_resource_id;
  SELECT workspace_id INTO to_workspace
  FROM context_assets WHERE resource_id = NEW.to_resource_id;
  IF from_workspace IS DISTINCT FROM NEW.workspace_id
    OR to_workspace IS DISTINCT FROM NEW.workspace_id
  THEN
    RAISE EXCEPTION 'Context asset dependencies must remain inside one workspace';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION validate_metric_definition() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  asset_workspace uuid;
  asset_kind_value text;
BEGIN
  SELECT workspace_id, asset_kind INTO asset_workspace, asset_kind_value
  FROM context_assets WHERE resource_id = NEW.resource_id;
  IF asset_workspace IS DISTINCT FROM NEW.workspace_id OR asset_kind_value <> 'metric' THEN
    RAISE EXCEPTION 'Metric definitions require a metric context asset in the same workspace';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION validate_context_asset_quality() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  asset_workspace uuid;
BEGIN
  SELECT workspace_id INTO asset_workspace
  FROM context_assets WHERE resource_id = NEW.asset_resource_id;
  IF asset_workspace IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'Context quality assessments must match their asset workspace';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER context_assets_validate
  BEFORE INSERT OR UPDATE ON context_assets
  FOR EACH ROW EXECUTE FUNCTION validate_context_asset();
CREATE TRIGGER context_asset_sources_validate
  BEFORE INSERT OR UPDATE ON context_asset_sources
  FOR EACH ROW EXECUTE FUNCTION validate_context_asset_source();
CREATE TRIGGER context_asset_dependencies_validate
  BEFORE INSERT OR UPDATE ON context_asset_dependencies
  FOR EACH ROW EXECUTE FUNCTION validate_context_asset_dependency();
CREATE TRIGGER metric_definitions_validate
  BEFORE INSERT OR UPDATE ON metric_definitions
  FOR EACH ROW EXECUTE FUNCTION validate_metric_definition();
CREATE TRIGGER context_asset_quality_validate
  BEFORE INSERT OR UPDATE ON context_asset_quality_assessments
  FOR EACH ROW EXECUTE FUNCTION validate_context_asset_quality();

ALTER TABLE context_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_asset_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_asset_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_asset_quality_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY context_assets_actor_select ON context_assets FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_resource(resource_id));
CREATE POLICY context_asset_sources_actor_select ON context_asset_sources FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id()
    AND actor_can_access_resource(asset_resource_id)
    AND actor_can_access_resource(source_resource_id));
CREATE POLICY context_asset_dependencies_actor_select ON context_asset_dependencies FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id()
    AND actor_can_access_resource(from_resource_id)
    AND actor_can_access_resource(to_resource_id));
CREATE POLICY metric_definitions_actor_select ON metric_definitions FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_resource(resource_id));
CREATE POLICY context_asset_quality_actor_select ON context_asset_quality_assessments FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id() AND actor_can_access_resource(asset_resource_id));

CREATE POLICY context_assets_ingest_all ON context_assets FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_resource(resource_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_resource(resource_id));
CREATE POLICY context_asset_sources_ingest_all ON context_asset_sources FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id()
    AND actor_can_access_resource(asset_resource_id)
    AND actor_can_access_resource(source_resource_id))
  WITH CHECK (workspace_id = app_workspace_id()
    AND actor_can_access_resource(asset_resource_id)
    AND actor_can_access_resource(source_resource_id));
CREATE POLICY context_asset_dependencies_ingest_all ON context_asset_dependencies FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id()
    AND actor_can_access_resource(from_resource_id)
    AND actor_can_access_resource(to_resource_id))
  WITH CHECK (workspace_id = app_workspace_id()
    AND actor_can_access_resource(from_resource_id)
    AND actor_can_access_resource(to_resource_id));
CREATE POLICY metric_definitions_ingest_all ON metric_definitions FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_resource(resource_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_resource(resource_id));
CREATE POLICY context_asset_quality_ingest_all ON context_asset_quality_assessments FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_resource(asset_resource_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_resource(asset_resource_id));

REVOKE ALL ON context_assets, context_asset_sources, context_asset_dependencies,
  metric_definitions, context_asset_quality_assessments FROM PUBLIC;
GRANT SELECT ON context_assets, context_asset_sources, context_asset_dependencies,
  metric_definitions, context_asset_quality_assessments TO org_brain_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON context_assets, context_asset_sources,
  context_asset_dependencies, metric_definitions,
  context_asset_quality_assessments TO org_brain_ingest;

REVOKE ALL ON FUNCTION validate_context_asset(),
  validate_context_asset_source(), validate_context_asset_dependency(),
  validate_metric_definition(), validate_context_asset_quality() FROM PUBLIC;

ALTER TABLE context_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE context_asset_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE context_asset_dependencies FORCE ROW LEVEL SECURITY;
ALTER TABLE metric_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE context_asset_quality_assessments FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE context_assets IS
  'Governed envelope shared by terms, semantic components, metrics, policies, norms, skills and memories; the canonical Resource remains the asset identity.';
COMMENT ON TABLE metric_definitions IS
  'Executable metric meaning: measure, formula, grain, dimensions, observation window and authoritative source.';
COMMENT ON TABLE context_asset_quality_assessments IS
  'Immutable deterministic receipts for ownership, provenance, freshness, completeness, dependency and version quality.';
