# Auth Configuration Inventory — Phase 4, Step 1 (Read-Only Discovery)

**Status**: plain inventory only, not yet an execution plan. Nothing was written to `supabase-new` or any other project while producing this document. All queries below were run read-only against production (`supabase` MCP connection, confirmed resolving to `https://jnobheduodpvojwzbpra.supabase.co`, 2026-07-23).

## 0. Why most of this is "not retrievable" rather than a number

Supabase's Auth **project-level configuration** — Site URL, redirect allow-list, JWT/session lifetimes, SMTP settings, email template content, password policy, MFA enforcement — lives in Supabase's control plane (Dashboard / Management API), not as rows in any Postgres table. The `mcp__supabase__*` tools available in this session (`execute_sql`, `list_tables`, `get_advisors`, `get_logs`, `get_project_url`, `get_publishable_keys`, `list_extensions`, `list_migrations`, `list_branches`, `list_edge_functions`, `generate_typescript_types`, `search_docs`) have **no call that reads this configuration**. Everything below is either:
- directly queryable in the `auth` schema (identity/session/provider-adjacent tables), or
- surfaced indirectly via the security advisor lint pass (`get_advisors`, `type=security`).

Anything not obtainable through either path is marked **"manual step required"** — meaning a human must open the production Dashboard, record the value, and manually re-enter it in the new project's Dashboard (`hkvjdtbhiycqqhgelymr`). No SQL/API path exists for this session to do it instead.

## 1. Redirect URLs / Site URL / allowed redirect list

**Not retrievable** via any available tool or table — this is pure Dashboard/Management-API config (Authentication → URL Configuration).
**Manual step required.**

## 2. Enabled auth providers

Indirectly inferable from `auth.identities`, which tables actual sign-in provider usage:

| Provider | Production (`jnobheduodpvojwzbpra`) | `supabase-new` (`hkvjdtbhiycqqhgelymr`) |
|---|---|---|
| `email` | 11 identities | 0 identities |
| `google` | 7 identities | 0 identities |
| `facebook` | **Not configured** | **Enabled (Dashboard config, 2026-07-23) — not App-Review-cleared; 0 identities, untested end-to-end** |

(Production: 11 + 7 = 18 identities across 13 users — at least some users have linked both an email and a Google identity, which is expected and not a data problem. `supabase-new`: 0 identities across the board as of 2026-07-23 — the Phase 4 test-signup row was cleaned up, and no real signups have occurred since; the table reflects Dashboard *configuration* state, not usage, for this project.)

**Facebook — new scope deviation (see `RECOMMENDATIONS.md` item 17 for full status).** Facebook was manually enabled as an auth provider on `supabase-new` via the Dashboard; production has never had Facebook auth (confirmed absent from `auth.identities`, re-verified 2026-07-23). Intent is permanent (both projects, going forward), but the Facebook app has not cleared Facebook's App Review for the login permission — until it does, sign-in only works for accounts with a role on the Facebook app (admin/developer/tester); real end users get a Facebook-side error. Whether/when to enable this on production is not yet decided.

