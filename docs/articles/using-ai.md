# Using the Aldriva AI Writing Assistant

Aldriva integrates an author-supervised AI Writing Assistant powered by state-of-the-art language models to streamline content creation while maintaining complete editorial authenticity.

---

## 1. AI Capabilities Overview

The AI Assistant provides four primary modes accessible directly from the article editor and dashboard:

```
                                  ┌───────────────────────────────┐
                                  │   Aldriva AI Writing Suite    │
                                  └──────────────┬────────────────┘
                                                 │
         ┌──────────────────┬────────────────────┴───────────────┬──────────────────┐
         │                  │                                    │                  │
         ▼                  ▼                                    ▼                  ▼
  ┌──────────────┐   ┌──────────────┐                     ┌──────────────┐   ┌──────────────┐
  │  Draft       │   │  Improve &   │                     │  Suggest     │   │  Social Copy │
  │  Generator   │   │  Polish      │                     │  Metadata    │   │  Generator   │
  └──────────────┘   └──────────────┘                     └──────────────┘   └──────────────┘
```

### 1. Draft Generator (`generate_draft`)
- Transforms high-level ideas, outlines, or bullet points into comprehensive, multi-paragraph articles.
- Formats content automatically with headings, introductory hooks, body narratives, callout boxes, and concluding calls-to-action.
- Customizable tone: *Inspirational, Professional, Urgent, Community-focused, or Journalistic*.

### 2. Improve & Polish (`improve_writing`)
- Evaluates existing text for grammatical accuracy, clarity, cadence, and engagement.
- Offers distinct operational goals:
  - **Make More Engaging**: Adds vivid storytelling phrasing and dynamic sentence structures.
  - **Fix Grammar & Flow**: Polishes syntax without altering original voice or meaning.
  - **Make Concise**: Trims redundant language while preserving core facts.
  - **More Professional**: Standardizes tone suitable for corporate donors and institutional grantors.

### 3. Metadata & SEO Suggester (`suggest_metadata`)
- Analyzes article content to generate:
  - 3 high-converting, SEO-optimized title alternatives.
  - A punchy 140–160 character excerpt for social previews and search engines.
  - 5–8 targeted, relevant tagging recommendations.

### 4. Social Media Snippet Generator (`generate_social`)
- Generates tailored promotion snippets for major channels:
  - **X (Twitter)**: Concise copy with hashtags and character limits in mind.
  - **LinkedIn**: Professional narrative highlighting impact, metrics, and organizational leadership.
  - **Facebook / WhatsApp**: Community-centered conversational updates encouraging shares.

---

## 2. Editorial Safety & Guardrails

Aldriva strictly enforces safety, privacy, and authenticity standards across all AI interactions:

1. **Explicit Review & Insertion**: AI-generated text is never silently written to your article. It appears in a preview modal where authors can review, copy, or click **Insert into Editor**.
2. **Input Sanitization & Injection Defense**: All prompts pass through `input-guard` to block prompt injections and unauthorized system manipulation.
3. **Output Content Filtering**: Responses pass through `output-guard` to prevent toxic, defamatory, or harmful content generation.
4. **Rate Limiting**: To prevent system abuse and ensure fair access, AI operations are governed by a token-bucket rate limiter (30 requests per minute per author).
5. **Data Privacy**: Article text sent for AI processing is evaluated strictly in-session and is never used to train global public models without consent.

---

## 3. Best Practices for High-Impact Output

- **Provide Concrete Facts**: The more specific details you supply (e.g., *"Raised $12,000 for 400 school backpacks in Nairobi"*), the more compelling and authentic the AI draft will be.
- **Maintain Your Personal Voice**: Use the AI draft as a structured foundation, then add personal anecdotes, quotes from team members, and genuine reflections.
- **Verify All Embedded Facts**: Double-check dates, financial figures, and partner names generated during drafting before submitting for publication.
