CREATE OR REPLACE FUNCTION validate_context_asset_dependency() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  from_workspace uuid;
  to_workspace uuid;
  from_access_scope uuid;
  to_access_scope uuid;
BEGIN
  SELECT asset.workspace_id, resource.access_scope_id
  INTO from_workspace, from_access_scope
  FROM context_assets asset
  JOIN resources resource ON resource.id = asset.resource_id
  WHERE asset.resource_id = NEW.from_resource_id;

  SELECT asset.workspace_id, resource.access_scope_id
  INTO to_workspace, to_access_scope
  FROM context_assets asset
  JOIN resources resource ON resource.id = asset.resource_id
  WHERE asset.resource_id = NEW.to_resource_id;

  IF from_workspace IS DISTINCT FROM NEW.workspace_id
    OR to_workspace IS DISTINCT FROM NEW.workspace_id
    OR from_access_scope IS DISTINCT FROM to_access_scope
  THEN
    RAISE EXCEPTION 'Context asset dependencies must share one workspace and exact access boundary';
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION validate_context_asset_dependency() IS
  'Prevents a visible asset or global quality receipt from implying the existence of a dependency behind a different access boundary.';
