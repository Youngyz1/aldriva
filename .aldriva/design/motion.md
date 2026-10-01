# Aldriva Motion & Animation Guidelines

> **Rule**: Animation must explain spatial transitions or provide immediate feedback — never decorate.

---

## 1. Allowed & Recommended Motion Patterns

| Pattern | Implementation | Purpose |
|---|---|---|
| **Button Press Feedback** | CSS `active:scale-[0.98] transition` | Instant tactile feedback on click/tap |
| **Modal / Dialog Entrance** | Radix UI + Tailwind `animate-in fade-in zoom-in-95 duration-150` | Clarifies that an overlay is opening |
| **Dropdown / Popover Menu** | Radix UI `animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2` | Orientates the user to the anchor source |
| **Drawer Slide-Over** | Framer Motion or CSS `slide-in-from-right duration-200` | Smooth mobile navigation entrance |
| **Skeleton Pulse** | Tailwind `animate-pulse` | Communicates async content loading |
| **Featured Slider Marquee** | GPU-promoted `@keyframes featured-slider-scroll` | Continuous horizontal showcase |

---

## 2. Motion Anti-Patterns (Strictly Prohibited)

- ❌ **No Staggered Entry on Long Lists**: Do not animate 50 table rows or article cards entering one-by-one; it causes visual flicker and degrades performance.
- ❌ **No Random Floating Blobs / Parallax**: Do not add hovering background geometric shapes or mouse-following gradients.
- ❌ **No Bouncing Interactive Elements**: Avoid jarring bounce or elastic spring physics on buttons.
- ❌ **Respect `prefers-reduced-motion`**: Respect user OS accessibility settings by wrapping animations with `motion-reduce:transition-none motion-reduce:transform-none`.
