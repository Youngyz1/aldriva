# Team & Staff Permissions (RBAC)

Aldriva provides fine-grained **Role-Based Access Control (RBAC)** to ensure staff, ushers, volunteers, and co-organizers have exactly the permissions they need without exposing sensitive financial or configuration settings.

---

## 👥 Staff Roles & Permission Matrix

Aldriva supports three distinct roles for event team members:

| Feature / Action | Owner (Creator) | Event Manager | Ticket Scanner |
| :--- | :---: | :---: | :---: |
| **Edit Event Details & Dates** | ✅ Yes | ❌ No | ❌ No |
| **Connect Bank / Stripe Payouts** | ✅ Yes | ❌ No | ❌ No |
| **Delete / Archive Event** | ✅ Yes | ❌ No | ❌ No |
| **Manage Team & Invite Staff** | ✅ Yes | ❌ No | ❌ No |
| **Visual Seating Builder** | ✅ Yes | ✅ Yes | ❌ No |
| **Guest List & CSV Import** | ✅ Yes | ✅ Yes | ❌ No |
| **Send Digital Invitations** | ✅ Yes | ✅ Yes | ❌ No |
| **View Live Attendance Roster** | ✅ Yes | ✅ Yes | ✅ Lookup Only |
| **Door Scanner App** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Manual Check-In Override** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Operations Dashboard & KPIs** | ✅ Yes | ✅ Yes | ❌ No |
| **Export CSV Reports** | ✅ Yes | ✅ Yes | ❌ No |

---

## ➕ Inviting Team Members

To add a team member:
1. Open the event dashboard and navigate to **Team & Staff** (`/dashboard/events/[id]/team`).
2. Click **+ Invite Team Member**.
3. Enter the member's **Email Address**.
4. Select their **Role**:
   - **Event Manager**: Best for lead coordinators, stage managers, and seating directors.
   - **Ticket Scanner**: Best for front-door staff, security, ushers, and volunteer check-in crews.
5. Click **Send Invitation**.

---

## 🔐 Staff Onboarding & Authentication

1. The invited staff member receives an email with an onboarding access link.
2. If they already have an Aldriva account, the event is immediately added to their staff dashboard.
3. If they are new to Aldriva, they complete a quick 1-step password setup.
4. **Ticket Scanners** are automatically directed straight to the mobile-optimized Door Scanner (`/dashboard/events/[id]/scan`).

---

## 🚫 Revoking Access

- Event Owners can remove a team member at any time by clicking **Revoke Access** on the Team Management table.
- Revocation takes effect immediately, terminating active scanner sessions for that user.
