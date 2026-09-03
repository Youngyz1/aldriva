# Aldriva Brand Voice & AI Content Guidelines

## Core Brand Personality
Aldriva is a warm, community-driven digital ecosystem connecting events, fundraisers, local businesses, articles, and digital products. Our communications embody four core attributes:

1. **Warm & Welcoming**: Friendly, inclusive tone that respects every community member, donor, organizer, and visitor.
2. **Transparent & Trustworthy**: Grounded strictly in real facts, real progress, and verified details. No exaggeration or false urgency.
3. **Empowering**: Highlights how small individual actions collectively create significant positive impact.
4. **Clutter-Free**: Clear, direct, plain-text communication without marketing buzzwords, heavy sales pressure, or excessive symbols.

---

## AI Generation Rules & Constraints

Every AI prompt and system message across `lib/ai/` and `lib/generateCaption.js` enforces these strict rules:

### Formatting Rules
- **Plain Text Only**: No Markdown headers, bolding (`**text**`), italics, bullet points, or raw HTML tags.
- **Emoji Usage**: Maximum 1 to 3 relevant emojis per post (e.g. 📅 for events, ❤️ for fundraisers, 📣 for announcements).
- **No Hashtags**: Do not include `#hashtags`.
- **Length Bounds**:
  - Daily Posts: under 70 words
  - Content Webhooks: under 80 words
  - Promotional Posts: under 120 words

### Fact-Checking & Hallucination Prevention
- **Factual Grounding**: Rely **ONLY** on the specific fields provided in the candidate payload or tool response.
- **No Inventions**: Never invent dates, ticket prices, funding amounts, venue names, statistics, or sponsor lists.
- **Missing Information**: If a detail (like venue or date) is missing, describe the cause or item naturally without assuming details.

---

## Tone Examples by Content Type

### 1. Events
> 📅 Join us for the Lagos Tech & Charity Summit this Saturday at Eko Convention Centre. Connect with community leaders and support local initiatives. Click here to get your tickets: https://aldriva.com/events/lagos-tech-charity-summit

### 2. Fundraisers
> ❤️ The Medical Relief Fund has reached 65% of its goal thanks to generous community donors. Every contribution helps provide essential supplies. Click here to donate today: https://aldriva.com/fundraisers/medical-relief-fund

### 3. Businesses
> 🏢 Spotlight on EcoPrint Solutions in Abuja — providing sustainable printing services while supporting local youth workshops. Learn more: https://aldriva.com/businesses/ecoprint-solutions

### 4. Articles
> 📣 Read our latest story on how local community organizers raised funds for neighbourhood literacy programs across Lagos. Read the full article: https://aldriva.com/articles/neighbourhood-literacy-impact

---

## Output Guard Security Compliance
All AI-generated copy must pass through `lib/ai/output-guard.ts` via `guardBeforeDisplay()` before publication or display. Any prompt containing system-prompt echo patterns or un-sanitised PII is automatically blocked and recorded in `ai_guard_rejections`.

### Format compliance asymmetry
The formatting rules above (plain text, no markdown, emoji limits, word limits) are enforced by **prompt instruction only**. The output guard does not verify formatting — its scope is security and data leakage. A model that ignores format instructions will produce non-compliant output (e.g. `**bold**`, `[text](url)`) that the guard will not catch, because that is not its job.

For the Facebook posting path specifically, `lib/generateCaption.js` applies `stripMarkdownFormatting()` before the guard runs. This is a narrow symptom patch — the strip runs first so the guard checks the actual-to-be-published string. See [ADR-0002 §6](../adr/0002-ai-output-validation-standing-requirement.md) for the full documented asymmetry and future improvement path.

---

## Render-mode history: `/admin/ai/rejections`
For reference: this route appeared as `○` (fully static) in the Phase 3 build because the original `revalidate = 0` / `dynamic = 'force-dynamic'` exports were incompatible with Next.js 16's `cacheComponents` mode and were removed to unblock the build, leaving the page fully static. The subsequent addition of `await headers()` inside the async page component body enrolled it in PPR's dynamic slot, producing the `◐` symbol seen in all subsequent builds. The Supabase query executes inside that dynamic slot and re-runs on every incoming request — freshness is maintained. The symbol is `◐`, not `ƒ`, because PPR routes never show `ƒ` regardless of internal dynamic API usage.
