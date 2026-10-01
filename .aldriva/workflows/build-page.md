# Workflow: Building a New Page

---

## Sequence for AI Agents Building New Views

```text
1. Understand Requirements & User Intent
   ↓
2. Inspect Relevant Existing Components & Patterns (.aldriva/design/patterns/)
   ↓
3. Plan Information Architecture & Hierarchy (Primary Action, Dominant KPI, Layout)
   ↓
4. Implement UI Using Standard Tokens & Primitives (components/ui/)
   ↓
5. Wire Server Actions & Data Queries with Auth Verification (lib/auth.ts)
   ↓
6. Author Unit / Integration Tests in lib/**/__tests__/*.test.cjs
   ↓
7. Append New Test Files to package.json "test" Script
   ↓
8. Execute Verification Chain:
   - npx eslint <files>
   - npx tsc --noEmit
   - npm test
   ↓
9. Visual Review at 375px, 768px, 1024px, 1440px
   ↓
10. Update Living Documentation (docs/CURRENT-STATE.md, active phase doc)
```
