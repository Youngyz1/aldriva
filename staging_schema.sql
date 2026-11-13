--
-- PostgreSQL database dump
--

\restrict LFdy4VWIx3v9jhfAw8zTCe984pyK73MiuxKimmEfK2zApQMtf9h8pyBu9kbBXud

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql;


--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql_public;


--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgbouncer;


--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA realtime;


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA vault;


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- Name: EXTENSION supabase_vault; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone',
    'recovery_code'
);


--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: action; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


--
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in',
    'like',
    'ilike',
    'is',
    'match',
    'imatch',
    'isdistinct'
);


--
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text,
	negate boolean
);


--
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


--
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


--
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: -
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


--
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


--
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


--
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
    revoke trigger on cron.job_run_details from postgres;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
begin
    if not exists (
        select 1
        from pg_catalog.pg_event_trigger_ddl_commands() ev
        join pg_catalog.pg_extension e on ev.objid = e.oid
        where e.extname = 'pg_graphql'
    ) then
        return;
    end if;

    drop function if exists graphql_public.graphql;
    create or replace function graphql_public.graphql(
        "operationName" text default null,
        query text default null,
        variables jsonb default null,
        extensions jsonb default null
    )
        returns jsonb
        language sql
    as $$
        select graphql.resolve(
            query := query,
            variables := coalesce(variables, '{}'),
            "operationName" := "operationName",
            extensions := extensions
        );
    $$;

    -- Attach the wrapper to the extension so DROP EXTENSION cascades to it,
    -- which in turn triggers set_graphql_placeholder to reinstall the "not enabled" stub.
    alter extension pg_graphql add function graphql_public.graphql(text, text, jsonb, jsonb);

    grant usage on schema graphql to postgres, anon, authenticated, service_role;
    grant execute on function graphql.resolve to postgres, anon, authenticated, service_role;
    grant usage on schema graphql to postgres with grant option;
    grant usage on schema graphql_public to postgres with grant option;
end;
$_$;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8.0', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
            set search_path to ''
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- Name: graphql(text, text, jsonb, jsonb); Type: FUNCTION; Schema: graphql_public; Owner: -
--

CREATE FUNCTION graphql_public.graphql("operationName" text DEFAULT NULL::text, query text DEFAULT NULL::text, variables jsonb DEFAULT NULL::jsonb, extensions jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;


--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: -
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  BEGIN
      RAISE DEBUG 'PgBouncer auth request: %', p_usename;

      RETURN QUERY
      SELECT
          rolname::text,
          CASE WHEN rolvaliduntil < now()
              THEN null
              ELSE rolpassword::text
          END
      FROM pg_authid
      WHERE rolname=$1 and rolcanlogin;
  END;
  $_$;


--
-- Name: advance_business_courier_dispatch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.advance_business_courier_dispatch() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_order_id uuid;
  v_open_count integer;
  v_advanced integer := 0;
BEGIN
  FOR v_order_id IN
    UPDATE public.business_courier_offers AS offer
       SET status = 'expired',
           resolved_at = clock_timestamp(),
           updated_at = clock_timestamp()
     WHERE offer.status = 'offered'
       AND offer.expires_at <= clock_timestamp()
     RETURNING offer.order_id
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.business_courier_offers AS still_open
       WHERE still_open.order_id = v_order_id
         AND still_open.status = 'offered'
         AND still_open.expires_at > clock_timestamp()
    ) THEN
      v_open_count := public.dispatch_business_courier_order(v_order_id, false);
      v_advanced := v_advanced + v_open_count;
    END IF;
  END LOOP;

  RETURN v_advanced;
END;
$$;


--
-- Name: ai_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ai_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: append_migration_179_countdown(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.append_migration_179_countdown(p_layout jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $_$
BEGIN
  IF p_layout IS NULL OR jsonb_typeof(p_layout) IS DISTINCT FROM 'object' THEN
    RETURN p_layout;
  END IF;

  IF jsonb_typeof(p_layout -> 'layout_blocks') IS DISTINCT FROM 'array' THEN
    RETURN p_layout;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_layout -> 'layout_blocks') AS item(value)
    WHERE item.value ->> 'type' = 'countdown'
  ) THEN
    RETURN p_layout;
  END IF;

  RETURN jsonb_set(
    p_layout,
    '{layout_blocks}',
    (p_layout -> 'layout_blocks') || jsonb_build_array(jsonb_build_object(
      'id', 'migration-179-countdown',
      'type', 'countdown',
      'content', jsonb_build_object('targetDate', jsonb_build_object('$bind', 'eventDate'))
    )),
    true
  );
END;
$_$;


--
-- Name: apply_agent_memory(uuid, boolean, text, uuid, uuid, text, text, text, timestamp with time zone, text, uuid, uuid, uuid, uuid, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_agent_memory(p_approval_id uuid, p_require_approval boolean, p_op text, p_tenant_id uuid, p_agent_id uuid, p_fact_key text, p_fact_value text, p_next_status text, p_expires_at timestamp with time zone, p_source text, p_proposer_agent uuid, p_run_id uuid, p_task_id uuid, p_approver uuid, p_now timestamp with time zone, p_expected_version integer) RETURNS TABLE(applied boolean, fact_id uuid, version integer, reason text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_action     text;
  v_status     text;
  v_audit      text;
  v_fact_id    uuid;
  v_cur_ver    integer;
  v_cur_status text;
  v_updated    integer;
  v_stamped    integer;
BEGIN
  -- Fail-closed parameter validation (mirrors app-side validation).
  IF p_op NOT IN ('CREATE','UPDATE','REVOKE','EXPIRE') THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'bad op'; RETURN;
  END IF;
  IF p_next_status NOT IN ('active','revoked','expired') THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'bad status'; RETURN;
  END IF;
  IF p_source NOT IN ('human','system','agent-proposed') THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'bad source'; RETURN;
  END IF;
  IF char_length(p_fact_key) NOT BETWEEN 1 AND 120 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'bad key'; RETURN;
  END IF;
  IF (p_op = 'CREATE' OR p_op = 'UPDATE') AND (p_fact_value IS NULL OR char_length(p_fact_value) NOT BETWEEN 1 AND 4000) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'bad value'; RETURN;
  END IF;
  IF p_expected_version IS NULL OR p_expected_version < 0 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'bad version'; RETURN;
  END IF;

  -- 1. Approval gate (locked): approved memory_propose, unclaimed.
  -- An already-stamped approval is a benign re-entry: report the fact it
  -- produced (via the approval_id linkage) instead of re-applying.
  -- Anything else non-null means a previous decision stands: do not touch.
  IF p_require_approval THEN
    SELECT a.action, a.status, a.audit_ref INTO v_action, v_status, v_audit
    FROM approvals a WHERE a.id = p_approval_id FOR UPDATE;
    IF NOT FOUND OR v_action <> 'memory_propose' OR v_status <> 'approved' THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'not appliable'; RETURN;
    END IF;
    IF v_audit IS NOT NULL AND v_audit <> 'exec-invalid-envelope' THEN
      IF v_audit LIKE 'memory:applied:%' THEN
        SELECT m.id, m.version INTO v_fact_id, v_cur_ver
        FROM agent_memory m WHERE m.approval_id = p_approval_id
        ORDER BY m.version DESC LIMIT 1;
        IF FOUND THEN
          RETURN QUERY SELECT true, v_fact_id, v_cur_ver, 'already applied'; RETURN;
        END IF;
        RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'already applied (fact missing)'; RETURN;
      END IF;
      RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'previously decided'; RETURN;
    END IF;
  END IF;

  -- Conflict helper: stamp once (conditional) so pollers never re-spin.
  -- Inline at each site (plpgsql has no local procedures pre-14... kept
  -- explicit for clarity).

  -- 2. Resolve current fact (locked; NULL-safe identity match).
  SELECT m.id, m.version, m.status INTO v_fact_id, v_cur_ver, v_cur_status
  FROM agent_memory m
  WHERE m.fact_key = p_fact_key
    AND m.tenant_id IS NOT DISTINCT FROM p_tenant_id
    AND m.agent_id IS NOT DISTINCT FROM p_agent_id
  FOR UPDATE;

  -- 3. Fact write (version-guarded; CREATE collides on F-1 indexes).
  IF p_op = 'CREATE' THEN
    IF FOUND THEN
      IF p_require_approval THEN
        UPDATE approvals SET audit_ref = 'memory-version-conflict'
        WHERE id = p_approval_id AND (audit_ref IS NULL OR audit_ref = 'exec-invalid-envelope');
      END IF;
      RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'fact already exists'; RETURN;
    END IF;
    IF p_expected_version <> 0 THEN
      IF p_require_approval THEN
        UPDATE approvals SET audit_ref = 'memory-version-conflict'
        WHERE id = p_approval_id AND (audit_ref IS NULL OR audit_ref = 'exec-invalid-envelope');
      END IF;
      RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'CREATE requires base 0'; RETURN;
    END IF;
    BEGIN
      INSERT INTO agent_memory
        (tenant_id, agent_id, fact_key, fact_value, status, version, source,
         proposed_by_agent_id, proposed_run_id, proposed_task_id,
         approved_by, approved_at, approval_id, effective_at, expires_at)
      VALUES
        (p_tenant_id, p_agent_id, p_fact_key, p_fact_value, 'active', 1, p_source,
         p_proposer_agent, p_run_id, p_task_id,
         p_approver, p_now, p_approval_id, p_now, p_expires_at)
      RETURNING id INTO v_fact_id;
    EXCEPTION WHEN unique_violation THEN
      IF p_require_approval THEN
        UPDATE approvals SET audit_ref = 'memory-version-conflict'
        WHERE id = p_approval_id AND (audit_ref IS NULL OR audit_ref = 'exec-invalid-envelope');
      END IF;
      RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'duplicate fact (race)'; RETURN;
    END;
    v_cur_ver := 1;
  ELSE
    IF NOT FOUND THEN
      IF p_require_approval THEN
        UPDATE approvals SET audit_ref = 'memory-version-conflict'
        WHERE id = p_approval_id AND (audit_ref IS NULL OR audit_ref = 'exec-invalid-envelope');
      END IF;
      RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'no current fact'; RETURN;
    END IF;
    IF v_cur_ver <> p_expected_version THEN
      IF p_require_approval THEN
        UPDATE approvals SET audit_ref = 'memory-version-conflict'
        WHERE id = p_approval_id AND (audit_ref IS NULL OR audit_ref = 'exec-invalid-envelope');
      END IF;
      RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'stale base version'; RETURN;
    END IF;
    UPDATE agent_memory SET
      fact_value  = COALESCE(p_fact_value, fact_value),
      status      = p_next_status,
      version     = v_cur_ver + 1,
      expires_at  = p_expires_at,
      approval_id = COALESCE(p_approval_id, approval_id),
      effective_at = p_now
    WHERE id = v_fact_id AND version = v_cur_ver;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      IF p_require_approval THEN
        UPDATE approvals SET audit_ref = 'memory-version-conflict'
        WHERE id = p_approval_id AND (audit_ref IS NULL OR audit_ref = 'exec-invalid-envelope');
      END IF;
      RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'lost version race'; RETURN;
    END IF;
    v_cur_ver := v_cur_ver + 1;
  END IF;

  -- 4. History (same transaction — failure rolls back the fact write).
  INSERT INTO agent_memory_versions
    (fact_id, version, fact_value, status, expires_at, approval_id,
     proposed_by_agent_id, proposed_run_id, proposed_task_id,
     approved_by, approved_at)
  SELECT v_fact_id, v_cur_ver, fact_value, status, expires_at, p_approval_id,
         p_proposer_agent, p_run_id, p_task_id, p_approver, p_now
  FROM agent_memory WHERE id = v_fact_id;

  -- 5. Approval stamp (conditional — a lost race rolls everything back).
  IF p_require_approval THEN
    UPDATE approvals SET audit_ref = 'memory:applied:' || v_fact_id || ':v' || v_cur_ver
    WHERE id = p_approval_id AND (audit_ref IS NULL OR audit_ref = 'exec-invalid-envelope');
    GET DIAGNOSTICS v_stamped = ROW_COUNT;
    IF v_stamped = 0 THEN
      RAISE EXCEPTION 'approval stamp lost race';
    END IF;
  END IF;

  RETURN QUERY SELECT true, v_fact_id, v_cur_ver, 'applied';
END;
$$;


--
-- Name: apply_promo_use(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_promo_use(p_code_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  applied BOOLEAN := false;
BEGIN
  UPDATE public.promo_codes
  SET used_count = used_count + 1
  WHERE id = p_code_id
    AND is_active = true
    AND (max_uses IS NULL OR used_count < max_uses)
  RETURNING true INTO applied;
  RETURN COALESCE(applied, false);
END;
$$;


--
-- Name: assign_seat_to_invitation_atomic(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_seat_to_invitation_atomic(p_event_id uuid, p_invitation_id uuid, p_seat_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_seat RECORD;
  v_invitation RECORD;
  v_inst RECORD;
  v_seat_label TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Lock and verify seat
  SELECT id, event_id, section, row_label, seat_number, table_number, table_name, status, reserved_until, assigned_invitation_id
  INTO v_seat
  FROM seats
  WHERE id = p_seat_id
  FOR UPDATE;

  IF v_seat IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Seat not found.');
  END IF;

  IF v_seat.event_id <> p_event_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event isolation violation: seat belongs to another event.');
  END IF;

  IF v_seat.status = 'sold' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Seat is already sold to a ticket buyer.');
  END IF;

  IF v_seat.status = 'unavailable' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Seat is marked unavailable.');
  END IF;

  IF v_seat.status = 'reserved' AND v_seat.reserved_until IS NOT NULL AND v_seat.reserved_until > v_now THEN
    RETURN jsonb_build_object('success', false, 'error', 'Seat is currently reserved for an active purchase session.');
  END IF;

  IF v_seat.assigned_invitation_id IS NOT NULL AND v_seat.assigned_invitation_id <> p_invitation_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Seat is already assigned to another guest.');
  END IF;

  -- 2. Lock and verify invitation
  SELECT id, event_id, guest_name, invitation_status
  INTO v_invitation
  FROM event_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF v_invitation IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation not found.');
  END IF;

  IF v_invitation.event_id <> p_event_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event isolation violation: invitation belongs to another event.');
  END IF;

  IF v_invitation.invitation_status IN ('cancelled', 'revoked', 'expired') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot assign seat to a ' || v_invitation.invitation_status || ' invitation.');
  END IF;

  -- 3. Check if guest is already checked in
  SELECT id, status INTO v_inst
  FROM ticket_instances
  WHERE invitation_id = p_invitation_id;

  IF v_inst IS NOT NULL AND v_inst.status = 'used' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot reassign seat for a guest who has already checked in.');
  END IF;

  -- 4. Construct descriptive label
  IF v_seat.table_number IS NOT NULL AND v_seat.table_number <> '' THEN
    IF v_seat.table_name IS NOT NULL AND v_seat.table_name <> '' THEN
      v_seat_label := 'Table ' || v_seat.table_number || ' (' || v_seat.table_name || '), Seat ' || v_seat.seat_number;
    ELSE
      v_seat_label := 'Table ' || v_seat.table_number || ', Seat ' || v_seat.seat_number;
    END IF;
  ELSE
    v_seat_label := v_seat.section || ', Row ' || v_seat.row_label || ', Seat ' || v_seat.seat_number;
  END IF;

  -- 5. Clear any prior seat assigned to this invitation
  UPDATE seats
  SET assigned_invitation_id = NULL
  WHERE event_id = p_event_id
    AND assigned_invitation_id = p_invitation_id
    AND id <> p_seat_id;

  -- 6. Assign target seat
  UPDATE seats
  SET assigned_invitation_id = p_invitation_id
  WHERE id = p_seat_id;

  -- 7. Sync linked ticket_instances record
  UPDATE ticket_instances
  SET seat_id = p_seat_id,
      seat_label = v_seat_label,
      updated_at = v_now
  WHERE invitation_id = p_invitation_id;

  RETURN jsonb_build_object(
    'success', true,
    'seat_id', p_seat_id,
    'seat_label', v_seat_label
  );
END;
$$;


--
-- Name: beneficiary_slugify(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.beneficiary_slugify(p_name text, p_seed uuid) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT
    coalesce(
      nullif(
        -- lower() BEFORE the character class, which is the bug migration_49
        -- had to repair on organizers. Trailing/leading dashes trimmed.
        trim(both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g')),
        ''
      ),
      'beneficiary'
    )
    || '-' || substr(md5(p_seed::text || random()::text), 1, 8);
$$;


--
-- Name: can_create_fundraiser_for_organizer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_create_fundraiser_for_organizer(p_organizer_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM organizers
    WHERE organizers.id = p_organizer_id
      AND (
        organizers.user_id = auth.uid()
        OR is_entity_member(p_organizer_id, ARRAY['owner','admin','manager','editor'])
      )
  );
$$;


--
-- Name: cancel_payout(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_payout(p_payout_id uuid, p_cancelled_by uuid) RETURNS TABLE(payout_id uuid, status text, reversal_ledger_entry_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_recipient_id UUID;
  v_amount NUMERIC;
  v_currency TEXT;
  v_current_status TEXT;
  v_existing_reversal_id UUID;
  v_reversal_id UUID;
BEGIN
  -- Lock payout row
  SELECT payouts.recipient_id, payouts.amount, payouts.currency, payouts.status
  INTO v_recipient_id, v_amount, v_currency, v_current_status
  FROM payouts
  WHERE payouts.id = p_payout_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'cancel_payout: payout % not found', p_payout_id;
  END IF;

  -- Idempotency check: if already cancelled, return existing reversal entry
  IF v_current_status = 'cancelled' THEN
    SELECT recipient_ledger_entries.id INTO v_existing_reversal_id
    FROM recipient_ledger_entries
    WHERE recipient_ledger_entries.source_type = 'payout'
      AND recipient_ledger_entries.source_id = p_payout_id
      AND recipient_ledger_entries.entry_type = 'adjustment';

    RETURN QUERY SELECT p_payout_id, 'cancelled'::TEXT, v_existing_reversal_id;
    RETURN;
  END IF;

  IF v_current_status <> 'requested' THEN
    RAISE EXCEPTION 'cancel_payout: payout % is in status % (can only cancel from requested status)',
      p_payout_id, v_current_status;
  END IF;

  -- Lock recipient row
  PERFORM 1 FROM recipients WHERE recipients.id = v_recipient_id FOR UPDATE;

  -- Update payout status
  UPDATE payouts
  SET
    status = 'cancelled',
    processed_by = COALESCE(p_cancelled_by, payouts.processed_by),
    updated_at = now()
  WHERE payouts.id = p_payout_id;

  -- Insert single compensating credit adjustment
  INSERT INTO recipient_ledger_entries (
    recipient_id,
    entry_type,
    amount,
    currency,
    source_type,
    source_id,
    external_reference,
    description,
    created_by
  ) VALUES (
    v_recipient_id,
    'adjustment',
    v_amount,
    v_currency,
    'payout',
    p_payout_id,
    p_payout_id::text,
    'Reversal for cancelled payout',
    p_cancelled_by
  ) RETURNING recipient_ledger_entries.id INTO v_reversal_id;

  RETURN QUERY SELECT p_payout_id, 'cancelled'::TEXT, v_reversal_id;
END;
$$;


--
-- Name: cascade_ticket_order_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cascade_ticket_order_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status IN ('refunded', 'cancelled') AND OLD.status <> NEW.status THEN
    UPDATE ticket_instances
    SET status = NEW.status,
        updated_at = NOW()
    WHERE order_id = NEW.id
      AND status = 'valid';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: check_email_pending_deletion(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_email_pending_deletion(p_email text) RETURNS TABLE(pending_id uuid, purge_date timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, p.purge_at
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE u.email = p_email
    AND p.deleted_at IS NOT NULL
    AND p.purge_at > now();
END;
$$;


--
-- Name: check_in_ticket(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_in_ticket(p_ticket_instance_id uuid, p_scanned_by_user_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_updated_id UUID;
  v_event_id   UUID;
  v_order_id   UUID;
  v_current_status TEXT;
BEGIN
  -- Atomic gate: only one caller can transition status 'valid' → 'used'.
  -- Postgres row-level locking ensures a second concurrent caller blocks here
  -- until the first commits, then sees status = 'used' and falls through to
  -- the ALREADY_CHECKED_IN exception path. The INSERT below is only reached
  -- by the one successful caller.
  UPDATE ticket_instances
  SET status       = 'used',
      checked_in_at = NOW(),
      updated_at   = NOW()
  WHERE id     = p_ticket_instance_id
    AND status = 'valid'
  RETURNING id, event_id, order_id INTO v_updated_id, v_event_id, v_order_id;

  IF v_updated_id IS NOT NULL THEN
    -- Append-only audit insert. No ON CONFLICT: if a duplicate somehow
    -- occurs it should raise, not be silently swallowed.
    INSERT INTO ticket_checkins (ticket_instance_id, ticket_order_id, event_id, scanned_by_user_id, checked_in_at)
    VALUES (v_updated_id, v_order_id, v_event_id, p_scanned_by_user_id, NOW());

    RETURN v_updated_id;
  END IF;

  -- No row updated — check why and throw the specific exception.
  SELECT status INTO v_current_status
  FROM ticket_instances
  WHERE id = p_ticket_instance_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'TICKET_NOT_FOUND';
  ELSIF v_current_status = 'used' THEN
    RAISE EXCEPTION 'ALREADY_CHECKED_IN';
  ELSIF v_current_status = 'cancelled' THEN
    RAISE EXCEPTION 'TICKET_CANCELLED';
  ELSIF v_current_status = 'refunded' THEN
    RAISE EXCEPTION 'TICKET_REFUNDED';
  ELSE
    RAISE EXCEPTION 'TICKET_NOT_VALID';
  END IF;
END;
$$;


--
-- Name: check_menu_item_option_group_match(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_menu_item_option_group_match() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_item_organizer_id uuid;
  v_group_organizer_id uuid;
  v_group_kind text;
  v_count integer;
  v_option_id uuid;
  v_value jsonb;
BEGIN
  SELECT organizer_id INTO v_item_organizer_id
    FROM public.menu_items WHERE id = NEW.item_id FOR UPDATE;
  IF v_item_organizer_id IS NULL THEN
    RAISE EXCEPTION 'Menu item does not exist' USING ERRCODE = '23503';
  END IF;
  SELECT organizer_id, kind INTO v_group_organizer_id, v_group_kind
    FROM public.menu_option_groups WHERE id = NEW.group_id FOR UPDATE;
  IF v_group_organizer_id IS NULL THEN
    RAISE EXCEPTION 'Menu option group does not exist' USING ERRCODE = '23503';
  END IF;
  IF NEW.organizer_id <> v_item_organizer_id OR NEW.organizer_id <> v_group_organizer_id THEN
    RAISE EXCEPTION 'Menu item, option group, and assignment must share an organizer' USING ERRCODE = '23503';
  END IF;

  SELECT count(*) INTO v_count FROM public.menu_item_option_groups
    WHERE item_id = NEW.item_id AND id IS DISTINCT FROM NEW.id;
  IF v_count >= 8 THEN
    RAISE EXCEPTION 'A menu item can have at most 8 option groups' USING ERRCODE = '23514';
  END IF;
  IF v_group_kind = 'variant' AND EXISTS (
    SELECT 1
      FROM public.menu_item_option_groups a
      JOIN public.menu_option_groups g ON g.id = a.group_id
     WHERE a.item_id = NEW.item_id
       AND a.id IS DISTINCT FROM NEW.id
       AND g.kind = 'variant'
  ) THEN
    RAISE EXCEPTION 'A menu item can have at most one variant group' USING ERRCODE = '23514';
  END IF;

  IF cardinality(NEW.hidden_option_ids) > 20 THEN
    RAISE EXCEPTION 'At most 20 hidden option IDs are allowed' USING ERRCODE = '23514';
  END IF;
  FOREACH v_option_id IN ARRAY NEW.hidden_option_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.menu_options o WHERE o.id = v_option_id AND o.group_id = NEW.group_id) THEN
      RAISE EXCEPTION 'Hidden option must belong to the assigned group' USING ERRCODE = '23503';
    END IF;
  END LOOP;
  FOR v_option_id, v_value IN
    SELECT key::uuid, value FROM jsonb_each(NEW.price_overrides)
  LOOP
    IF jsonb_typeof(v_value) <> 'number' THEN
      RAISE EXCEPTION 'Price overrides must be numeric amounts from 0 through 999999.99' USING ERRCODE = '23514';
    END IF;
    IF (v_value #>> '{}')::numeric < 0 OR (v_value #>> '{}')::numeric > 999999.99 THEN
      RAISE EXCEPTION 'Price overrides must be numeric amounts from 0 through 999999.99' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.menu_options o WHERE o.id = v_option_id AND o.group_id = NEW.group_id) THEN
      RAISE EXCEPTION 'Price override option must belong to the assigned group' USING ERRCODE = '23503';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;


--
-- Name: check_menu_item_organizer_match(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_menu_item_organizer_match() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_section_organizer uuid;
BEGIN
  SELECT organizer_id INTO v_section_organizer FROM menu_sections WHERE id = NEW.section_id;
  IF v_section_organizer IS NULL THEN
    RAISE EXCEPTION 'Menu section does not exist' USING ERRCODE = '23503';
  END IF;
  IF NEW.organizer_id <> v_section_organizer THEN
    RAISE EXCEPTION 'menu_items.organizer_id must match menu_sections.organizer_id' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: check_menu_option_group_variant_reassignment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_menu_option_group_variant_reassignment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.kind = 'variant' AND EXISTS (
    SELECT 1 FROM public.menu_options
     WHERE group_id = NEW.id AND is_default = true
     GROUP BY group_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A variant group can have at most one default option' USING ERRCODE = '23514';
  END IF;
  IF NEW.kind = 'variant' AND EXISTS (
    SELECT 1
      FROM public.menu_item_option_groups assigned
      JOIN public.menu_item_option_groups other_assigned
        ON other_assigned.item_id = assigned.item_id
       AND other_assigned.id <> assigned.id
      JOIN public.menu_option_groups other_group ON other_group.id = other_assigned.group_id
     WHERE assigned.group_id = NEW.id
       AND other_group.kind = 'variant'
       AND other_group.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'A menu item can have at most one variant group' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: check_menu_option_organizer_match(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_menu_option_organizer_match() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_organizer_id uuid;
  v_count integer;
BEGIN
  SELECT organizer_id INTO v_organizer_id
    FROM public.menu_option_groups WHERE id = NEW.group_id FOR UPDATE;
  IF v_organizer_id IS NULL THEN
    RAISE EXCEPTION 'Menu option group does not exist' USING ERRCODE = '23503';
  END IF;
  IF NEW.organizer_id <> v_organizer_id THEN
    RAISE EXCEPTION 'menu_options.organizer_id must match menu_option_groups.organizer_id' USING ERRCODE = '23503';
  END IF;

  SELECT count(*) INTO v_count FROM public.menu_options
    WHERE group_id = NEW.group_id AND id IS DISTINCT FROM NEW.id;
  IF v_count >= 20 THEN
    RAISE EXCEPTION 'A menu option group can have at most 20 options' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: check_menu_option_variant_default(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_menu_option_variant_default() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_kind text;
BEGIN
  SELECT kind INTO v_kind
    FROM public.menu_option_groups
   WHERE id = NEW.group_id
   FOR UPDATE;
  IF v_kind = 'variant' AND NEW.is_default = true AND EXISTS (
    SELECT 1 FROM public.menu_options
     WHERE group_id = NEW.group_id
       AND is_default = true
       AND id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'A variant group can have at most one default option' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: check_menu_promotion_organizer_match(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_menu_promotion_organizer_match() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_organizer_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'promotions' THEN
    IF NEW.destination_item_id IS NOT NULL THEN
      SELECT organizer_id INTO v_organizer_id FROM public.menu_items WHERE id = NEW.destination_item_id;
      IF v_organizer_id IS NULL OR v_organizer_id <> NEW.organizer_id THEN
        RAISE EXCEPTION 'Promotion destination item must belong to the same organizer' USING ERRCODE = '23503';
      END IF;
    END IF;
    IF NEW.destination_section_id IS NOT NULL THEN
      SELECT organizer_id INTO v_organizer_id FROM public.menu_sections WHERE id = NEW.destination_section_id;
      IF v_organizer_id IS NULL OR v_organizer_id <> NEW.organizer_id THEN
        RAISE EXCEPTION 'Promotion destination section must belong to the same organizer' USING ERRCODE = '23503';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  SELECT organizer_id INTO v_organizer_id FROM public.promotions WHERE id = NEW.promotion_id FOR UPDATE;
  IF v_organizer_id IS NULL OR v_organizer_id <> NEW.organizer_id THEN
    RAISE EXCEPTION 'Promotion target must match its promotion organizer' USING ERRCODE = '23503';
  END IF;
  IF NEW.item_id IS NOT NULL THEN
    SELECT organizer_id INTO v_organizer_id FROM public.menu_items WHERE id = NEW.item_id;
    IF v_organizer_id IS NULL OR v_organizer_id <> NEW.organizer_id THEN
      RAISE EXCEPTION 'Promotion target item must belong to the same organizer' USING ERRCODE = '23503';
    END IF;
  END IF;
  IF NEW.section_id IS NOT NULL THEN
    SELECT organizer_id INTO v_organizer_id FROM public.menu_sections WHERE id = NEW.section_id;
    IF v_organizer_id IS NULL OR v_organizer_id <> NEW.organizer_id THEN
      RAISE EXCEPTION 'Promotion target section must belong to the same organizer' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF (TG_OP = 'INSERT' OR NEW.promotion_id IS DISTINCT FROM OLD.promotion_id) THEN
    IF (SELECT count(*) FROM public.promotion_targets WHERE promotion_id = NEW.promotion_id AND id IS DISTINCT FROM NEW.id) >= 50 THEN
      RAISE EXCEPTION 'A promotion can have at most 50 targets' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: check_rate_limit(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer) RETURNS TABLE(allowed boolean, remaining integer, retry_after integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_window_start timestamptz;
  v_count        integer;
BEGIN
  IF p_limit <= 0 OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'invalid rate limit parameters';
  END IF;

  -- Snap to the start of the current fixed window.
  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO rate_limits (bucket_key, window_start, request_count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  -- Opportunistic sweep so the table cannot grow without bound. Cheap and
  -- rarely fires; avoids needing another cron job.
  IF random() < 0.01 THEN
    DELETE FROM rate_limits WHERE window_start < now() - interval '24 hours';
  END IF;

  IF v_count > p_limit THEN
    RETURN QUERY SELECT
      false,
      0,
      GREATEST(
        1,
        ceil(extract(epoch FROM
          (v_window_start + make_interval(secs => p_window_seconds)) - now()
        ))::integer
      );
  ELSE
    RETURN QUERY SELECT true, (p_limit - v_count), 0;
  END IF;
END;
$$;


--
-- Name: claim_business_courier_offer(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_business_courier_offer(p_order_id uuid, p_worker_id uuid, p_history_entry jsonb) RETURNS TABLE(out_order_id uuid, out_business_id uuid, out_worker_id uuid, out_customer_name text, out_customer_phone text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_business_id uuid;
  v_worker_business_id uuid;
  v_worker_name text;
  v_worker_phone text;
  v_order_id uuid;
  v_customer_name text;
  v_customer_phone text;
  v_offer_id uuid;
  v_current_status text;
BEGIN
  IF p_order_id IS NULL OR p_worker_id IS NULL
     OR p_history_entry IS DISTINCT FROM '{"type":"courier_assigned"}'::jsonb THEN
    RETURN;
  END IF;

  SELECT o.business_id, o.status
    INTO v_business_id, v_current_status
    FROM public.orders AS o
   WHERE o.id = p_order_id
     AND o.status IN ('accepted', 'preparing', 'ready')
     AND o.fulfilment_type = 'delivery'
     AND o.estimated_ready_at IS NOT NULL
     AND o.courier_worker_id IS NULL
   FOR UPDATE OF o;
  IF v_business_id IS NULL THEN RETURN; END IF;

  SELECT w.business_id, w.full_name, w.phone
    INTO v_worker_business_id, v_worker_name, v_worker_phone
    FROM public.business_workers AS w
   WHERE w.id = p_worker_id
     AND w.business_id = v_business_id
     AND w.role = 'courier'
     AND w.is_active = true
     AND w.deactivated_at IS NULL
     AND w.is_available = true
     AND EXISTS (
       SELECT 1 FROM public.business_worker_invitations AS i
        WHERE i.worker_id = w.id AND i.accepted_at IS NOT NULL AND i.revoked_at IS NULL
     )
   FOR UPDATE OF w;
  IF v_worker_business_id IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders AS active_order
     WHERE active_order.courier_worker_id = p_worker_id
       AND active_order.status IN ('accepted', 'preparing', 'ready', 'picked_up', 'out_for_delivery')
  ) THEN RETURN; END IF;

  SELECT offer.id INTO v_offer_id
    FROM public.business_courier_offers AS offer
   WHERE offer.order_id = p_order_id
     AND offer.business_id = v_business_id
     AND offer.courier_worker_id = p_worker_id
     AND offer.status = 'offered'
     AND offer.expires_at > clock_timestamp()
   FOR UPDATE OF offer;
  IF v_offer_id IS NULL THEN RETURN; END IF;

  UPDATE public.orders AS o
     SET courier_worker_id = p_worker_id,
         rider_name = left(btrim(v_worker_name), 80),
         rider_phone = left(btrim(v_worker_phone), 32),
         updated_at = clock_timestamp()
   WHERE o.id = p_order_id
     AND o.business_id = v_business_id
     AND o.status = v_current_status
     AND o.courier_worker_id IS NULL
     AND EXISTS (
       SELECT 1 FROM public.business_courier_offers AS still_open
        WHERE still_open.order_id = o.id
          AND still_open.courier_worker_id = p_worker_id
          AND still_open.status = 'offered'
     )
  RETURNING o.id, o.business_id, o.customer_name, o.customer_phone
       INTO v_order_id, v_business_id, v_customer_name, v_customer_phone;
  IF v_order_id IS NULL THEN RETURN; END IF;

  UPDATE public.business_courier_offers
     SET status = 'taken', resolved_at = clock_timestamp(), updated_at = clock_timestamp()
   WHERE order_id = p_order_id AND status = 'offered';

  UPDATE public.business_courier_offers
     SET status = 'accepted', accepted_at = clock_timestamp(), resolved_at = clock_timestamp(), updated_at = clock_timestamp()
   WHERE id = v_offer_id AND status = 'taken';
  IF NOT FOUND THEN RAISE EXCEPTION 'COURIER_CLAIM_OFFER_RESOLUTION_FAILED'; END IF;

  UPDATE public.business_courier_offers
     SET status = 'withdrawn', resolved_at = clock_timestamp(), updated_at = clock_timestamp()
   WHERE courier_worker_id = p_worker_id AND order_id <> p_order_id AND status = 'offered';

  RETURN QUERY
  SELECT o.id, o.business_id, p_worker_id, o.customer_name, o.customer_phone
    FROM public.orders AS o
   WHERE o.id = v_order_id
     AND o.status IN ('accepted', 'preparing', 'ready')
     AND o.courier_worker_id = p_worker_id;
END;
$$;


--
-- Name: cleanup_business_organizer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_business_organizer() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  target_org_id UUID := OLD.organizer_id;
  auto_created BOOLEAN;
BEGIN
  IF target_org_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT is_business_auto_created INTO auto_created
  FROM organizers WHERE id = target_org_id;

  IF auto_created IS NOT TRUE THEN
    RETURN OLD;
  END IF;

  IF EXISTS (SELECT 1 FROM businesses WHERE organizer_id = target_org_id)
     OR EXISTS (SELECT 1 FROM events WHERE organizer_id = target_org_id)
     OR EXISTS (SELECT 1 FROM articles WHERE organizer_id = target_org_id)
     OR EXISTS (SELECT 1 FROM fundraisers WHERE organizer_id = target_org_id)
     OR EXISTS (SELECT 1 FROM fundraiser_updates WHERE organizer_id = target_org_id)
     OR EXISTS (SELECT 1 FROM reviews WHERE organizer_id = target_org_id)
     OR EXISTS (SELECT 1 FROM eventbrite_sources WHERE organizer_id = target_org_id)
     OR EXISTS (
       SELECT 1 FROM entity_members
       WHERE organizer_id = target_org_id AND role <> 'owner'
     )
  THEN
    RETURN OLD;
  END IF;

  DELETE FROM organizers WHERE id = target_org_id;
  RETURN OLD;
END;
$$;


--
-- Name: cleanup_delivery_locations_on_terminal(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_delivery_locations_on_terminal() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status IN ('delivered', 'completed', 'cancelled')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- Retain only the final recorded location for delivery verification/audit
    WITH latest_loc AS (
      SELECT id FROM public.order_delivery_locations
      WHERE order_id = NEW.id
      ORDER BY recorded_at DESC
      LIMIT 1
    )
    DELETE FROM public.order_delivery_locations
    WHERE order_id = NEW.id
      AND id NOT IN (SELECT id FROM latest_loc);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: complete_payout(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_payout(p_payout_id uuid, p_external_payout_id text, p_processed_by uuid) RETURNS TABLE(payout_id uuid, status text, external_payout_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_current_status TEXT;
  v_current_ext_id TEXT;
  v_updated_id UUID;
  v_updated_status TEXT;
  v_updated_ext_id TEXT;
BEGIN
  SELECT payouts.status, payouts.external_payout_id
  INTO v_current_status, v_current_ext_id
  FROM payouts
  WHERE payouts.id = p_payout_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'complete_payout: payout % not found', p_payout_id;
  END IF;

  -- Idempotency check: if already completed, return cleanly
  IF v_current_status = 'completed' THEN
    IF p_external_payout_id IS NOT NULL AND v_current_ext_id IS DISTINCT FROM p_external_payout_id THEN
      RAISE EXCEPTION 'complete_payout: payout % is already completed with external ID %',
        p_payout_id, v_current_ext_id;
    END IF;
    RETURN QUERY SELECT p_payout_id, v_current_status, v_current_ext_id;
    RETURN;
  END IF;

  UPDATE payouts
  SET
    status = 'completed',
    external_payout_id = COALESCE(p_external_payout_id, payouts.external_payout_id),
    processed_by = COALESCE(p_processed_by, payouts.processed_by),
    updated_at = now()
  WHERE payouts.id = p_payout_id
    AND payouts.status IN ('requested', 'processing')
  RETURNING payouts.id, payouts.status, payouts.external_payout_id
  INTO v_updated_id, v_updated_status, v_updated_ext_id;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'complete_payout: cannot complete payout % in state %',
      p_payout_id, v_current_status;
  END IF;

  RETURN QUERY SELECT v_updated_id, v_updated_status, v_updated_ext_id;
END;
$$;


--
-- Name: consume_business_worker_invitation(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_business_worker_invitation(p_invitation_token_hash text, p_phone_last4 text, p_session_token_hash text) RETURNS TABLE(out_worker_id uuid, out_business_id uuid, out_kitchen_id uuid, out_role text, out_session_expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $_$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_invitation_id uuid;
  v_worker_id uuid;
  v_business_id uuid;
  v_kitchen_id uuid;
  v_role text;
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

  SELECT i.id, w.id, w.business_id, w.kitchen_id, w.role
    INTO v_invitation_id, v_worker_id, v_business_id, v_kitchen_id, v_role
    FROM public.business_worker_invitations AS i
    JOIN public.business_workers AS w ON w.id = i.worker_id
   WHERE i.token_hash = p_invitation_token_hash
     AND i.expires_at > v_now
     AND i.token_consumed_at IS NULL
     AND i.revoked_at IS NULL
     AND w.role IN ('cook', 'courier')
     AND (w.role <> 'cook' OR w.kitchen_id IS NOT NULL)
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
    worker_id, invitation_id, token_hash, created_at, expires_at,
    hard_expires_at, last_renewed_at, updated_at
  )
  VALUES (
    v_worker_id, v_invitation_id, p_session_token_hash, v_now,
    v_session_expires_at, v_now + interval '90 days', v_now, v_now
  );

  RETURN QUERY
  SELECT v_worker_id, v_business_id, v_kitchen_id, v_role, v_session_expires_at;
END;
$_$;


--
-- Name: courier_dispatch_offer_timeout(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.courier_dispatch_offer_timeout() RETURNS interval
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  SELECT make_interval(secs => COALESCE(
    (SELECT settings.offer_timeout_seconds
       FROM public.courier_dispatch_settings AS settings
      WHERE settings.id = 1),
    600
  )::double precision)
$$;


--
-- Name: create_website_from_template(uuid, uuid, text, text, text, jsonb, jsonb, jsonb, text, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_website_from_template(p_website_id uuid, p_tenant_id uuid, p_slug text, p_site_title text, p_site_tagline text, p_theme_config jsonb, p_header_config jsonb, p_footer_config jsonb, p_status text, p_metadata jsonb, p_pages jsonb, p_navigation jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_existing public.tenant_websites%ROWTYPE;
  v_request_id TEXT;
  v_page JSONB;
  v_inserted_website_id UUID;
  v_page_id UUID;
  v_title TEXT;
  v_slug TEXT;
  v_is_home BOOLEAN;
  v_status TEXT;
  v_blocks JSONB;
  v_sort_order INT;
BEGIN
  v_request_id := p_metadata->>'creationRequestId';

  -- Validate required fields (fail fast before attempting insert)
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant ID is required' USING ERRCODE = '23502';
  END IF;
  IF p_slug IS NULL OR btrim(p_slug) = '' THEN
    RAISE EXCEPTION 'Slug is required' USING ERRCODE = '23502';
  END IF;
  IF p_site_title IS NULL OR btrim(p_site_title) = '' THEN
    RAISE EXCEPTION 'Site title is required' USING ERRCODE = '23502';
  END IF;
  IF p_pages IS NULL OR jsonb_typeof(p_pages) != 'array' OR jsonb_array_length(p_pages) = 0 THEN
    RAISE EXCEPTION 'At least one page is required' USING ERRCODE = '23502';
  END IF;

  -- Atomic insert with ON CONFLICT as the race boundary for concurrent idempotency.
  -- If two identical requests race, the UNIQUE(tenant_id) constraint guarantees only one succeeds.
  INSERT INTO public.tenant_websites (
    id,
    tenant_id,
    slug,
    site_title,
    site_tagline,
    theme_config,
    header_config,
    footer_config,
    status,
    metadata
  ) VALUES (
    COALESCE(p_website_id, gen_random_uuid()),
    p_tenant_id,
    p_slug,
    p_site_title,
    p_site_tagline,
    COALESCE(p_theme_config, '{"theme":"default","primaryColor":"#ea580c","fontFamily":"sans","borderRadius":"xl","darkMode":false}'::jsonb),
    COALESCE(p_header_config, '{"showLogo":true,"showNav":true,"showCta":true,"ctaLabel":"Get in Touch","ctaHref":"/contact","sticky":true}'::jsonb),
    COALESCE(p_footer_config, '{"showSocials":true,"copyrightText":"","showPoweredBy":true,"customLinks":[]}'::jsonb),
    COALESCE(p_status, 'draft'),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (tenant_id) DO NOTHING
  RETURNING id INTO v_inserted_website_id;

  IF v_inserted_website_id IS NULL THEN
    -- Insert lost the race — fetch the winner and decide idempotency
    SELECT * INTO v_existing FROM public.tenant_websites WHERE tenant_id = p_tenant_id;
    IF FOUND THEN
      IF v_request_id IS NOT NULL AND v_existing.metadata->>'creationRequestId' = v_request_id THEN
        RETURN jsonb_build_object(
          'website_id', v_existing.id,
          'slug', v_existing.slug,
          'idempotent', true
        );
      ELSE
        RAISE EXCEPTION 'Website already exists for tenant %', p_tenant_id USING ERRCODE = '23505';
      END IF;
    ELSE
      -- Should not happen — conflict but no row found
      RAISE EXCEPTION 'Website already exists for tenant %', p_tenant_id USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Insert pages atomically
  FOR v_page IN SELECT * FROM jsonb_array_elements(p_pages)
  LOOP
    v_page_id := COALESCE((v_page->>'id')::UUID, gen_random_uuid());
    v_title := v_page->>'title';
    v_slug := v_page->>'slug';
    v_is_home := COALESCE((v_page->>'is_home')::BOOLEAN, false);
    v_status := COALESCE(v_page->>'status', 'draft');
    v_blocks := COALESCE(v_page->'blocks', '[]'::jsonb);
    v_sort_order := COALESCE((v_page->>'sort_order')::INT, 0);

    IF v_title IS NULL OR btrim(v_title) = '' THEN
      RAISE EXCEPTION 'Page title is required for page %', v_slug USING ERRCODE = '23502';
    END IF;
    IF v_slug IS NULL OR btrim(v_slug) = '' THEN
      RAISE EXCEPTION 'Page slug is required for page %', v_title USING ERRCODE = '23502';
    END IF;

    INSERT INTO public.website_pages (
      id,
      website_id,
      title,
      slug,
      is_home,
      status,
      blocks,
      sort_order
    ) VALUES (
      v_page_id,
      v_inserted_website_id,
      v_title,
      v_slug,
      v_is_home,
      v_status,
      v_blocks,
      v_sort_order
    );

    -- Create initial draft state for this page (existing architecture)
    INSERT INTO public.website_page_drafts (page_id, blocks, version)
    VALUES (v_page_id, v_blocks, 1)
    ON CONFLICT (page_id) DO NOTHING;
  END LOOP;

  -- Insert navigation
  INSERT INTO public.website_navigation (website_id, items)
  VALUES (v_inserted_website_id, COALESCE(p_navigation, '[]'::jsonb));

  RETURN jsonb_build_object(
    'website_id', v_inserted_website_id,
    'slug', p_slug,
    'idempotent', false
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;


--
-- Name: FUNCTION create_website_from_template(p_website_id uuid, p_tenant_id uuid, p_slug text, p_site_title text, p_site_tagline text, p_theme_config jsonb, p_header_config jsonb, p_footer_config jsonb, p_status text, p_metadata jsonb, p_pages jsonb, p_navigation jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_website_from_template(p_website_id uuid, p_tenant_id uuid, p_slug text, p_site_title text, p_site_tagline text, p_theme_config jsonb, p_header_config jsonb, p_footer_config jsonb, p_status text, p_metadata jsonb, p_pages jsonb, p_navigation jsonb) IS 'Atomic creation of tenant website + pages + navigation + drafts. Idempotent via tenant_id UNIQUE + metadata.creationRequestId.';


--
-- Name: decline_business_courier_offer(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decline_business_courier_offer(p_order_id uuid, p_worker_id uuid, p_message text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF p_order_id IS NULL OR p_worker_id IS NULL
     OR char_length(btrim(COALESCE(p_message, ''))) > 300 THEN
    RETURN false;
  END IF;

  SELECT o.business_id INTO v_business_id
    FROM public.orders AS o
   WHERE o.id = p_order_id
     AND o.status IN ('accepted', 'preparing', 'ready')
     AND o.fulfilment_type = 'delivery'
     AND o.courier_worker_id IS NULL
   FOR UPDATE OF o;
  IF v_business_id IS NULL THEN RETURN false; END IF;

  UPDATE public.business_courier_offers AS offer
     SET status = 'declined',
         decline_message = NULLIF(btrim(p_message), ''),
         declined_at = clock_timestamp(),
         resolved_at = clock_timestamp(),
         updated_at = clock_timestamp()
   WHERE offer.order_id = p_order_id
     AND offer.business_id = v_business_id
     AND offer.courier_worker_id = p_worker_id
     AND offer.status = 'offered'
     AND offer.expires_at > clock_timestamp();
  RETURN FOUND;
END;
$$;


--
-- Name: dispatch_business_courier_order(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispatch_business_courier_order(p_order_id uuid, p_reoffer boolean DEFAULT false) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_business_id uuid;
  v_open_count integer := 0;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT o.business_id
    INTO v_business_id
    FROM public.orders AS o
   WHERE o.id = p_order_id
     AND o.fulfilment_type = 'delivery'
     AND o.status IN ('accepted', 'preparing', 'ready')
     AND o.estimated_ready_at IS NOT NULL
     AND o.courier_worker_id IS NULL
   FOR UPDATE OF o;

  IF v_business_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Repeated order edits and trigger invocations must not open another cohort
  -- while the current one still has time to respond. A manager retry explicitly
  -- reopens the current cohort below.
  IF COALESCE(p_reoffer, false) = false THEN
    SELECT count(*)::integer
      INTO v_open_count
      FROM public.business_courier_offers AS offer
     WHERE offer.order_id = p_order_id
       AND offer.business_id = v_business_id
       AND offer.status = 'offered'
       AND offer.expires_at > clock_timestamp();
    IF v_open_count > 0 THEN
      RETURN v_open_count;
    END IF;
  ELSE
    SELECT count(*)::integer
      INTO v_open_count
      FROM public.business_courier_offers AS offer
     WHERE offer.order_id = p_order_id
       AND offer.business_id = v_business_id
       AND offer.status = 'offered'
       AND offer.expires_at > clock_timestamp();
    IF v_open_count > 0 THEN
      RAISE EXCEPTION 'COURIER_DISPATCH_BATCH_STILL_OPEN';
    END IF;

    UPDATE public.business_courier_offers
       SET status = 'withdrawn',
           resolved_at = clock_timestamp(),
           updated_at = clock_timestamp()
     WHERE order_id = p_order_id
       AND business_id = v_business_id
       AND status = 'offered';
  END IF;

  INSERT INTO public.business_courier_offers AS existing_offer (
    order_id, business_id, courier_worker_id, status, expires_at
  )
  SELECT order_row.id, order_row.business_id, worker_row.id, 'offered'
    FROM public.business_workers AS worker_row
    JOIN public.orders AS order_row
      ON order_row.id = p_order_id AND order_row.business_id = worker_row.business_id
   WHERE worker_row.business_id = v_business_id
     AND worker_row.role = 'courier'
     AND worker_row.is_active = true
     AND worker_row.deactivated_at IS NULL
     AND worker_row.is_available = true
     AND EXISTS (
       SELECT 1
         FROM public.business_worker_invitations AS accepted_invitation
        WHERE accepted_invitation.worker_id = worker_row.id
          AND accepted_invitation.accepted_at IS NOT NULL
          AND accepted_invitation.revoked_at IS NULL
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.orders AS active_order
        WHERE active_order.courier_worker_id = worker_row.id
          AND active_order.status IN ('accepted', 'preparing', 'ready', 'picked_up', 'out_for_delivery')
     )
     AND (
       p_reoffer OR NOT EXISTS (
         SELECT 1 FROM public.business_courier_offers AS prior_offer
          WHERE prior_offer.order_id = order_row.id
            AND prior_offer.courier_worker_id = worker_row.id
            AND prior_offer.status <> 'withdrawn'
       )
     )
   ORDER BY worker_row.id
   LIMIT 5
   FOR UPDATE OF worker_row
  ON CONFLICT (order_id, courier_worker_id) DO UPDATE
    SET status = 'offered',
        offered_at = clock_timestamp(),
        expires_at = clock_timestamp() + public.courier_dispatch_offer_timeout(),
        accepted_at = NULL,
        declined_at = NULL,
        decline_message = NULL,
        resolved_at = NULL,
        updated_at = clock_timestamp()
  WHERE existing_offer.status = 'withdrawn'
     OR (p_reoffer AND existing_offer.status IN ('declined', 'expired'));

  SELECT count(*)::integer
    INTO v_open_count
    FROM public.business_courier_offers AS offer
   WHERE offer.order_id = p_order_id
     AND offer.business_id = v_business_id
     AND offer.status = 'offered'
     AND offer.expires_at > clock_timestamp();

  RETURN v_open_count;
END;
$$;


--
-- Name: dispatch_pending_deliveries_after_courier_completion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispatch_pending_deliveries_after_courier_completion() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_order_id uuid;
BEGIN
  IF OLD.status NOT IN ('picked_up', 'out_for_delivery')
     OR NEW.status <> 'delivered'
     OR OLD.courier_worker_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_order_id IN
    SELECT pending_order.id
      FROM public.orders AS pending_order
     WHERE pending_order.business_id = NEW.business_id
       AND pending_order.status IN ('accepted', 'preparing')
       AND pending_order.fulfilment_type = 'delivery'
       AND pending_order.estimated_ready_at IS NOT NULL
       AND pending_order.courier_worker_id IS NULL
     ORDER BY pending_order.created_at, pending_order.id
  LOOP
    PERFORM public.dispatch_business_courier_order(v_order_id, false);
  END LOOP;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_article_status_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_article_status_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  ) INTO is_admin_user;

  is_admin_user := is_admin_user OR auth.role() = 'service_role';

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  -- DEC-0016: Non-admin authors and editors may publish articles directly.
  IF NEW.status NOT IN ('draft', 'pending_review', 'scheduled', 'archived', 'published') THEN
    RAISE EXCEPTION 'Only an admin can set article status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_business_status_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_business_status_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  ) INTO is_admin_user;

  is_admin_user := is_admin_user OR auth.role() = 'service_role';

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  -- DEC-0016: Non-admin owners and managers may publish businesses directly.
  IF NEW.status NOT IN ('pending_review', 'archived', 'published') THEN
    RAISE EXCEPTION 'Only an admin can set business status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_channel_asset_tenant_match(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_channel_asset_tenant_match() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  parent_tenant UUID;
BEGIN
  SELECT tenant_id INTO parent_tenant
  FROM connected_accounts WHERE id = NEW.connected_account_id;
  IF parent_tenant IS NULL OR parent_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'channel_assets.tenant_id must equal parent connected_accounts.tenant_id';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: enforce_conversation_link_tenant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_conversation_link_tenant() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  linked_tenant UUID;
BEGIN
  IF NEW.channel_asset_id IS NOT NULL THEN
    SELECT tenant_id INTO linked_tenant
    FROM channel_assets WHERE id = NEW.channel_asset_id;
    IF linked_tenant IS NULL OR linked_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'conversations.channel_asset_id must belong to the same tenant';
    END IF;
  END IF;

  IF NEW.customer_identity_id IS NOT NULL THEN
    SELECT tenant_id INTO linked_tenant
    FROM customer_identities WHERE id = NEW.customer_identity_id;
    IF linked_tenant IS NULL OR linked_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'conversations.customer_identity_id must belong to the same tenant';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_fundraiser_status_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_fundraiser_status_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW; -- no status change in this UPDATE — nothing to enforce
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  ) INTO is_admin_user;

  -- Only a genuine service-role connection bypasses the admin check (the
  -- admin approve/reject route, which checks isAdmin() in app code before
  -- writing). Same standing risk as migration_38: this trigger only stops
  -- authenticated non-admin users from self-approving; it trusts every
  -- service-role write to have been authorized upstream.
  is_admin_user := is_admin_user OR auth.role() = 'service_role';

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  -- Non-admins may only (re)submit for review — e.g. resubmit a rejected
  -- campaign — never move it to 'published' or 'rejected' themselves.
  IF NEW.status NOT IN ('pending_review') THEN
    RAISE EXCEPTION 'Only an admin can set fundraiser status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_homepage_promotion_moderation_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_homepage_promotion_moderation_fields() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  -- Check if any moderation-guarded column is changing
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.priority IS DISTINCT FROM OLD.priority
     OR (OLD.is_visible = false AND NEW.is_visible = true)
  THEN
    SELECT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
    ) INTO is_admin_user;
    is_admin_user := is_admin_user OR auth.role() = 'service_role';
    IF NOT is_admin_user THEN
      RAISE EXCEPTION 'Only an admin can modify promotion moderation fields (approved_by, priority, is_visible)';
    END IF;
  END IF;

  -- approved_by, when set, must be an admin user (or service_role null check skipped)
  -- Enforced in app API as well; trigger is defense-in-depth.
  RETURN NEW;
END;
$$;


--
-- Name: enforce_homepage_promotion_status_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_homepage_promotion_status_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  ) INTO is_admin_user;

  -- Only genuine service_role bypasses admin check (admin approve routes via supabaseAdmin).
  -- auth.role() = 'service_role' is the hardened gate from migration_105.
  is_admin_user := is_admin_user OR auth.role() = 'service_role';

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  -- Non-admins may only move between draft <-> pending_review and to archived (self-withdraw).
  -- They may never set active/expired themselves.
  IF NEW.status IN ('draft', 'pending_review', 'archived') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only an admin can set promotion status to %', NEW.status;
END;
$$;


--
-- Name: enforce_message_tenant_match(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_message_tenant_match() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  parent_tenant UUID;
BEGIN
  SELECT tenant_id INTO parent_tenant
  FROM conversations WHERE id = NEW.conversation_id;
  IF parent_tenant IS NULL OR parent_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'messages.tenant_id must equal parent conversations.tenant_id';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: enforce_organizer_capability_columns(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_organizer_capability_columns() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.verified_at IS NOT DISTINCT FROM OLD.verified_at
     AND NEW.payment_enabled IS NOT DISTINCT FROM OLD.payment_enabled
     AND NEW.payment_enabled_at IS NOT DISTINCT FROM OLD.payment_enabled_at
     AND NEW.fundraising_approved IS NOT DISTINCT FROM OLD.fundraising_approved
     AND NEW.fundraising_approved_at IS NOT DISTINCT FROM OLD.fundraising_approved_at
  THEN
    RETURN NEW; -- none of the guarded columns are changing in this UPDATE
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  ) INTO is_admin_user;

  -- Only a genuine service-role connection bypasses the admin check. Every
  -- admin write to organizers already goes through supabaseAdmin (role =
  -- 'service_role') — confirmed by reading
  -- app/api/admin/organizers/[id]/route.ts.
  is_admin_user := is_admin_user OR auth.role() = 'service_role';

  IF NOT is_admin_user THEN
    RAISE EXCEPTION 'Only an admin can change organizer verification/capability fields';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_payout_status_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_payout_status_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Terminal states cannot transition to anything
  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'payouts: payout % is completed (terminal state) and cannot change status to %', OLD.id, NEW.status;
  ELSIF OLD.status = 'failed' THEN
    RAISE EXCEPTION 'payouts: payout % is failed (terminal state) and cannot change status to %', OLD.id, NEW.status;
  ELSIF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'payouts: payout % is cancelled (terminal state) and cannot change status to %', OLD.id, NEW.status;
  END IF;

  -- Valid non-terminal transitions
  IF OLD.status = 'requested' AND NEW.status IN ('processing', 'completed', 'failed', 'cancelled') THEN
    RETURN NEW;
  ELSIF OLD.status = 'processing' AND NEW.status IN ('completed', 'failed') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'payouts: invalid status transition for payout % from % to %', OLD.id, OLD.status, NEW.status;
END;
$$;


--
-- Name: enforce_product_status_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_product_status_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  ) INTO is_admin_user;

  is_admin_user := is_admin_user OR auth.role() = 'service_role';

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  -- DEC-0016: Non-admin owners and managers may set product status to active directly.
  IF NEW.status IN ('pending_review', 'archived', 'active', 'out_of_stock') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only an admin can set product status to %', NEW.status;
END;
$$;


--
-- Name: enforce_website_page_publishing_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_website_page_publishing_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id UUID;
  is_manager_or_admin BOOLEAN := false;
BEGIN
  -- Service role / database superuser bypass
  IF current_user IN ('postgres', 'service_role', 'supabase_admin')
     OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Platform admin bypass
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  ) INTO is_manager_or_admin;

  IF is_manager_or_admin THEN
    RETURN NEW;
  END IF;

  -- Resolve tenant_id from tenant_websites
  SELECT tw.tenant_id INTO v_tenant_id
  FROM public.tenant_websites tw
  WHERE tw.id = NEW.website_id;

  IF v_tenant_id IS NOT NULL THEN
    is_manager_or_admin := public.is_entity_member(v_tenant_id, ARRAY['owner', 'admin', 'manager'])
      OR EXISTS (
        SELECT 1 FROM public.organizers
        WHERE organizers.id = v_tenant_id
          AND organizers.user_id = auth.uid()
      );
  END IF;

  -- On INSERT: only managers/owners can create directly with status='published'
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' AND NOT is_manager_or_admin THEN
      RAISE EXCEPTION 'Only owners, admins, and managers can publish website pages directly';
    END IF;
    RETURN NEW;
  END IF;

  -- On UPDATE: website_id is strictly immutable across websites/tenants
  IF TG_OP = 'UPDATE' THEN
    IF NEW.website_id IS DISTINCT FROM OLD.website_id THEN
      RAISE EXCEPTION 'Page website_id is immutable and cannot be moved across websites';
    END IF;

    IF NOT is_manager_or_admin THEN
      IF (NEW.blocks IS DISTINCT FROM OLD.blocks) THEN
        RAISE EXCEPTION 'Only owners, admins, and managers can publish live page blocks directly';
      END IF;
      IF (NEW.status IS DISTINCT FROM OLD.status) THEN
        RAISE EXCEPTION 'Only owners, admins, and managers can change page publication status';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: businesses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.businesses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text NOT NULL,
    industry text NOT NULL,
    category text NOT NULL,
    logo text,
    website text,
    email text,
    phone text,
    address text,
    city text,
    state text,
    country text,
    listing_tier text DEFAULT 'free'::text NOT NULL,
    status text DEFAULT 'pending_review'::text NOT NULL,
    is_flagged boolean DEFAULT false NOT NULL,
    stripe_price_id text,
    stripe_subscription_id text,
    current_period_end timestamp with time zone,
    seo_title text,
    seo_description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pre_approval_status_snapshot text,
    is_featured boolean DEFAULT false NOT NULL,
    rejection_reason text,
    organizer_id uuid,
    business_type text,
    screening_risk_score integer,
    screened_at timestamp with time zone,
    offerings text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT businesses_category_check CHECK ((char_length(TRIM(BOTH FROM category)) >= 2)),
    CONSTRAINT businesses_description_check CHECK ((char_length(TRIM(BOTH FROM description)) >= 20)),
    CONSTRAINT businesses_industry_check CHECK ((char_length(TRIM(BOTH FROM industry)) >= 2)),
    CONSTRAINT businesses_listing_tier_check CHECK ((listing_tier = ANY (ARRAY['free'::text, 'one_time'::text, 'subscription'::text]))),
    CONSTRAINT businesses_name_check CHECK (((char_length(TRIM(BOTH FROM name)) >= 3) AND (char_length(TRIM(BOTH FROM name)) <= 180))),
    CONSTRAINT businesses_offerings_key_format CHECK (((cardinality(offerings) = 0) OR (array_to_string(offerings, ','::text) ~ '^[a-z][a-z0-9_]{1,39}(,[a-z][a-z0-9_]{1,39})*$'::text))),
    CONSTRAINT businesses_offerings_max_20 CHECK ((cardinality(offerings) <= 20)),
    CONSTRAINT businesses_screening_risk_score_check CHECK (((screening_risk_score IS NULL) OR ((screening_risk_score >= 0) AND (screening_risk_score <= 100)))),
    CONSTRAINT businesses_seo_description_check CHECK (((seo_description IS NULL) OR (char_length(seo_description) <= 180))),
    CONSTRAINT businesses_seo_title_check CHECK (((seo_title IS NULL) OR (char_length(seo_title) <= 70))),
    CONSTRAINT businesses_slug_check CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text)),
    CONSTRAINT businesses_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'active'::text, 'rejected'::text, 'archived'::text])))
);


--
-- Name: COLUMN businesses.business_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.businesses.business_type IS 'Controlled taxonomy: Business Type/Subcategory via lib/business-taxonomy.ts BUSINESS_TYPES_BY_CATEGORY';


--
-- Name: COLUMN businesses.screening_risk_score; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.businesses.screening_risk_score IS 'Automated screening risk 0..100, set by service role via screenBusiness engine';


--
-- Name: COLUMN businesses.screened_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.businesses.screened_at IS 'When last screened';


--
-- Name: ensure_business_organizer(public.businesses); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_business_organizer(business_row public.businesses) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $_$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  attempt INT := 0;
  max_attempts CONSTANT INT := 1000;
  new_org_id UUID;
BEGIN
  base_slug := translate(
    lower(trim(business_row.name)),
    'àáâãäåèéêëìíîïòóôõöùúûüýÿçñ',
    'aaaaaaeeeeiiiiooooouuuuycn'
  );
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
  base_slug := substr(base_slug, 1, 80);
  base_slug := regexp_replace(base_slug, '-+$', '', 'g');
  IF base_slug = '' THEN base_slug := 'business'; END IF;

  LOOP
    IF attempt >= max_attempts THEN
      RAISE EXCEPTION 'Could not generate a unique organizer slug for business %', business_row.id;
    END IF;

    IF attempt = 0 THEN
      candidate := base_slug;
    ELSIF attempt <= 50 THEN
      candidate := base_slug || '-' || (attempt + 1);
    ELSE
      -- Escalate to a random suffix if plain numeric suffixes keep
      -- colliding (pathological case — many identically-named businesses
      -- created concurrently) so this still terminates quickly.
      candidate := base_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    END IF;

    BEGIN
      INSERT INTO organizers (
        user_id, name, org_type, slug, bio, photo, website, contact_email,
        is_business_auto_created
      )
      VALUES (
        business_row.owner_id,
        business_row.name,
        'business',
        candidate,
        business_row.description,
        business_row.logo,
        business_row.website,
        business_row.email,
        true
      )
      RETURNING id INTO new_org_id;

      RETURN new_org_id;
    EXCEPTION WHEN unique_violation THEN
      attempt := attempt + 1;
      -- loop again with the next candidate; the failed INSERT's implicit
      -- savepoint (from this EXCEPTION block) is already rolled back, so
      -- this doesn't touch the outer transaction.
    END;
  END LOOP;
END;
$_$;


--
-- Name: ensure_romantic_envelope_layout(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_romantic_envelope_layout(p_layout jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_layout JSONB := CASE WHEN jsonb_typeof(p_layout) = 'object' THEN p_layout ELSE '{}'::jsonb END;
  v_theme JSONB;
  v_classes JSONB;
  v_default_classes JSONB := jsonb_build_object(
    'page', 'min-h-screen bg-[#E6DEC9] text-stone-900 font-serif',
    'section', 'bg-transparent',
    'body', 'font-serif text-stone-700',
    'card', 'bg-white/80 border border-stone-200/50 shadow-md p-5 rounded-xl',
    'heading', 'font-serif text-amber-900 italic text-center font-normal tracking-wide',
    'button', 'bg-amber-800 text-white rounded-full font-serif px-8 py-3 tracking-wider hover:bg-amber-900 transition-all'
  );
  v_defaults JSONB;
  v_existing_blocks JSONB := '[]'::jsonb;
  v_output_blocks JSONB := '[]'::jsonb;
  v_block JSONB;
  v_type TEXT;
  v_core_types TEXT[] := ARRAY['interactive_envelope', 'hero', 'countdown', 'story', 'schedule', 'location_map'];
  v_optional_types TEXT[] := ARRAY['details', 'gallery', 'music', 'action_portal'];
BEGIN
  v_defaults := jsonb_build_array(
    jsonb_build_object('id', 'migration-179-envelope', 'type', 'interactive_envelope', 'content', '{}'::jsonb),
    jsonb_build_object('id', 'migration-179-hero', 'type', 'hero', 'content', jsonb_build_object(
      'eyebrow', jsonb_build_object('$bind', 'eyebrow'),
      'title', jsonb_build_object('$bind', 'title'),
      'subtitle', jsonb_build_object('$bind', 'hostNames'),
      'image', jsonb_build_object('$bind', 'heroImage'),
      'imageAlt', jsonb_build_object('$bind', 'heroImageAlt'),
      'imageFocus', jsonb_build_object('$bind', 'heroImageFocus'),
      'scrollPrompt', jsonb_build_object('$bind', 'scrollPrompt')
    )),
    jsonb_build_object('id', 'migration-179-countdown', 'type', 'countdown', 'content',
      jsonb_build_object('targetDate', jsonb_build_object('$bind', 'eventDate'))),
    jsonb_build_object('id', 'migration-179-story', 'type', 'story', 'content', jsonb_build_object(
      'heading', jsonb_build_object('$bind', 'storyHeadline'),
      'text', jsonb_build_object('$bind', 'storyText'),
      'image', jsonb_build_object('$bind', 'storyImage'),
      'moments', jsonb_build_object('$bind', 'weddingStory')
    )),
    jsonb_build_object('id', 'migration-179-schedule', 'type', 'schedule', 'content',
      jsonb_build_object('timeline', jsonb_build_object('$bind', 'schedule'))),
    jsonb_build_object('id', 'migration-179-location-map', 'type', 'location_map', 'content', jsonb_build_object(
      'latitude', jsonb_build_object('$bind', 'latitude'),
      'longitude', jsonb_build_object('$bind', 'longitude'),
      'venue', jsonb_build_object('$bind', 'venue'),
      'address', jsonb_build_object('$bind', 'address'),
      'city', jsonb_build_object('$bind', 'city')
    )),
    jsonb_build_object('id', 'migration-179-details', 'type', 'details', 'content', jsonb_build_object(
      'title', jsonb_build_object('$bind', 'title'),
      'eventDate', jsonb_build_object('$bind', 'eventDate'),
      'timezone', jsonb_build_object('$bind', 'timezone'),
      'venue', jsonb_build_object('$bind', 'venue'),
      'address', jsonb_build_object('$bind', 'address'),
      'city', jsonb_build_object('$bind', 'city'),
      'parkingNotes', jsonb_build_object('$bind', 'parkingNotes'),
      'dressCode', jsonb_build_object('$bind', 'dressCode'),
      'dressCodeNotes', jsonb_build_object('$bind', 'dressCodeNotes'),
      'additionalNotes', jsonb_build_object('$bind', 'additionalNotes'),
      'venues', jsonb_build_object('$bind', 'venues'),
      'accommodations', jsonb_build_object('$bind', 'accommodations'),
      'partner1Name', jsonb_build_object('$bind', 'partner1Name'),
      'partner2Name', jsonb_build_object('$bind', 'partner2Name'),
      'familyNote', jsonb_build_object('$bind', 'familyNote'),
      'weddingSubtype', jsonb_build_object('$bind', 'weddingSubtype'),
      'colorsOfTheDay', jsonb_build_object('$bind', 'colorsOfTheDay'),
      'registryNote', jsonb_build_object('$bind', 'registryNote'),
      'celebrantName', jsonb_build_object('$bind', 'celebrantName'),
      'ageMilestone', jsonb_build_object('$bind', 'ageMilestone'),
      'theme', jsonb_build_object('$bind', 'theme'),
      'giftNote', jsonb_build_object('$bind', 'giftNote'),
      'hashtag', jsonb_build_object('$bind', 'hashtag')
    )),
    jsonb_build_object('id', 'migration-179-gallery', 'type', 'gallery', 'content',
      jsonb_build_object('images', jsonb_build_object('$bind', 'gallery'))),
    jsonb_build_object('id', 'migration-179-music', 'type', 'music', 'content', jsonb_build_object(
      'audioUrl', jsonb_build_object('$bind', 'musicAudioUrl'),
      'title', jsonb_build_object('$bind', 'musicTitle'),
      'links', jsonb_build_object('$bind', 'musicLinks')
    )),
    jsonb_build_object('id', 'migration-179-action-portal', 'type', 'action_portal', 'content', jsonb_build_object(
      'actionType', 'RSVP_SUBMISSION',
      'guestName', jsonb_build_object('$bind', 'guest.name'),
      'rsvpStatus', jsonb_build_object('$bind', 'guest.rsvpStatus'),
      'seatLabel', jsonb_build_object('$bind', 'seat.label'),
      'qrCode', jsonb_build_object('$bind', 'ticketInstance.qrCode')
    ))
  );

  IF jsonb_typeof(v_layout -> 'layout_blocks') = 'array' THEN
    SELECT COALESCE(jsonb_agg(
      CASE WHEN item.value ->> 'type' = 'romantic_envelope_gate'
        THEN jsonb_set(item.value, '{type}', to_jsonb('interactive_envelope'::TEXT), true)
        ELSE item.value
      END ORDER BY item.ordinality
    ), '[]'::jsonb)
    INTO v_existing_blocks
    FROM jsonb_array_elements(v_layout -> 'layout_blocks') WITH ORDINALITY AS item(value, ordinality);
  END IF;

  FOREACH v_type IN ARRAY v_core_types LOOP
    SELECT item.value INTO v_block
    FROM jsonb_array_elements(v_existing_blocks) AS item(value)
    WHERE item.value ->> 'type' = v_type
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT item.value INTO v_block
      FROM jsonb_array_elements(v_defaults) AS item(value)
      WHERE item.value ->> 'type' = v_type
      LIMIT 1;
    END IF;

    v_output_blocks := v_output_blocks || jsonb_build_array(v_block);
    v_block := NULL;
  END LOOP;

  FOREACH v_type IN ARRAY v_optional_types LOOP
    SELECT item.value INTO v_block
    FROM jsonb_array_elements(v_existing_blocks) AS item(value)
    WHERE item.value ->> 'type' = v_type
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT item.value INTO v_block
      FROM jsonb_array_elements(v_defaults) AS item(value)
      WHERE item.value ->> 'type' = v_type
      LIMIT 1;
    END IF;

    v_output_blocks := v_output_blocks || jsonb_build_array(v_block);
    v_block := NULL;
  END LOOP;

  FOR v_block IN
    SELECT item.value
    FROM jsonb_array_elements(v_existing_blocks) AS item(value)
    WHERE COALESCE(item.value ->> 'type', '') <> ALL(v_core_types || v_optional_types)
  LOOP
    v_output_blocks := v_output_blocks || jsonb_build_array(v_block);
  END LOOP;

  v_theme := CASE WHEN jsonb_typeof(v_layout -> 'global_theme') = 'object'
    THEN v_layout -> 'global_theme' ELSE '{}'::jsonb END;
  v_classes := CASE WHEN jsonb_typeof(v_theme -> 'classes') = 'object'
    THEN v_theme -> 'classes' ELSE '{}'::jsonb END;
  v_theme := v_theme || jsonb_build_object(
    'classes', v_default_classes || v_classes,
    'text_scale', CASE WHEN jsonb_typeof(v_theme -> 'text_scale') = 'number'
      THEN v_theme -> 'text_scale' ELSE '1.0'::jsonb END
  );

  RETURN v_layout || jsonb_build_object(
    'version', COALESCE(v_layout -> 'version', '1'::jsonb),
    'global_theme', v_theme,
    'layout_blocks', v_output_blocks
  );
END;
$_$;


--
-- Name: fail_payout(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fail_payout(p_payout_id uuid, p_failure_reason text, p_processed_by uuid) RETURNS TABLE(payout_id uuid, status text, reversal_ledger_entry_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_recipient_id UUID;
  v_amount NUMERIC;
  v_currency TEXT;
  v_current_status TEXT;
  v_existing_reversal_id UUID;
  v_reversal_id UUID;
BEGIN
  -- Lock payout row
  SELECT payouts.recipient_id, payouts.amount, payouts.currency, payouts.status
  INTO v_recipient_id, v_amount, v_currency, v_current_status
  FROM payouts
  WHERE payouts.id = p_payout_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'fail_payout: payout % not found', p_payout_id;
  END IF;

  -- Idempotency check: if already failed, return existing reversal entry
  IF v_current_status = 'failed' THEN
    SELECT recipient_ledger_entries.id INTO v_existing_reversal_id
    FROM recipient_ledger_entries
    WHERE recipient_ledger_entries.source_type = 'payout'
      AND recipient_ledger_entries.source_id = p_payout_id
      AND recipient_ledger_entries.entry_type = 'adjustment';

    RETURN QUERY SELECT p_payout_id, 'failed'::TEXT, v_existing_reversal_id;
    RETURN;
  END IF;

  IF v_current_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'fail_payout: payout % is in terminal state % and cannot be marked failed',
      p_payout_id, v_current_status;
  END IF;

  -- Lock recipient row
  PERFORM 1 FROM recipients WHERE recipients.id = v_recipient_id FOR UPDATE;

  -- Update payout status
  UPDATE payouts
  SET
    status = 'failed',
    failure_reason = p_failure_reason,
    processed_by = COALESCE(p_processed_by, payouts.processed_by),
    updated_at = now()
  WHERE payouts.id = p_payout_id;

  -- Insert single compensating credit adjustment
  INSERT INTO recipient_ledger_entries (
    recipient_id,
    entry_type,
    amount,
    currency,
    source_type,
    source_id,
    external_reference,
    description,
    created_by
  ) VALUES (
    v_recipient_id,
    'adjustment',
    v_amount,
    v_currency,
    'payout',
    p_payout_id,
    p_payout_id::text,
    'Reversal for failed payout',
    p_processed_by
  ) RETURNING recipient_ledger_entries.id INTO v_reversal_id;

  RETURN QUERY SELECT p_payout_id, 'failed'::TEXT, v_reversal_id;
END;
$$;


--
-- Name: get_business_cook_performance(uuid, uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_business_cook_performance(p_business_id uuid, p_organizer_id uuid, p_range_start timestamp with time zone, p_range_end timestamp with time zone) RETURNS TABLE(cook_worker_id uuid, cook_name text, cook_is_active boolean, orders_handled bigint, accepted_to_preparing_n bigint, accepted_to_preparing_median_minutes double precision, preparing_to_ready_n bigint, preparing_to_ready_median_minutes double precision)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
  WITH requested_scope AS (
    -- Do not trust the caller's pair of ids independently. The business must
    -- still belong to the organizer passed to this function.
    SELECT business_row.id AS scoped_business_id,
           business_row.organizer_id AS scoped_organizer_id
      FROM public.businesses AS business_row
      JOIN public.organizers AS organizer_row
        ON organizer_row.id = business_row.organizer_id
     WHERE business_row.id = p_business_id
       AND business_row.organizer_id = p_organizer_id
       AND p_range_start IS NOT NULL
       AND p_range_end IS NOT NULL
       AND p_range_start < p_range_end
  ),
  scoped_orders AS (
    SELECT order_row.id AS order_id,
           order_row.business_id,
           order_row.status AS current_order_status,
           order_row.status_history
      FROM public.orders AS order_row
      JOIN requested_scope AS scope_row
        ON scope_row.scoped_business_id = order_row.business_id
       AND scope_row.scoped_organizer_id = order_row.organizer_id
  ),
  event_source AS (
    SELECT order_row.order_id,
           order_row.business_id,
           order_row.current_order_status,
           history_row.ordinality::bigint AS event_ordinal,
           history_row.event_json,
           history_row.event_json ->> 'status' AS event_status,
           history_row.event_json ->> 'at' AS event_at_text,
           history_row.event_json ->> 'worker_id' AS worker_id_text
      FROM scoped_orders AS order_row
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(order_row.status_history) = 'array'
            THEN order_row.status_history
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS history_row(event_json, ordinality)
     WHERE jsonb_typeof(history_row.event_json) = 'object'
  ),
  parsed_events AS (
    SELECT event_row.order_id,
           event_row.business_id,
           event_row.current_order_status,
           event_row.event_ordinal,
           event_row.event_status,
           CASE
             WHEN event_row.worker_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               THEN event_row.worker_id_text::uuid
             ELSE NULL::uuid
           END AS worker_id,
           CASE
             WHEN event_row.event_at_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
               THEN event_row.event_at_text::timestamptz
             ELSE NULL::timestamptz
           END AS event_at
      FROM event_source AS event_row
  ),
  cooks AS (
    -- business_workers rows remain available after deactivation, so historic
    -- cooks keep their name and appear with cook_is_active = false.
    SELECT worker_row.id AS cook_worker_id,
           worker_row.full_name AS cook_name,
           (worker_row.is_active AND worker_row.deactivated_at IS NULL) AS cook_is_active
      FROM public.business_workers AS worker_row
      JOIN requested_scope AS scope_row
        ON scope_row.scoped_business_id = worker_row.business_id
     WHERE worker_row.role = 'cook'
  ),
  handled_counts AS (
    -- A cook handled an order when that cook has at least one attributed
    -- preparing/ready transition in the requested UTC range. A cancelled
    -- order still counts here if a cook transitioned it.
    SELECT event_row.worker_id AS cook_worker_id,
           count(DISTINCT event_row.order_id)::bigint AS orders_handled
      FROM parsed_events AS event_row
      JOIN public.business_workers AS worker_row
        ON worker_row.id = event_row.worker_id
       AND worker_row.business_id = event_row.business_id
       AND worker_row.role = 'cook'
     WHERE event_row.worker_id IS NOT NULL
       AND event_row.event_status IN ('preparing', 'ready')
       AND event_row.event_at >= p_range_start
       AND event_row.event_at < p_range_end
     GROUP BY event_row.worker_id
  ),
  accepted_to_preparing_intervals AS (
    -- Credit each interval to the cook on the event that ENDS it. The start
    -- event may belong to a manager or another non-cook actor.
    SELECT ending_event.worker_id AS cook_worker_id,
           extract(epoch FROM (ending_event.event_at - start_event.event_at))::double precision
             / 60.0::double precision AS duration_minutes
      FROM parsed_events AS ending_event
      JOIN public.business_workers AS worker_row
        ON worker_row.id = ending_event.worker_id
       AND worker_row.business_id = ending_event.business_id
       AND worker_row.role = 'cook'
      CROSS JOIN LATERAL (
        SELECT preceding_event.event_at
          FROM parsed_events AS preceding_event
         WHERE preceding_event.order_id = ending_event.order_id
           AND preceding_event.event_ordinal < ending_event.event_ordinal
           AND preceding_event.event_status = 'accepted'
           AND preceding_event.event_at IS NOT NULL
         ORDER BY preceding_event.event_ordinal DESC
         LIMIT 1
      ) AS start_event
     WHERE ending_event.event_status = 'preparing'
       AND ending_event.worker_id IS NOT NULL
       AND ending_event.current_order_status <> 'cancelled'
       AND ending_event.event_at >= p_range_start
       AND ending_event.event_at < p_range_end
       AND start_event.event_at <= ending_event.event_at
  ),
  preparing_to_ready_intervals AS (
    -- Credit each interval to the cook on the event that ENDS it. The start
    -- event may belong to a manager or another non-cook actor.
    SELECT ending_event.worker_id AS cook_worker_id,
           extract(epoch FROM (ending_event.event_at - start_event.event_at))::double precision
             / 60.0::double precision AS duration_minutes
      FROM parsed_events AS ending_event
      JOIN public.business_workers AS worker_row
        ON worker_row.id = ending_event.worker_id
       AND worker_row.business_id = ending_event.business_id
       AND worker_row.role = 'cook'
      CROSS JOIN LATERAL (
        SELECT preceding_event.event_at
          FROM parsed_events AS preceding_event
         WHERE preceding_event.order_id = ending_event.order_id
           AND preceding_event.event_ordinal < ending_event.event_ordinal
           AND preceding_event.event_status = 'preparing'
           AND preceding_event.event_at IS NOT NULL
         ORDER BY preceding_event.event_ordinal DESC
         LIMIT 1
      ) AS start_event
     WHERE ending_event.event_status = 'ready'
       AND ending_event.worker_id IS NOT NULL
       AND ending_event.current_order_status <> 'cancelled'
       AND ending_event.event_at >= p_range_start
       AND ending_event.event_at < p_range_end
       AND start_event.event_at <= ending_event.event_at
  ),
  accepted_to_preparing_stats AS (
    SELECT interval_row.cook_worker_id,
           count(*)::bigint AS sample_n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY interval_row.duration_minutes)
             AS median_minutes
      FROM accepted_to_preparing_intervals AS interval_row
     GROUP BY interval_row.cook_worker_id
  ),
  preparing_to_ready_stats AS (
    SELECT interval_row.cook_worker_id,
           count(*)::bigint AS sample_n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY interval_row.duration_minutes)
             AS median_minutes
      FROM preparing_to_ready_intervals AS interval_row
     GROUP BY interval_row.cook_worker_id
  )
  SELECT cook_row.cook_worker_id,
         cook_row.cook_name,
         cook_row.cook_is_active,
         COALESCE(handled_row.orders_handled, 0::bigint) AS orders_handled,
         COALESCE(accepted_stats.sample_n, 0::bigint) AS accepted_to_preparing_n,
         accepted_stats.median_minutes AS accepted_to_preparing_median_minutes,
         COALESCE(ready_stats.sample_n, 0::bigint) AS preparing_to_ready_n,
         ready_stats.median_minutes AS preparing_to_ready_median_minutes
    FROM cooks AS cook_row
    LEFT JOIN handled_counts AS handled_row
      ON handled_row.cook_worker_id = cook_row.cook_worker_id
    LEFT JOIN accepted_to_preparing_stats AS accepted_stats
      ON accepted_stats.cook_worker_id = cook_row.cook_worker_id
    LEFT JOIN preparing_to_ready_stats AS ready_stats
      ON ready_stats.cook_worker_id = cook_row.cook_worker_id
   ORDER BY cook_row.cook_name, cook_row.cook_worker_id;
$_$;


--
-- Name: FUNCTION get_business_cook_performance(p_business_id uuid, p_organizer_id uuid, p_range_start timestamp with time zone, p_range_end timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_business_cook_performance(p_business_id uuid, p_organizer_id uuid, p_range_start timestamp with time zone, p_range_end timestamp with time zone) IS 'Read-only cook performance report. Range endpoints and status_history event timestamps are UTC; range is start-inclusive/end-exclusive. Each accepted-to-preparing or preparing-to-ready interval is credited to the cook on the event that ends it, even when its start event was written by a manager. Orders handled are distinct per cook and may overlap across cooks. Cancelled orders count as handled when a cook transitioned them, but are excluded from both median samples. Each median is returned with its sample count; a median is NULL when its count is zero. Returns no customer fields. The caller must separately enforce owner/admin/manager tenant access.';


--
-- Name: get_business_courier_performance(uuid, uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_business_courier_performance(p_business_id uuid, p_organizer_id uuid, p_range_start timestamp with time zone, p_range_end timestamp with time zone) RETURNS TABLE(courier_worker_id uuid, courier_name text, courier_is_active boolean, deliveries_completed bigint, ready_to_delivered_n bigint, ready_to_delivered_median_minutes double precision, picked_up_to_delivered_n bigint, picked_up_to_delivered_median_minutes double precision, average_delivery_rating double precision, rating_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
  WITH requested_scope AS (
    SELECT business_row.id AS scoped_business_id,
           business_row.organizer_id AS scoped_organizer_id
      FROM public.businesses AS business_row
      JOIN public.organizers AS organizer_row
        ON organizer_row.id = business_row.organizer_id
     WHERE business_row.id = p_business_id
       AND business_row.organizer_id = p_organizer_id
       AND p_range_start IS NOT NULL
       AND p_range_end IS NOT NULL
       AND p_range_start < p_range_end
  ),
  couriers AS (
    SELECT worker_row.id AS courier_worker_id,
           worker_row.full_name AS courier_name,
           (worker_row.is_active AND worker_row.deactivated_at IS NULL) AS courier_is_active
      FROM public.business_workers AS worker_row
      JOIN requested_scope AS scope_row
        ON scope_row.scoped_business_id = worker_row.business_id
     WHERE worker_row.role = 'courier'
  ),
  scoped_orders AS (
    SELECT order_row.id AS order_id,
           order_row.business_id,
           order_row.status AS current_order_status,
           order_row.status_history,
           order_row.courier_worker_id,
           order_row.delivery_rating
      FROM public.orders AS order_row
      JOIN requested_scope AS scope_row
        ON scope_row.scoped_business_id = order_row.business_id
       AND scope_row.scoped_organizer_id = order_row.organizer_id
     WHERE order_row.courier_worker_id IS NOT NULL
  ),
  event_source AS (
    SELECT order_row.order_id,
           order_row.business_id,
           order_row.current_order_status,
           order_row.courier_worker_id,
           order_row.delivery_rating,
           history_row.ordinality::bigint AS event_ordinal,
           history_row.event_json,
           history_row.event_json ->> 'status' AS event_status,
           history_row.event_json ->> 'at' AS event_at_text
      FROM scoped_orders AS order_row
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(order_row.status_history) = 'array'
            THEN order_row.status_history
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS history_row(event_json, ordinality)
     WHERE jsonb_typeof(history_row.event_json) = 'object'
  ),
  parsed_events AS (
    SELECT event_row.order_id,
           event_row.business_id,
           event_row.current_order_status,
           event_row.courier_worker_id,
           event_row.delivery_rating,
           event_row.event_ordinal,
           event_row.event_status,
           CASE
             WHEN event_row.event_at_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
               THEN event_row.event_at_text::timestamptz
             ELSE NULL::timestamptz
           END AS event_at
      FROM event_source AS event_row
  ),
  -- Count completed deliveries per courier (delivered within range)
  delivery_counts AS (
    SELECT event_row.courier_worker_id,
           count(DISTINCT event_row.order_id)::bigint AS deliveries_completed
      FROM parsed_events AS event_row
     WHERE event_row.event_status = 'delivered'
       AND event_row.event_at >= p_range_start
       AND event_row.event_at < p_range_end
     GROUP BY event_row.courier_worker_id
  ),
  -- ready → delivered intervals (full cycle)
  ready_to_delivered_intervals AS (
    SELECT ending_event.courier_worker_id,
           extract(epoch FROM (ending_event.event_at - start_event.event_at))::double precision
             / 60.0::double precision AS duration_minutes
      FROM parsed_events AS ending_event
      CROSS JOIN LATERAL (
        SELECT preceding_event.event_at
          FROM parsed_events AS preceding_event
         WHERE preceding_event.order_id = ending_event.order_id
           AND preceding_event.event_ordinal < ending_event.event_ordinal
           AND preceding_event.event_status = 'ready'
           AND preceding_event.event_at IS NOT NULL
         ORDER BY preceding_event.event_ordinal DESC
         LIMIT 1
      ) AS start_event
     WHERE ending_event.event_status = 'delivered'
       AND ending_event.event_at IS NOT NULL
       AND ending_event.event_at >= p_range_start
       AND ending_event.event_at < p_range_end
       AND start_event.event_at <= ending_event.event_at
  ),
  -- picked_up → delivered intervals (transit only)
  picked_up_to_delivered_intervals AS (
    SELECT ending_event.courier_worker_id,
           extract(epoch FROM (ending_event.event_at - start_event.event_at))::double precision
             / 60.0::double precision AS duration_minutes
      FROM parsed_events AS ending_event
      CROSS JOIN LATERAL (
        SELECT preceding_event.event_at
          FROM parsed_events AS preceding_event
         WHERE preceding_event.order_id = ending_event.order_id
           AND preceding_event.event_ordinal < ending_event.event_ordinal
           AND preceding_event.event_status = 'picked_up'
           AND preceding_event.event_at IS NOT NULL
         ORDER BY preceding_event.event_ordinal DESC
         LIMIT 1
      ) AS start_event
     WHERE ending_event.event_status = 'delivered'
       AND ending_event.event_at IS NOT NULL
       AND ending_event.event_at >= p_range_start
       AND ending_event.event_at < p_range_end
       AND start_event.event_at <= ending_event.event_at
  ),
  ready_to_delivered_stats AS (
    SELECT interval_row.courier_worker_id,
           count(*)::bigint AS sample_n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY interval_row.duration_minutes)
             AS median_minutes
      FROM ready_to_delivered_intervals AS interval_row
     GROUP BY interval_row.courier_worker_id
  ),
  picked_up_to_delivered_stats AS (
    SELECT interval_row.courier_worker_id,
           count(*)::bigint AS sample_n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY interval_row.duration_minutes)
             AS median_minutes
      FROM picked_up_to_delivered_intervals AS interval_row
     GROUP BY interval_row.courier_worker_id
  ),
  -- Rating averages per courier (all time, not range-filtered)
  rating_stats AS (
    SELECT order_row.courier_worker_id,
           round(avg(order_row.delivery_rating)::numeric, 2)::double precision AS average_rating,
           count(order_row.delivery_rating)::bigint AS rating_count
      FROM scoped_orders AS order_row
     WHERE order_row.delivery_rating IS NOT NULL
     GROUP BY order_row.courier_worker_id
  )
  SELECT courier_row.courier_worker_id,
         courier_row.courier_name,
         courier_row.courier_is_active,
         COALESCE(delivery_row.deliveries_completed, 0::bigint) AS deliveries_completed,
         COALESCE(ready_stats.sample_n, 0::bigint) AS ready_to_delivered_n,
         ready_stats.median_minutes AS ready_to_delivered_median_minutes,
         COALESCE(transit_stats.sample_n, 0::bigint) AS picked_up_to_delivered_n,
         transit_stats.median_minutes AS picked_up_to_delivered_median_minutes,
         rating_stats_row.average_rating AS average_delivery_rating,
         COALESCE(rating_stats_row.rating_count, 0::bigint) AS rating_count
    FROM couriers AS courier_row
    LEFT JOIN delivery_counts AS delivery_row
      ON delivery_row.courier_worker_id = courier_row.courier_worker_id
    LEFT JOIN ready_to_delivered_stats AS ready_stats
      ON ready_stats.courier_worker_id = courier_row.courier_worker_id
    LEFT JOIN picked_up_to_delivered_stats AS transit_stats
      ON transit_stats.courier_worker_id = courier_row.courier_worker_id
    LEFT JOIN rating_stats AS rating_stats_row
      ON rating_stats_row.courier_worker_id = courier_row.courier_worker_id
   ORDER BY courier_row.courier_name, courier_row.courier_worker_id;
$_$;


--
-- Name: FUNCTION get_business_courier_performance(p_business_id uuid, p_organizer_id uuid, p_range_start timestamp with time zone, p_range_end timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_business_courier_performance(p_business_id uuid, p_organizer_id uuid, p_range_start timestamp with time zone, p_range_end timestamp with time zone) IS 'Read-only courier delivery performance report. Range is start-inclusive/end-exclusive UTC. Computes deliveries completed, median ready-to-delivered and picked_up-to-delivered intervals, plus all-time average delivery rating per courier. Each median is returned with its sample count. Returns no customer fields. Caller must separately enforce owner/admin/manager tenant access.';


--
-- Name: get_comment_like_counts(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_comment_like_counts(ids uuid[]) RETURNS TABLE(comment_id uuid, cnt bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select comment_id, count(*)::bigint
  from comment_likes
  where comment_id = any(ids)
  group by comment_id;
$$;


--
-- Name: get_recipient_balance(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_recipient_balance(p_recipient_id uuid, p_currency text DEFAULT 'usd'::text) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO v_balance
  FROM recipient_ledger_entries
  WHERE recipient_ledger_entries.recipient_id = p_recipient_id
    AND recipient_ledger_entries.currency = lower(p_currency);

  RETURN v_balance;
END;
$$;


--
-- Name: get_total_raised(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_total_raised() RETURNS numeric
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(SUM(raised), 0)
  FROM public.fundraisers
  WHERE deleted_at IS NULL AND status = 'published';
$$;


--
-- Name: get_user_id_by_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_id_by_email(p_email text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT id FROM auth.users WHERE LOWER(email) = LOWER(TRIM(p_email)) LIMIT 1;
$$;


--
-- Name: guard_business_owner_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_business_owner_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
  ) THEN
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT (NEW.status = 'archived' AND OLD.owner_id = auth.uid()) THEN
      RAISE EXCEPTION 'Not allowed to change business status' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF OLD.is_flagged IS DISTINCT FROM NEW.is_flagged THEN
    RAISE EXCEPTION 'Not allowed to change is_flagged' USING ERRCODE = '42501';
  END IF;
  IF OLD.is_featured IS DISTINCT FROM NEW.is_featured THEN
    RAISE EXCEPTION 'Not allowed to change is_featured' USING ERRCODE = '42501';
  END IF;
  IF OLD.rejection_reason IS DISTINCT FROM NEW.rejection_reason THEN
    RAISE EXCEPTION 'Not allowed to change rejection_reason' USING ERRCODE = '42501';
  END IF;
  IF OLD.listing_tier IS DISTINCT FROM NEW.listing_tier THEN
    RAISE EXCEPTION 'Not allowed to change listing_tier' USING ERRCODE = '42501';
  END IF;
  IF OLD.stripe_price_id IS DISTINCT FROM NEW.stripe_price_id THEN
    RAISE EXCEPTION 'Not allowed to change stripe_price_id' USING ERRCODE = '42501';
  END IF;
  IF OLD.stripe_subscription_id IS DISTINCT FROM NEW.stripe_subscription_id THEN
    RAISE EXCEPTION 'Not allowed to change stripe_subscription_id' USING ERRCODE = '42501';
  END IF;
  IF OLD.current_period_end IS DISTINCT FROM NEW.current_period_end THEN
    RAISE EXCEPTION 'Not allowed to change current_period_end' USING ERRCODE = '42501';
  END IF;
  IF OLD.crypto_payment_id IS DISTINCT FROM NEW.crypto_payment_id THEN
    RAISE EXCEPTION 'Not allowed to change crypto_payment_id' USING ERRCODE = '42501';
  END IF;
  IF OLD.pre_approval_status_snapshot IS DISTINCT FROM NEW.pre_approval_status_snapshot THEN
    RAISE EXCEPTION 'Not allowed to change pre_approval_status_snapshot' USING ERRCODE = '42501';
  END IF;
  IF OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN
    RAISE EXCEPTION 'Not allowed to change owner_id' USING ERRCODE = '42501';
  END IF;
  IF OLD.organizer_id IS DISTINCT FROM NEW.organizer_id THEN
    RAISE EXCEPTION 'Not allowed to change organizer_id' USING ERRCODE = '42501';
  END IF;
  IF OLD.screening_risk_score IS DISTINCT FROM NEW.screening_risk_score THEN
    RAISE EXCEPTION 'Not allowed to change screening_risk_score' USING ERRCODE = '42501';
  END IF;
  IF OLD.screened_at IS DISTINCT FROM NEW.screened_at THEN
    RAISE EXCEPTION 'Not allowed to change screened_at' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION guard_business_owner_update(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.guard_business_owner_update() IS 'Prevents owners from self-approving status=active, is_featured, listing_tier, organizer_id, etc. Service role (auth.uid IS NULL) and active admin bypass. Updated in 138 to also protect organizer_id.';


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, role, status, preferences)
  VALUES (NEW.id, 'user', 'active', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;


--
-- Name: is_entity_member(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_entity_member(p_organizer_id uuid, p_roles text[] DEFAULT NULL::text[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM entity_members
    WHERE organizer_id = p_organizer_id
      AND user_id = auth.uid()
      AND (p_roles IS NULL OR role = ANY(p_roles))
  );
$$;


--
-- Name: is_event_team_member(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_event_team_member(p_event_id uuid, p_roles text[] DEFAULT NULL::text[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM event_team_members
    WHERE event_id = p_event_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND (p_roles IS NULL OR role = ANY(p_roles))
  );
$$;


--
-- Name: knowledge_chunks_tsv_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.knowledge_chunks_tsv_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.tsv := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$;


--
-- Name: make_page_blocks_layout(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.make_page_blocks_layout(p_blocks jsonb, p_global_theme jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_layout_blocks JSONB := '[]'::jsonb;
  v_theme JSONB := '{}'::jsonb;
BEGIN
  IF jsonb_typeof(p_blocks) = 'array' THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', COALESCE(
            NULLIF(BTRIM(item.value ->> 'id'), ''),
            'website-' || item.ordinality::text || '-' || (item.value ->> 'type')
          ),
          'type', item.value ->> 'type',
          'content', item.value - 'id' - 'type'
        )
        ORDER BY item.ordinality
      ),
      '[]'::jsonb
    )
    INTO v_layout_blocks
    FROM jsonb_array_elements(p_blocks) WITH ORDINALITY AS item(value, ordinality)
    WHERE jsonb_typeof(item.value) = 'object'
      AND jsonb_typeof(item.value -> 'type') = 'string'
      AND NULLIF(BTRIM(item.value ->> 'type'), '') IS NOT NULL;
  END IF;

  IF jsonb_typeof(p_global_theme) = 'object' THEN
    v_theme := p_global_theme;
  END IF;

  RETURN jsonb_build_object(
    'version', 1,
    'global_theme', jsonb_build_object(
      'classes', COALESCE(v_theme -> 'classes', '{}'::jsonb)
    ),
    'layout_blocks', v_layout_blocks
  );
END;
$$;


--
-- Name: menu_modifiers_valid(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.menu_modifiers_valid(m jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN m IS NULL OR jsonb_typeof(m) <> 'array' THEN false
    WHEN jsonb_array_length(m) > 12 THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(m) AS elem
      WHERE CASE
        WHEN jsonb_typeof(elem) <> 'object' THEN false
        WHEN jsonb_typeof(elem->'name') IS DISTINCT FROM 'string' THEN false
        WHEN char_length(elem->>'name') NOT BETWEEN 1 AND 80 THEN false
        WHEN jsonb_typeof(elem->'price_delta') IS DISTINCT FROM 'number' THEN false
        ELSE (elem->>'price_delta')::numeric BETWEEN -10000 AND 10000
      END IS NOT TRUE
    )
  END
$$;


--
-- Name: menu_option_groups_valid(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.menu_option_groups_valid(og jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN og IS NULL OR jsonb_typeof(og) <> 'array' THEN false
    WHEN jsonb_array_length(og) > 8 THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(og) AS grp
      WHERE CASE
        WHEN jsonb_typeof(grp) <> 'object' THEN true
        WHEN jsonb_typeof(grp->'id') IS DISTINCT FROM 'string'
          OR char_length(grp->>'id') NOT BETWEEN 1 AND 80 THEN true
        WHEN jsonb_typeof(grp->'name') IS DISTINCT FROM 'string'
          OR char_length(grp->>'name') NOT BETWEEN 1 AND 80 THEN true
        WHEN jsonb_typeof(grp->'required') IS DISTINCT FROM 'boolean' THEN true
        WHEN jsonb_typeof(grp->'min') IS DISTINCT FROM 'number'
          OR (grp->>'min')::numeric <> (grp->>'min')::integer
          OR (grp->>'min')::integer < 0 THEN true
        WHEN jsonb_typeof(grp->'max') IS DISTINCT FROM 'number'
          OR (grp->>'max')::numeric <> (grp->>'max')::integer
          OR (grp->>'max')::integer < (grp->>'min')::integer THEN true
        WHEN (grp->>'required')::boolean IS TRUE AND (grp->>'min')::integer < 1 THEN true
        WHEN grp->'options' IS NULL OR jsonb_typeof(grp->'options') <> 'array'
          OR jsonb_array_length(grp->'options') > 20
          OR (grp->>'max')::integer > jsonb_array_length(grp->'options') THEN true
        ELSE EXISTS (
          SELECT 1 FROM jsonb_array_elements(grp->'options') AS opt
          WHERE CASE
            WHEN jsonb_typeof(opt) <> 'object' THEN true
            WHEN jsonb_typeof(opt->'id') IS DISTINCT FROM 'string'
              OR char_length(opt->>'id') NOT BETWEEN 1 AND 80 THEN true
            WHEN jsonb_typeof(opt->'name') IS DISTINCT FROM 'string'
              OR char_length(opt->>'name') NOT BETWEEN 1 AND 80 THEN true
            WHEN jsonb_typeof(opt->'price_delta') IS DISTINCT FROM 'number'
              OR (opt->>'price_delta')::numeric < -10000
              OR (opt->>'price_delta')::numeric > 10000 THEN true
            ELSE false
          END
        )
      END
    )
  END
$$;


--
-- Name: FUNCTION menu_option_groups_valid(og jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.menu_option_groups_valid(og jsonb) IS 'Validates menu item option_groups: array <= 8 groups; id & name 1-80; required bool; 0 <= min <= max <= options count <= 20; required => min >= 1; options price_delta -10000..10000.';


--
-- Name: offer_ready_delivery_couriers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.offer_ready_delivery_couriers() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status IN ('accepted', 'preparing', 'ready')
     AND NEW.fulfilment_type = 'delivery'
     AND NEW.estimated_ready_at IS NOT NULL
     AND NEW.courier_worker_id IS NULL THEN
    PERFORM public.dispatch_business_courier_order(NEW.id, false);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: prevent_audit_log_modification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_audit_log_modification() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'event_audit_logs is append-only. UPDATE and DELETE are prohibited.';
END;
$$;


--
-- Name: prevent_business_organizer_id_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_business_organizer_id_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.organizer_id IS NOT NULL AND NEW.organizer_id IS DISTINCT FROM OLD.organizer_id THEN
    RAISE EXCEPTION 'organizer_id cannot be changed once set';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: prevent_connected_account_tenant_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_connected_account_tenant_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    IF EXISTS (SELECT 1 FROM channel_assets WHERE connected_account_id = OLD.id) THEN
      RAISE EXCEPTION 'connected_accounts.tenant_id cannot change while channel_assets reference it';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: prevent_is_business_auto_created_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_is_business_auto_created_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.is_business_auto_created IS DISTINCT FROM OLD.is_business_auto_created THEN
    RAISE EXCEPTION 'is_business_auto_created cannot be changed after creation';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: prevent_ledger_entry_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_ledger_entry_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'recipient_ledger_entries is append-only: % is not permitted. Corrections must be made via a compensating entry.', TG_OP;
END;
$$;


--
-- Name: prevent_menu_item_option_group_tenant_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_menu_item_option_group_tenant_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.organizer_id IS DISTINCT FROM OLD.organizer_id
    AND EXISTS (SELECT 1 FROM public.menu_item_option_groups WHERE item_id = OLD.id) THEN
    RAISE EXCEPTION 'Cannot change the organizer of a menu item with option group assignments' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: prevent_menu_option_group_tenant_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_menu_option_group_tenant_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.organizer_id IS DISTINCT FROM OLD.organizer_id AND (
    EXISTS (SELECT 1 FROM public.menu_options WHERE group_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.menu_item_option_groups WHERE group_id = OLD.id)
  ) THEN
    RAISE EXCEPTION 'Cannot change the organizer of an option group with options or assignments' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: prevent_menu_promotion_organizer_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_menu_promotion_organizer_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.organizer_id IS DISTINCT FROM OLD.organizer_id
    AND EXISTS (SELECT 1 FROM public.promotion_targets WHERE promotion_id = OLD.id) THEN
    RAISE EXCEPTION 'Cannot change the organizer of a promotion with targets' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: prevent_profile_role_status_self_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_profile_role_status_self_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.identity_status IS DISTINCT FROM OLD.identity_status
       OR NEW.identity_verified_at IS DISTINCT FROM OLD.identity_verified_at THEN
      RAISE EXCEPTION 'Role, status, and identity verification cannot be changed from account settings.';
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: prevent_submission_self_approval(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_submission_self_approval() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  -- Guard: only admin or service role may transition status to a review-outcome
  -- state ('approved', 'rejected', 'needs_more_info'). Regular authenticated
  -- users may only move between 'draft' and 'submitted'.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved', 'rejected', 'needs_more_info')
  THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND status = 'active'
    ) INTO is_admin_user;

    -- Only a genuine service-role connection bypasses the admin check.
    is_admin_user := is_admin_user OR auth.role() = 'service_role';

    IF NOT is_admin_user THEN
      RAISE EXCEPTION
        'Only an admin can approve, reject, or request more information on a verification submission';
    END IF;
  END IF;

  -- Guard: only admin or service role may set reviewed_by, reviewed_at,
  -- or reviewer_notes (belt-and-suspenders — these are review-only fields).
  IF (NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
      OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
      OR NEW.reviewer_notes IS DISTINCT FROM OLD.reviewer_notes)
  THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND status = 'active'
    ) INTO is_admin_user;

    -- Only a genuine service-role connection bypasses the admin check.
    is_admin_user := is_admin_user OR auth.role() = 'service_role';

    IF NOT is_admin_user THEN
      RAISE EXCEPTION
        'Only an admin can set review fields on a verification submission';
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: prevent_user_identity_self_approval(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_user_identity_self_approval() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  -- If review outcome columns or status approved/rejected/needs_more_info are set:
  IF (NEW.status IN ('approved', 'rejected', 'needs_more_info') AND OLD.status NOT IN ('approved', 'rejected', 'needs_more_info'))
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.reviewer_notes IS DISTINCT FROM OLD.reviewer_notes
  THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    ) INTO is_admin;

    -- Only a genuine service-role connection bypasses the admin check.
    is_admin := is_admin OR (auth.role() = 'service_role');

    IF NOT is_admin THEN
      RAISE EXCEPTION 'Only an administrator can approve, reject, or set review fields on identity verifications.';
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: publish_content_draft(uuid, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_content_draft(p_website_id uuid, p_expected_version integer DEFAULT NULL::integer, p_page_blocks jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id UUID;
  v_tenant_id UUID;
  v_is_authorized BOOLEAN := false;
  v_draft_content JSONB;
  v_draft_version INTEGER;
  v_draft_updated_by UUID;
  v_site_title TEXT;
  v_entry JSONB;
  v_page_id UUID;
  v_page_count INTEGER := 0;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: must be authenticated';
  END IF;

  IF auth.role() = 'service_role' THEN
    v_is_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = v_caller_id AND role = 'admin' AND status = 'active'
    ) INTO v_is_authorized;
  END IF;

  SELECT tw.tenant_id, tw.site_title
  INTO v_tenant_id, v_site_title
  FROM public.tenant_websites tw
  WHERE tw.id = p_website_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Website not found: %', p_website_id;
  END IF;

  IF NOT v_is_authorized THEN
    v_is_authorized := public.is_entity_member(v_tenant_id, ARRAY['owner', 'admin', 'manager'])
      OR EXISTS (
        SELECT 1 FROM public.organizers
        WHERE organizers.id = v_tenant_id
          AND organizers.user_id = v_caller_id
      );
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Forbidden: only owners, admins, and managers can publish website content';
  END IF;

  -- Atomically fetch and clear the draft matching website_id + expected_version.
  DELETE FROM public.website_content_drafts
  WHERE website_id = p_website_id
    AND (p_expected_version IS NULL OR version = p_expected_version)
  RETURNING content, version, updated_by
  INTO v_draft_content, v_draft_version, v_draft_updated_by;

  IF v_draft_content IS NULL THEN
    IF p_expected_version IS NOT NULL AND EXISTS (SELECT 1 FROM public.website_content_drafts WHERE website_id = p_website_id) THEN
      RAISE EXCEPTION 'Content draft version mismatch for website %: draft was modified concurrently (expected version %)', p_website_id, p_expected_version
        USING ERRCODE = '40001';
    ELSE
      RAISE EXCEPTION 'No content draft found for website: %', p_website_id
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Write the live content document (upsert: first publish has no live row yet).
  INSERT INTO public.website_content (website_id, content, updated_by, updated_at)
  VALUES (p_website_id, v_draft_content, v_draft_updated_by, pg_catalog.now())
  ON CONFLICT (website_id) DO UPDATE SET
    content = EXCLUDED.content,
    updated_by = EXCLUDED.updated_by,
    updated_at = pg_catalog.now();

  -- Optionally write resolver-generated page blocks in the same transaction.
  -- Each entry must be {page_id: uuid, blocks: array}; pages are verified to
  -- belong to this website so one call cannot write another tenant's pages.
  IF p_page_blocks IS NOT NULL THEN
    IF jsonb_typeof(p_page_blocks) <> 'array' THEN
      RAISE EXCEPTION 'p_page_blocks must be a JSON array of {page_id, blocks} entries';
    END IF;
    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_page_blocks) LOOP
      BEGIN
        v_page_id := (v_entry ->> 'page_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'p_page_blocks entry has an invalid page_id: %', v_entry;
      END;
      IF jsonb_typeof(v_entry -> 'blocks') <> 'array' THEN
        RAISE EXCEPTION 'p_page_blocks entry for page % must contain a blocks array', v_page_id;
      END IF;
      UPDATE public.website_pages
      SET blocks = v_entry -> 'blocks',
          updated_at = pg_catalog.now()
      WHERE id = v_page_id
        AND website_id = p_website_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Page % does not belong to website %', v_page_id, p_website_id
          USING ERRCODE = 'P0002';
      END IF;
      v_page_count := v_page_count + 1;
    END LOOP;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'website_id', p_website_id,
    'site_title', v_site_title,
    'version', v_draft_version,
    'pages_written', v_page_count,
    'published_at', pg_catalog.now()
  );
END;
$$;


--
-- Name: publish_page_draft(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_page_draft(p_page_id uuid, p_expected_version integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id UUID;
  v_tenant_id UUID;
  v_is_authorized BOOLEAN := false;
  v_draft_blocks JSONB;
  v_draft_version INTEGER;
  v_draft_updated_by UUID;
  v_page_title TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: must be authenticated';
  END IF;

  -- Check if caller is platform admin or service role
  IF auth.role() = 'service_role' THEN
    v_is_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = v_caller_id AND role = 'admin' AND status = 'active'
    ) INTO v_is_authorized;
  END IF;

  -- Resolve page and tenant
  SELECT tw.tenant_id, wp.title
  INTO v_tenant_id, v_page_title
  FROM public.website_pages wp
  JOIN public.tenant_websites tw ON tw.id = wp.website_id
  WHERE wp.id = p_page_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Page not found: %', p_page_id;
  END IF;

  -- If not platform admin/service role, check tenant ownership (owner/admin/manager)
  IF NOT v_is_authorized THEN
    v_is_authorized := public.is_entity_member(v_tenant_id, ARRAY['owner', 'admin', 'manager'])
      OR EXISTS (
        SELECT 1 FROM public.organizers
        WHERE organizers.id = v_tenant_id
          AND organizers.user_id = v_caller_id
      );
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Forbidden: only owners, admins, and managers can publish page drafts';
  END IF;

  -- Atomically fetch and clear draft matching page_id and expected_version (if provided)
  DELETE FROM public.website_page_drafts
  WHERE page_id = p_page_id
    AND (p_expected_version IS NULL OR version = p_expected_version)
  RETURNING blocks, version, updated_by
  INTO v_draft_blocks, v_draft_version, v_draft_updated_by;

  IF v_draft_blocks IS NULL THEN
    IF p_expected_version IS NOT NULL AND EXISTS (SELECT 1 FROM public.website_page_drafts WHERE page_id = p_page_id) THEN
      RAISE EXCEPTION 'Draft version mismatch for page %: draft was modified concurrently (expected version %)', p_page_id, p_expected_version
        USING ERRCODE = '40001';
    ELSE
      RAISE EXCEPTION 'No draft found for page: %', p_page_id
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Copy draft blocks to live page and set status to published
  UPDATE public.website_pages
  SET blocks = v_draft_blocks,
      status = 'published',
      updated_at = pg_catalog.now()
  WHERE id = p_page_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'page_id', p_page_id,
    'title', v_page_title,
    'version', v_draft_version,
    'published_at', pg_catalog.now()
  );
END;
$$;


--
-- Name: recalculate_event_rating(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalculate_event_rating(target_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE events
    SET 
        average_rating = COALESCE((
            SELECT ROUND(AVG(rating)::numeric, 2)
            FROM reviews
            WHERE event_id = target_id AND is_approved = true
        ), 0),
        review_count = (
            SELECT COUNT(*)
            FROM reviews
            WHERE event_id = target_id AND is_approved = true
        )
    WHERE id = target_id;
END;
$$;


--
-- Name: recalculate_fundraiser_rating(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalculate_fundraiser_rating(target_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE fundraisers
    SET 
        average_rating = COALESCE((
            SELECT ROUND(AVG(rating)::numeric, 2)
            FROM reviews
            WHERE fundraiser_id = target_id AND is_approved = true
        ), 0),
        review_count = (
            SELECT COUNT(*)
            FROM reviews
            WHERE fundraiser_id = target_id AND is_approved = true
        )
    WHERE id = target_id;
END;
$$;


--
-- Name: recalculate_organizer_rating(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalculate_organizer_rating(target_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE organizers
    SET 
        average_rating = COALESCE((
            SELECT ROUND(AVG(rating)::numeric, 2)
            FROM reviews
            WHERE organizer_id = target_id AND is_approved = true
        ), 0),
        review_count = (
            SELECT COUNT(*)
            FROM reviews
            WHERE organizer_id = target_id AND is_approved = true
        )
    WHERE id = target_id;
END;
$$;


--
-- Name: record_donation_and_credit(uuid, text, text, uuid, text, numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_donation_and_credit(p_fundraiser_id uuid, p_donor_name text, p_donor_email text, p_user_id uuid, p_message text, p_amount numeric, p_currency text, p_payment_intent_id text) RETURNS TABLE(donation_id uuid, donor_user_id uuid, is_new boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_donation_id UUID;
  v_donor_user_id UUID;
  v_xmax XID;
  v_is_new BOOLEAN;
  v_fundraiser_organizer_id UUID;
  v_fundraiser_user_id UUID;
  v_recipient_id UUID;
BEGIN
  INSERT INTO donations (
    fundraiser_id,
    donor_name,
    donor_email,
    user_id,
    message,
    amount,
    currency,
    status,
    payment_intent_id
  ) VALUES (
    p_fundraiser_id,
    COALESCE(p_donor_name, 'Anonymous'),
    p_donor_email,
    p_user_id,
    p_message,
    p_amount,
    p_currency,
    'completed',
    p_payment_intent_id
  )
  ON CONFLICT (payment_intent_id) DO UPDATE SET
    fundraiser_id = EXCLUDED.fundraiser_id,
    donor_name    = EXCLUDED.donor_name,
    donor_email   = EXCLUDED.donor_email,
    user_id       = EXCLUDED.user_id,
    message       = EXCLUDED.message,
    amount        = EXCLUDED.amount,
    currency      = EXCLUDED.currency,
    status        = EXCLUDED.status
  RETURNING id, donations.user_id, xmax
  INTO v_donation_id, v_donor_user_id, v_xmax;

  v_is_new := (v_xmax::text = '0');

  IF NOT v_is_new THEN
    RETURN QUERY SELECT v_donation_id, v_donor_user_id, v_is_new;
    RETURN;
  END IF;

  SELECT organizer_id, user_id
  INTO v_fundraiser_organizer_id, v_fundraiser_user_id
  FROM fundraisers
  WHERE id = p_fundraiser_id;

  IF v_fundraiser_organizer_id IS NOT NULL THEN
    v_recipient_id := resolve_recipient('organizer', NULL, v_fundraiser_organizer_id, NULL);
  ELSIF v_fundraiser_user_id IS NOT NULL THEN
    v_recipient_id := resolve_recipient('user', v_fundraiser_user_id, NULL, NULL);
  ELSE
    RAISE EXCEPTION
      'record_donation_and_credit: fundraiser % has no organizer_id or user_id -- cannot resolve recipient',
      p_fundraiser_id;
  END IF;

  INSERT INTO recipient_ledger_entries (
    recipient_id,
    entry_type,
    amount,
    currency,
    source_type,
    source_id,
    description
  ) VALUES (
    v_recipient_id,
    'credit',
    p_amount,
    lower(p_currency),
    'donation',
    v_donation_id,
    'Donation received'
  );

  RETURN QUERY SELECT v_donation_id, v_donor_user_id, v_is_new;
END;
$$;


--
-- Name: record_product_paid_and_credit(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_product_paid_and_credit(p_order_id uuid, p_stripe_payment_intent_id text, p_crypto_payment_id text) RETURNS TABLE(order_id uuid, product_id uuid, quantity integer, was_newly_paid boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_updated_id UUID;
  v_product_id UUID;
  v_quantity INTEGER;
  v_currency TEXT;
  v_total_amount NUMERIC;
  v_owner_id UUID;
  v_recipient_id UUID;
BEGIN
  UPDATE product_orders
  SET
    status = 'paid',
    stripe_payment_intent_id = COALESCE(p_stripe_payment_intent_id, stripe_payment_intent_id),
    crypto_payment_id        = COALESCE(p_crypto_payment_id, crypto_payment_id)
  WHERE id = p_order_id
    AND status = 'pending'
  RETURNING
    id, product_orders.product_id, product_orders.quantity,
    product_orders.currency, product_orders.total_amount
  INTO v_updated_id, v_product_id, v_quantity, v_currency, v_total_amount;

  IF v_updated_id IS NULL THEN
    SELECT product_orders.product_id, product_orders.quantity
    INTO v_product_id, v_quantity
    FROM product_orders
    WHERE id = p_order_id;

    RETURN QUERY SELECT p_order_id, v_product_id, v_quantity, false;
    RETURN;
  END IF;

  SELECT owner_id INTO v_owner_id
  FROM products
  WHERE id = v_product_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION
      'record_product_paid_and_credit: product % not found or has no owner -- cannot resolve recipient',
      v_product_id;
  END IF;

  v_recipient_id := resolve_recipient('user', v_owner_id, NULL, NULL);

  INSERT INTO recipient_ledger_entries (
    recipient_id,
    entry_type,
    amount,
    currency,
    source_type,
    source_id,
    description
  ) VALUES (
    v_recipient_id,
    'credit',
    v_total_amount,
    lower(v_currency),
    'product_order',
    v_updated_id,
    'Product order received'
  );

  RETURN QUERY SELECT v_updated_id, v_product_id, v_quantity, true;
END;
$$;


--
-- Name: record_ticket_and_credit(uuid, uuid, uuid, text, text, text, integer, numeric, text, text, text, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_ticket_and_credit(p_event_id uuid, p_ticket_id uuid, p_seat_id uuid, p_seat_label text, p_buyer_email text, p_buyer_name text, p_quantity integer, p_total_amount numeric, p_currency text, p_qr_code text DEFAULT NULL::text, p_stripe_payment_intent_id text DEFAULT NULL::text, p_stripe_session_id text DEFAULT NULL::text, p_items_json jsonb DEFAULT NULL::jsonb, p_seats_json jsonb DEFAULT NULL::jsonb) RETURNS TABLE(ticket_order_id uuid, is_new boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ticket_order_id UUID;
  v_event_organizer_id UUID;
  v_event_user_id UUID;
  v_recipient_id UUID;
  v_total_qty INTEGER := 0;
  v_item JSONB;
  v_item_ticket_id UUID;
  v_item_qty INTEGER;
  v_seat JSONB;
  v_seat_ticket_id UUID;
  v_seat_id UUID;
  v_seat_label TEXT;
  v_first_seat JSONB;
  v_primary_ticket_id UUID;
  v_primary_seat_id UUID;
  v_primary_seat_label TEXT;
  i INTEGER;
BEGIN
  -- Idempotency check: if payment_intent_id already exists, return existing order_id and false
  IF p_stripe_payment_intent_id IS NOT NULL THEN
    SELECT id INTO v_ticket_order_id
    FROM ticket_orders
    WHERE stripe_payment_intent_id = p_stripe_payment_intent_id;

    IF v_ticket_order_id IS NOT NULL THEN
      RETURN QUERY SELECT v_ticket_order_id, false;
      RETURN;
    END IF;
  END IF;

  -- Idempotency check: if stripe_session_id already exists
  IF p_stripe_session_id IS NOT NULL THEN
    SELECT id INTO v_ticket_order_id
    FROM ticket_orders
    WHERE stripe_session_id = p_stripe_session_id;

    IF v_ticket_order_id IS NOT NULL THEN
      RETURN QUERY SELECT v_ticket_order_id, false;
      RETURN;
    END IF;
  END IF;

  -- Calculate total quantity
  IF p_seats_json IS NOT NULL AND jsonb_array_length(p_seats_json) > 0 THEN
    v_total_qty := jsonb_array_length(p_seats_json);
  ELSIF p_items_json IS NOT NULL AND jsonb_array_length(p_items_json) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_json) LOOP
      v_total_qty := v_total_qty + COALESCE((v_item->>'quantity')::INTEGER, 1);
    END LOOP;
  ELSE
    v_total_qty := GREATEST(1, COALESCE(p_quantity, 1));
  END IF;

  -- Derive primary ticket_id, seat_id, seat_label
  IF p_seats_json IS NOT NULL AND jsonb_array_length(p_seats_json) > 0 THEN
    v_first_seat := p_seats_json->0;
    v_primary_ticket_id := COALESCE(
      p_ticket_id,
      NULLIF(v_first_seat->>'ticket_id', '')::UUID,
      NULLIF(v_first_seat->>'t', '')::UUID
    );
    v_primary_seat_id := COALESCE(
      p_seat_id,
      NULLIF(v_first_seat->>'seat_id', '')::UUID,
      NULLIF(v_first_seat->>'id', '')::UUID,
      NULLIF(v_first_seat->>'s', '')::UUID
    );
    v_primary_seat_label := COALESCE(
      p_seat_label,
      v_first_seat->>'seat_label',
      v_first_seat->>'label',
      v_first_seat->>'l'
    );
  ELSE
    v_primary_ticket_id := p_ticket_id;
    v_primary_seat_id := p_seat_id;
    v_primary_seat_label := p_seat_label;
  END IF;

  -- Insert 1 summary ticket_orders row
  INSERT INTO ticket_orders (
    event_id,
    ticket_id,
    seat_id,
    seat_label,
    buyer_email,
    buyer_name,
    quantity,
    total_amount,
    currency,
    qr_code,
    status,
    stripe_payment_intent_id,
    stripe_session_id
  ) VALUES (
    p_event_id,
    v_primary_ticket_id,
    v_primary_seat_id,
    v_primary_seat_label,
    p_buyer_email,
    p_buyer_name,
    v_total_qty,
    p_total_amount,
    p_currency,
    p_qr_code,
    'valid',
    p_stripe_payment_intent_id,
    p_stripe_session_id
  )
  RETURNING id INTO v_ticket_order_id;

  -- Insert ticket_instances:
  -- Path A: Multi-seat order (p_seats_json provided)
  IF p_seats_json IS NOT NULL AND jsonb_array_length(p_seats_json) > 0 THEN
    FOR v_seat IN SELECT * FROM jsonb_array_elements(p_seats_json) LOOP
      v_seat_ticket_id := COALESCE(
        NULLIF(v_seat->>'ticket_id', '')::UUID,
        NULLIF(v_seat->>'t', '')::UUID,
        p_ticket_id
      );
      v_seat_id := COALESCE(
        NULLIF(v_seat->>'seat_id', '')::UUID,
        NULLIF(v_seat->>'id', '')::UUID,
        NULLIF(v_seat->>'s', '')::UUID
      );
      v_seat_label := COALESCE(
        v_seat->>'seat_label',
        v_seat->>'label',
        v_seat->>'l'
      );

      -- Safety guard: Stale-hold double-sell race condition check.
      -- If another order already holds an active (non-cancelled, non-refunded) instance
      -- for this seat, abort immediately so the webhook reconciliation alert is triggered.
      IF v_seat_id IS NOT NULL THEN
        IF EXISTS (
          SELECT 1
          FROM ticket_instances
          WHERE seat_id = v_seat_id
            AND event_id = p_event_id
            AND order_id <> v_ticket_order_id
            AND status NOT IN ('cancelled', 'refunded')
        ) THEN
          RAISE EXCEPTION 'SEAT_ALREADY_ASSIGNED: seat % already sold to a different order', v_seat_id;
        END IF;
      END IF;

      INSERT INTO ticket_instances (
        order_id,
        event_id,
        ticket_id,
        seat_id,
        seat_label,
        qr_code,
        status
      ) VALUES (
        v_ticket_order_id,
        p_event_id,
        v_seat_ticket_id,
        v_seat_id,
        v_seat_label,
        UPPER(REPLACE(GEN_RANDOM_UUID()::text, '-', '')),
        'valid'
      );
    END LOOP;

    -- Update seats to sold
    UPDATE seats
    SET status = 'sold', reserved_until = NULL
    WHERE id IN (
      SELECT COALESCE(
        NULLIF(s->>'seat_id', '')::UUID,
        NULLIF(s->>'id', '')::UUID,
        NULLIF(s->>'s', '')::UUID
      )
      FROM jsonb_array_elements(p_seats_json) s
      WHERE COALESCE(
        NULLIF(s->>'seat_id', '')::UUID,
        NULLIF(s->>'id', '')::UUID,
        NULLIF(s->>'s', '')::UUID
      ) IS NOT NULL
    );

  -- Path B: Non-seat multi-tier order (p_items_json provided)
  ELSIF p_items_json IS NOT NULL AND jsonb_array_length(p_items_json) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_json) LOOP
      v_item_ticket_id := (v_item->>'ticket_id')::UUID;
      v_item_qty := COALESCE((v_item->>'quantity')::INTEGER, 1);

      FOR i IN 1..v_item_qty LOOP
        INSERT INTO ticket_instances (
          order_id,
          event_id,
          ticket_id,
          seat_id,
          seat_label,
          qr_code,
          status
        ) VALUES (
          v_ticket_order_id,
          p_event_id,
          v_item_ticket_id,
          p_seat_id,
          p_seat_label,
          UPPER(REPLACE(GEN_RANDOM_UUID()::text, '-', '')),
          'valid'
        );
      END LOOP;
    END LOOP;

    IF p_seat_id IS NOT NULL THEN
      UPDATE seats
      SET status = 'sold', reserved_until = NULL
      WHERE id = p_seat_id;
    END IF;

  -- Path C: Legacy single-tier order
  ELSE
    FOR i IN 1..v_total_qty LOOP
      INSERT INTO ticket_instances (
        order_id,
        event_id,
        ticket_id,
        seat_id,
        seat_label,
        qr_code,
        status
      ) VALUES (
        v_ticket_order_id,
        p_event_id,
        p_ticket_id,
        p_seat_id,
        p_seat_label,
        UPPER(REPLACE(GEN_RANDOM_UUID()::text, '-', '')),
        'valid'
      );
    END LOOP;

    IF p_seat_id IS NOT NULL THEN
      UPDATE seats
      SET status = 'sold', reserved_until = NULL
      WHERE id = p_seat_id;
    END IF;
  END IF;

  -- Recipient resolution & single ledger credit
  SELECT organizer_id, user_id
  INTO v_event_organizer_id, v_event_user_id
  FROM events
  WHERE id = p_event_id;

  IF v_event_organizer_id IS NOT NULL THEN
    v_recipient_id := resolve_recipient('organizer', NULL, v_event_organizer_id, NULL);
  ELSIF v_event_user_id IS NOT NULL THEN
    v_recipient_id := resolve_recipient('user', v_event_user_id, NULL, NULL);
  ELSE
    RAISE EXCEPTION
      'record_ticket_and_credit: event % has no organizer_id or user_id -- cannot resolve recipient',
      p_event_id;
  END IF;

  INSERT INTO recipient_ledger_entries (
    recipient_id,
    entry_type,
    amount,
    currency,
    source_type,
    source_id,
    description
  ) VALUES (
    v_recipient_id,
    'credit',
    p_total_amount,
    lower(p_currency),
    'ticket_order',
    v_ticket_order_id,
    'Ticket order received'
  );

  RETURN QUERY SELECT v_ticket_order_id, true;
END;
$$;


--
-- Name: refund_ticket_instance(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refund_ticket_instance(p_ticket_instance_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_updated_id UUID;
  v_current_status TEXT;
BEGIN
  UPDATE ticket_instances
  SET status = 'refunded',
      updated_at = NOW()
  WHERE id = p_ticket_instance_id
    AND status = 'valid'
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NOT NULL THEN
    RETURN v_updated_id;
  END IF;

  SELECT status INTO v_current_status
  FROM ticket_instances
  WHERE id = p_ticket_instance_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'TICKET_NOT_FOUND';
  ELSIF v_current_status = 'used' THEN
    RAISE EXCEPTION 'CANNOT_REFUND_TICKET';
  ELSIF v_current_status = 'refunded' THEN
    RAISE EXCEPTION 'ALREADY_REFUNDED';
  ELSIF v_current_status = 'cancelled' THEN
    RAISE EXCEPTION 'TICKET_CANCELLED';
  ELSE
    RAISE EXCEPTION 'TICKET_NOT_VALID';
  END IF;
END;
$$;


--
-- Name: reject_agent_memory_versions_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_agent_memory_versions_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'agent_memory_versions is append-only (INSERT only)';
  RETURN NULL;
END;
$$;


--
-- Name: release_expired_seat_reservations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_expired_seat_reservations() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE seats
  SET status = 'available', reserved_until = NULL
  WHERE status = 'reserved'
    AND reserved_until IS NOT NULL
    AND reserved_until < NOW();
END;
$$;


--
-- Name: remove_deleted_menu_option_from_assignments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_deleted_menu_option_from_assignments() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- ON DELETE CASCADE removes the parent group before its child option rows.
  -- Do not update assignments after the group has disappeared; their own FK
  -- cascade will remove them without invoking the assignment UPDATE validator.
  IF NOT EXISTS (
    SELECT 1 FROM public.menu_option_groups WHERE id = OLD.group_id
  ) THEN
    RETURN OLD;
  END IF;

  UPDATE public.menu_item_option_groups
     SET hidden_option_ids = array_remove(hidden_option_ids, OLD.id),
         price_overrides = price_overrides - OLD.id::text
   WHERE group_id = OLD.group_id
     AND (OLD.id = ANY(hidden_option_ids) OR price_overrides ? OLD.id::text);
  RETURN OLD;
END;
$$;


--
-- Name: request_payout_and_debit(uuid, numeric, text, text, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_payout_and_debit(p_recipient_id uuid, p_amount numeric, p_currency text, p_destination_type text, p_destination_reference text, p_requested_by uuid, p_client_idempotency_key text DEFAULT NULL::text) RETURNS TABLE(payout_id uuid, ledger_entry_id uuid, new_balance numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_currency TEXT;
  v_existing_payout_id UUID;
  v_existing_ledger_id UUID;
  v_payout_id UUID;
  v_ledger_entry_id UUID;
  v_current_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'request_payout_and_debit: amount must be greater than zero';
  END IF;

  v_currency := lower(p_currency);

  -- 1. Idempotency fast-path
  IF p_client_idempotency_key IS NOT NULL THEN
    SELECT payouts.id INTO v_existing_payout_id
    FROM payouts
    WHERE payouts.client_idempotency_key = p_client_idempotency_key;

    IF v_existing_payout_id IS NOT NULL THEN
      SELECT recipient_ledger_entries.id INTO v_existing_ledger_id
      FROM recipient_ledger_entries
      WHERE recipient_ledger_entries.source_type = 'payout'
        AND recipient_ledger_entries.source_id = v_existing_payout_id
        AND recipient_ledger_entries.entry_type = 'payout';

      v_current_balance := get_recipient_balance(p_recipient_id, v_currency);
      RETURN QUERY SELECT v_existing_payout_id, v_existing_ledger_id, v_current_balance;
      RETURN;
    END IF;
  END IF;

  -- 2. Lock recipient row for update to prevent concurrent double-spend overdrafts
  PERFORM 1 FROM recipients WHERE recipients.id = p_recipient_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_payout_and_debit: recipient % not found', p_recipient_id;
  END IF;

  -- 3. Check available balance
  v_current_balance := get_recipient_balance(p_recipient_id, v_currency);
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'request_payout_and_debit: insufficient balance (% available, % requested)',
      v_current_balance, p_amount;
  END IF;

  -- 4. Create payout row
  INSERT INTO payouts (
    recipient_id,
    amount,
    currency,
    status,
    destination_type,
    destination_reference,
    client_idempotency_key,
    requested_by
  ) VALUES (
    p_recipient_id,
    p_amount,
    v_currency,
    'requested',
    p_destination_type,
    p_destination_reference,
    p_client_idempotency_key,
    p_requested_by
  ) RETURNING payouts.id INTO v_payout_id;

  -- 5. Insert negative payout ledger entry
  INSERT INTO recipient_ledger_entries (
    recipient_id,
    entry_type,
    amount,
    currency,
    source_type,
    source_id,
    description,
    created_by
  ) VALUES (
    p_recipient_id,
    'payout',
    -p_amount,
    v_currency,
    'payout',
    v_payout_id,
    'Payout requested',
    p_requested_by
  ) RETURNING recipient_ledger_entries.id INTO v_ledger_entry_id;

  RETURN QUERY SELECT v_payout_id, v_ledger_entry_id, (v_current_balance - p_amount);
END;
$$;


--
-- Name: reserve_public_media_upload(uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_public_media_upload(p_user_id uuid, p_bytes bigint) RETURNS TABLE(allowed boolean, remaining_count integer, remaining_bytes bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_count INTEGER;
  v_bytes BIGINT;
BEGIN
  IF p_user_id IS NULL OR p_bytes IS NULL OR p_bytes < 1 OR p_bytes > 209715200 THEN
    RETURN QUERY SELECT FALSE, 0, 0::BIGINT;
    RETURN;
  END IF;

  INSERT INTO public.public_media_upload_daily_quota AS current_quota
    (user_id, quota_date, upload_count, uploaded_bytes)
  VALUES (p_user_id, (timezone('utc', now()))::DATE, 1, p_bytes)
  ON CONFLICT (user_id, quota_date) DO UPDATE
    SET upload_count = current_quota.upload_count + 1,
        uploaded_bytes = current_quota.uploaded_bytes + EXCLUDED.uploaded_bytes
    WHERE current_quota.upload_count < 40
      AND current_quota.uploaded_bytes + EXCLUDED.uploaded_bytes <= 209715200
  RETURNING upload_count, uploaded_bytes INTO v_count, v_bytes;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0, 0::BIGINT;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, 40 - v_count, 209715200 - v_bytes;
END;
$$;


--
-- Name: reserve_public_media_upload(uuid, bigint, integer, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_public_media_upload(p_user_id uuid, p_bytes bigint, p_max_count integer, p_max_bytes bigint) RETURNS TABLE(allowed boolean, remaining_count integer, remaining_bytes bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_count INTEGER;
  v_bytes BIGINT;
BEGIN
  IF p_user_id IS NULL
    OR p_bytes IS NULL
    OR p_max_count IS NULL
    OR p_max_bytes IS NULL
    OR p_bytes < 1
    OR p_max_count < 1
    OR p_max_bytes < 1
    OR p_bytes > p_max_bytes THEN
    RETURN QUERY SELECT FALSE, 0, 0::BIGINT;
    RETURN;
  END IF;

  INSERT INTO public.public_media_upload_daily_quota AS current_quota
    (user_id, quota_date, upload_count, uploaded_bytes)
  VALUES (p_user_id, (timezone('utc', now()))::DATE, 1, p_bytes)
  ON CONFLICT (user_id, quota_date) DO UPDATE
    SET upload_count = current_quota.upload_count + 1,
        uploaded_bytes = current_quota.uploaded_bytes + EXCLUDED.uploaded_bytes
    WHERE current_quota.upload_count < p_max_count
      AND current_quota.uploaded_bytes + EXCLUDED.uploaded_bytes <= p_max_bytes
  RETURNING upload_count, uploaded_bytes INTO v_count, v_bytes;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0, 0::BIGINT;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, p_max_count - v_count, p_max_bytes - v_bytes;
END;
$$;


--
-- Name: reserve_seats_atomic(uuid[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_seats_atomic(p_seat_ids uuid[], p_hold_duration_minutes integer DEFAULT 5) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_seat RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_reserved_until TIMESTAMPTZ := v_now + (p_hold_duration_minutes * INTERVAL '1 minute');
  v_unavailable_ids UUID[] := ARRAY[]::UUID[];
  v_reserved_count INT := 0;
BEGIN
  IF p_seat_ids IS NULL OR cardinality(p_seat_ids) = 0 THEN
    RAISE EXCEPTION 'NO_SEATS_PROVIDED';
  END IF;

  -- Lock all target seats with FOR UPDATE in deterministic order to prevent deadlocks
  FOR v_seat IN (
    SELECT id, status, reserved_until, assigned_invitation_id
    FROM seats
    WHERE id = ANY(p_seat_ids)
    ORDER BY id
    FOR UPDATE
  ) LOOP
    -- Check if seat is sold, unavailable, active-reserved, or assigned to an active invitation
    IF v_seat.status = 'sold'
       OR v_seat.status = 'unavailable'
       OR v_seat.assigned_invitation_id IS NOT NULL
       OR (v_seat.status = 'reserved' AND v_seat.reserved_until IS NOT NULL AND v_seat.reserved_until > v_now)
    THEN
      v_unavailable_ids := array_append(v_unavailable_ids, v_seat.id);
    END IF;
  END LOOP;

  -- If any requested seat is unavailable or missing from lock set, abort with details
  IF cardinality(v_unavailable_ids) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Some seats are no longer available.',
      'unavailable_ids', to_jsonb(v_unavailable_ids)
    );
  END IF;

  -- Verify all requested seats exist
  SELECT COUNT(*) INTO v_reserved_count FROM seats WHERE id = ANY(p_seat_ids);
  IF v_reserved_count <> cardinality(p_seat_ids) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'One or more seat IDs do not exist.'
    );
  END IF;

  -- Atomically apply reservation hold
  UPDATE seats
  SET status = 'reserved',
      reserved_until = v_reserved_until
  WHERE id = ANY(p_seat_ids);

  RETURN jsonb_build_object(
    'success', true,
    'reserved_until', v_reserved_until,
    'seat_ids', to_jsonb(p_seat_ids)
  );
END;
$$;


--
-- Name: resolve_courier_offers_on_order_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_courier_offers_on_order_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status IN ('picked_up', 'out_for_delivery') THEN
    UPDATE public.business_courier_offers
       SET status = 'taken',
           resolved_at = clock_timestamp(),
           updated_at = clock_timestamp()
     WHERE order_id = NEW.id
       AND status = 'offered';

    IF NEW.courier_worker_id IS NOT NULL THEN
      UPDATE public.business_courier_offers
         SET status = 'withdrawn',
             resolved_at = clock_timestamp(),
             updated_at = clock_timestamp()
       WHERE courier_worker_id = NEW.courier_worker_id
         AND order_id <> NEW.id
         AND status = 'offered';
    END IF;
  ELSIF NEW.status = 'cancelled' THEN
    UPDATE public.business_courier_offers
       SET status = 'cancelled',
           resolved_at = clock_timestamp(),
           updated_at = clock_timestamp()
     WHERE order_id = NEW.id
       AND status = 'offered';
  END IF;

  IF OLD.status IN ('picked_up', 'out_for_delivery')
     AND NEW.status = 'delivered'
     AND OLD.courier_worker_id IS NOT NULL THEN
    INSERT INTO public.business_courier_offers AS existing_offer (
      order_id, business_id, courier_worker_id, status
    )
    SELECT ready_order.id, ready_order.business_id, w.id, 'offered'
      FROM public.business_workers AS w
      JOIN public.orders AS ready_order
        ON ready_order.business_id = w.business_id
     WHERE w.id = OLD.courier_worker_id
       AND w.role = 'courier'
       AND w.is_active = true
       AND w.deactivated_at IS NULL
       AND w.is_available = true
       AND EXISTS (
         SELECT 1
           FROM public.business_worker_invitations AS accepted_invitation
          WHERE accepted_invitation.worker_id = w.id
            AND accepted_invitation.accepted_at IS NOT NULL
            AND accepted_invitation.revoked_at IS NULL
       )
       AND ready_order.status = 'ready'
       AND ready_order.courier_worker_id IS NULL
       AND ready_order.fulfilment_type = 'delivery'
       AND NOT EXISTS (
         SELECT 1
           FROM public.orders AS active_order
          WHERE active_order.courier_worker_id = w.id
            AND active_order.status IN ('ready', 'picked_up', 'out_for_delivery')
       )
    FOR UPDATE OF w
    ON CONFLICT (order_id, courier_worker_id) DO UPDATE
      SET status = 'offered',
          offered_at = clock_timestamp(),
          accepted_at = NULL,
          declined_at = NULL,
          decline_message = NULL,
          resolved_at = NULL,
          updated_at = clock_timestamp()
    WHERE existing_offer.status = 'withdrawn';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: resolve_recipient(text, uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_recipient(p_recipient_type text, p_user_id uuid DEFAULT NULL::uuid, p_organizer_id uuid DEFAULT NULL::uuid, p_business_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  result_id UUID;
BEGIN
  IF p_recipient_type = 'user' THEN
    IF p_user_id IS NULL OR p_organizer_id IS NOT NULL OR p_business_id IS NOT NULL THEN
      RAISE EXCEPTION 'resolve_recipient: user recipient requires user_id only';
    END IF;

    INSERT INTO recipients (recipient_type, user_id)
    VALUES ('user', p_user_id)
    ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO NOTHING
    RETURNING id INTO result_id;

    IF result_id IS NULL THEN
      SELECT id INTO result_id FROM recipients WHERE user_id = p_user_id;
    END IF;

  ELSIF p_recipient_type = 'organizer' THEN
    IF p_organizer_id IS NULL OR p_user_id IS NOT NULL OR p_business_id IS NOT NULL THEN
      RAISE EXCEPTION 'resolve_recipient: organizer recipient requires organizer_id only';
    END IF;

    INSERT INTO recipients (recipient_type, organizer_id)
    VALUES ('organizer', p_organizer_id)
    ON CONFLICT (organizer_id) WHERE organizer_id IS NOT NULL DO NOTHING
    RETURNING id INTO result_id;

    IF result_id IS NULL THEN
      SELECT id INTO result_id FROM recipients WHERE organizer_id = p_organizer_id;
    END IF;

  ELSIF p_recipient_type = 'business' THEN
    IF p_business_id IS NULL OR p_user_id IS NOT NULL OR p_organizer_id IS NOT NULL THEN
      RAISE EXCEPTION 'resolve_recipient: business recipient requires business_id only';
    END IF;

    INSERT INTO recipients (recipient_type, business_id)
    VALUES ('business', p_business_id)
    ON CONFLICT (business_id) WHERE business_id IS NOT NULL DO NOTHING
    RETURNING id INTO result_id;

    IF result_id IS NULL THEN
      SELECT id INTO result_id FROM recipients WHERE business_id = p_business_id;
    END IF;

  ELSE
    RAISE EXCEPTION 'resolve_recipient: unknown recipient_type %', p_recipient_type;
  END IF;

  RETURN result_id;
END;
$$;


--
-- Name: revoke_business_worker_access_on_deactivation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_business_worker_access_on_deactivation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
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
$$;


--
-- Name: set_beneficiary_slug(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_beneficiary_slug() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := beneficiary_slugify(NEW.name, coalesce(NEW.id, gen_random_uuid()));
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_menu_option_group_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_menu_option_group_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: set_menu_promotion_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_menu_promotion_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: set_unified_invitation_template(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_unified_invitation_template(p_event_id uuid, p_card_template_id uuid, p_page_template_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_kind TEXT;
BEGIN
  SELECT kind INTO v_kind FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND';
  END IF;
  IF v_kind IS DISTINCT FROM 'invitation' THEN
    RAISE EXCEPTION 'NOT_INVITATION_KIND';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.invitation_templates
    WHERE id = p_card_template_id AND is_active
  ) THEN
    RAISE EXCEPTION 'UNKNOWN_CARD_TEMPLATE';
  END IF;

  UPDATE public.events
  SET invitation_template_id = p_card_template_id
  WHERE id = p_event_id;

  INSERT INTO public.event_invitation_pages (event_id, template_id)
  VALUES (p_event_id, p_page_template_id)
  ON CONFLICT (event_id) DO UPDATE SET
    template_id = EXCLUDED.template_id,
    updated_at = now();
END;
$$;


--
-- Name: set_website_content_draft_metadata(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_website_content_draft_metadata() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.version := 1;
  ELSE
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_website_content_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_website_content_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;


--
-- Name: set_website_page_draft_metadata(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_website_page_draft_metadata() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.version := 1;
  ELSE
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: sync_courier_availability_and_offer_ready_deliveries(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_courier_availability_and_offer_ready_deliveries() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_order_id uuid;
BEGIN
  IF TG_WHEN = 'BEFORE' THEN
    IF NEW.is_active = false OR NEW.deactivated_at IS NOT NULL THEN
      NEW.is_available := false;
      UPDATE public.business_courier_offers
         SET status = 'withdrawn', resolved_at = clock_timestamp(), updated_at = clock_timestamp()
       WHERE courier_worker_id = NEW.id AND status = 'offered';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP <> 'UPDATE'
     OR NEW.role <> 'courier'
     OR OLD.is_available IS NOT DISTINCT FROM NEW.is_available THEN
    RETURN NEW;
  END IF;

  IF NEW.is_available = false THEN
    UPDATE public.business_courier_offers
       SET status = 'withdrawn', resolved_at = clock_timestamp(), updated_at = clock_timestamp()
     WHERE courier_worker_id = NEW.id AND status = 'offered';
    RETURN NEW;
  END IF;

  IF NEW.is_active IS DISTINCT FROM true OR NEW.deactivated_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_worker_invitations AS accepted_invitation
     WHERE accepted_invitation.worker_id = NEW.id
       AND accepted_invitation.accepted_at IS NOT NULL
       AND accepted_invitation.revoked_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  FOR v_order_id IN
    SELECT order_row.id
      FROM public.orders AS order_row
     WHERE order_row.business_id = NEW.business_id
       AND order_row.status IN ('accepted', 'preparing', 'ready')
       AND order_row.fulfilment_type = 'delivery'
       AND order_row.estimated_ready_at IS NOT NULL
       AND order_row.courier_worker_id IS NULL
  LOOP
    PERFORM public.dispatch_business_courier_order(v_order_id, false);
  END LOOP;

  RETURN NEW;
END;
$$;


--
-- Name: sync_website_blocks_layout(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_website_blocks_layout() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_theme JSONB := '{}'::jsonb;
BEGIN
  IF TG_OP = 'UPDATE'
     AND jsonb_typeof(OLD.blocks_layout -> 'global_theme') = 'object' THEN
    v_theme := OLD.blocks_layout -> 'global_theme';
  END IF;

  IF NEW.blocks_layout IS NULL
     OR (TG_OP = 'UPDATE'
         AND NEW.blocks IS DISTINCT FROM OLD.blocks
         AND NEW.blocks_layout IS NOT DISTINCT FROM OLD.blocks_layout) THEN
    NEW.blocks_layout := public.make_page_blocks_layout(NEW.blocks, v_theme);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: touch_conversation_last_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_conversation_last_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;


--
-- Name: transition_payout_processing(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transition_payout_processing(p_payout_id uuid, p_processed_by uuid) RETURNS TABLE(payout_id uuid, status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_current_status TEXT;
  v_updated_id UUID;
  v_updated_status TEXT;
BEGIN
  SELECT payouts.status INTO v_current_status
  FROM payouts
  WHERE payouts.id = p_payout_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'transition_payout_processing: payout % not found', p_payout_id;
  END IF;

  -- Idempotency check: if already processing, return cleanly
  IF v_current_status = 'processing' THEN
    RETURN QUERY SELECT p_payout_id, 'processing'::TEXT;
    RETURN;
  END IF;

  UPDATE payouts
  SET
    status = 'processing',
    processed_by = COALESCE(p_processed_by, payouts.processed_by),
    updated_at = now()
  WHERE payouts.id = p_payout_id
    AND payouts.status = 'requested'
  RETURNING payouts.id, payouts.status INTO v_updated_id, v_updated_status;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'transition_payout_processing: cannot transition payout % from status %',
      p_payout_id, v_current_status;
  END IF;

  RETURN QUERY SELECT v_updated_id, v_updated_status;
END;
$$;


--
-- Name: trg_link_business_organizer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_link_business_organizer() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.organizer_id IS NULL THEN
    NEW.organizer_id := ensure_business_organizer(NEW);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_seed_organizer_owner_member(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_seed_organizer_owner_member() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO entity_members (organizer_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner')
  ON CONFLICT (organizer_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: update_agent_memory_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_agent_memory_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_agent_tasks_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_agent_tasks_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


--
-- Name: update_agents_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_agents_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_ai_provider_configs_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_ai_provider_configs_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_articles_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_articles_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();

  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at = now();
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: update_business_branches_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_business_branches_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_businesses_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_businesses_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_channel_assets_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_channel_assets_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_connected_accounts_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_connected_accounts_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_conversations_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_conversations_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_customer_identities_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_customer_identities_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_event_invitation_pages_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_event_invitation_pages_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_fundraiser_raised(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_fundraiser_raised() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  total numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO total
  FROM donations
  WHERE fundraiser_id = NEW.fundraiser_id
    AND status = 'completed';

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fundraisers'
      AND column_name = 'raised'
  ) THEN
    UPDATE fundraisers
    SET raised = total
    WHERE id = NEW.fundraiser_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fundraisers'
      AND column_name = 'raised_amount'
  ) THEN
    UPDATE fundraisers
    SET raised_amount = total
    WHERE id = NEW.fundraiser_id;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: update_homepage_promotions_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_homepage_promotions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_incidents_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_incidents_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


--
-- Name: update_knowledge_documents_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_knowledge_documents_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_menu_items_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_menu_items_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_menu_sections_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_menu_sections_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_notification_preferences_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_notification_preferences_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_organizers_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_organizers_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_product_orders_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_product_orders_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_products_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_products_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_promo_codes_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_promo_codes_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_rating_aggregates(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_rating_aggregates() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    target_event_id UUID;
    target_fundraiser_id UUID;
    target_organizer_id UUID;
BEGIN
    -- Determine which targets to update based on operation
    IF TG_OP = 'DELETE' THEN
        target_event_id := OLD.event_id;
        target_fundraiser_id := OLD.fundraiser_id;
        target_organizer_id := OLD.organizer_id;
    ELSE
        target_event_id := NEW.event_id;
        target_fundraiser_id := NEW.fundraiser_id;
        target_organizer_id := NEW.organizer_id;
        
        -- If update changes the target, recalculate the old targets too
        IF TG_OP = 'UPDATE' THEN
            IF OLD.event_id IS DISTINCT FROM NEW.event_id AND OLD.event_id IS NOT NULL THEN
                PERFORM recalculate_event_rating(OLD.event_id);
            END IF;
            IF OLD.fundraiser_id IS DISTINCT FROM NEW.fundraiser_id AND OLD.fundraiser_id IS NOT NULL THEN
                PERFORM recalculate_fundraiser_rating(OLD.fundraiser_id);
            END IF;
            IF OLD.organizer_id IS DISTINCT FROM NEW.organizer_id AND OLD.organizer_id IS NOT NULL THEN
                PERFORM recalculate_organizer_rating(OLD.organizer_id);
            END IF;
        END IF;
    END IF;

    -- Recalculate new/current targets
    IF target_event_id IS NOT NULL THEN
        PERFORM recalculate_event_rating(target_event_id);
    END IF;
    IF target_fundraiser_id IS NOT NULL THEN
        PERFORM recalculate_fundraiser_rating(target_fundraiser_id);
    END IF;
    IF target_organizer_id IS NOT NULL THEN
        PERFORM recalculate_organizer_rating(target_organizer_id);
    END IF;

    RETURN NULL;
END;
$$;


--
-- Name: update_service_tiers_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_service_tiers_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_services_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_services_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_tenant_websites_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_tenant_websites_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_tool_definitions_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_tool_definitions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_website_navigation_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_website_navigation_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_website_pages_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_website_pages_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: upgrade_menu_item_option_groups(uuid, uuid, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upgrade_menu_item_option_groups(p_item_id uuid, p_organizer_id uuid, p_groups jsonb, p_options jsonb, p_assignments jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_group record;
  v_option_signature jsonb;
  v_target_group_id uuid;
  v_group_map jsonb := '{}'::jsonb;
BEGIN
  PERFORM 1 FROM public.menu_items
   WHERE id = p_item_id AND organizer_id = p_organizer_id AND options_source = 'json'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menu item is missing, belongs to another organizer, or is already normalized'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(COALESCE(p_groups, '[]'::jsonb)) AS row_data(
        id uuid, organizer_id uuid
      )
     WHERE organizer_id IS DISTINCT FROM p_organizer_id
  ) THEN
    RAISE EXCEPTION 'Every upgraded menu option group must belong to the item organizer'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(COALESCE(p_options, '[]'::jsonb)) AS row_data(
        group_id uuid, organizer_id uuid
      )
     WHERE organizer_id IS DISTINCT FROM p_organizer_id
        OR NOT EXISTS (
          SELECT 1
            FROM jsonb_to_recordset(COALESCE(p_groups, '[]'::jsonb)) AS input_group(id uuid)
           WHERE input_group.id = row_data.group_id
        )
  ) THEN
    RAISE EXCEPTION 'Every upgraded option must belong to an upgraded group and the item organizer'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(COALESCE(p_assignments, '[]'::jsonb)) AS row_data(
        item_id uuid, group_id uuid, organizer_id uuid
      )
     WHERE item_id IS DISTINCT FROM p_item_id
        OR organizer_id IS DISTINCT FROM p_organizer_id
        OR NOT EXISTS (
          SELECT 1
            FROM jsonb_to_recordset(COALESCE(p_groups, '[]'::jsonb)) AS input_group(id uuid)
           WHERE input_group.id = row_data.group_id
        )
  ) THEN
    RAISE EXCEPTION 'Every upgraded assignment must match the item, organizer, and upgraded groups'
      USING ERRCODE = '23514';
  END IF;

  -- Reuse active, organizer-owned groups only when their normalized name,
  -- selection rules, and complete ordered option configuration are identical.
  FOR v_group IN
    SELECT *
      FROM jsonb_to_recordset(COALESCE(p_groups, '[]'::jsonb)) AS row_data(
        id uuid, organizer_id uuid, name text, kind text, min_select integer,
        max_select integer, is_required boolean, position integer, is_active boolean,
        legacy_source_item_id uuid, legacy_group_id text
      )
  LOOP
    SELECT COALESCE(jsonb_agg(option_signature ORDER BY option_signature::text), '[]'::jsonb)
      INTO v_option_signature
      FROM (
        SELECT jsonb_build_object(
          'name', lower(regexp_replace(btrim(option_row.name), '[[:space:]]+', ' ', 'g')),
          'description', CASE WHEN option_row.description IS NULL THEN NULL ELSE lower(regexp_replace(btrim(option_row.description), '[[:space:]]+', ' ', 'g')) END,
          'price', option_row.price,
          'image_url', option_row.image_url,
          'is_default', option_row.is_default,
          'max_qty', option_row.max_qty,
          'is_available', option_row.is_available,
          'allergens', to_jsonb(ARRAY(
            SELECT DISTINCT lower(allergen)
              FROM unnest(COALESCE(option_row.allergens, '{}'::text[])) AS allergy(allergen)
             ORDER BY lower(allergen)
          )),
          'position', option_row.position
        ) AS option_signature
          FROM jsonb_to_recordset(COALESCE(p_options, '[]'::jsonb)) AS option_row(
            group_id uuid, name text, description text, price numeric, image_url text,
            is_default boolean, max_qty integer, is_available boolean, allergens text[],
            position integer
          )
         WHERE option_row.group_id = v_group.id
      ) AS incoming_options;

    SELECT candidate.id
      INTO v_target_group_id
      FROM public.menu_option_groups AS candidate
     WHERE candidate.organizer_id = p_organizer_id
       AND candidate.is_active = true
       AND lower(regexp_replace(btrim(candidate.name), '[[:space:]]+', ' ', 'g'))
           = lower(regexp_replace(btrim(v_group.name), '[[:space:]]+', ' ', 'g'))
       AND candidate.kind = v_group.kind
       AND candidate.min_select = v_group.min_select
       AND candidate.max_select = v_group.max_select
       AND candidate.is_required = v_group.is_required
       AND COALESCE((
         SELECT jsonb_agg(option_signature ORDER BY option_signature::text)
           FROM (
             SELECT jsonb_build_object(
               'name', lower(regexp_replace(btrim(existing_option.name), '[[:space:]]+', ' ', 'g')),
               'description', CASE WHEN existing_option.description IS NULL THEN NULL ELSE lower(regexp_replace(btrim(existing_option.description), '[[:space:]]+', ' ', 'g')) END,
               'price', existing_option.price,
               'image_url', existing_option.image_url,
               'is_default', existing_option.is_default,
               'max_qty', existing_option.max_qty,
               'is_available', existing_option.is_available,
               'allergens', to_jsonb(ARRAY(
                 SELECT DISTINCT lower(allergen)
                   FROM unnest(COALESCE(existing_option.allergens, '{}'::text[])) AS allergy(allergen)
                  ORDER BY lower(allergen)
               )),
               'position', existing_option.position
             ) AS option_signature
               FROM public.menu_options AS existing_option
              WHERE existing_option.group_id = candidate.id
           ) AS existing_options
       ), '[]'::jsonb) = v_option_signature
     ORDER BY candidate.id
     LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO public.menu_option_groups (
        id, organizer_id, name, kind, min_select, max_select, is_required, position,
        is_active, legacy_source_item_id, legacy_group_id
      ) VALUES (
        v_group.id, v_group.organizer_id, v_group.name, v_group.kind,
        v_group.min_select, v_group.max_select, v_group.is_required,
        v_group.position, v_group.is_active, v_group.legacy_source_item_id,
        v_group.legacy_group_id
      );
      v_target_group_id := v_group.id;
    END IF;

    v_group_map := jsonb_set(v_group_map, ARRAY[v_group.id::text], to_jsonb(v_target_group_id), true);
  END LOOP;

  INSERT INTO public.menu_options (
    id, group_id, organizer_id, name, description, price, image_url, is_default,
    max_qty, is_available, allergens, position, legacy_option_id
  )
  SELECT id, group_id, organizer_id, name, description, price, image_url, is_default,
         max_qty, is_available, allergens, position, legacy_option_id
    FROM jsonb_to_recordset(COALESCE(p_options, '[]'::jsonb)) AS row_data(
      id uuid, group_id uuid, organizer_id uuid, name text, description text,
      price numeric, image_url text, is_default boolean, max_qty integer,
      is_available boolean, allergens text[], position integer, legacy_option_id text
    )
   WHERE v_group_map ->> row_data.group_id::text = row_data.group_id::text;

  INSERT INTO public.menu_item_option_groups (
    id, organizer_id, item_id, group_id, position, hidden_option_ids, price_overrides
  )
  SELECT id, organizer_id, item_id, (v_group_map ->> row_data.group_id::text)::uuid,
         position, hidden_option_ids, price_overrides
    FROM jsonb_to_recordset(COALESCE(p_assignments, '[]'::jsonb)) AS row_data(
      id uuid, organizer_id uuid, item_id uuid, group_id uuid, position integer,
      hidden_option_ids uuid[], price_overrides jsonb
    );

  UPDATE public.menu_items SET options_source = 'normalized'
   WHERE id = p_item_id AND organizer_id = p_organizer_id;
END;
$$;


--
-- Name: validate_and_renew_business_worker_session(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_and_renew_business_worker_session(p_session_token_hash text) RETURNS TABLE(out_worker_id uuid, out_business_id uuid, out_kitchen_id uuid, out_role text, out_session_expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $_$
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
$_$;


--
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
declare
    -- Regclass of the table e.g. public.notes
    entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

    -- I, U, D, T: insert, update ...
    action realtime.action = (
        case wal ->> 'action'
            when 'I' then 'INSERT'
            when 'U' then 'UPDATE'
            when 'D' then 'DELETE'
            else 'ERROR'
        end
    );

    -- Is row level security enabled for the table
    is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

    subscriptions realtime.subscription[] = array_agg(subs)
        from
            realtime.subscription subs
        where
            subs.entity = entity_
            -- Filter by action early - only get subscriptions interested in this action
            -- action_filter column can be: '*' (all), 'INSERT', 'UPDATE', or 'DELETE'
            and (subs.action_filter = '*' or subs.action_filter = action::text);

    -- Subscription vars
    working_role regrole;
    working_selected_columns text[];
    claimed_role regrole;
    claims jsonb;

    subscription_id uuid;
    subscription_has_access bool;
    visible_to_subscription_ids uuid[] = '{}';

    -- structured info for wal's columns
    columns realtime.wal_column[];
    -- previous identity values for update/delete
    old_columns realtime.wal_column[];

    error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

    -- Primary jsonb output for record
    output jsonb;

    -- Loop record for iterating unique roles (outer loop)
    role_record record;
    -- Loop record for iterating unique selected_columns within a role (inner loop)
    cols_record record;
    -- Subscription ids visible at the role level (before fanning out by selected_columns)
    visible_role_sub_ids uuid[] = '{}';

begin
    perform set_config('role', null, true);

    columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'columns') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    old_columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'identity') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    for role_record in
        select claims_role
        from (select distinct claims_role from unnest(subscriptions)) t
        order by claims_role::text
    loop
        working_role := role_record.claims_role;

        -- Update `is_selectable` for columns and old_columns (once per role)
        columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(columns) c;

        old_columns =
                array_agg(
                    (
                        c.name,
                        c.type_name,
                        c.type_oid,
                        c.value,
                        c.is_pkey,
                        pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                    )::realtime.wal_column
                )
                from
                    unnest(old_columns) c;

        if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
            -- Fan out 400 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 400: Bad Request, no primary key']
                )::realtime.wal_rls;
            end loop;

        -- The claims role does not have SELECT permission to the primary key of entity
        elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
            -- Fan out 401 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 401: Unauthorized']
                )::realtime.wal_rls;
            end loop;

        else
            -- Create the prepared statement (once per role)
            if is_rls_enabled and action <> 'DELETE' then
                if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                    deallocate walrus_rls_stmt;
                end if;
                execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
            end if;

            -- Collect all visible subscription IDs for this role (filter check + RLS check)
            visible_role_sub_ids = '{}';

            for subscription_id, claims in (
                    select
                        subs.subscription_id,
                        subs.claims
                    from
                        unnest(subscriptions) subs
                    where
                        subs.entity = entity_
                        and subs.claims_role = working_role
                        and (
                            realtime.is_visible_through_filters(columns, subs.filters)
                            or (
                              action = 'DELETE'
                              and realtime.is_visible_through_filters(old_columns, subs.filters)
                            )
                        )
            ) loop

                if not is_rls_enabled or action = 'DELETE' then
                    visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                else
                    -- Check if RLS allows the role to see the record
                    perform
                        -- Trim leading and trailing quotes from working_role because set_config
                        -- doesn't recognize the role as valid if they are included
                        set_config('role', trim(both '"' from working_role::text), true),
                        set_config('request.jwt.claims', claims::text, true);

                    execute 'execute walrus_rls_stmt' into subscription_has_access;

                    -- Reset the role on every FOR..LOOP batch execution.
                    -- The first batch of 10 rows is pre-fetched using the current connection role (PG internal behaviour)
                    -- then we have to reset it again otherwise it would use the role defined in the `set_config` above
                    -- to fetch the remaining rows when rows>10, which could be a user-defined role that lacks execution grants.
                    -- The flow is:
                    --   1. run batch with conn role
                    --   2. set_config working_role
                    --   3. execute walrus
                    --   4. reset role (revert)
                    --   5. repeat
                    perform set_config('role', null, true);

                    if subscription_has_access then
                        visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                    end if;
                end if;
            end loop;

            perform set_config('role', null, true);

            -- Inner loop: per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;

                output = jsonb_build_object(
                    'schema', wal ->> 'schema',
                    'table', wal ->> 'table',
                    'type', action,
                    'commit_timestamp', to_char(
                        ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                    ),
                    'columns', (
                        select
                            jsonb_agg(
                                jsonb_build_object(
                                    'name', pa.attname,
                                    'type', pt.typname
                                )
                                order by pa.attnum asc
                            )
                        from
                            pg_attribute pa
                            join pg_type pt
                                on pa.atttypid = pt.oid
                            left join (
                                select unnest(conkey) as pkey_attnum
                                from pg_constraint
                                where conrelid = entity_ and contype = 'p'
                            ) pk on pk.pkey_attnum = pa.attnum
                        where
                            attrelid = entity_
                            and attnum > 0
                            and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
                            and (working_selected_columns is null or pa.attname = any(working_selected_columns) or pk.pkey_attnum is not null)
                    )
                )
                -- Add "record" key for insert and update
                || case
                    when action in ('INSERT', 'UPDATE') then
                        jsonb_build_object(
                            'record',
                            (
                                select
                                    jsonb_object_agg(
                                        -- if unchanged toast, get column name and value from old record
                                        coalesce((c).name, (oc).name),
                                        case
                                            when (c).name is null then (oc).value
                                            else (c).value
                                        end
                                    )
                                from
                                    unnest(columns) c
                                    full outer join unnest(old_columns) oc
                                        on (c).name = (oc).name
                                where
                                    coalesce((c).is_selectable, (oc).is_selectable)
                                    and (working_selected_columns is null or coalesce((c).name, (oc).name) = any(working_selected_columns) or coalesce((c).is_pkey, (oc).is_pkey))
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            )
                        )
                    else '{}'::jsonb
                end
                -- Add "old_record" key for update and delete
                || case
                    when action = 'UPDATE' then
                        jsonb_build_object(
                                'old_record',
                                (
                                    select jsonb_object_agg((c).name, (c).value)
                                    from unnest(old_columns) c
                                    where
                                        (c).is_selectable
                                        and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                        and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                )
                            )
                    when action = 'DELETE' then
                        jsonb_build_object(
                            'old_record',
                            (
                                select jsonb_object_agg((c).name, (c).value)
                                from unnest(old_columns) c
                                where
                                    (c).is_selectable
                                    and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                    and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                            )
                        )
                    else '{}'::jsonb
                end;

                -- Filter visible_role_sub_ids to those matching the current selected_columns group
                visible_to_subscription_ids = coalesce(
                    (
                        select array_agg(s.subscription_id)
                        from unnest(subscriptions) s
                        where s.claims_role = working_role
                          and (s.selected_columns is not distinct from working_selected_columns)
                          and s.subscription_id = any(visible_role_sub_ids)
                    ),
                    '{}'::uuid[]
                );

                return next (
                    output,
                    is_rls_enabled,
                    visible_to_subscription_ids,
                    case
                        when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                        else '{}'
                    end
                )::realtime.wal_rls;
            end loop;

        end if;
    end loop;

    perform set_config('role', null, true);
end;
$$;


--
-- Name: authorize(text, text, text, text, text, text[], text[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.authorize(role_name text, topic_name text, claims text, sub text, headers text, read_extensions text[], write_extensions text[], OUT read_allowed boolean[], OUT write_allowed boolean[]) RETURNS record
    LANGUAGE plpgsql
    AS $$
declare
  probe_ids uuid[];
  probe_inserted_at timestamp := now() at time zone 'utc';
  visible_ids uuid[];
  ext text;
  allowed boolean;
begin
  -- The probe inserts are rolled back, but they still give the transaction an xid, so it ends
  -- in a commit. Nothing durable was written, so skip waiting on the WAL flush and sync standbys.
  -- Set outside the block below, whose rollback would undo it.
  perform set_config('synchronous_commit', 'off', true);

  -- The RAISE at the end of this block rolls back everything in it.
  begin
    probe_ids := array(select gen_random_uuid() from unnest(read_extensions));

    insert into realtime.messages (id, topic, extension, inserted_at, updated_at)
    select p.id, topic_name, p.extension, probe_inserted_at, probe_inserted_at
    from unnest(probe_ids, read_extensions) as p(id, extension);

    perform set_config('role', role_name, true),
            set_config('realtime.topic', topic_name, true),
            set_config('request.jwt.claims', claims, true),
            set_config('request.jwt.claim.sub', sub, true),
            set_config('request.jwt.claim.role', role_name, true),
            set_config('request.headers', headers, true);

    -- One lookup for every probe, by the full primary key.
    visible_ids := array(
      select m.id
      from realtime.messages m
      where m.inserted_at = probe_inserted_at
        and m.id = any(probe_ids));

    read_allowed := array(
      select p.id = any(visible_ids)
      from unnest(probe_ids) with ordinality as p(id, n)
      order by p.n);

    write_allowed := '{}';

    foreach ext in array write_extensions loop
      begin
        insert into realtime.messages (topic, extension, inserted_at, updated_at)
        values (topic_name, ext, now() at time zone 'utc', now() at time zone 'utc');

        allowed := true;
      exception when insufficient_privilege then
        allowed := false;
      end;

      write_allowed := write_allowed || allowed;
    end loop;

    raise sqlstate 'RTA01';
  exception when sqlstate 'RTA01' then
    null;
  end;
end;
$$;


--
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$$;


--
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


--
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  res jsonb;
begin
  if type_::text = 'bytea' then
    return to_jsonb(val);
  end if;
  execute format('select to_jsonb(%L::'|| type_::text || ')', val) into res;
  return res;
end
$$;


--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
/*
Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
*/
declare
    op_symbol text = (
        case
            when op = 'eq' then '='
            when op = 'neq' then '!='
            when op = 'lt' then '<'
            when op = 'lte' then '<='
            when op = 'gt' then '>'
            when op = 'gte' then '>='
            when op = 'in' then '= any'
            else 'UNKNOWN OP'
        end
    );
    res boolean;
begin
    execute format(
        'select %L::'|| type_::text || ' ' || op_symbol
        || ' ( %L::'
        || (
            case
                when op = 'in' then type_::text || '[]'
                else type_::text end
        )
        || ')', val_1, val_2) into res;
    return res;
end;
$$;


--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
declare
    op_symbol text;
    res boolean;
begin
    -- IS DISTINCT FROM / IS NOT DISTINCT FROM: infix, both sides typed literals
    if op = 'isdistinct' then
        execute format(
            'select %L::%s %s %L::%s',
            val_1,
            type_::text,
            case when negate then 'IS NOT DISTINCT FROM' else 'IS DISTINCT FROM' end,
            val_2,
            type_::text
        ) into res;
        return res;
    end if;

    -- IS requires a keyword RHS (NULL, TRUE, FALSE, UNKNOWN), not a typed literal
    if op = 'is' then
        if val_2 not in ('null', 'true', 'false', 'unknown') then
            raise exception 'invalid value for is filter: must be null, true, false, or unknown';
        end if;
        execute format(
            'select %L::%s %s %s',
            val_1,
            type_::text,
            case when negate then 'IS NOT' else 'IS' end,
            upper(val_2)
        ) into res;
        return res;
    end if;

    op_symbol = case
        when op = 'eq'    then '='
        when op = 'neq'   then '!='
        when op = 'lt'    then '<'
        when op = 'lte'   then '<='
        when op = 'gt'    then '>'
        when op = 'gte'   then '>='
        when op = 'in'    then '= any'
        when op = 'like'   then 'LIKE'
        when op = 'ilike'  then 'ILIKE'
        when op = 'match'  then '~'
        when op = 'imatch' then '~*'
        else null
    end;

    if op_symbol is null then
        raise exception 'unsupported equality operator: %', op::text;
    end if;

    execute format(
        'select %L::%s %s (%L::%s)',
        val_1,
        type_::text,
        op_symbol,
        val_2,
        case when op = 'in' then type_::text || '[]' else type_::text end
    ) into res;

    return case when negate then not res else res end;
end;
$$;


--
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    select
        filters is null
        or array_length(filters, 1) is null
        or coalesce(
            count(col.name) = count(1)
            and sum(
                realtime.check_equality_op(
                    op:=f.op,
                    type_:=coalesce(col.type_oid::regtype, col.type_name::regtype),
                    val_1:=col.value #>> '{}',
                    val_2:=f.value,
                    negate:=coalesce(f.negate, false)
                )::int
            ) filter (where col.name is not null) = count(col.name),
            false
        )
    from
        unnest(filters) f
        left join unnest(columns) col
            on f.column_name = col.name;
$$;


--
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS TABLE(wal jsonb, is_rls_enabled boolean, subscription_ids uuid[], errors text[], slot_changes_count bigint)
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
  WITH pub AS (
    SELECT
      concat_ws(
        ',',
        CASE WHEN bool_or(pubinsert) THEN 'insert' ELSE NULL END,
        CASE WHEN bool_or(pubupdate) THEN 'update' ELSE NULL END,
        CASE WHEN bool_or(pubdelete) THEN 'delete' ELSE NULL END
      ) AS w2j_actions,
      coalesce(
        string_agg(
          realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
          ','
        ) filter (WHERE ppt.tablename IS NOT NULL),
        ''
      ) AS w2j_add_tables
    FROM pg_publication pp
    LEFT JOIN pg_publication_tables ppt ON pp.pubname = ppt.pubname
    WHERE pp.pubname = publication
    GROUP BY pp.pubname
    LIMIT 1
  ),
  -- MATERIALIZED ensures pg_logical_slot_get_changes is called exactly once
  w2j AS MATERIALIZED (
    SELECT x.*, pub.w2j_add_tables
    FROM pub,
         pg_logical_slot_get_changes(
           slot_name, null, max_changes,
           'include-pk', 'true',
           'include-transaction', 'false',
           'include-timestamp', 'true',
           'include-type-oids', 'true',
           'format-version', '2',
           'actions', pub.w2j_actions,
           'add-tables', pub.w2j_add_tables
         ) x
  ),
  slot_count AS (
    SELECT count(*)::bigint AS cnt
    FROM w2j
    WHERE w2j.w2j_add_tables <> ''
  ),
  rls_filtered AS (
    SELECT xyz.wal, xyz.is_rls_enabled, xyz.subscription_ids, xyz.errors
    FROM w2j,
         realtime.apply_rls(
           wal := w2j.data::jsonb,
           max_record_bytes := max_record_bytes
         ) xyz(wal, is_rls_enabled, subscription_ids, errors)
    WHERE w2j.w2j_add_tables <> ''
      AND xyz.subscription_ids[1] IS NOT NULL
  )
  SELECT rf.wal, rf.is_rls_enabled, rf.subscription_ids, rf.errors, sc.cnt
  FROM rls_filtered rf, slot_count sc

  UNION ALL

  SELECT null, null, null, null, sc.cnt
  FROM slot_count sc
  WHERE NOT EXISTS (SELECT 1 FROM rls_filtered)
$$;


--
-- Name: list_changes_sync(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.list_changes_sync(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS TABLE(wal jsonb, is_rls_enabled boolean, subscription_ids uuid[], errors text[], slot_changes_count bigint)
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
  WITH pub AS (
    SELECT
      concat_ws(
        ',',
        CASE WHEN bool_or(pubinsert) THEN 'insert' ELSE NULL END,
        CASE WHEN bool_or(pubupdate) THEN 'update' ELSE NULL END,
        CASE WHEN bool_or(pubdelete) THEN 'delete' ELSE NULL END
      ) AS w2j_actions,
      coalesce(
        string_agg(
          realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
          ','
        ) filter (WHERE ppt.tablename IS NOT NULL),
        ''
      ) AS w2j_add_tables
    FROM pg_publication pp
    LEFT JOIN pg_publication_tables ppt ON pp.pubname = ppt.pubname
    WHERE pp.pubname = publication
    GROUP BY pp.pubname
    LIMIT 1
  ),
  -- MATERIALIZED ensures the slot is read exactly once.
  consumed AS MATERIALIZED (
    SELECT x.*, pub.w2j_add_tables
    FROM pub,
         realtime.settled_changes(
           slot_name, max_changes,
           'include-pk', 'true',
           'include-transaction', 'false',
           'include-timestamp', 'true',
           'include-type-oids', 'true',
           'format-version', '2',
           'actions', pub.w2j_actions,
           'add-tables', pub.w2j_add_tables
         ) x
  ),
  slot_count AS (
    SELECT count(*)::bigint AS cnt
    FROM consumed
    WHERE consumed.w2j_add_tables <> ''
  ),
  rls_filtered AS (
    SELECT xyz.wal, xyz.is_rls_enabled, xyz.subscription_ids, xyz.errors
    FROM consumed,
         realtime.apply_rls(
           wal := consumed.data::jsonb,
           max_record_bytes := max_record_bytes
         ) xyz(wal, is_rls_enabled, subscription_ids, errors)
    WHERE consumed.w2j_add_tables <> ''
      AND xyz.subscription_ids[1] IS NOT NULL
  )
  SELECT rf.wal, rf.is_rls_enabled, rf.subscription_ids, rf.errors, sc.cnt
  FROM rls_filtered rf, slot_count sc

  UNION ALL

  SELECT null, null, null, null, sc.cnt
  FROM slot_count sc
  WHERE NOT EXISTS (SELECT 1 FROM rls_filtered)
$$;


--
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
  SELECT
    realtime.wal2json_escape_identifier(nsp.nspname::text)
    || '.'
    || realtime.wal2json_escape_identifier(pc.relname::text)
  FROM pg_class pc
  JOIN pg_namespace nsp ON pc.relnamespace = nsp.oid
  WHERE pc.oid = entity
$$;


--
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- Name: send_binary(bytea, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
BEGIN
  BEGIN
    generated_id := gen_random_uuid();

    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, binary_payload, event, topic, private, extension)
    VALUES (generated_id, payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- Name: settled_changes(name, integer, text[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.settled_changes(slot_name name, max_changes integer, VARIADIC opts text[]) RETURNS TABLE(lsn pg_lsn, xid xid, data text)
    LANGUAGE plpgsql
    AS $$
declare
  upto pg_lsn;
  total bigint;
  xids xid[];
  starts bigint[];
  snapshot pg_snapshot;
  running_xids xid[];
  xmax_age int;
  cut bigint;
begin
  -- Each statement in a volatile function takes its own snapshot, which is what lets the
  -- check below see a writer that was still in flight when the peek ran. Under REPEATABLE
  -- READ the snapshot never advances, so a deferred change would never be released.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'realtime.settled_changes requires READ COMMITTED';
  end if;

  -- The peek and the read below cover the same WAL, so the read cannot reach a commit the
  -- check never saw.
  upto := pg_current_wal_flush_lsn();

  -- One entry per transaction, in commit order: its xid and the position of its first
  -- change. The peek uses the caller's own options, so max_changes counts exactly what the
  -- read counts. A non-transactional logical message is emitted as soon as it is decoded,
  -- tagged with the xid of whatever transaction wrote it, so it does not mark where that
  -- transaction starts.
  select coalesce(sum(g.n), 0),
         array_agg(g.x order by g.first) filter (where g.first is not null),
         array_agg(g.first order by g.first) filter (where g.first is not null)
    into total, xids, starts
    from (
      select p.xid as x, count(*) as n,
             min(p.ord) filter (where not case
               when starts_with(p.data, '{"action":"M"') then (p.data::jsonb->>'transactional')::boolean is false
               else false
             end) as first
      from pg_logical_slot_peek_changes(slot_name, upto, max_changes, variadic opts)
           with ordinality as p(lsn, xid, data, ord)
      group by p.xid
    ) g;

  -- Nothing for the caller, but the slot still has to move past what the peek covered.
  if total = 0 then
    perform pg_replication_slot_advance(slot_name, upto);
    return;
  end if;

  if xids is not null then
    -- Taken after the peek is materialized, so a writer that was still in flight during
    -- decoding is guaranteed to show up here.
    snapshot := pg_current_snapshot();

    -- A commit record reaches the WAL before the writer leaves the proc array, so a change
    -- can be decoded while its row is invisible. apply_rls would resolve a policy against a
    -- row it cannot see and authorize it for nobody, while the read consumed it regardless.
    --
    -- xip lists transactions running when the snapshot was taken. It does not cover a writer
    -- whose xid sits at or beyond xmax, which never appears there, so the horizon is checked
    -- too. age() counts backwards from the current xid and so compares correctly across
    -- wraparound.
    select coalesce(array_agg(running.x::xid), array[]::xid[])
      into running_xids
      from pg_snapshot_xip(snapshot) running(x);
    xmax_age := age(pg_snapshot_xmax(snapshot)::xid);

    select min(u.s) into cut
      from unnest(xids, starts) as u(x, s)
      where u.x = any(running_xids) or age(u.x) <= xmax_age;
  end if;

  -- The read stops right after the commit that brings its count to upto_nchanges, so the
  -- count of changes in front of the first unsettled transaction stops it just before that
  -- transaction.
  if cut is null then
    return query
      select p.* from pg_logical_slot_get_changes(slot_name, upto, max_changes, variadic opts) p;
  elsif cut > 1 then
    return query
      select p.* from pg_logical_slot_get_changes(slot_name, upto, (cut - 1)::int, variadic opts) p;
  end if;
end;
$$;


--
-- Name: subscription_check_filters(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
    col_names text[] = coalesce(
            array_agg(a.attname order by a.attnum),
            '{}'::text[]
        )
        from
            pg_catalog.pg_attribute a
        where
            a.attrelid = new.entity
            and a.attnum > 0
            and not a.attisdropped
            and pg_catalog.has_column_privilege(
                (new.claims ->> 'role'),
                a.attrelid,
                a.attnum,
                'SELECT'
            );
    filter realtime.user_defined_filter;
    col_type regtype;
    in_val jsonb;
    selected_col text;
begin
    for filter in select * from unnest(new.filters) loop
        if not filter.column_name = any(col_names) then
            raise exception 'invalid column for filter %', filter.column_name;
        end if;

        col_type = (
            select atttypid::regtype
            from pg_catalog.pg_attribute
            where attrelid = new.entity
                  and attname = filter.column_name
        );
        if col_type is null then
            raise exception 'failed to lookup type for column %', filter.column_name;
        end if;

        if filter.op = 'in'::realtime.equality_op then
            in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
            if coalesce(jsonb_array_length(in_val), 0) > 100 then
                raise exception 'too many values for `in` filter. Maximum 100';
            end if;
        elsif filter.op = 'is'::realtime.equality_op then
            -- `is` requires a keyword RHS rather than a typed literal
            if filter.value not in ('null', 'true', 'false', 'unknown') then
                raise exception 'invalid value for is filter: must be null, true, false, or unknown';
            end if;
            -- IS NULL works for any type, but IS TRUE/FALSE/UNKNOWN require a boolean
            -- operand. Reject the non-null keywords on non-boolean columns here so they
            -- don't abort apply_rls at WAL time.
            if filter.value <> 'null' and col_type <> 'boolean'::regtype then
                raise exception 'is % filter requires a boolean column, got %', filter.value, col_type::text;
            end if;
        elsif filter.op in ('like'::realtime.equality_op, 'ilike'::realtime.equality_op) then
            -- like/ilike apply the text pattern operator (~~); reject column types that
            -- have no such operator instead of failing at WAL time
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = '~~' and oprleft = col_type
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
        elsif filter.op in ('match'::realtime.equality_op, 'imatch'::realtime.equality_op) then
            -- match/imatch apply the regex operators ~ / ~*; reject column types that have
            -- no such operator (e.g. integer) instead of failing at WAL time, mirroring the
            -- like/ilike guard above.
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = case when filter.op = 'imatch'::realtime.equality_op then '~*' else '~' end
                  and oprleft = col_type
                  and oprright = col_type
                  and oprresult = 'boolean'::regtype
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
            -- validate the regex eagerly so a bad pattern is rejected here, not inside
            -- apply_rls where it would abort the WAL stream for the entity
            begin
                perform '' ~ filter.value;
            exception when others then
                raise exception 'invalid regular expression for % filter: %', filter.op::text, sqlerrm;
            end;
        else
            -- eq/neq/lt/lte/gt/gte: value must be coercable to the type
            perform realtime.cast(filter.value, col_type);
        end if;
    end loop;

    if new.selected_columns is not null then
        for selected_col in select * from unnest(new.selected_columns) loop
            if not selected_col = any(col_names) then
                raise exception 'invalid column for select %', selected_col;
            end if;
        end loop;
    end if;

    -- Apply consistent order to filters so the unique constraint can't be tricked by a
    -- different filter order. negate is part of the sort key.
    new.filters = coalesce(
        array_agg(f order by f.column_name, f.op, f.value, f.negate),
        '{}'
    ) from unnest(new.filters) f;

    -- Normalize selected_columns order so ARRAY['a','b'] and ARRAY['b','a'] are treated
    -- as the same subscription group in apply_rls. Preserve an empty array as '{}'
    -- ("primary keys only") so it stays distinct from NULL ("all columns"); array_agg
    -- over an empty set would otherwise collapse '{}' back to NULL.
    if new.selected_columns is not null then
        new.selected_columns = coalesce(
            (
                select array_agg(c order by c)
                from unnest(new.selected_columns) c
            ),
            '{}'::text[]
        );
    end if;

    return new;
end;
$$;


--
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


--
-- Name: topic(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
select nullif(current_setting('realtime.topic', true), '')::text;
$$;


--
-- Name: wal2json_escape_identifier(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.wal2json_escape_identifier(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
  -- Prefix `\`, `,`, `.`, and any whitespace with `\`
  SELECT regexp_replace(name, '([\\,.[:space:]])', '\\\1', 'g')
$$;


--
-- Name: allow_any_operation(text[]); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.allow_any_operation(expected_operations text[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT CASE
      WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
      ELSE raw_operation
    END AS current_operation
    FROM current_operation
  )
  SELECT EXISTS (
    SELECT 1
    FROM normalized n
    CROSS JOIN LATERAL unnest(expected_operations) AS expected_operation
    WHERE expected_operation IS NOT NULL
      AND expected_operation <> ''
      AND n.current_operation = CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END
  );
$$;


--
-- Name: allow_only_operation(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.allow_only_operation(expected_operation text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT
      CASE
        WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
        ELSE raw_operation
      END AS current_operation,
      CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END AS requested_operation
    FROM current_operation
  )
  SELECT CASE
    WHEN requested_operation IS NULL OR requested_operation = '' THEN FALSE
    ELSE COALESCE(current_operation = requested_operation, FALSE)
  END
  FROM normalized;
$$;


--
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


--
-- Name: enforce_bucket_lifecycle_service_role(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.enforce_bucket_lifecycle_service_role() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  IF current_user::text IS DISTINCT FROM TG_ARGV[0]
     AND (
       OLD.lifecycle_configuration IS DISTINCT FROM NEW.lifecycle_configuration
       OR OLD.lifecycle_configuration_generation IS DISTINCT FROM NEW.lifecycle_configuration_generation
     ) THEN
    -- AFTER runs only after caller RLS has accepted the proposed row. The API
    -- recognizes this specific error after rolling back its permission probe;
    -- direct non-service writes still fail and cannot persist the change.
    RAISE EXCEPTION 'bucket control columns may only be changed by the configured storage service role'
      USING ERRCODE = 'PST01',
            SCHEMA = TG_TABLE_SCHEMA,
            TABLE = TG_TABLE_NAME,
            CONSTRAINT = TG_NAME;
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.enforce_bucket_name_length() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Get the last path segment (the actual filename)
    SELECT _parts[array_length(_parts, 1)] INTO _filename;
    -- Extract extension: reverse, split on '.', then reverse again
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    RETURN _parts[array_length(_parts, 1)];
END
$$;


--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


--
-- Name: get_common_prefix(text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_common_prefix(p_key text, p_prefix text, p_delimiter text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
SELECT CASE
    WHEN p_delimiter <> ''
         AND position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)) > 0
    THEN left(
        p_key,
        length(p_prefix)
            + position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1))
            + length(p_delimiter) - 1
    )
    ELSE NULL
END;
$$;


--
-- Name: get_size_by_bucket(text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_size_by_bucket(noncurrent_versions text DEFAULT 'include'::text, delete_markers text DEFAULT 'include'::text) RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    -- COALESCE first: NULL NOT IN (...) evaluates to NULL (not TRUE), so a
    -- bare NOT IN check silently leaves an explicit NULL argument unreset.
    noncurrent_versions := COALESCE(noncurrent_versions, 'include');
    delete_markers := COALESCE(delete_markers, 'include');
    IF noncurrent_versions NOT IN ('exclude', 'only', 'include') THEN
        noncurrent_versions := 'include';
    END IF;
    IF delete_markers NOT IN ('exclude', 'only', 'include') THEN
        delete_markers := 'include';
    END IF;

    return query
        select sum((metadata->>'size')::bigint)::bigint as size, obj.bucket_id
        from "storage".objects as obj
        where (noncurrent_versions != 'exclude' OR obj.archived_at IS NULL)
          and (noncurrent_versions != 'only' OR obj.archived_at IS NOT NULL)
          and (delete_markers != 'exclude' OR NOT obj.is_delete_marker)
          and (delete_markers != 'only' OR obj.is_delete_marker)
        group by obj.bucket_id;
END
$$;


--
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text, raw_prefix_param text DEFAULT NULL::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $_$
WITH candidates AS (
    SELECT
        upload.key AS object_key,
        CASE
            WHEN position($3 IN substring(upload.key FROM length(coalesce($7, $2)) + 1)) > 0
            THEN left(
                upload.key,
                length(coalesce($7, $2))
                    + position($3 IN substring(upload.key FROM length(coalesce($7, $2)) + 1))
                    + length($3) - 1
            )
            ELSE upload.key
        END AS result_key,
        upload.id,
        upload.created_at,
        position($3 IN substring(upload.key FROM length(coalesce($7, $2)) + 1)) > 0 AS is_common_prefix
    FROM storage.s3_multipart_uploads AS upload
    WHERE upload.bucket_id = $1
      AND upload.key COLLATE "C" LIKE $2 || '%'
), filtered AS (
    SELECT candidate.*
    FROM candidates AS candidate
    WHERE $5 = ''
       OR candidate.result_key COLLATE "C" > $5
       OR (
           candidate.result_key COLLATE "C" = $5
           AND NOT candidate.is_common_prefix
           AND $6 <> ''
           -- A completed or aborted marker repeats the remaining same-key uploads.
           AND COALESCE(
               (candidate.created_at, candidate.id COLLATE "C") > (
                   SELECT marker.created_at, marker.id COLLATE "C"
                   FROM storage.s3_multipart_uploads AS marker
                   WHERE marker.bucket_id = $1
                     AND marker.key COLLATE "C" = $5
                     AND marker.id = $6
               ),
               TRUE
           )
       )
), ranked AS (
    SELECT
        filtered.*,
        row_number() OVER (
            PARTITION BY filtered.result_key COLLATE "C"
            ORDER BY filtered.created_at, filtered.id COLLATE "C"
        ) AS prefix_rank
    FROM filtered
)
SELECT ranked.result_key, ranked.id, ranked.created_at
FROM ranked
WHERE NOT ranked.is_common_prefix OR ranked.prefix_rank = 1
ORDER BY ranked.result_key COLLATE "C", ranked.created_at, ranked.id COLLATE "C"
LIMIT $4;
$_$;


--
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text, text, text, text, timestamp with time zone, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_objects_with_delimiter(_bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, noncurrent_versions text DEFAULT 'exclude'::text, delete_markers text DEFAULT 'exclude'::text, next_token_archived_at timestamp with time zone DEFAULT NULL::timestamp with time zone, next_token_version text DEFAULT ''::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, version text, archived_at timestamp with time zone, is_delete_marker boolean, is_versioned boolean)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;

    -- Configuration
    v_is_asc BOOLEAN;
    v_prefix TEXT;
    v_start TEXT;
    v_start_relative TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;
    v_version_filter TEXT;

    -- true when noncurrent_versions can return >1 row per name; keeps them
    -- ordered most-recent-first and lets pagination resume mid-key
    v_multi_row BOOLEAN;
    v_name_order TEXT;
    v_exact_range_predicate TEXT;
    v_strict_range_predicate TEXT;
    v_inclusive_range_predicate TEXT;

    -- Seek state for the current name. archived_at is normalized to JavaScript's
    -- millisecond precision and version breaks ties within the same millisecond.
    -- Current rows use 'infinity'; NULL means no tiebreak has been established.
    v_next_seek TEXT;
    v_next_seek_at TIMESTAMPTZ;
    v_next_seek_version TEXT;
    v_next_seek_strict BOOLEAN := false;
    v_cursor_is_folder BOOLEAN;
    v_count INT := 0;
    v_previous_seek TEXT;
    v_previous_seek_at TIMESTAMPTZ;
    v_previous_seek_version TEXT;
    v_previous_count INT;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;
    v_batch_query_strict TEXT;
    v_delete_marker_peek_query TEXT;
    v_delete_marker_peek_query_strict TEXT;

BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_is_asc := lower(coalesce(sort_order, 'asc')) = 'asc';
    v_prefix := coalesce(prefix_param, '');
    v_start := CASE WHEN coalesce(next_token, '') <> '' THEN next_token ELSE coalesce(start_after, '') END;
    v_file_batch_size := LEAST(GREATEST(max_keys * 2, 100), 1000);
    v_next_seek_at := NULL;
    v_next_seek_version := '';

    -- COALESCE first: NULL NOT IN (...) evaluates to NULL (not TRUE), so a
    -- bare NOT IN check silently leaves an explicit NULL argument unreset.
    noncurrent_versions := COALESCE(noncurrent_versions, 'exclude');
    delete_markers := COALESCE(delete_markers, 'exclude');
    IF noncurrent_versions NOT IN ('exclude', 'only', 'include') THEN
        noncurrent_versions := 'exclude';
    END IF;
    IF delete_markers NOT IN ('exclude', 'only', 'include') THEN
        delete_markers := 'exclude';
    END IF;

    v_multi_row := noncurrent_versions IN ('only', 'include');
    v_name_order := CASE WHEN v_is_asc THEN 'ASC' ELSE 'DESC' END;

    v_version_filter := '';
    IF noncurrent_versions = 'exclude' THEN
        v_version_filter := v_version_filter || ' AND o.archived_at IS NULL';
    ELSIF noncurrent_versions = 'only' THEN
        v_version_filter := v_version_filter || ' AND o.archived_at IS NOT NULL';
    END IF;
    IF delete_markers = 'exclude' THEN
        v_version_filter := v_version_filter || ' AND NOT o.is_delete_marker';
    ELSIF delete_markers = 'only' THEN
        v_version_filter := v_version_filter || ' AND o.is_delete_marker';
    END IF;

    -- Calculate upper bound for prefix filtering (bytewise, using COLLATE "C")
    IF v_prefix = '' THEN
        v_upper_bound := NULL;
    ELSE
        v_upper_bound := left(v_prefix, -1) || chr(ascii(right(v_prefix, 1)) + 1);
    END IF;

    -- Keep caller-provided cursors inside the requested prefix range.
    IF v_start <> '' AND v_upper_bound IS NOT NULL THEN
        IF v_is_asc THEN
            IF v_start COLLATE "C" < v_prefix COLLATE "C" THEN
                v_start := '';
            ELSIF v_start COLLATE "C" >= v_upper_bound COLLATE "C" THEN
                RETURN;
            END IF;
        ELSE
            IF v_start COLLATE "C" < v_prefix COLLATE "C" THEN
                RETURN;
            ELSIF v_start COLLATE "C" >= v_upper_bound COLLATE "C" THEN
                v_start := '';
            END IF;
        END IF;
    END IF;

    v_start_relative := substring(v_start FROM length(v_prefix) + 1);

    -- Direction affects only the indexed name range and its ordering. Cursor
    -- state transitions and within-key version ordering stay shared.
    IF v_is_asc THEN
        v_exact_range_predicate := 'TRUE';
        v_strict_range_predicate := 'o.name COLLATE "C" > $2';
        v_inclusive_range_predicate := 'o.name COLLATE "C" >= $2';
        IF v_upper_bound IS NOT NULL THEN
            v_exact_range_predicate := 'o.name COLLATE "C" < $3';
            v_strict_range_predicate := v_strict_range_predicate || ' AND o.name COLLATE "C" < $3';
            v_inclusive_range_predicate := v_inclusive_range_predicate || ' AND o.name COLLATE "C" < $3';
        END IF;
    ELSE
        v_exact_range_predicate := 'TRUE';
        v_strict_range_predicate := 'o.name COLLATE "C" < $2';
        v_inclusive_range_predicate := 'o.name COLLATE "C" < $2';
        IF v_prefix <> '' THEN
            v_exact_range_predicate := 'o.name COLLATE "C" >= $3';
            v_strict_range_predicate := v_strict_range_predicate || ' AND o.name COLLATE "C" >= $3';
            v_inclusive_range_predicate := v_inclusive_range_predicate || ' AND o.name COLLATE "C" >= $3';
        END IF;
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    -- The multi-row order matches the externally serialized cursor exactly:
    -- archived_at at millisecond precision, then version as the final tiebreak.
    --
    -- When v_multi_row, the seek is a keyset tuple comparison ("name > $2 OR
    -- (name = $2 AND tiebreak)") - Postgres won't split that OR into indexable
    -- form (confirmed even with fully literal values), so as one WHERE clause
    -- it forces a full bucket scan filtered row-by-row. Splitting it into two
    -- independently-indexable branches (exact name match with the tiebreak
    -- filter, vs. strictly-past names) combined with UNION ALL lets each
    -- branch keep name as a real index condition; the outer ORDER BY/LIMIT
    -- re-merges them into the same page the single query used to produce.
    IF v_multi_row THEN
        v_batch_query := format(
            $sql$
            SELECT *
            FROM (
                (
                    SELECT o.name, o.id, o.updated_at, o.created_at,
                           o.last_accessed_at, o.metadata, o.version,
                           o.archived_at, o.is_delete_marker, o.is_versioned
                    FROM storage.objects o
                    WHERE o.bucket_id = $1
                      AND o.name COLLATE "C" = $2
                      AND %s
                      AND NOT $7::boolean
                      AND (
                          $5::timestamptz IS NULL
                          OR COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) < $5
                          OR (
                              COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) = $5
                              AND COALESCE(o.version, '') > $6
                          )
                      )
                      %s
                    ORDER BY
                        COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) DESC,
                        COALESCE(o.version, '') ASC
                    LIMIT $4
                )
                UNION ALL
                (
                    SELECT o.name, o.id, o.updated_at, o.created_at,
                           o.last_accessed_at, o.metadata, o.version,
                           o.archived_at, o.is_delete_marker, o.is_versioned
                    FROM storage.objects o
                    WHERE o.bucket_id = $1
                      AND %s
                      %s
                    ORDER BY
                        o.name COLLATE "C" %s,
                        COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) DESC,
                        COALESCE(o.version, '') ASC
                    LIMIT $4
                )
            ) sub
            ORDER BY
                sub.name COLLATE "C" %s,
                COALESCE(date_trunc('milliseconds', sub.archived_at), 'infinity'::timestamptz) DESC,
                COALESCE(sub.version, '') ASC
            LIMIT $4
            $sql$,
            v_exact_range_predicate,
            v_version_filter,
            v_strict_range_predicate,
            v_version_filter,
            v_name_order,
            v_name_order
        );
    ELSE
        v_batch_query := format(
            $sql$
            SELECT o.name, o.id, o.updated_at, o.created_at,
                   o.last_accessed_at, o.metadata, o.version,
                   o.archived_at, o.is_delete_marker, o.is_versioned
            FROM storage.objects o
            WHERE o.bucket_id = $1
              AND %s
              %s
            ORDER BY o.name COLLATE "C" %s, o.archived_at DESC
            LIMIT $4
            $sql$,
            v_inclusive_range_predicate,
            v_version_filter,
            v_name_order
        );

        -- Strict counterpart of the query above: used once the single-row
        -- ASC batch advance (below) has left v_next_seek pointing at the
        -- last row already emitted, so an inclusive predicate would
        -- re-match it forever. Only single-row mode ever sets strict mode,
        -- so this variant is never needed when v_multi_row.
        v_batch_query_strict := format(
            $sql$
            SELECT o.name, o.id, o.updated_at, o.created_at,
                   o.last_accessed_at, o.metadata, o.version,
                   o.archived_at, o.is_delete_marker, o.is_versioned
            FROM storage.objects o
            WHERE o.bucket_id = $1
              AND %s
              %s
            ORDER BY o.name COLLATE "C" %s, o.archived_at DESC
            LIMIT $4
            $sql$,
            v_strict_range_predicate,
            v_version_filter,
            v_name_order
        );
    END IF;

    -- The static peek predicates cannot use the partial delete-marker index
    -- once PL/pgSQL switches to a generic plan because whether
    -- is_delete_marker is required remains parameter-dependent. Reuse the
    -- already-specialized batch query with a one-row limit for this sparse
    -- filter so the plan sees a literal `o.is_delete_marker` predicate.
    IF delete_markers = 'only' THEN
        v_delete_marker_peek_query :=
            'SELECT marker_page.name FROM (' || v_batch_query || ') marker_page LIMIT 1';
        IF NOT v_multi_row THEN
            v_delete_marker_peek_query_strict :=
                'SELECT marker_page.name FROM (' || v_batch_query_strict || ') marker_page LIMIT 1';
        END IF;
    END IF;

    -- ========================================================================
    -- SEEK INITIALIZATION: Determine starting position
    -- ========================================================================
    IF v_start = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix;
        ELSE
            -- DESC without cursor performs one specialized initial seek so
            -- partial current-version and delete-marker indexes remain available.
            EXECUTE format(
                'SELECT o.name FROM storage.objects o WHERE o.bucket_id = $1%s%s ORDER BY o.name COLLATE "C" DESC LIMIT 1',
                CASE WHEN v_upper_bound IS NOT NULL
                    THEN ' AND o.name COLLATE "C" >= $2 AND o.name COLLATE "C" < $3'
                    ELSE ''
                END,
                v_version_filter
            )
            INTO v_next_seek
            USING _bucket_id, v_prefix, v_upper_bound;

            IF v_next_seek IS NOT NULL THEN
                v_next_seek := v_next_seek || delimiter_param;
            ELSE
                RETURN;
            END IF;
        END IF;
    ELSE
        -- Folder continuation tokens retain their trailing delimiter. A
        -- delimiter-less startAfter is always a literal key boundary.
        v_cursor_is_folder := delimiter_param <> ''
            AND v_start_relative <> ''
            AND right(v_start_relative, length(delimiter_param)) = delimiter_param;

        IF v_cursor_is_folder THEN
            v_next_seek := CASE
                WHEN right(v_start, length(delimiter_param)) = delimiter_param
                    THEN v_start
                ELSE v_start || delimiter_param
            END;
            IF v_is_asc THEN
                v_next_seek := left(v_next_seek, -1)
                    || chr(ascii(right(v_next_seek, 1)) + 1);
            END IF;
            v_next_seek_strict := NOT v_is_asc;
        ELSE
            -- leaf object: when v_multi_row, stay on v_start with the
            -- caller-supplied tiebreak so a page boundary mid-key resumes
            -- that key's remaining rows instead of skipping them. Truncate
            -- to milliseconds like every other v_next_seek_at assignment -
            -- harmless today since object.ts's cursor always round-trips
            -- through JS Date first, but this shouldn't rely on that.
            IF v_multi_row THEN
                v_next_seek := v_start;
                v_next_seek_at := date_trunc('milliseconds', next_token_archived_at);
                v_next_seek_version := coalesce(next_token_version, '');
                v_next_seek_strict := coalesce(next_token, '') = '';
            ELSIF v_is_asc THEN
                v_next_seek := v_start;
                v_next_seek_strict := true;
            ELSE
                v_next_seek := v_start;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= max_keys;

        v_previous_seek := v_next_seek;
        v_previous_seek_at := v_next_seek_at;
        v_previous_seek_version := v_next_seek_version;
        v_previous_count := v_count;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        -- v_multi_row is branched here (rather than folded into the WHERE
        -- clause as a bound parameter) so each concrete query keeps an
        -- unconditional seek predicate - once PL/pgSQL switches to its
        -- cached generic plan (after 5 calls), a parameter-gated
        -- "(NOT v_multi_row AND name >= $x) OR (v_multi_row AND ...)"
        -- predicate stops the planner from using name as an index
        -- condition at all, degrading every subsequent peek to a full
        -- index scan filtered row-by-row instead of a bounded range scan.
        -- v_multi_row's seek predicate is a keyset tuple comparison
        -- ("name > x OR (name = x AND tiebreak)") - Postgres does not
        -- split this OR into indexable form even with fully literal
        -- values, so it falls back to a full scan filtered row-by-row.
        -- Splitting it into two independently-indexable branches (exact
        -- name match with the tiebreak filter, vs. strictly-past name)
        -- combined with UNION ALL lets each branch keep name as a real
        -- index condition; the outer ORDER BY/LIMIT picks whichever of
        -- the (at most 2) rows sorts first.
        IF delete_markers = 'only' THEN
            EXECUTE CASE WHEN v_next_seek_strict AND NOT v_multi_row
                THEN v_delete_marker_peek_query_strict
                ELSE v_delete_marker_peek_query
            END
                INTO v_peek_name
                USING _bucket_id, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END,
                    1, v_next_seek_at, v_next_seek_version, v_next_seek_strict;
        ELSIF v_multi_row THEN
            IF v_is_asc THEN
                IF v_upper_bound IS NOT NULL THEN
                    SELECT sub.name INTO v_peek_name FROM (
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" = v_next_seek
                           AND o.name COLLATE "C" < v_upper_bound
                           AND NOT v_next_seek_strict
                           AND (v_next_seek_at IS NULL
                                OR COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) < v_next_seek_at
                                OR (COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) = v_next_seek_at
                                    AND COALESCE(o.version, '') > v_next_seek_version))
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) DESC, COALESCE(o.version, '') ASC LIMIT 1)
                        UNION ALL
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" > v_next_seek AND o.name COLLATE "C" < v_upper_bound
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY o.name COLLATE "C" ASC LIMIT 1)
                    ) sub ORDER BY sub.name COLLATE "C" ASC LIMIT 1;
                ELSE
                    SELECT sub.name INTO v_peek_name FROM (
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" = v_next_seek
                           AND NOT v_next_seek_strict
                           AND (v_next_seek_at IS NULL
                                OR COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) < v_next_seek_at
                                OR (COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) = v_next_seek_at
                                    AND COALESCE(o.version, '') > v_next_seek_version))
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) DESC, COALESCE(o.version, '') ASC LIMIT 1)
                        UNION ALL
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" > v_next_seek
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY o.name COLLATE "C" ASC LIMIT 1)
                    ) sub ORDER BY sub.name COLLATE "C" ASC LIMIT 1;
                END IF;
            ELSE
                IF v_upper_bound IS NOT NULL THEN
                    SELECT sub.name INTO v_peek_name FROM (
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" = v_next_seek
                           AND o.name COLLATE "C" >= v_prefix
                           AND NOT v_next_seek_strict
                           AND (v_next_seek_at IS NULL
                                OR COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) < v_next_seek_at
                                OR (COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) = v_next_seek_at
                                    AND COALESCE(o.version, '') > v_next_seek_version))
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) DESC, COALESCE(o.version, '') ASC LIMIT 1)
                        UNION ALL
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY o.name COLLATE "C" DESC LIMIT 1)
                    ) sub ORDER BY sub.name COLLATE "C" DESC LIMIT 1;
                ELSE
                    SELECT sub.name INTO v_peek_name FROM (
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" = v_next_seek
                           AND NOT v_next_seek_strict
                           AND (v_next_seek_at IS NULL
                                OR COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) < v_next_seek_at
                                OR (COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) = v_next_seek_at
                                    AND COALESCE(o.version, '') > v_next_seek_version))
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) DESC, COALESCE(o.version, '') ASC LIMIT 1)
                        UNION ALL
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY o.name COLLATE "C" DESC LIMIT 1)
                    ) sub ORDER BY sub.name COLLATE "C" DESC LIMIT 1;
                END IF;
            END IF;
        ELSE
            -- Single-row mode is always noncurrent_versions='exclude'. Keep
            -- this predicate literal so generic plans use the current index.
            IF v_is_asc THEN
                IF v_next_seek_strict AND v_upper_bound IS NOT NULL THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = _bucket_id
                      AND o.name COLLATE "C" > v_next_seek
                      AND o.name COLLATE "C" < v_upper_bound
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                      AND (delete_markers != 'only' OR o.is_delete_marker)
                    ORDER BY o.name COLLATE "C" ASC LIMIT 1;
                ELSIF v_next_seek_strict THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = _bucket_id
                      AND o.name COLLATE "C" > v_next_seek
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                      AND (delete_markers != 'only' OR o.is_delete_marker)
                    ORDER BY o.name COLLATE "C" ASC LIMIT 1;
                ELSIF v_upper_bound IS NOT NULL THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = _bucket_id
                      AND o.name COLLATE "C" >= v_next_seek
                      AND o.name COLLATE "C" < v_upper_bound
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                      AND (delete_markers != 'only' OR o.is_delete_marker)
                    ORDER BY o.name COLLATE "C" ASC LIMIT 1;
                ELSE
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = _bucket_id
                      AND o.name COLLATE "C" >= v_next_seek
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                      AND (delete_markers != 'only' OR o.is_delete_marker)
                    ORDER BY o.name COLLATE "C" ASC LIMIT 1;
                END IF;
            ELSE
                IF v_upper_bound IS NOT NULL THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = _bucket_id
                      AND o.name COLLATE "C" < v_next_seek
                      AND o.name COLLATE "C" >= v_prefix
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                      AND (delete_markers != 'only' OR o.is_delete_marker)
                    ORDER BY o.name COLLATE "C" DESC LIMIT 1;
                ELSE
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = _bucket_id
                      AND o.name COLLATE "C" < v_next_seek
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                      AND (delete_markers != 'only' OR o.is_delete_marker)
                    ORDER BY o.name COLLATE "C" DESC LIMIT 1;
                END IF;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(v_peek_name, v_prefix, delimiter_param);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and skip to next folder (no heap access needed)
            name := v_common_prefix;
            id := NULL;
            updated_at := NULL;
            created_at := NULL;
            last_accessed_at := NULL;
            metadata := NULL;
            version := NULL;
            archived_at := NULL;
            is_delete_marker := NULL;
            is_versioned := NULL;
            RETURN NEXT;
            v_count := v_count + 1;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := left(v_common_prefix, -1)
                    || chr(ascii(right(v_common_prefix, 1)) + 1);
            ELSE
                v_next_seek := v_common_prefix;
            END IF;
            v_next_seek_at := NULL;
            v_next_seek_version := '';
            v_next_seek_strict := NOT v_is_asc;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE CASE WHEN v_next_seek_strict AND NOT v_multi_row THEN v_batch_query_strict ELSE v_batch_query END
                USING _bucket_id, v_next_seek,
                CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END, v_file_batch_size, v_next_seek_at, v_next_seek_version,
                v_next_seek_strict
            LOOP
                v_common_prefix := storage.get_common_prefix(v_current.name, v_prefix, delimiter_param);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it. Reset
                    -- strict mode too it may have been set by an earlier
                    -- row in this same batch (see the single-row ASC advance
                    -- below), and v_next_seek here is the folder-triggering
                    -- row's own name, which the next peek must find inclusively.
                    v_next_seek := CASE
                        WHEN v_is_asc THEN v_current.name
                        ELSE v_current.name || delimiter_param
                    END;
                    v_next_seek_at := NULL;
                    v_next_seek_version := '';
                    v_next_seek_strict := false;
                    EXIT;
                END IF;

                -- Emit file
                name := v_current.name;
                id := v_current.id;
                updated_at := v_current.updated_at;
                created_at := v_current.created_at;
                last_accessed_at := v_current.last_accessed_at;
                metadata := v_current.metadata;
                version := v_current.version;
                archived_at := v_current.archived_at;
                is_delete_marker := v_current.is_delete_marker;
                is_versioned := v_current.is_versioned;
                RETURN NEXT;
                v_count := v_count + 1;

                -- when v_multi_row, stay on this name and record its
                -- archived_at as the new tiebreak so remaining rows for the
                -- same key are picked up before moving to the next name
                IF v_multi_row THEN
                    v_next_seek := v_current.name;
                    v_next_seek_at := COALESCE(date_trunc('milliseconds', v_current.archived_at), 'infinity'::timestamptz);
                    v_next_seek_version := COALESCE(v_current.version, '');
                    v_next_seek_strict := false;
                ELSIF v_is_asc THEN
                    -- Appending the delimiter as a fake lexical successor
                    -- would skip a real key like `name || '!'` (or any
                    -- character sorting below the delimiter), which sorts
                    -- between `name` and `name || delimiter`. Track the real
                    -- name and mark the next comparison strict instead.
                    v_next_seek := v_current.name;
                    v_next_seek_strict := true;
                ELSE
                    v_next_seek := v_current.name;
                END IF;

                EXIT WHEN v_count >= max_keys;
            END LOOP;
        END IF;

        IF v_count = v_previous_count
           AND v_next_seek IS NOT DISTINCT FROM v_previous_seek
           AND v_next_seek_at IS NOT DISTINCT FROM v_previous_seek_at
           AND v_next_seek_version IS NOT DISTINCT FROM v_previous_seek_version THEN
            RAISE EXCEPTION 'storage.list_objects_with_delimiter made no progress at seek (%, %, %)',
                v_next_seek, v_next_seek_at, v_next_seek_version;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


--
-- Name: protect_bucket_control_columns(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.protect_bucket_control_columns() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  configuration_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.lifecycle_configuration IS NOT NULL
       OR NEW.lifecycle_configuration_generation IS NOT NULL THEN
      IF NOT pg_has_role(current_user, TG_ARGV[0], 'MEMBER') THEN
        RAISE EXCEPTION 'only members of the configured storage service role may insert lifecycle policy state'
          USING ERRCODE = '42501',
                HINT = format(
                  'Insert with both lifecycle columns NULL and configure lifecycle through the Storage API afterward, or insert as a member of %I.',
                  TG_ARGV[0]
                );
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  configuration_changed =
    OLD.lifecycle_configuration IS DISTINCT FROM NEW.lifecycle_configuration
    OR OLD.lifecycle_configuration_generation IS DISTINCT FROM NEW.lifecycle_configuration_generation;

  IF NOT configuration_changed THEN
    RETURN NEW;
  END IF;

  IF NEW.type IS DISTINCT FROM 'STANDARD' THEN
    RAISE EXCEPTION 'bucket versioning and lifecycle controls require a Standard bucket'
      USING ERRCODE = '0A000';
  END IF;

  IF NEW.lifecycle_configuration IS NULL
     AND NEW.lifecycle_configuration_generation IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.lifecycle_configuration IS NULL
     OR NEW.lifecycle_configuration_generation IS NULL
     OR OLD.lifecycle_configuration IS NOT DISTINCT FROM NEW.lifecycle_configuration
     OR OLD.lifecycle_configuration_generation IS NOT DISTINCT FROM NEW.lifecycle_configuration_generation THEN
    RAISE EXCEPTION 'a changed lifecycle policy requires a new non-null generation'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: protect_delete(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.protect_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$$;


--
-- Name: search(text, text, integer, integer, integer, text, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text, noncurrent_versions text DEFAULT 'exclude'::text, delete_markers text DEFAULT 'exclude'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb, version text, archived_at timestamp with time zone, is_delete_marker boolean, is_versioned boolean)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;
    v_delimiter CONSTANT TEXT := '/';

    -- Configuration
    v_limit INT;
    v_prefix TEXT;
    v_prefix_lower TEXT;
    v_prefix_len INT;
    v_prefix_start INT;
    v_combined_levels INT;
    v_is_asc BOOLEAN;
    v_order_by TEXT;
    v_sort_order TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;
    v_version_filter TEXT;
    v_multi_row BOOLEAN;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;
    v_delete_marker_peek_query TEXT;
    v_delete_marker_peek_query_strict TEXT;

    -- Seek state
    v_next_seek TEXT;
    v_next_seek_at TIMESTAMPTZ;
    v_next_seek_version TEXT;
    v_next_seek_strict BOOLEAN := false;
    v_count INT := 0;
    v_skipped INT := 0;
    v_previous_seek TEXT;
    v_previous_seek_at TIMESTAMPTZ;
    v_previous_seek_version TEXT;
    v_previous_count INT;
    v_previous_skipped INT;
BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_limit := LEAST(coalesce(limits, 100), 1500);
    v_prefix := coalesce(prefix, '') || coalesce(search, '');
    v_prefix_lower := lower(v_prefix);
    v_prefix_len := length(coalesce(prefix, ''));
    v_prefix_start := coalesce(array_length(string_to_array(coalesce(prefix, ''), v_delimiter), 1), 1);
    v_combined_levels := coalesce(array_length(string_to_array(v_prefix, v_delimiter), 1), 1);
    v_is_asc := lower(coalesce(sortorder, 'asc')) = 'asc';
    v_file_batch_size := LEAST(GREATEST(v_limit * 2, 100), 1000);
    v_next_seek_at := NULL;
    v_next_seek_version := '';

    -- COALESCE first: NULL NOT IN (...) evaluates to NULL (not TRUE), so a
    -- bare NOT IN check silently leaves an explicit NULL argument unreset.
    noncurrent_versions := COALESCE(noncurrent_versions, 'exclude');
    delete_markers := COALESCE(delete_markers, 'exclude');
    IF noncurrent_versions NOT IN ('exclude', 'only', 'include') THEN
        noncurrent_versions := 'exclude';
    END IF;
    IF delete_markers NOT IN ('exclude', 'only', 'include') THEN
        delete_markers := 'exclude';
    END IF;

    v_multi_row := noncurrent_versions IN ('only', 'include');

    v_version_filter := '';
    IF noncurrent_versions = 'exclude' THEN
        v_version_filter := v_version_filter || ' AND o.archived_at IS NULL';
    ELSIF noncurrent_versions = 'only' THEN
        v_version_filter := v_version_filter || ' AND o.archived_at IS NOT NULL';
    END IF;
    IF delete_markers = 'exclude' THEN
        v_version_filter := v_version_filter || ' AND NOT o.is_delete_marker';
    ELSIF delete_markers = 'only' THEN
        v_version_filter := v_version_filter || ' AND o.is_delete_marker';
    END IF;

    -- Validate sort column
    CASE lower(coalesce(sortcolumn, 'name'))
        WHEN 'name' THEN v_order_by := 'name';
        WHEN 'updated_at' THEN v_order_by := 'updated_at';
        WHEN 'created_at' THEN v_order_by := 'created_at';
        WHEN 'last_accessed_at' THEN v_order_by := 'last_accessed_at';
        ELSE v_order_by := 'name';
    END CASE;

    v_sort_order := CASE WHEN v_is_asc THEN 'asc' ELSE 'desc' END;

    -- ========================================================================
    -- NON-NAME SORTING: Use path_tokens approach
    -- ========================================================================
    IF v_order_by != 'name' THEN
        RETURN QUERY EXECUTE format(
            $sql$
            WITH folders AS (
                SELECT array_to_string(path_tokens[$1:$2], '/') AS folder
                FROM storage.objects
                WHERE objects.name ILIKE $3 || '%%'
                  AND bucket_id = $4
                  AND array_length(objects.path_tokens, 1) <> $2
                  AND ($7 != 'exclude' OR objects.archived_at IS NULL)
                  AND ($7 != 'only' OR objects.archived_at IS NOT NULL)
                  AND ($8 != 'exclude' OR NOT objects.is_delete_marker)
                  AND ($8 != 'only' OR objects.is_delete_marker)
                GROUP BY folder
                ORDER BY folder %s
            )
            (SELECT folder AS "name",
                   NULL::uuid AS id,
                   NULL::timestamptz AS updated_at,
                   NULL::timestamptz AS created_at,
                   NULL::timestamptz AS last_accessed_at,
                   NULL::jsonb AS metadata,
                   NULL::text AS version,
                   NULL::timestamptz AS archived_at,
                   NULL::boolean AS is_delete_marker,
                   NULL::boolean AS is_versioned FROM folders)
            UNION ALL
            (SELECT array_to_string(path_tokens[$1:$2], '/') AS "name",
                   id, updated_at, created_at, last_accessed_at, metadata,
                   version, archived_at, is_delete_marker, is_versioned
             FROM storage.objects
             WHERE objects.name ILIKE $3 || '%%'
               AND bucket_id = $4
               AND array_length(objects.path_tokens, 1) = $2
               AND ($7 != 'exclude' OR objects.archived_at IS NULL)
               AND ($7 != 'only' OR objects.archived_at IS NOT NULL)
               AND ($8 != 'exclude' OR NOT objects.is_delete_marker)
               AND ($8 != 'only' OR objects.is_delete_marker)
             -- name, then version, as tiebreaks so two versions of the same
             -- key tying on the sort column still sort deterministically
             ORDER BY %I %s, name COLLATE "C" %s, COALESCE(version, '') %s)
            LIMIT $5 OFFSET $6
            $sql$, v_sort_order, v_order_by, v_sort_order, v_sort_order, v_sort_order
        ) USING v_prefix_start, v_combined_levels, v_prefix, bucketname, v_limit, offsets, noncurrent_versions, delete_markers;
        RETURN;
    END IF;

    -- ========================================================================
    -- NAME SORTING: Hybrid skip-scan with batch optimization
    -- ========================================================================

    -- Calculate upper bound for prefix filtering
    IF v_prefix_lower = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix_lower, 1) = v_delimiter THEN
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(v_delimiter) + 1);
    ELSE
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(right(v_prefix_lower, 1)) + 1);
    END IF;

    -- Build a resume-safe batch query. The exact-name branch returns remaining
    -- versions after the current (archived_at, version) boundary; the strict
    -- name branch returns subsequent keys. UNION ALL keeps both predicates
    -- independently indexable.
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT * FROM (' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" = $2 AND ($5::timestamptz IS NULL OR COALESCE(o.archived_at, ''infinity''::timestamptz) < $5 OR (COALESCE(o.archived_at, ''infinity''::timestamptz) = $5 AND COALESCE(o.version, '''') > $6))' ||
                v_version_filter || ' ORDER BY COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4) UNION ALL ' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" > $2 AND lower(o.name) COLLATE "C" < $3' || v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" ASC, COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4)' ||
                ') sub ORDER BY lower(sub.name) COLLATE "C" ASC, COALESCE(sub.archived_at, ''infinity''::timestamptz) DESC, COALESCE(sub.version, '''') ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT * FROM (' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" = $2 AND ($5::timestamptz IS NULL OR COALESCE(o.archived_at, ''infinity''::timestamptz) < $5 OR (COALESCE(o.archived_at, ''infinity''::timestamptz) = $5 AND COALESCE(o.version, '''') > $6))' ||
                v_version_filter || ' ORDER BY COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4) UNION ALL ' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" > $2' || v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" ASC, COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4)' ||
                ') sub ORDER BY lower(sub.name) COLLATE "C" ASC, COALESCE(sub.archived_at, ''infinity''::timestamptz) DESC, COALESCE(sub.version, '''') ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT * FROM (' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" = $2 AND ($5::timestamptz IS NULL OR COALESCE(o.archived_at, ''infinity''::timestamptz) < $5 OR (COALESCE(o.archived_at, ''infinity''::timestamptz) = $5 AND COALESCE(o.version, '''') > $6))' ||
                v_version_filter || ' ORDER BY COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4) UNION ALL ' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 AND lower(o.name) COLLATE "C" >= $3' || v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" DESC, COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4)' ||
                ') sub ORDER BY lower(sub.name) COLLATE "C" DESC, COALESCE(sub.archived_at, ''infinity''::timestamptz) DESC, COALESCE(sub.version, '''') ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT * FROM (' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" = $2 AND ($5::timestamptz IS NULL OR COALESCE(o.archived_at, ''infinity''::timestamptz) < $5 OR (COALESCE(o.archived_at, ''infinity''::timestamptz) = $5 AND COALESCE(o.version, '''') > $6))' ||
                v_version_filter || ' ORDER BY COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4) UNION ALL ' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2' || v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" DESC, COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4)' ||
                ') sub ORDER BY lower(sub.name) COLLATE "C" DESC, COALESCE(sub.archived_at, ''infinity''::timestamptz) DESC, COALESCE(sub.version, '''') ASC LIMIT $4';
        END IF;
    END IF;

    -- Keep the delete-marker predicate literal so the cached generic
    -- plan can use idx_objects_delete_markers during the main-loop peek.
    IF delete_markers = 'only' THEN
        IF v_multi_row THEN
            v_delete_marker_peek_query :=
                'SELECT marker_page.name FROM (' || v_batch_query || ') marker_page LIMIT 1';
        ELSIF v_is_asc THEN
            -- Two separate literal query strings, not one gated by a bound
            -- boolean: folding "$n AND op1 OR NOT $n AND op2" into a single
            -- query defeats the generic plan's ability to push either
            -- comparison into the index. Branching in PL/pgSQL control flow
            -- instead keeps each query's index condition intact.
            v_delete_marker_peek_query :=
                'SELECT o.name FROM storage.objects o WHERE o.bucket_id = $1 ' ||
                'AND lower(o.name) COLLATE "C" >= $2' ||
                CASE WHEN v_upper_bound IS NOT NULL
                    THEN ' AND lower(o.name) COLLATE "C" < $3'
                    ELSE ''
                END ||
                v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1';
            -- Strict variant: used once the single-row ASC batch advance
            -- (below) has left v_next_seek pointing at the last row already
            -- emitted, so a plain >= would re-match it forever.
            v_delete_marker_peek_query_strict :=
                'SELECT o.name FROM storage.objects o WHERE o.bucket_id = $1 ' ||
                'AND lower(o.name) COLLATE "C" > $2' ||
                CASE WHEN v_upper_bound IS NOT NULL
                    THEN ' AND lower(o.name) COLLATE "C" < $3'
                    ELSE ''
                END ||
                v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1';
        ELSE
            v_delete_marker_peek_query :=
                'SELECT o.name FROM storage.objects o WHERE o.bucket_id = $1 ' ||
                'AND lower(o.name) COLLATE "C" < $2' ||
                CASE WHEN v_upper_bound IS NOT NULL
                    THEN ' AND lower(o.name) COLLATE "C" >= $3'
                    ELSE ''
                END ||
                v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1';
        END IF;
    END IF;

    -- Initialize seek position
    IF v_is_asc THEN
        v_next_seek := v_prefix_lower;
    ELSE
        -- DESC performs one specialized initial seek so partial current-version
        -- and delete-marker indexes remain available.
        EXECUTE format(
            'SELECT o.name FROM storage.objects o WHERE o.bucket_id = $1%s%s ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1',
            CASE WHEN v_upper_bound IS NOT NULL
                THEN ' AND lower(o.name) COLLATE "C" >= $2 AND lower(o.name) COLLATE "C" < $3'
                ELSE ''
            END,
            v_version_filter
        )
        INTO v_peek_name
        USING bucketname, v_prefix_lower, v_upper_bound;

        IF v_peek_name IS NOT NULL THEN
            v_next_seek := lower(v_peek_name) || v_delimiter;
        ELSE
            RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch and
    -- the delete-marker-only path
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= v_limit;

        v_previous_seek := v_next_seek;
        v_previous_seek_at := v_next_seek_at;
        v_previous_seek_version := v_next_seek_version;
        v_previous_count := v_count;
        v_previous_skipped := v_skipped;

        -- STEP 1: PEEK
        v_peek_name := NULL;
        IF delete_markers = 'only' THEN
            EXECUTE CASE WHEN v_next_seek_strict
                THEN v_delete_marker_peek_query_strict
                ELSE v_delete_marker_peek_query
            END
                INTO v_peek_name
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END,
                    1, v_next_seek_at, v_next_seek_version;
        ELSIF v_multi_row AND v_next_seek_at IS NOT NULL THEN
            SELECT o.name INTO v_peek_name
            FROM storage.objects o
            WHERE o.bucket_id = bucketname
              AND lower(o.name) COLLATE "C" = v_next_seek
              AND (COALESCE(o.archived_at, 'infinity'::timestamptz) < v_next_seek_at
                   OR (COALESCE(o.archived_at, 'infinity'::timestamptz) = v_next_seek_at
                       AND COALESCE(o.version, '') > v_next_seek_version))
              AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
              AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
              AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
              AND (delete_markers != 'only' OR o.is_delete_marker)
            ORDER BY COALESCE(o.archived_at, 'infinity'::timestamptz) DESC,
                     COALESCE(o.version, '') ASC
            LIMIT 1;

            -- The current key is exhausted. Clear its version boundary and
            -- make the following ASC name peek strict. Appending '/' is not a
            -- valid lexical successor because keys ending in characters such
            -- as '!' sort between the exhausted name and name || '/'.
            IF v_peek_name IS NULL THEN
                IF v_is_asc THEN
                    v_next_seek_strict := true;
                END IF;
                v_next_seek_at := NULL;
                v_next_seek_version := '';
            END IF;
        END IF;

        -- Single-row mode is always noncurrent_versions='exclude'. Keep the
        -- current-row predicate literal so generic plans use the current index.
        IF delete_markers != 'only' AND v_peek_name IS NULL AND NOT v_multi_row THEN
            IF v_is_asc THEN
                IF v_next_seek_strict AND v_upper_bound IS NOT NULL THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" > v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                    ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
                ELSIF v_next_seek_strict THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" > v_next_seek
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                    ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
                ELSIF v_upper_bound IS NOT NULL THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                    ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
                ELSE
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                    ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
                END IF;
            ELSIF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                  AND o.archived_at IS NULL
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                  AND o.archived_at IS NULL
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        ELSIF delete_markers != 'only' AND v_peek_name IS NULL AND v_is_asc THEN
            IF v_next_seek_strict AND v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" > v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                  AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                  AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                  AND (delete_markers != 'only' OR o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSIF v_next_seek_strict THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" > v_next_seek
                  AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                  AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                  AND (delete_markers != 'only' OR o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSIF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                  AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                  AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                  AND (delete_markers != 'only' OR o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                  AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                  AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                  AND (delete_markers != 'only' OR o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSIF delete_markers != 'only' AND v_peek_name IS NULL THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                  AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                  AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                  AND (delete_markers != 'only' OR o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                  AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                  AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                  AND (delete_markers != 'only' OR o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- If the peek landed on a different key than we were tracking, any
        -- version boundary belongs to the OLD key and must not leak into the
        -- new one - e.g. the deleteMarkers='only' peek doesn't know or care
        -- whether it's continuing the same key or jumping to a new one, so
        -- it never clears these itself.
        IF lower(v_peek_name) IS DISTINCT FROM v_next_seek THEN
            v_next_seek_at := NULL;
            v_next_seek_version := '';
        END IF;

        -- The peek is authoritative for the next key to process. This is
        -- especially important after exhausting a multi-version key: the
        -- version boundary has been cleared, so executing the batch against
        -- a stale v_next_seek would replay every version of that old key.
        v_next_seek := lower(v_peek_name);
        v_next_seek_strict := false;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(lower(v_peek_name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Handle offset, emit if needed, skip to next folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := substring(rtrim(storage.get_common_prefix(v_peek_name, v_prefix, v_delimiter), v_delimiter) from v_prefix_len + 1);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                version := NULL;
                archived_at := NULL;
                is_delete_marker := NULL;
                is_versioned := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
            v_next_seek_at := NULL;
            v_next_seek_version := '';
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size,
                    v_next_seek_at, v_next_seek_version
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it. Reset
                    -- strict mode too - it may have been set by an earlier
                    -- row in this same batch (see the single-row ASC advance
                    -- below), and v_next_seek here is the folder-triggering
                    -- row's own name, which the next peek must find inclusively.
                    v_next_seek := CASE
                        WHEN v_is_asc THEN lower(v_current.name)
                        ELSE lower(v_current.name) || v_delimiter
                    END;
                    v_next_seek_at := NULL;
                    v_next_seek_version := '';
                    v_next_seek_strict := false;
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := substring(v_current.name from v_prefix_len + 1);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    version := v_current.version;
                    archived_at := v_current.archived_at;
                    is_delete_marker := v_current.is_delete_marker;
                    is_versioned := v_current.is_versioned;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Multi-row mode must remain on this key until all of its
                -- versions have crossed the internal batch boundary.
                IF v_multi_row THEN
                    v_next_seek := lower(v_current.name);
                    v_next_seek_at := COALESCE(v_current.archived_at, 'infinity'::timestamptz);
                    v_next_seek_version := COALESCE(v_current.version, '');
                ELSIF v_is_asc THEN
                    -- Appending the delimiter as a fake lexical successor would
                    -- skip a real key like `name || '!'` (or any character
                    -- sorting below the delimiter), which sorts between `name`
                    -- and `name || delimiter`. Track the real name and mark the
                    -- next comparison strict instead - same fix as the
                    -- exhausted-key case above.
                    v_next_seek := lower(v_current.name);
                    v_next_seek_strict := true;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;

        IF v_count = v_previous_count
           AND v_skipped = v_previous_skipped
           AND v_next_seek IS NOT DISTINCT FROM v_previous_seek
           AND v_next_seek_at IS NOT DISTINCT FROM v_previous_seek_at
           AND v_next_seek_version IS NOT DISTINCT FROM v_previous_seek_version THEN
            RAISE EXCEPTION 'storage.search made no progress at seek (%, %, %)',
                v_next_seek, v_next_seek_at, v_next_seek_version;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: search_by_timestamp(text, text, integer, integer, text, text, text, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text, noncurrent_versions text DEFAULT 'exclude'::text, delete_markers text DEFAULT 'exclude'::text, p_start_after_version text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb, version text, archived_at timestamp with time zone, is_delete_marker boolean, is_versioned boolean)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
    v_prefix_pattern text;
    v_sort_order text;
    v_sort_column text;
    v_version_tiebreak text;
BEGIN
    v_prefix := coalesce(p_prefix, '');
    -- Keep the raw prefix for common-prefix calculations and escape only LIKE metacharacters.
    v_prefix_pattern := replace(v_prefix, chr(92), chr(92) || chr(92));
    v_prefix_pattern := replace(v_prefix_pattern, '%', chr(92) || '%');
    v_prefix_pattern := replace(v_prefix_pattern, '_', chr(92) || '_');

    -- COALESCE first: NULL NOT IN (...) evaluates to NULL (not TRUE), so a
    -- bare NOT IN check silently leaves an explicit NULL argument unreset.
    noncurrent_versions := COALESCE(noncurrent_versions, 'exclude');
    delete_markers := COALESCE(delete_markers, 'exclude');
    IF noncurrent_versions NOT IN ('exclude', 'only', 'include') THEN
        noncurrent_versions := 'exclude';
    END IF;
    IF delete_markers NOT IN ('exclude', 'only', 'include') THEN
        delete_markers := 'exclude';
    END IF;

    -- $9 is only populated in multi-row mode; it's always '' otherwise, so
    -- only use each row's real version as a tiebreak in multi-row mode.
    v_version_tiebreak := CASE WHEN noncurrent_versions IN ('only', 'include') THEN 'COALESCE(version, '''')' ELSE '''''' END;

    -- Defense-in-depth: this function is independently reachable and must
    -- not trust p_sort_order/p_sort_column to already be validated by a
    -- caller. Normalize to the same strict allow-list storage.search_v2
    -- uses before interpolating anything into dynamic SQL below.
    v_sort_order := lower(coalesce(p_sort_order, 'asc'));
    IF v_sort_order NOT IN ('asc', 'desc') THEN
        v_sort_order := 'asc';
    END IF;

    v_sort_column := lower(coalesce(p_sort_column, 'updated_at'));
    IF v_sort_column NOT IN ('updated_at', 'created_at') THEN
        v_sort_column := 'updated_at';
    END IF;

    IF v_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                o.version AS obj_version,
                o.archived_at AS obj_archived_at,
                o.is_delete_marker AS obj_is_delete_marker,
                o.is_versioned AS obj_is_versioned,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $10 || '%%'
              AND ($7 != 'exclude' OR o.archived_at IS NULL)
              AND ($7 != 'only' OR o.archived_at IS NOT NULL)
              AND ($8 != 'exclude' OR NOT o.is_delete_marker)
              AND ($8 != 'only' OR o.is_delete_marker)
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                common_prefix AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                NULL::text AS version,
                NULL::timestamptz AS archived_at,
                NULL::boolean AS is_delete_marker,
                NULL::boolean AS is_versioned,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                obj_version AS version,
                obj_archived_at AS archived_at,
                obj_is_delete_marker AS is_delete_marker,
                obj_is_versioned AS is_versioned,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz),
                    name COLLATE "C",
                    %s
                ) %s ROW(
                    -- truncated the same way as the stored value above
                    date_trunc('milliseconds', COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz)),
                    $5,
                    $9
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata,
            version,
            archived_at,
            is_delete_marker,
            is_versioned
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s,
            COALESCE(version, '') %s
        LIMIT $4
    $sql$,
        v_sort_column,
        v_version_tiebreak,
        v_cursor_op,
        v_sort_column,
        v_sort_order,
        v_sort_order,
        v_sort_order
    );

    -- version is the third tiebreak component for two versions of the same
    -- key tying on both timestamp and name (see filtered CTE / ORDER BY above)
    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after, noncurrent_versions, delete_markers, coalesce(p_start_after_version, ''), v_prefix_pattern;
END;
$_$;


--
-- Name: search_v2(text, text, integer, integer, text, text, text, text, text, text, timestamp with time zone, text, boolean); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text, noncurrent_versions text DEFAULT 'exclude'::text, delete_markers text DEFAULT 'exclude'::text, start_after_archived_at timestamp with time zone DEFAULT NULL::timestamp with time zone, start_after_version text DEFAULT ''::text, start_after_is_continuation boolean DEFAULT false) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb, version text, archived_at timestamp with time zone, is_delete_marker boolean, is_versioned boolean)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata,
            l.version,
            l.archived_at,
            l.is_delete_marker,
            l.is_versioned
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            CASE WHEN start_after_is_continuation THEN '' ELSE start_after END,
            CASE WHEN start_after_is_continuation THEN start_after ELSE '' END,
            v_sort_ord,
            noncurrent_versions,
            delete_markers,
            start_after_archived_at,
            start_after_version
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after,
            noncurrent_versions, delete_markers, start_after_version
        );
    END IF;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: custom_oauth_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.custom_oauth_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_type text NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    acceptable_client_ids text[] DEFAULT '{}'::text[] NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    pkce_enabled boolean DEFAULT true NOT NULL,
    attribute_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    authorization_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    email_optional boolean DEFAULT false NOT NULL,
    issuer text,
    discovery_url text,
    skip_nonce_check boolean DEFAULT false NOT NULL,
    cached_discovery jsonb,
    discovery_cached_at timestamp with time zone,
    authorization_url text,
    token_url text,
    userinfo_url text,
    jwks_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_claims_allowlist text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT custom_oauth_providers_authorization_url_https CHECK (((authorization_url IS NULL) OR (authorization_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_authorization_url_length CHECK (((authorization_url IS NULL) OR (char_length(authorization_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_client_id_length CHECK (((char_length(client_id) >= 1) AND (char_length(client_id) <= 512))),
    CONSTRAINT custom_oauth_providers_discovery_url_length CHECK (((discovery_url IS NULL) OR (char_length(discovery_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_identifier_format CHECK ((identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text)),
    CONSTRAINT custom_oauth_providers_issuer_length CHECK (((issuer IS NULL) OR ((char_length(issuer) >= 1) AND (char_length(issuer) <= 2048)))),
    CONSTRAINT custom_oauth_providers_jwks_uri_https CHECK (((jwks_uri IS NULL) OR (jwks_uri ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_jwks_uri_length CHECK (((jwks_uri IS NULL) OR (char_length(jwks_uri) <= 2048))),
    CONSTRAINT custom_oauth_providers_name_length CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT custom_oauth_providers_oauth2_requires_endpoints CHECK (((provider_type <> 'oauth2'::text) OR ((authorization_url IS NOT NULL) AND (token_url IS NOT NULL) AND (userinfo_url IS NOT NULL)))),
    CONSTRAINT custom_oauth_providers_oidc_discovery_url_https CHECK (((provider_type <> 'oidc'::text) OR (discovery_url IS NULL) OR (discovery_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_issuer_https CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NULL) OR (issuer ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_requires_issuer CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NOT NULL))),
    CONSTRAINT custom_oauth_providers_provider_type_check CHECK ((provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]))),
    CONSTRAINT custom_oauth_providers_token_url_https CHECK (((token_url IS NULL) OR (token_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_token_url_length CHECK (((token_url IS NULL) OR (char_length(token_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_userinfo_url_https CHECK (((userinfo_url IS NULL) OR (userinfo_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_userinfo_url_length CHECK (((userinfo_url IS NULL) OR (char_length(userinfo_url) <= 2048)))
);


--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.flow_state IS 'Stores metadata for all OAuth/SSO login flows';


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


--
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


--
-- Name: mfa_recovery_code_sets; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_recovery_code_sets (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    mfa_factor_id uuid NOT NULL,
    failed_verification_count integer DEFAULT 0 NOT NULL,
    verification_locked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mfa_recovery_code_sets_failed_verification_count_check CHECK ((failed_verification_count >= 0))
);


--
-- Name: mfa_recovery_codes; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_recovery_codes (
    id uuid NOT NULL,
    mfa_recovery_code_set_id uuid NOT NULL,
    code_hash text NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


--
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    token_endpoint_auth_method text NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048)),
    CONSTRAINT oauth_clients_token_endpoint_auth_method_check CHECK ((token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])))
);


--
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


--
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


--
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: scim_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.scim_tokens (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    token_hash text NOT NULL,
    prefix text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    last_used_at timestamp with time zone,
    CONSTRAINT scim_tokens_expires_at_future CHECK (((expires_at IS NULL) OR (expires_at > created_at))),
    CONSTRAINT scim_tokens_revoked_after_created CHECK (((revoked_at IS NULL) OR (revoked_at >= created_at))),
    CONSTRAINT scim_tokens_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: scim_users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.scim_users (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    user_id uuid,
    resource jsonb NOT NULL,
    user_name text GENERATED ALWAYS AS (lower((resource ->> 'userName'::text))) STORED NOT NULL,
    external_id text GENERATED ALWAYS AS ((resource ->> 'externalId'::text)) STORED,
    active boolean GENERATED ALWAYS AS (COALESCE(((resource ->> 'active'::text))::boolean, true)) STORED NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
);


--
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- Name: webauthn_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    challenge_type text NOT NULL,
    session_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT webauthn_challenges_challenge_type_check CHECK ((challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text])))
);


--
-- Name: webauthn_credentials; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id bytea NOT NULL,
    public_key bytea NOT NULL,
    attestation_type text DEFAULT ''::text NOT NULL,
    aaguid uuid,
    sign_count bigint DEFAULT 0 NOT NULL,
    transports jsonb DEFAULT '[]'::jsonb NOT NULL,
    backup_eligible boolean DEFAULT false NOT NULL,
    backed_up boolean DEFAULT false NOT NULL,
    friendly_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: _migration_179_invitation_layout_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._migration_179_invitation_layout_backup (
    event_id uuid NOT NULL,
    blocks_layout jsonb,
    published_snapshot jsonb
);


--
-- Name: agent_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_memory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    agent_id uuid,
    fact_key text NOT NULL,
    fact_value text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    source text DEFAULT 'human'::text NOT NULL,
    proposed_by_agent_id uuid,
    proposed_run_id uuid,
    proposed_task_id uuid,
    approved_by uuid,
    approved_at timestamp with time zone,
    approval_id uuid,
    effective_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_memory_fact_key_check CHECK (((char_length(fact_key) >= 1) AND (char_length(fact_key) <= 120))),
    CONSTRAINT agent_memory_fact_value_check CHECK (((char_length(fact_value) >= 1) AND (char_length(fact_value) <= 4000))),
    CONSTRAINT agent_memory_source_check CHECK ((source = ANY (ARRAY['human'::text, 'system'::text, 'agent-proposed'::text]))),
    CONSTRAINT agent_memory_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text]))),
    CONSTRAINT agent_memory_version_check CHECK ((version >= 1))
);


--
-- Name: TABLE agent_memory; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agent_memory IS 'Stage 12: approved persistent facts. Agents propose via approvals (action=memory_propose); only the server applier and human direct-create write here. NULL tenant = platform (platform-admin only); NULL agent = shared within scope.';


--
-- Name: COLUMN agent_memory.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_memory.status IS 'Live state only. revoked/expired rows are retained for audit and excluded from agent retrieval.';


--
-- Name: agent_memory_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_memory_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fact_id uuid NOT NULL,
    version integer NOT NULL,
    fact_value text NOT NULL,
    status text NOT NULL,
    expires_at timestamp with time zone,
    approval_id uuid,
    proposed_by_agent_id uuid,
    proposed_run_id uuid,
    proposed_task_id uuid,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_memory_versions_version_check CHECK ((version >= 1))
);


--
-- Name: TABLE agent_memory_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agent_memory_versions IS 'Stage 12: immutable per-version snapshots. Every accepted mutation inserts one row first. No UPDATE/DELETE policies exist — history is append-only.';


--
-- Name: agent_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    run_id uuid,
    tenant_id uuid,
    report_type text DEFAULT 'task'::text NOT NULL,
    summary text NOT NULL,
    sections jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_reports_report_type_check CHECK ((report_type = ANY (ARRAY['task'::text, 'incident'::text, 'daily'::text, 'weekly'::text, 'investigation'::text]))),
    CONSTRAINT agent_reports_summary_check CHECK (((char_length(summary) >= 10) AND (char_length(summary) <= 5000)))
);


--
-- Name: TABLE agent_reports; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agent_reports IS 'Structured run reports. sections JSONB contains what_happened, investigation, findings, evidence, actions, remaining, needs_from_human, next_steps.';


--
-- Name: agent_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid,
    agent_id uuid NOT NULL,
    tenant_id uuid,
    triggered_by text NOT NULL,
    model_used text,
    provider_used text,
    status text DEFAULT 'running'::text NOT NULL,
    guard_result text DEFAULT 'pass'::text NOT NULL,
    duration_ms integer,
    approval_id uuid,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    attempt_no integer,
    CONSTRAINT agent_runs_attempt_no_check CHECK (((attempt_no IS NULL) OR (attempt_no >= 1))),
    CONSTRAINT agent_runs_duration_ms_check CHECK (((duration_ms IS NULL) OR (duration_ms >= 0))),
    CONSTRAINT agent_runs_guard_result_check CHECK ((guard_result = ANY (ARRAY['pass'::text, 'flagged'::text, 'rejected'::text]))),
    CONSTRAINT agent_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'awaiting_approval'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))),
    CONSTRAINT agent_runs_triggered_by_check CHECK ((triggered_by = ANY (ARRAY['manual'::text, 'schedule'::text, 'webhook'::text, 'incident'::text, 'qa'::text, 'cron'::text, 'telegram'::text, 'gateway'::text])))
);


--
-- Name: TABLE agent_runs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agent_runs IS 'One execution attempt per task/gateway call. Stores provider/model/guard_result/duration/error for Workforce UI and audit.';


--
-- Name: COLUMN agent_runs.attempt_no; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_runs.attempt_no IS 'Stage 10: 1-based attempt number within the task. NULL = legacy pre-Stage-10 row.';


--
-- Name: agent_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    seq integer NOT NULL,
    kind text NOT NULL,
    tool_name text,
    args_redacted jsonb,
    result_summary text,
    content text,
    guard_verdict text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_steps_guard_verdict_check CHECK (((guard_verdict IS NULL) OR (guard_verdict = ANY (ARRAY['pass'::text, 'flagged'::text, 'rejected'::text])))),
    CONSTRAINT agent_steps_kind_check CHECK ((kind = ANY (ARRAY['thought'::text, 'tool_call'::text, 'tool_result'::text, 'model_output'::text, 'guard_verdict'::text, 'approval_request'::text, 'knowledge_retrieval'::text, 'memory_retrieval'::text, 'error'::text]))),
    CONSTRAINT agent_steps_seq_check CHECK ((seq >= 0))
);


--
-- Name: TABLE agent_steps; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agent_steps IS 'Steps within a run. args_redacted via redactArgs(); never stores secrets. Result linkage via ai_tool_invocations when tool_result.';


--
-- Name: agent_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    tenant_id uuid,
    requested_by uuid,
    title text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'completed'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    approval_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text,
    lease_owner text,
    lease_expires_at timestamp with time zone,
    last_heartbeat_at timestamp with time zone,
    claim_token_hash text,
    attempt_count integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    run_after timestamp with time zone,
    result_ref text,
    CONSTRAINT agent_tasks_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT agent_tasks_max_attempts_check CHECK (((max_attempts >= 1) AND (max_attempts <= 5))),
    CONSTRAINT agent_tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT agent_tasks_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'awaiting_approval'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'expired'::text]))),
    CONSTRAINT agent_tasks_title_check CHECK (((char_length(title) >= 3) AND (char_length(title) <= 200)))
);


--
-- Name: TABLE agent_tasks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agent_tasks IS 'Workforce tasks. In Phase 142 synchronous gateway creates one task + run per request; future queue will use status=queued + FOR UPDATE SKIP LOCKED leasing.';


--
-- Name: COLUMN agent_tasks.idempotency_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_tasks.idempotency_key IS 'Stage 10: enqueue dedupe. Same key returns the existing job, never a second row (qa_runs precedent). NULL = no dedupe requested.';


--
-- Name: COLUMN agent_tasks.lease_owner; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_tasks.lease_owner IS 'Stage 10: worker identity string that holds the lease (e.g. gha:<run_id>, manual:<user-id>). Text, not FK: no worker identity table exists by design.';


--
-- Name: COLUMN agent_tasks.lease_expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_tasks.lease_expires_at IS 'Stage 10: lease TTL. running + expired lease = interrupted/reclaimable (derived, never a stored status).';


--
-- Name: COLUMN agent_tasks.last_heartbeat_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_tasks.last_heartbeat_at IS 'Stage 10: worker renewal marker. Only the lease owner may renew (enforced in app, not RLS).';


--
-- Name: COLUMN agent_tasks.claim_token_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_tasks.claim_token_hash IS 'Stage 10: SHA-256 of the single-use per-claim token (QA two-layer precedent). NULL when unclaimed or consumed. Never the plaintext.';


--
-- Name: COLUMN agent_tasks.attempt_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_tasks.attempt_count IS 'Stage 10: attempts started. attempt_count>0 + queued + future run_after = retryable.';


--
-- Name: COLUMN agent_tasks.max_attempts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_tasks.max_attempts IS 'Stage 10: bounded retries. Budget exhaustion = terminal failed.';


--
-- Name: COLUMN agent_tasks.run_after; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_tasks.run_after IS 'Stage 10: delayed visibility (backoff). NULL = immediately claimable.';


--
-- Name: COLUMN agent_tasks.result_ref; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_tasks.result_ref IS 'Stage 10: pointer to the result artifact/report. Free text like approvals.audit_ref.';


--
-- Name: agent_tools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_tools (
    agent_id uuid NOT NULL,
    tool_name text NOT NULL,
    allowed boolean DEFAULT true NOT NULL,
    risk_override text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_tools_risk_override_check CHECK (((risk_override IS NULL) OR (risk_override = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))))
);


--
-- Name: TABLE agent_tools; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agent_tools IS 'Per-agent allowlist. Software-enforced in orchestrator — not advisory. Model cannot grant itself tools.';


--
-- Name: agent_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    version integer NOT NULL,
    system_prompt text NOT NULL,
    model_selection text NOT NULL,
    autonomy_level text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_versions_version_check CHECK ((version >= 1))
);


--
-- Name: TABLE agent_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agent_versions IS 'Immutable snapshot on each agent config change. Version increments via application — not DB trigger.';


--
-- Name: agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    display_name text NOT NULL,
    department text NOT NULL,
    description text NOT NULL,
    system_prompt text NOT NULL,
    model_selection text DEFAULT 'aldriva'::text NOT NULL,
    autonomy_level text DEFAULT 'L0'::text NOT NULL,
    tenant_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agents_autonomy_level_check CHECK ((autonomy_level = ANY (ARRAY['L0'::text, 'L1'::text, 'L2'::text, 'L3'::text, 'L4'::text]))),
    CONSTRAINT agents_department_check CHECK (((char_length(department) >= 2) AND (char_length(department) <= 60))),
    CONSTRAINT agents_description_check CHECK (((char_length(description) >= 10) AND (char_length(description) <= 1000))),
    CONSTRAINT agents_display_name_check CHECK (((char_length(display_name) >= 2) AND (char_length(display_name) <= 60))),
    CONSTRAINT agents_model_selection_check CHECK ((model_selection = ANY (ARRAY['aldriva'::text, 'gemini'::text, 'openrouter'::text]))),
    CONSTRAINT agents_name_check CHECK ((name ~ '^[a-z][a-z0-9_]{1,30}$'::text)),
    CONSTRAINT agents_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text, 'deprecated'::text]))),
    CONSTRAINT agents_system_prompt_check CHECK (((char_length(system_prompt) >= 50) AND (char_length(system_prompt) <= 8000))),
    CONSTRAINT agents_version_check CHECK ((version >= 1))
);


--
-- Name: TABLE agents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agents IS 'AI workforce identities. Tenant_id NULL = platform agent. Extensible via INSERT — no schema change per new agent.';


--
-- Name: COLUMN agents.autonomy_level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agents.autonomy_level IS 'L0 read-only only in Phase 140-142. Escalation requires approvals table and human signature.';


--
-- Name: COLUMN agents.tenant_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agents.tenant_id IS 'NULL for platform agents (Dylan, Sentinel, QA). Tenant-scoped agents reference organizers.id.';


--
-- Name: ai_content_calendar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_content_calendar (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    topic text NOT NULL,
    why_it_matters text,
    aldriva_angle text,
    suggested_platform text DEFAULT 'general'::text NOT NULL,
    suggested_format text DEFAULT 'post'::text NOT NULL,
    source_trend text,
    source_url text,
    status text DEFAULT 'proposed'::text NOT NULL,
    target_date timestamp with time zone,
    admin_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_content_calendar_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'scheduled'::text, 'dismissed'::text, 'published'::text])))
);


--
-- Name: ai_content_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_content_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content_type text NOT NULL,
    source_id uuid NOT NULL,
    snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    ai_provider text,
    generated_text text,
    published boolean DEFAULT false NOT NULL,
    published_at timestamp with time zone,
    published_to text,
    guard_result text DEFAULT 'pass'::text NOT NULL,
    guard_flags jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_content_items_content_type_check CHECK ((content_type = ANY (ARRAY['event'::text, 'fundraiser'::text, 'business'::text, 'article'::text, 'product'::text, 'platform'::text]))),
    CONSTRAINT ai_content_items_guard_result_check CHECK ((guard_result = ANY (ARRAY['pass'::text, 'flagged'::text, 'rejected'::text])))
);


--
-- Name: ai_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    title text,
    ai_provider text DEFAULT 'gemini'::text NOT NULL,
    workflow_type text DEFAULT 'general'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_conversations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'abandoned'::text])))
);


--
-- Name: ai_guard_rejections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_guard_rejections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    context text NOT NULL,
    category text NOT NULL,
    reason text NOT NULL,
    excerpt text,
    content_type text,
    source_id uuid,
    verdict text DEFAULT 'rejected'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid,
    CONSTRAINT ai_guard_rejections_verdict_check CHECK ((verdict = ANY (ARRAY['flagged'::text, 'rejected'::text])))
);


--
-- Name: COLUMN ai_guard_rejections.tenant_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_guard_rejections.tenant_id IS 'Tenant context at rejection time. NULL = platform-level (no tenant). Populated by logRejection/logInputRejection when caller has tenant_id. Pre-migration rows stay NULL by design.';


--
-- Name: ai_knowledge_docs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_knowledge_docs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[] NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text,
    tool_name text,
    tool_payload jsonb,
    guard_result text DEFAULT 'pass'::text NOT NULL,
    guard_flags jsonb,
    token_count integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_messages_guard_result_check CHECK ((guard_result = ANY (ARRAY['pass'::text, 'flagged'::text, 'rejected'::text]))),
    CONSTRAINT ai_messages_role_check CHECK ((role = ANY (ARRAY['system'::text, 'user'::text, 'assistant'::text, 'tool'::text])))
);


--
-- Name: ai_provider_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_provider_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    provider text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    model text,
    fallback_provider text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_provider_configs_fallback_provider_check CHECK (((fallback_provider IS NULL) OR (fallback_provider = ANY (ARRAY['gemini'::text, 'openrouter'::text, 'aldriva'::text])))),
    CONSTRAINT ai_provider_configs_provider_check CHECK ((provider = ANY (ARRAY['gemini'::text, 'openrouter'::text, 'aldriva'::text]))),
    CONSTRAINT ai_provider_configs_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);


--
-- Name: TABLE ai_provider_configs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_provider_configs IS 'Tenant AI provider routing. References only — no secret columns exist on this table by design. Secrets remain in env/vault.';


--
-- Name: ai_tool_invocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_tool_invocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    conversation_id uuid,
    actor_type text NOT NULL,
    provider text,
    tool_name text NOT NULL,
    arguments_safe jsonb DEFAULT '{}'::jsonb NOT NULL,
    authorization_decision text DEFAULT 'allowed'::text NOT NULL,
    rows_affected integer,
    result_classification text DEFAULT 'success'::text NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_tool_invocations_actor_type_check CHECK ((actor_type = ANY (ARRAY['ai'::text, 'organizer'::text, 'system'::text]))),
    CONSTRAINT ai_tool_invocations_authorization_decision_check CHECK ((authorization_decision = ANY (ARRAY['allowed'::text, 'denied'::text, 'failed_closed'::text]))),
    CONSTRAINT ai_tool_invocations_result_classification_check CHECK ((result_classification = ANY (ARRAY['success'::text, 'guard_rejected'::text, 'guard_flagged'::text, 'error'::text]))),
    CONSTRAINT ai_tool_invocations_rows_affected_check CHECK (((rows_affected IS NULL) OR (rows_affected >= 0)))
);


--
-- Name: TABLE ai_tool_invocations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_tool_invocations IS 'AI action audit log. tenant_id NULL only for pre-resolution failures; those rows are admin-only. arguments_safe is redacted; never stores secrets or raw PII.';


--
-- Name: COLUMN ai_tool_invocations.tenant_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_tool_invocations.tenant_id IS 'Nullable only for fail-closed pre-tenant-resolution logging. All resolved calls carry the authoritative tenant_id derived from session+entity_members or the channel_asset chain, never from model output.';


--
-- Name: approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requested_by uuid,
    requested_by_agent_id uuid,
    tenant_id uuid,
    action text NOT NULL,
    reason text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    risk text NOT NULL,
    proposed_outcome jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    approver_id uuid,
    decided_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '48:00:00'::interval) NOT NULL,
    audit_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT approvals_action_check CHECK (((char_length(action) >= 3) AND (char_length(action) <= 200))),
    CONSTRAINT approvals_reason_check CHECK (((char_length(reason) >= 10) AND (char_length(reason) <= 2000))),
    CONSTRAINT approvals_risk_check CHECK ((risk = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT approvals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text])))
);


--
-- Name: TABLE approvals; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.approvals IS 'Human approval gates. Application-enforced: orchestrator must not execute high/critical tools without approved row. Model instructions are never authoritative.';


--
-- Name: article_audios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.article_audios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    article_id uuid NOT NULL,
    content_hash text NOT NULL,
    audio_url text NOT NULL,
    storage_path text NOT NULL,
    duration_seconds numeric(10,2) NOT NULL,
    voice text DEFAULT 'Magpie-Multilingual.EN-US.Aria'::text NOT NULL,
    language text DEFAULT 'en-US'::text NOT NULL,
    status text DEFAULT 'ready'::text NOT NULL,
    timing_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT article_audios_status_check CHECK ((status = ANY (ARRAY['not_generated'::text, 'generating'::text, 'ready'::text, 'failed'::text, 'stale'::text])))
);


--
-- Name: articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    organizer_id uuid,
    title text NOT NULL,
    slug text NOT NULL,
    excerpt text,
    body text NOT NULL,
    cover_image_url text,
    categories text[] DEFAULT ARRAY[]::text[] NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[] NOT NULL,
    seo_title text,
    seo_description text,
    canonical_url text,
    visibility text DEFAULT 'public'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    scheduled_for timestamp with time zone,
    reading_time integer,
    business_id uuid,
    rejection_reason text,
    CONSTRAINT articles_body_check CHECK ((char_length(TRIM(BOTH FROM body)) >= 20)),
    CONSTRAINT articles_excerpt_check CHECK (((excerpt IS NULL) OR (char_length(excerpt) <= 320))),
    CONSTRAINT articles_reading_time_check CHECK (((reading_time IS NULL) OR (reading_time >= 1))),
    CONSTRAINT articles_seo_description_check CHECK (((seo_description IS NULL) OR (char_length(seo_description) <= 180))),
    CONSTRAINT articles_seo_title_check CHECK (((seo_title IS NULL) OR (char_length(seo_title) <= 70))),
    CONSTRAINT articles_slug_check CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text)),
    CONSTRAINT articles_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'published'::text, 'scheduled'::text, 'archived'::text, 'expired'::text, 'rejected'::text]))),
    CONSTRAINT articles_title_check CHECK (((char_length(TRIM(BOTH FROM title)) >= 3) AND (char_length(TRIM(BOTH FROM title)) <= 180))),
    CONSTRAINT articles_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'private'::text])))
);


--
-- Name: TABLE articles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.articles IS 'Editorial articles published by Aldriva users. Optional business ownership is deferred until the businesses table exists.';


--
-- Name: COLUMN articles.owner_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.articles.owner_id IS 'Per-table owner reference to auth.users, matching the safer ownership pattern selected in the platform ADR.';


--
-- Name: COLUMN articles.organizer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.articles.organizer_id IS 'Optional current-platform publisher profile. Future business_id FK should be added in the businesses phase.';


--
-- Name: COLUMN articles.scheduled_for; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.articles.scheduled_for IS 'When status=''scheduled'', the article becomes publicly visible at this UTC timestamp. Access control is enforced server-side on EVERY request — the Server Component fetch checks now() >= scheduled_for before rendering. Do not rely on a cron status flip or RLS alone for this gate.';


--
-- Name: COLUMN articles.reading_time; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.articles.reading_time IS 'Estimated reading time in minutes. Computed in the server action as Math.max(1, Math.round(word_count / 200)). The Math.max(1,...) ensures this never violates the >= 1 CHECK constraint.';


--
-- Name: COLUMN articles.business_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.articles.business_id IS 'Optional business owner. No FK constraint until the businesses table is created in Phase 2. Add FK in Phase 2 migration: ALTER TABLE articles ADD CONSTRAINT articles_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL;';


--
-- Name: beneficiaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beneficiaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    type text NOT NULL,
    name text NOT NULL,
    relationship text,
    species text,
    registration_number text,
    photo text,
    bio text,
    contact_email text,
    website text,
    facebook text,
    twitter text,
    instagram text,
    linkedin text,
    youtube text,
    tiktok text,
    claim_email text,
    claim_token text,
    claim_sent_at timestamp with time zone,
    claimed_at timestamp with time zone,
    verified_at timestamp with time zone,
    visibility text DEFAULT 'public'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    slug text NOT NULL,
    CONSTRAINT beneficiaries_name_check CHECK ((TRIM(BOTH FROM name) <> ''::text)),
    CONSTRAINT beneficiaries_type_check CHECK ((type = ANY (ARRAY['self'::text, 'person'::text, 'family'::text, 'organization'::text, 'charity'::text, 'community'::text, 'animal'::text]))),
    CONSTRAINT beneficiaries_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'private'::text])))
);


--
-- Name: business_branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    label text NOT NULL,
    address text,
    city text,
    state text,
    country text,
    phone text,
    is_main boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_branches_label_check CHECK (((char_length(label) >= 2) AND (char_length(label) <= 100))),
    CONSTRAINT business_branches_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
);


--
-- Name: business_courier_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_courier_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    business_id uuid NOT NULL,
    courier_worker_id uuid NOT NULL,
    status text DEFAULT 'offered'::text NOT NULL,
    decline_message text,
    offered_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    accepted_at timestamp with time zone,
    declined_at timestamp with time zone,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    expires_at timestamp with time zone DEFAULT (clock_timestamp() + public.courier_dispatch_offer_timeout()) NOT NULL,
    CONSTRAINT business_courier_offers_decline_message_check CHECK (((decline_message IS NULL) OR (char_length(btrim(decline_message)) <= 300))),
    CONSTRAINT business_courier_offers_status_check CHECK ((status = ANY (ARRAY['offered'::text, 'accepted'::text, 'declined'::text, 'taken'::text, 'cancelled'::text, 'withdrawn'::text, 'expired'::text])))
);


--
-- Name: TABLE business_courier_offers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.business_courier_offers IS 'One row per courier/order offer. Contains no customer name, phone, address, or item data.';


--
-- Name: COLUMN business_courier_offers.decline_message; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.business_courier_offers.decline_message IS 'Optional courier-specific decline note, limited to 300 characters.';


--
-- Name: business_worker_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_worker_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    worker_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    token_consumed_at timestamp with time zone,
    accepted_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_worker_invitations_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: business_workers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_workers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    kitchen_id uuid,
    role text NOT NULL,
    full_name text NOT NULL,
    phone text NOT NULL,
    whatsapp_number text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    deactivated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_available boolean DEFAULT false NOT NULL,
    CONSTRAINT business_workers_cook_requires_kitchen CHECK (((role <> 'cook'::text) OR (kitchen_id IS NOT NULL))),
    CONSTRAINT business_workers_courier_availability_check CHECK (((role = 'courier'::text) OR (is_available = false))),
    CONSTRAINT business_workers_full_name_check CHECK ((length(TRIM(BOTH FROM full_name)) > 0)),
    CONSTRAINT business_workers_inactive_offline_check CHECK ((((is_active = true) AND (deactivated_at IS NULL)) OR (is_available = false))),
    CONSTRAINT business_workers_role_check CHECK ((role = ANY (ARRAY['cook'::text, 'courier'::text])))
);


--
-- Name: COLUMN business_workers.is_available; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.business_workers.is_available IS 'Courier availability toggle. Display state is derived from this toggle and active assigned orders.';


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizer_id uuid NOT NULL,
    business_id uuid,
    website_id uuid,
    order_number text NOT NULL,
    tracking_token text DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text) NOT NULL,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    customer_email text,
    fulfilment_type text NOT NULL,
    delivery_address text,
    customer_note text,
    currency text DEFAULT 'USD'::text NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    delivery_fee numeric(12,2) DEFAULT 0.00 NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    payment_method text DEFAULT 'on_fulfilment'::text NOT NULL,
    payment_status text DEFAULT 'unpaid'::text NOT NULL,
    provider text,
    provider_reference text,
    scheduled_for timestamp with time zone,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    idempotency_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_expires_at timestamp with time zone,
    estimated_ready_at timestamp with time zone,
    status_history jsonb DEFAULT '[]'::jsonb NOT NULL,
    cancellation_reason text,
    rider_name text,
    rider_phone text,
    courier_worker_id uuid,
    delivery_issue jsonb,
    delivery_rating smallint,
    delivery_rating_comment text,
    CONSTRAINT orders_delivery_address_required CHECK ((((fulfilment_type = 'delivery'::text) AND (delivery_address IS NOT NULL) AND (length(TRIM(BOTH FROM delivery_address)) > 0)) OR (fulfilment_type = 'pickup'::text))),
    CONSTRAINT orders_delivery_fee_check CHECK ((delivery_fee >= (0)::numeric)),
    CONSTRAINT orders_delivery_rating_comment_length CHECK ((char_length(delivery_rating_comment) <= 500)),
    CONSTRAINT orders_delivery_rating_range CHECK (((delivery_rating >= 1) AND (delivery_rating <= 5))),
    CONSTRAINT orders_fulfilment_type_check CHECK ((fulfilment_type = ANY (ARRAY['pickup'::text, 'delivery'::text]))),
    CONSTRAINT orders_items_check CHECK ((jsonb_typeof(items) = 'array'::text)),
    CONSTRAINT orders_payment_method_check CHECK ((payment_method = ANY (ARRAY['on_fulfilment'::text, 'online'::text, 'mobile_money'::text]))),
    CONSTRAINT orders_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'paid'::text, 'refunded'::text]))),
    CONSTRAINT orders_rider_name_check CHECK (((rider_name IS NULL) OR (length(TRIM(BOTH FROM rider_name)) <= 80))),
    CONSTRAINT orders_rider_name_length_check CHECK (((rider_name IS NULL) OR (length(TRIM(BOTH FROM rider_name)) <= 80))),
    CONSTRAINT orders_rider_phone_check CHECK (((rider_phone IS NULL) OR (length(TRIM(BOTH FROM rider_phone)) <= 32))),
    CONSTRAINT orders_rider_phone_length_check CHECK (((rider_phone IS NULL) OR (length(TRIM(BOTH FROM rider_phone)) <= 32))),
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'preparing'::text, 'ready'::text, 'picked_up'::text, 'out_for_delivery'::text, 'delivered'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT orders_status_history_check CHECK ((jsonb_typeof(status_history) = 'array'::text)),
    CONSTRAINT orders_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT orders_total_amount_check CHECK ((total_amount >= (0)::numeric))
);


--
-- Name: COLUMN orders.delivery_fee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.delivery_fee IS 'Owner-configured or free-delivery calculated fee snapshot for delivery orders (0 for pickup).';


--
-- Name: COLUMN orders.payment_expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.payment_expires_at IS 'Online-payment intent deadline (now + 30 min at intent creation). NULL for pay-on-fulfilment orders. Read-time expired labeling only; no cron.';


--
-- Name: COLUMN orders.estimated_ready_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.estimated_ready_at IS 'Owner-promised readiness timestamp. NULL until owner accepts the order.';


--
-- Name: COLUMN orders.status_history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.status_history IS 'Append-only log of status transitions and time adjustments: array of {status, at, by_user_id, reason, note, estimated_ready_at}.';


--
-- Name: COLUMN orders.cancellation_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.cancellation_reason IS 'Reason for cancellation (out_of_stock, kitchen_closed, cannot_deliver_there, other).';


--
-- Name: COLUMN orders.rider_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.rider_name IS 'Name of the assigned courier/rider when out for delivery.';


--
-- Name: COLUMN orders.rider_phone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.rider_phone IS 'Direct phone number for the assigned courier/rider.';


--
-- Name: COLUMN orders.courier_worker_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.courier_worker_id IS 'Registered courier assigned to this delivery; rider_name/rider_phone remain the order snapshots used by tracking and email.';


--
-- Name: COLUMN orders.delivery_issue; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.delivery_issue IS 'Active delivery issue report submitted by courier: {category, note, reported_at, worker_id, worker_name}.';


--
-- Name: COLUMN orders.delivery_rating; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.delivery_rating IS '1–5 star rating of the delivery experience, set by the customer after delivery.';


--
-- Name: COLUMN orders.delivery_rating_comment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.delivery_rating_comment IS 'Optional free-text comment accompanying the delivery rating (max 500 chars).';


--
-- Name: business_courier_offer_feed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.business_courier_offer_feed WITH (security_barrier='true', security_invoker='true') AS
 SELECT offer.id AS offer_id,
    offer.order_id,
    offer.business_id,
    offer.courier_worker_id,
    offer.offered_at,
    business.name AS pickup_name,
    business.address AS pickup_address,
    NULL::text AS delivery_address,
    o.items,
        CASE
            WHEN ((o.payment_method = 'on_fulfilment'::text) AND (o.payment_status = 'unpaid'::text)) THEN o.total_amount
            ELSE (0)::numeric
        END AS amount_to_collect,
    o.currency,
    o.estimated_ready_at
   FROM (((public.business_courier_offers offer
     JOIN public.orders o ON (((o.id = offer.order_id) AND (o.business_id = offer.business_id))))
     JOIN public.business_workers w ON (((w.id = offer.courier_worker_id) AND (w.business_id = offer.business_id))))
     JOIN public.businesses business ON ((business.id = offer.business_id)))
  WHERE ((offer.status = 'offered'::text) AND (offer.expires_at > clock_timestamp()) AND (o.status = ANY (ARRAY['accepted'::text, 'preparing'::text, 'ready'::text])) AND (o.estimated_ready_at IS NOT NULL) AND (o.courier_worker_id IS NULL) AND (o.fulfilment_type = 'delivery'::text) AND (w.role = 'courier'::text) AND (w.is_active = true) AND (w.deactivated_at IS NULL) AND (w.is_available = true) AND (EXISTS ( SELECT 1
           FROM public.business_worker_invitations accepted_invitation
          WHERE ((accepted_invitation.worker_id = w.id) AND (accepted_invitation.accepted_at IS NOT NULL) AND (accepted_invitation.revoked_at IS NULL)))) AND (NOT (EXISTS ( SELECT 1
           FROM public.orders active_order
          WHERE ((active_order.courier_worker_id = offer.courier_worker_id) AND (active_order.status = ANY (ARRAY['accepted'::text, 'preparing'::text, 'ready'::text, 'picked_up'::text, 'out_for_delivery'::text])))))));


--
-- Name: VIEW business_courier_offer_feed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.business_courier_offer_feed IS 'Courier offer projection. Includes order data only while the offer and order remain open/ready; excludes customer name and phone.';


--
-- Name: business_kitchen_display_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_kitchen_display_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kitchen_id uuid NOT NULL,
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_kitchen_display_links_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: business_kitchens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_kitchens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: business_moderation_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_moderation_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    decision text NOT NULL,
    risk_score integer NOT NULL,
    reasons jsonb DEFAULT '[]'::jsonb NOT NULL,
    actor uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_moderation_events_decision_check CHECK ((decision = ANY (ARRAY['auto_approved'::text, 'queued'::text, 'auto_rejected'::text, 'manual_approved'::text, 'manual_rejected'::text, 're_screen_queued'::text, 're_screen_passed'::text]))),
    CONSTRAINT business_moderation_events_risk_score_check CHECK (((risk_score >= 0) AND (risk_score <= 100)))
);


--
-- Name: TABLE business_moderation_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.business_moderation_events IS 'History of automated and manual moderation decisions for businesses';


--
-- Name: business_worker_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_worker_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    worker_id uuid NOT NULL,
    invitation_id uuid NOT NULL,
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    hard_expires_at timestamp with time zone NOT NULL,
    last_renewed_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_worker_sessions_expiry_order CHECK ((expires_at <= hard_expires_at)),
    CONSTRAINT business_worker_sessions_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: channel_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connected_account_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    channel text NOT NULL,
    asset_type text,
    provider_asset_id text,
    display_name text,
    status text DEFAULT 'pending'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT channel_assets_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'suspended'::text, 'revoked'::text, 'expired'::text])))
);


--
-- Name: TABLE channel_assets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.channel_assets IS 'Tenant-owned channel assets (pages/handles/numbers). tenant_id mirrors the parent connected_accounts.tenant_id for RLS; mismatch is rejected.';


--
-- Name: comment_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_likes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comment_id uuid NOT NULL,
    cookie_id uuid NOT NULL,
    ip_address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_type character varying(30) NOT NULL,
    target_id uuid NOT NULL,
    author_name character varying(120) DEFAULT 'Anonymous'::character varying,
    author_email character varying(255),
    body text NOT NULL,
    status character varying(30) DEFAULT 'approved'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    user_id uuid,
    source text DEFAULT 'donation'::text NOT NULL,
    likes integer DEFAULT 0 NOT NULL,
    import_batch_id uuid,
    payment_intent_id text,
    CONSTRAINT comments_body_check CHECK (((char_length(body) >= 2) AND (char_length(body) <= 1000))),
    CONSTRAINT comments_status_check CHECK (((status)::text = ANY (ARRAY[('approved'::character varying)::text, ('hidden'::character varying)::text]))),
    CONSTRAINT comments_target_type_check CHECK (((target_type)::text = ANY (ARRAY[('event'::character varying)::text, ('fundraiser'::character varying)::text])))
);


--
-- Name: connected_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connected_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    provider text NOT NULL,
    account_type text,
    provider_account_id text,
    display_name text,
    status text DEFAULT 'pending'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT connected_accounts_provider_check CHECK ((provider = 'meta'::text)),
    CONSTRAINT connected_accounts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'suspended'::text, 'revoked'::text, 'expired'::text])))
);


--
-- Name: TABLE connected_accounts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.connected_accounts IS 'Tenant-owned external social account links. tenant_id = organizers.id. Secrets (tokens) are never stored here — see ai_provider_configs for the no-plaintext-secrets rule; provider OAuth tokens live outside this phase.';


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel text,
    channel_asset_id uuid,
    customer_identity_id uuid,
    provider text,
    status text DEFAULT 'open'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_message_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conversations_status_check CHECK ((status = ANY (ARRAY['open'::text, 'pending'::text, 'resolved'::text, 'closed'::text, 'archived'::text])))
);


--
-- Name: TABLE conversations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.conversations IS 'Generic tenant/customer threads. Distinct from ai_conversations (admin-scoped). tenant_id = organizers.id.';


--
-- Name: courier_dispatch_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courier_dispatch_settings (
    id smallint NOT NULL,
    offer_timeout_seconds integer DEFAULT 600 NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT courier_dispatch_settings_id_check CHECK ((id = 1)),
    CONSTRAINT courier_dispatch_settings_offer_timeout_seconds_check CHECK (((offer_timeout_seconds >= 60) AND (offer_timeout_seconds <= 3600)))
);


--
-- Name: customer_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel text NOT NULL,
    external_customer_id text NOT NULL,
    aldriva_user_id uuid,
    phone text,
    email text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE customer_identities; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.customer_identities IS 'External customer id -> Aldriva user mapping, scoped per tenant. One row per (tenant, channel, external id).';


--
-- Name: donations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.donations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fundraiser_id uuid,
    donor_name text,
    amount numeric,
    created_at timestamp without time zone DEFAULT now(),
    status character varying(50) DEFAULT 'succeeded'::character varying,
    currency text DEFAULT 'usd'::text,
    donor_email text,
    stripe_session_id text,
    message text,
    payment_intent_id text,
    receipt_path character varying(512),
    certificate_path character varying(512),
    payment_method character varying(50) DEFAULT 'stripe'::character varying,
    user_id uuid,
    source text DEFAULT 'stripe'::text NOT NULL,
    import_batch_id uuid,
    CONSTRAINT donations_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('succeeded'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text, ('refunded'::character varying)::text])))
);


--
-- Name: entity_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizer_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'owner'::text NOT NULL,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entity_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text])))
);


--
-- Name: event_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    actor_user_id uuid,
    actor_role text DEFAULT 'unknown'::text NOT NULL,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_invitation_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_invitation_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    template_id text DEFAULT 'gala-editorial'::text NOT NULL,
    locale text DEFAULT 'en'::text NOT NULL,
    page_status text DEFAULT 'draft'::text NOT NULL,
    published_at timestamp with time zone,
    published_snapshot jsonb,
    display_title text,
    eyebrow text,
    host_names text,
    story_headline text,
    story_text text,
    story_image_url text,
    hero_image_url text,
    hero_image_alt text,
    hero_image_focus_x smallint DEFAULT 50,
    hero_image_focus_y smallint DEFAULT 50,
    scroll_prompt text,
    venue_name text,
    address text,
    parking_notes text,
    timezone text,
    dress_code text,
    dress_code_notes text,
    additional_notes text,
    hashtag text,
    music_audio_url text,
    music_title text,
    partner1_name text,
    partner2_name text,
    family_note text,
    wedding_subtype text,
    registry_note text,
    celebrant_name text,
    age_milestone text,
    theme text,
    gift_note text,
    schedule jsonb,
    gallery jsonb,
    venues jsonb,
    accommodations jsonb,
    colors_of_the_day jsonb,
    wedding_story jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    share_token text,
    share_enabled boolean DEFAULT false NOT NULL,
    share_regenerated_at timestamp with time zone,
    music_links jsonb,
    blocks_layout jsonb,
    CONSTRAINT event_invitation_pages_additional_notes_check CHECK ((char_length(additional_notes) <= 1000)),
    CONSTRAINT event_invitation_pages_age_milestone_check CHECK ((char_length(age_milestone) <= 20)),
    CONSTRAINT event_invitation_pages_dress_code_check CHECK ((char_length(dress_code) <= 80)),
    CONSTRAINT event_invitation_pages_dress_code_notes_check CHECK ((char_length(dress_code_notes) <= 500)),
    CONSTRAINT event_invitation_pages_gift_note_check CHECK ((char_length(gift_note) <= 500)),
    CONSTRAINT event_invitation_pages_hashtag_check CHECK ((char_length(hashtag) <= 100)),
    CONSTRAINT event_invitation_pages_hero_image_focus_x_check CHECK (((hero_image_focus_x >= 0) AND (hero_image_focus_x <= 100))),
    CONSTRAINT event_invitation_pages_hero_image_focus_y_check CHECK (((hero_image_focus_y >= 0) AND (hero_image_focus_y <= 100))),
    CONSTRAINT event_invitation_pages_locale_check CHECK ((locale = ANY (ARRAY['en'::text, 'fr'::text]))),
    CONSTRAINT event_invitation_pages_music_title_check CHECK ((char_length(music_title) <= 100)),
    CONSTRAINT event_invitation_pages_page_status_check CHECK ((page_status = ANY (ARRAY['draft'::text, 'published'::text]))),
    CONSTRAINT event_invitation_pages_registry_note_check CHECK ((char_length(registry_note) <= 500)),
    CONSTRAINT event_invitation_pages_story_text_check CHECK ((char_length(story_text) <= 3000)),
    CONSTRAINT event_invitation_pages_theme_check CHECK ((char_length(theme) <= 80)),
    CONSTRAINT event_invitation_pages_wedding_subtype_check CHECK ((wedding_subtype = ANY (ARRAY['traditional'::text, 'civil'::text, 'church'::text, 'engagement'::text, 'vow_renewal'::text])))
);


--
-- Name: COLUMN event_invitation_pages.blocks_layout; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_invitation_pages.blocks_layout IS 'Optional canonical page composition: {version, global_theme, layout_blocks:[{id,type,content}]}; romantic-envelope is seeded by migration 179.';


--
-- Name: event_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    guest_name text NOT NULL,
    guest_title text,
    organization text,
    email text,
    phone text,
    token text NOT NULL,
    invitation_status text DEFAULT 'draft'::text NOT NULL,
    rsvp_status text DEFAULT 'pending'::text NOT NULL,
    rsvp_at timestamp with time zone,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    image_url text,
    personal_message text,
    rsvp_deadline timestamp with time zone,
    lifecycle_state text DEFAULT 'ACTIVE'::text NOT NULL,
    import_batch_id uuid,
    operational_notes text,
    rsvp_guest_count smallint,
    rsvp_guest_names text,
    rsvp_message text,
    guest_allowance smallint,
    CONSTRAINT event_invitations_guest_allowance_check CHECK (((guest_allowance IS NULL) OR ((guest_allowance >= 1) AND (guest_allowance <= 20)))),
    CONSTRAINT event_invitations_invitation_status_check CHECK ((invitation_status = ANY (ARRAY['draft'::text, 'sent'::text, 'cancelled'::text, 'revoked'::text, 'expired'::text]))),
    CONSTRAINT event_invitations_lifecycle_state_check CHECK ((lifecycle_state = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'EVENT_ENDED'::text, 'RETENTION'::text, 'PURGED'::text]))),
    CONSTRAINT event_invitations_rsvp_guest_count_check CHECK (((rsvp_guest_count IS NULL) OR ((rsvp_guest_count >= 1) AND (rsvp_guest_count <= 20)))),
    CONSTRAINT event_invitations_rsvp_guest_names_len_check CHECK (((rsvp_guest_names IS NULL) OR (char_length(rsvp_guest_names) <= 300))),
    CONSTRAINT event_invitations_rsvp_message_len_check CHECK (((rsvp_message IS NULL) OR (char_length(rsvp_message) <= 500))),
    CONSTRAINT event_invitations_rsvp_status_check CHECK ((rsvp_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text])))
);


--
-- Name: event_memories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_memories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    settings_id uuid,
    storage_provider text NOT NULL,
    object_key text NOT NULL,
    content_type text NOT NULL,
    size_bytes bigint NOT NULL,
    width integer,
    height integer,
    status text DEFAULT 'pending'::text NOT NULL,
    guest_label text,
    delete_token_hash text,
    report_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    moderated_at timestamp with time zone,
    moderated_by uuid,
    CONSTRAINT event_memories_guest_label_check CHECK (((guest_label IS NULL) OR (char_length(guest_label) <= 80))),
    CONSTRAINT event_memories_height_check CHECK (((height IS NULL) OR ((height >= 1) AND (height <= 8000)))),
    CONSTRAINT event_memories_report_count_check CHECK ((report_count >= 0)),
    CONSTRAINT event_memories_size_bytes_check CHECK ((size_bytes > 0)),
    CONSTRAINT event_memories_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT event_memories_storage_provider_check CHECK ((storage_provider = ANY (ARRAY['supabase'::text, 'r2'::text]))),
    CONSTRAINT event_memories_width_check CHECK (((width IS NULL) OR ((width >= 1) AND (width <= 8000))))
);


--
-- Name: event_memory_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_memory_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    memory_id uuid NOT NULL,
    reason text NOT NULL,
    reporter_ip text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_memory_reports_reason_check CHECK (((char_length(reason) >= 1) AND (char_length(reason) <= 500)))
);


--
-- Name: event_memory_retention_notices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_memory_retention_notices (
    event_id uuid NOT NULL,
    notice_kind text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_memory_retention_notices_notice_kind_check CHECK ((notice_kind = ANY (ARRAY['30d'::text, '7d'::text])))
);


--
-- Name: event_memory_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_memory_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    upload_token text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    require_approval boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: event_staff_checkins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_staff_checkins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    staff_member_id uuid,
    scanned_by_user_id uuid,
    entrance_id uuid,
    device_id text,
    scan_source text DEFAULT 'online'::text NOT NULL,
    scanned_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    badge_token_hash text,
    CONSTRAINT event_staff_checkins_source_online_check CHECK ((scan_source = 'online'::text))
);


--
-- Name: event_team_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_team_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    email text NOT NULL,
    role text NOT NULL,
    entrance_id uuid,
    invited_by uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '14 days'::interval) NOT NULL,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    role_label text,
    position_label text,
    staff_name text,
    token_hash text,
    CONSTRAINT event_team_invitations_position_label_len CHECK (((position_label IS NULL) OR (char_length(position_label) <= 80))),
    CONSTRAINT event_team_invitations_role_check CHECK ((role = ANY (ARRAY['event_manager'::text, 'ticket_scanner'::text]))),
    CONSTRAINT event_team_invitations_role_label_len CHECK (((role_label IS NULL) OR (char_length(role_label) <= 80))),
    CONSTRAINT event_team_invitations_staff_name_len CHECK (((staff_name IS NULL) OR (char_length(staff_name) <= 120))),
    CONSTRAINT event_team_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'expired'::text, 'revoked'::text]))),
    CONSTRAINT event_team_invitations_token_hash_format CHECK (((token_hash IS NULL) OR (token_hash ~ '^[0-9a-f]{64}$'::text)))
);


--
-- Name: event_team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid,
    role text NOT NULL,
    entrance_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    invited_by uuid,
    invited_at timestamp with time zone DEFAULT now(),
    accepted_at timestamp with time zone,
    removed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    role_label text,
    position_label text,
    staff_name text,
    badge_status text DEFAULT 'active'::text NOT NULL,
    badge_issued_at timestamp with time zone,
    badge_revoked_at timestamp with time zone,
    badge_token_hash text,
    badge_display_code text,
    CONSTRAINT event_team_members_badge_display_len CHECK (((badge_display_code IS NULL) OR (char_length(badge_display_code) <= 16))),
    CONSTRAINT event_team_members_badge_hash_format CHECK (((badge_token_hash IS NULL) OR (badge_token_hash ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT event_team_members_badge_status_check CHECK ((badge_status = ANY (ARRAY['active'::text, 'revoked'::text]))),
    CONSTRAINT event_team_members_position_label_len CHECK (((position_label IS NULL) OR (char_length(position_label) <= 80))),
    CONSTRAINT event_team_members_role_check CHECK ((role = ANY (ARRAY['event_manager'::text, 'ticket_scanner'::text]))),
    CONSTRAINT event_team_members_role_label_len CHECK (((role_label IS NULL) OR (char_length(role_label) <= 80))),
    CONSTRAINT event_team_members_staff_name_len CHECK (((staff_name IS NULL) OR (char_length(staff_name) <= 120))),
    CONSTRAINT event_team_members_status_check CHECK ((status = ANY (ARRAY['active'::text, 'removed'::text])))
);


--
-- Name: eventbrite_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eventbrite_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organizer_id uuid,
    organizer_name text NOT NULL,
    organizer_url text NOT NULL,
    organizer_eventbrite_id text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    last_synced_at timestamp with time zone,
    last_sync_message text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    description text,
    category text,
    venue text,
    city text,
    banner text,
    event_date timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    user_id uuid,
    video_url text,
    organizer_id uuid,
    latitude double precision,
    longitude double precision,
    visibility text DEFAULT 'public'::text,
    status text DEFAULT 'approved'::text,
    is_featured boolean DEFAULT false,
    featured_until timestamp with time zone,
    is_homepage_featured boolean DEFAULT false,
    source_organizer_description text,
    source_organizer_name text,
    source_organizer_url text,
    homepage_position integer DEFAULT 0,
    average_rating numeric(3,2) DEFAULT 0,
    review_count integer DEFAULT 0,
    event_type text,
    end_date timestamp with time zone,
    street_address text,
    address_locality text,
    address_region text,
    postal_code text,
    address_country text,
    online_url text,
    performer_name text,
    deleted_at timestamp with time zone,
    purge_at timestamp with time zone,
    source_url text,
    eventbrite_event_id text,
    checkin_window_start timestamp with time zone,
    checkin_window_end timestamp with time zone,
    ticket_template text DEFAULT 'modern'::text NOT NULL,
    invitation_template_id uuid,
    subcategory text,
    kind text DEFAULT 'public'::text NOT NULL,
    CONSTRAINT events_invitation_private_check CHECK (((kind <> 'invitation'::text) OR (visibility = 'private'::text))),
    CONSTRAINT events_kind_check CHECK ((kind = ANY (ARRAY['public'::text, 'invitation'::text]))),
    CONSTRAINT events_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'draft'::text]))),
    CONSTRAINT events_ticket_template_check CHECK ((ticket_template = ANY (ARRAY['modern'::text, 'concert'::text, 'premium'::text, 'minimal'::text]))),
    CONSTRAINT events_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'private'::text])))
);


--
-- Name: COLUMN events.subcategory; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.subcategory IS 'Controlled via lib/event-taxonomy.ts SUBCATEGORIES_BY_CATEGORY, validated in app';


--
-- Name: follows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    follower_id uuid NOT NULL,
    following_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_follower_following_not_equal CHECK ((follower_id <> following_id))
);


--
-- Name: fundraiser_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fundraiser_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fundraiser_id uuid NOT NULL,
    caption text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    url text NOT NULL,
    type text DEFAULT 'image'::text,
    "position" integer DEFAULT 0,
    CONSTRAINT fundraiser_media_type_check CHECK ((type = ANY (ARRAY['image'::text, 'video'::text])))
);


--
-- Name: fundraiser_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fundraiser_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fundraiser_id uuid,
    organizer_id uuid,
    title text,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: fundraisers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fundraisers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    story text,
    banner text,
    goal numeric,
    raised numeric DEFAULT 0,
    organizer text,
    created_at timestamp without time zone DEFAULT now(),
    user_id uuid,
    video_url text,
    is_featured boolean DEFAULT false,
    featured_until timestamp with time zone,
    is_homepage_featured boolean DEFAULT false,
    organizer_id uuid,
    image_url text,
    raised_amount numeric DEFAULT 0,
    homepage_position integer DEFAULT 0,
    average_rating numeric(3,2) DEFAULT 0,
    review_count integer DEFAULT 0,
    category text DEFAULT 'Other'::text NOT NULL,
    deleted_at timestamp with time zone,
    purge_at timestamp with time zone,
    status text DEFAULT 'pending_review'::text NOT NULL,
    rejection_reason text,
    source_url text,
    gofundme_source_id uuid,
    beneficiary jsonb,
    beneficiary_name text GENERATED ALWAYS AS ((beneficiary ->> 'name'::text)) STORED,
    beneficiary_type text GENERATED ALWAYS AS ((beneficiary ->> 'type'::text)) STORED,
    beneficiary_id uuid,
    CONSTRAINT check_fundraiser_category CHECK ((category = ANY (ARRAY['Medical'::text, 'Memorial'::text, 'Emergency'::text, 'Charity'::text, 'Education'::text, 'Animal'::text, 'Environment'::text, 'Business'::text, 'Community'::text, 'Competition'::text, 'Creative'::text, 'Event'::text, 'Faith'::text, 'Family'::text, 'Sports'::text, 'Travel'::text, 'Volunteer'::text, 'Wishes'::text, 'Other'::text]))),
    CONSTRAINT fundraisers_beneficiary_valid CHECK (((beneficiary IS NULL) OR ((jsonb_typeof(beneficiary) = 'object'::text) AND ((beneficiary ->> 'type'::text) = ANY (ARRAY['self'::text, 'person'::text, 'family'::text, 'organization'::text, 'charity'::text, 'community'::text, 'animal'::text])) AND (COALESCE(TRIM(BOTH FROM (beneficiary ->> 'name'::text)), ''::text) <> ''::text)))),
    CONSTRAINT fundraisers_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'published'::text, 'rejected'::text])))
);


--
-- Name: gofundme_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gofundme_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    fundraiser_id uuid,
    title text,
    organizer text,
    source_url text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    last_synced_at timestamp with time zone,
    last_sync_message text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: guest_import_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guest_import_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    created_by uuid,
    status text DEFAULT 'preview'::text NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    valid_rows integer DEFAULT 0 NOT NULL,
    imported_rows integer DEFAULT 0 NOT NULL,
    failed_rows integer DEFAULT 0 NOT NULL,
    raw_csv_key text,
    raw_csv_size_bytes integer,
    error_summary jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    purged_at timestamp with time zone,
    CONSTRAINT guest_import_batches_status_check CHECK ((status = ANY (ARRAY['preview'::text, 'importing'::text, 'complete'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: guest_import_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guest_import_rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    event_id uuid NOT NULL,
    row_number integer NOT NULL,
    raw_name text,
    raw_email text,
    raw_phone text,
    raw_section text,
    raw_row text,
    raw_seat text,
    raw_table text,
    raw_ticket_type text,
    raw_image_url text,
    raw_image_file text,
    raw_message text,
    raw_rsvp_deadline text,
    resolved_seat_id uuid,
    resolved_ticket_type_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    errors jsonb DEFAULT '[]'::jsonb NOT NULL,
    warnings jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_invitation_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT guest_import_rows_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'valid'::text, 'warning'::text, 'error'::text, 'imported'::text, 'skipped'::text])))
);


--
-- Name: homepage_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.homepage_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    icon text NOT NULL,
    "position" integer DEFAULT 0,
    is_visible boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: homepage_promotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.homepage_promotions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_slug text NOT NULL,
    creative_url text NOT NULL,
    media_type text DEFAULT 'image'::text NOT NULL,
    cta_label text,
    "position" integer DEFAULT 0 NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    is_visible boolean DEFAULT false NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_by uuid,
    approved_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT homepage_promotions_creative_url_check CHECK (((char_length(creative_url) >= 1) AND (char_length(creative_url) <= 2048))),
    CONSTRAINT homepage_promotions_cta_label_check CHECK (((cta_label IS NULL) OR ((char_length(TRIM(BOTH FROM cta_label)) >= 1) AND (char_length(TRIM(BOTH FROM cta_label)) <= 80)))),
    CONSTRAINT homepage_promotions_entity_slug_check CHECK (((char_length(entity_slug) >= 1) AND (char_length(entity_slug) <= 300))),
    CONSTRAINT homepage_promotions_entity_type_check CHECK ((entity_type = ANY (ARRAY['event'::text, 'business'::text, 'product'::text, 'fundraiser'::text, 'article'::text, 'organizer'::text]))),
    CONSTRAINT homepage_promotions_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text]))),
    CONSTRAINT homepage_promotions_position_check CHECK (("position" >= 0)),
    CONSTRAINT homepage_promotions_priority_check CHECK ((priority >= 0)),
    CONSTRAINT homepage_promotions_schedule_check CHECK (((ends_at IS NULL) OR (starts_at IS NULL) OR (ends_at > starts_at))),
    CONSTRAINT homepage_promotions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'active'::text, 'expired'::text, 'archived'::text])))
);


--
-- Name: TABLE homepage_promotions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.homepage_promotions IS 'Homepage promotional placements pointing to real Aldriva entities (event/business/product/fundraiser/article/organizer). Isolated from is_homepage_featured featured system and platform_settings hero. Future ZoomParallax hero consumes active+visible+scheduled rows.';


--
-- Name: COLUMN homepage_promotions.entity_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.homepage_promotions.entity_type IS 'Polymorphic type — one of six V1 entity types. No cross-table FK.';


--
-- Name: COLUMN homepage_promotions.entity_slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.homepage_promotions.entity_slug IS 'Canonical slug of the target entity. Destination derived in app as /{entity_type}s/{slug} (organizer uses /org/{slug}). No FK — validated in API.';


--
-- Name: COLUMN homepage_promotions.creative_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.homepage_promotions.creative_url IS 'Display creative — https URL or Supabase Storage public URL (cms-media bucket). Video deferred to media phase.';


--
-- Name: COLUMN homepage_promotions.media_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.homepage_promotions.media_type IS 'image or video — DB ready for video, storage/CSP deferred.';


--
-- Name: COLUMN homepage_promotions."position"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.homepage_promotions."position" IS 'Manual order within same priority (lower = earlier). Mirrors homepage_categories.position.';


--
-- Name: COLUMN homepage_promotions.priority; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.homepage_promotions.priority IS 'Prominence weight — higher priority surfaces first in homepage query.';


--
-- Name: COLUMN homepage_promotions.is_visible; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.homepage_promotions.is_visible IS 'Manual visibility toggle — even active promotions must be visible to appear.';


--
-- Name: COLUMN homepage_promotions.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.homepage_promotions.status IS 'Lifecycle: draft -> pending_review -> active -> expired/archived. Only admin/service_role can set active/expired/archived/rejected-equivalent.';


--
-- Name: COLUMN homepage_promotions.starts_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.homepage_promotions.starts_at IS 'Optional schedule start — promotion eligible only after this time.';


--
-- Name: COLUMN homepage_promotions.ends_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.homepage_promotions.ends_at IS 'Optional schedule end — must be > starts_at when both set.';


--
-- Name: COLUMN homepage_promotions.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.homepage_promotions.created_by IS 'Creator (auth.uid() at insert). RLS owner.';


--
-- Name: COLUMN homepage_promotions.approved_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.homepage_promotions.approved_by IS 'Admin who approved/activated — set only by admin/service_role.';


--
-- Name: homepage_sponsors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.homepage_sponsors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    logo_url text DEFAULT ''::text NOT NULL,
    website_url text DEFAULT ''::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: homepage_testimonials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.homepage_testimonials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    role text DEFAULT ''::text NOT NULL,
    photo_url text DEFAULT ''::text NOT NULL,
    quote text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: incident_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incident_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    incident_id uuid NOT NULL,
    event_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE incident_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.incident_events IS 'Join append-only: incident ↔ system_events. One incident groups 1-N events sharing dedupe_key.';


--
-- Name: incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incidents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    severity text NOT NULL,
    title text NOT NULL,
    summary text,
    tenant_id uuid,
    dedupe_key text NOT NULL,
    event_count integer DEFAULT 1 NOT NULL,
    first_seen_at timestamp with time zone NOT NULL,
    last_seen_at timestamp with time zone NOT NULL,
    agent_run_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT incidents_dedupe_key_check CHECK (((char_length(dedupe_key) >= 1) AND (char_length(dedupe_key) <= 400))),
    CONSTRAINT incidents_event_count_check CHECK ((event_count >= 1)),
    CONSTRAINT incidents_severity_check CHECK ((severity = ANY (ARRAY['s1'::text, 's2'::text, 's3'::text, 's4'::text]))),
    CONSTRAINT incidents_status_check CHECK ((status = ANY (ARRAY['open'::text, 'investigating'::text, 'resolved'::text, 'expired'::text]))),
    CONSTRAINT incidents_title_check CHECK (((char_length(title) >= 5) AND (char_length(title) <= 300)))
);


--
-- Name: TABLE incidents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.incidents IS 'Correlated grouping of system_events sharing dedupe_key within 60-min window. Deterministic severity at open (S1-S4 per report §2). Retained indefinitely.';


--
-- Name: invitation_page_preview_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitation_page_preview_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    token text NOT NULL,
    created_by uuid,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invitation_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitation_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    category text NOT NULL,
    background_image_url text NOT NULL,
    thumbnail_url text,
    layout_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invitation_templates_category_check CHECK ((category = ANY (ARRAY['Wedding & Formal'::text, 'Birthday & Celebration'::text, 'Corporate & Conference'::text, 'Gala & Fundraiser'::text, 'Concert & Festival'::text, 'Casual & Community'::text])))
);


--
-- Name: COLUMN invitation_templates.layout_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invitation_templates.layout_config IS 'Code-owned InvitationCardRenderer layout data; Botanical Reverie uses the portrait botanical-stationery design variant.';


--
-- Name: knowledge_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    tenant_id uuid,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    tsv tsvector,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_chunks_chunk_index_check CHECK ((chunk_index >= 0)),
    CONSTRAINT knowledge_chunks_content_check CHECK (((char_length(content) >= 10) AND (char_length(content) <= 5000)))
);


--
-- Name: TABLE knowledge_chunks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.knowledge_chunks IS 'Chunk-level retrieval. Phase 1: tsv (english). Phase 2 may add pgvector support — no schema break.';


--
-- Name: knowledge_document_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_document_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    version integer NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_document_versions_version_check CHECK ((version >= 1))
);


--
-- Name: TABLE knowledge_document_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.knowledge_document_versions IS 'Immutable snapshot on each title/content change. Version from knowledge_documents.version.';


--
-- Name: knowledge_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    category text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'approved'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    source_type text DEFAULT 'human'::text NOT NULL,
    source_hash text,
    source_ref text,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_documents_category_check CHECK ((category = ANY (ARRAY['company'::text, 'domain'::text, 'agent_role'::text, 'sop'::text, 'policy'::text, 'security'::text, 'architecture'::text, 'database'::text, 'api_tool'::text, 'codebase'::text, 'ui_route'::text, 'incident'::text, 'qa'::text, 'agent_memory'::text, 'operational'::text, 'brand'::text, 'moderation'::text]))),
    CONSTRAINT knowledge_documents_content_check CHECK (((char_length(content) >= 10) AND (char_length(content) <= 100000))),
    CONSTRAINT knowledge_documents_source_type_check CHECK ((source_type = ANY (ARRAY['human'::text, 'system'::text, 'code-derived'::text, 'agent-generated'::text]))),
    CONSTRAINT knowledge_documents_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'proposed'::text, 'approved'::text, 'deprecated'::text]))),
    CONSTRAINT knowledge_documents_title_check CHECK (((char_length(title) >= 3) AND (char_length(title) <= 300))),
    CONSTRAINT knowledge_documents_version_check CHECK ((version >= 1))
);


--
-- Name: TABLE knowledge_documents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.knowledge_documents IS 'Canonical knowledge store. Tenant_id NULL = platform-wide. Versioned via knowledge_document_versions. Retrieval scoped to tenant_id IS NULL OR tenant_id = run.tenant_id.';


--
-- Name: COLUMN knowledge_documents.tenant_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.knowledge_documents.tenant_id IS 'NULL for platform knowledge. Tenant-scoped knowledge isolated per organizers.id.';


--
-- Name: COLUMN knowledge_documents.category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.knowledge_documents.category IS '15 kinds from the operating spec — company, domain, agent_role, sop, policy, security, architecture, database, api_tool, codebase, ui_route, incident, qa, agent_memory, operational, brand, moderation.';


--
-- Name: media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    owner_user_id uuid,
    uploader_user_id uuid NOT NULL,
    object_key text NOT NULL,
    public_url text NOT NULL,
    content_type text DEFAULT 'image/webp'::text NOT NULL,
    size_bytes bigint NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    purpose text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    target_id uuid,
    CONSTRAINT media_content_type_webp_check CHECK ((content_type = 'image/webp'::text)),
    CONSTRAINT media_height_check CHECK (((height >= 1) AND (height <= 2000))),
    CONSTRAINT media_owner_scope_check CHECK ((((purpose = ANY (ARRAY['event_image'::text, 'article_image'::text, 'product_image'::text, 'campaign_image'::text, 'logo'::text])) AND (tenant_id IS NOT NULL) AND (owner_user_id IS NULL)) OR ((purpose = ANY (ARRAY['avatar'::text, 'cms'::text])) AND (tenant_id IS NULL) AND (owner_user_id IS NOT NULL)) OR ((purpose = 'event_image'::text) AND (tenant_id IS NULL) AND (owner_user_id IS NOT NULL)))),
    CONSTRAINT media_purpose_check CHECK ((purpose = ANY (ARRAY['event_image'::text, 'article_image'::text, 'product_image'::text, 'campaign_image'::text, 'logo'::text, 'avatar'::text, 'cms'::text]))),
    CONSTRAINT media_size_bytes_check CHECK ((size_bytes > 0)),
    CONSTRAINT media_width_check CHECK (((width >= 1) AND (width <= 2000)))
);

ALTER TABLE ONLY public.media FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN media.target_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.media.target_id IS 'Optional event id for event-banner and invitation-image media; tenant_id or owner_user_id still controls ownership.';


--
-- Name: menu_item_option_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_item_option_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizer_id uuid NOT NULL,
    item_id uuid NOT NULL,
    group_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    hidden_option_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    price_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT menu_item_option_groups_position_check CHECK (("position" >= 0)),
    CONSTRAINT menu_item_option_groups_price_overrides_check CHECK ((jsonb_typeof(price_overrides) = 'object'::text))
);


--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_id uuid NOT NULL,
    organizer_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    price numeric(12,2) NOT NULL,
    image_url text,
    dietary_tags text[] DEFAULT ARRAY[]::text[] NOT NULL,
    allergens text[] DEFAULT ARRAY[]::text[] NOT NULL,
    modifiers jsonb DEFAULT '[]'::jsonb NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_sold_out boolean DEFAULT false NOT NULL,
    promo_price numeric(12,2),
    option_groups jsonb DEFAULT '[]'::jsonb NOT NULL,
    options_source text DEFAULT 'json'::text NOT NULL,
    CONSTRAINT menu_items_allergens_check CHECK (((array_length(allergens, 1) IS NULL) OR (array_length(allergens, 1) <= 12))),
    CONSTRAINT menu_items_allergens_enum_check CHECK ((allergens <@ ARRAY['nuts'::text, 'dairy'::text, 'gluten'::text, 'soy'::text, 'eggs'::text, 'shellfish'::text])),
    CONSTRAINT menu_items_description_check CHECK (((description IS NULL) OR (char_length(description) <= 500))),
    CONSTRAINT menu_items_dietary_tags_check CHECK (((array_length(dietary_tags, 1) IS NULL) OR (array_length(dietary_tags, 1) <= 12))),
    CONSTRAINT menu_items_dietary_tags_enum_check CHECK ((dietary_tags <@ ARRAY['vegan'::text, 'vegetarian'::text, 'gluten_free'::text, 'halal'::text, 'kosher'::text, 'dairy_free'::text, 'nut_free'::text])),
    CONSTRAINT menu_items_image_url_check CHECK (((image_url IS NULL) OR (char_length(image_url) <= 2048))),
    CONSTRAINT menu_items_modifiers_check CHECK (public.menu_modifiers_valid(modifiers)),
    CONSTRAINT menu_items_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80))),
    CONSTRAINT menu_items_option_groups_check CHECK (public.menu_option_groups_valid(option_groups)),
    CONSTRAINT menu_items_options_source_check CHECK ((options_source = ANY (ARRAY['json'::text, 'normalized'::text]))),
    CONSTRAINT menu_items_position_check CHECK ((("position" >= 0) AND ("position" <= 999))),
    CONSTRAINT menu_items_price_check CHECK (((price >= (0)::numeric) AND (price <= 999999.99))),
    CONSTRAINT menu_items_promo_price_check CHECK (((promo_price IS NULL) OR ((promo_price >= (0)::numeric) AND (promo_price < price))))
);


--
-- Name: TABLE menu_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.menu_items IS 'Menu items (dishes) belonging to a menu_section. organizer_id is denormalized for simple RLS but enforced by trigger to match section.organizer_id.';


--
-- Name: COLUMN menu_items.dietary_tags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.menu_items.dietary_tags IS 'Bounded enum array max 12: vegan, vegetarian, gluten_free, halal, kosher, dairy_free, nut_free.';


--
-- Name: COLUMN menu_items.allergens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.menu_items.allergens IS 'Bounded enum array max 12: nuts, dairy, gluten, soy, eggs, shellfish.';


--
-- Name: COLUMN menu_items.modifiers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.menu_items.modifiers IS 'JSONB array max 12 of {name: 1..80, price_delta: -10000..10000}.';


--
-- Name: COLUMN menu_items.is_sold_out; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.menu_items.is_sold_out IS 'When true, dish displays as Sold Out but remains visible on public menu.';


--
-- Name: COLUMN menu_items.promo_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.menu_items.promo_price IS 'Discounted promotional price. Must be strictly less than price and >= 0.';


--
-- Name: COLUMN menu_items.option_groups; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.menu_items.option_groups IS 'JSONB array of option groups (max 8) with choices (max 20) and price deltas.';


--
-- Name: menu_option_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_option_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizer_id uuid NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    min_select integer DEFAULT 0 NOT NULL,
    max_select integer DEFAULT 1 NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    legacy_source_item_id uuid,
    legacy_group_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT menu_option_groups_check CHECK (((max_select >= 1) AND (max_select >= min_select))),
    CONSTRAINT menu_option_groups_kind_check CHECK ((kind = ANY (ARRAY['variant'::text, 'addon'::text]))),
    CONSTRAINT menu_option_groups_min_select_check CHECK ((min_select >= 0)),
    CONSTRAINT menu_option_groups_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 80))),
    CONSTRAINT menu_option_groups_position_check CHECK (("position" >= 0)),
    CONSTRAINT menu_option_groups_required_min_check CHECK (((NOT is_required) OR (min_select >= 1))),
    CONSTRAINT menu_option_groups_variant_shape CHECK (((kind <> 'variant'::text) OR ((min_select = 1) AND (max_select = 1) AND (is_required = true))))
);


--
-- Name: menu_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    organizer_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    price numeric(12,2) NOT NULL,
    image_url text,
    is_default boolean DEFAULT false NOT NULL,
    max_qty integer DEFAULT 1 NOT NULL,
    is_available boolean DEFAULT true NOT NULL,
    allergens text[] DEFAULT '{}'::text[] NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    legacy_option_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT menu_options_allergens_check CHECK (((cardinality(allergens) <= 12) AND (allergens <@ ARRAY['nuts'::text, 'dairy'::text, 'gluten'::text, 'soy'::text, 'eggs'::text, 'shellfish'::text]))),
    CONSTRAINT menu_options_description_check CHECK (((description IS NULL) OR (char_length(description) <= 200))),
    CONSTRAINT menu_options_max_qty_check CHECK (((max_qty >= 1) AND (max_qty <= 10))),
    CONSTRAINT menu_options_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 80))),
    CONSTRAINT menu_options_position_check CHECK (("position" >= 0)),
    CONSTRAINT menu_options_price_check CHECK (((price >= (0)::numeric) AND (price <= 999999.99)))
);


--
-- Name: menu_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizer_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    "position" integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT menu_sections_description_check CHECK (((description IS NULL) OR (char_length(description) <= 500))),
    CONSTRAINT menu_sections_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80))),
    CONSTRAINT menu_sections_position_check CHECK ((("position" >= 0) AND ("position" <= 999)))
);


--
-- Name: TABLE menu_sections; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.menu_sections IS 'Menu sections/categories for restaurant/hospitality digital menus, ordered, tenant-scoped.';


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    direction text NOT NULL,
    sender_type text NOT NULL,
    external_message_id text,
    content text,
    provider text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['customer'::text, 'organizer'::text, 'ai'::text, 'system'::text])))
);


--
-- Name: TABLE messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.messages IS 'Generic thread messages. Distinct from ai_messages (admin-scoped). tenant_id mirrors parent conversations.tenant_id; mismatch is rejected. content holds text only, never secrets.';


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel text NOT NULL,
    event_type text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE notification_preferences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_preferences IS 'Tenant-scoped channel/event notification toggles. Separate system from profiles.preferences (user-scoped); do not merge this phase.';


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    actor_id uuid,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    link text,
    related_type text,
    related_id uuid,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_related_type_check CHECK ((related_type = ANY (ARRAY['fundraiser'::text, 'comment'::text, 'event'::text, 'profile'::text, 'product'::text, 'order'::text, 'organizer'::text, 'reservation'::text]))),
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['donation'::text, 'comment'::text, 'like'::text, 'fundraiser_approved'::text, 'fundraiser_rejected'::text, 'follow'::text, 'ticket_purchase'::text, 'product_purchase'::text, 'product_update'::text, 'product_refund'::text, 'order_placed'::text, 'reservation_placed'::text])))
);


--
-- Name: offline_scan_conflicts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offline_scan_conflicts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    ticket_instance_id uuid,
    ticket_order_id uuid,
    offline_scan_id uuid NOT NULL,
    device_id text,
    entrance_id uuid,
    delegating_user_id uuid,
    scanned_by_user_id uuid,
    offline_scanned_at timestamp with time zone NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL,
    conflict_reason text NOT NULL,
    winning_checkin_id uuid,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_delivery_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_delivery_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    courier_worker_id uuid NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    accuracy double precision,
    heading double precision,
    speed double precision,
    recorded_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT order_delivery_locations_accuracy_check CHECK (((accuracy IS NULL) OR (accuracy >= (0)::double precision))),
    CONSTRAINT order_delivery_locations_heading_check CHECK (((heading IS NULL) OR ((heading >= (0.0)::double precision) AND (heading <= (360.0)::double precision)))),
    CONSTRAINT order_delivery_locations_latitude_check CHECK (((latitude >= ('-90.0'::numeric)::double precision) AND (latitude <= (90.0)::double precision))),
    CONSTRAINT order_delivery_locations_longitude_check CHECK (((longitude >= ('-180.0'::numeric)::double precision) AND (longitude <= (180.0)::double precision))),
    CONSTRAINT order_delivery_locations_speed_check CHECK (((speed IS NULL) OR (speed >= (0)::double precision)))
);


--
-- Name: TABLE order_delivery_locations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.order_delivery_locations IS 'High-frequency delivery breadcrumb coordinates for active courier deliveries.';


--
-- Name: COLUMN order_delivery_locations.accuracy; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_delivery_locations.accuracy IS 'Horizontal accuracy radius in meters, as reported by device geolocation.';


--
-- Name: COLUMN order_delivery_locations.heading; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_delivery_locations.heading IS 'Direction of travel in degrees (0 = North, 90 = East, 180 = South, 270 = West).';


--
-- Name: COLUMN order_delivery_locations.speed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_delivery_locations.speed IS 'Ground speed in meters per second, when available.';


--
-- Name: organizer_follows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizer_follows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizer_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: organizer_follower_counts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.organizer_follower_counts AS
 SELECT organizer_id,
    count(*) AS follower_count
   FROM public.organizer_follows
  GROUP BY organizer_id;


--
-- Name: organizer_status_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizer_status_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizer_id uuid NOT NULL,
    admin_user_id uuid NOT NULL,
    field_name text NOT NULL,
    old_value text,
    new_value text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organizer_status_audit_field_name_check CHECK ((field_name = 'status'::text))
);


--
-- Name: organizer_verification_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizer_verification_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizer_id uuid NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    org_type text,
    documents jsonb DEFAULT '[]'::jsonb NOT NULL,
    submitter_notes text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    reviewer_notes text,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organizer_verification_submissions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'needs_more_info'::text])))
);


--
-- Name: organizer_visibility_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizer_visibility_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizer_id uuid NOT NULL,
    admin_user_id uuid NOT NULL,
    field_name character varying(50) NOT NULL,
    old_value integer NOT NULL,
    new_value integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT organizer_visibility_audit_field_name_check CHECK (((field_name)::text = ANY ((ARRAY['follower_offset'::character varying, 'events_offset'::character varying, 'payment_enabled'::character varying, 'fundraising_approved'::character varying])::text[])))
);


--
-- Name: organizers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    name text NOT NULL,
    bio text,
    photo text,
    facebook text,
    twitter text,
    website text,
    created_at timestamp without time zone DEFAULT now(),
    banner text,
    status text DEFAULT 'pending'::text,
    verified_at timestamp with time zone,
    visibility text DEFAULT 'public'::text,
    follower_offset integer DEFAULT 0 NOT NULL,
    events_offset integer DEFAULT 0 NOT NULL,
    average_rating numeric(3,2) DEFAULT 0,
    review_count integer DEFAULT 0,
    organization_name character varying(255),
    tax_id character varying(255),
    nonprofit_registration_number character varying(255),
    deleted_at timestamp with time zone,
    purge_at timestamp with time zone,
    slug text NOT NULL,
    org_type text DEFAULT 'other'::text,
    instagram text,
    linkedin text,
    youtube text,
    tiktok text,
    contact_email text,
    updated_at timestamp with time zone DEFAULT now(),
    is_business_auto_created boolean DEFAULT false NOT NULL,
    payment_enabled boolean DEFAULT false NOT NULL,
    payment_enabled_at timestamp with time zone,
    fundraising_approved boolean DEFAULT false NOT NULL,
    fundraising_approved_at timestamp with time zone,
    CONSTRAINT organizers_org_type_check CHECK ((org_type = ANY (ARRAY['nonprofit'::text, 'business'::text, 'church'::text, 'school'::text, 'creator'::text, 'community'::text, 'government'::text, 'restaurant'::text, 'sports_club'::text, 'other'::text]))),
    CONSTRAINT organizers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text, 'suspended'::text]))),
    CONSTRAINT organizers_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'private'::text])))
);


--
-- Name: payment_reconciliation_failures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_reconciliation_failures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    stripe_payment_intent_id text,
    amount numeric,
    currency text,
    buyer_email text,
    raw_metadata jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone
);


--
-- Name: payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_id uuid NOT NULL,
    amount numeric NOT NULL,
    currency text NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    destination_type text NOT NULL,
    destination_reference text,
    external_payout_id text,
    client_idempotency_key text,
    failure_reason text,
    requested_by uuid,
    processed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payouts_amount_positive CHECK ((amount > (0)::numeric)),
    CONSTRAINT payouts_currency_format CHECK (((currency = lower(currency)) AND (currency ~ '^[a-z]{3}$'::text))),
    CONSTRAINT payouts_destination_type_check CHECK ((destination_type = ANY (ARRAY['stripe_connect'::text, 'bank_transfer'::text, 'crypto'::text, 'manual'::text]))),
    CONSTRAINT payouts_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid
);


--
-- Name: product_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    file_path text NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    file_size_bytes bigint NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_preview boolean DEFAULT false NOT NULL,
    version text DEFAULT '1.0'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    storage_provider text DEFAULT 'supabase'::text NOT NULL,
    CONSTRAINT product_assets_file_name_check CHECK (((char_length(file_name) >= 1) AND (char_length(file_name) <= 255))),
    CONSTRAINT product_assets_file_size_bytes_check CHECK ((file_size_bytes > 0)),
    CONSTRAINT product_assets_mime_type_check CHECK (((char_length(mime_type) >= 1) AND (char_length(mime_type) <= 127))),
    CONSTRAINT product_assets_position_check CHECK (("position" >= 0)),
    CONSTRAINT product_assets_storage_provider_check CHECK ((storage_provider = ANY (ARRAY['supabase'::text, 'r2'::text]))),
    CONSTRAINT product_assets_version_check CHECK (((char_length(TRIM(BOTH FROM version)) >= 1) AND (char_length(TRIM(BOTH FROM version)) <= 20)))
);


--
-- Name: TABLE product_assets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_assets IS 'One product -> many downloadable assets. Rows are written only by the service role (upload confirm route), never by direct client inserts. ON DELETE CASCADE is safe: products with order history cannot be hard-deleted (product_orders is ON DELETE RESTRICT).';


--
-- Name: COLUMN product_assets.file_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_assets.file_path IS 'Private-bucket path (product-assets/{product_id}/{asset_id}/{safe_filename}). Never rendered as a public URL — delivery is exclusively via short-lived signed URLs minted by the download route after a paid-order check.';


--
-- Name: COLUMN product_assets.storage_provider; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_assets.storage_provider IS 'Private object provider for this asset. Existing assets default to supabase; newly uploaded assets may use r2.';


--
-- Name: product_downloads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_downloads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    asset_id uuid,
    order_id uuid,
    buyer_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    buyer_id uuid,
    buyer_email text,
    buyer_name text,
    quantity integer DEFAULT 1 NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    payment_method text DEFAULT 'stripe'::text NOT NULL,
    stripe_session_id text,
    stripe_payment_intent_id text,
    crypto_payment_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_orders_payment_method_check CHECK ((payment_method = ANY (ARRAY['stripe'::text, 'crypto'::text]))),
    CONSTRAINT product_orders_quantity_check CHECK ((quantity >= 1)),
    CONSTRAINT product_orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text, 'refunded'::text]))),
    CONSTRAINT product_orders_total_amount_check CHECK ((total_amount >= (0)::numeric)),
    CONSTRAINT product_orders_unit_price_check CHECK ((unit_price >= (0)::numeric))
);


--
-- Name: COLUMN product_orders.product_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_orders.product_name IS 'Snapshot of products.name at order-creation time, written explicitly by the checkout route (not a trigger/default). Never re-derived from products at display time, so a later rename or deletion of the product does not rewrite historical order/receipt text.';


--
-- Name: COLUMN product_orders.unit_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_orders.unit_price IS 'Snapshot of the price actually charged per unit at order-creation time, written explicitly by the checkout route. Same rationale as product_name — total_amount already captures the charged total, but unit_price preserves the per-item breakdown independent of any later products.stripe_price_id change.';


--
-- Name: COLUMN product_orders.buyer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_orders.buyer_id IS 'Nullable — guest checkout is allowed platform-wide (see platform_settings.allow_guest_checkout), same as donations.user_id and ticket_orders.buyer_email being the only guest identifier.';


--
-- Name: COLUMN product_orders.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_orders.status IS 'Flipped pending -> paid exclusively by the payment webhook (Stripe checkout.session.completed kind="product", or the crypto webhook''s "product" kind), same idempotency pattern as ticket_orders/businesses. Stock decrement on products.stock_quantity happens in the same webhook transaction, guarded so retries cannot double-decrement.';


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    business_id uuid,
    name text NOT NULL,
    slug text NOT NULL,
    description text NOT NULL,
    images text[] DEFAULT ARRAY[]::text[] NOT NULL,
    price_type text DEFAULT 'one_time'::text NOT NULL,
    stripe_price_id text,
    stock_quantity integer,
    status text DEFAULT 'pending_review'::text NOT NULL,
    seo_title text,
    seo_description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    rejection_reason text,
    subtitle text,
    product_type text DEFAULT 'other'::text NOT NULL,
    category text,
    tags text[] DEFAULT ARRAY[]::text[] NOT NULL,
    cover_image_url text,
    license text DEFAULT 'personal'::text NOT NULL,
    version text DEFAULT '1.0'::text NOT NULL,
    update_policy text,
    preview_images text[] DEFAULT ARRAY[]::text[] NOT NULL,
    CONSTRAINT products_category_check CHECK (((category IS NULL) OR ((char_length(TRIM(BOTH FROM category)) >= 1) AND (char_length(TRIM(BOTH FROM category)) <= 80)))),
    CONSTRAINT products_description_check CHECK ((char_length(TRIM(BOTH FROM description)) >= 20)),
    CONSTRAINT products_license_check CHECK ((license = ANY (ARRAY['personal'::text, 'commercial'::text, 'extended'::text, 'custom'::text]))),
    CONSTRAINT products_name_check CHECK (((char_length(TRIM(BOTH FROM name)) >= 3) AND (char_length(TRIM(BOTH FROM name)) <= 180))),
    CONSTRAINT products_price_type_check CHECK ((price_type = ANY (ARRAY['one_time'::text, 'subscription'::text]))),
    CONSTRAINT products_product_type_check CHECK ((product_type = ANY (ARRAY['ebook'::text, 'guide'::text, 'workbook'::text, 'template'::text, 'spreadsheet'::text, 'presentation'::text, 'resource_pack'::text, 'course'::text, 'audio'::text, 'video'::text, 'bundle'::text, 'other'::text]))),
    CONSTRAINT products_seo_description_check CHECK (((seo_description IS NULL) OR (char_length(seo_description) <= 180))),
    CONSTRAINT products_seo_title_check CHECK (((seo_title IS NULL) OR (char_length(seo_title) <= 70))),
    CONSTRAINT products_slug_check CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text)),
    CONSTRAINT products_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'active'::text, 'out_of_stock'::text, 'rejected'::text, 'archived'::text]))),
    CONSTRAINT products_stock_quantity_check CHECK (((stock_quantity IS NULL) OR (stock_quantity >= 0))),
    CONSTRAINT products_subtitle_check CHECK (((subtitle IS NULL) OR ((char_length(TRIM(BOTH FROM subtitle)) >= 1) AND (char_length(TRIM(BOTH FROM subtitle)) <= 180)))),
    CONSTRAINT products_update_policy_check CHECK (((update_policy IS NULL) OR (char_length(update_policy) <= 500))),
    CONSTRAINT products_version_check CHECK (((char_length(TRIM(BOTH FROM version)) >= 1) AND (char_length(TRIM(BOTH FROM version)) <= 20)))
);


--
-- Name: COLUMN products.owner_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.owner_id IS 'Per-table owner reference to auth.users, matching the platform-wide ownership convention (see articles.owner_id, businesses.owner_id, and ADR 0001).';


--
-- Name: COLUMN products.business_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.business_id IS 'Optional business affiliation, mirroring articles.business_id. A product is always owned by a user (owner_id); this only tags it for business-page display/attribution.';


--
-- Name: COLUMN products.stock_quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.stock_quantity IS 'NULL = unlimited/digital good. Decremented by the payment webhook on confirmed purchase, never client-side. Guard decrements with `WHERE stock_quantity >= <qty>` for idempotency under webhook retries.';


--
-- Name: COLUMN products.product_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.product_type IS 'Generic digital-product classification. ''other'' covers physical merch and unspecified listings (the pre-116 default), so existing inventory behavior is preserved; any other value marks a digital listing (stock controls hidden, quantity fixed at 1).';


--
-- Name: profile_verification_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_verification_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    admin_user_id uuid NOT NULL,
    field_name text NOT NULL,
    old_value text,
    new_value text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profile_verification_audit_field_name_check CHECK ((field_name = 'identity_status'::text))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    role text DEFAULT 'user'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    account_info jsonb DEFAULT '{}'::jsonb NOT NULL,
    profile_photo text,
    updated_at timestamp with time zone DEFAULT now(),
    privacy_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    display_name text,
    avatar_url text,
    deleted_at timestamp with time zone,
    purge_at timestamp with time zone,
    identity_status text DEFAULT 'pending'::text NOT NULL,
    identity_verified_at timestamp with time zone,
    locale text,
    CONSTRAINT profiles_identity_status_check CHECK ((identity_status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text]))),
    CONSTRAINT profiles_locale_check CHECK (((locale IS NULL) OR (locale = ANY (ARRAY['en'::text, 'fr'::text])))),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'organizer'::text, 'user'::text]))),
    CONSTRAINT profiles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'pending_deletion'::text, 'purged'::text])))
);


--
-- Name: COLUMN profiles.locale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.locale IS 'User preferred locale (en/fr). Nullable — falls back to cookie/Accept-Language when null.';


--
-- Name: promo_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    percent_off integer,
    fixed_off_minor integer,
    fixed_currency text,
    min_subtotal_minor integer DEFAULT 0 NOT NULL,
    max_uses integer,
    used_count integer DEFAULT 0 NOT NULL,
    starts_at timestamp with time zone,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT promo_codes_code_check CHECK (((char_length(code) >= 3) AND (char_length(code) <= 40))),
    CONSTRAINT promo_codes_exactly_one_discount CHECK ((((percent_off IS NOT NULL) AND (fixed_off_minor IS NULL) AND (fixed_currency IS NULL)) OR ((percent_off IS NULL) AND (fixed_off_minor IS NOT NULL) AND (fixed_currency IS NOT NULL)))),
    CONSTRAINT promo_codes_fixed_currency_check CHECK (((fixed_currency IS NULL) OR (fixed_currency ~ '^[A-Z]{3}$'::text))),
    CONSTRAINT promo_codes_fixed_off_minor_check CHECK (((fixed_off_minor IS NULL) OR (fixed_off_minor > 0))),
    CONSTRAINT promo_codes_max_uses_check CHECK (((max_uses IS NULL) OR (max_uses > 0))),
    CONSTRAINT promo_codes_min_subtotal_minor_check CHECK ((min_subtotal_minor >= 0)),
    CONSTRAINT promo_codes_percent_off_check CHECK (((percent_off IS NULL) OR ((percent_off >= 1) AND (percent_off <= 90)))),
    CONSTRAINT promo_codes_used_count_check CHECK ((used_count >= 0)),
    CONSTRAINT promo_codes_window_valid CHECK (((starts_at IS NULL) OR (expires_at IS NULL) OR (starts_at <= expires_at)))
);


--
-- Name: promotion_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizer_id uuid NOT NULL,
    promotion_id uuid NOT NULL,
    item_id uuid,
    section_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT promotion_targets_exactly_one_target_check CHECK (((item_id IS NOT NULL) <> (section_id IS NOT NULL)))
);


--
-- Name: promotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizer_id uuid NOT NULL,
    name text NOT NULL,
    headline text,
    description text,
    image_url text,
    offer_type text NOT NULL,
    percent_off integer,
    special_price numeric(12,2),
    apply_to_variants boolean DEFAULT false NOT NULL,
    code text,
    min_order_amount numeric(12,2),
    status text DEFAULT 'draft'::text NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    priority integer DEFAULT 0 NOT NULL,
    layout text NOT NULL,
    cta_label text,
    destination_type text DEFAULT 'none'::text NOT NULL,
    destination_item_id uuid,
    destination_section_id uuid,
    destination_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT promotions_code_check CHECK (((code IS NULL) OR ((char_length(btrim(code)) >= 3) AND (char_length(btrim(code)) <= 40)))),
    CONSTRAINT promotions_cta_label_check CHECK (((cta_label IS NULL) OR (char_length(cta_label) <= 40))),
    CONSTRAINT promotions_description_check CHECK (((description IS NULL) OR (char_length(description) <= 300))),
    CONSTRAINT promotions_destination_check CHECK ((((destination_type <> 'item'::text) OR (destination_section_id IS NULL)) AND ((destination_type <> 'section'::text) OR (destination_item_id IS NULL)) AND ((destination_type <> 'external'::text) OR (destination_url IS NOT NULL)) AND ((destination_type <> 'none'::text) OR ((destination_item_id IS NULL) AND (destination_section_id IS NULL) AND (destination_url IS NULL))))),
    CONSTRAINT promotions_destination_type_check CHECK ((destination_type = ANY (ARRAY['item'::text, 'section'::text, 'menu'::text, 'external'::text, 'none'::text]))),
    CONSTRAINT promotions_destination_url_check CHECK (((destination_url IS NULL) OR (destination_url ~* '^https://'::text))),
    CONSTRAINT promotions_headline_check CHECK (((headline IS NULL) OR (char_length(headline) <= 120))),
    CONSTRAINT promotions_image_url_check CHECK (((image_url IS NULL) OR (char_length(image_url) <= 2048))),
    CONSTRAINT promotions_layout_check CHECK ((layout = ANY (ARRAY['banner'::text, 'dish_card'::text, 'announcement_bar'::text]))),
    CONSTRAINT promotions_min_order_amount_check CHECK (((min_order_amount IS NULL) OR (min_order_amount >= (0)::numeric))),
    CONSTRAINT promotions_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 80))),
    CONSTRAINT promotions_offer_type_check CHECK ((offer_type = ANY (ARRAY['percent_off'::text, 'special_price'::text, 'free_delivery'::text]))),
    CONSTRAINT promotions_offer_value_check CHECK ((((offer_type = 'percent_off'::text) AND (percent_off IS NOT NULL) AND ((percent_off >= 1) AND (percent_off <= 90)) AND (special_price IS NULL)) OR ((offer_type = 'special_price'::text) AND (special_price IS NOT NULL) AND ((special_price >= (0)::numeric) AND (special_price <= 999999.99)) AND (percent_off IS NULL)) OR ((offer_type = 'free_delivery'::text) AND (percent_off IS NULL) AND (special_price IS NULL)))),
    CONSTRAINT promotions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text]))),
    CONSTRAINT promotions_window_check CHECK (((starts_at IS NULL) OR (ends_at IS NULL) OR (starts_at <= ends_at)))
);


--
-- Name: public_donation_activity; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.public_donation_activity AS
 SELECT d.id,
    d.user_id,
    d.fundraiser_id,
    d.amount,
    d.created_at,
    f.title AS fundraiser_title,
    f.slug AS fundraiser_slug,
    f.banner AS fundraiser_banner
   FROM (public.donations d
     JOIN public.fundraisers f ON ((f.id = d.fundraiser_id)))
  WHERE ((d.user_id IS NOT NULL) AND ((d.status)::text = ANY ((ARRAY['succeeded'::character varying, 'completed'::character varying])::text[])));


--
-- Name: public_media_upload_daily_quota; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.public_media_upload_daily_quota (
    user_id uuid NOT NULL,
    quota_date date NOT NULL,
    upload_count integer NOT NULL,
    uploaded_bytes bigint NOT NULL,
    CONSTRAINT public_media_upload_daily_quota_upload_count_check CHECK ((upload_count >= 0)),
    CONSTRAINT public_media_upload_daily_quota_uploaded_bytes_check CHECK ((uploaded_bytes >= 0))
);


--
-- Name: TABLE public_media_upload_daily_quota; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.public_media_upload_daily_quota IS 'Atomic public-image upload reservations; counters are per user and UTC day, capped at 40 uploads and 200 MiB.';


--
-- Name: public_profiles; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.public_profiles AS
 SELECT id,
    display_name,
    COALESCE(avatar_url, profile_photo) AS avatar_url
   FROM public.profiles
  WHERE ((status = 'active'::text) AND (deleted_at IS NULL) AND (COALESCE(NULLIF(btrim((privacy_settings ->> 'profile_visibility'::text)), ''::text), 'public'::text) = 'public'::text));


--
-- Name: qa_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qa_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    suite text NOT NULL,
    environment text NOT NULL,
    target_tenant_id uuid,
    commit_sha text,
    triggered_by text DEFAULT 'schedule'::text NOT NULL,
    requested_by_agent_id uuid,
    approval_id uuid,
    status text DEFAULT 'requested'::text NOT NULL,
    idempotency_key uuid NOT NULL,
    passed integer DEFAULT 0 NOT NULL,
    failed integer DEFAULT 0 NOT NULL,
    skipped integer DEFAULT 0 NOT NULL,
    external_run_id text,
    artifact_base_url text,
    error text,
    claim_token_hash text,
    claim_expires_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    claimed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT qa_runs_commit_sha_check CHECK (((commit_sha IS NULL) OR (commit_sha ~ '^[0-9a-f]{7,40}$'::text))),
    CONSTRAINT qa_runs_environment_check CHECK ((environment = 'staging'::text)),
    CONSTRAINT qa_runs_error_check CHECK (((error IS NULL) OR (char_length(error) <= 2000))),
    CONSTRAINT qa_runs_failed_check CHECK ((failed >= 0)),
    CONSTRAINT qa_runs_passed_check CHECK ((passed >= 0)),
    CONSTRAINT qa_runs_skipped_check CHECK ((skipped >= 0)),
    CONSTRAINT qa_runs_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'approved'::text, 'running'::text, 'passed'::text, 'failed'::text, 'cancelled'::text, 'expired'::text]))),
    CONSTRAINT qa_runs_suite_check CHECK ((suite = ANY (ARRAY['smoke'::text, 'auth'::text, 'payments'::text]))),
    CONSTRAINT qa_runs_terminal_needs_finish CHECK (((status <> ALL (ARRAY['passed'::text, 'failed'::text, 'cancelled'::text, 'expired'::text])) OR (finished_at IS NOT NULL))),
    CONSTRAINT qa_runs_triggered_by_check CHECK ((triggered_by = ANY (ARRAY['schedule'::text, 'manual'::text, 'qa'::text, 'incident'::text])))
);


--
-- Name: TABLE qa_runs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.qa_runs IS 'QA execution-plane runs. Rows are created by request_qa_run (control plane) or the approve path; the external worker only transitions them via poll/claim + ingest. claim_token_hash stores SHA-256 of the single-use per-run claim token (addendum A2). metadata carries worker identity notes and shadow-mode would-be emission records (addendum A3).';


--
-- Name: COLUMN qa_runs.environment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.qa_runs.environment IS 'Closed enum: staging only. Production is structurally unrepresentable.';


--
-- Name: qa_test_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qa_test_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    name text NOT NULL,
    file text NOT NULL,
    status text NOT NULL,
    duration_ms integer,
    error text,
    screenshot_url text,
    trace_url text,
    logs_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT qa_test_results_duration_ms_check CHECK (((duration_ms IS NULL) OR (duration_ms >= 0))),
    CONSTRAINT qa_test_results_error_check CHECK (((error IS NULL) OR (char_length(error) <= 2000))),
    CONSTRAINT qa_test_results_file_check CHECK (((char_length(file) >= 1) AND (char_length(file) <= 300))),
    CONSTRAINT qa_test_results_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 300))),
    CONSTRAINT qa_test_results_status_check CHECK ((status = ANY (ARRAY['passed'::text, 'failed'::text, 'skipped'::text, 'flaky'::text])))
);


--
-- Name: TABLE qa_test_results; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.qa_test_results IS 'Per-test outcomes within a qa_runs row. Natural key (run_id, file, name) makes worker re-POSTs idempotent.';


--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limits (
    bucket_key text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    request_count integer DEFAULT 0 NOT NULL
);


--
-- Name: recipient_ledger_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipient_ledger_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_id uuid NOT NULL,
    entry_type text NOT NULL,
    amount numeric NOT NULL,
    currency text NOT NULL,
    source_type text NOT NULL,
    source_id uuid,
    external_reference text,
    description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recipient_ledger_entries_amount_sign CHECK ((((entry_type = 'credit'::text) AND (amount > (0)::numeric)) OR ((entry_type = 'debit'::text) AND (amount < (0)::numeric)) OR ((entry_type = 'platform_fee'::text) AND (amount < (0)::numeric)) OR ((entry_type = 'refund'::text) AND (amount < (0)::numeric)) OR ((entry_type = 'payout'::text) AND (amount < (0)::numeric)) OR ((entry_type = 'adjustment'::text) AND (amount <> (0)::numeric)))),
    CONSTRAINT recipient_ledger_entries_currency_format CHECK (((currency = lower(currency)) AND (currency ~ '^[a-z]{3}$'::text))),
    CONSTRAINT recipient_ledger_entries_entry_type_check CHECK ((entry_type = ANY (ARRAY['credit'::text, 'debit'::text, 'platform_fee'::text, 'refund'::text, 'payout'::text, 'adjustment'::text]))),
    CONSTRAINT recipient_ledger_entries_refund_requires_reference CHECK (((entry_type <> 'refund'::text) OR (external_reference IS NOT NULL))),
    CONSTRAINT recipient_ledger_entries_source_id_required CHECK ((((source_type = 'manual'::text) AND (source_id IS NULL)) OR ((source_type <> 'manual'::text) AND (source_id IS NOT NULL)))),
    CONSTRAINT recipient_ledger_entries_source_type_check CHECK ((source_type = ANY (ARRAY['donation'::text, 'ticket_order'::text, 'product_order'::text, 'payout'::text, 'manual'::text])))
);


--
-- Name: recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_type text NOT NULL,
    user_id uuid,
    organizer_id uuid,
    business_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recipients_exactly_one_identity CHECK ((((recipient_type = 'user'::text) AND (user_id IS NOT NULL) AND (organizer_id IS NULL) AND (business_id IS NULL)) OR ((recipient_type = 'organizer'::text) AND (organizer_id IS NOT NULL) AND (user_id IS NULL) AND (business_id IS NULL)) OR ((recipient_type = 'business'::text) AND (business_id IS NOT NULL) AND (user_id IS NULL) AND (organizer_id IS NULL)))),
    CONSTRAINT recipients_recipient_type_check CHECK ((recipient_type = ANY (ARRAY['user'::text, 'organizer'::text, 'business'::text])))
);


--
-- Name: reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizer_id uuid NOT NULL,
    business_id uuid,
    website_id uuid,
    booking_type text DEFAULT 'table'::text NOT NULL,
    reservation_number text NOT NULL,
    lookup_token text NOT NULL,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    customer_email text,
    party_size integer NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    customer_note text,
    owner_note text,
    decline_reason text,
    idempotency_key text,
    status_history jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reservations_booking_type_check CHECK ((booking_type = ANY (ARRAY['table'::text, 'rental'::text, 'appointment'::text]))),
    CONSTRAINT reservations_customer_name_check CHECK (((length(TRIM(BOTH FROM customer_name)) >= 1) AND (length(TRIM(BOTH FROM customer_name)) <= 100))),
    CONSTRAINT reservations_customer_note_check CHECK (((customer_note IS NULL) OR (length(customer_note) <= 300))),
    CONSTRAINT reservations_owner_note_check CHECK (((owner_note IS NULL) OR (length(owner_note) <= 300))),
    CONSTRAINT reservations_party_size_check CHECK (((party_size >= 1) AND (party_size <= 50))),
    CONSTRAINT reservations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'declined'::text, 'seated'::text, 'completed'::text, 'no_show'::text, 'cancelled'::text]))),
    CONSTRAINT reservations_status_history_check CHECK ((jsonb_typeof(status_history) = 'array'::text))
);


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_id uuid,
    fundraiser_id uuid,
    organizer_id uuid,
    rating integer NOT NULL,
    title text,
    review text,
    is_verified boolean DEFAULT false,
    is_approved boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    review_type text DEFAULT 'platform'::text,
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT reviews_review_type_check CHECK ((review_type = ANY (ARRAY['event'::text, 'fundraiser'::text, 'organizer'::text, 'platform'::text]))),
    CONSTRAINT reviews_target_or_platform CHECK ((((review_type = 'platform'::text) AND (event_id IS NULL) AND (fundraiser_id IS NULL) AND (organizer_id IS NULL)) OR ((review_type <> 'platform'::text) AND (((((event_id IS NOT NULL))::integer + ((fundraiser_id IS NOT NULL))::integer) + ((organizer_id IS NOT NULL))::integer) >= 1))))
);


--
-- Name: seats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    layout_id uuid NOT NULL,
    event_id uuid NOT NULL,
    section text NOT NULL,
    row_label text NOT NULL,
    seat_number integer NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    reserved_until timestamp with time zone,
    ticket_id uuid,
    price_override numeric(12,2),
    table_number text,
    table_name text,
    table_capacity integer,
    is_vip boolean DEFAULT false NOT NULL,
    assigned_invitation_id uuid,
    x numeric(10,2),
    y numeric(10,2),
    width numeric(10,2) DEFAULT 26,
    height numeric(10,2) DEFAULT 26,
    rotation numeric(6,2) DEFAULT 0,
    object_type text DEFAULT 'seat'::text NOT NULL,
    is_accessible boolean DEFAULT false NOT NULL,
    ticket_type_id uuid,
    CONSTRAINT seats_status_check CHECK ((status = ANY (ARRAY['available'::text, 'reserved'::text, 'sold'::text, 'unavailable'::text])))
);


--
-- Name: service_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    duration_minutes integer,
    price numeric(12,2) NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT service_tiers_description_check CHECK (((description IS NULL) OR (char_length(description) <= 500))),
    CONSTRAINT service_tiers_duration_minutes_check CHECK (((duration_minutes IS NULL) OR ((duration_minutes >= 5) AND (duration_minutes <= 1440)))),
    CONSTRAINT service_tiers_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80))),
    CONSTRAINT service_tiers_position_check CHECK ((("position" >= 0) AND ("position" <= 999))),
    CONSTRAINT service_tiers_price_check CHECK (((price >= (0)::numeric) AND (price <= 999999.99)))
);


--
-- Name: TABLE service_tiers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.service_tiers IS 'Pricing tiers for a service (e.g. Basic/Standard/Premium). Zero tiers allowed — simple service with base price is valid. ON DELETE CASCADE when parent service is deleted.';


--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizer_id uuid NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    description text,
    duration_minutes integer,
    price numeric(12,2) NOT NULL,
    image_url text,
    "position" integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT services_description_check CHECK (((description IS NULL) OR (char_length(description) <= 2000))),
    CONSTRAINT services_duration_minutes_check CHECK (((duration_minutes IS NULL) OR ((duration_minutes >= 5) AND (duration_minutes <= 1440)))),
    CONSTRAINT services_image_url_check CHECK (((image_url IS NULL) OR (char_length(image_url) <= 2048))),
    CONSTRAINT services_position_check CHECK ((("position" >= 0) AND ("position" <= 999))),
    CONSTRAINT services_price_check CHECK (((price >= (0)::numeric) AND (price <= 999999.99))),
    CONSTRAINT services_slug_check CHECK (((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text) AND (char_length(slug) >= 1) AND (char_length(slug) <= 120))),
    CONSTRAINT services_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 120)))
);


--
-- Name: TABLE services; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.services IS 'Structured business services, tenant-scoped to organizers.id. Price is local NUMERIC(12,2) for catalog display (no Stripe checkout in Phase 5).';


--
-- Name: COLUMN services.price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.services.price IS 'Local display price for catalog. Stripe checkout not used for services in Phase 5.';


--
-- Name: studio_chat_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.studio_chat_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text DEFAULT 'Untitled chat'::text NOT NULL,
    provider text DEFAULT 'gemini'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT studio_chat_conversations_provider_check CHECK ((provider = ANY (ARRAY['gemini'::text, 'openrouter'::text]))),
    CONSTRAINT studio_chat_conversations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
);


--
-- Name: studio_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.studio_chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    seq integer NOT NULL,
    role text NOT NULL,
    content text,
    tool_name text,
    guard_verdict text DEFAULT 'pass'::text NOT NULL,
    guard_reason text,
    provider text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT studio_chat_messages_guard_verdict_check CHECK ((guard_verdict = ANY (ARRAY['pass'::text, 'sanitised'::text, 'rejected'::text]))),
    CONSTRAINT studio_chat_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'tool'::text]))),
    CONSTRAINT studio_chat_messages_seq_check CHECK ((seq >= 0))
);


--
-- Name: system_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text NOT NULL,
    severity_hint text NOT NULL,
    tenant_id uuid,
    actor_id uuid,
    agent_id uuid,
    route text,
    tool_name text,
    status_code smallint,
    error_code text,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    dedupe_key text NOT NULL,
    source text DEFAULT 'aldriva'::text NOT NULL,
    CONSTRAINT system_events_dedupe_key_check CHECK (((char_length(dedupe_key) >= 1) AND (char_length(dedupe_key) <= 400))),
    CONSTRAINT system_events_kind_check CHECK ((kind = ANY (ARRAY['api_error'::text, 'job_error'::text, 'webhook_error'::text, 'payment_reconciliation'::text, 'auth_failure'::text, 'storage_error'::text, 'guard_rejection'::text, 'approval_block'::text, 'agent_tool_error'::text, 'qa_failure'::text]))),
    CONSTRAINT system_events_message_check CHECK (((char_length(message) >= 1) AND (char_length(message) <= 2000))),
    CONSTRAINT system_events_severity_hint_check CHECK ((severity_hint = ANY (ARRAY['info'::text, 'warn'::text, 'error'::text, 'critical'::text]))),
    CONSTRAINT system_events_source_check CHECK ((source ~ '^[a-z][a-z0-9_]{1,30}$'::text)),
    CONSTRAINT system_events_status_code_check CHECK (((status_code IS NULL) OR ((status_code >= 100) AND (status_code <= 599))))
);


--
-- Name: TABLE system_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.system_events IS 'Raw occurrence stream. Insert-only, service_role writes, best-effort. Grouped into incidents via dedupe_key 60-min window.';


--
-- Name: COLUMN system_events.dedupe_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.system_events.dedupe_key IS 'Deterministic: kind:route:tool_name:error_code:tenant_id|platform';


--
-- Name: COLUMN system_events.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.system_events.source IS 'Emitter source. Phase 143b: aldriva only (future: external signals without schema change).';


--
-- Name: tenant_websites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_websites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    slug text NOT NULL,
    site_title text NOT NULL,
    site_tagline text,
    theme_config jsonb DEFAULT '{"theme": "default", "darkMode": false, "fontFamily": "sans", "borderRadius": "xl", "primaryColor": "#ea580c"}'::jsonb NOT NULL,
    header_config jsonb DEFAULT '{"sticky": true, "ctaHref": "/contact", "showCta": true, "showNav": true, "ctaLabel": "Get in Touch", "showLogo": true}'::jsonb NOT NULL,
    footer_config jsonb DEFAULT '{"customLinks": [], "showSocials": true, "copyrightText": "", "showPoweredBy": true}'::jsonb NOT NULL,
    seo_title text,
    seo_description text,
    seo_og_image text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT tenant_websites_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: TABLE tenant_websites; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tenant_websites IS 'Tenant-level website settings and theme configuration. tenant_id = organizers.id (canonical Entity).';


--
-- Name: COLUMN tenant_websites.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tenant_websites.metadata IS 'Lightweight per-website metadata (websiteCategory, templateId/templateVersion, etc.). Application-level, not a full taxonomy. Stage C foundation for template compatibility filtering.';


--
-- Name: ticket_checkins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_checkins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_order_id uuid,
    event_id uuid NOT NULL,
    scanned_by_user_id uuid,
    checked_in_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ticket_instance_id uuid,
    offline_scan_id uuid,
    device_id text,
    scan_source text DEFAULT 'online'::text,
    entrance_id uuid,
    delegating_user_id uuid,
    offline_scanned_at timestamp with time zone,
    CONSTRAINT ticket_checkins_scan_source_check CHECK ((scan_source = ANY (ARRAY['online'::text, 'offline'::text, 'offline_sync'::text])))
);


--
-- Name: ticket_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_instances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    event_id uuid NOT NULL,
    ticket_id uuid,
    seat_id uuid,
    seat_label text,
    qr_code text NOT NULL,
    status text DEFAULT 'valid'::text NOT NULL,
    checked_in_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    invitation_id uuid,
    source text DEFAULT 'purchase'::text NOT NULL,
    CONSTRAINT chk_ticket_instances_source_integrity CHECK ((((source = 'purchase'::text) AND (order_id IS NOT NULL) AND (invitation_id IS NULL)) OR ((source = 'invitation'::text) AND (invitation_id IS NOT NULL) AND (order_id IS NULL)))),
    CONSTRAINT ticket_instances_source_check CHECK ((source = ANY (ARRAY['purchase'::text, 'invitation'::text]))),
    CONSTRAINT ticket_instances_status_check CHECK ((status = ANY (ARRAY['valid'::text, 'used'::text, 'cancelled'::text, 'refunded'::text])))
);


--
-- Name: ticket_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    ticket_id uuid,
    seat_id uuid,
    seat_label text,
    buyer_email text,
    buyer_name text,
    quantity integer DEFAULT 1 NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    qr_code text,
    status text DEFAULT 'valid'::text NOT NULL,
    stripe_session_id text,
    checked_in_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    stripe_payment_intent_id text,
    currency text DEFAULT 'usd'::text,
    payment_method character varying(50) DEFAULT 'stripe'::character varying,
    CONSTRAINT ticket_orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'valid'::text, 'used'::text, 'cancelled'::text, 'refunded'::text])))
);


--
-- Name: tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    name text,
    price numeric,
    quantity integer
);


--
-- Name: tool_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tool_definitions (
    name text NOT NULL,
    description text NOT NULL,
    input_schema jsonb DEFAULT '{}'::jsonb NOT NULL,
    output_schema jsonb DEFAULT '{}'::jsonb NOT NULL,
    scope text NOT NULL,
    risk text NOT NULL,
    approval_required boolean DEFAULT false NOT NULL,
    executor_ref text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    deprecated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tool_definitions_description_check CHECK (((char_length(description) >= 10) AND (char_length(description) <= 1000))),
    CONSTRAINT tool_definitions_executor_ref_check CHECK (((char_length(executor_ref) >= 3) AND (char_length(executor_ref) <= 200))),
    CONSTRAINT tool_definitions_name_check CHECK ((name ~ '^[A-Za-z][A-Za-z0-9_]{2,50}$'::text)),
    CONSTRAINT tool_definitions_risk_check CHECK ((risk = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT tool_definitions_scope_check CHECK ((scope = ANY (ARRAY['public_read'::text, 'tenant_scoped'::text, 'transactional'::text, 'admin'::text]))),
    CONSTRAINT tool_definitions_version_check CHECK ((version >= 1))
);


--
-- Name: TABLE tool_definitions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tool_definitions IS 'Registry of every AI tool. Mirrors lib/ai/tools/* AIToolDefinition objects. Single source of truth for scope, risk, approval gates. Modifications require migration.';


--
-- Name: user_identity_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_identity_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    id_type text,
    documents jsonb DEFAULT '[]'::jsonb NOT NULL,
    submitter_notes text,
    reviewer_notes text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_identity_verifications_id_type_check CHECK ((id_type = ANY (ARRAY['national_id'::text, 'passport'::text, 'drivers_license'::text]))),
    CONSTRAINT user_identity_verifications_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'needs_more_info'::text])))
);


--
-- Name: venue_layouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_layouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    name text DEFAULT 'Main Hall'::text NOT NULL,
    sections jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    version integer DEFAULT 1 NOT NULL,
    is_published boolean DEFAULT true NOT NULL,
    published_at timestamp with time zone DEFAULT now(),
    canvas_width integer DEFAULT 1200 NOT NULL,
    canvas_height integer DEFAULT 800 NOT NULL,
    venue_objects jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: website_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.website_content (
    website_id uuid NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE website_content; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.website_content IS 'Template-independent shared website content (one JSONB document per website). Template slots resolve field keys from this document; catalogs (menu/services/fleet/products) stay in their own tables and are referenced by featured ids only.';


--
-- Name: website_content_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.website_content_drafts (
    website_id uuid NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: TABLE website_content_drafts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.website_content_drafts IS 'Working drafts for website_content. Autosave target; published only via publish_content_draft. Never exposed to anonymous visitors.';


--
-- Name: website_navigation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.website_navigation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    website_id uuid NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE website_navigation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.website_navigation IS 'Navigation menu tree for a tenant website.';


--
-- Name: website_page_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.website_page_drafts (
    page_id uuid NOT NULL,
    blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    blocks_layout jsonb
);


--
-- Name: TABLE website_page_drafts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.website_page_drafts IS 'Isolated working drafts for website pages. Accessible only by tenant team members (owner, admin, manager, editor). Never exposed to anonymous visitors.';


--
-- Name: COLUMN website_page_drafts.blocks_layout; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.website_page_drafts.blocks_layout IS 'Canonical working page composition projection of blocks for the universal page renderer.';


--
-- Name: website_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.website_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    website_id uuid NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    is_home boolean DEFAULT false NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    seo_title text,
    seo_description text,
    seo_og_image text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    blocks_layout jsonb,
    CONSTRAINT website_pages_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: TABLE website_pages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.website_pages IS 'Pages belonging to a tenant website with modular block payloads.';


--
-- Name: COLUMN website_pages.blocks_layout; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.website_pages.blocks_layout IS 'Canonical page composition projection of blocks for the universal page renderer.';


--
-- Name: messages; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT timezone('utc'::text, clock_timestamp()) NOT NULL,
    inserted_at timestamp without time zone DEFAULT timezone('utc'::text, clock_timestamp()) NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    skip_broadcast boolean DEFAULT false NOT NULL
)
PARTITION BY RANGE (inserted_at);


--
-- Name: messages_2026_10_21; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_10_21 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT timezone('utc'::text, clock_timestamp()) NOT NULL,
    inserted_at timestamp without time zone DEFAULT timezone('utc'::text, clock_timestamp()) NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    skip_broadcast boolean DEFAULT false NOT NULL,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


--
-- Name: messages_2026_10_22; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_10_22 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT timezone('utc'::text, clock_timestamp()) NOT NULL,
    inserted_at timestamp without time zone DEFAULT timezone('utc'::text, clock_timestamp()) NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    skip_broadcast boolean DEFAULT false NOT NULL,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


--
-- Name: messages_2026_10_23; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_10_23 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT timezone('utc'::text, clock_timestamp()) NOT NULL,
    inserted_at timestamp without time zone DEFAULT timezone('utc'::text, clock_timestamp()) NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    skip_broadcast boolean DEFAULT false NOT NULL,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


--
-- Name: messages_2026_10_24; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_10_24 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT timezone('utc'::text, clock_timestamp()) NOT NULL,
    inserted_at timestamp without time zone DEFAULT timezone('utc'::text, clock_timestamp()) NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    skip_broadcast boolean DEFAULT false NOT NULL,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


--
-- Name: messages_2026_10_25; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_10_25 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT timezone('utc'::text, clock_timestamp()) NOT NULL,
    inserted_at timestamp without time zone DEFAULT timezone('utc'::text, clock_timestamp()) NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    skip_broadcast boolean DEFAULT false NOT NULL,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


--
-- Name: messages_2026_10_26; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_10_26 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT timezone('utc'::text, clock_timestamp()) NOT NULL,
    inserted_at timestamp without time zone DEFAULT timezone('utc'::text, clock_timestamp()) NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    skip_broadcast boolean DEFAULT false NOT NULL,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


--
-- Name: messages_2026_10_27; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_10_27 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT timezone('utc'::text, clock_timestamp()) NOT NULL,
    inserted_at timestamp without time zone DEFAULT timezone('utc'::text, clock_timestamp()) NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    skip_broadcast boolean DEFAULT false NOT NULL,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone DEFAULT now()
);


--
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    action_filter text DEFAULT '*'::text,
    selected_columns text[],
    CONSTRAINT subscription_action_filter_check CHECK ((action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: -
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL,
    versioning_status text DEFAULT 'DISABLED'::text NOT NULL,
    lifecycle_configuration jsonb,
    lifecycle_configuration_generation uuid,
    CONSTRAINT buckets_lifecycle_configuration_pair_check CHECK (((lifecycle_configuration IS NULL) = (lifecycle_configuration_generation IS NULL))),
    CONSTRAINT buckets_lifecycle_configuration_shape_check CHECK (((lifecycle_configuration IS NULL) OR ((jsonb_typeof(lifecycle_configuration) = 'object'::text) AND (lifecycle_configuration ? 'rules'::text) AND
CASE
    WHEN (jsonb_typeof((lifecycle_configuration -> 'rules'::text)) = 'array'::text) THEN ((jsonb_array_length((lifecycle_configuration -> 'rules'::text)) >= 1) AND (jsonb_array_length((lifecycle_configuration -> 'rules'::text)) <= 1000))
    ELSE false
END))),
    CONSTRAINT buckets_lifecycle_configuration_standard_only_check CHECK (((type = 'STANDARD'::storage.buckettype) OR ((lifecycle_configuration IS NULL) AND (lifecycle_configuration_generation IS NULL)))),
    CONSTRAINT buckets_versioning_dark_check CHECK ((versioning_status = 'DISABLED'::text)),
    CONSTRAINT buckets_versioning_standard_only_check CHECK (((type = 'STANDARD'::storage.buckettype) OR (versioning_status = 'DISABLED'::text))),
    CONSTRAINT buckets_versioning_status_check CHECK ((versioning_status = ANY (ARRAY['DISABLED'::text, 'ENABLED'::text, 'SUSPENDED'::text])))
);


--
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_analytics (
    name text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: buckets_vectors; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb,
    archived_at timestamp with time zone,
    is_delete_marker boolean DEFAULT false NOT NULL,
    is_versioned boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb,
    metadata jsonb
);


--
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vector_indexes; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.vector_indexes (
    id text DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    bucket_id text NOT NULL,
    data_type text NOT NULL,
    dimension integer NOT NULL,
    distance_metric text NOT NULL,
    metadata_configuration jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: messages_2026_10_21; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_10_21 FOR VALUES FROM ('2026-10-21 00:00:00') TO ('2026-10-22 00:00:00');


--
-- Name: messages_2026_10_22; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_10_22 FOR VALUES FROM ('2026-10-22 00:00:00') TO ('2026-10-23 00:00:00');


--
-- Name: messages_2026_10_23; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_10_23 FOR VALUES FROM ('2026-10-23 00:00:00') TO ('2026-10-24 00:00:00');


--
-- Name: messages_2026_10_24; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_10_24 FOR VALUES FROM ('2026-10-24 00:00:00') TO ('2026-10-25 00:00:00');


--
-- Name: messages_2026_10_25; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_10_25 FOR VALUES FROM ('2026-10-25 00:00:00') TO ('2026-10-26 00:00:00');


--
-- Name: messages_2026_10_26; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_10_26 FOR VALUES FROM ('2026-10-26 00:00:00') TO ('2026-10-27 00:00:00');


--
-- Name: messages_2026_10_27; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_10_27 FOR VALUES FROM ('2026-10-27 00:00:00') TO ('2026-10-28 00:00:00');


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: custom_oauth_providers custom_oauth_providers_identifier_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_identifier_key UNIQUE (identifier);


--
-- Name: custom_oauth_providers custom_oauth_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: mfa_recovery_code_sets mfa_recovery_code_sets_mfa_factor_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_code_sets
    ADD CONSTRAINT mfa_recovery_code_sets_mfa_factor_id_key UNIQUE (mfa_factor_id);


--
-- Name: mfa_recovery_code_sets mfa_recovery_code_sets_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_code_sets
    ADD CONSTRAINT mfa_recovery_code_sets_pkey PRIMARY KEY (id);


--
-- Name: mfa_recovery_code_sets mfa_recovery_code_sets_user_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_code_sets
    ADD CONSTRAINT mfa_recovery_code_sets_user_id_key UNIQUE (user_id);


--
-- Name: mfa_recovery_codes mfa_recovery_codes_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_codes
    ADD CONSTRAINT mfa_recovery_codes_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: scim_tokens scim_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.scim_tokens
    ADD CONSTRAINT scim_tokens_pkey PRIMARY KEY (id);


--
-- Name: scim_users scim_users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.scim_users
    ADD CONSTRAINT scim_users_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webauthn_challenges webauthn_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);


--
-- Name: webauthn_credentials webauthn_credentials_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_pkey PRIMARY KEY (id);


--
-- Name: _migration_179_invitation_layout_backup _migration_179_invitation_layout_backup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._migration_179_invitation_layout_backup
    ADD CONSTRAINT _migration_179_invitation_layout_backup_pkey PRIMARY KEY (event_id);


--
-- Name: agent_memory agent_memory_agent_id_tenant_id_fact_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory
    ADD CONSTRAINT agent_memory_agent_id_tenant_id_fact_key_key UNIQUE (agent_id, tenant_id, fact_key);


--
-- Name: agent_memory agent_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory
    ADD CONSTRAINT agent_memory_pkey PRIMARY KEY (id);


--
-- Name: agent_memory_versions agent_memory_versions_fact_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory_versions
    ADD CONSTRAINT agent_memory_versions_fact_id_version_key UNIQUE (fact_id, version);


--
-- Name: agent_memory_versions agent_memory_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory_versions
    ADD CONSTRAINT agent_memory_versions_pkey PRIMARY KEY (id);


--
-- Name: agent_reports agent_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_reports
    ADD CONSTRAINT agent_reports_pkey PRIMARY KEY (id);


--
-- Name: agent_runs agent_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_pkey PRIMARY KEY (id);


--
-- Name: agent_steps agent_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_steps
    ADD CONSTRAINT agent_steps_pkey PRIMARY KEY (id);


--
-- Name: agent_steps agent_steps_run_id_seq_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_steps
    ADD CONSTRAINT agent_steps_run_id_seq_key UNIQUE (run_id, seq);


--
-- Name: agent_tasks agent_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_pkey PRIMARY KEY (id);


--
-- Name: agent_tools agent_tools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tools
    ADD CONSTRAINT agent_tools_pkey PRIMARY KEY (agent_id, tool_name);


--
-- Name: agent_versions agent_versions_agent_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_versions
    ADD CONSTRAINT agent_versions_agent_id_version_key UNIQUE (agent_id, version);


--
-- Name: agent_versions agent_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_versions
    ADD CONSTRAINT agent_versions_pkey PRIMARY KEY (id);


--
-- Name: agents agents_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_name_key UNIQUE (name);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);


--
-- Name: ai_content_calendar ai_content_calendar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_content_calendar
    ADD CONSTRAINT ai_content_calendar_pkey PRIMARY KEY (id);


--
-- Name: ai_content_items ai_content_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_content_items
    ADD CONSTRAINT ai_content_items_pkey PRIMARY KEY (id);


--
-- Name: ai_conversations ai_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_pkey PRIMARY KEY (id);


--
-- Name: ai_guard_rejections ai_guard_rejections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_guard_rejections
    ADD CONSTRAINT ai_guard_rejections_pkey PRIMARY KEY (id);


--
-- Name: ai_knowledge_docs ai_knowledge_docs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_knowledge_docs
    ADD CONSTRAINT ai_knowledge_docs_pkey PRIMARY KEY (id);


--
-- Name: ai_messages ai_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_pkey PRIMARY KEY (id);


--
-- Name: ai_provider_configs ai_provider_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_provider_configs
    ADD CONSTRAINT ai_provider_configs_pkey PRIMARY KEY (id);


--
-- Name: ai_tool_invocations ai_tool_invocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_tool_invocations
    ADD CONSTRAINT ai_tool_invocations_pkey PRIMARY KEY (id);


--
-- Name: approvals approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_pkey PRIMARY KEY (id);


--
-- Name: article_audios article_audios_article_hash_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_audios
    ADD CONSTRAINT article_audios_article_hash_unique UNIQUE (article_id, content_hash);


--
-- Name: article_audios article_audios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_audios
    ADD CONSTRAINT article_audios_pkey PRIMARY KEY (id);


--
-- Name: articles articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_pkey PRIMARY KEY (id);


--
-- Name: articles articles_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_slug_key UNIQUE (slug);


--
-- Name: beneficiaries beneficiaries_claim_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beneficiaries
    ADD CONSTRAINT beneficiaries_claim_token_key UNIQUE (claim_token);


--
-- Name: beneficiaries beneficiaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beneficiaries
    ADD CONSTRAINT beneficiaries_pkey PRIMARY KEY (id);


--
-- Name: business_branches business_branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_branches
    ADD CONSTRAINT business_branches_pkey PRIMARY KEY (id);


--
-- Name: business_courier_offers business_courier_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_courier_offers
    ADD CONSTRAINT business_courier_offers_pkey PRIMARY KEY (id);


--
-- Name: business_kitchen_display_links business_kitchen_display_links_kitchen_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_kitchen_display_links
    ADD CONSTRAINT business_kitchen_display_links_kitchen_id_key UNIQUE (kitchen_id);


--
-- Name: business_kitchen_display_links business_kitchen_display_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_kitchen_display_links
    ADD CONSTRAINT business_kitchen_display_links_pkey PRIMARY KEY (id);


--
-- Name: business_kitchen_display_links business_kitchen_display_links_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_kitchen_display_links
    ADD CONSTRAINT business_kitchen_display_links_token_hash_key UNIQUE (token_hash);


--
-- Name: business_kitchens business_kitchens_business_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_kitchens
    ADD CONSTRAINT business_kitchens_business_id_key UNIQUE (business_id);


--
-- Name: business_kitchens business_kitchens_id_business_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_kitchens
    ADD CONSTRAINT business_kitchens_id_business_id_key UNIQUE (id, business_id);


--
-- Name: business_kitchens business_kitchens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_kitchens
    ADD CONSTRAINT business_kitchens_pkey PRIMARY KEY (id);


--
-- Name: business_moderation_events business_moderation_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_moderation_events
    ADD CONSTRAINT business_moderation_events_pkey PRIMARY KEY (id);


--
-- Name: business_worker_invitations business_worker_invitations_id_worker_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_worker_invitations
    ADD CONSTRAINT business_worker_invitations_id_worker_id_key UNIQUE (id, worker_id);


--
-- Name: business_worker_invitations business_worker_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_worker_invitations
    ADD CONSTRAINT business_worker_invitations_pkey PRIMARY KEY (id);


--
-- Name: business_worker_invitations business_worker_invitations_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_worker_invitations
    ADD CONSTRAINT business_worker_invitations_token_hash_key UNIQUE (token_hash);


--
-- Name: business_worker_invitations business_worker_invitations_worker_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_worker_invitations
    ADD CONSTRAINT business_worker_invitations_worker_id_key UNIQUE (worker_id);


--
-- Name: business_worker_sessions business_worker_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_worker_sessions
    ADD CONSTRAINT business_worker_sessions_pkey PRIMARY KEY (id);


--
-- Name: business_worker_sessions business_worker_sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_worker_sessions
    ADD CONSTRAINT business_worker_sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: business_workers business_workers_id_business_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_workers
    ADD CONSTRAINT business_workers_id_business_id_key UNIQUE (id, business_id);


--
-- Name: business_workers business_workers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_workers
    ADD CONSTRAINT business_workers_pkey PRIMARY KEY (id);


--
-- Name: businesses businesses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_pkey PRIMARY KEY (id);


--
-- Name: businesses businesses_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_slug_key UNIQUE (slug);


--
-- Name: channel_assets channel_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_assets
    ADD CONSTRAINT channel_assets_pkey PRIMARY KEY (id);


--
-- Name: comment_likes comment_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: connected_accounts connected_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connected_accounts
    ADD CONSTRAINT connected_accounts_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: courier_dispatch_settings courier_dispatch_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier_dispatch_settings
    ADD CONSTRAINT courier_dispatch_settings_pkey PRIMARY KEY (id);


--
-- Name: customer_identities customer_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_identities
    ADD CONSTRAINT customer_identities_pkey PRIMARY KEY (id);


--
-- Name: donations donations_payment_intent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.donations
    ADD CONSTRAINT donations_payment_intent_id_key UNIQUE (payment_intent_id);


--
-- Name: donations donations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.donations
    ADD CONSTRAINT donations_pkey PRIMARY KEY (id);


--
-- Name: entity_members entity_members_organizer_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_members
    ADD CONSTRAINT entity_members_organizer_id_user_id_key UNIQUE (organizer_id, user_id);


--
-- Name: entity_members entity_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_members
    ADD CONSTRAINT entity_members_pkey PRIMARY KEY (id);


--
-- Name: event_audit_logs event_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_audit_logs
    ADD CONSTRAINT event_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: event_invitation_pages event_invitation_pages_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invitation_pages
    ADD CONSTRAINT event_invitation_pages_event_id_key UNIQUE (event_id);


--
-- Name: event_invitation_pages event_invitation_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invitation_pages
    ADD CONSTRAINT event_invitation_pages_pkey PRIMARY KEY (id);


--
-- Name: event_invitation_pages event_invitation_pages_share_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invitation_pages
    ADD CONSTRAINT event_invitation_pages_share_token_key UNIQUE (share_token);


--
-- Name: event_invitations event_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invitations
    ADD CONSTRAINT event_invitations_pkey PRIMARY KEY (id);


--
-- Name: event_invitations event_invitations_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invitations
    ADD CONSTRAINT event_invitations_token_key UNIQUE (token);


--
-- Name: event_memories event_memories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_memories
    ADD CONSTRAINT event_memories_pkey PRIMARY KEY (id);


--
-- Name: event_memory_reports event_memory_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_memory_reports
    ADD CONSTRAINT event_memory_reports_pkey PRIMARY KEY (id);


--
-- Name: event_memory_retention_notices event_memory_retention_notices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_memory_retention_notices
    ADD CONSTRAINT event_memory_retention_notices_pkey PRIMARY KEY (event_id, notice_kind);


--
-- Name: event_memory_settings event_memory_settings_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_memory_settings
    ADD CONSTRAINT event_memory_settings_event_id_key UNIQUE (event_id);


--
-- Name: event_memory_settings event_memory_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_memory_settings
    ADD CONSTRAINT event_memory_settings_pkey PRIMARY KEY (id);


--
-- Name: event_memory_settings event_memory_settings_upload_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_memory_settings
    ADD CONSTRAINT event_memory_settings_upload_token_key UNIQUE (upload_token);


--
-- Name: event_staff_checkins event_staff_checkins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_staff_checkins
    ADD CONSTRAINT event_staff_checkins_pkey PRIMARY KEY (id);


--
-- Name: event_team_invitations event_team_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_team_invitations
    ADD CONSTRAINT event_team_invitations_pkey PRIMARY KEY (id);


--
-- Name: event_team_members event_team_members_event_user_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_team_members
    ADD CONSTRAINT event_team_members_event_user_key UNIQUE (event_id, user_id);


--
-- Name: event_team_members event_team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_team_members
    ADD CONSTRAINT event_team_members_pkey PRIMARY KEY (id);


--
-- Name: eventbrite_sources eventbrite_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventbrite_sources
    ADD CONSTRAINT eventbrite_sources_pkey PRIMARY KEY (id);


--
-- Name: eventbrite_sources eventbrite_sources_user_id_organizer_eventbrite_id_organize_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventbrite_sources
    ADD CONSTRAINT eventbrite_sources_user_id_organizer_eventbrite_id_organize_key UNIQUE (user_id, organizer_eventbrite_id, organizer_id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: events events_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_slug_key UNIQUE (slug);


--
-- Name: follows follows_follower_id_following_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_follower_id_following_id_key UNIQUE (follower_id, following_id);


--
-- Name: follows follows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_pkey PRIMARY KEY (id);


--
-- Name: fundraiser_media fundraiser_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fundraiser_media
    ADD CONSTRAINT fundraiser_media_pkey PRIMARY KEY (id);


--
-- Name: fundraiser_updates fundraiser_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fundraiser_updates
    ADD CONSTRAINT fundraiser_updates_pkey PRIMARY KEY (id);


--
-- Name: fundraisers fundraisers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fundraisers
    ADD CONSTRAINT fundraisers_pkey PRIMARY KEY (id);


--
-- Name: fundraisers fundraisers_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fundraisers
    ADD CONSTRAINT fundraisers_slug_key UNIQUE (slug);


--
-- Name: gofundme_sources gofundme_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gofundme_sources
    ADD CONSTRAINT gofundme_sources_pkey PRIMARY KEY (id);


--
-- Name: gofundme_sources gofundme_sources_user_id_source_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gofundme_sources
    ADD CONSTRAINT gofundme_sources_user_id_source_url_key UNIQUE (user_id, source_url);


--
-- Name: guest_import_batches guest_import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_import_batches
    ADD CONSTRAINT guest_import_batches_pkey PRIMARY KEY (id);


--
-- Name: guest_import_rows guest_import_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_import_rows
    ADD CONSTRAINT guest_import_rows_pkey PRIMARY KEY (id);


--
-- Name: homepage_categories homepage_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_categories
    ADD CONSTRAINT homepage_categories_name_key UNIQUE (name);


--
-- Name: homepage_categories homepage_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_categories
    ADD CONSTRAINT homepage_categories_pkey PRIMARY KEY (id);


--
-- Name: homepage_promotions homepage_promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_promotions
    ADD CONSTRAINT homepage_promotions_pkey PRIMARY KEY (id);


--
-- Name: homepage_sponsors homepage_sponsors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_sponsors
    ADD CONSTRAINT homepage_sponsors_pkey PRIMARY KEY (id);


--
-- Name: homepage_testimonials homepage_testimonials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_testimonials
    ADD CONSTRAINT homepage_testimonials_pkey PRIMARY KEY (id);


--
-- Name: incident_events incident_events_incident_id_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_events
    ADD CONSTRAINT incident_events_incident_id_event_id_key UNIQUE (incident_id, event_id);


--
-- Name: incident_events incident_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_events
    ADD CONSTRAINT incident_events_pkey PRIMARY KEY (id);


--
-- Name: incidents incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_pkey PRIMARY KEY (id);


--
-- Name: invitation_page_preview_tokens invitation_page_preview_tokens_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_page_preview_tokens
    ADD CONSTRAINT invitation_page_preview_tokens_event_id_key UNIQUE (event_id);


--
-- Name: invitation_page_preview_tokens invitation_page_preview_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_page_preview_tokens
    ADD CONSTRAINT invitation_page_preview_tokens_pkey PRIMARY KEY (id);


--
-- Name: invitation_page_preview_tokens invitation_page_preview_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_page_preview_tokens
    ADD CONSTRAINT invitation_page_preview_tokens_token_key UNIQUE (token);


--
-- Name: invitation_templates invitation_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_templates
    ADD CONSTRAINT invitation_templates_pkey PRIMARY KEY (id);


--
-- Name: invitation_templates invitation_templates_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_templates
    ADD CONSTRAINT invitation_templates_slug_key UNIQUE (slug);


--
-- Name: knowledge_chunks knowledge_chunks_document_id_chunk_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_document_id_chunk_index_key UNIQUE (document_id, chunk_index);


--
-- Name: knowledge_chunks knowledge_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_pkey PRIMARY KEY (id);


--
-- Name: knowledge_document_versions knowledge_document_versions_document_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_document_versions
    ADD CONSTRAINT knowledge_document_versions_document_id_version_key UNIQUE (document_id, version);


--
-- Name: knowledge_document_versions knowledge_document_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_document_versions
    ADD CONSTRAINT knowledge_document_versions_pkey PRIMARY KEY (id);


--
-- Name: knowledge_documents knowledge_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_pkey PRIMARY KEY (id);


--
-- Name: media media_object_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_object_key_key UNIQUE (object_key);


--
-- Name: media media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_pkey PRIMARY KEY (id);


--
-- Name: menu_item_option_groups menu_item_option_groups_item_group_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_option_groups
    ADD CONSTRAINT menu_item_option_groups_item_group_unique UNIQUE (item_id, group_id);


--
-- Name: menu_item_option_groups menu_item_option_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_option_groups
    ADD CONSTRAINT menu_item_option_groups_pkey PRIMARY KEY (id);


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);


--
-- Name: menu_option_groups menu_option_groups_legacy_identity_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_option_groups
    ADD CONSTRAINT menu_option_groups_legacy_identity_unique UNIQUE (legacy_source_item_id, legacy_group_id);


--
-- Name: menu_option_groups menu_option_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_option_groups
    ADD CONSTRAINT menu_option_groups_pkey PRIMARY KEY (id);


--
-- Name: menu_options menu_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_options
    ADD CONSTRAINT menu_options_pkey PRIMARY KEY (id);


--
-- Name: menu_sections menu_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_sections
    ADD CONSTRAINT menu_sections_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: offline_scan_conflicts offline_scan_conflicts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_scan_conflicts
    ADD CONSTRAINT offline_scan_conflicts_pkey PRIMARY KEY (id);


--
-- Name: order_delivery_locations order_delivery_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_delivery_locations
    ADD CONSTRAINT order_delivery_locations_pkey PRIMARY KEY (id);


--
-- Name: orders orders_id_business_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_id_business_id_key UNIQUE (id, business_id);


--
-- Name: orders orders_organizer_idempotency_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_organizer_idempotency_key UNIQUE (organizer_id, idempotency_key);


--
-- Name: orders orders_organizer_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_organizer_order_number_key UNIQUE (organizer_id, order_number);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: orders orders_tracking_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_tracking_token_key UNIQUE (tracking_token);


--
-- Name: organizer_follows organizer_follows_organizer_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_follows
    ADD CONSTRAINT organizer_follows_organizer_id_user_id_key UNIQUE (organizer_id, user_id);


--
-- Name: organizer_follows organizer_follows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_follows
    ADD CONSTRAINT organizer_follows_pkey PRIMARY KEY (id);


--
-- Name: organizer_status_audit organizer_status_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_status_audit
    ADD CONSTRAINT organizer_status_audit_pkey PRIMARY KEY (id);


--
-- Name: organizer_verification_submissions organizer_verification_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_verification_submissions
    ADD CONSTRAINT organizer_verification_submissions_pkey PRIMARY KEY (id);


--
-- Name: organizer_visibility_audit organizer_visibility_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_visibility_audit
    ADD CONSTRAINT organizer_visibility_audit_pkey PRIMARY KEY (id);


--
-- Name: organizers organizers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizers
    ADD CONSTRAINT organizers_pkey PRIMARY KEY (id);


--
-- Name: payment_reconciliation_failures payment_reconciliation_failures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_reconciliation_failures
    ADD CONSTRAINT payment_reconciliation_failures_pkey PRIMARY KEY (id);


--
-- Name: payouts payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_pkey PRIMARY KEY (id);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (key);


--
-- Name: product_assets product_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_assets
    ADD CONSTRAINT product_assets_pkey PRIMARY KEY (id);


--
-- Name: product_downloads product_downloads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_downloads
    ADD CONSTRAINT product_downloads_pkey PRIMARY KEY (id);


--
-- Name: product_orders product_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_orders
    ADD CONSTRAINT product_orders_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_slug_key UNIQUE (slug);


--
-- Name: profile_verification_audit profile_verification_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_verification_audit
    ADD CONSTRAINT profile_verification_audit_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: promo_codes promo_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_pkey PRIMARY KEY (id);


--
-- Name: promotion_targets promotion_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_targets
    ADD CONSTRAINT promotion_targets_pkey PRIMARY KEY (id);


--
-- Name: promotions promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_pkey PRIMARY KEY (id);


--
-- Name: public_media_upload_daily_quota public_media_upload_daily_quota_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_media_upload_daily_quota
    ADD CONSTRAINT public_media_upload_daily_quota_pkey PRIMARY KEY (user_id, quota_date);


--
-- Name: qa_test_results qa_results_unique_test; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_test_results
    ADD CONSTRAINT qa_results_unique_test UNIQUE (run_id, file, name);


--
-- Name: qa_runs qa_runs_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_runs
    ADD CONSTRAINT qa_runs_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: qa_runs qa_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_runs
    ADD CONSTRAINT qa_runs_pkey PRIMARY KEY (id);


--
-- Name: qa_test_results qa_test_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_test_results
    ADD CONSTRAINT qa_test_results_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (bucket_key, window_start);


--
-- Name: recipient_ledger_entries recipient_ledger_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipient_ledger_entries
    ADD CONSTRAINT recipient_ledger_entries_pkey PRIMARY KEY (id);


--
-- Name: recipients recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipients
    ADD CONSTRAINT recipients_pkey PRIMARY KEY (id);


--
-- Name: reservations reservations_organizer_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_organizer_number_key UNIQUE (organizer_id, reservation_number);


--
-- Name: reservations reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: seats seats_layout_id_section_row_label_seat_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seats
    ADD CONSTRAINT seats_layout_id_section_row_label_seat_number_key UNIQUE (layout_id, section, row_label, seat_number);


--
-- Name: seats seats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seats
    ADD CONSTRAINT seats_pkey PRIMARY KEY (id);


--
-- Name: service_tiers service_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_tiers
    ADD CONSTRAINT service_tiers_pkey PRIMARY KEY (id);


--
-- Name: services services_organizer_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_organizer_id_slug_key UNIQUE (organizer_id, slug);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: studio_chat_conversations studio_chat_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_chat_conversations
    ADD CONSTRAINT studio_chat_conversations_pkey PRIMARY KEY (id);


--
-- Name: studio_chat_messages studio_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_chat_messages
    ADD CONSTRAINT studio_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: studio_chat_messages studio_chat_messages_seq_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_chat_messages
    ADD CONSTRAINT studio_chat_messages_seq_unique UNIQUE (conversation_id, seq);


--
-- Name: system_events system_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_events
    ADD CONSTRAINT system_events_pkey PRIMARY KEY (id);


--
-- Name: tenant_websites tenant_websites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_websites
    ADD CONSTRAINT tenant_websites_pkey PRIMARY KEY (id);


--
-- Name: tenant_websites tenant_websites_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_websites
    ADD CONSTRAINT tenant_websites_slug_key UNIQUE (slug);


--
-- Name: tenant_websites tenant_websites_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_websites
    ADD CONSTRAINT tenant_websites_tenant_id_key UNIQUE (tenant_id);


--
-- Name: ticket_checkins ticket_checkins_offline_scan_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_checkins
    ADD CONSTRAINT ticket_checkins_offline_scan_id_key UNIQUE (offline_scan_id);


--
-- Name: ticket_checkins ticket_checkins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_checkins
    ADD CONSTRAINT ticket_checkins_pkey PRIMARY KEY (id);


--
-- Name: ticket_instances ticket_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_instances
    ADD CONSTRAINT ticket_instances_pkey PRIMARY KEY (id);


--
-- Name: ticket_instances ticket_instances_qr_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_instances
    ADD CONSTRAINT ticket_instances_qr_code_key UNIQUE (qr_code);


--
-- Name: ticket_orders ticket_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_orders
    ADD CONSTRAINT ticket_orders_pkey PRIMARY KEY (id);


--
-- Name: ticket_orders ticket_orders_qr_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_orders
    ADD CONSTRAINT ticket_orders_qr_code_key UNIQUE (qr_code);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: tool_definitions tool_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_definitions
    ADD CONSTRAINT tool_definitions_pkey PRIMARY KEY (name);


--
-- Name: agent_tasks uq_agent_tasks_idempotency; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT uq_agent_tasks_idempotency UNIQUE (idempotency_key);


--
-- Name: event_invitations uq_event_invitations_id_event_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invitations
    ADD CONSTRAINT uq_event_invitations_id_event_id UNIQUE (id, event_id);


--
-- Name: ticket_checkins uq_ticket_checkins_instance_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_checkins
    ADD CONSTRAINT uq_ticket_checkins_instance_id UNIQUE (ticket_instance_id);


--
-- Name: user_identity_verifications user_identity_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_identity_verifications
    ADD CONSTRAINT user_identity_verifications_pkey PRIMARY KEY (id);


--
-- Name: venue_layouts venue_layouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_layouts
    ADD CONSTRAINT venue_layouts_pkey PRIMARY KEY (id);


--
-- Name: website_content_drafts website_content_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_content_drafts
    ADD CONSTRAINT website_content_drafts_pkey PRIMARY KEY (website_id);


--
-- Name: website_content website_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_content
    ADD CONSTRAINT website_content_pkey PRIMARY KEY (website_id);


--
-- Name: website_navigation website_navigation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_navigation
    ADD CONSTRAINT website_navigation_pkey PRIMARY KEY (id);


--
-- Name: website_navigation website_navigation_website_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_navigation
    ADD CONSTRAINT website_navigation_website_id_key UNIQUE (website_id);


--
-- Name: website_page_drafts website_page_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_page_drafts
    ADD CONSTRAINT website_page_drafts_pkey PRIMARY KEY (page_id);


--
-- Name: website_pages website_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_pages
    ADD CONSTRAINT website_pages_pkey PRIMARY KEY (id);


--
-- Name: website_pages website_pages_website_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_pages
    ADD CONSTRAINT website_pages_website_id_slug_key UNIQUE (website_id, slug);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_10_21 messages_2026_10_21_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_10_21
    ADD CONSTRAINT messages_2026_10_21_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_10_22 messages_2026_10_22_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_10_22
    ADD CONSTRAINT messages_2026_10_22_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_10_23 messages_2026_10_23_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_10_23
    ADD CONSTRAINT messages_2026_10_23_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_10_24 messages_2026_10_24_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_10_24
    ADD CONSTRAINT messages_2026_10_24_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_10_25 messages_2026_10_25_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_10_25
    ADD CONSTRAINT messages_2026_10_25_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_10_26 messages_2026_10_26_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_10_26
    ADD CONSTRAINT messages_2026_10_26_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_10_27 messages_2026_10_27_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_10_27
    ADD CONSTRAINT messages_2026_10_27_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages messages_payload_exclusive; Type: CHECK CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages
    ADD CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL))) NOT VALID;


--
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: buckets_vectors buckets_vectors_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_vectors
    ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- Name: vector_indexes vector_indexes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: custom_oauth_providers_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_created_at_idx ON auth.custom_oauth_providers USING btree (created_at);


--
-- Name: custom_oauth_providers_enabled_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_enabled_idx ON auth.custom_oauth_providers USING btree (enabled);


--
-- Name: custom_oauth_providers_identifier_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_identifier_idx ON auth.custom_oauth_providers USING btree (identifier);


--
-- Name: custom_oauth_providers_provider_type_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_provider_type_idx ON auth.custom_oauth_providers USING btree (provider_type);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: idx_users_created_at_desc; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_users_created_at_desc ON auth.users USING btree (created_at DESC);


--
-- Name: idx_users_email; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_users_email ON auth.users USING btree (email);


--
-- Name: idx_users_last_sign_in_at_desc; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_users_last_sign_in_at_desc ON auth.users USING btree (last_sign_in_at DESC);


--
-- Name: idx_users_name; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_users_name ON auth.users USING btree (((raw_user_meta_data ->> 'name'::text))) WHERE ((raw_user_meta_data ->> 'name'::text) IS NOT NULL);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: mfa_recovery_codes_set_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_recovery_codes_set_id_idx ON auth.mfa_recovery_codes USING btree (mfa_recovery_code_set_id);


--
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: scim_tokens_expires_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_tokens_expires_at_idx ON auth.scim_tokens USING btree (expires_at);


--
-- Name: scim_tokens_revoked_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_tokens_revoked_at_idx ON auth.scim_tokens USING btree (revoked_at);


--
-- Name: scim_tokens_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_tokens_sso_provider_id_idx ON auth.scim_tokens USING btree (sso_provider_id);


--
-- Name: scim_tokens_token_hash_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX scim_tokens_token_hash_key ON auth.scim_tokens USING btree (token_hash);


--
-- Name: scim_users_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_created_at_idx ON auth.scim_users USING btree (sso_provider_id, created_at, id) WHERE (deleted_at IS NULL);


--
-- Name: scim_users_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_deleted_at_idx ON auth.scim_users USING btree (deleted_at);


--
-- Name: scim_users_external_id_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX scim_users_external_id_key ON auth.scim_users USING btree (sso_provider_id, external_id) WHERE ((external_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: scim_users_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_id_idx ON auth.scim_users USING btree (sso_provider_id, id) WHERE (deleted_at IS NULL);


--
-- Name: scim_users_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_sso_provider_id_idx ON auth.scim_users USING btree (sso_provider_id);


--
-- Name: scim_users_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_updated_at_idx ON auth.scim_users USING btree (sso_provider_id, updated_at, id) WHERE (deleted_at IS NULL);


--
-- Name: scim_users_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_user_id_idx ON auth.scim_users USING btree (user_id);


--
-- Name: scim_users_user_name_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_user_name_idx ON auth.scim_users USING btree (sso_provider_id, user_name COLLATE "C", id) WHERE (deleted_at IS NULL);


--
-- Name: scim_users_user_name_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX scim_users_user_name_key ON auth.scim_users USING btree (sso_provider_id, user_name) WHERE (deleted_at IS NULL);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: webauthn_challenges_expires_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_expires_at_idx ON auth.webauthn_challenges USING btree (expires_at);


--
-- Name: webauthn_challenges_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_user_id_idx ON auth.webauthn_challenges USING btree (user_id);


--
-- Name: webauthn_credentials_credential_id_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX webauthn_credentials_credential_id_key ON auth.webauthn_credentials USING btree (credential_id);


--
-- Name: webauthn_credentials_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_credentials_user_id_idx ON auth.webauthn_credentials USING btree (user_id);


--
-- Name: beneficiaries_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX beneficiaries_type_idx ON public.beneficiaries USING btree (type);


--
-- Name: beneficiaries_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX beneficiaries_user_id_idx ON public.beneficiaries USING btree (user_id);


--
-- Name: comment_likes_comment_cookie_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX comment_likes_comment_cookie_uq ON public.comment_likes USING btree (comment_id, cookie_id);


--
-- Name: comment_likes_comment_ip_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX comment_likes_comment_ip_uq ON public.comment_likes USING btree (comment_id, ip_address) WHERE (ip_address IS NOT NULL);


--
-- Name: comments_payment_intent_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX comments_payment_intent_id_key ON public.comments USING btree (payment_intent_id);


--
-- Name: events_eventbrite_event_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX events_eventbrite_event_id_key ON public.events USING btree (eventbrite_event_id) WHERE (eventbrite_event_id IS NOT NULL);


--
-- Name: fundraisers_beneficiary_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fundraisers_beneficiary_id_idx ON public.fundraisers USING btree (beneficiary_id);


--
-- Name: fundraisers_beneficiary_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fundraisers_beneficiary_type_idx ON public.fundraisers USING btree (beneficiary_type);


--
-- Name: fundraisers_gofundme_source_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fundraisers_gofundme_source_id_key ON public.fundraisers USING btree (gofundme_source_id) WHERE (gofundme_source_id IS NOT NULL);


--
-- Name: idx_agent_memory_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_memory_expiry ON public.agent_memory USING btree (expires_at) WHERE ((status = 'active'::text) AND (expires_at IS NOT NULL));


--
-- Name: idx_agent_memory_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_memory_scope ON public.agent_memory USING btree (tenant_id NULLS FIRST, agent_id NULLS FIRST, status) WHERE (status = 'active'::text);


--
-- Name: idx_agent_memory_versions_fact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_memory_versions_fact ON public.agent_memory_versions USING btree (fact_id, version DESC);


--
-- Name: idx_agent_reports_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_reports_agent_id ON public.agent_reports USING btree (agent_id, created_at DESC);


--
-- Name: idx_agent_reports_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_reports_tenant_id ON public.agent_reports USING btree (tenant_id, created_at DESC);


--
-- Name: idx_agent_runs_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_agent_id ON public.agent_runs USING btree (agent_id, created_at DESC);


--
-- Name: idx_agent_runs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_status ON public.agent_runs USING btree (status, created_at DESC);


--
-- Name: idx_agent_runs_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_task_id ON public.agent_runs USING btree (task_id);


--
-- Name: idx_agent_runs_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_tenant_id ON public.agent_runs USING btree (tenant_id, created_at DESC) WHERE (tenant_id IS NOT NULL);


--
-- Name: idx_agent_steps_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_steps_run_id ON public.agent_steps USING btree (run_id, seq);


--
-- Name: idx_agent_tasks_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_tasks_agent_id ON public.agent_tasks USING btree (agent_id, created_at DESC);


--
-- Name: idx_agent_tasks_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_tasks_claim ON public.agent_tasks USING btree (run_after NULLS FIRST, created_at) WHERE (status = 'queued'::text);


--
-- Name: idx_agent_tasks_lease; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_tasks_lease ON public.agent_tasks USING btree (lease_expires_at) WHERE (lease_expires_at IS NOT NULL);


--
-- Name: idx_agent_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_tasks_status ON public.agent_tasks USING btree (status, created_at DESC);


--
-- Name: idx_agent_tasks_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_tasks_tenant_id ON public.agent_tasks USING btree (tenant_id, created_at DESC) WHERE (tenant_id IS NOT NULL);


--
-- Name: idx_agent_tools_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_tools_agent_id ON public.agent_tools USING btree (agent_id);


--
-- Name: idx_agent_versions_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_versions_agent_id ON public.agent_versions USING btree (agent_id, version DESC);


--
-- Name: idx_agents_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_department ON public.agents USING btree (department);


--
-- Name: idx_agents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_status ON public.agents USING btree (status) WHERE (status = 'active'::text);


--
-- Name: idx_agents_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_tenant_id ON public.agents USING btree (tenant_id) WHERE (tenant_id IS NOT NULL);


--
-- Name: idx_ai_content_calendar_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_content_calendar_created_at ON public.ai_content_calendar USING btree (created_at DESC);


--
-- Name: idx_ai_content_calendar_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_content_calendar_status ON public.ai_content_calendar USING btree (status);


--
-- Name: idx_ai_content_items_content_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_content_items_content_type ON public.ai_content_items USING btree (content_type);


--
-- Name: idx_ai_content_items_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_content_items_created_at ON public.ai_content_items USING btree (created_at DESC);


--
-- Name: idx_ai_content_items_flagged; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_content_items_flagged ON public.ai_content_items USING btree (guard_result) WHERE (guard_result <> 'pass'::text);


--
-- Name: idx_ai_content_items_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_content_items_published ON public.ai_content_items USING btree (published) WHERE (published = true);


--
-- Name: idx_ai_content_items_source_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_content_items_source_id ON public.ai_content_items USING btree (source_id);


--
-- Name: idx_ai_conversations_admin_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_conversations_admin_id ON public.ai_conversations USING btree (admin_id);


--
-- Name: idx_ai_conversations_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_conversations_created_at ON public.ai_conversations USING btree (created_at DESC);


--
-- Name: idx_ai_guard_rejections_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_guard_rejections_category ON public.ai_guard_rejections USING btree (category);


--
-- Name: idx_ai_guard_rejections_context; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_guard_rejections_context ON public.ai_guard_rejections USING btree (context);


--
-- Name: idx_ai_guard_rejections_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_guard_rejections_created_at ON public.ai_guard_rejections USING btree (created_at DESC);


--
-- Name: idx_ai_guard_rejections_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_guard_rejections_tenant_id ON public.ai_guard_rejections USING btree (tenant_id) WHERE (tenant_id IS NOT NULL);


--
-- Name: idx_ai_knowledge_docs_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_knowledge_docs_category ON public.ai_knowledge_docs USING btree (category) WHERE (active = true);


--
-- Name: idx_ai_knowledge_docs_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_knowledge_docs_tags ON public.ai_knowledge_docs USING gin (tags) WHERE (active = true);


--
-- Name: idx_ai_messages_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_messages_conversation_id ON public.ai_messages USING btree (conversation_id, created_at);


--
-- Name: idx_ai_provider_configs_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_provider_configs_tenant_id ON public.ai_provider_configs USING btree (tenant_id);


--
-- Name: idx_ai_tool_invocations_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_tool_invocations_conversation_id ON public.ai_tool_invocations USING btree (conversation_id) WHERE (conversation_id IS NOT NULL);


--
-- Name: idx_ai_tool_invocations_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_tool_invocations_tenant_id ON public.ai_tool_invocations USING btree (tenant_id) WHERE (tenant_id IS NOT NULL);


--
-- Name: idx_ai_tool_invocations_tool_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_tool_invocations_tool_created ON public.ai_tool_invocations USING btree (tool_name, created_at DESC);


--
-- Name: idx_approvals_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approvals_agent_id ON public.approvals USING btree (requested_by_agent_id, created_at DESC);


--
-- Name: idx_approvals_approved_poll; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approvals_approved_poll ON public.approvals USING btree (action, expires_at, created_at) WHERE ((status = 'approved'::text) AND (audit_ref IS NULL));


--
-- Name: idx_approvals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approvals_status ON public.approvals USING btree (status, expires_at) WHERE (status = 'pending'::text);


--
-- Name: idx_approvals_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approvals_tenant_id ON public.approvals USING btree (tenant_id, created_at DESC);


--
-- Name: idx_article_audios_article_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_article_audios_article_id ON public.article_audios USING btree (article_id);


--
-- Name: idx_article_audios_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_article_audios_lookup ON public.article_audios USING btree (article_id, content_hash, status);


--
-- Name: idx_articles_categories; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_categories ON public.articles USING gin (categories);


--
-- Name: idx_articles_organizer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_organizer_id ON public.articles USING btree (organizer_id);


--
-- Name: idx_articles_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_owner_id ON public.articles USING btree (owner_id);


--
-- Name: idx_articles_public_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_public_listing ON public.articles USING btree (status, visibility, published_at DESC);


--
-- Name: idx_articles_scheduled_for; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_scheduled_for ON public.articles USING btree (scheduled_for) WHERE (status = 'scheduled'::text);


--
-- Name: idx_articles_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_tags ON public.articles USING gin (tags);


--
-- Name: idx_beneficiaries_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_beneficiaries_slug ON public.beneficiaries USING btree (slug);


--
-- Name: idx_business_branches_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_branches_business_id ON public.business_branches USING btree (business_id);


--
-- Name: idx_business_courier_offers_business_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_courier_offers_business_status ON public.business_courier_offers USING btree (business_id, status, offered_at DESC);


--
-- Name: idx_business_courier_offers_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_courier_offers_expiry ON public.business_courier_offers USING btree (status, expires_at) WHERE (status = 'offered'::text);


--
-- Name: idx_business_courier_offers_worker_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_courier_offers_worker_status ON public.business_courier_offers USING btree (courier_worker_id, status, offered_at DESC);


--
-- Name: idx_business_moderation_events_business_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_moderation_events_business_created ON public.business_moderation_events USING btree (business_id, created_at DESC);


--
-- Name: idx_business_moderation_events_decision_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_moderation_events_decision_created ON public.business_moderation_events USING btree (decision, created_at DESC);


--
-- Name: idx_business_worker_invitations_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_worker_invitations_expiry ON public.business_worker_invitations USING btree (expires_at) WHERE ((revoked_at IS NULL) AND (token_consumed_at IS NULL));


--
-- Name: idx_business_worker_sessions_worker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_worker_sessions_worker ON public.business_worker_sessions USING btree (worker_id) WHERE (revoked_at IS NULL);


--
-- Name: idx_business_workers_active_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_workers_active_scope ON public.business_workers USING btree (business_id, kitchen_id, role) WHERE ((is_active = true) AND (deactivated_at IS NULL));


--
-- Name: idx_businesses_organizer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_businesses_organizer_id ON public.businesses USING btree (organizer_id) WHERE (organizer_id IS NOT NULL);


--
-- Name: idx_businesses_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_owner_id ON public.businesses USING btree (owner_id);


--
-- Name: idx_businesses_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_slug ON public.businesses USING btree (slug);


--
-- Name: idx_businesses_status_flagged; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_status_flagged ON public.businesses USING btree (status, is_flagged);


--
-- Name: idx_channel_assets_connected_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_assets_connected_account_id ON public.channel_assets USING btree (connected_account_id);


--
-- Name: idx_channel_assets_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_assets_tenant_id ON public.channel_assets USING btree (tenant_id);


--
-- Name: idx_comments_import_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_import_batch ON public.comments USING btree (import_batch_id) WHERE (import_batch_id IS NOT NULL);


--
-- Name: idx_comments_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_target ON public.comments USING btree (target_type, target_id, status, created_at DESC);


--
-- Name: idx_comments_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_user_id ON public.comments USING btree (user_id);


--
-- Name: idx_connected_accounts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connected_accounts_status ON public.connected_accounts USING btree (status);


--
-- Name: idx_connected_accounts_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connected_accounts_tenant_id ON public.connected_accounts USING btree (tenant_id);


--
-- Name: idx_conversations_channel_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_channel_asset_id ON public.conversations USING btree (channel_asset_id) WHERE (channel_asset_id IS NOT NULL);


--
-- Name: idx_conversations_customer_identity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_customer_identity_id ON public.conversations USING btree (customer_identity_id) WHERE (customer_identity_id IS NOT NULL);


--
-- Name: idx_conversations_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_tenant_id ON public.conversations USING btree (tenant_id);


--
-- Name: idx_conversations_tenant_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_tenant_last_message ON public.conversations USING btree (tenant_id, last_message_at DESC);


--
-- Name: idx_customer_identities_aldriva_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_identities_aldriva_user ON public.customer_identities USING btree (aldriva_user_id) WHERE (aldriva_user_id IS NOT NULL);


--
-- Name: idx_customer_identities_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_identities_tenant_id ON public.customer_identities USING btree (tenant_id);


--
-- Name: idx_donations_import_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_donations_import_batch ON public.donations USING btree (import_batch_id) WHERE (import_batch_id IS NOT NULL);


--
-- Name: idx_donations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_donations_user_id ON public.donations USING btree (user_id);


--
-- Name: idx_entity_members_organizer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_members_organizer_id ON public.entity_members USING btree (organizer_id);


--
-- Name: idx_entity_members_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_members_user_id ON public.entity_members USING btree (user_id);


--
-- Name: idx_event_audit_logs_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_audit_logs_actor ON public.event_audit_logs USING btree (actor_user_id);


--
-- Name: idx_event_audit_logs_event_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_audit_logs_event_action ON public.event_audit_logs USING btree (event_id, action);


--
-- Name: idx_event_audit_logs_event_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_audit_logs_event_created ON public.event_audit_logs USING btree (event_id, created_at DESC);


--
-- Name: idx_event_invitations_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_invitations_email ON public.event_invitations USING btree (email);


--
-- Name: idx_event_invitations_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_invitations_event_id ON public.event_invitations USING btree (event_id);


--
-- Name: idx_event_invitations_import_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_invitations_import_batch ON public.event_invitations USING btree (import_batch_id) WHERE (import_batch_id IS NOT NULL);


--
-- Name: idx_event_invitations_lifecycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_invitations_lifecycle ON public.event_invitations USING btree (lifecycle_state, event_id);


--
-- Name: idx_event_invitations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_invitations_status ON public.event_invitations USING btree (invitation_status, rsvp_status);


--
-- Name: idx_event_invitations_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_invitations_token ON public.event_invitations USING btree (token);


--
-- Name: idx_event_staff_checkins_device_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_staff_checkins_device_time ON public.event_staff_checkins USING btree (device_id, scanned_at DESC) WHERE (device_id IS NOT NULL);


--
-- Name: idx_event_staff_checkins_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_staff_checkins_event_id ON public.event_staff_checkins USING btree (event_id);


--
-- Name: idx_event_staff_checkins_event_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_staff_checkins_event_time ON public.event_staff_checkins USING btree (event_id, scanned_at DESC);


--
-- Name: idx_event_staff_checkins_member_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_staff_checkins_member_time ON public.event_staff_checkins USING btree (staff_member_id, scanned_at DESC);


--
-- Name: idx_event_staff_checkins_scanner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_staff_checkins_scanner ON public.event_staff_checkins USING btree (scanned_by_user_id, scanned_at DESC) WHERE (scanned_by_user_id IS NOT NULL);


--
-- Name: idx_event_team_invitations_email_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_team_invitations_email_status ON public.event_team_invitations USING btree (email, status);


--
-- Name: idx_event_team_invitations_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_team_invitations_event ON public.event_team_invitations USING btree (event_id);


--
-- Name: idx_event_team_invitations_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_event_team_invitations_token_hash ON public.event_team_invitations USING btree (token_hash);


--
-- Name: idx_event_team_members_badge_display_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_event_team_members_badge_display_code ON public.event_team_members USING btree (badge_display_code);


--
-- Name: idx_event_team_members_badge_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_team_members_badge_status ON public.event_team_members USING btree (badge_status) WHERE (badge_status = 'revoked'::text);


--
-- Name: idx_event_team_members_badge_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_event_team_members_badge_token_hash ON public.event_team_members USING btree (badge_token_hash);


--
-- Name: idx_event_team_members_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_team_members_event_id ON public.event_team_members USING btree (event_id);


--
-- Name: idx_event_team_members_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_team_members_user_id ON public.event_team_members USING btree (user_id);


--
-- Name: idx_eventbrite_sources_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eventbrite_sources_enabled ON public.eventbrite_sources USING btree (enabled);


--
-- Name: idx_eventbrite_sources_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eventbrite_sources_user_id ON public.eventbrite_sources USING btree (user_id);


--
-- Name: idx_events_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_category ON public.events USING btree (category);


--
-- Name: idx_events_category_subcategory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_category_subcategory ON public.events USING btree (category, subcategory);


--
-- Name: idx_events_invitation_template_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_invitation_template_id ON public.events USING btree (invitation_template_id);


--
-- Name: idx_events_is_featured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_is_featured ON public.events USING btree (is_featured);


--
-- Name: idx_events_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_kind ON public.events USING btree (kind);


--
-- Name: idx_events_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_status ON public.events USING btree (status);


--
-- Name: idx_events_subcategory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_subcategory ON public.events USING btree (subcategory);


--
-- Name: idx_events_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_visibility ON public.events USING btree (visibility);


--
-- Name: idx_follows_follower_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follows_follower_id ON public.follows USING btree (follower_id);


--
-- Name: idx_follows_following_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follows_following_id ON public.follows USING btree (following_id);


--
-- Name: idx_fundraiser_media_fundraiser_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fundraiser_media_fundraiser_id ON public.fundraiser_media USING btree (fundraiser_id);


--
-- Name: idx_fundraiser_media_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fundraiser_media_position ON public.fundraiser_media USING btree (fundraiser_id, "position");


--
-- Name: idx_fundraiser_updates_fundraiser_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fundraiser_updates_fundraiser_created ON public.fundraiser_updates USING btree (fundraiser_id, created_at DESC);


--
-- Name: idx_fundraisers_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fundraisers_category ON public.fundraisers USING btree (category);


--
-- Name: idx_fundraisers_is_featured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fundraisers_is_featured ON public.fundraisers USING btree (is_featured);


--
-- Name: idx_fundraisers_organizer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fundraisers_organizer_id ON public.fundraisers USING btree (organizer_id);


--
-- Name: idx_gofundme_sources_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gofundme_sources_enabled ON public.gofundme_sources USING btree (enabled);


--
-- Name: idx_gofundme_sources_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gofundme_sources_user_id ON public.gofundme_sources USING btree (user_id);


--
-- Name: idx_guest_import_batches_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guest_import_batches_event_id ON public.guest_import_batches USING btree (event_id);


--
-- Name: idx_guest_import_batches_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guest_import_batches_status ON public.guest_import_batches USING btree (status, event_id);


--
-- Name: idx_guest_import_rows_batch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guest_import_rows_batch_id ON public.guest_import_rows USING btree (batch_id);


--
-- Name: idx_guest_import_rows_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guest_import_rows_status ON public.guest_import_rows USING btree (batch_id, status);


--
-- Name: idx_homepage_promotions_active_visible_schedule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_homepage_promotions_active_visible_schedule ON public.homepage_promotions USING btree (status, is_visible, starts_at, ends_at) WHERE ((status = 'active'::text) AND (is_visible = true));


--
-- Name: idx_homepage_promotions_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_homepage_promotions_created_by ON public.homepage_promotions USING btree (created_by);


--
-- Name: idx_homepage_promotions_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_homepage_promotions_entity ON public.homepage_promotions USING btree (entity_type, entity_slug);


--
-- Name: idx_homepage_promotions_priority_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_homepage_promotions_priority_position ON public.homepage_promotions USING btree (priority DESC, "position");


--
-- Name: idx_homepage_promotions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_homepage_promotions_status ON public.homepage_promotions USING btree (status);


--
-- Name: idx_incident_events_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incident_events_event_id ON public.incident_events USING btree (event_id);


--
-- Name: idx_incident_events_incident_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incident_events_incident_id ON public.incident_events USING btree (incident_id);


--
-- Name: idx_incidents_dedupe_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incidents_dedupe_status ON public.incidents USING btree (dedupe_key, status) WHERE (status = ANY (ARRAY['open'::text, 'investigating'::text]));


--
-- Name: idx_incidents_status_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incidents_status_severity ON public.incidents USING btree (status, severity, updated_at DESC);


--
-- Name: idx_incidents_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incidents_tenant_id ON public.incidents USING btree (tenant_id, updated_at DESC) WHERE (tenant_id IS NOT NULL);


--
-- Name: idx_invitation_pages_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitation_pages_event_id ON public.event_invitation_pages USING btree (event_id);


--
-- Name: idx_invitation_pages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitation_pages_status ON public.event_invitation_pages USING btree (page_status);


--
-- Name: idx_invitation_preview_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitation_preview_tokens_token ON public.invitation_page_preview_tokens USING btree (token);


--
-- Name: idx_invitation_templates_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitation_templates_category ON public.invitation_templates USING btree (category);


--
-- Name: idx_invitation_templates_is_active_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitation_templates_is_active_sort ON public.invitation_templates USING btree (is_active, sort_order);


--
-- Name: idx_knowledge_chunks_content_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_chunks_content_trgm ON public.knowledge_chunks USING gin (content public.gin_trgm_ops);


--
-- Name: idx_knowledge_chunks_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_chunks_document_id ON public.knowledge_chunks USING btree (document_id);


--
-- Name: idx_knowledge_chunks_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_chunks_tenant_id ON public.knowledge_chunks USING btree (tenant_id);


--
-- Name: idx_knowledge_chunks_tsv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_chunks_tsv ON public.knowledge_chunks USING gin (tsv);


--
-- Name: idx_knowledge_document_versions_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_document_versions_document_id ON public.knowledge_document_versions USING btree (document_id, version DESC);


--
-- Name: idx_knowledge_documents_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_documents_category ON public.knowledge_documents USING btree (category) WHERE (status = 'approved'::text);


--
-- Name: idx_knowledge_documents_content_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_documents_content_trgm ON public.knowledge_documents USING gin (content public.gin_trgm_ops);


--
-- Name: idx_knowledge_documents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_documents_status ON public.knowledge_documents USING btree (status);


--
-- Name: idx_knowledge_documents_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_documents_tags ON public.knowledge_documents USING gin (tags) WHERE (status = 'approved'::text);


--
-- Name: idx_knowledge_documents_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_documents_tenant_id ON public.knowledge_documents USING btree (tenant_id);


--
-- Name: idx_knowledge_documents_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_documents_title_trgm ON public.knowledge_documents USING gin (title public.gin_trgm_ops);


--
-- Name: idx_memories_delete_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memories_delete_token ON public.event_memories USING btree (delete_token_hash) WHERE (delete_token_hash IS NOT NULL);


--
-- Name: idx_memories_event_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memories_event_status ON public.event_memories USING btree (event_id, status, created_at DESC);


--
-- Name: idx_memory_reports_memory_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_reports_memory_id ON public.event_memory_reports USING btree (memory_id);


--
-- Name: idx_memory_settings_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_settings_event_id ON public.event_memory_settings USING btree (event_id);


--
-- Name: idx_memory_settings_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_settings_token ON public.event_memory_settings USING btree (upload_token);


--
-- Name: idx_menu_item_option_groups_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_option_groups_group_id ON public.menu_item_option_groups USING btree (group_id);


--
-- Name: idx_menu_item_option_groups_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_option_groups_item_id ON public.menu_item_option_groups USING btree (item_id);


--
-- Name: idx_menu_item_option_groups_item_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_option_groups_item_position ON public.menu_item_option_groups USING btree (item_id, "position");


--
-- Name: idx_menu_item_option_groups_organizer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_option_groups_organizer_id ON public.menu_item_option_groups USING btree (organizer_id);


--
-- Name: idx_menu_item_option_groups_organizer_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_option_groups_organizer_position ON public.menu_item_option_groups USING btree (organizer_id, "position");


--
-- Name: idx_menu_items_allergens_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_items_allergens_gin ON public.menu_items USING gin (allergens);


--
-- Name: idx_menu_items_dietary_tags_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_items_dietary_tags_gin ON public.menu_items USING gin (dietary_tags);


--
-- Name: idx_menu_items_organizer_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_items_organizer_active ON public.menu_items USING btree (organizer_id, is_active) WHERE (is_active = true);


--
-- Name: idx_menu_items_organizer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_items_organizer_id ON public.menu_items USING btree (organizer_id);


--
-- Name: idx_menu_items_section_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_items_section_id ON public.menu_items USING btree (section_id);


--
-- Name: idx_menu_items_section_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_items_section_position ON public.menu_items USING btree (section_id, "position");


--
-- Name: idx_menu_option_groups_legacy_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_option_groups_legacy_source ON public.menu_option_groups USING btree (legacy_source_item_id) WHERE (legacy_source_item_id IS NOT NULL);


--
-- Name: idx_menu_option_groups_organizer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_option_groups_organizer_id ON public.menu_option_groups USING btree (organizer_id);


--
-- Name: idx_menu_option_groups_organizer_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_option_groups_organizer_position ON public.menu_option_groups USING btree (organizer_id, "position");


--
-- Name: idx_menu_options_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_options_group_id ON public.menu_options USING btree (group_id);


--
-- Name: idx_menu_options_group_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_options_group_position ON public.menu_options USING btree (group_id, "position");


--
-- Name: idx_menu_options_organizer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_options_organizer_id ON public.menu_options USING btree (organizer_id);


--
-- Name: idx_menu_options_organizer_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_options_organizer_position ON public.menu_options USING btree (organizer_id, "position");


--
-- Name: idx_menu_sections_organizer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_sections_organizer_id ON public.menu_sections USING btree (organizer_id);


--
-- Name: idx_menu_sections_organizer_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_sections_organizer_position ON public.menu_sections USING btree (organizer_id, "position");


--
-- Name: idx_messages_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_conversation_id ON public.messages USING btree (conversation_id);


--
-- Name: idx_messages_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_tenant_id ON public.messages USING btree (tenant_id);


--
-- Name: idx_notification_preferences_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_preferences_tenant_id ON public.notification_preferences USING btree (tenant_id);


--
-- Name: idx_notifications_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);


--
-- Name: idx_offline_conflicts_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offline_conflicts_event_id ON public.offline_scan_conflicts USING btree (event_id);


--
-- Name: idx_offline_conflicts_instance_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offline_conflicts_instance_id ON public.offline_scan_conflicts USING btree (ticket_instance_id);


--
-- Name: idx_offline_conflicts_scan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offline_conflicts_scan_id ON public.offline_scan_conflicts USING btree (offline_scan_id);


--
-- Name: idx_order_delivery_locations_courier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_delivery_locations_courier ON public.order_delivery_locations USING btree (courier_worker_id, recorded_at DESC);


--
-- Name: idx_order_delivery_locations_order_recorded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_delivery_locations_order_recorded ON public.order_delivery_locations USING btree (order_id, recorded_at DESC);


--
-- Name: idx_orders_courier_worker_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_courier_worker_active ON public.orders USING btree (courier_worker_id, status) WHERE (courier_worker_id IS NOT NULL);


--
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_created_at ON public.orders USING btree (created_at DESC);


--
-- Name: idx_orders_one_active_order_per_courier; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_orders_one_active_order_per_courier ON public.orders USING btree (courier_worker_id) WHERE ((courier_worker_id IS NOT NULL) AND (status = ANY (ARRAY['accepted'::text, 'preparing'::text, 'ready'::text, 'picked_up'::text, 'out_for_delivery'::text])));


--
-- Name: idx_orders_org_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_org_status_created ON public.orders USING btree (organizer_id, status, created_at DESC);


--
-- Name: idx_orders_organizer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_organizer_id ON public.orders USING btree (organizer_id);


--
-- Name: idx_orders_tracking_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_tracking_token ON public.orders USING btree (tracking_token);


--
-- Name: idx_orders_website_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_website_id ON public.orders USING btree (website_id);


--
-- Name: idx_org_verification_submissions_organizer_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_verification_submissions_organizer_created ON public.organizer_verification_submissions USING btree (organizer_id, created_at DESC);


--
-- Name: idx_org_verification_submissions_organizer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_verification_submissions_organizer_id ON public.organizer_verification_submissions USING btree (organizer_id);


--
-- Name: idx_org_verification_submissions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_verification_submissions_status ON public.organizer_verification_submissions USING btree (status);


--
-- Name: idx_organizer_follows_organizer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizer_follows_organizer_id ON public.organizer_follows USING btree (organizer_id);


--
-- Name: idx_organizer_follows_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizer_follows_user_id ON public.organizer_follows USING btree (user_id);


--
-- Name: idx_organizer_status_audit_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizer_status_audit_created_at ON public.organizer_status_audit USING btree (created_at DESC);


--
-- Name: idx_organizer_status_audit_organizer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizer_status_audit_organizer_id ON public.organizer_status_audit USING btree (organizer_id);


--
-- Name: idx_organizers_org_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizers_org_type ON public.organizers USING btree (org_type);


--
-- Name: idx_organizers_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_organizers_slug ON public.organizers USING btree (slug) WHERE (slug IS NOT NULL);


--
-- Name: idx_organizers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizers_status ON public.organizers USING btree (status);


--
-- Name: idx_organizers_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizers_visibility ON public.organizers USING btree (visibility);


--
-- Name: idx_payment_reconciliation_failures_unresolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_reconciliation_failures_unresolved ON public.payment_reconciliation_failures USING btree (created_at) WHERE (resolved_at IS NULL);


--
-- Name: idx_payouts_client_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_payouts_client_idempotency_key ON public.payouts USING btree (client_idempotency_key) WHERE (client_idempotency_key IS NOT NULL);


--
-- Name: idx_payouts_external_payout_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_payouts_external_payout_id ON public.payouts USING btree (destination_type, external_payout_id) WHERE (external_payout_id IS NOT NULL);


--
-- Name: idx_payouts_recipient_currency_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payouts_recipient_currency_status ON public.payouts USING btree (recipient_id, currency, status);


--
-- Name: idx_payouts_status_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payouts_status_created_at ON public.payouts USING btree (status, created_at DESC);


--
-- Name: idx_product_assets_path_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_product_assets_path_unique ON public.product_assets USING btree (file_path);


--
-- Name: idx_product_assets_product_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_assets_product_position ON public.product_assets USING btree (product_id, "position");


--
-- Name: idx_product_assets_product_preview; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_assets_product_preview ON public.product_assets USING btree (product_id) WHERE (is_preview = true);


--
-- Name: idx_product_downloads_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_downloads_asset_id ON public.product_downloads USING btree (asset_id);


--
-- Name: idx_product_downloads_buyer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_downloads_buyer_id ON public.product_downloads USING btree (buyer_id);


--
-- Name: idx_product_downloads_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_downloads_order_id ON public.product_downloads USING btree (order_id);


--
-- Name: idx_product_downloads_product_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_downloads_product_created ON public.product_downloads USING btree (product_id, created_at DESC);


--
-- Name: idx_product_orders_buyer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_orders_buyer_id ON public.product_orders USING btree (buyer_id);


--
-- Name: idx_product_orders_crypto_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_orders_crypto_payment_id ON public.product_orders USING btree (crypto_payment_id);


--
-- Name: idx_product_orders_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_orders_product_id ON public.product_orders USING btree (product_id);


--
-- Name: idx_product_orders_stripe_payment_intent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_orders_stripe_payment_intent_id ON public.product_orders USING btree (stripe_payment_intent_id);


--
-- Name: idx_product_orders_stripe_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_orders_stripe_session_id ON public.product_orders USING btree (stripe_session_id);


--
-- Name: idx_products_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_business_id ON public.products USING btree (business_id);


--
-- Name: idx_products_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category ON public.products USING btree (category) WHERE (category IS NOT NULL);


--
-- Name: idx_products_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_owner_id ON public.products USING btree (owner_id);


--
-- Name: idx_products_product_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_product_type ON public.products USING btree (product_type);


--
-- Name: idx_products_public_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_public_listing ON public.products USING btree (status, created_at DESC);


--
-- Name: idx_products_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_slug ON public.products USING btree (slug);


--
-- Name: idx_products_status_type_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_status_type_created ON public.products USING btree (status, product_type, created_at DESC);


--
-- Name: idx_products_tags_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_tags_gin ON public.products USING gin (tags);


--
-- Name: idx_profile_verification_audit_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_verification_audit_profile_id ON public.profile_verification_audit USING btree (profile_id);


--
-- Name: idx_profiles_locale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_locale ON public.profiles USING btree (locale) WHERE (locale IS NOT NULL);


--
-- Name: idx_promo_codes_tenant_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promo_codes_tenant_active ON public.promo_codes USING btree (tenant_id) WHERE (is_active = true);


--
-- Name: idx_qa_results_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qa_results_run ON public.qa_test_results USING btree (run_id);


--
-- Name: idx_qa_runs_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qa_runs_claim ON public.qa_runs USING btree (status, created_at) WHERE (status = 'approved'::text);


--
-- Name: idx_qa_runs_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qa_runs_idempotency ON public.qa_runs USING btree (idempotency_key);


--
-- Name: idx_qa_runs_suite_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qa_runs_suite_created ON public.qa_runs USING btree (suite, created_at DESC);


--
-- Name: idx_rate_limits_window_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limits_window_start ON public.rate_limits USING btree (window_start);


--
-- Name: idx_recipient_ledger_entries_recipient_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipient_ledger_entries_recipient_currency ON public.recipient_ledger_entries USING btree (recipient_id, currency);


--
-- Name: idx_recipient_ledger_entries_refund_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_recipient_ledger_entries_refund_dedup ON public.recipient_ledger_entries USING btree (source_type, source_id, entry_type, external_reference) WHERE (entry_type = 'refund'::text);


--
-- Name: idx_recipient_ledger_entries_source_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_recipient_ledger_entries_source_dedup ON public.recipient_ledger_entries USING btree (source_type, source_id, entry_type) WHERE ((source_id IS NOT NULL) AND (entry_type <> 'refund'::text));


--
-- Name: idx_recipients_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_recipients_business_id ON public.recipients USING btree (business_id) WHERE (business_id IS NOT NULL);


--
-- Name: idx_recipients_organizer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_recipients_organizer_id ON public.recipients USING btree (organizer_id) WHERE (organizer_id IS NOT NULL);


--
-- Name: idx_recipients_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_recipients_user_id ON public.recipients USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_reservations_lookup_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_reservations_lookup_token ON public.reservations USING btree (lookup_token);


--
-- Name: idx_reservations_organizer_starts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservations_organizer_starts ON public.reservations USING btree (organizer_id, starts_at DESC);


--
-- Name: idx_reservations_organizer_status_starts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservations_organizer_status_starts ON public.reservations USING btree (organizer_id, status, starts_at DESC);


--
-- Name: idx_seats_assigned_invitation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seats_assigned_invitation_id ON public.seats USING btree (assigned_invitation_id) WHERE (assigned_invitation_id IS NOT NULL);


--
-- Name: idx_seats_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seats_event_id ON public.seats USING btree (event_id);


--
-- Name: idx_seats_is_vip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seats_is_vip ON public.seats USING btree (event_id, is_vip) WHERE (is_vip = true);


--
-- Name: idx_seats_layout_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seats_layout_id ON public.seats USING btree (layout_id);


--
-- Name: idx_seats_object_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seats_object_type ON public.seats USING btree (layout_id, object_type);


--
-- Name: idx_seats_spatial; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seats_spatial ON public.seats USING btree (layout_id, x, y) WHERE (x IS NOT NULL);


--
-- Name: idx_seats_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seats_status ON public.seats USING btree (status);


--
-- Name: idx_seats_table_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seats_table_number ON public.seats USING btree (layout_id, table_number) WHERE (table_number IS NOT NULL);


--
-- Name: idx_seats_ticket_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seats_ticket_type_id ON public.seats USING btree (ticket_type_id) WHERE (ticket_type_id IS NOT NULL);


--
-- Name: idx_seats_unique_assigned_invitation; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_seats_unique_assigned_invitation ON public.seats USING btree (assigned_invitation_id) WHERE (assigned_invitation_id IS NOT NULL);


--
-- Name: idx_service_tiers_service_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_tiers_service_id ON public.service_tiers USING btree (service_id);


--
-- Name: idx_service_tiers_service_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_tiers_service_position ON public.service_tiers USING btree (service_id, "position");


--
-- Name: idx_services_organizer_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_organizer_active ON public.services USING btree (organizer_id, is_active) WHERE (is_active = true);


--
-- Name: idx_services_organizer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_organizer_id ON public.services USING btree (organizer_id);


--
-- Name: idx_services_organizer_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_organizer_position ON public.services USING btree (organizer_id, "position");


--
-- Name: idx_studio_chat_conversations_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_studio_chat_conversations_owner ON public.studio_chat_conversations USING btree (user_id, created_at DESC);


--
-- Name: idx_studio_chat_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_studio_chat_messages_conversation ON public.studio_chat_messages USING btree (conversation_id, seq);


--
-- Name: idx_system_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_events_created_at ON public.system_events USING btree (created_at DESC);


--
-- Name: idx_system_events_dedupe_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_events_dedupe_created ON public.system_events USING btree (dedupe_key, created_at DESC);


--
-- Name: idx_system_events_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_events_kind ON public.system_events USING btree (kind, created_at DESC);


--
-- Name: idx_system_events_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_events_tenant_id ON public.system_events USING btree (tenant_id, created_at DESC) WHERE (tenant_id IS NOT NULL);


--
-- Name: idx_tenant_websites_metadata_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_websites_metadata_category ON public.tenant_websites USING gin (metadata);


--
-- Name: idx_tenant_websites_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_websites_slug ON public.tenant_websites USING btree (slug);


--
-- Name: idx_tenant_websites_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_websites_status ON public.tenant_websites USING btree (status);


--
-- Name: idx_tenant_websites_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_websites_tenant_id ON public.tenant_websites USING btree (tenant_id);


--
-- Name: idx_ticket_checkins_delegating_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_checkins_delegating_user ON public.ticket_checkins USING btree (delegating_user_id) WHERE (delegating_user_id IS NOT NULL);


--
-- Name: idx_ticket_checkins_entrance_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_checkins_entrance_id ON public.ticket_checkins USING btree (entrance_id) WHERE (entrance_id IS NOT NULL);


--
-- Name: idx_ticket_checkins_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_checkins_event_id ON public.ticket_checkins USING btree (event_id);


--
-- Name: idx_ticket_checkins_offline_scan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_checkins_offline_scan_id ON public.ticket_checkins USING btree (offline_scan_id) WHERE (offline_scan_id IS NOT NULL);


--
-- Name: idx_ticket_checkins_offline_scanned_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_checkins_offline_scanned_at ON public.ticket_checkins USING btree (offline_scanned_at) WHERE (offline_scanned_at IS NOT NULL);


--
-- Name: idx_ticket_checkins_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_checkins_order_id ON public.ticket_checkins USING btree (ticket_order_id);


--
-- Name: idx_ticket_checkins_scanned_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_checkins_scanned_by ON public.ticket_checkins USING btree (scanned_by_user_id);


--
-- Name: idx_ticket_instances_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_instances_event_id ON public.ticket_instances USING btree (event_id);


--
-- Name: idx_ticket_instances_invitation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_instances_invitation_id ON public.ticket_instances USING btree (invitation_id);


--
-- Name: idx_ticket_instances_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_instances_order_id ON public.ticket_instances USING btree (order_id);


--
-- Name: idx_ticket_instances_qr_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_instances_qr_code ON public.ticket_instances USING btree (qr_code);


--
-- Name: idx_ticket_instances_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_instances_source ON public.ticket_instances USING btree (source);


--
-- Name: idx_ticket_instances_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_instances_status ON public.ticket_instances USING btree (status);


--
-- Name: idx_ticket_orders_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_orders_event_id ON public.ticket_orders USING btree (event_id);


--
-- Name: idx_ticket_orders_payment_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ticket_orders_payment_intent ON public.ticket_orders USING btree (stripe_payment_intent_id);


--
-- Name: idx_ticket_orders_qr_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_orders_qr_code ON public.ticket_orders USING btree (qr_code);


--
-- Name: idx_ticket_orders_stripe_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_orders_stripe_session ON public.ticket_orders USING btree (stripe_session_id);


--
-- Name: idx_unique_user_event_review; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_unique_user_event_review ON public.reviews USING btree (user_id, event_id) WHERE (event_id IS NOT NULL);


--
-- Name: idx_unique_user_fundraiser_review; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_unique_user_fundraiser_review ON public.reviews USING btree (user_id, fundraiser_id) WHERE (fundraiser_id IS NOT NULL);


--
-- Name: idx_unique_user_organizer_review; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_unique_user_organizer_review ON public.reviews USING btree (user_id, organizer_id) WHERE (organizer_id IS NOT NULL);


--
-- Name: idx_unique_user_platform_review; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_unique_user_platform_review ON public.reviews USING btree (user_id) WHERE (review_type = 'platform'::text);


--
-- Name: idx_user_identity_verifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_identity_verifications_user_id ON public.user_identity_verifications USING btree (user_id, created_at DESC);


--
-- Name: idx_venue_layouts_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_venue_layouts_event_id ON public.venue_layouts USING btree (event_id);


--
-- Name: idx_website_content_drafts_website_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_website_content_drafts_website_id ON public.website_content_drafts USING btree (website_id);


--
-- Name: idx_website_content_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_website_content_gin ON public.website_content USING gin (content);


--
-- Name: idx_website_content_website_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_website_content_website_id ON public.website_content USING btree (website_id);


--
-- Name: idx_website_navigation_website_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_website_navigation_website_id ON public.website_navigation USING btree (website_id);


--
-- Name: idx_website_page_drafts_page_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_website_page_drafts_page_id ON public.website_page_drafts USING btree (page_id);


--
-- Name: idx_website_pages_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_website_pages_sort ON public.website_pages USING btree (website_id, sort_order, created_at);


--
-- Name: idx_website_pages_website_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_website_pages_website_id ON public.website_pages USING btree (website_id);


--
-- Name: media_owner_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_owner_created_idx ON public.media USING btree (owner_user_id, created_at DESC) WHERE (owner_user_id IS NOT NULL);


--
-- Name: media_purpose_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_purpose_idx ON public.media USING btree (purpose);


--
-- Name: media_target_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_target_created_idx ON public.media USING btree (target_id, created_at DESC) WHERE (target_id IS NOT NULL);


--
-- Name: media_tenant_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_tenant_created_idx ON public.media USING btree (tenant_id, created_at DESC) WHERE (tenant_id IS NOT NULL);


--
-- Name: promo_codes_tenant_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX promo_codes_tenant_code_unique ON public.promo_codes USING btree (tenant_id, lower(code));


--
-- Name: promotion_targets_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promotion_targets_item_id_idx ON public.promotion_targets USING btree (item_id);


--
-- Name: promotion_targets_organizer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promotion_targets_organizer_id_idx ON public.promotion_targets USING btree (organizer_id);


--
-- Name: promotion_targets_promotion_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promotion_targets_promotion_id_idx ON public.promotion_targets USING btree (promotion_id);


--
-- Name: promotion_targets_promotion_item_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX promotion_targets_promotion_item_unique ON public.promotion_targets USING btree (promotion_id, item_id) WHERE (item_id IS NOT NULL);


--
-- Name: promotion_targets_promotion_section_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX promotion_targets_promotion_section_unique ON public.promotion_targets USING btree (promotion_id, section_id) WHERE (section_id IS NOT NULL);


--
-- Name: promotion_targets_section_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promotion_targets_section_id_idx ON public.promotion_targets USING btree (section_id);


--
-- Name: promotions_code_organizer_ci_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX promotions_code_organizer_ci_unique ON public.promotions USING btree (organizer_id, lower(btrim(code))) WHERE (code IS NOT NULL);


--
-- Name: promotions_destination_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promotions_destination_item_idx ON public.promotions USING btree (destination_item_id);


--
-- Name: promotions_destination_section_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promotions_destination_section_idx ON public.promotions USING btree (destination_section_id);


--
-- Name: promotions_organizer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promotions_organizer_id_idx ON public.promotions USING btree (organizer_id);


--
-- Name: promotions_organizer_starts_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promotions_organizer_starts_at_idx ON public.promotions USING btree (organizer_id, starts_at);


--
-- Name: promotions_organizer_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promotions_organizer_status_idx ON public.promotions USING btree (organizer_id, status);


--
-- Name: reservations_organizer_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reservations_organizer_idempotency_key ON public.reservations USING btree (organizer_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: uq_agent_memory_agent_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_agent_memory_agent_platform ON public.agent_memory USING btree (agent_id, fact_key) WHERE ((agent_id IS NOT NULL) AND (tenant_id IS NULL));


--
-- Name: uq_agent_memory_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_agent_memory_platform ON public.agent_memory USING btree (fact_key) WHERE ((agent_id IS NULL) AND (tenant_id IS NULL));


--
-- Name: uq_agent_memory_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_agent_memory_tenant ON public.agent_memory USING btree (tenant_id, fact_key) WHERE ((agent_id IS NULL) AND (tenant_id IS NOT NULL));


--
-- Name: uq_agent_runs_task_attempt; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_agent_runs_task_attempt ON public.agent_runs USING btree (task_id, attempt_no);


--
-- Name: uq_ai_provider_configs_tenant_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_ai_provider_configs_tenant_provider ON public.ai_provider_configs USING btree (tenant_id, provider);


--
-- Name: uq_business_branches_one_main_per_business; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_business_branches_one_main_per_business ON public.business_branches USING btree (business_id) WHERE (is_main = true);


--
-- Name: uq_business_courier_offers_order_worker; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_business_courier_offers_order_worker ON public.business_courier_offers USING btree (order_id, courier_worker_id);


--
-- Name: uq_channel_assets_channel_provider_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_channel_assets_channel_provider_asset ON public.channel_assets USING btree (channel, provider_asset_id) WHERE (provider_asset_id IS NOT NULL);


--
-- Name: uq_connected_accounts_tenant_provider_account; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_connected_accounts_tenant_provider_account ON public.connected_accounts USING btree (tenant_id, provider, provider_account_id) WHERE (provider_account_id IS NOT NULL);


--
-- Name: uq_customer_identities_tenant_channel_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_customer_identities_tenant_channel_external ON public.customer_identities USING btree (tenant_id, channel, external_customer_id);


--
-- Name: uq_incidents_open_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_incidents_open_dedupe ON public.incidents USING btree (dedupe_key) WHERE (status = ANY (ARRAY['open'::text, 'investigating'::text]));


--
-- Name: uq_messages_external_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_messages_external_message_id ON public.messages USING btree (external_message_id) WHERE (external_message_id IS NOT NULL);


--
-- Name: uq_notification_preferences_tenant_channel_event; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_notification_preferences_tenant_channel_event ON public.notification_preferences USING btree (tenant_id, channel, event_type);


--
-- Name: uq_orders_provider_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_orders_provider_reference ON public.orders USING btree (provider, provider_reference) WHERE ((provider IS NOT NULL) AND (provider_reference IS NOT NULL));


--
-- Name: uq_website_pages_single_home; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_website_pages_single_home ON public.website_pages USING btree (website_id) WHERE (is_home = true);


--
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- Name: messages_inserted_at_topic_index; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_10_21_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_10_21_inserted_at_topic_idx ON realtime.messages_2026_10_21 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_10_22_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_10_22_inserted_at_topic_idx ON realtime.messages_2026_10_22 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_10_23_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_10_23_inserted_at_topic_idx ON realtime.messages_2026_10_23 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_10_24_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_10_24_inserted_at_topic_idx ON realtime.messages_2026_10_24 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_10_25_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_10_25_inserted_at_topic_idx ON realtime.messages_2026_10_25 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_10_26_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_10_26_inserted_at_topic_idx ON realtime.messages_2026_10_26 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_10_27_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_10_27_inserted_at_topic_idx ON realtime.messages_2026_10_27 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: subscription_subscription_id_entity_filters_action_filter_selec; Type: INDEX; Schema: realtime; Owner: -
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_action_filter_selec ON realtime.subscription USING btree (subscription_id, entity, filters, action_filter, COALESCE(selected_columns, '{}'::text[]));


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: buckets_analytics_unique_name_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- Name: idx_objects_bucket_id_name_lower; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");


--
-- Name: idx_objects_current_version; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_objects_current_version ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE (archived_at IS NULL);


--
-- Name: idx_objects_delete_markers; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_delete_markers ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE is_delete_marker;


--
-- Name: idx_objects_null_version; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_objects_null_version ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE (NOT is_versioned);


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: objects_bucket_id_name_version_key; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX objects_bucket_id_name_version_key ON storage.objects USING btree (bucket_id, name COLLATE "C", version) NULLS NOT DISTINCT;


--
-- Name: vector_indexes_name_bucket_id_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);


--
-- Name: messages_2026_10_21_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_10_21_inserted_at_topic_idx;


--
-- Name: messages_2026_10_21_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_10_21_pkey;


--
-- Name: messages_2026_10_22_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_10_22_inserted_at_topic_idx;


--
-- Name: messages_2026_10_22_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_10_22_pkey;


--
-- Name: messages_2026_10_23_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_10_23_inserted_at_topic_idx;


--
-- Name: messages_2026_10_23_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_10_23_pkey;


--
-- Name: messages_2026_10_24_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_10_24_inserted_at_topic_idx;


--
-- Name: messages_2026_10_24_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_10_24_pkey;


--
-- Name: messages_2026_10_25_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_10_25_inserted_at_topic_idx;


--
-- Name: messages_2026_10_25_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_10_25_pkey;


--
-- Name: messages_2026_10_26_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_10_26_inserted_at_topic_idx;


--
-- Name: messages_2026_10_26_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_10_26_pkey;


--
-- Name: messages_2026_10_27_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_10_27_inserted_at_topic_idx;


--
-- Name: messages_2026_10_27_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_10_27_pkey;


--
-- Name: ai_content_items ai_content_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ai_content_items_updated_at BEFORE UPDATE ON public.ai_content_items FOR EACH ROW EXECUTE FUNCTION public.ai_set_updated_at();


--
-- Name: ai_conversations ai_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ai_conversations_updated_at BEFORE UPDATE ON public.ai_conversations FOR EACH ROW EXECUTE FUNCTION public.ai_set_updated_at();


--
-- Name: ai_knowledge_docs ai_knowledge_docs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ai_knowledge_docs_updated_at BEFORE UPDATE ON public.ai_knowledge_docs FOR EACH ROW EXECUTE FUNCTION public.ai_set_updated_at();


--
-- Name: profiles prevent_profile_role_status_self_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevent_profile_role_status_self_update BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_status_self_update();


--
-- Name: agent_memory trg_agent_memory_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_agent_memory_updated_at BEFORE UPDATE ON public.agent_memory FOR EACH ROW EXECUTE FUNCTION public.update_agent_memory_updated_at();


--
-- Name: agent_memory_versions trg_agent_memory_versions_no_mutation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_agent_memory_versions_no_mutation BEFORE DELETE OR UPDATE ON public.agent_memory_versions FOR EACH ROW EXECUTE FUNCTION public.reject_agent_memory_versions_mutation();


--
-- Name: agent_tasks trg_agent_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_agent_tasks_updated_at BEFORE UPDATE ON public.agent_tasks FOR EACH ROW EXECUTE FUNCTION public.update_agent_tasks_updated_at();


--
-- Name: agents trg_agents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_agents_updated_at BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.update_agents_updated_at();


--
-- Name: ai_provider_configs trg_ai_provider_configs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ai_provider_configs_updated_at BEFORE UPDATE ON public.ai_provider_configs FOR EACH ROW EXECUTE FUNCTION public.update_ai_provider_configs_updated_at();


--
-- Name: articles trg_articles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_articles_updated_at BEFORE INSERT OR UPDATE ON public.articles FOR EACH ROW EXECUTE FUNCTION public.update_articles_updated_at();


--
-- Name: business_branches trg_business_branches_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_business_branches_updated_at BEFORE UPDATE ON public.business_branches FOR EACH ROW EXECUTE FUNCTION public.update_business_branches_updated_at();


--
-- Name: businesses trg_businesses_cleanup_organizer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_businesses_cleanup_organizer AFTER DELETE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.cleanup_business_organizer();


--
-- Name: businesses trg_businesses_link_organizer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_businesses_link_organizer BEFORE INSERT ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.trg_link_business_organizer();


--
-- Name: businesses trg_businesses_lock_organizer_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_businesses_lock_organizer_id BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.prevent_business_organizer_id_change();


--
-- Name: businesses trg_businesses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_businesses_updated_at BEFORE INSERT OR UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.update_businesses_updated_at();


--
-- Name: ticket_orders trg_cascade_ticket_order_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cascade_ticket_order_status AFTER UPDATE OF status ON public.ticket_orders FOR EACH ROW EXECUTE FUNCTION public.cascade_ticket_order_status();


--
-- Name: channel_assets trg_channel_assets_tenant_match; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_channel_assets_tenant_match BEFORE INSERT OR UPDATE OF connected_account_id, tenant_id ON public.channel_assets FOR EACH ROW EXECUTE FUNCTION public.enforce_channel_asset_tenant_match();


--
-- Name: channel_assets trg_channel_assets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_channel_assets_updated_at BEFORE UPDATE ON public.channel_assets FOR EACH ROW EXECUTE FUNCTION public.update_channel_assets_updated_at();


--
-- Name: orders trg_cleanup_delivery_locations; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cleanup_delivery_locations AFTER UPDATE OF status ON public.orders FOR EACH ROW WHEN ((new.status = ANY (ARRAY['delivered'::text, 'completed'::text, 'cancelled'::text]))) EXECUTE FUNCTION public.cleanup_delivery_locations_on_terminal();


--
-- Name: connected_accounts trg_connected_accounts_lock_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_connected_accounts_lock_tenant BEFORE UPDATE OF tenant_id ON public.connected_accounts FOR EACH ROW EXECUTE FUNCTION public.prevent_connected_account_tenant_change();


--
-- Name: connected_accounts trg_connected_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_connected_accounts_updated_at BEFORE UPDATE ON public.connected_accounts FOR EACH ROW EXECUTE FUNCTION public.update_connected_accounts_updated_at();


--
-- Name: conversations trg_conversations_link_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_conversations_link_tenant BEFORE INSERT OR UPDATE OF channel_asset_id, customer_identity_id, tenant_id ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.enforce_conversation_link_tenant();


--
-- Name: conversations trg_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_conversations_updated_at();


--
-- Name: customer_identities trg_customer_identities_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_customer_identities_updated_at BEFORE UPDATE ON public.customer_identities FOR EACH ROW EXECUTE FUNCTION public.update_customer_identities_updated_at();


--
-- Name: orders trg_dispatch_pending_deliveries_after_courier_completion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_dispatch_pending_deliveries_after_courier_completion AFTER UPDATE OF status ON public.orders FOR EACH ROW WHEN (((old.status = ANY (ARRAY['picked_up'::text, 'out_for_delivery'::text])) AND (new.status = 'delivered'::text) AND (old.courier_worker_id IS NOT NULL))) EXECUTE FUNCTION public.dispatch_pending_deliveries_after_courier_completion();


--
-- Name: articles trg_enforce_article_status_transition; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_article_status_transition BEFORE UPDATE ON public.articles FOR EACH ROW EXECUTE FUNCTION public.enforce_article_status_transition();


--
-- Name: businesses trg_enforce_business_status_transition; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_business_status_transition BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.enforce_business_status_transition();


--
-- Name: fundraisers trg_enforce_fundraiser_status_transition; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_fundraiser_status_transition BEFORE UPDATE ON public.fundraisers FOR EACH ROW EXECUTE FUNCTION public.enforce_fundraiser_status_transition();


--
-- Name: homepage_promotions trg_enforce_homepage_promotion_moderation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_homepage_promotion_moderation BEFORE UPDATE ON public.homepage_promotions FOR EACH ROW EXECUTE FUNCTION public.enforce_homepage_promotion_moderation_fields();


--
-- Name: homepage_promotions trg_enforce_homepage_promotion_status_transition; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_homepage_promotion_status_transition BEFORE UPDATE ON public.homepage_promotions FOR EACH ROW EXECUTE FUNCTION public.enforce_homepage_promotion_status_transition();


--
-- Name: organizers trg_enforce_organizer_capability_columns; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_organizer_capability_columns BEFORE UPDATE ON public.organizers FOR EACH ROW EXECUTE FUNCTION public.enforce_organizer_capability_columns();


--
-- Name: products trg_enforce_product_status_transition; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_product_status_transition BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.enforce_product_status_transition();


--
-- Name: website_pages trg_enforce_website_page_publishing_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_website_page_publishing_guard BEFORE INSERT OR UPDATE ON public.website_pages FOR EACH ROW EXECUTE FUNCTION public.enforce_website_page_publishing_guard();


--
-- Name: event_invitation_pages trg_event_invitation_pages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_event_invitation_pages_updated_at BEFORE UPDATE ON public.event_invitation_pages FOR EACH ROW EXECUTE FUNCTION public.update_event_invitation_pages_updated_at();


--
-- Name: business_workers trg_force_inactive_worker_offline; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_force_inactive_worker_offline BEFORE UPDATE OF is_active, deactivated_at ON public.business_workers FOR EACH ROW EXECUTE FUNCTION public.sync_courier_availability_and_offer_ready_deliveries();


--
-- Name: businesses trg_guard_business_owner_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_business_owner_update BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.guard_business_owner_update();


--
-- Name: homepage_promotions trg_homepage_promotions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_homepage_promotions_updated_at BEFORE UPDATE ON public.homepage_promotions FOR EACH ROW EXECUTE FUNCTION public.update_homepage_promotions_updated_at();


--
-- Name: incidents trg_incidents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_incidents_updated_at BEFORE UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.update_incidents_updated_at();


--
-- Name: knowledge_chunks trg_knowledge_chunks_tsv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_knowledge_chunks_tsv BEFORE INSERT OR UPDATE OF content ON public.knowledge_chunks FOR EACH ROW EXECUTE FUNCTION public.knowledge_chunks_tsv_trigger();


--
-- Name: knowledge_documents trg_knowledge_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_knowledge_documents_updated_at BEFORE UPDATE ON public.knowledge_documents FOR EACH ROW EXECUTE FUNCTION public.update_knowledge_documents_updated_at();


--
-- Name: menu_items trg_menu_item_option_groups_parent_organizer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_item_option_groups_parent_organizer BEFORE UPDATE OF organizer_id ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.prevent_menu_item_option_group_tenant_change();


--
-- Name: menu_item_option_groups trg_menu_item_option_groups_tenant_limits; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_item_option_groups_tenant_limits BEFORE INSERT OR UPDATE ON public.menu_item_option_groups FOR EACH ROW EXECUTE FUNCTION public.check_menu_item_option_group_match();


--
-- Name: menu_item_option_groups trg_menu_item_option_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_item_option_groups_updated_at BEFORE UPDATE ON public.menu_item_option_groups FOR EACH ROW EXECUTE FUNCTION public.set_menu_option_group_updated_at();


--
-- Name: menu_items trg_menu_items_organizer_match; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_items_organizer_match BEFORE INSERT OR UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.check_menu_item_organizer_match();


--
-- Name: menu_items trg_menu_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_items_updated_at BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.update_menu_items_updated_at();


--
-- Name: menu_option_groups trg_menu_option_groups_organizer_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_option_groups_organizer_change BEFORE UPDATE OF organizer_id ON public.menu_option_groups FOR EACH ROW EXECUTE FUNCTION public.prevent_menu_option_group_tenant_change();


--
-- Name: menu_option_groups trg_menu_option_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_option_groups_updated_at BEFORE UPDATE ON public.menu_option_groups FOR EACH ROW EXECUTE FUNCTION public.set_menu_option_group_updated_at();


--
-- Name: menu_option_groups trg_menu_option_groups_variant_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_option_groups_variant_limit BEFORE UPDATE OF kind, min_select, max_select, is_required ON public.menu_option_groups FOR EACH ROW EXECUTE FUNCTION public.check_menu_option_group_variant_reassignment();


--
-- Name: menu_options trg_menu_options_cleanup_assignments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_options_cleanup_assignments BEFORE DELETE ON public.menu_options FOR EACH ROW EXECUTE FUNCTION public.remove_deleted_menu_option_from_assignments();


--
-- Name: menu_options trg_menu_options_organizer_match; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_options_organizer_match BEFORE INSERT OR UPDATE ON public.menu_options FOR EACH ROW EXECUTE FUNCTION public.check_menu_option_organizer_match();


--
-- Name: menu_options trg_menu_options_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_options_updated_at BEFORE UPDATE ON public.menu_options FOR EACH ROW EXECUTE FUNCTION public.set_menu_option_group_updated_at();


--
-- Name: menu_options trg_menu_options_variant_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_options_variant_default BEFORE INSERT OR UPDATE OF group_id, is_default ON public.menu_options FOR EACH ROW EXECUTE FUNCTION public.check_menu_option_variant_default();


--
-- Name: menu_sections trg_menu_sections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_sections_updated_at BEFORE UPDATE ON public.menu_sections FOR EACH ROW EXECUTE FUNCTION public.update_menu_sections_updated_at();


--
-- Name: messages trg_messages_tenant_match; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_messages_tenant_match BEFORE INSERT OR UPDATE OF conversation_id, tenant_id ON public.messages FOR EACH ROW EXECUTE FUNCTION public.enforce_message_tenant_match();


--
-- Name: messages trg_messages_touch_conversation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_messages_touch_conversation AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_last_message();


--
-- Name: notification_preferences trg_notification_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.update_notification_preferences_updated_at();


--
-- Name: orders trg_offer_ready_delivery_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_offer_ready_delivery_insert AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.offer_ready_delivery_couriers();


--
-- Name: orders trg_offer_ready_delivery_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_offer_ready_delivery_update AFTER UPDATE OF status, estimated_ready_at, fulfilment_type, courier_worker_id ON public.orders FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) OR (old.estimated_ready_at IS DISTINCT FROM new.estimated_ready_at) OR (old.fulfilment_type IS DISTINCT FROM new.fulfilment_type) OR (old.courier_worker_id IS DISTINCT FROM new.courier_worker_id))) EXECUTE FUNCTION public.offer_ready_delivery_couriers();


--
-- Name: organizers trg_organizers_lock_auto_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_organizers_lock_auto_created BEFORE UPDATE ON public.organizers FOR EACH ROW EXECUTE FUNCTION public.prevent_is_business_auto_created_change();


--
-- Name: organizers trg_organizers_seed_owner_member; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_organizers_seed_owner_member AFTER INSERT ON public.organizers FOR EACH ROW EXECUTE FUNCTION public.trg_seed_organizer_owner_member();


--
-- Name: organizers trg_organizers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_organizers_updated_at BEFORE UPDATE ON public.organizers FOR EACH ROW EXECUTE FUNCTION public.update_organizers_updated_at();


--
-- Name: payouts trg_payouts_status_transition; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payouts_status_transition BEFORE UPDATE ON public.payouts FOR EACH ROW EXECUTE FUNCTION public.enforce_payout_status_transition();


--
-- Name: event_audit_logs trg_prevent_event_audit_logs_mod; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_event_audit_logs_mod BEFORE DELETE OR UPDATE ON public.event_audit_logs FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_modification();


--
-- Name: organizer_verification_submissions trg_prevent_submission_self_approval; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_submission_self_approval BEFORE UPDATE ON public.organizer_verification_submissions FOR EACH ROW EXECUTE FUNCTION public.prevent_submission_self_approval();


--
-- Name: user_identity_verifications trg_prevent_user_identity_self_approval; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_user_identity_self_approval BEFORE UPDATE ON public.user_identity_verifications FOR EACH ROW EXECUTE FUNCTION public.prevent_user_identity_self_approval();


--
-- Name: product_orders trg_product_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_product_orders_updated_at BEFORE INSERT OR UPDATE ON public.product_orders FOR EACH ROW EXECUTE FUNCTION public.update_product_orders_updated_at();


--
-- Name: products trg_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_products_updated_at BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_products_updated_at();


--
-- Name: promo_codes trg_promo_codes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_promo_codes_updated_at BEFORE INSERT OR UPDATE ON public.promo_codes FOR EACH ROW EXECUTE FUNCTION public.update_promo_codes_updated_at();


--
-- Name: promotion_targets trg_promotion_targets_organizer_match; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_promotion_targets_organizer_match BEFORE INSERT OR UPDATE ON public.promotion_targets FOR EACH ROW EXECUTE FUNCTION public.check_menu_promotion_organizer_match();


--
-- Name: promotion_targets trg_promotion_targets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_promotion_targets_updated_at BEFORE UPDATE ON public.promotion_targets FOR EACH ROW EXECUTE FUNCTION public.set_menu_promotion_updated_at();


--
-- Name: promotions trg_promotions_organizer_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_promotions_organizer_change BEFORE UPDATE OF organizer_id ON public.promotions FOR EACH ROW EXECUTE FUNCTION public.prevent_menu_promotion_organizer_change();


--
-- Name: promotions trg_promotions_organizer_match; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_promotions_organizer_match BEFORE INSERT OR UPDATE ON public.promotions FOR EACH ROW EXECUTE FUNCTION public.check_menu_promotion_organizer_match();


--
-- Name: promotions trg_promotions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_promotions_updated_at BEFORE UPDATE ON public.promotions FOR EACH ROW EXECUTE FUNCTION public.set_menu_promotion_updated_at();


--
-- Name: recipient_ledger_entries trg_recipient_ledger_entries_no_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_recipient_ledger_entries_no_delete BEFORE DELETE ON public.recipient_ledger_entries FOR EACH ROW EXECUTE FUNCTION public.prevent_ledger_entry_mutation();


--
-- Name: recipient_ledger_entries trg_recipient_ledger_entries_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_recipient_ledger_entries_no_update BEFORE UPDATE ON public.recipient_ledger_entries FOR EACH ROW EXECUTE FUNCTION public.prevent_ledger_entry_mutation();


--
-- Name: orders trg_resolve_courier_offers_on_order_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_resolve_courier_offers_on_order_status AFTER UPDATE OF status ON public.orders FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) AND ((new.status = ANY (ARRAY['picked_up'::text, 'out_for_delivery'::text, 'cancelled'::text])) OR ((old.status = ANY (ARRAY['picked_up'::text, 'out_for_delivery'::text])) AND (new.status = 'delivered'::text))))) EXECUTE FUNCTION public.resolve_courier_offers_on_order_status();


--
-- Name: business_workers trg_revoke_business_worker_access_on_deactivation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_revoke_business_worker_access_on_deactivation AFTER UPDATE OF is_active, deactivated_at ON public.business_workers FOR EACH ROW WHEN (((old.is_active IS DISTINCT FROM new.is_active) OR (old.deactivated_at IS DISTINCT FROM new.deactivated_at))) EXECUTE FUNCTION public.revoke_business_worker_access_on_deactivation();


--
-- Name: service_tiers trg_service_tiers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_service_tiers_updated_at BEFORE UPDATE ON public.service_tiers FOR EACH ROW EXECUTE FUNCTION public.update_service_tiers_updated_at();


--
-- Name: services trg_services_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.update_services_updated_at();


--
-- Name: beneficiaries trg_set_beneficiary_slug; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_beneficiary_slug BEFORE INSERT ON public.beneficiaries FOR EACH ROW EXECUTE FUNCTION public.set_beneficiary_slug();


--
-- Name: website_content_drafts trg_set_website_content_draft_metadata; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_website_content_draft_metadata BEFORE INSERT OR UPDATE ON public.website_content_drafts FOR EACH ROW EXECUTE FUNCTION public.set_website_content_draft_metadata();


--
-- Name: website_content trg_set_website_content_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_website_content_updated_at BEFORE UPDATE ON public.website_content FOR EACH ROW EXECUTE FUNCTION public.set_website_content_updated_at();


--
-- Name: website_page_drafts trg_set_website_page_draft_metadata; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_website_page_draft_metadata BEFORE INSERT OR UPDATE ON public.website_page_drafts FOR EACH ROW EXECUTE FUNCTION public.set_website_page_draft_metadata();


--
-- Name: business_workers trg_sync_courier_offers_on_availability; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_courier_offers_on_availability AFTER UPDATE OF is_available ON public.business_workers FOR EACH ROW WHEN ((old.is_available IS DISTINCT FROM new.is_available)) EXECUTE FUNCTION public.sync_courier_availability_and_offer_ready_deliveries();


--
-- Name: website_page_drafts trg_sync_website_page_drafts_blocks_layout; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_website_page_drafts_blocks_layout BEFORE INSERT OR UPDATE ON public.website_page_drafts FOR EACH ROW EXECUTE FUNCTION public.sync_website_blocks_layout();


--
-- Name: website_pages trg_sync_website_pages_blocks_layout; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_website_pages_blocks_layout BEFORE INSERT OR UPDATE ON public.website_pages FOR EACH ROW EXECUTE FUNCTION public.sync_website_blocks_layout();


--
-- Name: tenant_websites trg_tenant_websites_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tenant_websites_updated_at BEFORE UPDATE ON public.tenant_websites FOR EACH ROW EXECUTE FUNCTION public.update_tenant_websites_updated_at();


--
-- Name: tool_definitions trg_tool_definitions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tool_definitions_updated_at BEFORE UPDATE ON public.tool_definitions FOR EACH ROW EXECUTE FUNCTION public.update_tool_definitions_updated_at();


--
-- Name: donations trg_update_fundraiser_raised; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_fundraiser_raised AFTER INSERT OR UPDATE ON public.donations FOR EACH ROW EXECUTE FUNCTION public.update_fundraiser_raised();


--
-- Name: reviews trg_update_rating_aggregates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_rating_aggregates AFTER INSERT OR DELETE OR UPDATE OF rating, is_approved, event_id, fundraiser_id, organizer_id ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.update_rating_aggregates();


--
-- Name: website_navigation trg_website_navigation_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_website_navigation_updated_at BEFORE UPDATE ON public.website_navigation FOR EACH ROW EXECUTE FUNCTION public.update_website_navigation_updated_at();


--
-- Name: website_pages trg_website_pages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_website_pages_updated_at BEFORE UPDATE ON public.website_pages FOR EACH ROW EXECUTE FUNCTION public.update_website_pages_updated_at();


--
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: -
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- Name: buckets protect_bucket_control_insert; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_bucket_control_insert BEFORE INSERT ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_bucket_control_columns('service_role');


--
-- Name: buckets protect_bucket_control_update; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_bucket_control_update BEFORE UPDATE OF lifecycle_configuration, lifecycle_configuration_generation ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_bucket_control_columns();


--
-- Name: buckets protect_bucket_control_update_role; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_bucket_control_update_role AFTER UPDATE OF lifecycle_configuration, lifecycle_configuration_generation ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_lifecycle_service_role('service_role');


--
-- Name: buckets protect_buckets_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects protect_objects_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_recovery_code_sets mfa_recovery_code_sets_mfa_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_code_sets
    ADD CONSTRAINT mfa_recovery_code_sets_mfa_factor_id_fkey FOREIGN KEY (mfa_factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_recovery_code_sets mfa_recovery_code_sets_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_code_sets
    ADD CONSTRAINT mfa_recovery_code_sets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_recovery_codes mfa_recovery_codes_mfa_recovery_code_set_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_codes
    ADD CONSTRAINT mfa_recovery_codes_mfa_recovery_code_set_id_fkey FOREIGN KEY (mfa_recovery_code_set_id) REFERENCES auth.mfa_recovery_code_sets(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: scim_tokens scim_tokens_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.scim_tokens
    ADD CONSTRAINT scim_tokens_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: scim_users scim_users_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.scim_users
    ADD CONSTRAINT scim_users_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: scim_users scim_users_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.scim_users
    ADD CONSTRAINT scim_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: webauthn_challenges webauthn_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: webauthn_credentials webauthn_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: agent_memory agent_memory_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory
    ADD CONSTRAINT agent_memory_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: agent_memory agent_memory_approval_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory
    ADD CONSTRAINT agent_memory_approval_id_fkey FOREIGN KEY (approval_id) REFERENCES public.approvals(id) ON DELETE SET NULL;


--
-- Name: agent_memory agent_memory_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory
    ADD CONSTRAINT agent_memory_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agent_memory agent_memory_proposed_by_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory
    ADD CONSTRAINT agent_memory_proposed_by_agent_id_fkey FOREIGN KEY (proposed_by_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: agent_memory agent_memory_proposed_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory
    ADD CONSTRAINT agent_memory_proposed_run_id_fkey FOREIGN KEY (proposed_run_id) REFERENCES public.agent_runs(id) ON DELETE SET NULL;


--
-- Name: agent_memory agent_memory_proposed_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory
    ADD CONSTRAINT agent_memory_proposed_task_id_fkey FOREIGN KEY (proposed_task_id) REFERENCES public.agent_tasks(id) ON DELETE SET NULL;


--
-- Name: agent_memory agent_memory_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory
    ADD CONSTRAINT agent_memory_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: agent_memory_versions agent_memory_versions_approval_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory_versions
    ADD CONSTRAINT agent_memory_versions_approval_id_fkey FOREIGN KEY (approval_id) REFERENCES public.approvals(id) ON DELETE SET NULL;


--
-- Name: agent_memory_versions agent_memory_versions_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory_versions
    ADD CONSTRAINT agent_memory_versions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agent_memory_versions agent_memory_versions_fact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory_versions
    ADD CONSTRAINT agent_memory_versions_fact_id_fkey FOREIGN KEY (fact_id) REFERENCES public.agent_memory(id) ON DELETE CASCADE;


--
-- Name: agent_memory_versions agent_memory_versions_proposed_by_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory_versions
    ADD CONSTRAINT agent_memory_versions_proposed_by_agent_id_fkey FOREIGN KEY (proposed_by_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: agent_memory_versions agent_memory_versions_proposed_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory_versions
    ADD CONSTRAINT agent_memory_versions_proposed_run_id_fkey FOREIGN KEY (proposed_run_id) REFERENCES public.agent_runs(id) ON DELETE SET NULL;


--
-- Name: agent_memory_versions agent_memory_versions_proposed_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory_versions
    ADD CONSTRAINT agent_memory_versions_proposed_task_id_fkey FOREIGN KEY (proposed_task_id) REFERENCES public.agent_tasks(id) ON DELETE SET NULL;


--
-- Name: agent_reports agent_reports_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_reports
    ADD CONSTRAINT agent_reports_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: agent_reports agent_reports_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_reports
    ADD CONSTRAINT agent_reports_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.agent_runs(id) ON DELETE SET NULL;


--
-- Name: agent_reports agent_reports_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_reports
    ADD CONSTRAINT agent_reports_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE SET NULL;


--
-- Name: agent_runs agent_runs_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: agent_runs agent_runs_approval_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_approval_id_fkey FOREIGN KEY (approval_id) REFERENCES public.approvals(id) ON DELETE SET NULL;


--
-- Name: agent_runs agent_runs_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.agent_tasks(id) ON DELETE SET NULL;


--
-- Name: agent_runs agent_runs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE SET NULL;


--
-- Name: agent_steps agent_steps_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_steps
    ADD CONSTRAINT agent_steps_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.agent_runs(id) ON DELETE CASCADE;


--
-- Name: agent_tasks agent_tasks_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: agent_tasks agent_tasks_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agent_tasks agent_tasks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE SET NULL;


--
-- Name: agent_tools agent_tools_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tools
    ADD CONSTRAINT agent_tools_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: agent_tools agent_tools_tool_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tools
    ADD CONSTRAINT agent_tools_tool_name_fkey FOREIGN KEY (tool_name) REFERENCES public.tool_definitions(name) ON DELETE CASCADE;


--
-- Name: agent_versions agent_versions_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_versions
    ADD CONSTRAINT agent_versions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: agent_versions agent_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_versions
    ADD CONSTRAINT agent_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agents agents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: ai_conversations ai_conversations_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: ai_guard_rejections ai_guard_rejections_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_guard_rejections
    ADD CONSTRAINT ai_guard_rejections_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE SET NULL;


--
-- Name: ai_knowledge_docs ai_knowledge_docs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_knowledge_docs
    ADD CONSTRAINT ai_knowledge_docs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: ai_messages ai_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id) ON DELETE CASCADE;


--
-- Name: ai_provider_configs ai_provider_configs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_provider_configs
    ADD CONSTRAINT ai_provider_configs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: ai_tool_invocations ai_tool_invocations_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_tool_invocations
    ADD CONSTRAINT ai_tool_invocations_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: ai_tool_invocations ai_tool_invocations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_tool_invocations
    ADD CONSTRAINT ai_tool_invocations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: approvals approvals_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: approvals approvals_requested_by_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_requested_by_agent_id_fkey FOREIGN KEY (requested_by_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: approvals approvals_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: approvals approvals_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE SET NULL;


--
-- Name: article_audios article_audios_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_audios
    ADD CONSTRAINT article_audios_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.articles(id) ON DELETE CASCADE;


--
-- Name: articles articles_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE SET NULL;


--
-- Name: articles articles_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE SET NULL;


--
-- Name: articles articles_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: beneficiaries beneficiaries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beneficiaries
    ADD CONSTRAINT beneficiaries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: business_branches business_branches_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_branches
    ADD CONSTRAINT business_branches_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: business_courier_offers business_courier_offers_order_business_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_courier_offers
    ADD CONSTRAINT business_courier_offers_order_business_fk FOREIGN KEY (order_id, business_id) REFERENCES public.orders(id, business_id) ON DELETE CASCADE;


--
-- Name: business_courier_offers business_courier_offers_worker_business_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_courier_offers
    ADD CONSTRAINT business_courier_offers_worker_business_fk FOREIGN KEY (courier_worker_id, business_id) REFERENCES public.business_workers(id, business_id) ON DELETE CASCADE;


--
-- Name: business_kitchen_display_links business_kitchen_display_links_kitchen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_kitchen_display_links
    ADD CONSTRAINT business_kitchen_display_links_kitchen_id_fkey FOREIGN KEY (kitchen_id) REFERENCES public.business_kitchens(id) ON DELETE CASCADE;


--
-- Name: business_kitchens business_kitchens_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_kitchens
    ADD CONSTRAINT business_kitchens_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: business_moderation_events business_moderation_events_actor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_moderation_events
    ADD CONSTRAINT business_moderation_events_actor_fkey FOREIGN KEY (actor) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: business_moderation_events business_moderation_events_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_moderation_events
    ADD CONSTRAINT business_moderation_events_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: business_worker_invitations business_worker_invitations_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_worker_invitations
    ADD CONSTRAINT business_worker_invitations_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.business_workers(id) ON DELETE CASCADE;


--
-- Name: business_worker_sessions business_worker_sessions_invitation_worker_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_worker_sessions
    ADD CONSTRAINT business_worker_sessions_invitation_worker_fk FOREIGN KEY (invitation_id, worker_id) REFERENCES public.business_worker_invitations(id, worker_id) ON DELETE CASCADE;


--
-- Name: business_workers business_workers_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_workers
    ADD CONSTRAINT business_workers_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: business_workers business_workers_kitchen_business_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_workers
    ADD CONSTRAINT business_workers_kitchen_business_fk FOREIGN KEY (kitchen_id, business_id) REFERENCES public.business_kitchens(id, business_id) ON DELETE CASCADE;


--
-- Name: businesses businesses_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE SET NULL;


--
-- Name: businesses businesses_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: channel_assets channel_assets_connected_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_assets
    ADD CONSTRAINT channel_assets_connected_account_id_fkey FOREIGN KEY (connected_account_id) REFERENCES public.connected_accounts(id) ON DELETE CASCADE;


--
-- Name: channel_assets channel_assets_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_assets
    ADD CONSTRAINT channel_assets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: comment_likes comment_likes_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: comments comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: connected_accounts connected_accounts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connected_accounts
    ADD CONSTRAINT connected_accounts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_channel_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_channel_asset_id_fkey FOREIGN KEY (channel_asset_id) REFERENCES public.channel_assets(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_customer_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_customer_identity_id_fkey FOREIGN KEY (customer_identity_id) REFERENCES public.customer_identities(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: customer_identities customer_identities_aldriva_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_identities
    ADD CONSTRAINT customer_identities_aldriva_user_id_fkey FOREIGN KEY (aldriva_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: customer_identities customer_identities_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_identities
    ADD CONSTRAINT customer_identities_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: donations donations_fundraiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.donations
    ADD CONSTRAINT donations_fundraiser_id_fkey FOREIGN KEY (fundraiser_id) REFERENCES public.fundraisers(id);


--
-- Name: donations donations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.donations
    ADD CONSTRAINT donations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: entity_members entity_members_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_members
    ADD CONSTRAINT entity_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: entity_members entity_members_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_members
    ADD CONSTRAINT entity_members_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: entity_members entity_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_members
    ADD CONSTRAINT entity_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_audit_logs event_audit_logs_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_audit_logs
    ADD CONSTRAINT event_audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: event_audit_logs event_audit_logs_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_audit_logs
    ADD CONSTRAINT event_audit_logs_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_invitation_pages event_invitation_pages_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invitation_pages
    ADD CONSTRAINT event_invitation_pages_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_invitations event_invitations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invitations
    ADD CONSTRAINT event_invitations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: event_invitations event_invitations_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invitations
    ADD CONSTRAINT event_invitations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_memories event_memories_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_memories
    ADD CONSTRAINT event_memories_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_memories event_memories_moderated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_memories
    ADD CONSTRAINT event_memories_moderated_by_fkey FOREIGN KEY (moderated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: event_memories event_memories_settings_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_memories
    ADD CONSTRAINT event_memories_settings_id_fkey FOREIGN KEY (settings_id) REFERENCES public.event_memory_settings(id) ON DELETE SET NULL;


--
-- Name: event_memory_reports event_memory_reports_memory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_memory_reports
    ADD CONSTRAINT event_memory_reports_memory_id_fkey FOREIGN KEY (memory_id) REFERENCES public.event_memories(id) ON DELETE CASCADE;


--
-- Name: event_memory_retention_notices event_memory_retention_notices_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_memory_retention_notices
    ADD CONSTRAINT event_memory_retention_notices_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_memory_settings event_memory_settings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_memory_settings
    ADD CONSTRAINT event_memory_settings_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: event_memory_settings event_memory_settings_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_memory_settings
    ADD CONSTRAINT event_memory_settings_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_staff_checkins event_staff_checkins_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_staff_checkins
    ADD CONSTRAINT event_staff_checkins_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_staff_checkins event_staff_checkins_scanned_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_staff_checkins
    ADD CONSTRAINT event_staff_checkins_scanned_by_user_id_fkey FOREIGN KEY (scanned_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: event_staff_checkins event_staff_checkins_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_staff_checkins
    ADD CONSTRAINT event_staff_checkins_staff_member_id_fkey FOREIGN KEY (staff_member_id) REFERENCES public.event_team_members(id) ON DELETE SET NULL;


--
-- Name: event_team_invitations event_team_invitations_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_team_invitations
    ADD CONSTRAINT event_team_invitations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_team_invitations event_team_invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_team_invitations
    ADD CONSTRAINT event_team_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: event_team_members event_team_members_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_team_members
    ADD CONSTRAINT event_team_members_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_team_members event_team_members_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_team_members
    ADD CONSTRAINT event_team_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: event_team_members event_team_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_team_members
    ADD CONSTRAINT event_team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: eventbrite_sources eventbrite_sources_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventbrite_sources
    ADD CONSTRAINT eventbrite_sources_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE SET NULL;


--
-- Name: eventbrite_sources eventbrite_sources_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventbrite_sources
    ADD CONSTRAINT eventbrite_sources_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: events events_invitation_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_invitation_template_id_fkey FOREIGN KEY (invitation_template_id) REFERENCES public.invitation_templates(id) ON DELETE SET NULL;


--
-- Name: events events_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id);


--
-- Name: events events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: follows follows_follower_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: follows follows_following_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_following_id_fkey FOREIGN KEY (following_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: fundraiser_media fundraiser_media_fundraiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fundraiser_media
    ADD CONSTRAINT fundraiser_media_fundraiser_id_fkey FOREIGN KEY (fundraiser_id) REFERENCES public.fundraisers(id) ON DELETE CASCADE;


--
-- Name: fundraiser_updates fundraiser_updates_fundraiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fundraiser_updates
    ADD CONSTRAINT fundraiser_updates_fundraiser_id_fkey FOREIGN KEY (fundraiser_id) REFERENCES public.fundraisers(id) ON DELETE CASCADE;


--
-- Name: fundraiser_updates fundraiser_updates_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fundraiser_updates
    ADD CONSTRAINT fundraiser_updates_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: fundraisers fundraisers_beneficiary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fundraisers
    ADD CONSTRAINT fundraisers_beneficiary_id_fkey FOREIGN KEY (beneficiary_id) REFERENCES public.beneficiaries(id) ON DELETE SET NULL;


--
-- Name: fundraisers fundraisers_gofundme_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fundraisers
    ADD CONSTRAINT fundraisers_gofundme_source_id_fkey FOREIGN KEY (gofundme_source_id) REFERENCES public.gofundme_sources(id) ON DELETE SET NULL;


--
-- Name: fundraisers fundraisers_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fundraisers
    ADD CONSTRAINT fundraisers_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE SET NULL;


--
-- Name: fundraisers fundraisers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fundraisers
    ADD CONSTRAINT fundraisers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: gofundme_sources gofundme_sources_fundraiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gofundme_sources
    ADD CONSTRAINT gofundme_sources_fundraiser_id_fkey FOREIGN KEY (fundraiser_id) REFERENCES public.fundraisers(id) ON DELETE SET NULL;


--
-- Name: gofundme_sources gofundme_sources_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gofundme_sources
    ADD CONSTRAINT gofundme_sources_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: guest_import_batches guest_import_batches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_import_batches
    ADD CONSTRAINT guest_import_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: guest_import_batches guest_import_batches_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_import_batches
    ADD CONSTRAINT guest_import_batches_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: guest_import_rows guest_import_rows_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_import_rows
    ADD CONSTRAINT guest_import_rows_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.guest_import_batches(id) ON DELETE CASCADE;


--
-- Name: guest_import_rows guest_import_rows_created_invitation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_import_rows
    ADD CONSTRAINT guest_import_rows_created_invitation_id_fkey FOREIGN KEY (created_invitation_id) REFERENCES public.event_invitations(id) ON DELETE SET NULL;


--
-- Name: guest_import_rows guest_import_rows_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_import_rows
    ADD CONSTRAINT guest_import_rows_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: guest_import_rows guest_import_rows_resolved_seat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_import_rows
    ADD CONSTRAINT guest_import_rows_resolved_seat_id_fkey FOREIGN KEY (resolved_seat_id) REFERENCES public.seats(id) ON DELETE SET NULL;


--
-- Name: guest_import_rows guest_import_rows_resolved_ticket_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_import_rows
    ADD CONSTRAINT guest_import_rows_resolved_ticket_type_id_fkey FOREIGN KEY (resolved_ticket_type_id) REFERENCES public.tickets(id) ON DELETE SET NULL;


--
-- Name: homepage_promotions homepage_promotions_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_promotions
    ADD CONSTRAINT homepage_promotions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: homepage_promotions homepage_promotions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_promotions
    ADD CONSTRAINT homepage_promotions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: incident_events incident_events_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_events
    ADD CONSTRAINT incident_events_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.system_events(id) ON DELETE CASCADE;


--
-- Name: incident_events incident_events_incident_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_events
    ADD CONSTRAINT incident_events_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.incidents(id) ON DELETE CASCADE;


--
-- Name: incidents incidents_agent_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_agent_run_id_fkey FOREIGN KEY (agent_run_id) REFERENCES public.agent_runs(id) ON DELETE SET NULL;


--
-- Name: incidents incidents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE SET NULL;


--
-- Name: invitation_page_preview_tokens invitation_page_preview_tokens_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_page_preview_tokens
    ADD CONSTRAINT invitation_page_preview_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invitation_page_preview_tokens invitation_page_preview_tokens_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_page_preview_tokens
    ADD CONSTRAINT invitation_page_preview_tokens_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: knowledge_chunks knowledge_chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: knowledge_chunks knowledge_chunks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: knowledge_document_versions knowledge_document_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_document_versions
    ADD CONSTRAINT knowledge_document_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: knowledge_document_versions knowledge_document_versions_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_document_versions
    ADD CONSTRAINT knowledge_document_versions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: knowledge_documents knowledge_documents_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: knowledge_documents knowledge_documents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: knowledge_documents knowledge_documents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: media media_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: media media_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: media media_uploader_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_uploader_user_id_fkey FOREIGN KEY (uploader_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: menu_item_option_groups menu_item_option_groups_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_option_groups
    ADD CONSTRAINT menu_item_option_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.menu_option_groups(id) ON DELETE CASCADE;


--
-- Name: menu_item_option_groups menu_item_option_groups_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_option_groups
    ADD CONSTRAINT menu_item_option_groups_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: menu_item_option_groups menu_item_option_groups_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_option_groups
    ADD CONSTRAINT menu_item_option_groups_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: menu_items menu_items_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: menu_items menu_items_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.menu_sections(id) ON DELETE CASCADE;


--
-- Name: menu_option_groups menu_option_groups_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_option_groups
    ADD CONSTRAINT menu_option_groups_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: menu_options menu_options_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_options
    ADD CONSTRAINT menu_options_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.menu_option_groups(id) ON DELETE CASCADE;


--
-- Name: menu_options menu_options_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_options
    ADD CONSTRAINT menu_options_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: menu_sections menu_sections_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_sections
    ADD CONSTRAINT menu_sections_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: offline_scan_conflicts offline_scan_conflicts_delegating_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_scan_conflicts
    ADD CONSTRAINT offline_scan_conflicts_delegating_user_id_fkey FOREIGN KEY (delegating_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: offline_scan_conflicts offline_scan_conflicts_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_scan_conflicts
    ADD CONSTRAINT offline_scan_conflicts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: offline_scan_conflicts offline_scan_conflicts_scanned_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_scan_conflicts
    ADD CONSTRAINT offline_scan_conflicts_scanned_by_user_id_fkey FOREIGN KEY (scanned_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: offline_scan_conflicts offline_scan_conflicts_ticket_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_scan_conflicts
    ADD CONSTRAINT offline_scan_conflicts_ticket_instance_id_fkey FOREIGN KEY (ticket_instance_id) REFERENCES public.ticket_instances(id) ON DELETE CASCADE;


--
-- Name: offline_scan_conflicts offline_scan_conflicts_ticket_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_scan_conflicts
    ADD CONSTRAINT offline_scan_conflicts_ticket_order_id_fkey FOREIGN KEY (ticket_order_id) REFERENCES public.ticket_orders(id) ON DELETE CASCADE;


--
-- Name: offline_scan_conflicts offline_scan_conflicts_winning_checkin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_scan_conflicts
    ADD CONSTRAINT offline_scan_conflicts_winning_checkin_id_fkey FOREIGN KEY (winning_checkin_id) REFERENCES public.ticket_checkins(id) ON DELETE SET NULL;


--
-- Name: order_delivery_locations order_delivery_locations_courier_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_delivery_locations
    ADD CONSTRAINT order_delivery_locations_courier_worker_id_fkey FOREIGN KEY (courier_worker_id) REFERENCES public.business_workers(id) ON DELETE CASCADE;


--
-- Name: order_delivery_locations order_delivery_locations_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_delivery_locations
    ADD CONSTRAINT order_delivery_locations_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE SET NULL;


--
-- Name: orders orders_courier_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_courier_worker_id_fkey FOREIGN KEY (courier_worker_id) REFERENCES public.business_workers(id) ON DELETE SET NULL;


--
-- Name: orders orders_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: orders orders_website_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_website_id_fkey FOREIGN KEY (website_id) REFERENCES public.tenant_websites(id) ON DELETE SET NULL;


--
-- Name: organizer_follows organizer_follows_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_follows
    ADD CONSTRAINT organizer_follows_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: organizer_follows organizer_follows_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_follows
    ADD CONSTRAINT organizer_follows_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: organizer_status_audit organizer_status_audit_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_status_audit
    ADD CONSTRAINT organizer_status_audit_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES auth.users(id);


--
-- Name: organizer_status_audit organizer_status_audit_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_status_audit
    ADD CONSTRAINT organizer_status_audit_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: organizer_verification_submissions organizer_verification_submissions_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_verification_submissions
    ADD CONSTRAINT organizer_verification_submissions_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: organizer_verification_submissions organizer_verification_submissions_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_verification_submissions
    ADD CONSTRAINT organizer_verification_submissions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- Name: organizer_visibility_audit organizer_visibility_audit_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_visibility_audit
    ADD CONSTRAINT organizer_visibility_audit_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: organizer_visibility_audit organizer_visibility_audit_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizer_visibility_audit
    ADD CONSTRAINT organizer_visibility_audit_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: organizers organizers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizers
    ADD CONSTRAINT organizers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: payouts payouts_processed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: payouts payouts_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.recipients(id) ON DELETE RESTRICT;


--
-- Name: payouts payouts_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: platform_settings platform_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: product_assets product_assets_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_assets
    ADD CONSTRAINT product_assets_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_downloads product_downloads_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_downloads
    ADD CONSTRAINT product_downloads_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.product_assets(id) ON DELETE SET NULL;


--
-- Name: product_downloads product_downloads_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_downloads
    ADD CONSTRAINT product_downloads_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: product_downloads product_downloads_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_downloads
    ADD CONSTRAINT product_downloads_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.product_orders(id) ON DELETE SET NULL;


--
-- Name: product_downloads product_downloads_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_downloads
    ADD CONSTRAINT product_downloads_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_orders product_orders_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_orders
    ADD CONSTRAINT product_orders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: product_orders product_orders_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_orders
    ADD CONSTRAINT product_orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: products products_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE SET NULL;


--
-- Name: products products_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profile_verification_audit profile_verification_audit_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_verification_audit
    ADD CONSTRAINT profile_verification_audit_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profile_verification_audit profile_verification_audit_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_verification_audit
    ADD CONSTRAINT profile_verification_audit_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: promo_codes promo_codes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: promotion_targets promotion_targets_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_targets
    ADD CONSTRAINT promotion_targets_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: promotion_targets promotion_targets_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_targets
    ADD CONSTRAINT promotion_targets_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: promotion_targets promotion_targets_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_targets
    ADD CONSTRAINT promotion_targets_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE CASCADE;


--
-- Name: promotion_targets promotion_targets_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_targets
    ADD CONSTRAINT promotion_targets_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.menu_sections(id) ON DELETE CASCADE;


--
-- Name: promotions promotions_destination_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_destination_item_id_fkey FOREIGN KEY (destination_item_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;


--
-- Name: promotions promotions_destination_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_destination_section_id_fkey FOREIGN KEY (destination_section_id) REFERENCES public.menu_sections(id) ON DELETE SET NULL;


--
-- Name: promotions promotions_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: public_media_upload_daily_quota public_media_upload_daily_quota_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_media_upload_daily_quota
    ADD CONSTRAINT public_media_upload_daily_quota_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: qa_runs qa_runs_approval_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_runs
    ADD CONSTRAINT qa_runs_approval_id_fkey FOREIGN KEY (approval_id) REFERENCES public.approvals(id) ON DELETE SET NULL;


--
-- Name: qa_runs qa_runs_requested_by_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_runs
    ADD CONSTRAINT qa_runs_requested_by_agent_id_fkey FOREIGN KEY (requested_by_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: qa_runs qa_runs_target_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_runs
    ADD CONSTRAINT qa_runs_target_tenant_id_fkey FOREIGN KEY (target_tenant_id) REFERENCES public.organizers(id) ON DELETE SET NULL;


--
-- Name: qa_test_results qa_test_results_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_test_results
    ADD CONSTRAINT qa_test_results_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.qa_runs(id) ON DELETE CASCADE;


--
-- Name: recipient_ledger_entries recipient_ledger_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipient_ledger_entries
    ADD CONSTRAINT recipient_ledger_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: recipient_ledger_entries recipient_ledger_entries_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipient_ledger_entries
    ADD CONSTRAINT recipient_ledger_entries_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.recipients(id) ON DELETE RESTRICT;


--
-- Name: recipients recipients_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipients
    ADD CONSTRAINT recipients_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: recipients recipients_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipients
    ADD CONSTRAINT recipients_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE RESTRICT;


--
-- Name: recipients recipients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipients
    ADD CONSTRAINT recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: reservations reservations_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE SET NULL;


--
-- Name: reservations reservations_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: reservations reservations_website_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_website_id_fkey FOREIGN KEY (website_id) REFERENCES public.tenant_websites(id) ON DELETE SET NULL;


--
-- Name: reviews reviews_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_fundraiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_fundraiser_id_fkey FOREIGN KEY (fundraiser_id) REFERENCES public.fundraisers(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: seats seats_assigned_invitation_event_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seats
    ADD CONSTRAINT seats_assigned_invitation_event_fkey FOREIGN KEY (assigned_invitation_id, event_id) REFERENCES public.event_invitations(id, event_id) ON DELETE SET NULL;


--
-- Name: seats seats_assigned_invitation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seats
    ADD CONSTRAINT seats_assigned_invitation_id_fkey FOREIGN KEY (assigned_invitation_id) REFERENCES public.event_invitations(id) ON DELETE SET NULL;


--
-- Name: seats seats_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seats
    ADD CONSTRAINT seats_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: seats seats_layout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seats
    ADD CONSTRAINT seats_layout_id_fkey FOREIGN KEY (layout_id) REFERENCES public.venue_layouts(id) ON DELETE CASCADE;


--
-- Name: seats seats_ticket_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seats
    ADD CONSTRAINT seats_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.tickets(id) ON DELETE SET NULL;


--
-- Name: service_tiers service_tiers_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_tiers
    ADD CONSTRAINT service_tiers_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: services services_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: studio_chat_conversations studio_chat_conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_chat_conversations
    ADD CONSTRAINT studio_chat_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: studio_chat_messages studio_chat_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_chat_messages
    ADD CONSTRAINT studio_chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.studio_chat_conversations(id) ON DELETE CASCADE;


--
-- Name: system_events system_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_events
    ADD CONSTRAINT system_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: system_events system_events_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_events
    ADD CONSTRAINT system_events_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: system_events system_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_events
    ADD CONSTRAINT system_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE SET NULL;


--
-- Name: tenant_websites tenant_websites_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_websites
    ADD CONSTRAINT tenant_websites_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.organizers(id) ON DELETE CASCADE;


--
-- Name: ticket_checkins ticket_checkins_delegating_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_checkins
    ADD CONSTRAINT ticket_checkins_delegating_user_id_fkey FOREIGN KEY (delegating_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: ticket_checkins ticket_checkins_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_checkins
    ADD CONSTRAINT ticket_checkins_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: ticket_checkins ticket_checkins_scanned_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_checkins
    ADD CONSTRAINT ticket_checkins_scanned_by_user_id_fkey FOREIGN KEY (scanned_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: ticket_checkins ticket_checkins_ticket_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_checkins
    ADD CONSTRAINT ticket_checkins_ticket_instance_id_fkey FOREIGN KEY (ticket_instance_id) REFERENCES public.ticket_instances(id) ON DELETE CASCADE;


--
-- Name: ticket_checkins ticket_checkins_ticket_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_checkins
    ADD CONSTRAINT ticket_checkins_ticket_order_id_fkey FOREIGN KEY (ticket_order_id) REFERENCES public.ticket_orders(id) ON DELETE CASCADE;


--
-- Name: ticket_instances ticket_instances_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_instances
    ADD CONSTRAINT ticket_instances_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: ticket_instances ticket_instances_invitation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_instances
    ADD CONSTRAINT ticket_instances_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES public.event_invitations(id) ON DELETE CASCADE;


--
-- Name: ticket_instances ticket_instances_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_instances
    ADD CONSTRAINT ticket_instances_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.ticket_orders(id) ON DELETE CASCADE;


--
-- Name: ticket_instances ticket_instances_seat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_instances
    ADD CONSTRAINT ticket_instances_seat_id_fkey FOREIGN KEY (seat_id) REFERENCES public.seats(id);


--
-- Name: ticket_instances ticket_instances_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_instances
    ADD CONSTRAINT ticket_instances_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id);


--
-- Name: ticket_orders ticket_orders_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_orders
    ADD CONSTRAINT ticket_orders_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: ticket_orders ticket_orders_seat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_orders
    ADD CONSTRAINT ticket_orders_seat_id_fkey FOREIGN KEY (seat_id) REFERENCES public.seats(id);


--
-- Name: tickets tickets_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id);


--
-- Name: user_identity_verifications user_identity_verifications_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_identity_verifications
    ADD CONSTRAINT user_identity_verifications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_identity_verifications user_identity_verifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_identity_verifications
    ADD CONSTRAINT user_identity_verifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: venue_layouts venue_layouts_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_layouts
    ADD CONSTRAINT venue_layouts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: website_content_drafts website_content_drafts_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_content_drafts
    ADD CONSTRAINT website_content_drafts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: website_content_drafts website_content_drafts_website_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_content_drafts
    ADD CONSTRAINT website_content_drafts_website_id_fkey FOREIGN KEY (website_id) REFERENCES public.tenant_websites(id) ON DELETE CASCADE;


--
-- Name: website_content website_content_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_content
    ADD CONSTRAINT website_content_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: website_content website_content_website_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_content
    ADD CONSTRAINT website_content_website_id_fkey FOREIGN KEY (website_id) REFERENCES public.tenant_websites(id) ON DELETE CASCADE;


--
-- Name: website_navigation website_navigation_website_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_navigation
    ADD CONSTRAINT website_navigation_website_id_fkey FOREIGN KEY (website_id) REFERENCES public.tenant_websites(id) ON DELETE CASCADE;


--
-- Name: website_page_drafts website_page_drafts_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_page_drafts
    ADD CONSTRAINT website_page_drafts_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.website_pages(id) ON DELETE CASCADE;


--
-- Name: website_page_drafts website_page_drafts_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_page_drafts
    ADD CONSTRAINT website_page_drafts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: website_pages website_pages_website_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_pages
    ADD CONSTRAINT website_pages_website_id_fkey FOREIGN KEY (website_id) REFERENCES public.tenant_websites(id) ON DELETE CASCADE;


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- Name: vector_indexes vector_indexes_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: businesses Active authenticated users can create businesses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active authenticated users can create businesses" ON public.businesses FOR INSERT WITH CHECK (((auth.uid() = owner_id) AND (status = 'pending_review'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.status = 'active'::text))))));


--
-- Name: products Active authenticated users can create products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active authenticated users can create products" ON public.products FOR INSERT WITH CHECK (((auth.uid() = owner_id) AND (status = 'pending_review'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.status = 'active'::text)))) AND ((business_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.businesses
  WHERE ((businesses.id = products.business_id) AND (businesses.owner_id = auth.uid())))))));


--
-- Name: invitation_templates Active invitation templates are readable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active invitation templates are readable by everyone" ON public.invitation_templates FOR SELECT USING (((is_active = true) OR ((auth.uid() IS NOT NULL) AND (( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text))));


--
-- Name: articles Active users can create their own articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active users can create their own articles" ON public.articles FOR INSERT WITH CHECK (((auth.uid() = owner_id) AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'scheduled'::text])) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.status = 'active'::text)))) AND ((organizer_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = articles.organizer_id) AND (organizers.user_id = auth.uid())))) OR public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]))));


--
-- Name: knowledge_documents Admins and owners can read all knowledge; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and owners can read all knowledge" ON public.knowledge_documents FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: knowledge_chunks Admins and scoped readers can read approved chunks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and scoped readers can read approved chunks" ON public.knowledge_chunks FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))) OR (((tenant_id IS NULL) OR (tenant_id IN ( SELECT entity_members.organizer_id
   FROM public.entity_members
  WHERE (entity_members.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.knowledge_documents d
  WHERE ((d.id = knowledge_chunks.document_id) AND (d.status = 'approved'::text)))))));


--
-- Name: knowledge_document_versions Admins and scoped readers can read knowledge versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and scoped readers can read knowledge versions" ON public.knowledge_document_versions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.knowledge_documents d
  WHERE ((d.id = knowledge_document_versions.document_id) AND (((d.status = 'approved'::text) AND ((d.tenant_id IS NULL) OR (d.tenant_id IN ( SELECT entity_members.organizer_id
           FROM public.entity_members
          WHERE (entity_members.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: agent_reports Admins and tenant members can read agent reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and tenant members can read agent reports" ON public.agent_reports FOR SELECT USING ((((tenant_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))) OR ((tenant_id IS NOT NULL) AND public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text])) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: agent_runs Admins and tenant members can read agent runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and tenant members can read agent runs" ON public.agent_runs FOR SELECT USING ((((tenant_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))) OR ((tenant_id IS NOT NULL) AND public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text])) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: agent_steps Admins and tenant members can read agent steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and tenant members can read agent steps" ON public.agent_steps FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.agent_runs r
  WHERE ((r.id = agent_steps.run_id) AND (((r.tenant_id IS NULL) AND (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))) OR ((r.tenant_id IS NOT NULL) AND public.is_entity_member(r.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text])) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: agent_tasks Admins and tenant members can read agent tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and tenant members can read agent tasks" ON public.agent_tasks FOR SELECT USING ((((tenant_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))) OR ((tenant_id IS NOT NULL) AND public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text])) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: approvals Admins and tenant members can read approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and tenant members can read approvals" ON public.approvals FOR SELECT USING ((((tenant_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))) OR ((tenant_id IS NOT NULL) AND public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text])) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: ai_content_calendar Admins can delete ai_content_calendar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete ai_content_calendar" ON public.ai_content_calendar FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: ai_content_items Admins can delete ai_content_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete ai_content_items" ON public.ai_content_items FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: ai_knowledge_docs Admins can delete ai_knowledge_docs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete ai_knowledge_docs" ON public.ai_knowledge_docs FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: businesses Admins can delete any business; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete any business" ON public.businesses FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: products Admins can delete any product; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete any product" ON public.products FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: invitation_templates Admins can delete invitation templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete invitation templates" ON public.invitation_templates FOR DELETE USING (((auth.uid() IS NOT NULL) AND (( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));


--
-- Name: ai_content_calendar Admins can insert ai_content_calendar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert ai_content_calendar" ON public.ai_content_calendar FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: ai_content_items Admins can insert ai_content_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert ai_content_items" ON public.ai_content_items FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: ai_conversations Admins can insert ai_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert ai_conversations" ON public.ai_conversations FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: ai_guard_rejections Admins can insert ai_guard_rejections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert ai_guard_rejections" ON public.ai_guard_rejections FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: ai_knowledge_docs Admins can insert ai_knowledge_docs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert ai_knowledge_docs" ON public.ai_knowledge_docs FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: ai_messages Admins can insert ai_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert ai_messages" ON public.ai_messages FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: invitation_templates Admins can insert invitation templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert invitation templates" ON public.invitation_templates FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));


--
-- Name: articles Admins can manage all articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all articles" ON public.articles USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: homepage_promotions Admins can manage all promotions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all promotions" ON public.homepage_promotions TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: reviews Admins can manage all reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all reviews" ON public.reviews USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: comments Admins can manage comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage comments" ON public.comments USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: agent_tools Admins can read agent tools; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read agent tools" ON public.agent_tools FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: agent_versions Admins can read agent versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read agent versions" ON public.agent_versions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: agents Admins can read agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read agents" ON public.agents FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: articles Admins can read all articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all articles" ON public.articles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: events Admins can read all events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all events" ON public.events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: fundraisers Admins can read all fundraisers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all fundraisers" ON public.fundraisers FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: organizers Admins can read all organizers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all organizers" ON public.organizers FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: donations Admins can read donations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read donations" ON public.donations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: qa_runs Admins can read qa runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read qa runs" ON public.qa_runs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: qa_test_results Admins can read qa test results; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read qa test results" ON public.qa_test_results FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))) AND (EXISTS ( SELECT 1
   FROM public.qa_runs q
  WHERE (q.id = qa_test_results.run_id)))));


--
-- Name: tool_definitions Admins can read tool definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read tool definitions" ON public.tool_definitions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: ai_content_calendar Admins can update ai_content_calendar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update ai_content_calendar" ON public.ai_content_calendar FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: ai_content_items Admins can update ai_content_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update ai_content_items" ON public.ai_content_items FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: ai_conversations Admins can update ai_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update ai_conversations" ON public.ai_conversations FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: ai_knowledge_docs Admins can update ai_knowledge_docs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update ai_knowledge_docs" ON public.ai_knowledge_docs FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: businesses Admins can update any business; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update any business" ON public.businesses FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: products Admins can update any product; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update any product" ON public.products FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: product_orders Admins can update any product order; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update any product order" ON public.product_orders FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: invitation_templates Admins can update invitation templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update invitation templates" ON public.invitation_templates FOR UPDATE USING (((auth.uid() IS NOT NULL) AND (( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text))) WITH CHECK (((auth.uid() IS NOT NULL) AND (( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));


--
-- Name: payment_reconciliation_failures Admins can update reconciliation failures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update reconciliation failures" ON public.payment_reconciliation_failures FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: ai_content_calendar Admins can view ai_content_calendar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view ai_content_calendar" ON public.ai_content_calendar FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: ai_content_items Admins can view ai_content_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view ai_content_items" ON public.ai_content_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: ai_conversations Admins can view ai_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view ai_conversations" ON public.ai_conversations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: ai_knowledge_docs Admins can view ai_knowledge_docs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view ai_knowledge_docs" ON public.ai_knowledge_docs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: ai_messages Admins can view ai_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view ai_messages" ON public.ai_messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: businesses Admins can view all businesses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all businesses" ON public.businesses FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: product_assets Admins can view all product assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all product assets" ON public.product_assets FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: product_downloads Admins can view all product downloads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all product downloads" ON public.product_downloads FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: product_orders Admins can view all product orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all product orders" ON public.product_orders FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: products Admins can view all products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all products" ON public.products FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: homepage_promotions Admins can view all promotions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all promotions" ON public.homepage_promotions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: organizer_verification_submissions Admins can view all verification submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all verification submissions" ON public.organizer_verification_submissions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: organizer_visibility_audit Admins can view audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view audit logs" ON public.organizer_visibility_audit FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: business_moderation_events Admins can view moderation events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view moderation events" ON public.business_moderation_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: organizer_status_audit Admins can view organizer status audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view organizer status audit logs" ON public.organizer_status_audit FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: profile_verification_audit Admins can view profile verification audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view profile verification audit logs" ON public.profile_verification_audit FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: payment_reconciliation_failures Admins can view reconciliation failures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view reconciliation failures" ON public.payment_reconciliation_failures FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))));


--
-- Name: homepage_categories Allow public read access to homepage_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access to homepage_categories" ON public.homepage_categories FOR SELECT USING (true);


--
-- Name: comments Approved comments are publicly readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved comments are publicly readable" ON public.comments FOR SELECT USING (((status)::text = 'approved'::text));


--
-- Name: events Approved public events are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved public events are readable" ON public.events FOR SELECT USING (((status = 'approved'::text) AND (visibility = 'public'::text) AND (deleted_at IS NULL)));


--
-- Name: articles Article owners can delete draft articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Article owners can delete draft articles" ON public.articles FOR DELETE USING (((status = 'draft'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.status = 'active'::text)))) AND ((auth.uid() = owner_id) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = articles.organizer_id) AND (organizers.user_id = auth.uid())))) OR public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))));


--
-- Name: articles Article owners can read their articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Article owners can read their articles" ON public.articles FOR SELECT USING (((auth.uid() = owner_id) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = articles.organizer_id) AND (organizers.user_id = auth.uid())))) OR public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text])));


--
-- Name: articles Article owners can update their articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Article owners can update their articles" ON public.articles FOR UPDATE USING (((auth.uid() = owner_id) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = articles.organizer_id) AND (organizers.user_id = auth.uid())))) OR public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.status = 'active'::text)))) AND (((auth.uid() = owner_id) AND ((organizer_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = articles.organizer_id) AND (organizers.user_id = auth.uid())))) OR public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]))) OR public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]))));


--
-- Name: knowledge_documents Authenticated can read approved knowledge; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can read approved knowledge" ON public.knowledge_documents FOR SELECT USING (((status = 'approved'::text) AND ((tenant_id IS NULL) OR (tenant_id IN ( SELECT entity_members.organizer_id
   FROM public.entity_members
  WHERE (entity_members.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))));


--
-- Name: incidents Authenticated can read incidents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can read incidents" ON public.incidents FOR SELECT USING ((((tenant_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))) OR ((tenant_id IS NOT NULL) AND public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text])) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: system_events Authenticated can read system events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can read system events" ON public.system_events FOR SELECT USING ((((tenant_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))) OR ((tenant_id IS NOT NULL) AND public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text])) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: fundraisers Authenticated owners can create fundraisers pending review; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated owners can create fundraisers pending review" ON public.fundraisers FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (auth.uid() = user_id) AND (status = 'pending_review'::text) AND ((organizer_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = fundraisers.organizer_id) AND (organizers.user_id = auth.uid())))))));


--
-- Name: beneficiaries Authenticated users can create beneficiaries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create beneficiaries" ON public.beneficiaries FOR INSERT TO authenticated WITH CHECK ((user_id IS NULL));


--
-- Name: homepage_promotions Authenticated users can create promotions pending review; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create promotions pending review" ON public.homepage_promotions FOR INSERT TO authenticated WITH CHECK (((auth.uid() = created_by) AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text])) AND (is_visible = false) AND (approved_by IS NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.status = 'active'::text))))));


--
-- Name: reviews Authenticated users can create reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create reviews" ON public.reviews FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: product_orders Authenticated users can create their own pending order; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create their own pending order" ON public.product_orders FOR INSERT WITH CHECK (((auth.uid() = buyer_id) AND (status = 'pending'::text)));


--
-- Name: platform_settings Authenticated users can read settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read settings" ON public.platform_settings FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: fundraisers Beneficiaries can read their own campaign; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Beneficiaries can read their own campaign" ON public.fundraisers FOR SELECT USING (((beneficiary_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.beneficiaries b
  WHERE ((b.id = fundraisers.beneficiary_id) AND (b.user_id IS NOT NULL) AND (b.user_id = auth.uid()))))));


--
-- Name: beneficiaries Beneficiaries can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Beneficiaries can update their own profile" ON public.beneficiaries FOR UPDATE TO authenticated USING (((user_id IS NOT NULL) AND (auth.uid() = user_id))) WITH CHECK (((user_id IS NOT NULL) AND (auth.uid() = user_id)));


--
-- Name: product_orders Buyers can view their own product orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Buyers can view their own product orders" ON public.product_orders FOR SELECT USING ((auth.uid() = buyer_id));


--
-- Name: homepage_promotions Creators can delete own promotions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creators can delete own promotions" ON public.homepage_promotions FOR DELETE TO authenticated USING (((auth.uid() = created_by) AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'archived'::text]))));


--
-- Name: homepage_promotions Creators can update own promotions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creators can update own promotions" ON public.homepage_promotions FOR UPDATE TO authenticated USING ((auth.uid() = created_by)) WITH CHECK ((auth.uid() = created_by));


--
-- Name: homepage_promotions Creators can view own promotions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creators can view own promotions" ON public.homepage_promotions FOR SELECT USING ((auth.uid() = created_by));


--
-- Name: product_downloads Downloaders can view their own download log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Downloaders can view their own download log" ON public.product_downloads FOR SELECT USING ((auth.uid() = buyer_id));


--
-- Name: tickets Event owners and admins can create tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Event owners and admins can create tickets" ON public.tickets FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (event_id IS NOT NULL) AND ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))) OR (EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = tickets.event_id) AND (events.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.events
     JOIN public.organizers ON ((organizers.id = events.organizer_id)))
  WHERE ((events.id = tickets.event_id) AND (organizers.user_id = auth.uid())))))));


--
-- Name: tickets Event owners and admins can delete tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Event owners and admins can delete tickets" ON public.tickets FOR DELETE USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = tickets.event_id) AND (events.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.events
     JOIN public.organizers ON ((organizers.id = events.organizer_id)))
  WHERE ((events.id = tickets.event_id) AND (organizers.user_id = auth.uid()))))));


--
-- Name: tickets Event owners and admins can update tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Event owners and admins can update tickets" ON public.tickets FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = tickets.event_id) AND (events.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.events
     JOIN public.organizers ON ((organizers.id = events.organizer_id)))
  WHERE ((events.id = tickets.event_id) AND (organizers.user_id = auth.uid())))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = tickets.event_id) AND (events.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.events
     JOIN public.organizers ON ((organizers.id = events.organizer_id)))
  WHERE ((events.id = tickets.event_id) AND (organizers.user_id = auth.uid()))))));


--
-- Name: fundraiser_media Media of published fundraisers is readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Media of published fundraisers is readable" ON public.fundraiser_media FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.fundraisers f
  WHERE ((f.id = fundraiser_media.fundraiser_id) AND (f.status = 'published'::text) AND (f.deleted_at IS NULL)))));


--
-- Name: agent_memory_versions Members and admins can read memory history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members and admins can read memory history" ON public.agent_memory_versions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.agent_memory m
  WHERE ((m.id = agent_memory_versions.fact_id) AND ((m.tenant_id IS NULL) OR (m.tenant_id IN ( SELECT entity_members.organizer_id
           FROM public.entity_members
          WHERE (entity_members.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: agent_memory Members and admins can read scoped memory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members and admins can read scoped memory" ON public.agent_memory FOR SELECT USING (((tenant_id IS NULL) OR (tenant_id IN ( SELECT entity_members.organizer_id
   FROM public.entity_members
  WHERE (entity_members.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: organizer_verification_submissions Organizer can create draft submission; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizer can create draft submission" ON public.organizer_verification_submissions FOR INSERT WITH CHECK (((status = 'draft'::text) AND (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = organizer_verification_submissions.organizer_id) AND (organizers.user_id = auth.uid()))))));


--
-- Name: fundraiser_media Organizer can manage their fundraiser media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizer can manage their fundraiser media" ON public.fundraiser_media USING (((fundraiser_id IN ( SELECT fundraisers.id
   FROM public.fundraisers
  WHERE (fundraisers.organizer_id IN ( SELECT organizers.id
           FROM public.organizers
          WHERE (organizers.user_id = auth.uid()))))) OR public.is_entity_member(( SELECT fundraisers.organizer_id
   FROM public.fundraisers
  WHERE (fundraisers.id = fundraiser_media.fundraiser_id)), ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text])));


--
-- Name: fundraiser_updates Organizer can manage their updates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizer can manage their updates" ON public.fundraiser_updates USING (((organizer_id IN ( SELECT organizers.id
   FROM public.organizers
  WHERE (organizers.user_id = auth.uid()))) OR public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text])));


--
-- Name: organizer_verification_submissions Organizer can update own pending submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizer can update own pending submissions" ON public.organizer_verification_submissions FOR UPDATE USING (((status = ANY (ARRAY['draft'::text, 'needs_more_info'::text])) AND (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = organizer_verification_submissions.organizer_id) AND (organizers.user_id = auth.uid())))))) WITH CHECK (((status <> 'approved'::text) AND (status <> 'rejected'::text) AND (status <> 'needs_more_info'::text) AND (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = organizer_verification_submissions.organizer_id) AND (organizers.user_id = auth.uid()))))));


--
-- Name: organizer_verification_submissions Organizer can view own submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizer can view own submissions" ON public.organizer_verification_submissions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = organizer_verification_submissions.organizer_id) AND (organizers.user_id = auth.uid())))));


--
-- Name: entity_members Organizer owners manage entity memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizer owners manage entity memberships" ON public.entity_members USING (((EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = entity_members.organizer_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = entity_members.organizer_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: guest_import_rows Organizers access their import rows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers access their import rows" ON public.guest_import_rows USING ((EXISTS ( SELECT 1
   FROM (public.guest_import_batches b
     JOIN public.events e ON ((e.id = b.event_id)))
  WHERE ((b.id = guest_import_rows.batch_id) AND ((e.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = e.organizer_id) AND ((organizers.user_id = auth.uid()) OR public.is_entity_member(e.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))) OR public.is_event_team_member(b.event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.guest_import_batches b
     JOIN public.events e ON ((e.id = b.event_id)))
  WHERE ((b.id = guest_import_rows.batch_id) AND ((e.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = e.organizer_id) AND ((organizers.user_id = auth.uid()) OR public.is_entity_member(e.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))) OR public.is_event_team_member(b.event_id, ARRAY['event_manager'::text]))))));


--
-- Name: event_invitations Organizers and event managers can manage event invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers and event managers can manage event invitations" ON public.event_invitations USING (((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = event_invitations.event_id) AND ((events.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = events.organizer_id) AND ((organizers.user_id = auth.uid()) OR public.is_entity_member(events.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = event_invitations.event_id) AND ((events.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = events.organizer_id) AND ((organizers.user_id = auth.uid()) OR public.is_entity_member(events.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: event_invitation_pages Organizers and event managers can manage invitation pages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers and event managers can manage invitation pages" ON public.event_invitation_pages TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_invitation_pages.event_id) AND ((e.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers o
          WHERE ((o.id = e.organizer_id) AND ((o.user_id = auth.uid()) OR public.is_entity_member(e.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.status = 'active'::text)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_invitation_pages.event_id) AND ((e.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers o
          WHERE ((o.id = e.organizer_id) AND ((o.user_id = auth.uid()) OR public.is_entity_member(e.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.status = 'active'::text))))));


--
-- Name: event_memories Organizers and event managers can manage memories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers and event managers can manage memories" ON public.event_memories TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_memories.event_id) AND ((e.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers o
          WHERE ((o.id = e.organizer_id) AND ((o.user_id = auth.uid()) OR public.is_entity_member(e.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.status = 'active'::text)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_memories.event_id) AND ((e.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers o
          WHERE ((o.id = e.organizer_id) AND ((o.user_id = auth.uid()) OR public.is_entity_member(e.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.status = 'active'::text))))));


--
-- Name: event_memory_reports Organizers and event managers can manage memory reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers and event managers can manage memory reports" ON public.event_memory_reports TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public.event_memories m
     JOIN public.events e ON ((e.id = m.event_id)))
  WHERE ((m.id = event_memory_reports.memory_id) AND ((e.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers o
          WHERE ((o.id = e.organizer_id) AND ((o.user_id = auth.uid()) OR public.is_entity_member(e.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR (EXISTS ( SELECT 1
   FROM public.event_memories m
  WHERE ((m.id = event_memory_reports.memory_id) AND public.is_event_team_member(m.event_id, ARRAY['event_manager'::text])))) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.status = 'active'::text)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM (public.event_memories m
     JOIN public.events e ON ((e.id = m.event_id)))
  WHERE ((m.id = event_memory_reports.memory_id) AND ((e.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers o
          WHERE ((o.id = e.organizer_id) AND ((o.user_id = auth.uid()) OR public.is_entity_member(e.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR (EXISTS ( SELECT 1
   FROM public.event_memories m
  WHERE ((m.id = event_memory_reports.memory_id) AND public.is_event_team_member(m.event_id, ARRAY['event_manager'::text])))) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.status = 'active'::text))))));


--
-- Name: event_memory_settings Organizers and event managers can manage memory settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers and event managers can manage memory settings" ON public.event_memory_settings TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_memory_settings.event_id) AND ((e.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers o
          WHERE ((o.id = e.organizer_id) AND ((o.user_id = auth.uid()) OR public.is_entity_member(e.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.status = 'active'::text)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_memory_settings.event_id) AND ((e.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers o
          WHERE ((o.id = e.organizer_id) AND ((o.user_id = auth.uid()) OR public.is_entity_member(e.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.status = 'active'::text))))));


--
-- Name: invitation_page_preview_tokens Organizers and event managers can manage preview tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers and event managers can manage preview tokens" ON public.invitation_page_preview_tokens TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = invitation_page_preview_tokens.event_id) AND ((e.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers o
          WHERE ((o.id = e.organizer_id) AND ((o.user_id = auth.uid()) OR public.is_entity_member(e.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.status = 'active'::text)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = invitation_page_preview_tokens.event_id) AND ((e.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers o
          WHERE ((o.id = e.organizer_id) AND ((o.user_id = auth.uid()) OR public.is_entity_member(e.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.status = 'active'::text))))));


--
-- Name: event_memory_retention_notices Organizers and event managers can manage retention notices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers and event managers can manage retention notices" ON public.event_memory_retention_notices TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_memory_retention_notices.event_id) AND ((e.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers o
          WHERE ((o.id = e.organizer_id) AND ((o.user_id = auth.uid()) OR public.is_entity_member(e.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.status = 'active'::text)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_memory_retention_notices.event_id) AND ((e.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers o
          WHERE ((o.id = e.organizer_id) AND ((o.user_id = auth.uid()) OR public.is_entity_member(e.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.status = 'active'::text))))));


--
-- Name: organizer_follows Organizers can read their own followers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers can read their own followers" ON public.organizer_follows FOR SELECT USING ((organizer_id IN ( SELECT organizers.id
   FROM public.organizers
  WHERE (organizers.user_id = auth.uid()))));


--
-- Name: event_audit_logs Organizers can view audit logs for their events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers can view audit logs for their events" ON public.event_audit_logs FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = event_audit_logs.event_id) AND ((events.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = events.organizer_id) AND ((organizers.user_id = auth.uid()) OR public.is_entity_member(events.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: event_team_invitations Organizers manage event team invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers manage event team invitations" ON public.event_team_invitations USING (((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = event_team_invitations.event_id) AND ((events.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = events.organizer_id) AND ((organizers.user_id = auth.uid()) OR public.is_entity_member(events.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = event_team_invitations.event_id) AND ((events.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = events.organizer_id) AND ((organizers.user_id = auth.uid()) OR public.is_entity_member(events.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: event_team_members Organizers manage event team members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers manage event team members" ON public.event_team_members USING (((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = event_team_members.event_id) AND ((events.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = events.organizer_id) AND ((organizers.user_id = auth.uid()) OR public.is_entity_member(events.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = event_team_members.event_id) AND ((events.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = events.organizer_id) AND ((organizers.user_id = auth.uid()) OR public.is_entity_member(events.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: guest_import_batches Organizers manage their import batches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers manage their import batches" ON public.guest_import_batches USING (((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = guest_import_batches.event_id) AND ((events.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = events.organizer_id) AND ((organizers.user_id = auth.uid()) OR public.is_entity_member(events.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = guest_import_batches.event_id) AND ((events.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = events.organizer_id) AND ((organizers.user_id = auth.uid()) OR public.is_entity_member(events.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text])));


--
-- Name: studio_chat_messages Owner admins can delete studio chat messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner admins can delete studio chat messages" ON public.studio_chat_messages FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.studio_chat_conversations c
  WHERE ((c.id = studio_chat_messages.conversation_id) AND (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))) AND (c.user_id = auth.uid())))));


--
-- Name: studio_chat_conversations Owner admins can delete studio chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner admins can delete studio chats" ON public.studio_chat_conversations FOR DELETE USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))) AND (user_id = auth.uid())));


--
-- Name: studio_chat_messages Owner admins can insert studio chat messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner admins can insert studio chat messages" ON public.studio_chat_messages FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.studio_chat_conversations c
  WHERE ((c.id = studio_chat_messages.conversation_id) AND (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))) AND (c.user_id = auth.uid())))));


--
-- Name: studio_chat_conversations Owner admins can insert studio chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner admins can insert studio chats" ON public.studio_chat_conversations FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))) AND (user_id = auth.uid())));


--
-- Name: studio_chat_messages Owner admins can update studio chat messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner admins can update studio chat messages" ON public.studio_chat_messages FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.studio_chat_conversations c
  WHERE ((c.id = studio_chat_messages.conversation_id) AND (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))) AND (c.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.studio_chat_conversations c
  WHERE ((c.id = studio_chat_messages.conversation_id) AND (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))) AND (c.user_id = auth.uid())))));


--
-- Name: studio_chat_conversations Owner admins can update studio chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner admins can update studio chats" ON public.studio_chat_conversations FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))) AND (user_id = auth.uid()))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))) AND (user_id = auth.uid())));


--
-- Name: studio_chat_messages Owner admins can view studio chat messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner admins can view studio chat messages" ON public.studio_chat_messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.studio_chat_conversations c
  WHERE ((c.id = studio_chat_messages.conversation_id) AND (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))) AND (c.user_id = auth.uid())))));


--
-- Name: studio_chat_conversations Owner admins can view studio chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner admins can view studio chats" ON public.studio_chat_conversations FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))) AND (user_id = auth.uid())));


--
-- Name: events Owners and admins can create events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can create events" ON public.events FOR INSERT WITH CHECK ((((auth.uid() IS NOT NULL) AND (auth.uid() = user_id)) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: article_audios Owners and admins can read article audios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can read article audios" ON public.article_audios FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.articles
  WHERE ((articles.id = article_audios.article_id) AND ((articles.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: payouts Owners and admins can view payouts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can view payouts" ON public.payouts FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.recipients r
  WHERE ((r.id = payouts.recipient_id) AND ((auth.uid() = r.user_id) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = r.organizer_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM public.businesses
          WHERE ((businesses.id = r.business_id) AND (businesses.owner_id = auth.uid())))))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: recipient_ledger_entries Owners and admins can view their ledger entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can view their ledger entries" ON public.recipient_ledger_entries FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.recipients r
  WHERE ((r.id = recipient_ledger_entries.recipient_id) AND ((auth.uid() = r.user_id) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = r.organizer_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM public.businesses
          WHERE ((businesses.id = r.business_id) AND (businesses.owner_id = auth.uid())))))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: recipients Owners and admins can view their recipient record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can view their recipient record" ON public.recipients FOR SELECT USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = recipients.organizer_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.businesses
  WHERE ((businesses.id = recipients.business_id) AND (businesses.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: products Owners can delete archived products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can delete archived products" ON public.products FOR DELETE USING (((auth.uid() = owner_id) AND (status = 'archived'::text)));


--
-- Name: businesses Owners can delete inactive businesses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can delete inactive businesses" ON public.businesses FOR DELETE USING (((auth.uid() = owner_id) AND (status <> 'active'::text)));


--
-- Name: business_branches Owners can manage branches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can manage branches" ON public.business_branches TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.businesses
  WHERE ((businesses.id = business_branches.business_id) AND (businesses.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.businesses
  WHERE ((businesses.id = business_branches.business_id) AND (businesses.owner_id = auth.uid())))));


--
-- Name: events Owners can read their own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can read their own events" ON public.events FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: fundraiser_media Owners can read their own fundraiser media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can read their own fundraiser media" ON public.fundraiser_media FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.fundraisers f
     LEFT JOIN public.organizers o ON ((o.id = f.organizer_id)))
  WHERE ((f.id = fundraiser_media.fundraiser_id) AND ((f.user_id = auth.uid()) OR (o.user_id = auth.uid()))))));


--
-- Name: fundraiser_updates Owners can read their own fundraiser updates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can read their own fundraiser updates" ON public.fundraiser_updates FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.fundraisers f
     LEFT JOIN public.organizers o ON ((o.id = f.organizer_id)))
  WHERE ((f.id = fundraiser_updates.fundraiser_id) AND ((f.user_id = auth.uid()) OR (o.user_id = auth.uid()))))));


--
-- Name: fundraisers Owners can read their own fundraisers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can read their own fundraisers" ON public.fundraisers FOR SELECT USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = fundraisers.organizer_id) AND (organizers.user_id = auth.uid()))))));


--
-- Name: businesses Owners can update their own businesses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can update their own businesses" ON public.businesses FOR UPDATE USING ((auth.uid() = owner_id)) WITH CHECK ((auth.uid() = owner_id));


--
-- Name: products Owners can update their own products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can update their own products" ON public.products FOR UPDATE USING ((auth.uid() = owner_id)) WITH CHECK (((auth.uid() = owner_id) AND ((business_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.businesses
  WHERE ((businesses.id = products.business_id) AND (businesses.owner_id = auth.uid())))))));


--
-- Name: businesses Owners can view their own businesses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can view their own businesses" ON public.businesses FOR SELECT USING ((auth.uid() = owner_id));


--
-- Name: products Owners can view their own products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can view their own products" ON public.products FOR SELECT USING ((auth.uid() = owner_id));


--
-- Name: product_assets Product owners can view assets on their products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Product owners can view assets on their products" ON public.product_assets FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_assets.product_id) AND (products.owner_id = auth.uid())))));


--
-- Name: product_downloads Product owners can view downloads on their products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Product owners can view downloads on their products" ON public.product_downloads FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_downloads.product_id) AND (products.owner_id = auth.uid())))));


--
-- Name: product_orders Product owners can view orders on their products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Product owners can view orders on their products" ON public.product_orders FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_orders.product_id) AND (products.owner_id = auth.uid())))));


--
-- Name: article_audios Public article audios are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public article audios are readable" ON public.article_audios FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.articles
  WHERE ((articles.id = article_audios.article_id) AND (articles.status = 'published'::text) AND (articles.visibility = 'public'::text)))));


--
-- Name: beneficiaries Public beneficiaries are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public beneficiaries are readable" ON public.beneficiaries FOR SELECT USING ((((visibility = 'public'::text) AND (deleted_at IS NULL)) OR ((user_id IS NOT NULL) AND (auth.uid() = user_id))));


--
-- Name: menu_items Public can view active menu items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active menu items" ON public.menu_items FOR SELECT USING (((is_active = true) AND (EXISTS ( SELECT 1
   FROM public.menu_sections
  WHERE ((menu_sections.id = menu_items.section_id) AND (menu_sections.is_active = true))))));


--
-- Name: menu_sections Public can view active menu sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active menu sections" ON public.menu_sections FOR SELECT USING ((is_active = true));


--
-- Name: businesses Public can view active non-flagged businesses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active non-flagged businesses" ON public.businesses FOR SELECT USING (((status = 'active'::text) AND (is_flagged = false)));


--
-- Name: products Public can view active products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active products" ON public.products FOR SELECT USING (((status = 'active'::text) OR (status = 'out_of_stock'::text)));


--
-- Name: homepage_promotions Public can view active promotions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active promotions" ON public.homepage_promotions FOR SELECT USING (((status = 'active'::text) AND (is_visible = true) AND ((starts_at IS NULL) OR (starts_at <= now())) AND ((ends_at IS NULL) OR (ends_at > now()))));


--
-- Name: service_tiers Public can view active service tiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active service tiers" ON public.service_tiers FOR SELECT USING (((is_active = true) AND (EXISTS ( SELECT 1
   FROM public.services
  WHERE ((services.id = service_tiers.service_id) AND (services.is_active = true))))));


--
-- Name: services Public can view active services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active services" ON public.services FOR SELECT USING ((is_active = true));


--
-- Name: menu_option_groups Public can view assigned active menu option groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view assigned active menu option groups" ON public.menu_option_groups FOR SELECT USING (((is_active = true) AND (EXISTS ( SELECT 1
   FROM ((public.menu_item_option_groups a
     JOIN public.menu_items i ON (((i.id = a.item_id) AND (i.is_active = true))))
     JOIN public.menu_sections s ON (((s.id = i.section_id) AND (s.is_active = true))))
  WHERE (a.group_id = menu_option_groups.id)))));


--
-- Name: menu_item_option_groups Public can view assignments for active menu items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view assignments for active menu items" ON public.menu_item_option_groups FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.menu_items i
     JOIN public.menu_sections s ON ((s.id = i.section_id)))
  WHERE ((i.id = menu_item_option_groups.item_id) AND (i.is_active = true) AND (s.is_active = true)))));


--
-- Name: menu_options Public can view available assigned menu options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view available assigned menu options" ON public.menu_options FOR SELECT USING (((is_available = true) AND (EXISTS ( SELECT 1
   FROM (((public.menu_option_groups g
     JOIN public.menu_item_option_groups a ON ((a.group_id = g.id)))
     JOIN public.menu_items i ON (((i.id = a.item_id) AND (i.is_active = true))))
     JOIN public.menu_sections s ON (((s.id = i.section_id) AND (s.is_active = true))))
  WHERE ((g.id = menu_options.group_id) AND (g.is_active = true))))));


--
-- Name: business_branches Public can view branches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view branches" ON public.business_branches FOR SELECT USING (true);


--
-- Name: tenant_websites Public can view published tenant websites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view published tenant websites" ON public.tenant_websites FOR SELECT USING (((status = 'published'::text) OR public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: website_pages Public can view published website pages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view published website pages" ON public.website_pages FOR SELECT USING ((((status = 'published'::text) AND (EXISTS ( SELECT 1
   FROM public.tenant_websites
  WHERE ((tenant_websites.id = website_pages.website_id) AND (tenant_websites.status = 'published'::text))))) OR (EXISTS ( SELECT 1
   FROM public.tenant_websites
  WHERE ((tenant_websites.id = website_pages.website_id) AND (public.is_entity_member(tenant_websites.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))))))));


--
-- Name: website_navigation Public can view website navigation for published websites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view website navigation for published websites" ON public.website_navigation FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tenant_websites
  WHERE ((tenant_websites.id = website_navigation.website_id) AND ((tenant_websites.status = 'published'::text) OR public.is_entity_member(tenant_websites.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: organizers Public organizers are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public organizers are readable" ON public.organizers FOR SELECT USING ((((visibility = 'public'::text) AND (deleted_at IS NULL)) OR (auth.uid() = user_id)));


--
-- Name: homepage_sponsors Public read homepage_sponsors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read homepage_sponsors" ON public.homepage_sponsors FOR SELECT USING (true);


--
-- Name: homepage_testimonials Public read homepage_testimonials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read homepage_testimonials" ON public.homepage_testimonials FOR SELECT USING (true);


--
-- Name: fundraisers Published fundraisers are public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Published fundraisers are public" ON public.fundraisers FOR SELECT USING ((status = 'published'::text));


--
-- Name: articles Published public articles are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Published public articles are readable" ON public.articles FOR SELECT USING (((status = 'published'::text) AND (visibility = 'public'::text)));


--
-- Name: reviews Reviews are publicly readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Reviews are publicly readable" ON public.reviews FOR SELECT USING (((is_approved = true) OR (auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));


--
-- Name: menu_item_option_groups Tenant editors can delete menu item option groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant editors can delete menu item option groups" ON public.menu_item_option_groups FOR DELETE USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: menu_item_option_groups Tenant editors can insert menu item option groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant editors can insert menu item option groups" ON public.menu_item_option_groups FOR INSERT WITH CHECK ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: menu_items Tenant editors can insert menu items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant editors can insert menu items" ON public.menu_items FOR INSERT WITH CHECK ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: menu_option_groups Tenant editors can insert menu option groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant editors can insert menu option groups" ON public.menu_option_groups FOR INSERT WITH CHECK ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: menu_options Tenant editors can insert menu options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant editors can insert menu options" ON public.menu_options FOR INSERT WITH CHECK ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: menu_sections Tenant editors can insert menu sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant editors can insert menu sections" ON public.menu_sections FOR INSERT WITH CHECK ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: service_tiers Tenant editors can insert service tiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant editors can insert service tiers" ON public.service_tiers FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.services
  WHERE ((services.id = service_tiers.service_id) AND (public.is_entity_member(services.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: services Tenant editors can insert services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant editors can insert services" ON public.services FOR INSERT WITH CHECK ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: website_content_drafts Tenant editors can insert website content drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant editors can insert website content drafts" ON public.website_content_drafts FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.tenant_websites tw
  WHERE ((tw.id = website_content_drafts.website_id) AND (public.is_entity_member(tw.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = tw.tenant_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: menu_item_option_groups Tenant editors can update menu item option groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant editors can update menu item option groups" ON public.menu_item_option_groups FOR UPDATE USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: menu_items Tenant editors can update menu items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant editors can update menu items" ON public.menu_items FOR UPDATE USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: menu_option_groups Tenant editors can update menu option groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant editors can update menu option groups" ON public.menu_option_groups FOR UPDATE USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: menu_options Tenant editors can update menu options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant editors can update menu options" ON public.menu_options FOR UPDATE USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: menu_sections Tenant editors can update menu sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant editors can update menu sections" ON public.menu_sections FOR UPDATE USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: service_tiers Tenant editors can update service tiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant editors can update service tiers" ON public.service_tiers FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.services
  WHERE ((services.id = service_tiers.service_id) AND (public.is_entity_member(services.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.services
  WHERE ((services.id = service_tiers.service_id) AND (public.is_entity_member(services.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: services Tenant editors can update services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant editors can update services" ON public.services FOR UPDATE USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: website_content_drafts Tenant editors can update website content drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant editors can update website content drafts" ON public.website_content_drafts FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tenant_websites tw
  WHERE ((tw.id = website_content_drafts.website_id) AND (public.is_entity_member(tw.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = tw.tenant_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: tenant_websites Tenant managers and editors can insert tenant websites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers and editors can insert tenant websites" ON public.tenant_websites FOR INSERT TO authenticated WITH CHECK ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: website_navigation Tenant managers and editors can insert website navigation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers and editors can insert website navigation" ON public.website_navigation FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.tenant_websites tw
  WHERE ((tw.id = website_navigation.website_id) AND (public.is_entity_member(tw.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: website_pages Tenant managers and editors can insert website pages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers and editors can insert website pages" ON public.website_pages FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.tenant_websites tw
  WHERE ((tw.id = website_pages.website_id) AND (public.is_entity_member(tw.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: tenant_websites Tenant managers and editors can update tenant websites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers and editors can update tenant websites" ON public.tenant_websites FOR UPDATE TO authenticated USING ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: website_navigation Tenant managers and editors can update website navigation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers and editors can update website navigation" ON public.website_navigation FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tenant_websites tw
  WHERE ((tw.id = website_navigation.website_id) AND (public.is_entity_member(tw.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.tenant_websites tw
  WHERE ((tw.id = website_navigation.website_id) AND (public.is_entity_member(tw.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: website_pages Tenant managers and editors can update website pages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers and editors can update website pages" ON public.website_pages FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tenant_websites tw
  WHERE ((tw.id = website_pages.website_id) AND (public.is_entity_member(tw.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.tenant_websites tw
  WHERE ((tw.id = website_pages.website_id) AND (public.is_entity_member(tw.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: menu_items Tenant managers can delete menu items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers can delete menu items" ON public.menu_items FOR DELETE USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: menu_option_groups Tenant managers can delete menu option groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers can delete menu option groups" ON public.menu_option_groups FOR DELETE USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: menu_options Tenant managers can delete menu options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers can delete menu options" ON public.menu_options FOR DELETE USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: menu_sections Tenant managers can delete menu sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers can delete menu sections" ON public.menu_sections FOR DELETE USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: service_tiers Tenant managers can delete service tiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers can delete service tiers" ON public.service_tiers FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.services
  WHERE ((services.id = service_tiers.service_id) AND (public.is_entity_member(services.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: services Tenant managers can delete services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers can delete services" ON public.services FOR DELETE USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: tenant_websites Tenant managers can delete tenant websites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers can delete tenant websites" ON public.tenant_websites FOR DELETE TO authenticated USING ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: website_content_drafts Tenant managers can delete website content drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers can delete website content drafts" ON public.website_content_drafts FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tenant_websites tw
  WHERE ((tw.id = website_content_drafts.website_id) AND (public.is_entity_member(tw.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = tw.tenant_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: website_navigation Tenant managers can delete website navigation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers can delete website navigation" ON public.website_navigation FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tenant_websites tw
  WHERE ((tw.id = website_navigation.website_id) AND (public.is_entity_member(tw.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: website_pages Tenant managers can delete website pages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers can delete website pages" ON public.website_pages FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tenant_websites tw
  WHERE ((tw.id = website_pages.website_id) AND (public.is_entity_member(tw.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: ai_provider_configs Tenant managers can manage ai provider configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers can manage ai provider configs" ON public.ai_provider_configs USING ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: channel_assets Tenant managers can manage channel assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers can manage channel assets" ON public.channel_assets USING ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: connected_accounts Tenant managers can manage connected accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers can manage connected accounts" ON public.connected_accounts USING ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: notification_preferences Tenant managers can manage notification preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers can manage notification preferences" ON public.notification_preferences USING ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: orders Tenant managers can update orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers can update orders" ON public.orders FOR UPDATE TO authenticated USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = orders.organizer_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = orders.organizer_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: reservations Tenant managers can update reservations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant managers can update reservations" ON public.reservations FOR UPDATE TO authenticated USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = reservations.organizer_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = reservations.organizer_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: ai_guard_rejections Tenant members and admins can read guard rejections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members and admins can read guard rejections" ON public.ai_guard_rejections FOR SELECT USING ((((tenant_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))) OR ((tenant_id IS NOT NULL) AND public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text])) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: incident_events Tenant members and admins can read incident events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members and admins can read incident events" ON public.incident_events FOR SELECT USING ((incident_id IN ( SELECT incidents.id
   FROM public.incidents
  WHERE (((incidents.tenant_id IS NULL) AND (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))) OR ((incidents.tenant_id IS NOT NULL) AND public.is_entity_member(incidents.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]))))));


--
-- Name: ai_provider_configs Tenant members can read ai provider configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can read ai provider configs" ON public.ai_provider_configs FOR SELECT USING ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: channel_assets Tenant members can read channel assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can read channel assets" ON public.channel_assets FOR SELECT USING ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: connected_accounts Tenant members can read connected accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can read connected accounts" ON public.connected_accounts FOR SELECT USING ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: conversations Tenant members can read conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can read conversations" ON public.conversations FOR SELECT USING ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: customer_identities Tenant members can read customer identities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can read customer identities" ON public.customer_identities FOR SELECT USING ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: messages Tenant members can read messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can read messages" ON public.messages FOR SELECT USING ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: notification_preferences Tenant members can read notification preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can read notification preferences" ON public.notification_preferences FOR SELECT USING ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: ai_tool_invocations Tenant members can read own tool invocations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can read own tool invocations" ON public.ai_tool_invocations FOR SELECT USING ((((tenant_id IS NOT NULL) AND public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text])) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: menu_item_option_groups Tenant members can view menu item option groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view menu item option groups" ON public.menu_item_option_groups FOR SELECT USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: menu_items Tenant members can view menu items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view menu items" ON public.menu_items FOR SELECT USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: menu_option_groups Tenant members can view menu option groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view menu option groups" ON public.menu_option_groups FOR SELECT USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: menu_options Tenant members can view menu options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view menu options" ON public.menu_options FOR SELECT USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: menu_sections Tenant members can view menu sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view menu sections" ON public.menu_sections FOR SELECT USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: service_tiers Tenant members can view service tiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view service tiers" ON public.service_tiers FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.services
  WHERE ((services.id = service_tiers.service_id) AND (public.is_entity_member(services.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: services Tenant members can view services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view services" ON public.services FOR SELECT USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: tenant_websites Tenant members can view tenant websites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view tenant websites" ON public.tenant_websites FOR SELECT TO authenticated USING ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: website_navigation Tenant members can view website navigation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view website navigation" ON public.website_navigation FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tenant_websites tw
  WHERE ((tw.id = website_navigation.website_id) AND (public.is_entity_member(tw.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: website_pages Tenant members can view website pages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view website pages" ON public.website_pages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tenant_websites tw
  WHERE ((tw.id = website_pages.website_id) AND (public.is_entity_member(tw.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: website_page_drafts Tenant team members can delete website page drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant team members can delete website page drafts" ON public.website_page_drafts FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.website_pages wp
     JOIN public.tenant_websites tw ON ((tw.id = wp.website_id)))
  WHERE ((wp.id = website_page_drafts.page_id) AND (public.is_entity_member(tw.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = tw.tenant_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: website_page_drafts Tenant team members can insert website page drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant team members can insert website page drafts" ON public.website_page_drafts FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.website_pages wp
     JOIN public.tenant_websites tw ON ((tw.id = wp.website_id)))
  WHERE ((wp.id = website_page_drafts.page_id) AND (public.is_entity_member(tw.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = tw.tenant_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: website_page_drafts Tenant team members can update website page drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant team members can update website page drafts" ON public.website_page_drafts FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.website_pages wp
     JOIN public.tenant_websites tw ON ((tw.id = wp.website_id)))
  WHERE ((wp.id = website_page_drafts.page_id) AND (public.is_entity_member(tw.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = tw.tenant_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: orders Tenant team members can view orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant team members can view orders" ON public.orders FOR SELECT TO authenticated USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text]) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = orders.organizer_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: promo_codes Tenant team members can view promo codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant team members can view promo codes" ON public.promo_codes FOR SELECT USING (public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text]));


--
-- Name: reservations Tenant team members can view reservations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant team members can view reservations" ON public.reservations FOR SELECT TO authenticated USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text]) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = reservations.organizer_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: website_content Tenant team members can view website content; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant team members can view website content" ON public.website_content FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tenant_websites tw
  WHERE ((tw.id = website_content.website_id) AND (public.is_entity_member(tw.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = tw.tenant_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: website_content_drafts Tenant team members can view website content drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant team members can view website content drafts" ON public.website_content_drafts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tenant_websites tw
  WHERE ((tw.id = website_content_drafts.website_id) AND (public.is_entity_member(tw.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = tw.tenant_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: website_page_drafts Tenant team members can view website page drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant team members can view website page drafts" ON public.website_page_drafts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.website_pages wp
     JOIN public.tenant_websites tw ON ((tw.id = wp.website_id)))
  WHERE ((wp.id = website_page_drafts.page_id) AND (public.is_entity_member(tw.tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = tw.tenant_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM public.profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))))));


--
-- Name: messages Tenant writers can append messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant writers can append messages" ON public.messages FOR INSERT WITH CHECK ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: conversations Tenant writers can manage conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant writers can manage conversations" ON public.conversations USING ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: customer_identities Tenant writers can manage customer identities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant writers can manage customer identities" ON public.customer_identities USING ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK ((public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: tickets Tickets of visible events are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tickets of visible events are readable" ON public.tickets FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = tickets.event_id) AND (events.status = 'approved'::text) AND (events.visibility = 'public'::text) AND (events.deleted_at IS NULL)))) OR (EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = tickets.event_id) AND (events.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: fundraiser_updates Updates of published fundraisers are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Updates of published fundraisers are readable" ON public.fundraiser_updates FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.fundraisers f
  WHERE ((f.id = fundraiser_updates.fundraiser_id) AND (f.status = 'published'::text) AND (f.deleted_at IS NULL)))));


--
-- Name: user_identity_verifications User can insert own draft identity submission; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User can insert own draft identity submission" ON public.user_identity_verifications FOR INSERT WITH CHECK (((auth.uid() = user_id) AND (status = 'draft'::text)));


--
-- Name: user_identity_verifications User can update own draft identity submission; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User can update own draft identity submission" ON public.user_identity_verifications FOR UPDATE USING (((auth.uid() = user_id) AND (status = ANY (ARRAY['draft'::text, 'needs_more_info'::text])))) WITH CHECK (((auth.uid() = user_id) AND (status = ANY (ARRAY['draft'::text, 'submitted'::text]))));


--
-- Name: user_identity_verifications User can view own identity submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User can view own identity submissions" ON public.user_identity_verifications FOR SELECT USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: follows Users can create follows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create follows" ON public.follows FOR INSERT WITH CHECK ((auth.uid() = follower_id));


--
-- Name: fundraiser_media Users can create media for their fundraisers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create media for their fundraisers" ON public.fundraiser_media FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM (public.fundraisers
     LEFT JOIN public.organizers ON ((organizers.id = fundraisers.organizer_id)))
  WHERE ((fundraisers.id = fundraiser_media.fundraiser_id) AND ((fundraisers.user_id = auth.uid()) OR (organizers.user_id = auth.uid()))))) OR public.is_entity_member(( SELECT fundraisers.organizer_id
   FROM public.fundraisers
  WHERE (fundraisers.id = fundraiser_media.fundraiser_id)), ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text])));


--
-- Name: eventbrite_sources Users can create their Eventbrite sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their Eventbrite sources" ON public.eventbrite_sources FOR INSERT WITH CHECK ((((auth.uid() = user_id) AND ((organizer_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = eventbrite_sources.organizer_id) AND (organizers.user_id = auth.uid())))))) OR public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text])));


--
-- Name: gofundme_sources Users can create their GoFundMe sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their GoFundMe sources" ON public.gofundme_sources FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: follows Users can delete follows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete follows" ON public.follows FOR DELETE USING ((auth.uid() = follower_id));


--
-- Name: fundraiser_media Users can delete media for their fundraisers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete media for their fundraisers" ON public.fundraiser_media FOR DELETE USING (((EXISTS ( SELECT 1
   FROM (public.fundraisers
     LEFT JOIN public.organizers ON ((organizers.id = fundraisers.organizer_id)))
  WHERE ((fundraisers.id = fundraiser_media.fundraiser_id) AND ((fundraisers.user_id = auth.uid()) OR (organizers.user_id = auth.uid()))))) OR public.is_entity_member(( SELECT fundraisers.organizer_id
   FROM public.fundraisers
  WHERE (fundraisers.id = fundraiser_media.fundraiser_id)), ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text])));


--
-- Name: events Users can delete own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own events" ON public.events FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: fundraisers Users can delete own fundraisers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own fundraisers" ON public.fundraisers FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: eventbrite_sources Users can delete their Eventbrite sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their Eventbrite sources" ON public.eventbrite_sources FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: gofundme_sources Users can delete their GoFundMe sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their GoFundMe sources" ON public.gofundme_sources FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: fundraisers Users can delete their organizer fundraisers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their organizer fundraisers" ON public.fundraisers FOR DELETE USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = fundraisers.organizer_id) AND (organizers.user_id = auth.uid())))) OR public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text])));


--
-- Name: reviews Users can delete their own reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own reviews" ON public.reviews FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: organizer_follows Users can follow organizers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can follow organizers" ON public.organizer_follows FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: organizers Users can insert own organizer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own organizer" ON public.organizers FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: notifications Users can mark their own notifications read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can mark their own notifications read" ON public.notifications FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: follows Users can read own follow edges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own follow edges" ON public.follows FOR SELECT USING (((auth.uid() = follower_id) OR (auth.uid() = following_id)));


--
-- Name: eventbrite_sources Users can read their Eventbrite sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their Eventbrite sources" ON public.eventbrite_sources FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: gofundme_sources Users can read their GoFundMe sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their GoFundMe sources" ON public.gofundme_sources FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: organizer_follows Users can read their own follows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their own follows" ON public.organizer_follows FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: notifications Users can read their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their own notifications" ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profiles Users can read their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: organizer_follows Users can unfollow organizers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can unfollow organizers" ON public.organizer_follows FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: fundraisers Users can update fundraisers for their organizer profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update fundraisers for their organizer profiles" ON public.fundraisers FOR UPDATE USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = fundraisers.organizer_id) AND (organizers.user_id = auth.uid())))) OR public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]))) WITH CHECK ((((auth.uid() = user_id) AND ((organizer_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = fundraisers.organizer_id) AND (organizers.user_id = auth.uid())))))) OR public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text])));


--
-- Name: fundraiser_media Users can update media for their fundraisers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update media for their fundraisers" ON public.fundraiser_media FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM (public.fundraisers
     LEFT JOIN public.organizers ON ((organizers.id = fundraisers.organizer_id)))
  WHERE ((fundraisers.id = fundraiser_media.fundraiser_id) AND ((fundraisers.user_id = auth.uid()) OR (organizers.user_id = auth.uid()))))) OR public.is_entity_member(( SELECT fundraisers.organizer_id
   FROM public.fundraisers
  WHERE (fundraisers.id = fundraiser_media.fundraiser_id)), ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]))) WITH CHECK (((EXISTS ( SELECT 1
   FROM (public.fundraisers
     LEFT JOIN public.organizers ON ((organizers.id = fundraisers.organizer_id)))
  WHERE ((fundraisers.id = fundraiser_media.fundraiser_id) AND ((fundraisers.user_id = auth.uid()) OR (organizers.user_id = auth.uid()))))) OR public.is_entity_member(( SELECT fundraisers.organizer_id
   FROM public.fundraisers
  WHERE (fundraisers.id = fundraiser_media.fundraiser_id)), ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text])));


--
-- Name: events Users can update own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own events" ON public.events FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: fundraisers Users can update own fundraisers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own fundraisers" ON public.fundraisers FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: organizers Users can update own organizer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own organizer" ON public.organizers FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: eventbrite_sources Users can update their Eventbrite sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their Eventbrite sources" ON public.eventbrite_sources FOR UPDATE USING (((auth.uid() = user_id) OR public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))) WITH CHECK ((((auth.uid() = user_id) AND ((organizer_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = eventbrite_sources.organizer_id) AND (organizers.user_id = auth.uid())))))) OR public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text])));


--
-- Name: gofundme_sources Users can update their GoFundMe sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their GoFundMe sources" ON public.gofundme_sources FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can update their own account settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own account settings" ON public.profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: reviews Users can update their own reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own reviews" ON public.reviews FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: ticket_checkins Users can view checkins for their events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view checkins for their events" ON public.ticket_checkins FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = ticket_checkins.event_id) AND ((events.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = events.organizer_id) AND ((organizers.user_id = auth.uid()) OR public.is_entity_member(events.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: offline_scan_conflicts Users can view conflicts for their events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view conflicts for their events" ON public.offline_scan_conflicts FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = offline_scan_conflicts.event_id) AND ((events.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = events.organizer_id) AND ((organizers.user_id = auth.uid()) OR public.is_entity_member(events.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: entity_members Users can view relevant entity memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view relevant entity memberships" ON public.entity_members FOR SELECT USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = entity_members.organizer_id) AND (organizers.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: event_team_invitations Users can view relevant event team invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view relevant event team invitations" ON public.event_team_invitations FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = event_team_invitations.event_id) AND ((events.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = events.organizer_id) AND ((organizers.user_id = auth.uid()) OR public.is_entity_member(events.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR ((status = 'pending'::text) AND (lower(email) = lower((auth.jwt() ->> 'email'::text)))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: event_team_members Users can view relevant event team members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view relevant event team members" ON public.event_team_members FOR SELECT USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = event_team_members.event_id) AND ((events.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = events.organizer_id) AND ((organizers.user_id = auth.uid()) OR public.is_entity_member(events.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: event_staff_checkins Users can view relevant staff checkins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view relevant staff checkins" ON public.event_staff_checkins FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = event_staff_checkins.event_id) AND ((events.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = events.organizer_id) AND ((organizers.user_id = auth.uid()) OR public.is_entity_member(events.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.event_team_members m
  WHERE ((m.id = event_staff_checkins.staff_member_id) AND (m.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: ticket_instances Users can view relevant ticket instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view relevant ticket instances" ON public.ticket_instances FOR SELECT USING ((((order_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.ticket_orders
  WHERE ((ticket_orders.id = ticket_instances.order_id) AND ((((auth.jwt() ->> 'email'::text) IS NOT NULL) AND (lower(ticket_orders.buyer_email) = lower((auth.jwt() ->> 'email'::text)))) OR (ticket_orders.buyer_email IS NULL)))))) OR ((invitation_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.event_invitations
  WHERE ((event_invitations.id = ticket_instances.invitation_id) AND ((auth.jwt() ->> 'email'::text) IS NOT NULL) AND (lower(event_invitations.email) = lower((auth.jwt() ->> 'email'::text))))))) OR (EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = ticket_instances.event_id) AND ((events.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers
          WHERE ((organizers.id = events.organizer_id) AND ((organizers.user_id = auth.uid()) OR public.is_entity_member(events.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) OR public.is_event_team_member(event_id, ARRAY['event_manager'::text, 'ticket_scanner'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: donations Users can view their own donations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own donations" ON public.donations FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: _migration_179_invitation_layout_backup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public._migration_179_invitation_layout_backup ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_memory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_memory_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_memory_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_tools; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_tools ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: agents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_content_calendar; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_content_calendar ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_content_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_content_items ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_guard_rejections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_guard_rejections ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_knowledge_docs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_knowledge_docs ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_provider_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_provider_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_tool_invocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_tool_invocations ENABLE ROW LEVEL SECURITY;

--
-- Name: approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: article_audios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.article_audios ENABLE ROW LEVEL SECURITY;

--
-- Name: articles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

--
-- Name: beneficiaries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.beneficiaries ENABLE ROW LEVEL SECURITY;

--
-- Name: business_branches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_branches ENABLE ROW LEVEL SECURITY;

--
-- Name: business_courier_offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_courier_offers ENABLE ROW LEVEL SECURITY;

--
-- Name: business_kitchen_display_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_kitchen_display_links ENABLE ROW LEVEL SECURITY;

--
-- Name: business_kitchens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_kitchens ENABLE ROW LEVEL SECURITY;

--
-- Name: business_moderation_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_moderation_events ENABLE ROW LEVEL SECURITY;

--
-- Name: business_worker_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_worker_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: business_worker_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_worker_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: business_workers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_workers ENABLE ROW LEVEL SECURITY;

--
-- Name: businesses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

--
-- Name: channel_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channel_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: comment_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

--
-- Name: comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

--
-- Name: connected_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: courier_dispatch_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.courier_dispatch_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_identities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_identities ENABLE ROW LEVEL SECURITY;

--
-- Name: donations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_members ENABLE ROW LEVEL SECURITY;

--
-- Name: event_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: event_invitation_pages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_invitation_pages ENABLE ROW LEVEL SECURITY;

--
-- Name: event_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: event_memories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_memories ENABLE ROW LEVEL SECURITY;

--
-- Name: event_memory_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_memory_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: event_memory_retention_notices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_memory_retention_notices ENABLE ROW LEVEL SECURITY;

--
-- Name: event_memory_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_memory_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: event_staff_checkins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_staff_checkins ENABLE ROW LEVEL SECURITY;

--
-- Name: event_team_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_team_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: event_team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: eventbrite_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.eventbrite_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: follows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

--
-- Name: fundraiser_media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fundraiser_media ENABLE ROW LEVEL SECURITY;

--
-- Name: fundraiser_updates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fundraiser_updates ENABLE ROW LEVEL SECURITY;

--
-- Name: fundraisers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fundraisers ENABLE ROW LEVEL SECURITY;

--
-- Name: gofundme_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gofundme_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: guest_import_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guest_import_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: guest_import_rows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guest_import_rows ENABLE ROW LEVEL SECURITY;

--
-- Name: homepage_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.homepage_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: homepage_promotions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.homepage_promotions ENABLE ROW LEVEL SECURITY;

--
-- Name: homepage_sponsors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.homepage_sponsors ENABLE ROW LEVEL SECURITY;

--
-- Name: homepage_testimonials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.homepage_testimonials ENABLE ROW LEVEL SECURITY;

--
-- Name: incident_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.incident_events ENABLE ROW LEVEL SECURITY;

--
-- Name: incidents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

--
-- Name: invitation_page_preview_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invitation_page_preview_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: invitation_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invitation_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_chunks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_document_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_document_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;

--
-- Name: media media_select_cms_active_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY media_select_cms_active_admin ON public.media FOR SELECT TO authenticated USING (((purpose = 'cms'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.status = 'active'::text) AND (p.deleted_at IS NULL))))));


--
-- Name: media media_select_personal_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY media_select_personal_owner ON public.media FOR SELECT TO authenticated USING (((purpose = 'avatar'::text) AND (owner_user_id = auth.uid())));


--
-- Name: media media_select_tenant_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY media_select_tenant_members ON public.media FOR SELECT TO authenticated USING (((tenant_id IS NOT NULL) AND public.is_entity_member(tenant_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text])));


--
-- Name: menu_item_option_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_item_option_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_option_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_option_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_options; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_options ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: offline_scan_conflicts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offline_scan_conflicts ENABLE ROW LEVEL SECURITY;

--
-- Name: order_delivery_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_delivery_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: organizer_follows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizer_follows ENABLE ROW LEVEL SECURITY;

--
-- Name: organizer_status_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizer_status_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: organizer_verification_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizer_verification_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: organizer_visibility_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizer_visibility_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: organizers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizers ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_reconciliation_failures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_reconciliation_failures ENABLE ROW LEVEL SECURITY;

--
-- Name: payouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: product_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: product_downloads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_downloads ENABLE ROW LEVEL SECURITY;

--
-- Name: product_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_verification_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_verification_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: promotion_targets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promotion_targets ENABLE ROW LEVEL SECURITY;

--
-- Name: promotion_targets promotion_targets_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promotion_targets_public_read ON public.promotion_targets FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.promotions p
  WHERE ((p.id = promotion_targets.promotion_id) AND (p.organizer_id = promotion_targets.organizer_id) AND (p.status = 'active'::text) AND (p.code IS NULL) AND ((p.starts_at IS NULL) OR (p.starts_at <= now())) AND ((p.ends_at IS NULL) OR (p.ends_at >= now()))))));


--
-- Name: promotion_targets promotion_targets_tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promotion_targets_tenant_delete ON public.promotion_targets FOR DELETE TO authenticated USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: promotion_targets promotion_targets_tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promotion_targets_tenant_insert ON public.promotion_targets FOR INSERT TO authenticated WITH CHECK ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: promotion_targets promotion_targets_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promotion_targets_tenant_read ON public.promotion_targets FOR SELECT TO authenticated USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: promotion_targets promotion_targets_tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promotion_targets_tenant_update ON public.promotion_targets FOR UPDATE TO authenticated USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: promotions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

--
-- Name: promotions promotions_public_active_automatic_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promotions_public_active_automatic_read ON public.promotions FOR SELECT TO authenticated, anon USING (((status = 'active'::text) AND (code IS NULL) AND ((starts_at IS NULL) OR (starts_at <= now())) AND ((ends_at IS NULL) OR (ends_at >= now()))));


--
-- Name: promotions promotions_tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promotions_tenant_delete ON public.promotions FOR DELETE TO authenticated USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: promotions promotions_tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promotions_tenant_insert ON public.promotions FOR INSERT TO authenticated WITH CHECK ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: promotions promotions_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promotions_tenant_read ON public.promotions FOR SELECT TO authenticated USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text, 'finance'::text, 'viewer'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: promotions promotions_tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promotions_tenant_update ON public.promotions FOR UPDATE TO authenticated USING ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))) WITH CHECK ((public.is_entity_member(organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: public_media_upload_daily_quota; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.public_media_upload_daily_quota ENABLE ROW LEVEL SECURITY;

--
-- Name: qa_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qa_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: qa_test_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qa_test_results ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: recipient_ledger_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recipient_ledger_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: reservations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

--
-- Name: reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: seats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;

--
-- Name: service_tiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

--
-- Name: studio_chat_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.studio_chat_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: studio_chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.studio_chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: system_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_websites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_websites ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_checkins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_checkins ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_instances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_instances ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: tool_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tool_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_identity_verifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_identity_verifications ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_layouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venue_layouts ENABLE ROW LEVEL SECURITY;

--
-- Name: website_content; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.website_content ENABLE ROW LEVEL SECURITY;

--
-- Name: website_content_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.website_content_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: website_navigation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.website_navigation ENABLE ROW LEVEL SECURITY;

--
-- Name: website_page_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.website_page_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: website_pages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.website_pages ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: objects Admins can delete CMS media; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admins can delete CMS media" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'cms-media'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: objects Admins can read all product assets; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admins can read all product assets" ON storage.objects FOR SELECT USING (((bucket_id = 'product-assets'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: objects Admins can read all verification docs; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admins can read all verification docs" ON storage.objects FOR SELECT USING (((bucket_id = 'organizer-verification-docs'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: objects Admins can update CMS media; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admins can update CMS media" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'cms-media'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: objects Admins can upload CMS media; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admins can upload CMS media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'cms-media'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text))))));


--
-- Name: objects Article audio objects are public for SELECT; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Article audio objects are public for SELECT" ON storage.objects FOR SELECT USING ((bucket_id = 'article-audio'::text));


--
-- Name: objects Authenticated users can upload media; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated users can upload media" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = ANY (ARRAY['fundraiser-media'::text, 'organizer-banners'::text, 'organizer-images'::text, 'videos'::text, 'event-videos'::text])));


--
-- Name: objects CMS media is public for SELECT; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "CMS media is public for SELECT" ON storage.objects FOR SELECT USING ((bucket_id = 'cms-media'::text));


--
-- Name: objects Event managers can delete invitation media; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Event managers can delete invitation media" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'invitation-media'::text) AND (auth.role() = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM public.events e
  WHERE (((e.id)::text = (storage.foldername(objects.name))[1]) AND ((e.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers o
          WHERE ((o.id = e.organizer_id) AND ((o.user_id = auth.uid()) OR public.is_entity_member(e.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))) OR public.is_event_team_member(e.id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles p
          WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.status = 'active'::text))))))))));


--
-- Name: objects Event managers can upload event banners; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Event managers can upload event banners" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'event-banners'::text) AND (auth.role() = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM public.events e
  WHERE (((e.id)::text = (storage.foldername(objects.name))[1]) AND ((e.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers o
          WHERE ((o.id = e.organizer_id) AND (o.user_id = auth.uid()))))))))));


--
-- Name: objects Event managers can upload invitation media; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Event managers can upload invitation media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'invitation-media'::text) AND (auth.role() = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM public.events e
  WHERE (((e.id)::text = (storage.foldername(objects.name))[1]) AND ((e.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.organizers o
          WHERE ((o.id = e.organizer_id) AND ((o.user_id = auth.uid()) OR public.is_entity_member(e.organizer_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))) OR public.is_event_team_member(e.id, ARRAY['event_manager'::text]) OR (EXISTS ( SELECT 1
           FROM public.profiles p
          WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.status = 'active'::text))))))))));


--
-- Name: objects Guest images are public for SELECT; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Guest images are public for SELECT" ON storage.objects FOR SELECT USING ((bucket_id = 'guest-images'::text));


--
-- Name: objects Media buckets are public for SELECT; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Media buckets are public for SELECT" ON storage.objects FOR SELECT USING ((bucket_id = ANY (ARRAY['event-banners'::text, 'fundraiser-media'::text, 'organizer-banners'::text, 'organizer-images'::text, 'videos'::text, 'event-videos'::text])));


--
-- Name: objects Organizer can read own verification docs; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Organizer can read own verification docs" ON storage.objects FOR SELECT USING (((bucket_id = 'organizer-verification-docs'::text) AND (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE (((organizers.id)::text = (storage.foldername(objects.name))[1]) AND (organizers.user_id = auth.uid()))))));


--
-- Name: objects Organizer can upload verification docs; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Organizer can upload verification docs" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'organizer-verification-docs'::text) AND (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE (((organizers.id)::text = (storage.foldername(objects.name))[1]) AND (organizers.user_id = auth.uid()))))));


--
-- Name: objects Product owners can read own product assets; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Product owners can read own product assets" ON storage.objects FOR SELECT USING (((bucket_id = 'product-assets'::text) AND (EXISTS ( SELECT 1
   FROM public.products
  WHERE (((products.id)::text = (storage.foldername(objects.name))[1]) AND (products.owner_id = auth.uid()))))));


--
-- Name: objects Product owners can upload product assets; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Product owners can upload product assets" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'product-assets'::text) AND (EXISTS ( SELECT 1
   FROM public.products
  WHERE (((products.id)::text = (storage.foldername(objects.name))[1]) AND (products.owner_id = auth.uid()))))));


--
-- Name: objects Tenant team members can delete CMS media; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Tenant team members can delete CMS media" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'cms-media'::text) AND ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))) OR (((storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text) AND (public.is_entity_member(((storage.foldername(name))[1])::uuid, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = ((storage.foldername(objects.name))[1])::uuid) AND (organizers.user_id = auth.uid())))))))));


--
-- Name: objects Tenant team members can update CMS media; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Tenant team members can update CMS media" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'cms-media'::text) AND ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))) OR (((storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text) AND (public.is_entity_member(((storage.foldername(name))[1])::uuid, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = ((storage.foldername(objects.name))[1])::uuid) AND (organizers.user_id = auth.uid())))))))));


--
-- Name: objects Tenant team members can upload CMS media; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Tenant team members can upload CMS media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'cms-media'::text) AND ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))) OR (((storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text) AND (public.is_entity_member(((storage.foldername(name))[1])::uuid, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'editor'::text]) OR (EXISTS ( SELECT 1
   FROM public.organizers
  WHERE ((organizers.id = ((storage.foldername(objects.name))[1])::uuid) AND (organizers.user_id = auth.uid())))))))));


--
-- Name: objects User can delete own draft identity docs; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "User can delete own draft identity docs" ON storage.objects FOR DELETE USING (((bucket_id = 'user-identity-docs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects User can read own identity docs; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "User can read own identity docs" ON storage.objects FOR SELECT USING (((bucket_id = 'user-identity-docs'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.status = 'active'::text)))))));


--
-- Name: objects User can upload own identity docs; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "User can upload own identity docs" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'user-identity-docs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_vectors; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: vector_indexes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- Name: supabase_realtime_messages_publication; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime_messages_publication WITH (publish = 'insert, update, delete, truncate');


--
-- Name: supabase_realtime notifications; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.notifications;


--
-- Name: supabase_realtime_messages_publication messages; Type: PUBLICATION TABLE; Schema: realtime; Owner: -
--

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE ONLY realtime.messages;


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


--
-- PostgreSQL database dump complete
--

\unrestrict LFdy4VWIx3v9jhfAw8zTCe984pyK73MiuxKimmEfK2zApQMtf9h8pyBu9kbBXud

