# Aldriva UI Anti-Patterns

> **Never introduce these patterns into the Aldriva codebase.**

---

## 1. The "Generic AI SaaS" Syndrome
- ❌ **Purple / Blue / Indigo Gradient Headers**: Aldriva uses clean white surfaces with Zinc text and solid Orange primary accents.
- ❌ **Glassmorphism / Frosted Glass Everywhere**: Do not use `backdrop-blur-md bg-white/20 border-white/30` on content cards.
- ❌ **Everything in a Separate Card**: Wrapping single sentences, single stats, or lone buttons in separate bordered boxes creates visual clutter.
- ❌ **Symmetrical 4-Card Metric Grids with Circular Icons**: Avoid identical metric boxes with colorful rounded icon circles unless each metric serves a distinct, actionable purpose.

---

## 2. Layout & Typography Anti-Patterns
- ❌ **Missing Tabular Numerals**: Displaying prices or financial figures without `tabular-nums` causing jumpy layouts.
- ❌ **Low-Contrast Orange Text**: Using `text-orange-600` for white text on orange background (fails WCAG AA). Use `text-brand-700` (`#c2410c`) or `text-white bg-brand-700`.
- ❌ **Excessive Badge Clutter**: Tagging every single word with a pill badge.
- ❌ **Hidden Overflow Breaking Sticky Elements**: Using `overflow-x: hidden` on `html` or `body` instead of `overflow-x: clip`.
- ❌ **Unresponsive Tables**: Data tables that push page width beyond 100vw on mobile devices.

---

## 3. Interaction & Component Anti-Patterns
- ❌ **Gradients on Buttons**: Buttons must be solid (`bg-primary`) or clean outline/ghost.
- ❌ **Duplicating UI Primitives**: Writing ad-hoc button or dialog components instead of importing `components/ui/button` or `components/ui/dialog`.
- ❌ **Untracked Test Files**: Creating `.test.cjs` files without adding them to `package.json`'s `test` script.
- ❌ **Bypassing Output Guard on AI Outputs**: Displaying LLM-generated text without passing through `guardBeforeDisplay()`.
