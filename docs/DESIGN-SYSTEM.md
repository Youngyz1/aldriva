# Aldriva Design System Reference

> **Living Technical Specification**: The complete visual and interaction design reference for Aldriva.  
> Detailed guides located in [`.aldriva/design/`](../.aldriva/design/).

---

## 1. Core Brand Identity & Foundation

- **Platform Name**: Aldriva
- **Brand Slogan**: *Everything Your Business Needs. One Platform.*
- **Base Canvas**: Clean Zinc neutrals (`#ffffff` canvas, `#09090b` dark canvas).
- **Brand Color**: Orange (`--brand-700` / `#c2410c`) providing WCAG AA 5.18:1 contrast against white text.
- **Typography**: Geist Sans (`var(--font-geist-sans)`) with Geist Mono (`var(--font-geist-mono)`) for code and tabular figures.

---

## 2. Design Tokens Summary

| Token | CSS Variable | Tailwind Utility | Hex / Value | Usage |
|---|---|---|---|---|
| Primary Action | `--primary` | `bg-primary`, `text-primary` | `#c2410c` (`--brand-700`) | Primary CTA buttons, key active indicators |
| Primary Foreground | `--primary-foreground` | `text-primary-foreground` | `#ffffff` | Text on primary buttons |
| Background Canvas | `--background` | `bg-background` | `#ffffff` (Dark: `#0a0a0a`) | Page canvas |
| Surface / Card | `--card` | `bg-card` | `#ffffff` (Dark: `#18181b`) | Card containers |
| Subtle Surface | `--muted` | `bg-muted` | `#fafafa` (Dark: `#27272a`) | Table headers, code blocks |
| Border | `--border` | `border-border` | `#e4e4e7` (Dark: `#27272a`) | 1px dividers and container boundaries |
| Focus Ring | `--ring` | `ring-ring` | `#f97316` (`--brand-500`) | Interactive focus indicators |
| Destructive | `--destructive` | `bg-destructive` | `#dc2626` | Delete / cancel actions |

---

## 3. Component Standards

- **Corner Radius**: `rounded-xl` (12px) standard for cards, modals, and default buttons; `rounded-lg` (8px) for compact badges and inputs.
- **Shadows**: `shadow-xs` for subtle elevation on cards and buttons; `shadow-lg` for popovers and dialogs.
- **Buttons (`components/ui/button.tsx`)**:
  - `default`: Solid orange (`bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs`).
  - `outline`: White background with subtle zinc border (`border border-zinc-200 bg-white hover:bg-zinc-50`).
  - `secondary`: Light zinc background (`bg-zinc-50 border border-zinc-200/80 hover:bg-zinc-100`).
  - `ghost`: Transparent with hover highlight.
  - `destructive`: Red solid (`bg-destructive text-destructive-foreground`).
  - Press animation: `active:scale-[0.98] transition`.

---

## 4. Anti-Patterns & Visual Rules

- ❌ **No Purple/Blue SaaS Gradients**: Use solid white/zinc surfaces and orange accents.
- ❌ **No Glassmorphism**: Avoid blurry transparent containers.
- ❌ **Question Every Card Container**: Group information using whitespace and typography first.
- ❌ **Always Use `tabular-nums`**: Apply to prices, stats, counts, and timers.

---

## 5. Pattern Documentation Index

- [Design Principles](../.aldriva/design/principles.md)
- [Legacy UI Policy](../.aldriva/design/legacy-ui.md)
- [Visual Language](../.aldriva/design/visual-language.md)
- [Design Tokens](../.aldriva/design/tokens.md)
- [Typography System](../.aldriva/design/typography.md)
- [Spacing & Layout](../.aldriva/design/spacing.md)
- [Component Catalog](../.aldriva/design/components.md)
- [Responsive Strategy](../.aldriva/design/responsive.md)
- [Accessibility](../.aldriva/design/accessibility.md)
- [Motion & Animation](../.aldriva/design/motion.md)
- [Anti-Patterns](../.aldriva/design/anti-patterns.md)
- [Visual QA Review Protocol](../.aldriva/design/reviews/visual-review.md)
