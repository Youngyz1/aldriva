# Aldriva — Project Document Index

> **Generated:** 2026-10-20 by a read-only status review (branch `feat/menu-promotions-phase-4` @ `16265fb`).
> **Last-commit dates** are from `git log -1 --date=short -- <file>` (last commit that touched the file).
> **Verdict legend:**
> **CURRENT** — updated within the last week and verified against code in this review ·
> **SEP-2026** — "Last Verified: September 2026" reference docs; content consistent with code at that time, aging ·
> **PARTLY STALE** — contains at least one claim contradicted by current code (see `docs/project-status.md` §8 for details) ·
> **STALE** — materially contradicted by the code ·
> **HISTORICAL** — point-in-time report; accurate as a record, not maintained as reference ·
> **STUB** — placeholder/pointer file.

---

## 1. Root documents

| Path | Title | Last commit | Purpose | Verdict |
|---|---|---|---|---|
| `README.md` | Aldriva — Multi-Module Business & Community Platform | 2026-09-21 | Public overview, stack, local setup, test commands | SEP-2026 |
| `CLAUDE.md` | CLAUDE.md (agent-specific entry, `@AGENTS.md`) | 2026-10-19 | Claude Code guidance: vendored-Next-16 warnings, test list, proxy conventions | CURRENT |
| `AGENTS.md` | Universal agent engineering reference | 2026-10-19 | Non-negotiable agent rules, repo facts, startup procedure | PARTLY STALE — "Latest migration: `migration_126`" (actual latest: `migration_184`) |
| `DESIGN.md` | Aldriva Design System | 2026-10-17 | Design tokens, component rules, known UI inconsistencies | CURRENT |

## 2. Canonical living docs (`docs/`)

| Path | Title | Last commit | Purpose | Verdict |
|---|---|---|---|---|
| `docs/CURRENT-STATE.md` | Aldriva — Current Implementation State & Living Status | 2026-10-20 | What is built / in-progress / blocked; newest entries = menu options & promotions | CURRENT — one stale claim: migration-184 SHA-256 `8033C841…` (file hardened in `7c8cbf4`, `3fd162c`; now `30fb2d16…`) |
| `docs/ROADMAP.md` | Platform Roadmap & Master Phase Sequence | 2026-09-24 | Master phase map 0–14 + parallel milestones | PARTLY STALE — Phase 6 shown "PLANNED" (code: PARTIAL), Phase 7 shown "PLANNED" (code: reservations exist) |
| `docs/PRODUCT.md` | Product Definition & Ecosystem Overview | 2026-09-21 | Domain model: events, fundraising, commerce, articles, orgs, AI | SEP-2026 |
| `docs/ARCHITECTURE.md` | System Architecture & Technical Design | 2026-09-21 | Topology, proxy, tenancy, payments, RLS, testing | SEP-2026 — spot-checks in this review passed |
| `docs/API.md` | API Reference & Endpoint Catalog | 2026-09-21 | Internal `app/api/` route catalog; `/v1` public API described as planned | PARTLY STALE — incomplete (no cart/validate, orders/payment-intent, AI gateway, cron); `/v1` correctly shown as not built |
| `docs/DATABASE.md` | Database Architecture, Schema Reference & Migrations | 2026-09-24 | Migration system (db/ canonical), schema, RLS model | PARTLY STALE — header claims "Migrations 1 to 138"; `db/` now has 181 numbered forwards through 184 |
| `docs/DECISIONS.md` | Architectural Decision Records | 2026-10-20 | ADRs (DEC-0001…DEC-0012): status over intent, no silent writes, etc. | CURRENT |
| `docs/CHANGELOG.md` | Changelog | 2026-10-20 | Chronological change log | CURRENT |
| `docs/SECURITY.md` | Security model | 2026-09-21 | RLS, roles, auth, rate limiting, secrets | SEP-2026 |
| `docs/INTEGRATIONS.md` | Third-party integrations | 2026-09-21 | Stripe, NOWPayments, Resend, Cloudflare R2; POS shown as Phase-11 future | SEP-2026 — consistent with code (no POS) |
| `docs/DESIGN-SYSTEM.md` | (pointer) | 2026-10-19 | 4-line redirect to root `DESIGN.md` | STUB |
| `docs/image-upload.md` | Image upload notes | 2026-07-31 | Storage/upload notes | STALE (oldest doc; superseded by R2 media work) |

