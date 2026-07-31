


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, role, status, preferences)
  VALUES (NEW.id, 'user', 'active', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_profile_role_status_self_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Role and status cannot be changed from account settings.';
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_profile_role_status_self_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_event_rating"("target_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."recalculate_event_rating"("target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_fundraiser_rating"("target_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."recalculate_fundraiser_rating"("target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_organizer_rating"("target_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."recalculate_organizer_rating"("target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_expired_seat_reservations"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE seats
  SET status = 'available', reserved_until = NULL
  WHERE status = 'reserved'
    AND reserved_until IS NOT NULL
    AND reserved_until < NOW();
END;
$$;


ALTER FUNCTION "public"."release_expired_seat_reservations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_articles_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();

  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at = now();
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_articles_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_fundraiser_raised"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."update_fundraiser_raised"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_rating_aggregates"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."update_rating_aggregates"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."articles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "organizer_id" "uuid",
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "excerpt" "text",
    "body" "text" NOT NULL,
    "cover_image_url" "text",
    "category" "text",
    "tags" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "seo_title" "text",
    "seo_description" "text",
    "canonical_url" "text",
    "visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "articles_body_check" CHECK (("char_length"(TRIM(BOTH FROM "body")) >= 20)),
    CONSTRAINT "articles_excerpt_check" CHECK ((("excerpt" IS NULL) OR ("char_length"("excerpt") <= 320))),
    CONSTRAINT "articles_seo_description_check" CHECK ((("seo_description" IS NULL) OR ("char_length"("seo_description") <= 180))),
    CONSTRAINT "articles_seo_title_check" CHECK ((("seo_title" IS NULL) OR ("char_length"("seo_title") <= 70))),
    CONSTRAINT "articles_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text")),
    CONSTRAINT "articles_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'expired'::"text", 'archived'::"text", 'rejected'::"text"]))),
    CONSTRAINT "articles_title_check" CHECK ((("char_length"(TRIM(BOTH FROM "title")) >= 3) AND ("char_length"(TRIM(BOTH FROM "title")) <= 180))),
    CONSTRAINT "articles_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."articles" OWNER TO "postgres";


COMMENT ON TABLE "public"."articles" IS 'Editorial articles published by Aldriva users. Optional business ownership is deferred until the businesses table exists.';



COMMENT ON COLUMN "public"."articles"."owner_id" IS 'Per-table owner reference to auth.users, matching the safer ownership pattern selected in the platform ADR.';



COMMENT ON COLUMN "public"."articles"."organizer_id" IS 'Optional current-platform publisher profile. Future business_id FK should be added in the businesses phase.';



CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "target_type" character varying(30) NOT NULL,
    "target_id" "uuid" NOT NULL,
    "author_name" character varying(120) DEFAULT 'Anonymous'::character varying,
    "author_email" character varying(255),
    "body" "text" NOT NULL,
    "status" character varying(30) DEFAULT 'approved'::character varying,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comments_body_check" CHECK ((("char_length"("body") >= 2) AND ("char_length"("body") <= 1000))),
    CONSTRAINT "comments_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['approved'::character varying, 'hidden'::character varying])::"text"[]))),
    CONSTRAINT "comments_target_type_check" CHECK ((("target_type")::"text" = ANY ((ARRAY['event'::character varying, 'fundraiser'::character varying])::"text"[])))
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."donations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fundraiser_id" "uuid",
    "donor_name" "text",
    "amount" numeric,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "status" character varying(50) DEFAULT 'succeeded'::character varying,
    "currency" "text" DEFAULT 'usd'::"text",
    "donor_email" "text",
    "stripe_session_id" "text",
    "message" "text",
    "payment_intent_id" "text",
    "receipt_path" character varying(512),
    "certificate_path" character varying(512),
    "payment_method" character varying(50) DEFAULT 'stripe'::character varying,
    CONSTRAINT "donations_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'succeeded'::character varying, 'completed'::character varying, 'failed'::character varying, 'refunded'::character varying])::"text"[])))
);


ALTER TABLE "public"."donations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."eventbrite_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organizer_id" "uuid",
    "organizer_name" "text" NOT NULL,
    "organizer_url" "text" NOT NULL,
    "organizer_eventbrite_id" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "last_synced_at" timestamp with time zone,
    "last_sync_message" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."eventbrite_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "venue" "text",
    "city" "text",
    "banner" "text",
    "event_date" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "user_id" "uuid",
    "video_url" "text",
    "organizer_id" "uuid",
    "latitude" double precision,
    "longitude" double precision,
    "visibility" "text" DEFAULT 'public'::"text",
    "status" "text" DEFAULT 'approved'::"text",
    "is_featured" boolean DEFAULT false,
    "featured_until" timestamp with time zone,
    "is_homepage_featured" boolean DEFAULT false,
    "source_organizer_description" "text",
    "source_organizer_name" "text",
    "source_organizer_url" "text",
    "homepage_position" integer DEFAULT 0,
    "average_rating" numeric(3,2) DEFAULT 0,
    "review_count" integer DEFAULT 0,
    "event_type" "text",
    "end_date" timestamp with time zone,
    "street_address" "text",
    "address_locality" "text",
    "address_region" "text",
    "postal_code" "text",
    "address_country" "text",
    "online_url" "text",
    "performer_name" "text",
    CONSTRAINT "events_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "events_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fundraiser_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fundraiser_id" "uuid" NOT NULL,
    "caption" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "url" "text" NOT NULL,
    "type" "text" DEFAULT 'image'::"text",
    "position" integer DEFAULT 0,
    CONSTRAINT "fundraiser_media_type_check" CHECK (("type" = ANY (ARRAY['image'::"text", 'video'::"text"])))
);


