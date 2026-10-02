/**
 * components/admin/table/strings.ts
 * Single copy file for the shared admin table system (English).
 */

export const tableStrings = {
  selectAll: "Select all rows",
  selectRow: (name: string) => `Select ${name}`,
  view: "View",
  moreActions: "More actions",
  actionsHeader: "Actions",
  fullRecord: "Full record",
  expandRow: "Expand row details",
  collapseRow: "Collapse row details",
  showingResults: (start: number, end: number, total: number) =>
    `${start}-${end} of ${total} results`,
  showingNone: (total: number) => `0 of ${total} results`,
  selectedCount: (n: number) => `${n} selected`,
  filters: "Filters",
  activeFilterCount: (n: number) => `${n} active`,
  sort: "Sort",
  export: "Export",
  exporting: "Exporting…",
  select: "Select",
  done: "Done",
  empty: "No rows match your filters.",
} as const;