## 3. Phase execution plans (`docs/phases/`)

| Path | Title | Last commit | Purpose | Verdict |
|---|---|---|---|---|
| `phase-00-audit.md` | Phase 0: Codebase & Documentation Audit | 2026-09-21 | Audit plan; status **COMPLETE** | HISTORICAL (accurate record) |
| `phase-01-website-foundation.md` | Phase 1: Business Website Foundation | 2026-09-21 | Migration 125 plan; status **COMPLETE** | HISTORICAL/accurate |
| `phase-02-website-engine.md` | Phase 2: Public Website Engine | 2026-09-21 | `app/site/[slug]` + preview; status **COMPLETE** | HISTORICAL/accurate |
| `phase-03-design-system.md` | Phase 3: Website Design System | 2026-09-24 | Blocks/embeds/templates; status **COMPLETE** | HISTORICAL/accurate |
| `phase-04-website-builder.md` | Phase 4: Website Builder/Editor | 2026-10-16 | Builder, drafts, RPC publish; status **COMPLETE** | CURRENT |
| `phase-05-products-services.md` | Phase 5: Products, Services & Menus | 2026-10-20 | Services/menus schema+UI; status **PARTIAL** (multi-currency TODO) | CURRENT |
| `phase-06-commerce.md` | Phase 6: Unified Commerce | 2026-10-19 | Cart/discounts/tax; status **PARTIAL** (store cart+promos+delivery landed) | CURRENT |
| `phase-07-bookings.md` | Phase 7: Bookings & Reservations | 2026-09-21 | Booking schema/widget; status **PLANNED** | PARTLY STALE — reservation request engine already built (migration 176, dashboard + public pages, tests) |
| `phase-08-business-management.md` | Phase 8: Business Management ERP | 2026-09-21 | ERP modules; status **PLANNED** | PARTLY STALE — branches exist (migration 132); shifts/inventory not built |
| `phase-09-public-api.md` | Phase 9: Public Developer API | 2026-09-21 | `/v1` gateway, API keys; status **PLANNED** | STALE numbering — planned `migration_130_api_keys` collides with actual 130 (website category); nothing built |
| `phase-10-webhooks.md` | Phase 10: Outbound Webhooks | 2026-09-21 | Webhook dispatch engine; status **PLANNED** | STALE numbering — planned `migration_131_webhooks` collides with actual 131; nothing built |
| `phase-11-pos.md` | Phase 11: POS Integration Framework | 2026-09-21 | Square/Clover/Toast/Shopify connectors; status **PLANNED** | STALE numbering — planned `migration_132_pos_connectors` collides with actual 132 (business branches); nothing built |
| `phase-12-advanced-web.md` | Phase 12: Custom Domains & Advanced Web | 2026-09-21 | Custom domains/SSL; status **PLANNED** | STALE numbering — planned 133 collides with actual 133; proxy has no host-based routing |
| `phase-13-aldriva-ai.md` | Phase 13: Aldriva AI | 2026-09-21 | WhatsApp/IG auto-responder + studio; status **IN PROGRESS** | PARTLY STALE — AI studio/workforce built (migrations 139–168); Meta webhook handlers + tenant `/dashboard/org/[id]/ai` NOT built |
| `phase-14-external-ai.md` | Phase 14: External AI Ecosystem | 2026-09-21 | AI app marketplace; status **PLANNED** | STALE numbering — planned 134 collides with actual 134; nothing built |
| `phase-r2-media-storage.md` | Milestone: R2 Media Storage | 2026-10-09 | Cloudflare R2 migration; status **PARTIALLY COMPLETE** | CURRENT |
| `phase-server-only-boundaries.md` | Milestone: Server-Only Boundaries | 2026-10-08 | Server-only markers, bundle scan; status **COMPLETE** | CURRENT |

## 4. Active workstream — menu options & promotions (Phases 0–4, Oct 2026)

