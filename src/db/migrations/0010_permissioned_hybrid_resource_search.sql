CREATE OR REPLACE FUNCTION permissioned_lexical_resource_search(search_query tsquery, result_limit integer)
RETURNS TABLE(id uuid, resource_id uuid, lexical_score real, lexical_rank bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH best_per_resource AS (
    SELECT DISTINCT ON (document.resource_id)
      document.id,
      document.resource_id,
      ts_rank_cd(document.search_vector, search_query, 32)::real AS lexical_score
    FROM search_documents document
    JOIN resources resource ON resource.id = document.resource_id
    WHERE app_actor_id() IS NOT NULL
      AND app_workspace_id() IS NOT NULL
      AND search_query IS NOT NULL
      AND document.workspace_id = app_workspace_id()
      AND resource.workspace_id = app_workspace_id()
      AND document.active
      AND document.search_vector @@ search_query
      AND actor_can_access_scope(document.access_scope_id)
      AND actor_can_access_scope(resource.access_scope_id)
    ORDER BY document.resource_id, lexical_score DESC, document.id
  ), ranked AS (
    SELECT candidate.id, candidate.resource_id, candidate.lexical_score,
      row_number() OVER (ORDER BY candidate.lexical_score DESC, candidate.id) AS lexical_rank
    FROM best_per_resource candidate
  )
  SELECT ranked.id, ranked.resource_id, ranked.lexical_score, ranked.lexical_rank
  FROM ranked
  ORDER BY ranked.lexical_rank
  LIMIT least(greatest(coalesce(result_limit, 1), 1), 100)
$$;

CREATE OR REPLACE FUNCTION permissioned_semantic_resource_search(
  query_embedding vector(1536), search_provider text, search_model text, result_limit integer
)
RETURNS TABLE(id uuid, resource_id uuid, semantic_score double precision, semantic_rank bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH best_per_resource AS (
    SELECT DISTINCT ON (document.resource_id)
      document.id,
      document.resource_id,
      1 - (embedding.embedding <=> query_embedding) AS semantic_score
    FROM search_embeddings embedding
    JOIN search_documents document ON document.id = embedding.search_document_id
    JOIN resources resource ON resource.id = document.resource_id
    WHERE app_actor_id() IS NOT NULL
      AND app_workspace_id() IS NOT NULL
      AND query_embedding IS NOT NULL
      AND embedding.workspace_id = app_workspace_id()
      AND document.workspace_id = app_workspace_id()
      AND resource.workspace_id = app_workspace_id()
      AND embedding.workspace_id = document.workspace_id
      AND embedding.resource_id = document.resource_id
      AND embedding.access_scope_id = document.access_scope_id
      AND document.active
      AND embedding.is_current
      AND embedding.provider = search_provider
      AND embedding.model = search_model
      AND actor_can_access_scope(embedding.access_scope_id)
      AND actor_can_access_scope(document.access_scope_id)
      AND actor_can_access_scope(resource.access_scope_id)
    ORDER BY document.resource_id, semantic_score DESC, document.id
  ), ranked AS (
    SELECT candidate.id, candidate.resource_id, candidate.semantic_score,
      row_number() OVER (ORDER BY candidate.semantic_score DESC, candidate.id) AS semantic_rank
    FROM best_per_resource candidate
  )
  SELECT ranked.id, ranked.resource_id, ranked.semantic_score, ranked.semantic_rank
  FROM ranked
  ORDER BY ranked.semantic_rank
  LIMIT least(greatest(coalesce(result_limit, 1), 1), 100)
$$;

REVOKE ALL ON FUNCTION permissioned_lexical_resource_search(tsquery, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION permissioned_semantic_resource_search(vector, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION permissioned_lexical_resource_search(tsquery, integer) TO org_brain_app;
GRANT EXECUTE ON FUNCTION permissioned_semantic_resource_search(vector, text, text, integer) TO org_brain_app;

COMMENT ON FUNCTION permissioned_lexical_resource_search(tsquery, integer) IS
  'Returns the best actor-authorised lexical chunk per evidence Resource.';
COMMENT ON FUNCTION permissioned_semantic_resource_search(vector, text, text, integer) IS
  'Returns the best actor-authorised exact-vector chunk per evidence Resource.';
