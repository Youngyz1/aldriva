# Live Attendance & Check-In Roster

The **Check-Ins & Roster** module (`/dashboard/events/[id]/checkins`) provides event managers and registration desk teams with an authoritative overview of attendance, arrivals, and roster management.

---

## 📋 Live Attendee Roster Interface

```
+-----------------------------------------------------------------------------------------+
| Search: [ Type name, email, or seat... ]  | Filter: [ All | Checked In | Not Checked In ]|
+-----------------------------------------------------------------------------------------+
| Guest Name          | Tier / Type   | Seat / Table      | Status       | Check-In Time  |
+---------------------+---------------+-------------------+--------------+----------------+
| Dr. Eleanor Vance   | VIP Sponsor   | Table 4, Seat 2   | Checked In   | 19:04:12 (Door)|
| Sarah Jenkins       | General       | Section A, Row 2  | Not Arrived  | --             |
| Arthur Pendelton    | VIP Guest     | Table 1, Seat 8   | Checked In   | 18:42:10 (Door)|
| Marcus Aurelius     | Early Bird    | Section C, Row 10 | Checked In   | 19:15:33 (Door)|
+-----------------------------------------------------------------------------------------+
```

---

## 🔍 Real-Time Search & Filtering

Registration desk staff can instantly locate attendees using multiple search criteria:
- **Full-Text Search**: Search by attendee first/last name, email address, order ID, or ticket instance UUID.
- **Filter by Status**:
  - `All Attendees`
  - `Checked In` (Arrived)
  - `Not Checked In` (Pending Arrival)
- **Filter by Scanner / Gate**: View check-ins processed by specific staff members.
- **Pagination & Sorting**: Navigate large guest lists efficiently with server-paginated queries.

---

## ⚡ Manual Check-In Overrides

For attendees arriving without a digital pass or physical ticket:
1. Search for the attendee's name in the roster table.
2. Verify their identity (e.g., photo ID).
3. Click the **Check In** button in their table row.
4. The attendee's status immediately updates to `Checked In` in the database.

---

## 📊 Summary KPI Statistics

The top of the roster view provides instant KPI counts:
- **Total Sold / Issued**: All valid tickets and confirmed invitations.
- **Checked In**: Total verified admissions.
- **Attendance Rate**: Percentage of ticket holders currently admitted.
- **Not Arrived**: Outstanding ticket holders yet to check in.