| Path | Title | Last commit | Purpose | Verdict |
|---|---|---|---|---|
| `docs/audit-menu-options-promotions.md` | Aldriva menu, options, ordering, and promotions audit | 2026-10-19 | 2026-10-19 read-only audit (10 findings F-1…F-10); premise for the workstream | CURRENT |
| `docs/phase-2-report.md` | Menu Options Phase 2 checkpoint report | 2026-10-20 | Phase 2 migration review (182/183 authored) | CURRENT |
| `docs/phase-3-report.md` | Menu Options Upgrade — Phase 3 Checkpoint D | 2026-10-20 | Option groups wiring, cart fingerprints, v4 migration | CURRENT |
| `docs/phase-4-report.md` | Menu Promotions — Phase 4 Checkpoint E | 2026-10-20 | Promotions manager, shared pricing, migration 184; migration unapplied | CURRENT |
| `docs/phase-4-progress.md` | Phase 4 item-by-item progress rows | 2026-10-20 | Per-item commit trail (`6ee2ee3`…`16265fb`) | CURRENT |

## 5. One-off reports & runbooks

| Path | Title | Last commit | Purpose | Verdict |
|---|---|---|---|---|
| `docs/3D-OFFICE-READONLY.md` | 3D Office (Stage 19): READ-ONLY RULE | 2026-10-04 | Read-only constraint for 3D office work | CURRENT/HISTORICAL |
| `docs/GUARDRAILS-NO-AUTONOMOUS-PRODUCTION-ACTIONS.md` | Guardrails: no autonomous production actions | 2026-10-03 | Agent guardrails for production | CURRENT |
| `docs/FULL-BRANCH-RECOVERY-AUDIT.md` | Full branch recovery audit | 2026-10-05 | Audit of lost/parallel work | HISTORICAL |
| `docs/FULL-BRANCH-RECOVERY-FINAL-REPORT.md` | Full branch recovery final report | 2026-10-05 | Recovery outcome (last commit on `main`) | HISTORICAL |
| `docs/PHASE-139-142-SUMMARY.md` | Phases 139–142 summary (AI OS) | 2026-09-26 | Tool/agent registry, knowledge, runtime summary | HISTORICAL |
| `docs/PHASE-143-SENTINEL-INVESTIGATION-REPORT.md` | Phase 143 sentinel investigation | 2026-09-26 | Sentinel rollout investigation | HISTORICAL |
| `docs/PHASE-143b-SUMMARY.md` | Phase 143b summary | 2026-09-26 | Sentinel fix summary | HISTORICAL |
| `docs/PHASE-144-QA-INVESTIGATION-REPORT.md` | Phase 144 QA investigation | 2026-09-26 | QA workforce investigation | HISTORICAL |
| `docs/SENTINEL-STAGE-9-IMPLEMENTATION-READINESS.md` | Sentinel Stage 9 readiness | 2026-09-29 | Readiness review | HISTORICAL |
| `docs/SENTINEL-STAGE-9-IMPLEMENTATION-REPORT.md` | Sentinel Stage 9 report | 2026-09-29 | Implementation record | HISTORICAL |
| `docs/STAGE-10-BACKGROUND-EXECUTION-DISCOVERY.md` | Stage 10 discovery | 2026-09-29 | Background-execution design | HISTORICAL |
| `docs/STAGE-10-BACKGROUND-EXECUTION-IMPLEMENTATION-REPORT.md` | Stage 10 implementation report | 2026-09-29 | Background execution record | HISTORICAL |
| `docs/STAGE-10.9-SMOKE-TEST-RUNBOOK.md` | Stage 10.9 smoke-test runbook | 2026-09-29 | Manual smoke steps | HISTORICAL |
| `docs/STAGE-7-STAGING-RUNBOOK.md` | Stage 7 staging runbook | 2026-09-26 | Staging deployment steps | HISTORICAL |
| `docs/TESTING-WORKFORCE.md` | Testing workforce | 2026-10-01 | QA-workforce test conventions | CURRENT |
| `docs/R2-MEDIA-SETUP.md` | R2 media setup | 2026-10-09 | Cloudflare R2 configuration | CURRENT |
| `docs/AI-AGENT-GUIDE.md` | Aldriva AI Agent Developer Guide | 2026-09-21 | How agents work in this repo | SEP-2026 |
| `docs/AI-MCP.md` | Aldriva MCP Architecture | 2026-09-21 | MCP tooling config | SEP-2026 |
| `docs/AI-OPERATING-SYSTEM-CURRENT-STATE-AUDIT.md` | AI Operating System — Current-State Audit | 2026-09-26 | AI OS audit | HISTORICAL |
| `docs/AI-WORKFORCE-IMPLEMENTATION-READINESS.md` | AI Workforce + QA readiness | 2026-09-26 | Workforce readiness report | HISTORICAL |
| `docs/ALDRIVA-AI-OPERATING-SYSTEM-DISCOVERY-REPORT.md` | AI-Native Platform discovery report | 2026-09-26 | Discovery report | HISTORICAL |
| `docs/adr/0001-marketplace-ownership-entitlements-payments.md` | ADR 0001: Marketplace ownership, entitlements, payments | 2026-08-11 | Ownership/payment-state authority | HISTORICAL (still binding) |
| `docs/adr/0002-ai-output-validation-standing-requirement.md` | ADR 0002: AI output validation | 2026-09-03 | Output-guard requirement | HISTORICAL (still binding) |
| `docs/source-migration/PHASE1_REPORT.md` | Source migration Phase 1 report | 2026-08-11 | Historical source migration | HISTORICAL |
| `docs/source-migration/PHASE2_FINAL_REPORT.md` | Source migration Phase 2 final report | 2026-08-11 | Historical source migration | HISTORICAL |
| `docs/migration-audit/README.md` (+ 8 reports + RECOMMENDATIONS) | Migration audit (Jul–Aug 2026) | 2026-07-31 / 08-11 | Pre-rebuild schema audit | HISTORICAL — superseded by current `db/` |
| `docs/marketing/brand-voice.md` | Brand voice | 2026-09-03 | Marketing voice guide | SEP-2026 |

