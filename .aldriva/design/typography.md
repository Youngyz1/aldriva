# Aldriva Typography System

> **Primary Font Family**: Geist Sans (via `next/font`), falling back to `Arial, Helvetica, sans-serif`.  
> **Monospace Font Family**: Geist Mono (`Courier New`, Courier, monospace).

---

## 1. Type Hierarchy & Scale

Aldriva enforces a clear typographic hierarchy designed for fast scanning on both mobile devices and wide desktop displays:

| Level | Size | Weight | Line Height | Tracking | Recommended Classes | Typical Usage |
|---|---|---|---|---|---|---|
| **Display / Page Hero** | 2.25rem (36px) | 800 (Extrabold) | 1.15 | `-0.02em` | `text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-950` | Landing heroes, major public titles |
| **Page Title (H1)** | 1.75rem (28px) | 700 (Bold) | 1.2 | `-0.02em` | `text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950` | Dashboard page headers, article titles |
| **Section Title (H2)** | 1.25rem (20px) | 600 (Semibold) | 1.3 | `-0.01em` | `text-xl font-semibold tracking-tight text-zinc-900` | Major card section headers, form step titles |
| **Group Title (H3)** | 1.0rem (16px) | 600 (Semibold) | 1.4 | normal | `text-base font-semibold text-zinc-900` | Table headers, sub-section headers |
| **Body (Default)** | 0.875rem (14px) | 400 (Regular) | 1.5 | normal | `text-sm text-zinc-700` | Standard UI body copy, table cell content |
| **Body Large** | 1.0rem (16px) | 400 (Regular) | 1.6 | normal | `text-base text-zinc-700` | Editorial article text, fundraiser descriptions |
| **Caption / Meta** | 0.75rem (12px) | 500 (Medium) | 1.4 | normal | `text-xs text-zinc-500` | Timestamps, secondary labels, helper text |
| **Stat Metric** | 2.0rem (32px) | 700 (Bold) | 1.0 | `-0.02em` | `text-3xl font-bold tracking-tight text-zinc-950 tabular-nums` | Dominant dashboard KPI numbers, balance counters |

---

## 2. Numerical Formatting Rules

- **Always use `tabular-nums`** for counters, currency values, financial summaries, seat numbers, and tabular data to prevent horizontal jitter during updates.
- Format currency amounts clearly: `$1,250.00` or `$1,250` (omit trailing `.00` when clean integer values improve scanning).
- Use unit labels cleanly: `342 tickets sold`, not `342 / 500 (68.4%)` crammed into a single unformatted string.

---

## 3. Editorial & TipTap Typography

Articles and rich text content render inside the `.tiptap-editor` container configured in `app/globals.css`.
- Headings are bold with appropriate margin separation (`h1`: 2rem/800, `h2`: 1.5rem/700, `h3`: 1.25rem/600).
- Paragraphs use `line-height: 1.625` for comfortable sustained reading.
- Blockquotes have a `4px solid #e2e8f0` left border with muted italic text.
- Links are underlined in blue (`#2563eb`).
