# Phase 12: Custom Domains & Advanced Web

---

## STATUS (verified 2026-10-20)

**NOT STARTED.** `proxy.ts` has no `Host`-header/custom-domain handling (VERIFIED — grep returns 0 matches), and there is no domain-verification table or SSL code.

## What it is and why it matters (no prior context needed)
Every Aldriva business site currently lives at a path like `aldriva.com/site/my-restaurant`. That's fine to start, but a real business wants `www.myrestaurant.com` on its own domain, with a padlock (HTTPS).

**Custom Domains** let a business point its own domain at Aldriva: the platform verifies the business controls the domain (a DNS record check), issues an SSL certificate automatically, and then `proxy.ts` matches the incoming request's `Host` header to the right tenant and serves that tenant's website.

**Why it matters:** it's a trust/exclusivity feature — businesses won't run serious marketing on a shared-path URL. It's independent of the API work, **depends only on Phase 2** (the website engine), and `proxy.ts` already exists as the routing point (it just doesn't look at `Host` yet).

## Prerequisites
- Phase **2** website engine (done).
- A hosting decision for SSL issuance (Vercel Custom Domains API or Cloudflare for SaaS — per the plan).

## Risks
- **Routing regression**: `proxy.ts` is load-bearing for auth/404s; Host-based routing must not break existing paths.
- **SSL/DNS edge cases**: verification failures need clear diagnostics or support load rises.
- **Cache/SEO**: serving the same content on two hostnames → duplicate-content issues (needs canonical redirects).

## Proposed first task
Author the custom-domains migration (domain, tenant, verification state) and add a **guarded** `Host`-resolution branch in `proxy.ts` behind a feature flag, defaulting to current behavior — with a test that existing `aldriva.com` routing is unchanged.

## Migration numbers
Old plan names `migration_133_custom_domains` — **consumed** (actual 133 = moderation guard). **Assign at build time from the register.** Next free as of 2026-10-20: **186**.

---

## ORIGINAL PLAN (kept below; superseded by the STATUS block above where they disagree)

## 1. Objective
Enable businesses and organizers to serve their Aldriva business websites under their own custom root domains or subdomains (e.g., `www.mybrand.com`) with automated SSL provisioning, DNS verification, and edge caching.

## 2. Scope
- Custom domain registration and DNS verification workflow in tenant dashboard (`/dashboard/org/[id]/website/domains`).
- Edge hostname routing in `proxy.ts` matching incoming `Host` headers to tenant custom domains.
- Automated SSL certificate issuance and renewal via Vercel Custom Domains API / Cloudflare for SaaS.
- Advanced SEO controls (custom robots.txt, sitemap index generation, 301 redirect management).

## 3. Out of Scope
- Domain registrar purchases / WHOIS management.
- Email MX record hosting.

## 4. Existing Dependencies
- Public Website Engine (Phase 2).
- Root `proxy.ts` request routing.

## 5. Tasks
- [ ] Task 12.1: Author `db/migration_133_custom_domains.sql` (and rollback twin) for domain verification records.
- [ ] Task 12.2: Update `proxy.ts` to support dynamic custom domain resolution.
- [ ] Task 12.3: Build DNS verification checker (CNAME/TXT records) in `lib/custom-domains.ts`.
- [ ] Task 12.4: Build domain management interface in tenant dashboard.
- [ ] Task 12.5: Author automated tests in `lib/__tests__/custom-domains.test.cjs` and append to `package.json`.

## 6. Acceptance Criteria
- [ ] Visitors accessing a verified custom domain receive the correct tenant website seamlessly with valid HTTPS.
- [ ] Unverified or misconfigured domains display clear diagnostic guidance.
- [ ] All tests passing.

## 7. Current Status
**PLANNED**

## 8. Completed Work
- None.

## 9. Remaining Work
- Tasks 12.1 through 12.5.

## 10. Known Issues
- None.

## 11. Verification Requirements
- `npm test` passes 100%.

## 12. Next Step
Execute after Phase 4 / Phase 8 completion.
