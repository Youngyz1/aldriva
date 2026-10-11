-- db/tests/migration_168_test_harness.sql
--
-- Fixture-Driven SQL Test Harness for migration_168 (website content store).
-- Run AFTER migration 168 is applied. Manual only; NOT executed by `npm test`.
-- Do NOT run against production.
--
-- Supabase SQL editor: paste this WHOLE file, select nothing, and run it once.
-- It opens its own transaction and ends with ROLLBACK, so it leaves zero
-- persistent rows. (psql also works: psql <conn> -f this file.)
--
-- Roles tested (same 6-role matrix as migration_129_test_harness.sql):
-- 1. editor_user_a: Editor in Tenant A.
-- 2. manager_user_a: Manager in Tenant A.
-- 3. dual_role_user: Editor in Tenant A, Manager in Tenant B.
-- 4. editor_user_b: Editor in Tenant B only.
-- 5. non_member_user: Authenticated user with no memberships.
-- 6. anon: Unauthenticated visitor.

BEGIN;

DO $$
DECLARE
  -- Tenant UUIDs
  v_tenant_a UUID := 'a0000000-0000-0000-0000-000000000001'::uuid;
  v_tenant_b UUID := 'b0000000-0000-0000-0000-000000000002'::uuid;

  -- User UUIDs
  v_editor_a UUID := '11111111-1111-1111-1111-111111111111'::uuid;
  v_manager_a UUID := '22222222-2222-2222-2222-222222222222'::uuid;
  v_dual_user UUID := '33333333-3333-3333-3333-333333333333'::uuid;
  v_editor_b UUID := '55555555-5555-5555-5555-555555555555'::uuid;
  v_non_member UUID := '44444444-4444-4444-4444-444444444444'::uuid;

  -- Website UUIDs
  v_website_a UUID := 'a1111111-0000-0000-0000-000000000001'::uuid;
  v_website_b UUID := 'b1111111-0000-0000-0000-000000000001'::uuid;
  v_page_a UUID := 'a2222222-0000-0000-0000-000000000001'::uuid;

  -- Test Execution Variables
  v_res JSONB;
  v_row_count INTEGER;
  v_error_msg TEXT;
  v_error_sqlstate TEXT;
  v_caught BOOLEAN;
