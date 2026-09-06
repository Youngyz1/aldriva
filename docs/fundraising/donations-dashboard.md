# Donations Dashboard & Tracking

The **Donations Dashboard** (`/dashboard/donations`) allows organizers to monitor incoming contributions in real-time, inspect donor details, and export accounting logs.

---

## 📈 Real-Time Donation Metrics

The top of the dashboard displays live KPIs:
- **Total Donated**: Cumulative volume of successful donations.
- **Successful Donations**: Count of completed transactions.
- **Average Donation**: Mean contribution size.
- **Pending Volume**: Volume of transactions currently processing.

---

## 📋 The Donations Roster Table

The table lists every contribution with key transaction details:

| Column | Description |
| :--- | :--- |
| **Donor** | Donor's full name (or *"Anonymous"*) and email address. |
| **Amount** | Donation amount and currency (e.g., *$100.00 USD*). |
| **Campaign** | Title of the specific fundraiser supported. |
| **Status** | `Succeeded` (green), `Pending` (amber), or `Failed` (red). |
| **Payment Method** | Card or payment channel used. |
| **Date & Time** | Exact timestamp of transaction. |
| **Actions** | View Details drawer. |

---

## 🔍 Search & Filters

- **Search**: Search by donor name, email, or campaign title.
- **Filter by Campaign**: Select a specific fundraiser from the dropdown.
- **Filter by Status**: View only Succeeded, Pending, or Failed donations.
- **Filter by Date Range**: Filter by specific time periods.
- **Sort**: Sort by newest, oldest, or highest amount.

---

## 📄 Slideout Transaction Drawer

Clicking any donation row opens the **Detail Drawer**:
- Complete donor contact info.
- Exact breakdown of donation amount, platform tip, and net proceeds.
- Donor message / words of support.
- Stripe PaymentIntent reference ID.
- Direct link to view and print the official donation receipt.

---

## 📥 Exporting Donations to CSV

Click the **Export CSV** button in the top toolbar to download a compliant spreadsheet containing full donor and transaction records for external bookkeeping and donor thank-you notes.

---

## 🔗 Related Documentation
- [Donating to a Campaign](donating.md)
- [Donation Receipts & Tax Information](receipts-and-tax.md)
- [Payouts & Withdrawals](payouts-and-withdrawals.md)
