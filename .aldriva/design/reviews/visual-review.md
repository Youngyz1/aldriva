# Aldriva Visual QA & Review Protocol

> **Rule**: UI implementation is not finished when TypeScript compiles. Open the page in a browser and inspect visually at multiple viewports before declaring work complete.

---

## 1. Required Viewport Inspection Matrix

Every new or redesigned view must be evaluated at these 4 explicit viewport widths:

| Viewport | Device Target | Key Checks |
|---|---|---|
| **375px** | Standard Mobile (iPhone) | No horizontal page scrolling; sticky CTAs reachable; table collapse/scroll works; touch targets >= 44x44px; readable font sizes. |
| **768px** | Tablet (iPad portrait) | 2-column card layouts balanced; sidebar navigation responsive; modals fit within screen bounds. |
| **1024px** | Small Desktop / Tablet Landscape | Sticky sidebars dock correctly; desktop top navigation transitions cleanly; table columns align. |
| **1440px** | Large Desktop | Page max-width constraints (`max-w-7xl`) prevent awkward over-stretching; whitespace feels intentional. |

---

## 2. Visual Quality Review Checklist

Run through these 10 visual criteria:

- [ ] **1. Hierarchy**: Is the primary focus immediately obvious within 2 seconds of looking at the screen?
- [ ] **2. Container Count**: Did you eliminate unnecessary nested cards, heavy borders, or redundant background tiles?
- [ ] **3. Spacing Consistency**: Are interior card paddings consistent (24px desktop, 16px mobile)?
- [ ] **4. Typography Discipline**: Are prices and metrics formatted with `tabular-nums`? Are heading weights appropriate?
- [ ] **5. Button Integrity**: Are primary buttons solid orange (`bg-primary` / `bg-brand-700`) with no gradients?
- [ ] **6. Color Meaning**: Is color used strictly for action, status, or brand — and not decorative noise?
- [ ] **7. Empty & Error States**: Does the view look intentional when there are 0 items or when network errors occur?
- [ ] **8. Contrast**: Do all text elements pass WCAG AA contrast (especially white text on orange)?
- [ ] **9. Overflow Safety**: Does the page scroll smoothly without horizontal scrollbars appearing?
- [ ] **10. Originality**: Does the page look like a handcrafted Aldriva experience rather than generic AI SaaS software?
