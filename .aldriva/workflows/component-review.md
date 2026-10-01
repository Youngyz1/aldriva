# Workflow: Component Review & Deduplication

---

## Component Audit Sequence

Before creating or approving any new UI component:

1. **Verify Uniqueness**: Check `components/ui/`, `components/dashboard/`, and `components/` to verify an equivalent component does not already exist.
2. **Examine Accessibility**:
   - Focus rings present (`focus-visible:ring-2`).
   - Appropriate ARIA attributes attached.
   - Screen-reader-only labels (`sr-only`) on icon buttons.
3. **Inspect Props & TypeScript**:
   - Explicit TypeScript interface exported (e.g. `interface ButtonProps`).
   - Support for `className` merging via `cn()`.
   - Forwarding refs (`React.forwardRef`) where appropriate.
4. **Enforce Design Tokens**:
   - No hardcoded pixel values where Tailwind spacing scale applies.
   - No hardcoded hex color values where `--brand-*` or `zinc-*` apply.
