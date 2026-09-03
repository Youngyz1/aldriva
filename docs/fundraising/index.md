# Aldriva Fundraisers

## What are Aldriva Fundraisers?
Aldriva Fundraisers is the donation and cause-driven fundraising module on the Aldriva platform. It enables community organizers, individuals, and cause leaders to launch campaigns, tell their story, accept donations, and track progress toward financial goals.

It is built for two main groups:
- **Donors** who want to discover verified community causes and contribute securely
- **Organizers** who need a transparent platform to run fundraising campaigns

## What can you do with Aldriva Fundraisers?
- Discover active fundraising campaigns across categories (medical, education, community, emergency)
- Create and publish fundraising campaigns with stories and banners
- Set target fundraising goals and track progress in real time
- Accept secure contributions via Stripe integration
- Review donor history and contribution milestones
- Share campaigns directly across social media channels and through Aldriva AI promotions

## For Donors
- Browse active campaigns on the Aldriva platform
- Make one-time or recurring contributions securely
- View real-time progress bars indicating how close a campaign is to its goal
- Track personal donation history in user profiles

## For Organizers
- Create fundraising campaigns with rich story descriptions and image banners
- Set target financial goals and campaign categories
- Track raised amounts, donor lists, and contribution timestamps
- Leverage AI-powered social media promotion captions generated through Aldriva Growth Studio

## Campaign Lifecycle
1. **Creation**: Organizer submits campaign title, story, banner, and goal
2. **Active State**: Campaign collects donations; progress is tracked automatically (`raised < goal`)
3. **AI Promotion**: Active campaigns are surfaced by AI tools (`get_active_fundraisers`) and the Promotion Engine
4. **Completion**: Campaign reaches 100% of goal or is completed by the organizer

## Data Governance & Allowlisting
To protect donor privacy and system security:
- Public and AI queries ONLY return allowlisted fields: `id, title, slug, story, banner, goal, raised, category`
- Donor email addresses, Stripe payment tokens, internal notes, and administrative fields are structurally excluded from AI tool responses

## Related Technical Resources
- [Marketplace Ownership ADR](../adr/0001-marketplace-ownership-entitlements-payments.md)
- [AI Output Validation ADR](../adr/0002-ai-output-validation-standing-requirement.md)
- [Aldriva AI System Architecture](../technical/aldriva-ai.md)