## 6. End-user guides (product documentation)

All dated **2026-09-06** unless noted. Verdict: SEP-2026 — written for stable feature sets; not re-verified in this review, no contradictions found.

| Directory | Files | Covers |
|---|---|---|
| `docs/articles/` | 8 (index, creating, managing, publishing, using-ai, sharing, faq, troubleshooting) | Articles & publishing |
| `docs/events/` | 15 (`invitations.md` updated 2026-10-11) | Events, tickets, seating, scanning, invitations, guests |
| `docs/fundraising/` | 12 | Fundraisers, donations, beneficiaries, payouts, verification |
| `docs/organizations/` | 12 | Orgs, profiles, verification, dashboard, reviews |
| `docs/businesses/index.md` | 1 | Business listings overview |
| `docs/products/index.md` | 1 | Digital products overview |

## 7. Technical references

| Path | Title | Last commit | Purpose | Verdict |
|---|---|---|---|---|
| `docs/technical/aldriva-ai.md` | Aldriva AI technical reference | 2026-09-06 | AI subsystem internals | SEP-2026 |
| `docs/technical/invitation-template-engine.md` | Invitation template engine | 2026-10-17 | Template engine internals | CURRENT |
| `docs/technical/events/*.md` | 13 files (architecture, api-reference, database-schema, qr-system, payments, security, rbac, scanner, attendance, ticket-instances, my-tickets, future-roadmap) | 2026-09-03 | Events subsystem deep reference | SEP-2026 |

## 8. Design assets

| Path | Last commit | Purpose | Verdict |
|---|---|---|---|
| `design/business-sites/BASELINE.md` | 2026-10-17 | Business-site visual baseline | CURRENT |
| `design/business-sites/templates/savannah.md` | 2026-10-18 | Savannah template spec | CURRENT |
| `design/business-sites/templates/table-flame.md` | 2026-10-17 | Table Flame template spec | CURRENT |

## 9. Review-support files (this review)

| Path | Purpose |
|---|---|
| `docs/project-status-progress.md` | Crash-safety progress log for the 2026-10-20 status review |
| `docs/project-status.md` | Main status report (deliverable) |
| `work/status-review-*.log` | Quality-run logs (test:chunked, tsc, lint, build) — gitignored `work/` |

---

### Notable gaps (no file exists)

- **No `/v1` public API docs** (Phase 9 not started — nothing to document).
- **No POS documentation** beyond the Phase-11 plan (Phase 11 not started).
- **No Phase-7 reservations workstream doc** — the built reservation engine (migration 176 + pages + tests) is undocumented in `docs/phases/phase-07-bookings.md`, which still says PLANNED.
- **No doc records migrations 139–184 as a whole** — `DATABASE.md` stops at 138; the 139–184 range (AI OS, invitations, events fixes, store, menus, promotions) is only traceable via `CHANGELOG.md`/`CURRENT-STATE.md` and filenames.
