# Aldriva Design Tokens Reference

> Defined in `app/globals.css` and exposed via Tailwind CSS v4 `@theme inline`.

---

## 1. Core CSS Variables & Semantic Mapping

```css
:root {
  /* Canvas & Base */
  --background: #ffffff;
  --foreground: #171717;

  /* Brand Scale (Tailwind Orange promoted to tokens) */
  --brand-50:  #fff7ed;
  --brand-100: #ffedd5;
  --brand-200: #fed7aa;
  --brand-300: #fdba74;
  --brand-400: #fb923c;
  --brand-500: #f97316;
  --brand-600: #ea580c;
  --brand-700: #c2410c; /* Primary brand color (WCAG AA compliant against white) */
  --brand-800: #9a3412;
  --brand-900: #7c2d12;
  --brand-950: #431407;

  /* Semantic UI Tokens */
  --primary: var(--brand-700);
  --primary-foreground: #ffffff;
  --secondary: #09090b;
  --secondary-foreground: #ffffff;
  --accent: #f4f4f5;
  --accent-foreground: #18181b;
  --destructive: #dc2626;
  --destructive-foreground: #ffffff;
  --card: #ffffff;
  --card-foreground: #09090b;
  --muted: #fafafa;
  --muted-foreground: #71717a;
  --border: #e4e4e7;
  --input: #e4e4e7;
  --ring: var(--brand-500);
}
```

---

## 2. Utility Class Usage Quick Reference

| Token Name | Tailwind Utility Class | Intended Usage |
|---|---|---|
| Primary Button Background | `bg-primary` or `bg-brand-700` | Primary CTAs, active submit actions |
| Primary Text | `text-primary` or `text-brand-700` | Primary links, key headline highlights |
| Primary Focus Ring | `focus-visible:ring-ring` | Keyboard focus ring on interactive elements |
| Surface / Card | `bg-card text-card-foreground` | Main container background |
| Muted Sub-surface | `bg-muted text-muted-foreground` | Table headers, code blocks, quiet backdrops |
| Border | `border-border` or `border-zinc-200/70` | Card borders, horizontal separators |
| Destructive Action | `bg-destructive text-destructive-foreground` | Delete, cancel, remove actions |

---

## 3. Dark Mode Tokens

When the `.dark` selector is active:
- Canvas `--background`: `#0a0a0a`
- Card `--card`: `#18181b`
- Border `--border`: `#27272a`
- Primary `--primary`: `var(--brand-300)` (`#fdba74`) with dark foreground (`var(--brand-950)`).
