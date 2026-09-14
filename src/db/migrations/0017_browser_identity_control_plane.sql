CREATE TABLE IF NOT EXISTS oidc_login_attempts (
  id uuid PRIMARY KEY,
  state_hash text NOT NULL UNIQUE CHECK (length(state_hash) = 64),
  browser_binding_hash text NOT NULL CHECK (length(browser_binding_hash) = 64),
  code_verifier text NOT NULL CHECK (length(code_verifier) BETWEEN 43 AND 128),
  nonce text NOT NULL CHECK (length(nonce) BETWEEN 32 AND 255),
  redirect_uri text NOT NULL,
  return_to text NOT NULL DEFAULT '/',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS browser_sessions (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  external_identity_id uuid NOT NULL REFERENCES external_identities(id),
  session_token_hash text NOT NULL UNIQUE CHECK (length(session_token_hash) = 64),
  csrf_token_hash text NOT NULL CHECK (length(csrf_token_hash) = 64),
  user_agent_hash text CHECK (user_agent_hash IS NULL OR length(user_agent_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text
);

CREATE INDEX IF NOT EXISTS browser_sessions_identity_active_idx
  ON browser_sessions (external_identity_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS api_rate_limit_windows (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  operation_class text NOT NULL CHECK (operation_class IN ('read', 'mutation')),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, actor_id, operation_class)
);

CREATE TABLE IF NOT EXISTS security_audit_events (
  id uuid PRIMARY KEY,
  workspace_id uuid REFERENCES workspaces(id),
  actor_id uuid REFERENCES users(id),
  event_type text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
  request_id text,
  session_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_audit_events_workspace_created_idx
  ON security_audit_events (workspace_id, created_at DESC);

ALTER TABLE oidc_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_rate_limit_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE oidc_login_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE browser_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE api_rate_limit_windows FORCE ROW LEVEL SECURITY;
ALTER TABLE security_audit_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON oidc_login_attempts, browser_sessions,
  api_rate_limit_windows, security_audit_events FROM PUBLIC;
REVOKE ALL ON oidc_login_attempts, browser_sessions,
  api_rate_limit_windows, security_audit_events FROM org_brain_app;
REVOKE ALL ON oidc_login_attempts, browser_sessions,
  api_rate_limit_windows, security_audit_events FROM org_brain_ingest;

DROP FUNCTION IF EXISTS begin_oidc_login_attempt(text, text, text, text, text, text, timestamptz);
CREATE OR REPLACE FUNCTION begin_oidc_login_attempt(
  requested_state_hash text,
  requested_browser_binding_hash text,
  requested_code_verifier text,
  requested_nonce text,
  requested_redirect_uri text,
  requested_return_to text,
  requested_expires_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF length(requested_state_hash) <> 64
    OR length(requested_browser_binding_hash) <> 64
    OR length(requested_code_verifier) NOT BETWEEN 43 AND 128
    OR length(requested_nonce) NOT BETWEEN 32 AND 255
    OR requested_expires_at <= now()
    OR requested_expires_at > now() + interval '10 minutes'
    OR requested_return_to !~ '^/([^/]|$)'
  THEN
    RAISE EXCEPTION 'Invalid OIDC login attempt';
  END IF;

  DELETE FROM oidc_login_attempts
  WHERE expires_at < now() - interval '1 hour' OR consumed_at IS NOT NULL;

  INSERT INTO oidc_login_attempts (
    id, state_hash, browser_binding_hash, code_verifier, nonce,
    redirect_uri, return_to, expires_at
  ) VALUES (
    gen_random_uuid(), requested_state_hash, requested_browser_binding_hash,
    requested_code_verifier, requested_nonce, requested_redirect_uri,
    requested_return_to, requested_expires_at
  );
END;
$$;

DROP FUNCTION IF EXISTS consume_oidc_login_attempt(text, text);
CREATE OR REPLACE FUNCTION consume_oidc_login_attempt(
  requested_state_hash text,
  requested_browser_binding_hash text
) RETURNS TABLE (
  code_verifier text,
  nonce text,
  redirect_uri text,
  return_to text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE oidc_login_attempts
  SET consumed_at = now()
  WHERE state_hash = requested_state_hash
    AND browser_binding_hash = requested_browser_binding_hash
    AND consumed_at IS NULL
    AND expires_at > now()
  RETURNING code_verifier, nonce, redirect_uri, return_to;
$$;

DROP FUNCTION IF EXISTS create_browser_session(text, text, text, text, text, text, timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION create_browser_session(
  requested_issuer text,
  requested_subject text,
  requested_audience text,
  requested_session_token_hash text,
  requested_csrf_token_hash text,
  requested_user_agent_hash text,
  requested_idle_expires_at timestamptz,
  requested_expires_at timestamptz
) RETURNS TABLE (session_id uuid, actor_id uuid, workspace_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF length(requested_session_token_hash) <> 64
    OR length(requested_csrf_token_hash) <> 64
    OR (requested_user_agent_hash IS NOT NULL AND length(requested_user_agent_hash) <> 64)
    OR requested_idle_expires_at <= now()
    OR requested_expires_at <= requested_idle_expires_at
    OR requested_expires_at > now() + interval '24 hours'
  THEN
    RAISE EXCEPTION 'Invalid browser session';
  END IF;

  RETURN QUERY WITH resolved AS (
    SELECT identity.id AS identity_id, identity.workspace_id, mapped_user.id AS user_id
    FROM external_identities identity
    JOIN identity_providers provider ON provider.id = identity.identity_provider_id
    JOIN users mapped_user ON mapped_user.id = identity.user_id
    WHERE identity.workspace_id = mapped_user.workspace_id
      AND provider.workspace_id = identity.workspace_id
      AND provider.enabled AND identity.active
      AND provider.issuer = requested_issuer
      AND provider.audience = requested_audience
      AND identity.subject = requested_subject
  ), inserted AS (
    INSERT INTO browser_sessions (
      id, workspace_id, external_identity_id, session_token_hash,
      csrf_token_hash, user_agent_hash, idle_expires_at, expires_at
    )
    SELECT gen_random_uuid(), resolved.workspace_id, resolved.identity_id,
      requested_session_token_hash, requested_csrf_token_hash,
      requested_user_agent_hash, requested_idle_expires_at, requested_expires_at
    FROM resolved
    RETURNING id, browser_sessions.workspace_id, external_identity_id
  )
  SELECT inserted.id, resolved.user_id, inserted.workspace_id
  FROM inserted
  JOIN resolved ON resolved.identity_id = inserted.external_identity_id;
END;
$$;

DROP FUNCTION IF EXISTS resolve_browser_session(text, text, interval);
CREATE OR REPLACE FUNCTION resolve_browser_session(
  requested_session_token_hash text,
  requested_user_agent_hash text,
  requested_idle_extension interval
) RETURNS TABLE (
  session_id uuid,
  actor_id uuid,
  workspace_id uuid,
  actor_name text,
  role_label text,
  capabilities jsonb,
  csrf_token_hash text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF length(requested_session_token_hash) <> 64
    OR (requested_user_agent_hash IS NOT NULL AND length(requested_user_agent_hash) <> 64)
    OR requested_idle_extension <= interval '0 seconds'
    OR requested_idle_extension > interval '2 hours'
  THEN
    RETURN;
  END IF;

  RETURN QUERY WITH touched AS (
    UPDATE browser_sessions session
    SET last_seen_at = now(),
      idle_expires_at = LEAST(session.expires_at, now() + requested_idle_extension)
    FROM external_identities identity, identity_providers provider, users mapped_user
    WHERE session.session_token_hash = requested_session_token_hash
      AND session.external_identity_id = identity.id
      AND identity.identity_provider_id = provider.id
      AND identity.user_id = mapped_user.id
      AND session.workspace_id = identity.workspace_id
      AND identity.workspace_id = provider.workspace_id
      AND identity.workspace_id = mapped_user.workspace_id
      AND session.revoked_at IS NULL
      AND session.expires_at > now()
      AND session.idle_expires_at > now()
      AND identity.active AND provider.enabled
      AND (session.user_agent_hash IS NULL OR session.user_agent_hash = requested_user_agent_hash)
    RETURNING session.id, mapped_user.id AS user_id, mapped_user.workspace_id,
      mapped_user.name, mapped_user.role_label, session.csrf_token_hash
  )
  SELECT touched.id, touched.user_id, touched.workspace_id, touched.name,
    touched.role_label,
    COALESCE((
      SELECT jsonb_agg(capability.capability ORDER BY capability.capability)
      FROM user_capabilities capability
      WHERE capability.user_id = touched.user_id
        AND capability.workspace_id = touched.workspace_id
    ), '[]'::jsonb),
    touched.csrf_token_hash
  FROM touched;
END;
$$;

DROP FUNCTION IF EXISTS revoke_browser_session(text, text);
CREATE OR REPLACE FUNCTION revoke_browser_session(
  requested_session_token_hash text,
  requested_reason text
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH revoked AS (
    UPDATE browser_sessions
    SET revoked_at = COALESCE(revoked_at, now()),
      revoke_reason = COALESCE(revoke_reason, left(requested_reason, 100))
    WHERE session_token_hash = requested_session_token_hash
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM revoked);
$$;

DROP FUNCTION IF EXISTS consume_api_rate_limit(uuid, uuid, text, integer, interval);
CREATE OR REPLACE FUNCTION consume_api_rate_limit(
  requested_workspace_id uuid,
  requested_actor_id uuid,
  requested_operation_class text,
  requested_limit integer,
  requested_window interval
) RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_count integer;
  current_window timestamptz;
BEGIN
  IF requested_operation_class NOT IN ('read', 'mutation')
    OR requested_limit NOT BETWEEN 1 AND 10000
    OR requested_window < interval '1 second'
    OR requested_window > interval '1 hour'
    OR NOT EXISTS (
      SELECT 1 FROM users
      WHERE id = requested_actor_id AND workspace_id = requested_workspace_id
    )
  THEN
    RAISE EXCEPTION 'Invalid API rate-limit request';
  END IF;

  INSERT INTO api_rate_limit_windows (
    id, workspace_id, actor_id, operation_class,
    window_started_at, request_count, updated_at
  ) VALUES (
    gen_random_uuid(), requested_workspace_id, requested_actor_id,
    requested_operation_class, now(), 1, now()
  )
  ON CONFLICT (workspace_id, actor_id, operation_class) DO UPDATE
  SET window_started_at = CASE
      WHEN api_rate_limit_windows.window_started_at + requested_window <= now()
      THEN now() ELSE api_rate_limit_windows.window_started_at END,
    request_count = CASE
      WHEN api_rate_limit_windows.window_started_at + requested_window <= now()
      THEN 1 ELSE api_rate_limit_windows.request_count + 1 END,
    updated_at = now()
  RETURNING request_count, window_started_at
  INTO current_count, current_window;

  RETURN QUERY SELECT current_count <= requested_limit,
    GREATEST(0, CEIL(EXTRACT(EPOCH FROM
      (current_window + requested_window - now())))::integer);
END;
$$;

DROP FUNCTION IF EXISTS record_security_audit_event(uuid, uuid, text, text, text, uuid, jsonb);
CREATE OR REPLACE FUNCTION record_security_audit_event(
  requested_workspace_id uuid,
  requested_actor_id uuid,
  requested_event_type text,
  requested_outcome text,
  requested_request_id text,
  requested_session_id uuid,
  requested_metadata jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF requested_outcome NOT IN ('success', 'denied', 'failure')
    OR length(requested_event_type) NOT BETWEEN 1 AND 120
    OR requested_event_type !~ '^(authentication\.(login|logout)|mutation\.(authorized|denied)\.[a-z.]+|rate_limit\.(read|mutation))$'
    OR (requested_actor_id IS NULL AND (
      requested_event_type <> 'authentication.login'
      OR requested_workspace_id IS NOT NULL
      OR requested_session_id IS NOT NULL
    ))
    OR (requested_actor_id IS NOT NULL AND requested_workspace_id IS NULL)
    OR (requested_actor_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM users
      WHERE id = requested_actor_id AND workspace_id = requested_workspace_id
    ))
  THEN
    RAISE EXCEPTION 'Invalid security audit event';
  END IF;

  INSERT INTO security_audit_events (
    id, workspace_id, actor_id, event_type, outcome,
    request_id, session_id, metadata
  ) VALUES (
    gen_random_uuid(), requested_workspace_id, requested_actor_id,
    requested_event_type, requested_outcome, left(requested_request_id, 120),
    requested_session_id, COALESCE(requested_metadata, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION begin_oidc_login_attempt(text, text, text, text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION consume_oidc_login_attempt(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_browser_session(text, text, text, text, text, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION resolve_browser_session(text, text, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_browser_session(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION consume_api_rate_limit(uuid, uuid, text, integer, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_security_audit_event(uuid, uuid, text, text, text, uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION begin_oidc_login_attempt(text, text, text, text, text, text, timestamptz) TO org_brain_app;
GRANT EXECUTE ON FUNCTION consume_oidc_login_attempt(text, text) TO org_brain_app;
GRANT EXECUTE ON FUNCTION create_browser_session(text, text, text, text, text, text, timestamptz, timestamptz) TO org_brain_app;
GRANT EXECUTE ON FUNCTION resolve_browser_session(text, text, interval) TO org_brain_app;
GRANT EXECUTE ON FUNCTION revoke_browser_session(text, text) TO org_brain_app;
GRANT EXECUTE ON FUNCTION consume_api_rate_limit(uuid, uuid, text, integer, interval) TO org_brain_app;
GRANT EXECUTE ON FUNCTION record_security_audit_event(uuid, uuid, text, text, text, uuid, jsonb) TO org_brain_app;

COMMENT ON TABLE oidc_login_attempts IS
  'One-time, browser-bound OIDC code-flow state and PKCE material. Never exposed through normal app table access.';
COMMENT ON TABLE browser_sessions IS
  'Revocable server-side sessions. Only SHA-256 hashes of browser secrets are retained.';
COMMENT ON TABLE security_audit_events IS
  'Append-only security events written through a narrow function and exported only by an administrative process.';
