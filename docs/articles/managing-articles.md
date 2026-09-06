# Managing Articles in the Dashboard

The Aldriva Author Dashboard (`/dashboard/articles`) provides full lifecycle management for personal and organization-affiliated publications.

---

## 1. Dashboard Overview

The **My Articles** interface provides immediate access to your publication catalog:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ My Articles                           [+ New Article]                           │
│ Manage your draft, published, and scheduled editorial articles.                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│ [ Search articles by title... ] [ All Statuses ▾ ] [ Apply ]                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│ ARTICLE                  STATUS        VISIBILITY    CATEGORIES     ACTIONS     │
│ ─────────────────────────────────────────────────────────────────────────────── │
│ Clean Water Update       Published     Public        Fundraising    [Edit] [···]│
│ 2026 Annual Gala Recap   Pending       Public        Events         [Edit] [···]│
│ Volunteer Spotlight      Draft         Private       Community      [Edit] [···]│
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Filtering & Search

- **Keyword Search**: Real-time filtering by article title using the dashboard search input.
- **Status Filter**: Quickly isolate articles by lifecycle state:
  - *All Statuses*
  - *Draft*
  - *Pending Review*
  - *Published*
  - *Scheduled*
  - *Archived*

---

## 3. Editing & Updating Published Articles

1. Click **Edit** on any article row to open the full rich-text editor at `/dashboard/articles/[id]/edit`.
2. Modify text, update cover banners, adjust categories, or insert new entity cards.
3. Click **Save Changes** to commit updates. Note that significant updates to published articles may re-trigger administrative review depending on platform trust tier.

---

## 4. Archiving & Deleting Articles

- **Archiving**: Safely withdraws an article from public discovery while preserving historical metrics, audio files, and internal records.
- **Deleting**: Permanently removes the article and its associated database records.
  - To prevent accidental loss, deletion requires explicit modal confirmation.
  - Once deleted, article URLs will return a 404 status code.

---

## 5. Organization vs. Personal Attribution

Authors managing verified Aldriva Organizations can toggle authorship:
- **Personal Post**: Attributed to your verified user profile and personal author byline.
- **Organization Post**: Attributed to your organization's official profile, displaying the organization banner, badge, and follow button. Team members with editorial access can collaborate on organization drafts.
