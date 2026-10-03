# Aldriva — 3D Office (Stage 19): READ-ONLY RULE

The 3D office (`app/admin/workforce/office/`, `lib/workforce/office.ts`) is
another VIEW of stored workforce state. It is never a second runtime.

HARD RULES (any violation needs a NEW STAGE — never extend in place):
- The office MUST NEVER start, approve, edit or mutate anything: no server
  actions, no API routes, no service-role client, no writes of any kind.
- It MUST NEVER gain write controls (buttons, forms, toggles that change
  state). If product wants office-initiated actions, that is a new stage
  with its own approval, audit and test plan — not an edit to these files.
- Data flows server → snapshot → scene only. No client fetch, no websockets,
  no Realtime, no polling the database from the client (polling re-renders
  the server component via `router.refresh()`).
- three.js stays route-scoped: imported ONLY in `OfficeScene.tsx`, loaded
  via `next/dynamic` with `ssr:false`. Never hoist it into shared modules.
- Animation reflects STORED state only. Never invent activity, presence, or
  incidents. Unknown states render neutral.
