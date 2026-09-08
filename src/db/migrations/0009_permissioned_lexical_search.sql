CREATE OR REPLACE FUNCTION permissioned_lexical_search(search_query tsquery, result_limit integer)
RETURNS TABLE(id uuid, lexical_score real, lexical_rank bigint)
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
      AND document.workspace_id = app_workspace_id()
      AND resource.workspace_id = app_workspace_id()
      AND document.active
      AND document.search_vector @@ search_query
      AND actor_can_access_scope(document.access_scope_id)
      AND actor_can_access_scope(resource.access_scope_id)
    ORDER BY document.resource_id, lexical_score DESC, document.id
  ), ranked AS (
    SELECT candidate.id, candidate.lexical_score,
      row_number() OVER (ORDER BY candidate.lexical_score DESC, candidate.id) AS lexical_rank
    FROM best_per_resource candidate
  )
  SELECT ranked.id, ranked.lexical_score, ranked.lexical_rank
  FROM ranked
  ORDER BY ranked.lexical_rank
  LIMIT least(greatest(coalesce(result_limit, 1), 1), 100)
$$;

REVOKE ALL ON FUNCTION permissioned_lexical_search(tsquery, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION permissioned_lexical_search(tsquery, integer) TO org_brain_app;

COMMENT ON FUNCTION permissioned_lexical_search(tsquery, integer) IS
  'Returns only actor-authorised, evidence-deduplicated lexical candidates while allowing indexed text filtering inside the database security boundary.';
