# Aldriva Business Directory

## What is the Aldriva Business Directory?
The Aldriva Business Directory is the ecosystem feature on Aldriva that highlights local businesses, social enterprises, partners, and community sponsors. It provides structured business profiles that connect local services to Aldriva users.

It is built for two main groups:
- **Community Members** looking for local services, accredited businesses, and community sponsors
- **Business Owners** seeking visibility and engagement within the Aldriva digital ecosystem

## What can you do with Aldriva Businesses?
- Discover active local businesses filtered by city, category, and accreditation
- View business profiles, logos, descriptions, and direct website links
- Connect business profiles to events sponsored or hosted by the business
- Promote verified businesses via AI Growth Studio social campaigns

## For Users
- Search local businesses by city and category
- Explore business offerings, mission statements, and contact links
- Support community-minded businesses sponsoring local causes

## For Business Owners
- Register a business profile with logo, description, city, and website
- Link business profiles to event sponsorships and fundraiser partnerships
- Receive featured placement in the Aldriva homepage and AI promotional rotations

## AI Promotion & Safe Allowlist
Business profiles are integrated into the Aldriva AI ecosystem:
- AI queries use safe-column allowlists: `id, name, slug, description, logo, category, city, website`
- Excluded fields: internal billing notes, owner personal contact details, deleted timestamps
- `get_featured_businesses` returns active businesses for AI-generated social spotlight posts

## Related Technical Resources
- [Aldriva AI System Architecture](../technical/aldriva-ai.md)
- [AI Output Validation ADR](../adr/0002-ai-output-validation-standing-requirement.md)