ALTER TABLE "public"."fundraiser_media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fundraiser_updates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fundraiser_id" "uuid",
    "organizer_id" "uuid",
    "title" "text",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."fundraiser_updates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fundraisers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "story" "text",
    "banner" "text",
    "goal" numeric,
    "raised" numeric DEFAULT 0,
    "organizer" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "user_id" "uuid",
    "video_url" "text",
    "is_featured" boolean DEFAULT false,
    "featured_until" timestamp with time zone,
    "is_homepage_featured" boolean DEFAULT false,
    "organizer_id" "uuid",
    "image_url" "text",
    "raised_amount" numeric DEFAULT 0,
    "homepage_position" integer DEFAULT 0,
    "average_rating" numeric(3,2) DEFAULT 0,
    "review_count" integer DEFAULT 0,
    "category" "text" DEFAULT 'Other'::"text" NOT NULL,
    CONSTRAINT "check_fundraiser_category" CHECK (("category" = ANY (ARRAY['Medical'::"text", 'Memorial'::"text", 'Emergency'::"text", 'Charity'::"text", 'Education'::"text", 'Animal'::"text", 'Environment'::"text", 'Business'::"text", 'Community'::"text", 'Competition'::"text", 'Creative'::"text", 'Event'::"text", 'Faith'::"text", 'Family'::"text", 'Sports'::"text", 'Travel'::"text", 'Volunteer'::"text", 'Wishes'::"text", 'Other'::"text"])))
);


ALTER TABLE "public"."fundraisers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gofundme_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "fundraiser_id" "uuid",
    "title" "text",
    "organizer" "text",
    "source_url" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "last_synced_at" timestamp with time zone,
    "last_sync_message" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."gofundme_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."homepage_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text" NOT NULL,
    "position" integer DEFAULT 0,
    "is_visible" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."homepage_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."homepage_sponsors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "logo_url" "text" DEFAULT ''::"text" NOT NULL,
    "website_url" "text" DEFAULT ''::"text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_visible" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."homepage_sponsors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."homepage_testimonials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "role" "text" DEFAULT ''::"text" NOT NULL,
    "photo_url" "text" DEFAULT ''::"text" NOT NULL,
    "quote" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_visible" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."homepage_testimonials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizer_follows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organizer_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."organizer_follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizer_visibility_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organizer_id" "uuid" NOT NULL,
    "admin_user_id" "uuid" NOT NULL,
    "field_name" character varying(50) NOT NULL,
    "old_value" integer NOT NULL,
    "new_value" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organizer_visibility_audit_field_name_check" CHECK ((("field_name")::"text" = ANY ((ARRAY['follower_offset'::character varying, 'events_offset'::character varying])::"text"[])))
);


