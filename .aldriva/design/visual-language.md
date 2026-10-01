# Aldriva Visual Language

> **Tone**: Functional, confident, modern, restrained, and trustworthy.

---

## 1. Visual Hierarchy & Surface Philosophy

Aldriva uses a layered surface model built on subtle tonal shifts rather than heavy shadows or high-contrast borders:

```text
Layer 0 (Canvas / Background):   #ffffff (Dark: #0a0a0a)
Layer 1 (Card / Surface):        #ffffff border-zinc-200/70 (Dark: #18181b border-zinc-800)
Layer 2 (Muted Inset / Sub-box): #fafafa border-zinc-200/50 (Dark: #27272a)
Layer 3 (Overlay / Modal):       #ffffff shadow-lg (Dark: #18181b)
```

### Contrast & Boundaries
- Borders are delicate (`border-zinc-200/70` in light mode, `border-zinc-800` in dark mode).
- Shadows are restrained (`shadow-xs` for standard cards and buttons; `shadow-md` or `shadow-lg` only for floating dialogs and dropdown menus).
- No saturated background fills for content cards. Content sits on clean white or neutral zinc surfaces.

---

## 2. Color Language

### Brand Accent (Orange)
- **`--brand-700` (`#c2410c`)**: The canonical primary color for solid buttons, active tab indicators, and primary links. Passes WCAG AA contrast (5.18:1) against white text.
- **`--brand-50` / `--brand-100`**: Subtle tinted background fills for alert highlights, active navigation rows, and brand badges.
- **`--brand-500` (`#f97316`)**: Focus rings (`ring-brand-500`) and interactive hover states.

### Neutral Scale (Zinc)
- **`zinc-950` / `zinc-900`**: Primary headings and high-emphasis body text.
- **`zinc-600` / `zinc-500`**: Secondary metadata, timestamps, captions, helper text.
- **`zinc-400` / `zinc-300`**: Placeholder text, subtle icons, disabled states.
- **`zinc-200` / `zinc-100`**: Dividers, borders, subtle hover highlights.
- **`zinc-50` / `white`**: Canvas backgrounds, card bodies.

### Status Indicators
- **Success / Verified / Published**: Green (`emerald-600` / `emerald-50` tint).
- **Warning / Pending / Draft**: Amber (`amber-600` / `amber-50` tint).
- **Destructive / Expired / Rejected**: Red (`red-600` / `red-50` tint).
- **Informational / Processing**: Blue (`sky-600` / `sky-50` tint).

---

## 3. Shape & Geometry

- **Corner Radius**: Standardized on `rounded-xl` (12px) for cards, modal dialogs, and default buttons. Small controls use `rounded-lg` (8px). Badges use `rounded-md` or `rounded-full` for status dots.
- **Line Weights**: 1px borders everywhere. Never use 2px or 3px heavy solid borders around content cards.
- **Dividers**: Prefer subtle dividers (`divide-y divide-zinc-200/60` or `<Separator />`) over nesting items inside separate cards.
