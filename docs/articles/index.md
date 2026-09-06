# Aldriva Articles & Publishing System

Welcome to the **Aldriva Articles & Publishing** documentation suite. This product area provides authors, organizations, organizers, and non-profit leaders with a professional publishing platform to tell stories, publish impact reports, share campaign updates, and engage communities across the Aldriva ecosystem.

---

## 1. System Overview & Core Philosophy

Aldriva Articles is designed from the ground up to unite **storytelling** with **actionable impact**. Unlike disconnected blogging platforms, Aldriva Articles natively connects editorial content to live fundraisers, events, and verified organizations.

```
                                  ┌───────────────────────────────┐
                                  │      Author Creation Mode     │
                                  │  (Blank / Template / AI Draft)│
                                  └──────────────┬────────────────┘
                                                 │
                                                 ▼
                                  ┌───────────────────────────────┐
                                  │     Unified Rich-Text Editor  │
                                  │ • Formatting & Callouts       │
                                  │ • Entity Cards (Campaigns/    │
                                  │   Events/Organizations)       │
                                  │ • AI Assistant (Polish/SEO)   │
                                  └──────────────┬────────────────┘
                                                 │
                                                 ▼
                                  ┌───────────────────────────────┐
                                  │   Editorial Review Workflow   │
                                  │ • Draft & Pending Review      │
                                  │ • Admin Approval & Moderation │
                                  │ • Scheduled & Published       │
                                  └──────────────┬────────────────┘
                                                 │
                                                 ▼
                                  ┌───────────────────────────────┐
                                  │   Public Reader Experience    │
                                  │ • Audio Narration             │
                                  │ • Social Share Bar            │
                                  │ • Contextual Category CTAs    │
                                  │ • Related Stories Grid        │
                                  └───────────────────────────────┘
```

### Architectural Principles

1. **Integrated Entity Ecosystem**: Authors can seamlessly embed verified Aldriva Fundraisers, Events, and Organization profile cards into their stories with single-click lookups.
2. **Editorial Safety & Moderation**: All publicly submitted articles pass through an automated approval and admin moderation workflow (`pending_review`) before appearing on public feeds.
3. **AI as an Assistant, Not a Replacement**: Aldriva's AI writing tools operate under author supervision—generating drafts, polishing tone, suggesting SEO metadata, and summarizing key points without silently overriding author work.
4. **Rich Reader Experience**: Every published article supports auto-calculated reading times, category-based contextual action banners, deterministic related story matching, and native audio narration.

---

## 2. Documentation Suite Map

Explore our detailed guides covering every aspect of the publishing lifecycle:

| Guide | Description | Target Audience |
| :--- | :--- | :--- |
| **[Creating an Article](creating-an-article.md)** | Walkthrough of creation modes (Blank, Template, AI-assisted), rich-text editing, callout styling, and entity embedding. | Authors, Non-profit Staff, Organizers |
| **[Using the AI Assistant](using-ai.md)** | Complete manual on AI draft generation, writing improvement, SEO metadata suggestions, social snippet generation, and guardrails. | Writers, Content Marketers, Editors |
| **[Publishing & Editorial Workflow](publishing.md)** | In-depth breakdown of publication statuses, scheduling, visibility tiers, and admin moderation. | Authors, Content Managers, Admins |
| **[Managing Articles](managing-articles.md)** | Guide to the Author Dashboard: editing, filtering, searching, archiving, deleting, and organization attribution. | Creators, Organization Admins |
| **[Sharing & Discovery](sharing-and-discovery.md)** | Overview of public discovery feeds, global search integration, social sharing, and related article recommendation engines. | Readers, Authors, Marketers |
| **[Frequently Asked Questions](faq.md)** | Direct answers to questions regarding ownership, audio narration, SEO, permissions, and media uploads. | All Users |
| **[Troubleshooting Guide](troubleshooting.md)** | Step-by-step diagnostics for save conflicts, image uploads, AI rate limits, and audio playback errors. | Technical Users, Authors |

---

## 3. Key Concepts & Terminology

- **Article**: The core content object containing rich HTML, metadata (title, excerpt, cover image, categories, tags), author attribution, and narration data.
- **Publication State**: The current lifecycle status of an article (`draft`, `pending_review`, `published`, `scheduled`, `archived`, `rejected`).
- **Entity Card**: An embedded interactive card referencing an active Aldriva fundraiser, event, or organization.
- **Audio Narration**: Machine-synthesized narration synchronized with article text stored in `article_audios` for accessibility and on-the-go listening.
- **Contextual CTA**: Automated call-to-action banner rendered at the conclusion of an article tailored to its category (e.g., prompting event exploration on Event Recaps or campaign creation on Fundraising stories).
