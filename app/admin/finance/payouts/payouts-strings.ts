/**
 * app/admin/finance/payouts/payouts-strings.ts
 * Single copy file for the admin Payouts page (English, new chrome only).
 * Both money modals keep their copy inline so those flows stay
 * byte-identical.
 */

export const payoutsStrings = {
  eyebrow: "Admin",
  title: "Payout Management",
  description:
    "Disburse recipient funds, complete bank transfers, and manage payout state transitions.",

  searchPlaceholder: "Search recipient or ID...",

  tabs: [
    { value: "all", label: "All" },
    { value: "requested", label: "Requested" },
    { value: "processing", label: "Processing" },
    { value: "completed", label: "Completed" },
    { value: "failed", label: "Failed" },
    { value: "cancelled", label: "Cancelled" },
  ] as const,

  columns: {
    recipient: "Recipient",
    amount: "Amount",
    status: "Status",
    destination: "Destination",
    payout: "Payout",
  } as const,

  statusLabels: {
    requested: "Requested",
    processing: "Processing",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  } as const,

  emptyTitle: "No payout records found",
  emptySub: "No payout requests matching the selected filters.",

  actionRequired: "Action required",
  totalVolume: "Total volume",
  terminal: "Terminal",
  stateLabel: "State",

  startProcessing: "Start Processing",
  /** Three ASCII dots, exactly as the pre-migration button. */
  updating: "Updating...",
  complete: "Complete…",
  fail: "Fail…",
} as const;