Additional read-only checks:
- `auth.custom_oauth_providers` (Supabase's generic/custom OIDC provider table, which — when populated — does expose non-secret config like `client_id`, `issuer`, `discovery_url`, scopes, etc.): **0 rows**. This means Google is configured as a Supabase **built-in** provider via the Dashboard toggle, not as a row in this table — so even where this table *could* have given us a client ID for free, it doesn't apply here.
- `auth.sso_providers`: **0 rows** — no SSO configured.
- `auth.saml_providers`: **0 rows** — no SAML configured.
- `auth.oauth_clients` (Supabase acting as an OAuth 2.1 *authorization server* for third-party apps — unrelated to third-party sign-in): **0 rows** — feature unused.

**What we know**: `email` and `google` are the two providers actually in use.
**What we don't know / can't retrieve**: which providers are *enabled* in the Dashboard toggle list (a provider could be enabled with zero identities so far — absence of identities doesn't prove absence of config), Google's client ID, and (never retrievable via any API, by design) Google's client secret.
**Manual step required**: Dashboard → Authentication → Providers, cross-referenced against the Google Cloud Console project for the client ID/secret pair, plus a check for any enabled-but-unused provider not visible in the identity data.

## 3. Email templates

**Correction (2026-07-23)**: the original inventory undercounted these as 4. Supabase Auth actually ships **6** email templates, not 4:

1. Confirm signup
2. Invite user
3. Magic link (or OTP)
4. Change email address
5. Reset password
6. Reauthentication

(The two previously missing were **Change email address** and **Reauthentication**.)

**Not retrievable** — content and whether each is customized from Supabase's default template can only be read from Dashboard → Authentication → Email Templates.
**Manual step required** for all six templates.

**Status update (2026-07-23)**: all 6 templates have now been manually configured on `supabase-new`, confirmed by the user. Content itself still has no read-back path via any available tool (see §10/§11 below) — the manual side-by-side Dashboard comparison is the only verification method.

## 4. JWT expiry / session settings

**Not retrievable** — access-token TTL, refresh-token rotation/reuse-interval, and session timeout live in Dashboard → Authentication → Sessions / Settings → API.
**Manual step required.**

## 5. Custom SMTP configuration

**Not retrievable** — host, port, from-address, and whether custom SMTP is enabled at all (vs. Supabase's default sender) live in Dashboard → Authentication → SMTP Settings.
**Manual step required** — and even once the host/from-address are read off the Dashboard, the SMTP credentials (username/password or API key) are **never** exposed back out through any Supabase API once saved; they must be re-obtained from whatever mail provider is in use (SES, Resend, Postmark, etc.) and re-entered directly.

## 6. Password policy

**Partially confirmed.** The security advisor pass (`get_advisors`, `type=security`) surfaced:

> `auth_leaked_password_protection` (WARN): "Leaked Password Protection is currently **disabled**." Supabase Auth checks new passwords against HaveIBeenPwned.org when this is on; production currently has it off.

This matches `RECOMMENDATIONS.md` item 14's existing note and `MIGRATION_MASTER_PLAN.md` §4's line for this toggle — now independently confirmed via the advisor rather than carried forward from an earlier summary.

**Not retrievable**: minimum password length and character-class requirements (if configured beyond Supabase's defaults) are not surfaced by the advisor and have no queryable table.
**Manual step required** for the length/complexity settings; the leaked-password toggle's current (disabled) state is confirmed and, per the existing plan, intentionally out of migration scope to change.

## 7. MFA (multi-factor authentication)

- `auth.mfa_factors`: **0 rows** (0 verified).
- `auth.webauthn_credentials`: **0 rows**.

No production user has MFA or a passkey enrolled today. This tells us about **adoption**, not **project-level policy** — a project can have MFA available (or even enforced for certain roles) with zero current enrollments, and this data can't distinguish that from MFA being fully disabled at the project level.
**Manual step required**: Dashboard → Authentication → MFA, to confirm what's actually configured before assuming "zero enrollments" means "nothing to replicate."

## 8. Anonymous sign-ins

`auth.users.is_anonymous` exists as a column (the schema supports the feature), and 0 rows currently have it set to `true`. This doesn't confirm whether the project-level anonymous-sign-in toggle is on or off — only that no anonymous session has persisted a row so far (anonymous users may also convert to permanent accounts, removing the signal entirely).
**Manual step required**, low priority given zero observed usage — worth a quick Dashboard check rather than assuming it's off.

## 9. User/session facts (context, not configuration)

From `auth.users`: **13 total users**, all 13 confirmed (`confirmed_at is not null`), **0 banned**, **0 SSO users**, first user `2026-05-26`, most recent `2026-07-23`. These are data-migration facts (relevant to Phase 6/7), not Auth *configuration* to replicate in Phase 4 — included here only for completeness since they surfaced during the same queries.

---

## 10. Manual-step summary

| Item | Read via SQL/MCP this session? | Reapply via SQL/MCP? | Manual dashboard/console step required? |
|---|---|---|---|
| Site URL / redirect allow-list | No | No | **Yes** |
| OAuth providers enabled (toggle state) | No (only usage inferred) | No | **Yes** |
| Google OAuth client ID | No | No | **Yes** (Google Cloud Console + Dashboard) |
| Google OAuth client secret | No — never exposed by design | No | **Yes** |
| Email templates (6x: confirm signup, invite user, magic link/OTP, change email address, reset password, reauthentication) | No | No | **Yes** — done, confirmed by user on `supabase-new` |
| JWT expiry / session settings | No | No | **Yes** |
| Custom SMTP host/from-address | No | No | **Yes** |
| SMTP credentials | No — never exposed by design | No | **Yes** |
| Password min length / complexity | No | No | **Yes** |
| Leaked-password protection toggle | **Yes** (advisor: confirmed disabled) | No (toggle only, Dashboard) | **Yes** (to flip, if ever decided — out of scope per `RECOMMENDATIONS.md` item 14) |
| MFA enablement/enforcement policy | No (only 0 enrollments confirmed) | No | **Yes** |
| Anonymous sign-in toggle | No (only 0 rows confirmed) | No | **Yes**, low priority |
| SSO/SAML providers | **Yes** (confirmed: none configured) | N/A | No — nothing to replicate |
| Custom OIDC providers (`auth.custom_oauth_providers`) | **Yes** (confirmed: 0 rows) | N/A | No — nothing to replicate |
| Supabase-as-OAuth-server (`auth.oauth_clients`) | **Yes** (confirmed: 0 rows) | N/A | No — feature unused |

**Bottom line**: essentially every actual Auth *configuration* value (as opposed to usage data) requires a manual Dashboard read on production and a manual Dashboard write on `hkvjdtbhiycqqhgelymr` — there is no SQL/MCP path to automate Phase 4. This session can confirm *what's in use* (email + Google providers, no SSO/SAML/custom-OIDC, no MFA/WebAuthn adoption, leaked-password protection off) but cannot read or write the configuration values themselves.

---

## 11. Cross-check against `MIGRATION_MASTER_PLAN.md` §4

The plan's existing Configuration Checklist already lists, correctly:
- Auth: redirect URLs / site URL — manual ✅ consistent with this inventory.
- Auth: email templates — manual ✅ consistent.
- Auth: OAuth providers ("if any are configured in production") — manual ✅ consistent, but this inventory **upgrades it from conditional to confirmed**: Google is not hypothetical, it has 7 active identities in production and must be reconfigured.
- Auth: SMTP / email sending — manual ✅ consistent.
- Leaked-password protection toggle — plan already notes production's disabled state and defers the decision to `RECOMMENDATIONS.md` item 14 — this inventory independently confirms "disabled" via the advisor lint rather than an earlier audit pass.

**Gaps — items this inventory surfaced that §4 does not currently mention at all:**
1. **JWT expiry / access + refresh token lifetime settings** — no line item.
2. **Password policy (minimum length / character-class requirements)** beyond the leaked-password toggle — no line item.
3. **MFA enablement/enforcement policy** — no line item. Even with zero current enrollments, the new project's MFA defaults may not match production's and shouldn't be left to chance.
4. **Anonymous sign-in toggle** — no line item (low priority given zero usage, but currently unaddressed).
5. **Rate limiting / CAPTCHA (hCaptcha or Turnstile) on auth endpoints** — not queryable by this session and not mentioned anywhere in the existing audit; flagged as a genuinely unknown item that needs a first-time Dashboard check, not just a re-confirmation.

No changes have been made to `MIGRATION_MASTER_PLAN.md` — these gaps are reported here for your review before any edit.
