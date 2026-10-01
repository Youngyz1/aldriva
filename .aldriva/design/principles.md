# Aldriva Design Principles

> **Core Axiom**: *Preserve the product. Improve the experience.*  
> Existing functionality is mandatory. Existing UI is implementation history, not design authority.

---

## 1. The Core Philosophy

Aldriva connects events, fundraisers, local businesses, articles, and digital products. It is an information-dense, high-utility business and community platform. Its design must convey trust, clarity, competence, and warmth.

### Principle 1: Clarity Over Decoration
Users arrive at Aldriva with concrete goals: buying a ticket, making a donation, configuring a store item, or publishing an article. Every pixel on screen must serve their comprehension or action. If an element (border, gradient, background, badge, icon) does not clarify meaning or hierarchy, eliminate it.

### Principle 2: Meaningful Hierarchy
Not everything deserves equal visual weight. A page with ten equally weighted cards has no hierarchy. Establish a clear visual sequence:
1. **Primary Focus**: The core action or dominant insight.
2. **Contextual Detail**: Immediate supporting data or secondary actions.
3. **Tertiary Metadata**: Quiet timestamps, tags, or helper text.

### Principle 3: Intentional Containers (Question Every Card)
A card or border exists solely to group related data when separation improves cognitive parsing. 
- Do **not** wrap every single statistic, paragraph, or action in a discrete card.
- If removing a card border or background makes the page feel cleaner and more breathable, remove it.
- Use whitespace, subtle dividers, and typography scale to organize content before reaching for container borders.

### Principle 4: Density with Breathing Room
Aldriva is a multi-module system where users manage complex data (seating charts, donor lists, inventory). The interface must be information-rich without feeling cramped. Use tight, consistent component spacing paired with generous section-level whitespace.

### Principle 5: Meaningful Color
Color communicates state, action, category, or brand — it is never applied merely to make an interface "look colorful."
- **Brand Accent**: Orange (`--brand-700` / `#c2410c`) for primary calls-to-action and active brand states.
- **Neutral Foundation**: Zinc tones (`zinc-50` through `zinc-900`) for structure, surfaces, and text.
- **Semantic Feedback**: Red (`destructive`) for irreversible actions, Green for verified/live states, Amber for pending review.
- **No Random Accent Rainbows**: Do not assign arbitrary colors to arbitrary metric tiles.

### Principle 6: Strong Typography First
Typography must establish structure before icons and badges are added. Use font weight, tabular numerals for figures, and scale (`text-xs` to `text-3xl`) to establish hierarchy.

### Principle 7: Restraint & Anti-AI Aesthetic
Aldriva must never look like generic AI-generated software. Avoid:
- Purple/indigo/cyan gradient meshes.
- Glassmorphism, blurred backdrop cards, and heavy drop shadows.
- Symmetrical 4-box metric grids with colorful circular icons.
- Random decorative blobs, abstract illustrations, and unnecessary decorative badges.

### Principle 8: Product-Specific Character
An event ticketing checkout, an administrative moderation queue, and a community fundraising story have different user mindsets. They should share the same atomic design tokens without feeling forced into the same rigid layout template.
