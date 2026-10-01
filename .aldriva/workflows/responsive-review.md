# Workflow: Responsive Layout Review

---

## Step-by-Step Responsive Audit

1. **Set Browser Viewport to 375px (Mobile)**:
   - Check for horizontal scrollbars (`document.documentElement.scrollWidth > window.innerWidth`).
   - Check navigation: Bottom pill bar or drawer functions cleanly.
   - Check touch targets: Buttons and links are >= 44x44px.
   - Check primary CTA: Sticky bottom bar renders above screen edge.
2. **Set Viewport to 768px (Tablet)**:
   - Check grid collapse: Cards render as 2-column without overlap.
   - Check modal dialogs: Modals stay centered and within visible viewport bounds.
3. **Set Viewport to 1440px (Desktop)**:
   - Check max-width: Page content is centered inside `max-w-7xl` container.
   - Check sticky columns: Sidebars pin correctly during long vertical scrolls.
