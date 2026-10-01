# Aldriva Accessibility (a11y) Standards

> **Requirement**: All user-facing components must meet WCAG 2.1 Level AA standards.

---

## 1. Contrast Ratios

- **Body Text**: Minimum contrast of 4.5:1 against its background.
- **Large Text (18px+ bold or 24px+ regular)**: Minimum contrast of 3.0:1.
- **Brand Primary Text & Buttons**:
  - `brand-700` (`#c2410c`) on white provides a 5.18:1 ratio (Compliant).
  - Do **NOT** use `brand-600` (`#ea580c`) for white text (3.56:1, non-compliant).

---

## 2. Interactive Focus & Keyboard Navigation

- **Focus Rings**: All interactive elements (buttons, inputs, links, tabs) must display a distinct focus ring on keyboard navigation:
  `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- **Tap Targets**: Mobile buttons and clickable areas must measure at least 44x44px.
- **Tap Highlight**: `-webkit-tap-highlight-color: transparent` is set globally, relying on focus rings and active scale states (`active:scale-[0.98]`).

---

## 3. Screen Reader & Semantic Standards

- **Dialogs & Modals**: Built on `@radix-ui/react-dialog` with `DialogTitle` and `DialogDescription` for proper aria-labelledby linkage.
- **Form Controls**: Every `Input` or `Textarea` must have an associated `Label` (`htmlFor="id"`) or `aria-label`.
- **Icons**: Decorative Lucide icons must carry `aria-hidden="true"`. Interactive icon-only buttons must have an explicit `aria-label="Action description"`.
- **Form Errors**: Error states must provide clear text descriptions linked via `aria-describedby`, not color cues alone.
