ALTER TABLE ontology_versions
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);

CREATE OR REPLACE FUNCTION enforce_ontology_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.schema_document IS DISTINCT FROM OLD.schema_document
     OR NEW.checksum IS DISTINCT FROM OLD.checksum
     OR NEW.process_name IS DISTINCT FROM OLD.process_name
     OR NEW.process_version IS DISTINCT FROM OLD.process_version
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Ontology version snapshots are immutable';
  END IF;
  IF OLD.status <> 'current' OR NEW.status <> 'superseded' THEN
    RAISE EXCEPTION 'Ontology status may only transition from current to superseded';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ontology_versions_immutable_update ON ontology_versions;
CREATE TRIGGER ontology_versions_immutable_update
  BEFORE UPDATE ON ontology_versions
  FOR EACH ROW EXECUTE FUNCTION enforce_ontology_version_immutability();

COMMENT ON COLUMN ontology_versions.created_by IS 'Actor who published this version; null only for bootstrapped versions.';
