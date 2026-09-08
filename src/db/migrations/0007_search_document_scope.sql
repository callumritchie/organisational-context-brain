ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS access_scope_id uuid REFERENCES access_scopes(id);

UPDATE search_documents document
SET access_scope_id = COALESCE(
  (SELECT assertion_row.access_scope_id FROM assertions assertion_row WHERE assertion_row.id = document.assertion_id),
  (SELECT resource.access_scope_id FROM resources resource WHERE resource.id = document.resource_id)
)
WHERE document.access_scope_id IS NULL;

ALTER TABLE search_documents ALTER COLUMN access_scope_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS search_documents_workspace_scope_active_idx
  ON search_documents (workspace_id, access_scope_id) WHERE active;

DROP POLICY IF EXISTS search_documents_actor_select ON search_documents;
CREATE POLICY search_documents_actor_select ON search_documents FOR SELECT TO org_brain_app
  USING (
    workspace_id = app_workspace_id()
    AND active
    AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(resource_id)
  );

DROP POLICY IF EXISTS search_documents_ingest_all ON search_documents;
CREATE POLICY search_documents_ingest_all ON search_documents FOR ALL TO org_brain_ingest
  USING (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id))
  WITH CHECK (workspace_id = app_workspace_id() AND actor_can_access_scope(access_scope_id));

COMMENT ON COLUMN search_documents.access_scope_id IS
  'Materialised effective retrieval scope derived from the indexed assertion, or from the resource when no assertion exists.';
