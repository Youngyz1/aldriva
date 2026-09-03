# Aldriva Publishing & Articles

## What is Aldriva Publishing?
Aldriva Publishing is the content and journalism hub of the Aldriva platform. It hosts community stories, impact reports, event recaps, educational articles, and announcements published by platform administrators and staff writers.

It is built for two main groups:
- **Readers** seeking platform updates, inspiring community stories, and cause education
- **Platform Editors** publishing content to inform, engage, and grow the community

## What can you do with Aldriva Articles?
- Read published articles categorized by topic (impact, events, community stories, announcements)
- Share stories across social media channels
- Retrieve article summaries via AI tools for automated social posts and newsletters

## Editorial & AI Workflow
1. **Authoring**: Editors write and publish articles with cover images, excerpts, and category tags
2. **AI Discovery**: Published articles are surfaced by `get_recent_articles` tool
3. **Caption Generation**: `generateContentCaption()` generates warm, engaging social posts for new articles
4. **Output Screening**: All article captions pass through `guardBeforeDisplay()` before publication

## Data Governance & Allowlisting
To protect editorial integrity and system safety:
- AI tools select explicitly allowlisted columns: `id, title, slug, excerpt, cover_image, categories, published_at, reading_time`
- Drafts, internal author notes, and unpublished revisions are structurally excluded from AI queries

## Related Technical Resources
- [Brand Voice Guide](../marketing/brand-voice.md)
- [Aldriva AI System Architecture](../technical/aldriva-ai.md)
