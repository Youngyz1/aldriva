# Evergreen Envelope: visual spec (text description of the reference video)

Mobile portrait, one long vertical scroll inside a phone browser. Every section below is built. Each photo frame is filled by the organizer's own uploaded photo. Photos named here only describe what the reference showed; none of the reference's photos, names, text or branding are reused.

## Global look
- Palette: olive/lime green (about #8A9A1B, darker olive for text on cream), warm cream/ivory paper backgrounds with a subtle paper texture, soft sage-grey body text, a small gold wax seal as the only gold accent.
- Type: refined high-contrast serif for headings (ALL CAPS, wide letter-spacing for names and section titles), small serif body text, and a thin flowing script for accents ("Our Wedding", "Formal", "forever").
- Decoration: white-rose and greenery sprigs on card corners (usually top-left or bottom-right, partly overflowing the card edge), soft paper drop shadows, thin inner border lines on cards.
- Buttons: olive pill buttons, small-caps white text (VIEW MAP, RESERVE HERE, GO TO THE ALBUM, RSVP HERE, Submit).
- Section transitions: sections overlap and slide over each other like stacked paper cards as you scroll.

## 1. Envelope gate (first screen)
- Soft, blurred, light-green garden backdrop (decorative template art, not uploaded).
- Top: small serif line "The most important day of our lives has arrived…" and below it "WE'RE GETTING MARRIED!" in caps.
- Center: a flat olive envelope seen from the front (V-shaped flap lines), a gold wax seal in the middle, and a tiny "click here" label above the seal.
- Below the envelope: the couple's names in spaced caps.
- On tap: the flap rotates open (olive triangle pointing up). From inside the envelope a white card slides up, tilted left ("RESERVED FOR [guest name], [N] guests"), together with a small tilted photo of the couple on the right (photo slot 1). An oval white outlined "MORE DETAILS" badge overlaps the right edge of the envelope. After a beat the whole scene transitions into the cover.

## 2. Cover
- Full-bleed couple photo (slot 2), a dark gradient at the top for legibility.
- Top: script "Our Wedding" in white; below it the names in large white serif caps.
- Small pause/play icon at top-left for the background music.
- As you scroll, the photo moves up and the olive envelope back slides in from the bottom as the transition into the next section.

## 3. Invitation card
- Olive envelope back with a gold wax seal at the top. A translucent frosted/vellum card slides over it, with green leaves along the right edge and a thin inner border.
- Text, centered: "Together with their parents:" / names in caps / "Have the honor of inviting you to celebrate their wedding." / date as "02 · 02 · 2027" / city and state.

## 4. Photos and countdown
- Cream paper background. Two white-bordered polaroids (slots 3 and 4), one tilted left entering from the left and one tilted the other way entering from the right. Rose sprigs on the corner of the card above.
- Centered text: "Love wrote our story, and we'll celebrate its most beautiful chapter in:"
- Live countdown: four large olive numerals with small labels underneath (Days, Hours, Min, Sec).

## 5. Venue cards
- Two paper cards stacked with a slight overlap and soft shadows. Ceremony card first: small church icon on top, "CEREMONY" in caps, time (4:30 PM), venue name in bold, address, olive "VIEW MAP" pill. Reception card below with a champagne-glasses icon and the same layout. Floral sprigs on the corners (top-left on the first card, top-right on the second).

## 6. Schedule
- Full-width olive green band with a thin vertical timeline line down the center. Five rows: an icon (plate and cutlery, champagne glasses, cake, dancing couple, hand) at the left, the time next to the icon, a dot on the line, and the label at the right (Dinner, Toast, Cake Cutting, Dancing, Thanks for coming!). Text is white/cream on olive.

## 7. Dress code
- A paper card slides up over the olive band, with a gold wax seal at the top-center overlapping the edge.
- "DRESS CODE" caps heading, a script word beneath it (e.g. "Formal"), two simple line-art figures (a man in a suit, a woman in a gown), then a note ("We request the colors white, ivory and … for the bride and bridesmaids"), then a row of three round color swatches. Floral sprig at the bottom-right corner.

## 8. Info cards
- Two stacked cards, each overlapping the one above slightly, each with a floral corner.
  - WISHING WELL: envelope icon, heading, short note (the best gift is seeing them have the time of their lives…).
  - ADULTS ONLY: olive heart icon, heading, short note ("Although we love the little ones, this event will be for adults only.").
- Each card is individually toggleable.

## 9. Our story
- Dark-green blurred field gradient background.
- A white scalloped lace-edged rounded-square frame holding a photo (slot 5), with small dark dots at the lace corners. The photo swaps to a second photo (slot 6) as you scroll.
- Below the frame, white centered text: "It all began in November 2022, without us imagining that it would be the first chapter of our story. Today, with hearts full of gratitude, we are ready to write our…" followed by the script word "forever" in white/pale gold.

## 10. Accommodations and photos
- Cream background. Hotel/pin icon, "ACCOMMODATIONS" heading, "For your convenience, we have partnered with [hotel] for accommodations.", olive "RESERVE HERE" pill. Below it a camera icon, "PHOTOS" heading, "Share your photos and videos of the event with us", olive "GO TO THE ALBUM" pill. Floral sprigs at the corners. Both optional.

## 11. Closing photo
- A full-bleed couple photo (slot 7) fades in from cream at the top, with a faint script/white text overlay on top (an invitation line). Short transition into RSVP.

## 12. RSVP
- Cream background. A card with a gold wax seal overlapping its top edge. "RSVP" heading, text "We are so excited to celebrate one of the most important days of our lives with you. Please RSVP by [date].", olive "RSVP HERE" pill.
- Lower-left of the card: a tilted white-bordered polaroid (slot 8) overlapping the card edge. Right side: a vertical olive oval badge with the monogram initials ("I & A") overlapping the card edge.
- Bottom: a thin olive footer strip with the credit line.

## 13. RSVP modal
- White sheet over a dimmed backdrop, close "×" at the top-right.
- Title "RSVP". Fields, in order: "Full names of all guests attending the event" (text), "Will you join us for our event?" (select: Yes, I'll be attending / No, I can't make it), "How many people will be attending?" (select), "Leave your best wishes here:" (textarea), olive "Submit" button. A chevron at the bottom hints at scrolling inside the sheet.

## Photo slots (all organizer-uploadable)
1 envelope photo, 2 cover, 3 and 4 polaroids, 5 and 6 story, 7 closing, 8 RSVP polaroid.

## Template art (shipped with the template, not organizer-uploaded)
Greenery backdrop, floral corners, wax seals, lace frame, line-art figures, schedule and info icons, envelope.

## Frames
- Polaroid: white border, thicker bottom edge, soft shadow, rotation roughly 3 to 7 degrees (alternating direction), settling to its final angle on reveal.
- Lace frame: rounded-square photo with a scalloped white lace border and a soft dark-green vignette behind it.
- All frames crop uploaded images through the existing focal-picker and image-presentation helpers so portrait and landscape photos both look right.

## Empty slots
If an organizer uploads fewer photos than there are slots, the template must still look finished. Fall back in this order: reuse the cover or other uploaded photos in the remaining frames, and only hide a decorative frame if the organizer has no photos at all.
