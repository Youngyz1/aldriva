-- Migration 185: kitchen worker access.
-- Drafted for manual owner application; this file does not apply itself.
-- Tables are server-only. Server routes must enforce business and role scope.

BEGIN;

CREATE TABLE IF NOT EXISTS public.business_kitchens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE
    REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_kitchens_id_business_id_key UNIQUE (id, business_id)
);

CREATE TABLE IF NOT EXISTS public.business_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL
    REFERENCES public.businesses(id) ON DELETE CASCADE,
  kitchen_id uuid NULL,
  role text NOT NULL CHECK (role IN ('cook', 'courier')),
  full_name text NOT NULL CHECK (length(trim(full_name)) > 0),
  phone text NOT NULL,
  whatsapp_number text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  deactivated_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_workers_kitchen_business_fk
    FOREIGN KEY (kitchen_id, business_id)
    REFERENCES public.business_kitchens(id, business_id)
    ON DELETE CASCADE,
  CONSTRAINT business_workers_cook_requires_kitchen
    CHECK (role <> 'cook' OR kitchen_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.business_worker_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL UNIQUE
    REFERENCES public.business_workers(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  token_consumed_at timestamptz NULL,
  accepted_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_worker_invitations_id_worker_id_key
    UNIQUE (id, worker_id)
);

CREATE TABLE IF NOT EXISTS public.business_worker_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL,
  invitation_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  hard_expires_at timestamptz NOT NULL,
  last_renewed_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_worker_sessions_expiry_order
    CHECK (expires_at <= hard_expires_at),
  CONSTRAINT business_worker_sessions_invitation_worker_fk
    FOREIGN KEY (invitation_id, worker_id)
    REFERENCES public.business_worker_invitations(id, worker_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.business_kitchen_display_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_id uuid NOT NULL UNIQUE
    REFERENCES public.business_kitchens(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_workers_active_scope
  ON public.business_workers (business_id, kitchen_id, role)
  WHERE is_active = true AND deactivated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_business_worker_invitations_expiry
  ON public.business_worker_invitations (expires_at)
  WHERE revoked_at IS NULL AND token_consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_business_worker_sessions_worker
  ON public.business_worker_sessions (worker_id)
  WHERE revoked_at IS NULL;

-- No direct anon/authenticated access. Service-role routes must enforce scope.
ALTER TABLE public.business_kitchens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_worker_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_worker_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_kitchen_display_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.business_kitchens,
  public.business_workers,
  public.business_worker_invitations,
  public.business_worker_sessions,
  public.business_kitchen_display_links
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  public.business_kitchens,
  public.business_workers,
  public.business_worker_invitations,
  public.business_worker_sessions,
  public.business_kitchen_display_links
TO service_role;

-- Deactivation revokes even a never-accepted invitation and every session.
CREATE OR REPLACE FUNCTION public.revoke_business_worker_access_on_deactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  IF (
    OLD.is_active IS DISTINCT FROM NEW.is_active
    OR OLD.deactivated_at IS DISTINCT FROM NEW.deactivated_at
  ) AND (
    NEW.is_active = false
    OR NEW.deactivated_at IS NOT NULL
  ) THEN
    UPDATE public.business_worker_invitations
       SET revoked_at = COALESCE(revoked_at, v_now),
           updated_at = v_now
     WHERE worker_id = NEW.id
       AND revoked_at IS NULL;

    UPDATE public.business_worker_sessions
       SET revoked_at = COALESCE(revoked_at, v_now),
           updated_at = v_now
     WHERE worker_id = NEW.id
       AND revoked_at IS NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_revoke_business_worker_access_on_deactivation
  ON public.business_workers;

CREATE TRIGGER trg_revoke_business_worker_access_on_deactivation
AFTER UPDATE OF is_active, deactivated_at ON public.business_workers
FOR EACH ROW
WHEN (
  OLD.is_active IS DISTINCT FROM NEW.is_active
  OR OLD.deactivated_at IS DISTINCT FROM NEW.deactivated_at
)
EXECUTE FUNCTION public.revoke_business_worker_access_on_deactivation();

-- Atomically consumes a cook invitation and creates its first session.
-- The caller generates both random tokens and passes only their SHA-256 hashes.
CREATE OR REPLACE FUNCTION public.consume_business_worker_invitation(
  p_invitation_token_hash text,
  p_phone_last4 text,
  p_session_token_hash text
)
RETURNS TABLE (
  out_worker_id uuid,
  out_business_id uuid,
  out_kitchen_id uuid,
  out_session_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_invitation_id uuid;
  v_worker_id uuid;
  v_business_id uuid;
  v_kitchen_id uuid;
  v_session_expires_at timestamptz;
BEGIN
  IF p_invitation_token_hash IS NULL
     OR p_invitation_token_hash !~ '^[0-9a-f]{64}$'
     OR p_session_token_hash IS NULL
     OR p_session_token_hash !~ '^[0-9a-f]{64}$'
     OR p_phone_last4 IS NULL
     OR p_phone_last4 !~ '^[0-9]{4}$' THEN
    RETURN;
  END IF;

  SELECT i.id, w.id, w.business_id, w.kitchen_id
    INTO v_invitation_id, v_worker_id, v_business_id, v_kitchen_id
    FROM public.business_worker_invitations AS i
    JOIN public.business_workers AS w ON w.id = i.worker_id
   WHERE i.token_hash = p_invitation_token_hash
     AND i.expires_at > v_now
     AND i.token_consumed_at IS NULL
     AND i.revoked_at IS NULL
     AND w.role = 'cook'
     AND w.is_active = true
     AND w.deactivated_at IS NULL
     AND char_length(regexp_replace(w.phone, '[^0-9]', '', 'g')) >= 4
     AND right(regexp_replace(w.phone, '[^0-9]', '', 'g'), 4) = p_phone_last4
   FOR UPDATE OF i, w;

  IF v_invitation_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.business_worker_invitations
     SET token_consumed_at = v_now,
         accepted_at = COALESCE(accepted_at, v_now),
         updated_at = v_now
   WHERE id = v_invitation_id
     AND token_consumed_at IS NULL
     AND revoked_at IS NULL
     AND expires_at > v_now;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_session_expires_at := v_now + interval '30 days';

  INSERT INTO public.business_worker_sessions (
    worker_id,
    invitation_id,
    token_hash,
    created_at,
    expires_at,
    hard_expires_at,
    last_renewed_at,
    updated_at
  )
  VALUES (
    v_worker_id,
    v_invitation_id,
    p_session_token_hash,
    v_now,
    v_session_expires_at,
    v_now + interval '90 days',
    v_now,
    v_now
  );

  RETURN QUERY
  SELECT v_worker_id, v_business_id, v_kitchen_id, v_session_expires_at;
END;
$function$;

-- Every worker request validates the session, worker and invitation. Sliding
-- renewal writes only when last_renewed_at is more than 24 hours old.
CREATE OR REPLACE FUNCTION public.validate_and_renew_business_worker_session(
  p_session_token_hash text
)
RETURNS TABLE (
  out_worker_id uuid,
  out_business_id uuid,
  out_kitchen_id uuid,
  out_role text,
  out_session_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_session_id uuid;
  v_worker_id uuid;
  v_business_id uuid;
  v_kitchen_id uuid;
  v_role text;
  v_hard_expires_at timestamptz;
  v_last_renewed_at timestamptz;
  v_session_expires_at timestamptz;
BEGIN
  IF p_session_token_hash IS NULL
     OR p_session_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;

  SELECT s.id, w.id, w.business_id, w.kitchen_id, w.role,
         s.hard_expires_at, s.last_renewed_at, s.expires_at
    INTO v_session_id, v_worker_id, v_business_id, v_kitchen_id, v_role,
         v_hard_expires_at, v_last_renewed_at, v_session_expires_at
    FROM public.business_worker_sessions AS s
    JOIN public.business_workers AS w ON w.id = s.worker_id
    JOIN public.business_worker_invitations AS i
      ON i.id = s.invitation_id AND i.worker_id = w.id
   WHERE s.token_hash = p_session_token_hash
     AND s.revoked_at IS NULL
     AND s.expires_at > v_now
     AND s.hard_expires_at > v_now
     AND w.is_active = true
     AND w.deactivated_at IS NULL
     AND i.accepted_at IS NOT NULL
     AND i.revoked_at IS NULL
   FOR UPDATE OF s;

  IF v_session_id IS NULL THEN
    RETURN;
  END IF;

  IF v_last_renewed_at < v_now - interval '24 hours' THEN
    UPDATE public.business_worker_sessions
       SET expires_at = LEAST(v_now + interval '30 days', v_hard_expires_at),
           last_renewed_at = v_now,
           updated_at = v_now
     WHERE id = v_session_id
       AND revoked_at IS NULL
       AND hard_expires_at > v_now
       AND last_renewed_at < v_now - interval '24 hours'
    RETURNING expires_at INTO v_session_expires_at;

    IF NOT FOUND THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT v_worker_id, v_business_id, v_kitchen_id, v_role,
         v_session_expires_at;
END;
$function$;

REVOKE ALL ON FUNCTION
  public.revoke_business_worker_access_on_deactivation()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.consume_business_worker_invitation(text, text, text)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.validate_and_renew_business_worker_session(text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.revoke_business_worker_access_on_deactivation()
TO service_role;

GRANT EXECUTE ON FUNCTION
  public.consume_business_worker_invitation(text, text, text)
TO service_role;

GRANT EXECUTE ON FUNCTION
  public.validate_and_renew_business_worker_session(text)
TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
