CREATE TABLE IF NOT EXISTS identity_providers (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  issuer text NOT NULL,
  audience text NOT NULL,
  jwks_uri text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, audience, workspace_id)
);

CREATE TABLE IF NOT EXISTS external_identities (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  identity_provider_id uuid NOT NULL REFERENCES identity_providers(id),
  subject text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  active boolean NOT NULL DEFAULT true,
  last_authenticated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_provider_id, subject),
  UNIQUE (identity_provider_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_capabilities (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  user_id uuid NOT NULL REFERENCES users(id),
  capability text NOT NULL CHECK (capability IN (
    'hypothesis.review', 'monitor.operate', 'ontology.review'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, capability)
);

ALTER TABLE identity_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_providers FORCE ROW LEVEL SECURITY;
ALTER TABLE external_identities FORCE ROW LEVEL SECURITY;
ALTER TABLE user_capabilities FORCE ROW LEVEL SECURITY;

REVOKE ALL ON identity_providers, external_identities, user_capabilities FROM PUBLIC;
REVOKE ALL ON identity_providers, external_identities, user_capabilities FROM org_brain_app;
REVOKE ALL ON identity_providers, external_identities, user_capabilities FROM org_brain_ingest;

DROP FUNCTION IF EXISTS resolve_external_identity(text, text, text);

CREATE OR REPLACE FUNCTION resolve_external_identity(
  requested_issuer text,
  requested_subject text,
  requested_audience text
) RETURNS TABLE (
  actor_id uuid,
  workspace_id uuid,
  actor_name text,
  role_label text,
  capabilities jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF requested_issuer IS NULL OR requested_subject IS NULL OR requested_audience IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY WITH resolved AS (
    SELECT identity.id AS identity_id, mapped_user.id AS user_id,
      mapped_user.workspace_id, mapped_user.name, mapped_user.role_label
    FROM external_identities identity
    JOIN identity_providers provider ON provider.id = identity.identity_provider_id
    JOIN users mapped_user ON mapped_user.id = identity.user_id
    WHERE identity.workspace_id = mapped_user.workspace_id
      AND provider.workspace_id = identity.workspace_id
      AND provider.enabled AND identity.active
      AND provider.issuer = requested_issuer
      AND provider.audience = requested_audience
      AND identity.subject = requested_subject
  ), touched AS (
    UPDATE external_identities identity
    SET last_authenticated_at = now(), updated_at = now()
    FROM resolved
    WHERE identity.id = resolved.identity_id
    RETURNING resolved.user_id, resolved.workspace_id,
      resolved.name, resolved.role_label
  )
  SELECT touched.user_id, touched.workspace_id, touched.name, touched.role_label,
    COALESCE((
      SELECT jsonb_agg(capability.capability ORDER BY capability.capability)
      FROM user_capabilities capability
      WHERE capability.user_id = touched.user_id
        AND capability.workspace_id = touched.workspace_id
    ), '[]'::jsonb)
  FROM touched;
END;
$$;

REVOKE ALL ON FUNCTION resolve_external_identity(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_external_identity(text, text, text) TO org_brain_app;

COMMENT ON FUNCTION resolve_external_identity(text, text, text) IS
  'Narrow post-verification mapping from a trusted OIDC issuer/subject/audience to server-owned actor, workspace and role.';
COMMENT ON TABLE external_identities IS
  'Administrative identity links. JWT role or workspace claims are never authoritative.';
COMMENT ON TABLE user_capabilities IS
  'Server-owned action capabilities; role labels and JWT claims are not authorisation grants.';
