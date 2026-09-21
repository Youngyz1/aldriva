# Phase 12: Custom Domains & Advanced Web

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
