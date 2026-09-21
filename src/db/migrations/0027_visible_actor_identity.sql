CREATE OR REPLACE FUNCTION visible_actor_name(target_actor_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT target.name
  FROM users target
  WHERE target.id = target_actor_id
    AND target.workspace_id = app_workspace_id()
    AND (
      target.id = app_actor_id()
      OR EXISTS (
        SELECT 1
        FROM host_project_memberships caller_membership
        JOIN host_project_memberships target_membership
          ON target_membership.project_binding_id = caller_membership.project_binding_id
        JOIN host_project_bindings binding
          ON binding.id = caller_membership.project_binding_id
        WHERE caller_membership.actor_id = app_actor_id()
          AND caller_membership.membership_status = 'active'
          AND target_membership.actor_id = target.id
          AND target_membership.membership_status = 'active'
          AND binding.workspace_id = target.workspace_id
          AND binding.status = 'active'
      )
    )
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION visible_actor_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION visible_actor_name(uuid) TO org_brain_app, org_brain_ingest;

COMMENT ON FUNCTION visible_actor_name(uuid) IS
  'Returns a user display name only for the current actor or an active member of the same visible host project; avoids granting application access to the users table.';
