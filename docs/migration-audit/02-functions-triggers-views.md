# Functions, Triggers, and Views

**Audit date**: 2026-07-23, read-only. Full verbatim SQL for every object below lives in `sql/003_functions.sql`, `sql/004_triggers.sql`, and `sql/007_views.sql`.

## Summary

| Object type | Count |
|---|---|
| Functions (`public`) | 19 |
| Triggers on `public` tables | 11 |
| Triggers on `auth.users` | 1 |
| Views (`public`) | 2 |
| Materialized views | 0 |

`pg_cron` is **not installed** (`SELECT * FROM cron.job` fails — relation doesn't exist), so there is no scheduled-job configuration to migrate. No materialized views means no `REFRESH` scheduling concern either.

## Migration-critical: `handle_new_user` on `auth.users`

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
```

`handle_new_user()` is `SECURITY DEFINER`, correctly pins `search_path = public`, and upserts a matching `public.profiles` row (`role='user'`, `status='active'`, `preferences='{}'`) on every new `auth.users` insert, idempotently (`ON CONFLICT (id) DO NOTHING`).

**This must exist — function, then `profiles` table, then trigger — before the new project accepts its first signup.** Without it, new `auth.users` rows get no corresponding `profiles` row, which breaks:
- Every RLS policy that checks `profiles.status`/`profiles.role` (i.e. almost every admin-check and active-user-check policy in `sql/006_rls_policies.sql`).
- `lib/auth.ts`'s `requireAuth`/`requireAdmin`/`getCurrentUserProfile` helpers, which read `profiles`.

## Functions — dependency order

Postgres doesn't validate that referenced objects exist at `CREATE FUNCTION` time (only syntax is checked), so nothing technically *blocks* an arbitrary order — but this order is logically correct and is what `sql/003_functions.sql` follows:

1. `recalculate_event_rating(uuid)` — plain `void`-returning helper
2. `recalculate_fundraiser_rating(uuid)`
3. `recalculate_organizer_rating(uuid)`
4. `update_rating_aggregates()` — trigger fn; calls 1–3 via `PERFORM`
5. `update_articles_updated_at()` — trigger fn
6. `enforce_article_status_transition()` — trigger fn
7. `update_businesses_updated_at()` — trigger fn
8. `enforce_business_status_transition()` — trigger fn
9. `update_fundraiser_raised()` — trigger fn
10. `enforce_fundraiser_status_transition()` — trigger fn
11. `update_product_orders_updated_at()` — trigger fn
12. `update_products_updated_at()` — trigger fn
13. `enforce_product_status_transition()` — trigger fn
14. `prevent_profile_role_status_self_update()` — trigger fn
15. `release_expired_seat_reservations()` — RPC, **not trigger-fired anywhere**; something external (app cron / Vercel cron / manual) must call it. No `pg_cron` job exists in production calling it either — track down what actually invokes this before assuming it runs on its own.
16. `get_total_raised()` — RPC, `SECURITY DEFINER`, `search_path` pinned
17. `get_comment_like_counts(uuid[])` — RPC, `SECURITY DEFINER`, `search_path` pinned. **This is the access path for `comment_likes`**, which has RLS enabled with zero policies (direct table access is closed to anon/authenticated).
18. `check_email_pending_deletion(text)` — RPC, `SECURITY DEFINER`, **search_path NOT pinned — see risk notes**
19. `handle_new_user()` — trigger fn on `auth.users`; must precede `on_auth_user_created`

## Security-definer functions (4 of 19)

| Function | search_path pinned? | Directly RPC-callable? |
|---|---|---|
| `check_email_pending_deletion` | **No — the one genuine risk** | Yes (anon + authenticated) |
| `get_comment_like_counts` | Yes | Yes |
| `get_total_raised` | Yes | Yes |
| `handle_new_user` | Yes | Yes (as a trigger fn, direct calls are pointless but the grant exists) |

The other 15 functions are `SECURITY INVOKER` (run with the caller's own privileges) and none of them pin `search_path` — a lower-severity hygiene gap, not a privilege-escalation vector, since invoker-context execution can't do anything the caller couldn't already do directly. All 19 functions are reproduced exactly as they exist in production (see `sql/003_functions.sql`); see `RECOMMENDATIONS.md` items 7-8 for optional follow-up, out of scope for this migration.

## Triggers on `public` tables (11)

| Trigger | Table | Timing | Events | Function |
|---|---|---|---|---|
| `trg_articles_updated_at` | `articles` | BEFORE | INSERT OR UPDATE | `update_articles_updated_at` |
| `trg_enforce_article_status_transition` | `articles` | BEFORE | UPDATE | `enforce_article_status_transition` |
| `trg_businesses_updated_at` | `businesses` | BEFORE | INSERT OR UPDATE | `update_businesses_updated_at` |
| `trg_enforce_business_status_transition` | `businesses` | BEFORE | UPDATE | `enforce_business_status_transition` |
| `trg_update_fundraiser_raised` | `donations` | AFTER | INSERT OR UPDATE | `update_fundraiser_raised` |
| `trg_enforce_fundraiser_status_transition` | `fundraisers` | BEFORE | UPDATE | `enforce_fundraiser_status_transition` |
| `trg_product_orders_updated_at` | `product_orders` | BEFORE | INSERT OR UPDATE | `update_product_orders_updated_at` |
| `trg_products_updated_at` | `products` | BEFORE | INSERT OR UPDATE | `update_products_updated_at` |
| `trg_enforce_product_status_transition` | `products` | BEFORE | UPDATE | `enforce_product_status_transition` |
| `prevent_profile_role_status_self_update` | `profiles` | BEFORE | UPDATE | `prevent_profile_role_status_self_update` |
| `trg_update_rating_aggregates` | `reviews` | AFTER | INSERT OR DELETE OR UPDATE OF `rating, is_approved, event_id, fundraiser_id, organizer_id` | `update_rating_aggregates` |

All are `FOR EACH ROW`. No triggers exist on any other table (`events`, `tickets`, `organizers`, `eventbrite_sources`, `gofundme_sources`, `venue_layouts`, `seats`, `ticket_orders`, `comments`, `platform_settings`, `fundraiser_media`, `organizer_follows`, `homepage_*`, `organizer_visibility_audit`, `follows`, `comment_likes`, `notifications`).

## Views (2, both SECURITY DEFINER)

| View | Depends on | Behavior |
|---|---|---|
| `public_donation_activity` | `donations`, `fundraisers` | Bypasses `donations`' owner/admin-only RLS — exposes donor `user_id` + amount for every `succeeded`/`completed` donation to any anon caller. Filter logic is entirely in the view's own `WHERE`, not RLS. |
| `public_profiles` | `profiles` | Also bypasses RLS, but re-implements an equivalent `privacy_settings->>'profile_visibility'` check inside its own `WHERE` clause. |

Both are flagged **ERROR**-level by Supabase's security advisor (`security_definer_view` lint) and both are reproduced exactly as-is in `sql/007_views.sql`, preserving current production behavior for the donation activity feed and public profile projection. See `RECOMMENDATIONS.md` item 6 for optional follow-up discussion — out of scope for this migration.

## Cross-schema / external dependencies: none found

Every function body was reviewed for references outside `public`/`auth`/`storage`, for `dblink`/`postgres_fdw` usage, and for hardcoded external URLs or secrets:
- The only cross-schema reference is `check_email_pending_deletion`, which joins `auth.users` to `public.profiles` — an in-project reference to Supabase's own auth schema, not an external system.
- No `dblink`, no `postgres_fdw` (neither is even installed), no hardcoded hostnames, no embedded API keys/secrets in any of the 19 function bodies.
- No evidence of a shared "main platform" schema or foreign data wrapper anywhere.

**Conclusion**: this database is self-contained and can be lifted into a new standalone Supabase project without needing to first stand up or connect to any other system.
