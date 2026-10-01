# Pattern: Editorial Articles & TipTap CMS

> Scope: `app/articles/[slug]/*`, `app/dashboard/articles/*`

---

## 1. Primary Purpose
Provide an immersive, distraction-free reading experience for community stories, interviews, and news, backed by a powerful WYSIWYG editor.

---

## 2. Key Subsystems & Design Specifications

- **Article Reader Layout (`app/articles/[slug]/page.tsx`)**:
  - Max width constrained to `max-w-3xl mx-auto px-4` for optimal reading ergonomics.
  - Featured cover image with caption.
  - Author byline with avatar, publish date, reading time estimate, and AI narration audio player (`lib/audio/*`).
  - Rich text typography configured via `.tiptap-editor`.
  - Share drawer and related articles footer.
- **TipTap Creator Workspace (`components/editor/*`)**:
  - Floating/sticky formatting toolbar (Headings, Bold, Italic, Link, Image, Video Embed).
  - Clean inline image uploader with compression (`browser-image-compression`).
  - Real-time word count and autosave draft indicators.
