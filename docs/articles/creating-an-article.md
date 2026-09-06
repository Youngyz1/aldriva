# Creating an Article on Aldriva

Aldriva provides three distinct starting modes to craft impactful stories, campaign updates, event recaps, and announcements.

---

## 1. Creation Modes

When navigating to **Dashboard → My Articles → New Article** (`/dashboard/articles/new`), authors can choose from three flexible authoring pathways:

```
                  ┌─────────────────────────────────────────┐
                  │          Choose Creation Mode           │
                  └────┬─────────────────┬──────────────────┘
                       │                 │
      ┌────────────────┴───┐    ┌────────┴────────┐    ┌───────────────────┐
      │   Start from Blank  │    │ Prebuilt Story  │    │  AI-Assisted      │
      │   Unconstrained     │    │ Templates       │    │  Draft Generator  │
      │   canvas for free-  │    │ Structured      │    │  Prompt to full   │
      │   form writing      │    │ editorial guides│    │  structured draft │
      └────────────────────┘    └─────────────────┘    └───────────────────┘
```

### Mode A: Blank Canvas
Ideal for experienced writers who prefer complete freedom over content layout, structure, and pacing.

### Mode B: Prebuilt Story Templates
Aldriva includes 5 purpose-built templates designed for high engagement:
1. **Organization Update**: Comprehensive report covering milestone achievements, team updates, and upcoming initiatives.
2. **Fundraising Campaign Story**: Emotional and structured storytelling outlining the core need, the community impacted, and explicit donation calls-to-action.
3. **Event Recap**: Post-event summary featuring attendance highlights, key moments, quote callouts, and photo gallery placeholders.
4. **Community Impact Story**: Deep-dive beneficiary story illustrating real-world transformation funded by supporters.
5. **Major Announcement**: High-priority news bulletin for urgent campaigns, leadership announcements, or community alerts.

### Mode C: AI-Assisted Draft
Authors provide a topic prompt, optional key bullet points, target audience, and preferred tone (Inspirational, Urgent, Professional, Community-focused, or Journalistic). The AI generates a fully-formed rich-text draft ready for review and customization.

---

## 2. The Rich-Text Editor

The Aldriva article editor provides an intuitive WYSIWYG experience with robust semantic formatting:

### Core Formatting Toolbar
- **Headings**: H2 and H3 tags for structured reading and optimal SEO indexing.
- **Text Styling**: Bold, Italic, Strikethrough, and Underline.
- **Lists**: Bulleted lists and numbered ordered lists.
- **Blockquotes & Dividers**: Visual pull-quotes and horizontal section breaks.
- **Hyperlinks**: Full URL link insertion with security sanitization.

### Callout Boxes
Highlight key announcements, warnings, or quotes using custom styled callout containers:
- **Info Callout** (Blue border & background): For background notes and helpful context.
- **Warning Callout** (Amber border & background): For deadlines and critical advisories.
- **Tip / Impact Callout** (Green border & background): For success metrics and actionable tips.

```html
<div class="aldriva-callout" data-callout-type="info">
  <strong>Key Milestone:</strong> Over 5,000 community members received clean drinking water this quarter.
</div>
```

---

## 3. Embedding Aldriva Entities

Authors can embed live, interactive cards referencing real platform resources:

1. Click the **Entity Card** button in the editor toolbar.
2. Search by keyword across **Fundraisers**, **Events**, or **Organizations**.
3. Select the entity to insert a secure embedded component directly into the article body.

```html
<div class="aldriva-entity-embed" 
     data-entity-type="fundraiser" 
     data-entity-id="uuid-here" 
     data-entity-slug="clean-water-initiative" 
     data-entity-title="Clean Water Initiative">
  <!-- Card preview rendered dynamically -->
</div>
```

---

## 4. Metadata & Publishing Settings

Before publishing, configure essential story metadata:

- **Title**: Compelling, clear headline (auto-generates the URL slug).
- **Slug**: Customizable URL path component (e.g., `/articles/my-community-story`).
- **Excerpt**: Short 1–2 sentence summary used for search results, article cards, and social media previews.
- **Cover Image**: High-resolution banner image (minimum recommended dimensions: 1200x630px).
- **Primary Category**: Select from *Fundraising, Community, Events, Impact, Organization, News, or Volunteer*.
- **Tags**: Comma-separated search tags (e.g., `cleanwater, education, charity`).
- **Author Attribution**: Choose between publishing under your personal name or as an official post for a verified organization you manage.
- **Visibility**: Set to **Public** (indexed everywhere), **Unlisted** (accessible only via direct link), or **Private** (visible only to authors and organization team members).
