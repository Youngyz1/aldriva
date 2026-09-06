# Troubleshooting & Diagnostics

This guide provides solutions to common issues encountered when creating campaigns, processing donations, or managing payouts.

---

## 🛠️ Campaign Creation & Editing Issues

### Problem 1: "This organizer isn't approved for fundraising yet" error
- **Cause**: The selected organization profile has not completed verification or is awaiting admin approval.
- **Resolution**:
  1. Complete verification under `/dashboard/settings/verification`.
  2. Alternatively, switch to a **Personal Fundraiser** if you are raising funds as an individual.

### Problem 2: Photo upload fails or shows an error
- **Cause**: Image file is too large or not in an accepted format (JPEG, PNG, WebP).
- **Resolution**:
  - Ensure the image file is under 10MB.
  - The upload tool automatically crops images to the standard **4:5 aspect ratio**.

---

## 💳 Donation & Payment Issues

### Problem 1: Donor's credit card is declined
- **Cause**: Card issuer security block, insufficient funds, or incorrect billing postal code.
- **Resolution**:
  - Ask the donor to verify their card details and billing address.
  - Suggest trying another card or using an alternative payment method.

### Problem 2: Donor cannot find their PDF receipt
- **Resolution**:
  1. Check the confirmation email sent after payment.
  2. The campaign organizer can also look up the transaction in their **Donations Dashboard** (`/dashboard/donations`), open the detail drawer, and provide the receipt link.

---

## 💸 Payout & Withdrawal Issues

### Problem 1: Payout request is pending or delayed
- **Cause**: Standard bank transfer clearing times (1–3 business days) or pending identity verification.
- **Resolution**:
  - Ensure identity verification is completed at `/dashboard/settings/verification`.
  - Check with your bank regarding ACH deposit processing windows.

---

## 🔗 Related Documentation
- [Creating a Fundraiser](creating-a-fundraiser.md)
- [Donating to a Campaign](donating.md)
- [Payouts & Withdrawals](payouts-and-withdrawals.md)
- [Frequently Asked Questions (FAQ)](faq.md)
