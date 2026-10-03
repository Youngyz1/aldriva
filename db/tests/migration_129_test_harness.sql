-- db/tests/migration_129_test_harness.sql
--
-- Fixture-Driven SQL Test Harness for migration_129 & Security Invariants.
-- Uses isolated transaction with ROLLBACK to leave zero persistent test artifacts.
--
-- Roles tested:
-- 1. editor_user_a: Editor in Tenant A.
-- 2. manager_user_a: Manager in Tenant A.
-- 3. dual_role_user: Editor in Tenant A, Manager in Tenant B.
-- 4. editor_user_b: Editor in Tenant B only.
-- 5. non_member_user: Authenticated user with no memberships.
-- 6. anon: Unauthenticated visitor.

BEGIN;

-- ── 0. Create Test Schema / Apply Migration 129 in Transaction ──────────────

\i db/migration_129_website_page_drafts_and_publishing_guard.sql

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
  
  -- Website & Page UUIDs
  v_website_a UUID := 'a1111111-0000-0000-0000-000000000001'::uuid;
  v_website_b UUID := 'b1111111-0000-0000-0000-000000000001'::uuid;
  v_page_a_live UUID := 'a2222222-0000-0000-0000-000000000001'::uuid;
  v_page_a_draft UUID := 'a2222222-0000-0000-0000-000000000002'::uuid;
  v_page_b_live UUID := 'b2222222-0000-0000-0000-000000000001'::uuid;

  -- Test Execution Variables
  v_res JSONB;
  v_row_count INTEGER;
  v_error_msg TEXT;
  v_error_sqlstate TEXT;
  v_caught BOOLEAN;
