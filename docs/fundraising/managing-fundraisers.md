# Managing Your Fundraisers

The **Fundraisers Dashboard** (`/dashboard/fundraisers`) provides organizers with full control over their active, pending, and past campaigns.

---

## 📊 The Fundraisers Dashboard Overview

The dashboard displays high-level metrics across all your campaigns:
- **Total Campaigns**: Number of active and past fundraisers.
- **Total Raised**: Gross funds raised across all campaigns.
- **Total Donors**: Total number of individual contributions received.
- **Average Progress**: Overall percentage towards fundraising goals.

---

## 🔍 Searching, Filtering & Viewing Campaigns

- **Table & Grid Views**: Toggle between a dense tabular list and a visual card grid.
- **Status Filter**:
  - `All Statuses`
  - `Published`: Live and accepting public donations.
  - `Pending Review`: Under moderation review.
  - `Rejected`: Needs updates before publishing.
- **Category Filter**: Filter campaigns by their assigned category.
- **Sorting**: Sort by Newest, Oldest, Highest Goal, or Most Raised.
- **CSV Export**: Click **Export CSV** to download a spreadsheet of your campaign metrics.

---

## ✏️ Editing Campaign Details

To update a campaign:
1. Navigate to **Fundraisers** in your dashboard.
2. Click **Edit** on the campaign row or visit `/fundraisers/edit/[id]`.
3. You can update:
   - **Title & Short Description**
   - **Target Goal Amount**
   - **Rich Text Story**
   - **Cover Photo & Gallery Photos**
   - **Video URL**
   - **Beneficiary Information & Claim Invitations**
4. Click **Save Changes**.

---

## 📢 Posting Updates to Donors

Keeping donors informed increases engagement and encourages recurring support.

To post an update:
1. Open `/dashboard/fundraisers/[id]/updates`.
2. Enter an **Update Title** (optional) and write your **Content** (minimum 20 characters).
3. Click **Post Update**.
4. The update is published chronologically on your public campaign page under the **Updates** tab.
5. You can delete an update at any time by clicking the trash icon.

---

## 🗑️ Deleting a Campaign

If you need to remove a campaign:
1. Open the Fundraiser dashboard and click **Delete** on the campaign row.
2. Confirm the action in the confirmation modal.
3. The campaign is soft-deleted (`deleted_at` is set) and will no longer be visible to the public or accept donations.

---

## 🔗 Related Documentation
- [Donations Dashboard](donations-dashboard.md)
- [Payouts & Withdrawals](payouts-and-withdrawals.md)
- [Verification & Trust](verification-and-trust.md)
