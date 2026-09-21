DROP POLICY IF EXISTS perception_runs_actor_select ON perception_runs;
CREATE POLICY perception_runs_actor_select
  ON perception_runs FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id()
    AND actor_can_access_resource(artifact_resource_id)
    AND EXISTS (
      SELECT 1 FROM resources artifact
      WHERE artifact.id = artifact_resource_id AND artifact.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM external_source_connections connection
      WHERE connection.id = connection_id
        AND actor_is_host_project_member(connection.project_binding_id)
    ));

DROP POLICY IF EXISTS perception_observations_actor_select ON perception_observations;
CREATE POLICY perception_observations_actor_select
  ON perception_observations FOR SELECT TO org_brain_app
  USING (workspace_id = app_workspace_id()
    AND actor_can_access_resource(observation_resource_id)
    AND actor_can_access_resource(artifact_resource_id)
    AND EXISTS (
      SELECT 1 FROM resources observation
      WHERE observation.id = observation_resource_id
        AND observation.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM resources artifact
      WHERE artifact.id = artifact_resource_id AND artifact.status = 'active'
    )
    AND EXISTS (SELECT 1 FROM perception_runs run WHERE run.id = perception_run_id));

COMMENT ON POLICY perception_observations_actor_select ON perception_observations IS
  'Tombstoned artifacts and their retired derived observations remain auditable to the owning role but disappear from application-role perception.';
