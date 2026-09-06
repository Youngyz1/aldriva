# Publishing & Editorial Workflow

Aldriva Articles operates under a robust editorial lifecycle designed to maintain high platform trust, safety, and community standards.

---

## 1. Article Lifecycle States

Every article transitions through clearly defined lifecycle states:

```
               ┌──────────┐
               │  Draft   │
               └────┬─────┘
                    │ Author Submits
                    ▼
          ┌───────────────────┐
          │  Pending Review   │ ◄───────────────────────────┐
          └─────────┬─────────┘                             │
                    │                                       │
           ┌────────┴────────┐                              │
           │  Admin Review   │                              │
           └────────┬────────┘                              │
                    │                                       │
         ┌──────────┴──────────┐                            │
         ▼                     ▼                            │
  ┌─────────────┐       ┌──────────────┐                    │
  │  Published  │       │   Rejected   │ ──(Author edits)───┘
  └──────┬──────┘       └──────────────┘
         │
         ▼
  ┌─────────────┐
  │  Archived   │
  └─────────────┘
```

| Status | Description | Publicly Visible? | Search Indexed? |
| :--- | :--- | :---: | :---: |
| **Draft** | Work in progress saved privately to the author's dashboard. | No | No |
| **Pending Review** | Submitted by author; awaiting platform admin review and content safety verification. | No | No |
| **Published** | Approved and live on public feeds, search indices, and author profiles. | Yes | Yes |
| **Scheduled** | Approved for release; automatically transitions to Published at designated timestamp. | No (until date) | No (until date) |
| **Archived** | Retracted or archived by author/admin; historical record preserved. | No | No |
| **Rejected** | Flagged by admin moderation for guideline violations with feedback. | No | No |

---

## 2. Moderation & Content Approval Workflow

To protect donors, event attendees, and community members from spam, misleading campaigns, and malicious content:

1. **Standard Author Submission**: When authors click **Publish Article**, the platform automatically sets the status to `pending_review`.
2. **Admin Moderation Queue**: Platform administrators review pending submissions at `/admin/articles`.
3. **Approval Decision**:
   - **Approve**: The article immediately becomes `published` (or `scheduled`) and is assigned its official publication timestamp.
   - **Reject / Feedback**: The article is marked `rejected`, and the author is notified to revise the content before resubmission.
4. **Admin Direct Publishing**: Platform administrators have elevated privileges allowing direct publishing without entering the moderation queue.

---

## 3. Scheduled Publishing

Authors can plan announcement schedules ahead of time:

1. In the **Publishing Settings** panel, select the **Schedule for later** option.
2. Choose your target date and time.
3. Upon approval by platform moderators, the article remains in `scheduled` status until the designated timestamp, at which point it becomes visible across public feeds.

---

## 4. Visibility Levels

Beyond publication status, authors can configure audience visibility:

- **Public**: Discoverable via the Articles index (`/articles`), global search (`/search`), category filters, and RSS feeds.
- **Unlisted**: Accessible only to users with the direct link (`/articles/[slug]`). Excluded from public directory listings and search queries.
- **Private**: Visible exclusively to the author and authorized administrators within the dashboard.
