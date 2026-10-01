# Pattern: Forms & Multi-Step Creation Flows

> Scope: `app/create-event/*`, `app/create-fundraiser/*`, `app/dashboard/products/new/*`, `app/dashboard/org/[id]/website/*`

---

## 1. Primary Purpose
Guide users through authoring, configuring, and publishing content with clear validation, autosaving, and progressive disclosure.

---

## 2. Layout & Form Design Rules

- **Logical Grouping**: Divide complex forms into distinct visual cards (e.g. *Basic Details*, *Media & Assets*, *Pricing & Tickets*, *SEO Settings*).
- **Field Layout**:
  - Two-column grid (`grid grid-cols-1 sm:grid-cols-2 gap-4`) for related short inputs (First Name / Last Name, Date / Time, City / State).
  - Full-width for long text inputs, titles, descriptions, and image upload dropzones.
- **Labels & Validation**:
  - Every field has an explicit `<Label>` with optional indicator (`(optional)`).
  - Validation errors render immediately beneath the input in `text-xs text-destructive font-medium`.
- **Primary Submit Button**: Always solid orange (`bg-primary`), fixed in a sticky bottom actions footer on long pages.
- **Auto-Save / Draft State**: Provide subtle "Draft saved at 14:23" indicator next to the submit button.
