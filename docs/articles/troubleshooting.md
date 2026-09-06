# Articles Troubleshooting Guide

Step-by-step diagnostic procedures for common questions and technical issues encountered when writing, publishing, or reading Aldriva Articles.

---

## 1. Saving & Creation Issues

### Problem: "Failed to save article draft"
- **Cause 1: Missing Required Fields**: The title must not be empty, and content must contain valid text.
- **Cause 2: Slug Collision**: If you manually entered a slug that already exists on the platform, change the slug or let Aldriva auto-generate a unique slug from your title.
- **Cause 3: Session Expiry**: Ensure your dashboard authentication session is active. If logged out, open a new tab, sign in, and return to save your work.

### Problem: "Template content did not load"
- **Solution**: When starting from a template, ensure you select the template before typing custom content, or click **Reset to Template** to load standard boilerplate sections.

---

## 2. AI Assistant Diagnostics

### Problem: "AI Assistant rate limit reached (429)"
- **Explanation**: You have exceeded the 30 requests per minute threshold.
- **Resolution**: Wait 60 seconds before submitting another draft, polish, or SEO suggestion request.

### Problem: "Prompt blocked by safety guard"
- **Explanation**: The submitted prompt or source text triggered platform safety policies (e.g., prohibited keywords, harassment, or prompt injection syntax).
- **Resolution**: Refine your prompt to focus strictly on non-profit storytelling, factual reporting, and legitimate campaign details.

---

## 3. Publishing & Moderation Delays

### Problem: "My article has been in 'Pending Review' for over 24 hours"
- **Check Content Guidelines**: Ensure your article does not contain unverified financial claims, broken external links, or copyrighted imagery.
- **Verify Linked Entities**: If you embedded fundraisers or organizations, verify that those entities are active and in good standing.
- **Contact Support**: Reach out to platform moderators via the support desk with your Article ID.

---

## 4. Media & Audio Narration

### Problem: "Cover image fails to upload or display"
- **File Format**: Verify that your image is in JPEG, PNG, or WebP format.
- **File Size**: Uploaded images should not exceed 5 MB. Use compression if necessary.
- **Remote Host**: If using an external image URL, ensure the image is publicly accessible over HTTPS.

### Problem: "Audio player is missing or fails to play"
- **Audio Generation State**: Audio synthesis occurs asynchronously following article approval. If the article was just published, allow 2–3 minutes for the audio file to process.
- **Browser Autoplay**: Some mobile browsers restrict automatic audio playback; tap the play button manually.
