# Aldriva AI System Architecture & Status

> **Last updated: September 3, 2026 — status document, updated as work continues. Do not treat any 'verified working' item as permanent without re-checking after further changes.**

---

## System Overview

Aldriva AI is a provider-agnostic, security-gated artificial intelligence framework designed for content curation, social media promotion, and administrative growth assistance.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Growth Studio UI / API                         │
│               (/admin/ai, /admin/ai/rejections, /api/ai/chat)           │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ requireAdmin() Gate
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Provider Abstraction Layer                       │
│                      (lib/ai/provider-factory.ts)                       │
│              ┌────────────────┬────────────────────┐                   │
│              │ GeminiProvider │ OpenRouterProvider │                   │
│              │(gemini-3.6-fl.)│    (Cloud Alt)     │                   │
│              └────────────────┴────────────────────┘                   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│     Controlled Tool Registry     │   │      Output Guard Validation     │
│   (lib/ai/tools-registry.ts)     │   │    (lib/ai/output-guard.ts)      │
│  - get_upcoming_events           │   │  - System Prompt Echo Detection  │
│  - get_active_fundraisers        │   │  - Email & Phone PII Filter      │
│  - get_featured_businesses       │   │  - Unknown UUID Leak Prevention  │
│  - get_recent_articles           │   │  - Audit Log (ai_guard_rejections│
│  - get_available_products        │   │    and ai_content_items)         │
│  - get_content_history           │   └──────────────────────────────────┘
└──────────────────────────────────┘
```

---

## 1. Provider Setup & Configuration

The AI architecture is provider-agnostic, adhering to the `AIProvider` interface (`lib/ai/types.ts`).

- **Default Production & Text Provider**: `gemini` (`AI_PROVIDER_DEFAULT=gemini`).
- **Default Model**: `gemini-3.6-flash` (replaces deprecated `gemini-2.5-flash`).
- **Gemini Authentication**:
  - `GEMINI_API_KEY` must be a Google AI Studio **"Authorization key"** (prefixed with `AQ.`, not the legacy `AIzaSy` Standard-key format).
  - Sent via the native `x-goog-api-key` HTTP header (not `Authorization: Bearer`, which triggers `401 ACCESS_TOKEN_TYPE_UNSUPPORTED` on auth keys).
- **Reasoning Model Handling**:
  - Thinking parts (`thought: true`) returned by Gemini reasoning models are filtered out from final outputs in `lib/ai/providers/gemini.ts` to prevent internal chain-of-thought leaks.
  - `maxOutputTokens` headroom is automatically expanded for thinking models to prevent response truncation.
- **Alternative Providers**:
  - `openrouter`: Cloud fallback supporting third-party hosted models via `OPENROUTER_API_KEY`.

---

## 2. Verified Working (Live End-to-End Confirmed: Sep 3, 2026)

The following components were tested and verified working end-to-end against live APIs and production database:

1. **Gemini Grounded Caption Generation**:
   - Both `/api/cron/daily-post` and `/api/cron/promotion-engine` generate complete, grounded captions from live database items.
   - Clean caption output: no model meta-reasoning leaks, no word count commentary, no truncation mid-sentence.
2. **Input/Output Guard Layer** (`lib/ai/input-guard.ts`, `lib/ai/output-guard.ts`):
   - Sanitizes and validates prompts before inference and screens responses for system prompt echoes, PII (email/phone), and ungrounded UUIDs.
   - Guard evaluation results (`pass` / `flag` / `reject`) are properly returned and persisted.
3. **Audit Logging to `ai_content_items`**:
   - Structured audit rows are successfully inserted upon every generation pass with UUIDs, timestamps, full item snapshots, and guard outcomes.
4. **Facebook Publishing via Graph API**:
   - Live photo and feed publishing verified with permanent Meta Business System User tokens (`FB_PAGE_ACCESS_TOKEN`).
   - `getPageAccessToken()` helper in `lib/facebook.js` and `lib/facebookPublisher.js` automatically resolves and caches the Page Access Token for `FB_PAGE_ID` via `/me/accounts` when a System User token is supplied.
5. **Canonical URL Resolution (`lib/site-url.ts`'s `getSiteUrl()`)**:
   - `getSiteUrl()` is now the unified single source of truth repo-wide.
   - Fixed pre-existing localhost leak bugs across 6 critical domains: crypto IPN callbacks, ticket emails, admin approval/rejection emails, admin password resets, Stripe payment receipt emails, and checkout session redirects.

---

## 3. Known Incomplete Items (OPEN)

The following items are actively open and have not yet been implemented or resolved:

> [!WARNING]
> **Do not treat these items as done or complete:**

1. **`ai_content_items` Post-Publish Update [OPEN]**:
   - The columns `published`, `published_at`, and `published_to` in `ai_content_items` are never updated after a successful Facebook API post.
   - Rows permanently show `published: false`, even when Facebook publishing succeeds.
2. **Schema Drift on Products and Articles [OPEN]**:
   - Promotion Engine (`lib/promotionEngine.js`) queries non-existent columns:
     - On `articles`: queries `cover_image` (actual database column is `cover_image_url`).
     - On `products`: queries `title, cover_image, price, category, product_type` (actual database columns are `name, images, price_type, stripe_price_id`; `title`, `cover_image`, `price`, `category`, and `product_type` do not exist).
   - Non-blocking currently because the engine gracefully catches the query error and falls back to selecting from the live events/fundraisers pool. Product and article promotions will fail to load candidates until updated.
3. **`"About Platform" Ungrounded Fallback Mode [IMPLEMENTED Sep 2026]`**:
   - `lib/generatePlatformContent.js` generates About-Aldriva captions from the
     permanent knowledge base in `ai_knowledge_docs` (mission, vision,
     feature_status, content_levels, content_rules — seeded by
     `db/migration_95_aldriva_platform_knowledge.sql`).
   - Output passes through the same `guardBeforeDisplay()` gate plus a
     structural `checkBrandAccuracy()` code check (throws + audit-logs on
     seating/invitation, Growth-Studio-as-feature, concept-vertical, or
     beta-overclaim violations), then writes to `ai_content_items` with
     `content_type: 'platform'` (allowed by `db/migration_94_platform_content_type.sql`).
4. **Media Generation Layer (fal.ai, Replicate, ElevenLabs) [OPEN]**:
   - API keys are provisioned in `.env.local`, but **no interface or calling code exists** in the application codebase yet.
5. **Grok / xAI Provider [OPEN]**:
   - Intentionally deferred. `XAI_API_KEY` is not yet generated or integrated into `lib/ai/providers/`.
6. **OpenAI Moderation Endpoint [OPEN]**:
   - `OPENAI_API_KEY` is provisioned, but automated moderation endpoint screening is not wired into the guard pipeline.
7. **Growth Verticals [OPEN]**:
   - Manifestation, astrology, and daily reflection specialized prompts remain in conceptual ideation; not yet scoped or implemented.

---

## 4. CONTENT_MODE — Grounded vs Platform Content Gate

> **Current target: `platform_only`.** The events/fundraisers in the database
> (including any "Shadae" / "30-Day Financial Glow-Up"-style rows) are TEST/SEED
> DATA, not real campaigns. Growth Studio must NOT generate grounded content
> from them.

| Value | Behavior |
|---|---|
| `platform_only` (default) | Both `/api/cron/daily-post` and `/api/cron/promotion-engine` call `generatePlatformContent()` only. `getGroundedDailyContent()` / `getNextPromotion()` are **skipped entirely**, never called. |
| `grounded` | Historical behavior: pull real fundraisers/events. |
| `auto` | Grounded first; platform content only when nothing grounded is available. Reserved for later — not the current target. |

- Read by both crons via `getContentMode()` (`lib/generatePlatformContent.js`).
  Unknown/missing values **fail closed to `platform_only`**.
- Every cron response and `ai_content_items.snapshot` logs
  `{ content_mode, content_path }` (`platform` | `grounded` | `platform_fallback`)
  so any given day's mode is auditable.
- **Manual gate:** switch `CONTENT_MODE` to `grounded` or `auto` (in
  `.env.example`, `.env.local`, AND Vercel — all environments) ONLY once the
  platform has real, non-test event/fundraiser inventory. This must be a human
  decision, never auto-detection of "real" vs "test" data.

---

## 5. Environment Variables Inventory

### Actually Read & Used in Application Code
| Variable | Usage |
|---|---|
| `CONTENT_MODE` | Grounded vs platform content gate for both crons (`lib/generatePlatformContent.js`); defaults fail-closed to `platform_only` |
| `GEMINI_API_KEY` | Primary LLM text generation provider (`lib/ai/providers/gemini.ts`, `lib/generateCaption.js`) |
| `FB_PAGE_ID` | Facebook target Page ID for publishing (`lib/facebook.js`, `lib/facebookPublisher.js`) |
| `FB_PAGE_ACCESS_TOKEN` | System User or Page token for Graph API (`lib/facebook.js`, `lib/facebookPublisher.js`) |
| `CRON_SECRET` | Bearer authorization secret for Vercel Cron endpoints (`/api/cron/*`) |
| `OPENROUTER_API_KEY` | Secondary cloud LLM provider (`lib/ai/providers/openrouter.ts`) |
| `TAVILY_API_KEY` | Web search augmentation for AI tools (`lib/ai/tools/web-search.ts`) |

### Provisioned in `.env.local` but Unused in Code
- `FAL_KEY`: Provisioned for fal.ai media generation (no code calling it).
- `REPLICATE_API_TOKEN`: Provisioned for Replicate image models (no code calling it).
- `ELEVENLABS_API_KEY`: Provisioned for voice generation (no code calling it).
- `OPENAI_API_KEY`: Provisioned for OpenAI models/moderation (no code calling it).
- `BYTEZ_API_KEY`: Provisioned (no code calling it).
- `GROQ_API_KEY`: Provisioned (no code calling it).
- `NVIDIA_API_KEY`: Provisioned (no code calling it).
- `XAI_API_KEY`: Unset / deferred.

### Deprecated / Dead Variables
- `NEXT_PUBLIC_BASE_URL`: **Completely dead in application source code.** Replaced repo-wide by `getSiteUrl()` from `lib/site-url.ts`. Safe to remove from `.env.example` and hosting configuration.

---

## 6. Safe-Column Tool Allowlists (`lib/ai/tools/*.ts`)

Every AI tool uses a strict column allowlist in its Supabase `.select()` call. `select('*')` is strictly prohibited.

| Tool Name | Database Table | Allowlisted Columns | Excluded / Prohibited Columns |
|-----------|----------------|---------------------|-------------------------------|
| `get_upcoming_events` | `events` | `id, title, slug, description, banner, event_date, venue, city, category` | `organizer_id, created_by, stripe_account_id` |
| `get_active_fundraisers` | `fundraisers` | `id, title, slug, story, banner, goal, raised, category` | `organizer_id, created_by, donor emails, stripe fields` |
| `get_featured_businesses` | `businesses` | `id, name, slug, description, logo, category, city, website` | `owner_id, internal_notes` |
| `get_recent_articles` | `articles` | `id, title, slug, excerpt, cover_image, categories, published_at, reading_time` | `author_id, draft_content` |
| `get_available_products` | `products` | `id, title, slug, description, cover_image, price, category, product_type` | `seller_id, license_keys, cost_price` |
| `get_content_history` | `ai_content_items` | `id, content_type, source_id, generated_text, published, published_at, published_to, guard_result, created_at` | `snapshot, guard_flags, ai_provider` |

All tool results are filtered by `screenToolResult()` before returning to callers.

---

## 7. Output Guard Validation Pipeline (ADR-0002)

Prompt injection and PII leakage are defended **structurally** at the application layer by `lib/ai/output-guard.ts`.

### Screening Pipeline (`guardBeforeDisplay()`)
Every string generated by the AI model passes through `guardBeforeDisplay()` before display in the admin UI or external publication (e.g. Facebook API):
1. **System Prompt Echo**: Flags and sanitizes instructions or markers (e.g. `[INST]`, `You are an AI`).
2. **Email & Phone PII**: Rejects content containing emails or phone numbers.
3. **UUID Leakage**: Rejects/flags output containing UUIDs not present in tool inputs.
4. **Audit Persistence**: Logs every flag and rejection event to `ai_guard_rejections` database table.

### Audit Panel (`/admin/ai/rejections`)
As mandated by ADR-0002 §4, the `/admin/ai/rejections` review panel surfaces security audit logs sorted by `created_at DESC`.

---

## Related Documentation & ADRs
- [ADR 0001: Marketplace Ownership & Payments](../adr/0001-marketplace-ownership-entitlements-payments.md)
- [ADR 0002: AI Output Validation Standing Requirement](../adr/0002-ai-output-validation-standing-requirement.md)
- [Brand Voice Guidelines](../marketing/brand-voice.md)
- [Fundraising Guide](../fundraising/index.md)
- [Business Directory Guide](../businesses/index.md)
- [Articles Guide](../articles/index.md)
- [Products Guide](../products/index.md)
