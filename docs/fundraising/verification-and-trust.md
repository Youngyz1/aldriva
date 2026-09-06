# Verification, Moderation & Trust

Aldriva is committed to ensuring a safe, transparent fundraising environment for organizers and donors alike.

---

## 🛡️ Organizer Fundraising Approval (`fundraising_approved`)

To launch organization campaigns, organizations must be approved by the platform:
- **Verification Portal**: Organizers submit business or nonprofit details under `/dashboard/settings/verification`.
- **Requirements for Nonprofits**: Organization legal name, official 501(c)(3) tax ID (EIN), and registration documentation.
- **Requirements for Businesses & Groups**: Identity verification of the primary account holder.
- **Approval Status**: Once reviewed and approved, the organization receives the `fundraising_approved` badge and can publish organization campaigns.

---

## 🚦 Campaign Moderation States

All fundraisers pass through moderation states to ensure compliance with platform standards:

| Status | Meaning | Publicly Visible? | Accepts Donations? |
| :--- | :--- | :---: | :---: |
| **Published** | Approved and fully live on the platform. | ✅ Yes | ✅ Yes |
| **Pending Review** | Under review by platform moderators. | ❌ Only Owner & Admin | ❌ No |
| **Rejected** | Flagged or rejected (reason displayed in owner banner). | ❌ Only Owner & Admin | ❌ No |
| **Soft-Deleted** | Deleted by the organizer (`deleted_at` set). | ❌ Returns 404 | ❌ No |

---

## 🚩 Reporting a Campaign

Donors and visitors can report potential policy violations directly on any campaign page:
1. Click the **Report Campaign** flag icon on the fundraiser page.
2. Select the violation category (Fraud, Inaccurate Information, Impersonation, Policy Violation).
3. Submit details for review by the platform trust and safety team.

---

## 🔗 Related Documentation
- [Beneficiary Setup & Claims](beneficiaries.md)
- [Payouts & Withdrawals](payouts-and-withdrawals.md)
- [Frequently Asked Questions (FAQ)](faq.md)