BEGIN
  RAISE NOTICE '=======================================================';
  RAISE NOTICE 'SEEDING FIXTURES FOR MIGRATION 129 TEST HARNESS';
  RAISE NOTICE '=======================================================';

  -- 1. Seed Profiles
  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES
    (v_editor_a, 'editor_a@test.com', 'Editor A', 'user', 'active'),
    (v_manager_a, 'manager_a@test.com', 'Manager A', 'user', 'active'),
    (v_dual_user, 'dual_user@test.com', 'Dual Role User', 'user', 'active'),
    (v_editor_b, 'editor_b@test.com', 'Editor B', 'user', 'active'),
    (v_non_member, 'non_member@test.com', 'Non Member User', 'user', 'active')
  ON CONFLICT (id) DO NOTHING;

  -- 2. Seed Organizers
  INSERT INTO public.organizers (id, name, slug, user_id)
  VALUES
    (v_tenant_a, 'Tenant Org A', 'tenant-org-a', v_manager_a),
    (v_tenant_b, 'Tenant Org B', 'tenant-org-b', v_dual_user)
  ON CONFLICT (id) DO NOTHING;

  -- 3. Seed Entity Memberships
  INSERT INTO public.entity_members (organizer_id, user_id, role)
  VALUES
    (v_tenant_a, v_editor_a, 'editor'),
    (v_tenant_a, v_manager_a, 'manager'),
    (v_tenant_a, v_dual_user, 'editor'),
    (v_tenant_b, v_dual_user, 'manager'),
    (v_tenant_b, v_editor_b, 'editor')
  ON CONFLICT DO NOTHING;

  -- 4. Seed Websites
  INSERT INTO public.tenant_websites (id, tenant_id, site_title, slug, status)
  VALUES
    (v_website_a, v_tenant_a, 'Website A', 'website-a', 'published'),
    (v_website_b, v_tenant_b, 'Website B', 'website-b', 'published')
  ON CONFLICT (id) DO NOTHING;

  -- 5. Seed Pages
  INSERT INTO public.website_pages (id, website_id, title, slug, is_home, status, blocks)
  VALUES
    (v_page_a_live, v_website_a, 'Home A', 'home', true, 'published', '[{"id":"b1","type":"hero"}]'::jsonb),
    (v_page_a_draft, v_website_a, 'About A', 'about', false, 'draft', '[]'::jsonb),
    (v_page_b_live, v_website_b, 'Home B', 'home', true, 'published', '[{"id":"b2","type":"hero"}]'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  -- 6. Seed Working Draft (test version force on insert)
  INSERT INTO public.website_page_drafts (page_id, blocks, updated_by, version)
  VALUES
    (v_page_a_draft, '[{"id":"draft_b1","type":"hero","content":{"headline":"New About Draft"}}]'::jsonb, v_editor_a, 999)
  ON CONFLICT (page_id) DO UPDATE SET blocks = EXCLUDED.blocks;

  -- Verify version forced to 1 on insert despite client claiming 999
  SELECT version INTO v_row_count FROM public.website_page_drafts WHERE page_id = v_page_a_draft;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'FIXTURE SETUP FAILED: Draft version on INSERT was not forced to 1 (got %)', v_row_count;
  END IF;

  RAISE NOTICE 'Fixtures seeded successfully. Version forced to 1.';
  RAISE NOTICE '=======================================================';
  RAISE NOTICE 'STARTING TEST CASES';
  RAISE NOTICE '=======================================================';

  -- ──────────────────────────────────────────────────────────────────────────
  -- CASE 1: Editor direct blocks update on a live page MUST RAISE P0001
  -- ──────────────────────────────────────────────────────────────────────────
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor_a, 'role', 'authenticated')::text, true);

  v_caught := false;
  BEGIN
    UPDATE public.website_pages
    SET blocks = '[{"id":"hacked_b1","type":"hero"}]'::jsonb
    WHERE id = v_page_a_live;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_error_msg := SQLERRM;
    v_error_sqlstate := SQLSTATE;
  END;

  IF NOT v_caught OR v_error_sqlstate <> 'P0001' OR v_error_msg NOT LIKE '%Only owners, admins, and managers can publish live page blocks directly%' THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Editor direct blocks update did not raise expected error. Caught: %, SQLSTATE: %, Msg: %', v_caught, v_error_sqlstate, v_error_msg;
  END IF;
  RAISE NOTICE '✔ TEST 1 PASSED: Editor direct blocks update raised [%]: "%"', v_error_sqlstate, v_error_msg;

  -- ──────────────────────────────────────────────────────────────────────────
  -- CASE 2: Editor insert with status='published' MUST RAISE P0001
  -- ──────────────────────────────────────────────────────────────────────────
  v_caught := false;
  BEGIN
    INSERT INTO public.website_pages (website_id, title, slug, is_home, status, blocks)
    VALUES (v_website_a, 'Editor Published Page', 'editor-published', false, 'published', '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_error_msg := SQLERRM;
    v_error_sqlstate := SQLSTATE;
  END;

  IF NOT v_caught OR v_error_sqlstate <> 'P0001' OR v_error_msg NOT LIKE '%Only owners, admins, and managers can publish website pages directly%' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Editor insert with published status did not raise expected error. Caught: %, SQLSTATE: %, Msg: %', v_caught, v_error_sqlstate, v_error_msg;
  END IF;
  RAISE NOTICE '✔ TEST 2 PASSED: Editor insert with status=published raised [%]: "%"', v_error_sqlstate, v_error_msg;

  -- ──────────────────────────────────────────────────────────────────────────
  -- CASE 3: Cross-tenant website_id move by dual-role user MUST RAISE P0001
  -- (Editor in Tenant A, Manager in Tenant B attempting to reparent Page A to Website B)
  -- ──────────────────────────────────────────────────────────────────────────
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dual_user, 'role', 'authenticated')::text, true);

  v_caught := false;
  BEGIN
    UPDATE public.website_pages
    SET website_id = v_website_b
    WHERE id = v_page_a_live;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_error_msg := SQLERRM;
    v_error_sqlstate := SQLSTATE;
  END;

  IF NOT v_caught OR v_error_sqlstate <> 'P0001' OR v_error_msg NOT LIKE '%Page website_id is immutable and cannot be moved across websites%' THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Cross-tenant website_id move did not raise expected immutable error. Caught: %, SQLSTATE: %, Msg: %', v_caught, v_error_sqlstate, v_error_msg;
  END IF;
  RAISE NOTICE '✔ TEST 3 PASSED: Cross-tenant website_id move raised [%]: "%"', v_error_sqlstate, v_error_msg;

  -- ──────────────────────────────────────────────────────────────────────────
  -- CASE 4: Manager runs publish_page_draft with draft present MUST SUCCEED
  -- ──────────────────────────────────────────────────────────────────────────
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_manager_a, 'role', 'authenticated')::text, true);

  v_res := public.publish_page_draft(v_page_a_draft);

  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Manager publish_page_draft returned unsuccessful: %', v_res;
  END IF;

  -- Verify live page updated with draft blocks and status='published'
  IF NOT EXISTS (
    SELECT 1 FROM public.website_pages
    WHERE id = v_page_a_draft
      AND status = 'published'
      AND blocks::text LIKE '%New About Draft%'
  ) THEN
    RAISE EXCEPTION 'TEST 4 FAILED: website_pages was not updated with published draft blocks';
  END IF;

  -- Verify draft row was atomically cleared
  IF EXISTS (SELECT 1 FROM public.website_page_drafts WHERE page_id = v_page_a_draft) THEN
    RAISE EXCEPTION 'TEST 4 FAILED: website_page_drafts row was not cleared by publish_page_draft';
  END IF;

  RAISE NOTICE '✔ TEST 4 PASSED: Manager publish_page_draft succeeded: %', v_res;

  -- ──────────────────────────────────────────────────────────────────────────
  -- CASE 5: Editor and Non-Member run publish_page_draft MUST RAISE P0001 "Forbidden"
  -- ──────────────────────────────────────────────────────────────────────────
  -- 5A: Editor
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor_a, 'role', 'authenticated')::text, true);

  v_caught := false;
  BEGIN
    PERFORM public.publish_page_draft(v_page_a_live);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_error_msg := SQLERRM;
    v_error_sqlstate := SQLSTATE;
  END;

  IF NOT v_caught OR v_error_sqlstate <> 'P0001' OR v_error_msg NOT LIKE '%Forbidden: only owners, admins, and managers can publish page drafts%' THEN
    RAISE EXCEPTION 'TEST 5A FAILED: Editor publish_page_draft did not raise Forbidden. Caught: %, SQLSTATE: %, Msg: %', v_caught, v_error_sqlstate, v_error_msg;
  END IF;
  RAISE NOTICE '✔ TEST 5A PASSED: Editor publish_page_draft raised [%]: "%"', v_error_sqlstate, v_error_msg;

  -- 5B: Non-member
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_non_member, 'role', 'authenticated')::text, true);

  v_caught := false;
  BEGIN
    PERFORM public.publish_page_draft(v_page_a_live);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_error_msg := SQLERRM;
    v_error_sqlstate := SQLSTATE;
  END;

  IF NOT v_caught OR v_error_sqlstate <> 'P0001' OR v_error_msg NOT LIKE '%Forbidden: only owners, admins, and managers can publish page drafts%' THEN
    RAISE EXCEPTION 'TEST 5B FAILED: Non-member publish_page_draft did not raise Forbidden. Caught: %, SQLSTATE: %, Msg: %', v_caught, v_error_sqlstate, v_error_msg;
  END IF;
  RAISE NOTICE '✔ TEST 5B PASSED: Non-member publish_page_draft raised [%]: "%"', v_error_sqlstate, v_error_msg;

  -- ──────────────────────────────────────────────────────────────────────────
  -- CASE 6: publish_page_draft with NO draft present MUST RAISE P0001
  -- ──────────────────────────────────────────────────────────────────────────
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_manager_a, 'role', 'authenticated')::text, true);

  v_caught := false;
  BEGIN
    -- v_page_a_draft was already published and cleared in Case 4
    PERFORM public.publish_page_draft(v_page_a_draft);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_error_msg := SQLERRM;
    v_error_sqlstate := SQLSTATE;
  END;

  IF NOT v_caught OR v_error_sqlstate <> 'P0001' OR v_error_msg NOT LIKE '%No draft found for page%' THEN
    RAISE EXCEPTION 'TEST 6 FAILED: publish_page_draft with no draft did not raise expected error. Caught: %, SQLSTATE: %, Msg: %', v_caught, v_error_sqlstate, v_error_msg;
  END IF;
  RAISE NOTICE '✔ TEST 6 PASSED: publish_page_draft with no draft raised [%]: "%"', v_error_sqlstate, v_error_msg;

  -- ──────────────────────────────────────────────────────────────────────────
  -- CASE 7: Anon raises 42501 (table grant REVOKE); Authenticated non-member returns 0 rows (RLS)
  -- ──────────────────────────────────────────────────────────────────────────
  -- Re-seed a draft row for testing read access
  INSERT INTO public.website_page_drafts (page_id, blocks, updated_by)
  VALUES (v_page_a_live, '[{"id":"draft_rls"}]'::jsonb, v_editor_a);

  -- 7A: Anon visitor MUST RAISE 42501 (permission denied at table grant level)
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

  v_caught := false;
  BEGIN
    SELECT COUNT(*) INTO v_row_count FROM public.website_page_drafts;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_error_msg := SQLERRM;
    v_error_sqlstate := SQLSTATE;
  END;

  IF NOT v_caught OR v_error_sqlstate <> '42501' THEN
    RAISE EXCEPTION 'TEST 7A FAILED: Anon select did not raise 42501 permission denied. Caught: %, SQLSTATE: %, Msg: %', v_caught, v_error_sqlstate, v_error_msg;
  END IF;
  RAISE NOTICE '✔ TEST 7A PASSED: Anon visitor select correctly rejected with table permission error [%]: "%"', v_error_sqlstate, v_error_msg;

  -- 7B: Authenticated cross-tenant non-member user MUST RETURN 0 rows (RLS filtering)
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_non_member, 'role', 'authenticated')::text, true);

  SELECT COUNT(*) INTO v_row_count FROM public.website_page_drafts;
  IF v_row_count <> 0 THEN
    RAISE EXCEPTION 'TEST 7B FAILED: Cross-tenant non-member user saw % draft rows (expected 0 via RLS)', v_row_count;
  END IF;
  RAISE NOTICE '✔ TEST 7B PASSED: Cross-tenant authenticated non-member select returned % rows via RLS', v_row_count;

  -- ──────────────────────────────────────────────────────────────────────────
  -- CASE 8: Non-admin fundraiser activation MUST RAISE P0001
  -- ──────────────────────────────────────────────────────────────────────────
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_manager_a, 'role', 'authenticated')::text, true);

  INSERT INTO public.fundraisers (id, user_id, organizer_id, title, slug, goal_amount, status)
  VALUES ('f0000000-0000-0000-0000-000000000001'::uuid, v_manager_a, v_tenant_a, 'Fundraiser A', 'fundraiser-a', 5000, 'draft')
  ON CONFLICT (id) DO NOTHING;

  v_caught := false;
  BEGIN
    UPDATE public.fundraisers
    SET status = 'active'
    WHERE id = 'f0000000-0000-0000-0000-000000000001'::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_error_msg := SQLERRM;
    v_error_sqlstate := SQLSTATE;
  END;

  IF NOT v_caught OR v_error_sqlstate <> 'P0001' OR v_error_msg NOT LIKE '%Only an admin can set fundraiser status to active%' THEN
    RAISE EXCEPTION 'TEST 8 FAILED: Non-admin fundraiser activation did not raise expected error. Caught: %, SQLSTATE: %, Msg: %', v_caught, v_error_sqlstate, v_error_msg;
  END IF;
  RAISE NOTICE '✔ TEST 8 PASSED: Non-admin fundraiser activation raised [%]: "%"', v_error_sqlstate, v_error_msg;

  -- ──────────────────────────────────────────────────────────────────────────
  -- CASE 9: Manager doing a plain UPDATE blocks MUST SUCCEED
  -- ──────────────────────────────────────────────────────────────────────────
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_manager_a, 'role', 'authenticated')::text, true);

  UPDATE public.website_pages
  SET blocks = '[{"id":"manager_updated_block","type":"hero"}]'::jsonb
  WHERE id = v_page_a_live;

  IF NOT EXISTS (
    SELECT 1 FROM public.website_pages
    WHERE id = v_page_a_live
      AND blocks::text LIKE '%manager_updated_block%'
  ) THEN
    RAISE EXCEPTION 'TEST 9 FAILED: Manager plain blocks update did not persist';
  END IF;
  RAISE NOTICE '✔ TEST 9 PASSED: Manager plain UPDATE blocks succeeded and persisted';

  -- ──────────────────────────────────────────────────────────────────────────
  -- CASE 10: Editor in Tenant B reading Tenant A drafts MUST RETURN 0 rows
  -- ──────────────────────────────────────────────────────────────────────────
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor_b, 'role', 'authenticated')::text, true);

  SELECT COUNT(*) INTO v_row_count FROM public.website_page_drafts;
  IF v_row_count <> 0 THEN
    RAISE EXCEPTION 'TEST 10 FAILED: Editor in Tenant B saw % drafts from Tenant A (expected 0 via RLS)', v_row_count;
  END IF;
  RAISE NOTICE '✔ TEST 10 PASSED: Editor in Tenant B select on Tenant A drafts returned % rows via RLS', v_row_count;

  -- ──────────────────────────────────────────────────────────────────────────
  -- MUTATION TEST 1: Guard Trigger Dropped -> Editor direct blocks update now passes
  -- (Proves the guard trigger was what blocked it in Case 1)
  -- ──────────────────────────────────────────────────────────────────────────
  DROP TRIGGER trg_enforce_website_page_publishing_guard ON public.website_pages;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor_a, 'role', 'authenticated')::text, true);

  v_caught := false;
  BEGIN
    UPDATE public.website_pages
    SET blocks = '[{"id":"mutation_editor_block","type":"hero"}]'::jsonb
    WHERE id = v_page_a_live;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_error_msg := SQLERRM;
  END;

  IF v_caught THEN
    RAISE EXCEPTION 'MUTATION 1 FAILED: Expected editor update to pass when trigger dropped, but got error: %', v_error_msg;
  END IF;
  RAISE NOTICE '✔ MUTATION 1 PASSED: Dropping guard trigger allowed editor update (proves trigger is authoritative)';

  -- Recreate trigger for consistency
  CREATE TRIGGER trg_enforce_website_page_publishing_guard
    BEFORE INSERT OR UPDATE ON public.website_pages
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_website_page_publishing_guard();

  -- ──────────────────────────────────────────────────────────────────────────
  -- MUTATION TEST 2: Grant SELECT to anon -> Anon select passes with 0 rows (RLS)
  -- (Proves the REVOKE was what caused 42501 in Case 7A)
  -- ──────────────────────────────────────────────────────────────────────────
  GRANT SELECT ON TABLE public.website_page_drafts TO anon;

  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

  v_caught := false;
  BEGIN
    SELECT COUNT(*) INTO v_row_count FROM public.website_page_drafts;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_error_msg := SQLERRM;
  END;

  IF v_caught OR v_row_count <> 0 THEN
    RAISE EXCEPTION 'MUTATION 2 FAILED: Expected anon to pass DAC and return 0 rows via RLS, but got: caught=%, count=%', v_caught, v_row_count;
  END IF;
  RAISE NOTICE '✔ MUTATION 2 PASSED: Granting table SELECT allowed anon to pass DAC and return 0 rows via RLS (proves REVOKE caused 42501)';

  RAISE NOTICE '=======================================================';
  RAISE NOTICE 'ALL 10 TESTS AND 2 MUTATION TESTS COMPLETED SUCCESSFULLY';
  RAISE NOTICE '=======================================================';
END $$;

ROLLBACK;