ALTER TABLE "public"."organizer_visibility_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "bio" "text",
    "photo" "text",
    "facebook" "text",
    "twitter" "text",
    "website" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "banner" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "verified_at" timestamp with time zone,
    "visibility" "text" DEFAULT 'public'::"text",
    "follower_offset" integer DEFAULT 0 NOT NULL,
    "events_offset" integer DEFAULT 0 NOT NULL,
    "average_rating" numeric(3,2) DEFAULT 0,
    "review_count" integer DEFAULT 0,
    "organization_name" character varying(255),
    "tax_id" character varying(255),
    "nonprofit_registration_number" character varying(255),
    CONSTRAINT "organizers_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'rejected'::"text", 'suspended'::"text"]))),
    CONSTRAINT "organizers_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."organizers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_settings" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid"
);


ALTER TABLE "public"."platform_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'user'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "account_info" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "profile_photo" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "privacy_settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "display_name" "text",
    "avatar_url" "text",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'organizer'::"text", 'user'::"text"]))),
    CONSTRAINT "profiles_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_id" "uuid",
    "fundraiser_id" "uuid",
    "organizer_id" "uuid",
    "rating" integer NOT NULL,
    "title" "text",
    "review" "text",
    "is_verified" boolean DEFAULT false,
    "is_approved" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "review_type" "text" DEFAULT 'platform'::"text",
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "reviews_review_type_check" CHECK (("review_type" = ANY (ARRAY['event'::"text", 'fundraiser'::"text", 'organizer'::"text", 'platform'::"text"]))),
    CONSTRAINT "reviews_target_or_platform" CHECK (((("review_type" = 'platform'::"text") AND ("event_id" IS NULL) AND ("fundraiser_id" IS NULL) AND ("organizer_id" IS NULL)) OR (("review_type" <> 'platform'::"text") AND ((((("event_id" IS NOT NULL))::integer + (("fundraiser_id" IS NOT NULL))::integer) + (("organizer_id" IS NOT NULL))::integer) >= 1))))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "layout_id" "uuid" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "section" "text" NOT NULL,
    "row_label" "text" NOT NULL,
    "seat_number" integer NOT NULL,
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "reserved_until" timestamp with time zone,
    "ticket_id" "uuid",
    "price_override" numeric(12,2),
    CONSTRAINT "seats_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'reserved'::"text", 'sold'::"text"])))
);


ALTER TABLE "public"."seats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "ticket_id" "uuid",
    "seat_id" "uuid",
    "seat_label" "text",
    "buyer_email" "text",
    "buyer_name" "text",
    "quantity" integer DEFAULT 1 NOT NULL,
    "total_amount" numeric(12,2) NOT NULL,
    "qr_code" "text" NOT NULL,
    "status" "text" DEFAULT 'valid'::"text" NOT NULL,
    "stripe_session_id" "text",
    "checked_in_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "stripe_payment_intent_id" "text",
    "currency" "text" DEFAULT 'usd'::"text",
    "payment_method" character varying(50) DEFAULT 'stripe'::character varying,
    CONSTRAINT "ticket_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'valid'::"text", 'used'::"text", 'cancelled'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."ticket_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid",
    "name" "text",
    "price" numeric,
    "quantity" integer
);