BEGIN
  RAISE NOTICE '=======================================================';
  RAISE NOTICE 'SEEDING FIXTURES FOR MIGRATION 168 TEST HARNESS';
  RAISE NOTICE '=======================================================';

  -- 0. Seed auth users (FK targets: entity_members.user_id and
  -- organizers.user_id both reference auth.users(id); profiles rows for these
  -- ids are auto-created by the handle_new_user trigger).
  -- NOTE: auth.* is Supabase-managed and NOT defined in db/ (could not verify
  -- column nullability from the repo). If this INSERT fails on a NOT NULL
  -- column, the whole transaction rolls back with the column named — add it
  -- and rerun. instance_id is read from the live auth.instances row.
  INSERT INTO auth.users (id, instance_id, aud, role, email)
  SELECT u.id, (SELECT id FROM auth.instances LIMIT 1), 'authenticated', 'authenticated', u.email
  FROM (VALUES
    (v_editor_a, 'h168-editor-a@test.com'),
    (v_manager_a, 'h168-manager-a@test.com'),
    (v_dual_user, 'h168-dual@test.com'),
    (v_editor_b, 'h168-editor-b@test.com'),
    (v_non_member, 'h168-non-member@test.com')
  ) AS u(id, email)
  ON CONFLICT (id) DO NOTHING;

  -- 1. Seed Organizers.
  -- NOTE: trg_organizers_seed_owner_member auto-inserts an 'owner' row for
  -- organizers.user_id, so v_manager_a / v_dual_user start as owners; the
  -- UPDATEs below set the exact roles this matrix needs.
  INSERT INTO public.organizers (id, name, slug, user_id)
  VALUES
    (v_tenant_a, 'Tenant Org A', 'h168-tenant-org-a', v_manager_a),
    (v_tenant_b, 'Tenant Org B', 'h168-tenant-org-b', v_dual_user)
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.entity_members SET role = 'manager'
  WHERE organizer_id = v_tenant_a AND user_id = v_manager_a;
  UPDATE public.entity_members SET role = 'manager'
  WHERE organizer_id = v_tenant_b AND user_id = v_dual_user;

  -- 2. Seed Entity Memberships
  INSERT INTO public.entity_members (organizer_id, user_id, role)
  VALUES
    (v_tenant_a, v_editor_a, 'editor'),
    (v_tenant_a, v_manager_a, 'manager'),
    (v_tenant_a, v_dual_user, 'editor'),
    (v_tenant_b, v_dual_user, 'manager'),
    (v_tenant_b, v_editor_b, 'editor')
  ON CONFLICT DO NOTHING;

  -- 3. Seed Websites + one page (page used for p_page_blocks scoping test).
  -- Slugs are h168-prefixed so they cannot collide with real staging rows
  -- (slug has a UNIQUE index; ON CONFLICT targets id only).
  INSERT INTO public.tenant_websites (id, tenant_id, site_title, slug, status)
  VALUES
    (v_website_a, v_tenant_a, 'Website A', 'h168-website-a', 'published'),
    (v_website_b, v_tenant_b, 'Website B', 'h168-website-b', 'published')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.website_pages (id, website_id, title, slug, is_home, status, blocks)
  VALUES
    (v_page_a, v_website_a, 'Home A', 'home', true, 'published', '[]'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  -- 4. Seed live content + working draft (version forced to 1 on insert)
  INSERT INTO public.website_content (website_id, content, updated_by)
  VALUES
    (v_website_a, '{"business_name":"Live Acme"}'::jsonb, v_manager_a)
  ON CONFLICT (website_id) DO UPDATE SET content = EXCLUDED.content;

  INSERT INTO public.website_content_drafts (website_id, content, updated_by, version)
  VALUES
    (v_website_a, '{"business_name":"Draft Acme"}'::jsonb, v_editor_a, 999)
  ON CONFLICT (website_id) DO UPDATE SET content = EXCLUDED.content;

  SELECT version INTO v_row_count FROM public.website_content_drafts WHERE website_id = v_website_a;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'FIXTURE SETUP FAILED: Draft version on INSERT was not forced to 1 (got %)', v_row_count;
  END IF;

  RAISE NOTICE 'Fixtures seeded successfully. Version forced to 1.';
  RAISE NOTICE '=======================================================';
  RAISE NOTICE 'STARTING TEST CASES';
  RAISE NOTICE '=======================================================';

  -- ──────────────────────────────────────────────────────────────────────────
  -- CASE 1: Editor INSERT on the LIVE content document MUST FAIL
  -- (live table is RPC-only: no INSERT/UPDATE/DELETE policies for authenticated)
  -- NOTE: SET LOCAL ROLE drops the editor session's superuser powers so RLS
  -- and GRANTs are actually enforced (as they are for real app connections).
  -- ──────────────────────────────────────────────────────────────────────────
  SET LOCAL ROLE authenticated;
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor_a, 'role', 'authenticated')::text, true);

  v_caught := false;
  BEGIN
    INSERT INTO public.website_content (website_id, content, updated_by)
    VALUES (v_website_b, '{"business_name":"Sneaky publish"}'::jsonb, v_editor_a);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_error_msg := SQLERRM;
    v_error_sqlstate := SQLSTATE;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Editor INSERT on live content was not denied';
  END IF;
  RAISE NOTICE '✔ TEST 1 PASSED: Editor INSERT on live content denied [%]: "%"', v_error_sqlstate, v_error_msg;

  -- ──────────────────────────────────────────────────────────────────────────
  -- CASE 2: Editor UPDATE on the live content document MUST FAIL
  -- (this is the "publish by writing the live row directly" path)
  -- ──────────────────────────────────────────────────────────────────────────
  v_caught := false;
  BEGIN
    UPDATE public.website_content
    SET content = '{"business_name":"Sneaky publish"}'::jsonb
    WHERE website_id = v_website_a;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_error_msg := SQLERRM;
    v_error_sqlstate := SQLSTATE;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Editor UPDATE on live content was not denied';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.website_content
    WHERE website_id = v_website_a
      AND content::text LIKE '%Sneaky publish%'
  ) THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Sneaky live content write persisted despite error';
  END IF;
  RAISE NOTICE '✔ TEST 2 PASSED: Editor UPDATE on live content denied, nothing persisted [%]: "%"', v_error_sqlstate, v_error_msg;

  -- ──────────────────────────────────────────────────────────────────────────
  -- CASE 3: Draft version auto-increments on UPDATE
  -- ──────────────────────────────────────────────────────────────────────────
  UPDATE public.website_content_drafts
  SET content = '{"business_name":"Draft v2"}'::jsonb
  WHERE website_id = v_website_a;

  SELECT version INTO v_row_count FROM public.website_content_drafts WHERE website_id = v_website_a;
  IF v_row_count <> 2 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Draft version was not bumped to 2 (got %)', v_row_count;
  END IF;
  RAISE NOTICE '✔ TEST 3 PASSED: Draft version bumped to 2 on UPDATE';

  -- ──────────────────────────────────────────────────────────────────────────
  -- CASE 4: publish_content_draft with stale expected version MUST RAISE 40001
  -- (service_role bypasses RLS; authz passes via service_role branch)
  -- ──────────────────────────────────────────────────────────────────────────
  SET LOCAL ROLE service_role;
  PERFORM set_config('role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_manager_a, 'role', 'service_role')::text, true);

  v_caught := false;
  BEGIN
    SELECT public.publish_content_draft(v_website_a, 1) INTO v_res;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_error_msg := SQLERRM;
    v_error_sqlstate := SQLSTATE;
  END;

  IF NOT v_caught OR v_error_sqlstate <> '40001' THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Stale publish did not raise 40001. Caught: %, SQLSTATE: %, Msg: %', v_caught, v_error_sqlstate, v_error_msg;
  END IF;
  RAISE NOTICE '✔ TEST 4 PASSED: Stale expected_version raised 40001';

  -- ──────────────────────────────────────────────────────────────────────────
  -- CASE 5: publish_content_draft with correct version publishes + writes pages
  -- ──────────────────────────────────────────────────────────────────────────
  v_caught := false;
  BEGIN
    SELECT public.publish_content_draft(
      v_website_a,
      2,
      jsonb_build_array(jsonb_build_object('page_id', v_page_a, 'blocks', jsonb_build_array()))
    ) INTO v_res;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_error_msg := SQLERRM;
    v_error_sqlstate := SQLSTATE;
  END;

  IF v_caught THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Correct-version publish raised [%]: "%"', v_error_sqlstate, v_error_msg;
  END IF;
  IF (v_res ->> 'version') <> '2' THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Publish did not return version 2 (got %)', v_res;
  END IF;
  IF (v_res ->> 'pages_written') <> '1' THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Publish did not write 1 page (got %)', v_res;
  END IF;
  IF EXISTS (SELECT 1 FROM public.website_content_drafts WHERE website_id = v_website_a) THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Draft was not cleared by publish';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.website_content
    WHERE website_id = v_website_a AND content::text LIKE '%Draft v2%'
  ) THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Live content was not updated by publish';
  END IF;
  RAISE NOTICE '✔ TEST 5 PASSED: Publish cleared draft, wrote live content + 1 page';

  -- ──────────────────────────────────────────────────────────────────────────
  -- CASE 6: p_page_blocks pointing at another website's page MUST RAISE P0002
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO public.website_content_drafts (website_id, content, updated_by)
  VALUES (v_website_b, '{"business_name":"B draft"}'::jsonb, v_dual_user)
  ON CONFLICT (website_id) DO UPDATE SET content = EXCLUDED.content;

  v_caught := false;
  BEGIN
    SELECT public.publish_content_draft(
      v_website_b,
      NULL,
      jsonb_build_array(jsonb_build_object('page_id', v_page_a, 'blocks', jsonb_build_array()))
    ) INTO v_res;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_error_msg := SQLERRM;
    v_error_sqlstate := SQLSTATE;
  END;

  IF NOT v_caught OR v_error_sqlstate <> 'P0002' THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Cross-website page write did not raise P0002. Caught: %, SQLSTATE: %, Msg: %', v_caught, v_error_sqlstate, v_error_msg;
  END IF;
  RAISE NOTICE '✔ TEST 6 PASSED: Cross-website p_page_blocks entry raised P0002';

  -- ──────────────────────────────────────────────────────────────────────────
  -- CASE 7A: Anon select MUST RAISE 42501 (REVOKE, no anon policy)
  -- ──────────────────────────────────────────────────────────────────────────
  SET LOCAL ROLE anon;
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

  v_caught := false;
  BEGIN
    SELECT COUNT(*) INTO v_row_count FROM public.website_content_drafts;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_error_msg := SQLERRM;
    v_error_sqlstate := SQLSTATE;
  END;

  IF NOT v_caught OR v_error_sqlstate <> '42501' THEN
    RAISE EXCEPTION 'TEST 7A FAILED: Anon select did not raise 42501. Caught: %, SQLSTATE: %, Msg: %', v_caught, v_error_sqlstate, v_error_msg;
  END IF;
  RAISE NOTICE '✔ TEST 7A PASSED: Anon draft select rejected [%]: "%"', v_error_sqlstate, v_error_msg;

  -- 7B: Authenticated non-member MUST RETURN 0 rows (RLS filtering)
  SET LOCAL ROLE authenticated;
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_non_member, 'role', 'authenticated')::text, true);

  SELECT COUNT(*) INTO v_row_count FROM public.website_content_drafts;
  IF v_row_count <> 0 THEN
    RAISE EXCEPTION 'TEST 7B FAILED: Non-member saw % draft rows (expected 0 via RLS)', v_row_count;
  END IF;
  RAISE NOTICE '✔ TEST 7B PASSED: Non-member draft select returned 0 rows via RLS';

  -- ──────────────────────────────────────────────────────────────────────────
  -- CASE 8: Editor in Tenant B reading Tenant A content MUST RETURN 0 rows
  -- ──────────────────────────────────────────────────────────────────────────
  SET LOCAL ROLE authenticated;
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor_b, 'role', 'authenticated')::text, true);

  SELECT COUNT(*) INTO v_row_count FROM public.website_content;
  IF v_row_count <> 0 THEN
    RAISE EXCEPTION 'TEST 8 FAILED: Editor in Tenant B saw % content rows from Tenant A (expected 0 via RLS)', v_row_count;
  END IF;
  RAISE NOTICE '✔ TEST 8 PASSED: Cross-tenant content select returned 0 rows via RLS';

  -- ──────────────────────────────────────────────────────────────────────────
  -- CASE 9: Manager direct UPDATE/DELETE on live content MUST FAIL (RPC-only)
  -- ──────────────────────────────────────────────────────────────────────────
  SET LOCAL ROLE authenticated;
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_manager_a, 'role', 'authenticated')::text, true);

  v_caught := false;
  BEGIN
    UPDATE public.website_content
    SET content = '{"business_name":"Manager bypass"}'::jsonb
    WHERE website_id = v_website_a;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_error_msg := SQLERRM;
    v_error_sqlstate := SQLSTATE;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'TEST 9A FAILED: Manager direct UPDATE on live content was not denied';
  END IF;
  RAISE NOTICE '✔ TEST 9A PASSED: Manager direct UPDATE on live content denied [%]: "%"', v_error_sqlstate, v_error_msg;

  v_caught := false;
  BEGIN
    DELETE FROM public.website_content WHERE website_id = v_website_a;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_error_msg := SQLERRM;
    v_error_sqlstate := SQLSTATE;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'TEST 9B FAILED: Manager direct DELETE on live content was not denied';
  END IF;
  RAISE NOTICE '✔ TEST 9B PASSED: Manager direct DELETE on live content denied [%]: "%"', v_error_sqlstate, v_error_msg;

  RAISE NOTICE '=======================================================';
  RAISE NOTICE 'ALL 9 HARNESS CASES COMPLETED SUCCESSFULLY';
  RAISE NOTICE '=======================================================';
END $$;

ROLLBACK;

-- The SQL editor often hides RAISE NOTICE output, so this row is the pass
-- signal. Any failed case stops the script with an error naming the test
-- number before this line is reached.
select 'HARNESS PASSED: all 9 cases ran with no error, everything rolled back' as result;
