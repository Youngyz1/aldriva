# Pattern: Admin Moderation & Operations Dashboard

> Scope: `app/admin/*` (Articles, Businesses, Events, Fundraisers, Payments, AI Rejections, Users)

---

## 1. Primary Purpose
Administrators require high-density, low-friction review and moderation tools to inspect user submissions, approve/reject content, audit transactions, and manage security violations.

---

## 2. Layout & Composition Rules

- **Header**: High-contrast title with pending count badge (e.g., `Articles Moderation [12 Pending]`).
- **Toolbar**: `AdminManagementToolbar.tsx` with instant search, status filters (`all`, `pending_review`, `approved`, `rejected`), category filters, and bulk action triggers.
- **Data Table**: Render inside `DashboardTableCard.tsx`.
  - Column 1: Primary subject (Title, thumbnail image, author).
  - Column 2: Status with `ModerationBadge.tsx`.
  - Column 3: Submission timestamp.
  - Column 4: Quick Action buttons (`ApprovalActionButtons.tsx` — Approve / Reject with `RejectionReasonModal.tsx`).
  - Column 5: 3-dot overflow menu for detailed view, audit log, or user impersonation.
- **Pagination**: `AdminPagination.tsx` with clean page controls and item counts.