ALTER TABLE "public"."tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."venue_layouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'Main Hall'::"text" NOT NULL,
    "sections" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."venue_layouts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_payment_intent_id_key" UNIQUE ("payment_intent_id");



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."eventbrite_sources"
    ADD CONSTRAINT "eventbrite_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."eventbrite_sources"
    ADD CONSTRAINT "eventbrite_sources_user_id_organizer_eventbrite_id_organize_key" UNIQUE ("user_id", "organizer_eventbrite_id", "organizer_id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."fundraiser_media"
    ADD CONSTRAINT "fundraiser_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fundraiser_updates"
    ADD CONSTRAINT "fundraiser_updates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fundraisers"
    ADD CONSTRAINT "fundraisers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fundraisers"
    ADD CONSTRAINT "fundraisers_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."gofundme_sources"
    ADD CONSTRAINT "gofundme_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gofundme_sources"
    ADD CONSTRAINT "gofundme_sources_user_id_source_url_key" UNIQUE ("user_id", "source_url");



ALTER TABLE ONLY "public"."homepage_categories"
    ADD CONSTRAINT "homepage_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."homepage_categories"
    ADD CONSTRAINT "homepage_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."homepage_sponsors"
    ADD CONSTRAINT "homepage_sponsors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."homepage_testimonials"
    ADD CONSTRAINT "homepage_testimonials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizer_follows"
    ADD CONSTRAINT "organizer_follows_organizer_id_user_id_key" UNIQUE ("organizer_id", "user_id");



ALTER TABLE ONLY "public"."organizer_follows"
    ADD CONSTRAINT "organizer_follows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizer_visibility_audit"
    ADD CONSTRAINT "organizer_visibility_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizers"
    ADD CONSTRAINT "organizers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seats"
    ADD CONSTRAINT "seats_layout_id_section_row_label_seat_number_key" UNIQUE ("layout_id", "section", "row_label", "seat_number");



ALTER TABLE ONLY "public"."seats"
    ADD CONSTRAINT "seats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_orders"
    ADD CONSTRAINT "ticket_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_orders"
    ADD CONSTRAINT "ticket_orders_qr_code_key" UNIQUE ("qr_code");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."venue_layouts"
    ADD CONSTRAINT "venue_layouts_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_articles_category" ON "public"."articles" USING "btree" ("category");



CREATE INDEX "idx_articles_organizer_id" ON "public"."articles" USING "btree" ("organizer_id");



CREATE INDEX "idx_articles_owner_id" ON "public"."articles" USING "btree" ("owner_id");



CREATE INDEX "idx_articles_public_listing" ON "public"."articles" USING "btree" ("status", "visibility", "published_at" DESC);



CREATE INDEX "idx_articles_tags" ON "public"."articles" USING "gin" ("tags");



CREATE INDEX "idx_comments_target" ON "public"."comments" USING "btree" ("target_type", "target_id", "status", "created_at" DESC);



CREATE INDEX "idx_eventbrite_sources_enabled" ON "public"."eventbrite_sources" USING "btree" ("enabled");



CREATE INDEX "idx_eventbrite_sources_user_id" ON "public"."eventbrite_sources" USING "btree" ("user_id");



CREATE INDEX "idx_events_is_featured" ON "public"."events" USING "btree" ("is_featured");



CREATE INDEX "idx_events_status" ON "public"."events" USING "btree" ("status");



CREATE INDEX "idx_events_visibility" ON "public"."events" USING "btree" ("visibility");



CREATE INDEX "idx_fundraiser_media_fundraiser_id" ON "public"."fundraiser_media" USING "btree" ("fundraiser_id");



CREATE INDEX "idx_fundraiser_media_position" ON "public"."fundraiser_media" USING "btree" ("fundraiser_id", "position");



CREATE INDEX "idx_fundraiser_updates_fundraiser_created" ON "public"."fundraiser_updates" USING "btree" ("fundraiser_id", "created_at" DESC);



CREATE INDEX "idx_fundraisers_category" ON "public"."fundraisers" USING "btree" ("category");



CREATE INDEX "idx_fundraisers_is_featured" ON "public"."fundraisers" USING "btree" ("is_featured");



CREATE INDEX "idx_fundraisers_organizer_id" ON "public"."fundraisers" USING "btree" ("organizer_id");



CREATE INDEX "idx_gofundme_sources_enabled" ON "public"."gofundme_sources" USING "btree" ("enabled");



CREATE INDEX "idx_gofundme_sources_user_id" ON "public"."gofundme_sources" USING "btree" ("user_id");



CREATE INDEX "idx_organizer_follows_organizer_id" ON "public"."organizer_follows" USING "btree" ("organizer_id");



CREATE INDEX "idx_organizer_follows_user_id" ON "public"."organizer_follows" USING "btree" ("user_id");



CREATE INDEX "idx_organizers_status" ON "public"."organizers" USING "btree" ("status");



CREATE INDEX "idx_organizers_visibility" ON "public"."organizers" USING "btree" ("visibility");



CREATE INDEX "idx_seats_event_id" ON "public"."seats" USING "btree" ("event_id");



CREATE INDEX "idx_seats_layout_id" ON "public"."seats" USING "btree" ("layout_id");



CREATE INDEX "idx_seats_status" ON "public"."seats" USING "btree" ("status");



CREATE INDEX "idx_ticket_orders_event_id" ON "public"."ticket_orders" USING "btree" ("event_id");



CREATE UNIQUE INDEX "idx_ticket_orders_payment_intent" ON "public"."ticket_orders" USING "btree" ("stripe_payment_intent_id");



CREATE INDEX "idx_ticket_orders_qr_code" ON "public"."ticket_orders" USING "btree" ("qr_code");



CREATE INDEX "idx_ticket_orders_stripe_session" ON "public"."ticket_orders" USING "btree" ("stripe_session_id");



CREATE UNIQUE INDEX "idx_unique_user_event_review" ON "public"."reviews" USING "btree" ("user_id", "event_id") WHERE ("event_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_unique_user_fundraiser_review" ON "public"."reviews" USING "btree" ("user_id", "fundraiser_id") WHERE ("fundraiser_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_unique_user_organizer_review" ON "public"."reviews" USING "btree" ("user_id", "organizer_id") WHERE ("organizer_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_unique_user_platform_review" ON "public"."reviews" USING "btree" ("user_id") WHERE ("review_type" = 'platform'::"text");



CREATE INDEX "idx_venue_layouts_event_id" ON "public"."venue_layouts" USING "btree" ("event_id");



CREATE OR REPLACE TRIGGER "prevent_profile_role_status_self_update" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_profile_role_status_self_update"();



CREATE OR REPLACE TRIGGER "trg_articles_updated_at" BEFORE INSERT OR UPDATE ON "public"."articles" FOR EACH ROW EXECUTE FUNCTION "public"."update_articles_updated_at"();



CREATE OR REPLACE TRIGGER "trg_update_fundraiser_raised" AFTER INSERT OR UPDATE ON "public"."donations" FOR EACH ROW EXECUTE FUNCTION "public"."update_fundraiser_raised"();



CREATE OR REPLACE TRIGGER "trg_update_rating_aggregates" AFTER INSERT OR DELETE OR UPDATE OF "rating", "is_approved", "event_id", "fundraiser_id", "organizer_id" ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_rating_aggregates"();



ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_fundraiser_id_fkey" FOREIGN KEY ("fundraiser_id") REFERENCES "public"."fundraisers"("id");



ALTER TABLE ONLY "public"."eventbrite_sources"
    ADD CONSTRAINT "eventbrite_sources_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."eventbrite_sources"
    ADD CONSTRAINT "eventbrite_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."fundraiser_media"
    ADD CONSTRAINT "fundraiser_media_fundraiser_id_fkey" FOREIGN KEY ("fundraiser_id") REFERENCES "public"."fundraisers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fundraiser_updates"
    ADD CONSTRAINT "fundraiser_updates_fundraiser_id_fkey" FOREIGN KEY ("fundraiser_id") REFERENCES "public"."fundraisers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fundraiser_updates"
    ADD CONSTRAINT "fundraiser_updates_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fundraisers"
    ADD CONSTRAINT "fundraisers_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fundraisers"
    ADD CONSTRAINT "fundraisers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."gofundme_sources"
    ADD CONSTRAINT "gofundme_sources_fundraiser_id_fkey" FOREIGN KEY ("fundraiser_id") REFERENCES "public"."fundraisers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gofundme_sources"
    ADD CONSTRAINT "gofundme_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizer_follows"
    ADD CONSTRAINT "organizer_follows_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizer_follows"
    ADD CONSTRAINT "organizer_follows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizer_visibility_audit"
    ADD CONSTRAINT "organizer_visibility_audit_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizer_visibility_audit"
    ADD CONSTRAINT "organizer_visibility_audit_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizers"
    ADD CONSTRAINT "organizers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_fundraiser_id_fkey" FOREIGN KEY ("fundraiser_id") REFERENCES "public"."fundraisers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seats"
    ADD CONSTRAINT "seats_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seats"
    ADD CONSTRAINT "seats_layout_id_fkey" FOREIGN KEY ("layout_id") REFERENCES "public"."venue_layouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_orders"
    ADD CONSTRAINT "ticket_orders_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_orders"
    ADD CONSTRAINT "ticket_orders_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "public"."seats"("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id");



ALTER TABLE ONLY "public"."venue_layouts"
    ADD CONSTRAINT "venue_layouts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



CREATE POLICY "Active users can create their own articles" ON "public"."articles" FOR INSERT WITH CHECK ((("auth"."uid"() = "owner_id") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."status" = 'active'::"text")))) AND (("organizer_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."organizers"
  WHERE (("organizers"."id" = "articles"."organizer_id") AND ("organizers"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Admins can manage all articles" ON "public"."articles" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text") AND ("profiles"."status" = 'active'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text") AND ("profiles"."status" = 'active'::"text")))));



CREATE POLICY "Admins can manage all reviews" ON "public"."reviews" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read all articles" ON "public"."articles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text") AND ("profiles"."status" = 'active'::"text")))));



CREATE POLICY "Admins can view audit logs" ON "public"."organizer_visibility_audit" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text") AND ("profiles"."status" = 'active'::"text")))));



CREATE POLICY "Allow public insert" ON "public"."events" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow public insert" ON "public"."fundraisers" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow public insert" ON "public"."tickets" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow public read access to homepage_categories" ON "public"."homepage_categories" FOR SELECT USING (true);



CREATE POLICY "Allow public select" ON "public"."events" FOR SELECT USING (true);



CREATE POLICY "Allow public select" ON "public"."fundraisers" FOR SELECT USING (true);



CREATE POLICY "Allow public select" ON "public"."tickets" FOR SELECT USING (true);



CREATE POLICY "Anyone can view follows" ON "public"."organizer_follows" FOR SELECT USING (true);



CREATE POLICY "Article owners can delete draft articles" ON "public"."articles" FOR DELETE USING ((("auth"."uid"() = "owner_id") AND ("status" = 'draft'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."status" = 'active'::"text"))))));



CREATE POLICY "Article owners can read their articles" ON "public"."articles" FOR SELECT USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Article owners can update their articles" ON "public"."articles" FOR UPDATE USING (("auth"."uid"() = "owner_id")) WITH CHECK ((("auth"."uid"() = "owner_id") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."status" = 'active'::"text")))) AND (("organizer_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."organizers"
  WHERE (("organizers"."id" = "articles"."organizer_id") AND ("organizers"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Authenticated users can create reviews" ON "public"."reviews" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can read settings" ON "public"."platform_settings" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Fundraiser media is publicly readable" ON "public"."fundraiser_media" FOR SELECT USING (true);



CREATE POLICY "Fundraisers are publicly readable" ON "public"."fundraisers" FOR SELECT USING (true);



CREATE POLICY "Organizer can manage their fundraiser media" ON "public"."fundraiser_media" USING (("fundraiser_id" IN ( SELECT "fundraisers"."id"
   FROM "public"."fundraisers"
  WHERE ("fundraisers"."organizer_id" IN ( SELECT "organizers"."id"
           FROM "public"."organizers"
          WHERE ("organizers"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Organizer can manage their updates" ON "public"."fundraiser_updates" USING (("organizer_id" IN ( SELECT "organizers"."id"
   FROM "public"."organizers"
  WHERE ("organizers"."user_id" = "auth"."uid"()))));



CREATE POLICY "Organizer follows are publicly readable" ON "public"."organizer_follows" FOR SELECT USING (true);



CREATE POLICY "Public can view fundraiser media" ON "public"."fundraiser_media" FOR SELECT USING (true);



CREATE POLICY "Public can view fundraiser updates" ON "public"."fundraiser_updates" FOR SELECT USING (true);



CREATE POLICY "Public organizers are readable" ON "public"."organizers" FOR SELECT USING ((("visibility" = 'public'::"text") OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Public read homepage_sponsors" ON "public"."homepage_sponsors" FOR SELECT USING (true);



CREATE POLICY "Public read homepage_testimonials" ON "public"."homepage_testimonials" FOR SELECT USING (true);



CREATE POLICY "Public read organizers" ON "public"."organizers" FOR SELECT USING (true);



CREATE POLICY "Published public articles are readable" ON "public"."articles" FOR SELECT USING ((("status" = 'published'::"text") AND ("visibility" = 'public'::"text")));



CREATE POLICY "Reviews are publicly readable" ON "public"."reviews" FOR SELECT USING ((("is_approved" = true) OR ("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Users can create fundraisers for their organizer profiles" ON "public"."fundraisers" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (("organizer_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."organizers"
  WHERE (("organizers"."id" = "fundraisers"."organizer_id") AND ("organizers"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Users can create media for their fundraisers" ON "public"."fundraiser_media" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."fundraisers"
     LEFT JOIN "public"."organizers" ON (("organizers"."id" = "fundraisers"."organizer_id")))
  WHERE (("fundraisers"."id" = "fundraiser_media"."fundraiser_id") AND (("fundraisers"."user_id" = "auth"."uid"()) OR ("organizers"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can create their Eventbrite sources" ON "public"."eventbrite_sources" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (("organizer_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."organizers"
  WHERE (("organizers"."id" = "eventbrite_sources"."organizer_id") AND ("organizers"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Users can create their GoFundMe sources" ON "public"."gofundme_sources" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete media for their fundraisers" ON "public"."fundraiser_media" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."fundraisers"
     LEFT JOIN "public"."organizers" ON (("organizers"."id" = "fundraisers"."organizer_id")))
  WHERE (("fundraisers"."id" = "fundraiser_media"."fundraiser_id") AND (("fundraisers"."user_id" = "auth"."uid"()) OR ("organizers"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can delete own events" ON "public"."events" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own fundraisers" ON "public"."fundraisers" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their Eventbrite sources" ON "public"."eventbrite_sources" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their GoFundMe sources" ON "public"."gofundme_sources" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their organizer fundraisers" ON "public"."fundraisers" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."organizers"
  WHERE (("organizers"."id" = "fundraisers"."organizer_id") AND ("organizers"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can delete their own reviews" ON "public"."reviews" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can follow organizers" ON "public"."organizer_follows" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own organizer" ON "public"."organizers" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their Eventbrite sources" ON "public"."eventbrite_sources" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their GoFundMe sources" ON "public"."gofundme_sources" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can unfollow organizers" ON "public"."organizer_follows" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update fundraisers for their organizer profiles" ON "public"."fundraisers" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."organizers"
  WHERE (("organizers"."id" = "fundraisers"."organizer_id") AND ("organizers"."user_id" = "auth"."uid"())))))) WITH CHECK ((("auth"."uid"() = "user_id") AND (("organizer_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."organizers"
  WHERE (("organizers"."id" = "fundraisers"."organizer_id") AND ("organizers"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Users can update media for their fundraisers" ON "public"."fundraiser_media" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."fundraisers"
     LEFT JOIN "public"."organizers" ON (("organizers"."id" = "fundraisers"."organizer_id")))
  WHERE (("fundraisers"."id" = "fundraiser_media"."fundraiser_id") AND (("fundraisers"."user_id" = "auth"."uid"()) OR ("organizers"."user_id" = "auth"."uid"())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."fundraisers"
     LEFT JOIN "public"."organizers" ON (("organizers"."id" = "fundraisers"."organizer_id")))
  WHERE (("fundraisers"."id" = "fundraiser_media"."fundraiser_id") AND (("fundraisers"."user_id" = "auth"."uid"()) OR ("organizers"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can update own events" ON "public"."events" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own fundraisers" ON "public"."fundraisers" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own organizer" ON "public"."organizers" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their Eventbrite sources" ON "public"."eventbrite_sources" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK ((("auth"."uid"() = "user_id") AND (("organizer_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."organizers"
  WHERE (("organizers"."id" = "eventbrite_sources"."organizer_id") AND ("organizers"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Users can update their GoFundMe sources" ON "public"."gofundme_sources" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own account settings" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own reviews" ON "public"."reviews" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."articles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."eventbrite_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fundraiser_media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fundraiser_updates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fundraisers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gofundme_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."homepage_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."homepage_sponsors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."homepage_testimonials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizer_follows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizer_visibility_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."venue_layouts" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_profile_role_status_self_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_profile_role_status_self_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_profile_role_status_self_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_event_rating"("target_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_event_rating"("target_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_event_rating"("target_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_fundraiser_rating"("target_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_fundraiser_rating"("target_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_fundraiser_rating"("target_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_organizer_rating"("target_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_organizer_rating"("target_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_organizer_rating"("target_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."release_expired_seat_reservations"() TO "anon";
GRANT ALL ON FUNCTION "public"."release_expired_seat_reservations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_expired_seat_reservations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_articles_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_articles_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_articles_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_fundraiser_raised"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_fundraiser_raised"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_fundraiser_raised"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_rating_aggregates"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_rating_aggregates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_rating_aggregates"() TO "service_role";



GRANT ALL ON TABLE "public"."articles" TO "anon";
GRANT ALL ON TABLE "public"."articles" TO "authenticated";
GRANT ALL ON TABLE "public"."articles" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON TABLE "public"."donations" TO "anon";
GRANT ALL ON TABLE "public"."donations" TO "authenticated";
GRANT ALL ON TABLE "public"."donations" TO "service_role";



GRANT ALL ON TABLE "public"."eventbrite_sources" TO "anon";
GRANT ALL ON TABLE "public"."eventbrite_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."eventbrite_sources" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."fundraiser_media" TO "anon";
GRANT ALL ON TABLE "public"."fundraiser_media" TO "authenticated";
GRANT ALL ON TABLE "public"."fundraiser_media" TO "service_role";



GRANT ALL ON TABLE "public"."fundraiser_updates" TO "anon";
GRANT ALL ON TABLE "public"."fundraiser_updates" TO "authenticated";
GRANT ALL ON TABLE "public"."fundraiser_updates" TO "service_role";



GRANT ALL ON TABLE "public"."fundraisers" TO "anon";
GRANT ALL ON TABLE "public"."fundraisers" TO "authenticated";
GRANT ALL ON TABLE "public"."fundraisers" TO "service_role";



GRANT ALL ON TABLE "public"."gofundme_sources" TO "anon";
GRANT ALL ON TABLE "public"."gofundme_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."gofundme_sources" TO "service_role";



GRANT ALL ON TABLE "public"."homepage_categories" TO "anon";
GRANT ALL ON TABLE "public"."homepage_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."homepage_categories" TO "service_role";



GRANT ALL ON TABLE "public"."homepage_sponsors" TO "anon";
GRANT ALL ON TABLE "public"."homepage_sponsors" TO "authenticated";
GRANT ALL ON TABLE "public"."homepage_sponsors" TO "service_role";



GRANT ALL ON TABLE "public"."homepage_testimonials" TO "anon";
GRANT ALL ON TABLE "public"."homepage_testimonials" TO "authenticated";
GRANT ALL ON TABLE "public"."homepage_testimonials" TO "service_role";



GRANT ALL ON TABLE "public"."organizer_follows" TO "anon";
GRANT ALL ON TABLE "public"."organizer_follows" TO "authenticated";
GRANT ALL ON TABLE "public"."organizer_follows" TO "service_role";



GRANT ALL ON TABLE "public"."organizer_visibility_audit" TO "anon";
GRANT ALL ON TABLE "public"."organizer_visibility_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."organizer_visibility_audit" TO "service_role";



GRANT ALL ON TABLE "public"."organizers" TO "anon";
GRANT ALL ON TABLE "public"."organizers" TO "authenticated";
GRANT ALL ON TABLE "public"."organizers" TO "service_role";



GRANT ALL ON TABLE "public"."platform_settings" TO "anon";
GRANT ALL ON TABLE "public"."platform_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_settings" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."seats" TO "anon";
GRANT ALL ON TABLE "public"."seats" TO "authenticated";
GRANT ALL ON TABLE "public"."seats" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_orders" TO "anon";
GRANT ALL ON TABLE "public"."ticket_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_orders" TO "service_role";



GRANT ALL ON TABLE "public"."tickets" TO "anon";
GRANT ALL ON TABLE "public"."tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."tickets" TO "service_role";



GRANT ALL ON TABLE "public"."venue_layouts" TO "anon";
GRANT ALL ON TABLE "public"."venue_layouts" TO "authenticated";
GRANT ALL ON TABLE "public"."venue_layouts" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







