# Workflow: Reviewing a Page

---

## Code & Design Quality Review Checklist

Execute this review whenever evaluating changes to any page:

1. **Architecture & Boundaries**:
   - Are Server Components used by default?
   - Is `"use client"` only present when interactivity or hooks are strictly required?
   - Are sensitive Supabase service-role calls restricted to server files?
2. **Design System Alignment**:
   - Are colors drawn from `--brand-*` and `--primary` / `zinc-*`?
   - Are buttons solid, using `components/ui/button.tsx`?
   - Are corner radiuses `rounded-xl` for cards and `rounded-lg` for small elements?
3. **Information Density**:
   - Is the visual noise minimal?
   - Are statistics formatted with `tabular-nums`?
4. **Resilience**:
   - Are loading states handled cleanly via `<Suspense>` or skeleton components?
   - Are empty states handled via `DashboardEmptyState.tsx`?
