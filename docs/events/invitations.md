# Digital Invitations & RSVP Portal

Aldriva provides an end-to-end **Digital Invitation and RSVP System** that delivers personalized, high-end invitation experiences to VIPs, dignitaries, donors, and invited guests.

---

## 🌟 The Digital Invitation Experience

When an organizer dispatches an invitation, the recipient receives a branded email containing their unique secure link to the digital invitation portal:

```
https://aldriva.com/invitation/[secure_token]
```

No password or account creation is required for the guest. The link utilizes a 64-character cryptographically secure token.

---

## 💌 Digital Invitation Card Features

The invitation portal page (`/invitation/[token]`) displays an interactive, high-end digital invitation card:

- **Host & Event Branding**: Event cover banner, host organization logo, and verified badge.
- **Personalized Salutation**: *"Dear Dr. Eleanor Vance, you are cordially invited to..."*
- **Event Highlights**: Start time, timezone, venue address with Google Maps integration, and dress code.
- **Seating & Table Allocation**: Displays their reserved table (e.g., *"Table 4 — Gold Sponsor Table"*) or specific seat if pre-assigned.
- **Personal Host Message**: Custom note written specifically for this recipient.
- **RSVP Deadline**: Clear countdown or deadline notice (e.g., *"Please respond by October 15, 2026"*).

---

## 📝 RSVP Actions & Responses

Recipients can choose between two primary actions on the invitation page:

### 1. Accept Invitation (RSVP: "Attending")
When the guest clicks **Accept Invitation**:
1. An optional RSVP form opens to collect:
   - Dietary requirements (Vegan, Gluten-Free, Halal, Kosher, Nut Allergy, etc.)
   - Accessibility or mobility requests
   - Plus-one attendee name (if enabled by organizer)
2. The guest submits their response.
3. **Automated Ticket Instance Generation**: The system immediately links an authoritative `ticket_instance` record to their guest profile and assigned seat with a 32-character hexadecimal credential.
4. **Instant Digital QR Pass**: The page transforms to display their official entry pass with a QR code.
5. **Add to Wallet**: Guests can save their pass directly to Apple Wallet or Google Wallet, or download a printable PDF.

### 2. Decline Invitation (RSVP: "Declined")
When the guest clicks **Decline Invitation**:
1. The guest is prompted to leave an optional message of regret for the organizer.
2. The system updates their RSVP status to `Declined`.
3. Any pre-assigned seat is automatically released back to available inventory.
4. If a ticket instance had previously been generated, it is automatically revoked.

---

## 🔄 Resending Invitations & Token Security

- **Secure Single-Recipient Tokens**: Each invitation link contains a 64-character high-entropy hex token generated via cryptographically secure random bytes.
- **Instant Token Invalidation**: If an organizer revokes an invitation, the token link immediately redirects to a notice stating the invitation is no longer active.
- **Organizer Resend**: Organizers can resend invitation emails with a single click from the **Guests & Invites** dashboard.

---

## 🛡️ Privacy & 90-Day Retention Cleanup

To protect sensitive donor, dignitary, and VIP information:
- Transient invitation PII (email, phone, personal messages, and notes) is retained during the active event lifecycle.
- **Automated Retention Purge**: 90 days after an event reaches its ended lifecycle state, an automated retention job anonymizes transient personal data while permanently preserving immutable financial and door check-in logs.

## Music and Guest QR Controls

- The guest-facing invitation page has one visible music pill. Uploaded audio still starts and pauses directly from that pill and stays off until a tap.
- Spotify and SoundCloud links use their provider control APIs through visually hidden, non-zero-size embeds created on mount. The pill shows loading until the provider is ready; each tap calls play/pause synchronously, and the playing label follows provider playback events. SDK failure/timeout exposes an unavailable state whose button opens the validated link externally. The link pill clears the first-visit cookie prompt on narrow screens without changing the RSVP layout. Spotify's runtime script host (`embed-cdn.spotifycdn.com`) is allowlisted from observed CSP reports, and the builder preview iframe grants autoplay.
- Only Spotify and SoundCloud are accepted as music links. Apple Music and Audiomack were removed because the current pill cannot reliably control their standard embeds; neither is selectable or shown as an external-player option. Older saved entries from either provider are filtered from draft, preview, and published reads, with a one-time builder notice. No data migration is needed; the JSONB column stays in place and older stored values remain harmless until the host next saves.
- Admission QRs keep their existing footprint in the RSVP section. Tapping one opens a larger, centered, dark-on-white QR in the dialog; tapping the QR, backdrop, or close button returns to the invitation. Every variant renders the same payload as inline SVG. The former Black Tie QR image used `api.qrserver.com`, which is absent from the page's `img-src` policy and left the enlarged QR blank. Headless Chrome verified rendered paths at 96×96 and 480×480, no image/canvas dependency, no CSP violation, and no change to section height.

### Music link persistence follow-up (2026-10-11)

- Migration 167 adds one nullable `JSONB` column, `public.event_invitation_pages.music_links`. It adds no PostgreSQL type or constraint; the application validates provider, URL, embed URL, and the three-link limit. The matching rollback refuses to drop the column while draft or published-snapshot links remain.
- A real browser save/reload against the configured staging project confirmed the column is present and persisted a Spotify URL, including its `?si=` query string. The same invitation row then loaded both links back into the builder. The Supabase CLI is not linked in this checkout, so migration-history bookkeeping and production schema status remain unverified; the local Supabase service is stopped.
- In the source path, Add music link updates the shared builder draft; the autosave queue sends that draft to `saveInvitationPageDraft`; the action validates and upserts `music_links`; `getInvitationPageDraft` reloads it; preview and publish mappings include the field. A regression test covers the action save/load round trip and missing-column failure.
- The previous collapsed summary checked only `music_audio_url`, so saved link-only drafts displayed “No music.” It now reports a localized link count. The builder preview also skips sample audio/title when a real link exists, so its single pill controls the configured provider instead of a sample track.
- Apply pending local migrations with `npx supabase migration up --local` after starting local Supabase. For a linked staging project, inspect `npx supabase migration list --linked`, then use `npx supabase db push` if migration 167 is pending. Verify `public.event_invitation_pages.music_links` in `information_schema.columns` afterward. The schema change has already been verified on the configured staging project; its CLI migration ledger has not.
