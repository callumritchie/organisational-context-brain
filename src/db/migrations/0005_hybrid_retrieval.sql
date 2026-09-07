CREATE TABLE IF NOT EXISTS search_embeddings (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  access_scope_id uuid NOT NULL REFERENCES access_scopes(id),
  search_document_id uuid NOT NULL REFERENCES search_documents(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  provider text NOT NULL,
  model text NOT NULL,
  dimensions integer NOT NULL CHECK (dimensions = 1536),
  content_hash text NOT NULL,
  embedding vector(1536) NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS search_embeddings_current_idx
  ON search_embeddings (workspace_id, search_document_id, provider, model)
  WHERE is_current;
CREATE INDEX IF NOT EXISTS search_embeddings_resource_idx
  ON search_embeddings (workspace_id, resource_id, provider, model);

ALTER TABLE search_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS search_embeddings_actor_select ON search_embeddings;
CREATE POLICY search_embeddings_actor_select ON search_embeddings FOR SELECT TO org_brain_app
  USING (
    workspace_id = app_workspace_id()
    AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(resource_id)
  );

DROP POLICY IF EXISTS search_embeddings_ingest_all ON search_embeddings;
CREATE POLICY search_embeddings_ingest_all ON search_embeddings FOR ALL TO org_brain_ingest
  USING (
    workspace_id = app_workspace_id()
    AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(resource_id)
  )
  WITH CHECK (
    workspace_id = app_workspace_id()
    AND actor_can_access_scope(access_scope_id)
    AND actor_can_access_resource(resource_id)
  );

GRANT SELECT ON search_embeddings TO org_brain_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON search_embeddings TO org_brain_ingest;

ALTER TABLE search_embeddings FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE search_embeddings IS 'Genuine provider embeddings with model, content-hash and permission provenance; no offline placeholder vectors.';
