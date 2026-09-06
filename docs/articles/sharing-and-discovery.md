# Sharing & Discovery

Aldriva Articles are built to maximize community reach, cross-platform engagement, and seamless transition from reading to donor action.

---

## 1. Public Discovery Channels

Published articles are distributed through multiple high-visibility channels across the platform:

```
                                  ┌───────────────────────────────┐
                                  │       Published Article       │
                                  └──────────────┬────────────────┘
                                                 │
         ┌──────────────────┬────────────────────┴───────────────┬──────────────────┐
         │                  │                                    │                  │
         ▼                  ▼                                    ▼                  ▼
  ┌──────────────┐   ┌──────────────┐                     ┌──────────────┐   ┌──────────────┐
  │  Articles    │   │  Global      │                     │  Category &  │   │  Author &    │
  │  Explore Hub │   │  Search      │                     │  Tag Feeds   │   │  Org Pages   │
  │  (/articles) │   │  (/search)   │                     │              │   │              │
  └──────────────┘   └──────────────┘                     └──────────────┘   └──────────────┘
```

### 1. The Articles Explore Hub (`/articles`)
The central directory featuring:
- **Featured Hero Stories**: Hand-curated spotlight articles.
- **Category Filter Tabs**: Instant filtering by *Fundraising, Events, Community, Impact, Organization, News, and Volunteer*.
- **Search Bar**: Keyword lookups across titles, excerpts, and author names.

### 2. Global Search Integration (`/search`)
Articles appear natively alongside Fundraisers, Events, and Organizations in global platform searches, providing a unified search experience for community supporters.

### 3. Author & Organization Profiles
Every public organization profile and author profile displays a dedicated **Articles** tab listing their published stories.

---

## 2. Interactive Social Share Bar

Every public article detail page (`/articles/[slug]`) includes an interactive sharing bar:

- **X / Twitter**: Opens one-click tweet composer pre-filled with the article title and URL.
- **LinkedIn**: Formats professional share post with OpenGraph preview cards.
- **Facebook**: Launches Facebook share dialog.
- **WhatsApp**: Triggers direct WhatsApp share sheet for mobile and desktop web.
- **Copy Link**: Copies the canonical URL directly to clipboard with instant visual confirmation.

---

## 3. Contextual Category Action Banners (CTAs)

At the conclusion of every story, Aldriva renders an automated contextual call-to-action banner aligned with the story's focus:

- **Fundraising Stories**: *"Inspired by this story? Start your own fundraising campaign today to support causes that matter."* → Links to `/fundraisers/new`.
- **Event Recaps**: *"Looking for upcoming gatherings? Explore live and upcoming community events in your area."* → Links to `/events`.
- **Organization Updates**: *"Empower your non-profit or grassroots initiative with Aldriva's verified organization tools."* → Links to `/organizers`.
- **Community & Impact**: *"Be the catalyst for change. Discover active fundraisers and initiatives making a difference right now."* → Links to `/fundraisers`.

---

## 4. Related Stories Recommendation Engine

The public article page queries deterministic category overlaps using `getRelatedArticles()`:
- Analyzes the current article's category taxonomy.
- Filters out the active article ID.
- Displays up to 3 highly relevant related stories to encourage continued reading and community retention.
