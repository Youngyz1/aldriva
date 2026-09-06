# Donation Receipts & Tax Information

Aldriva automatically generates compliant, auditable donation receipts for every successful contribution made across the platform.

---

## 🧾 Accessing Your Donation Receipt

Donors can retrieve their official PDF donation receipts through three methods:

### 1. Instant Confirmation Page
- Immediately upon completing a donation, click **Download Receipt** on the confirmation view.

### 2. Email Confirmation
- A confirmation email containing the donation summary and a direct receipt download link is dispatched to your email address.

### 3. Receipt Lookup Tool
- If you made a donation as a guest, you can look up your receipt using the payment reference ID via `/donation-confirmation` or `/api/receipts/[id]`.

---

## 📄 What is Included on the Receipt?

Every official Aldriva donation receipt contains:
- **Receipt Reference UUID**: Unique transaction tracking code.
- **Date & Timestamp**: Date of transaction.
- **Donor Details**: Name and email address (or marked as Anonymous).
- **Fundraiser Title**: Name of the campaign supported.
- **Organizer Information**: Organizer name and organization name.
- **Financial Breakdown**: Donation amount, tip amount, and currency (USD).
- **Payment Method**: Card or payment type used.

---

## 🏛️ Tax Deductibility & 501(c)(3) Nonprofit Status

- **Charity & Nonprofit Campaigns**: Donations made to verified **501(c)(3) organizations** or registered charities are tax-deductible to the extent permitted by law.
  - The generated receipt automatically includes the organization's **Tax ID / EIN** and **Nonprofit Registration Number**.
- **Personal Campaigns**: Donations made to personal fundraisers (e.g., personal medical bills, individual relief) are generally considered personal gifts and are typically not tax-deductible. Consult a tax professional for guidance.

---

## 🔗 Related Documentation
- [Donating to a Campaign](donating.md)
- [Verification & Trust](verification-and-trust.md)
- [Frequently Asked Questions (FAQ)](faq.md)
