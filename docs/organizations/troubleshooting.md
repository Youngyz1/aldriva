# Profiles & Organizations Troubleshooting

Step-by-step diagnostic workflows for common issues with user profiles, organization hubs, document uploads, and verification.

---

## 👤 Profile & Settings Issues

### Issue: Profile photo upload fails or does not save
**Possible Causes & Solutions**:
1. **File Format**: Ensure your image is a **JPG, PNG, or WebP** file. Other formats (HEIC, TIFF, SVG) are not supported for avatars.
2. **File Size Limit**: Files must be **5MB or smaller**. Compress large images before uploading.
3. **Did Not Click Save**: After cropping your photo, you must scroll down and click **Save Profile Details** to persist the upload.

### Issue: Display name is not updating on public pages
**Resolution**:
- Clear your browser cache or refresh the page. Display name updates are synced across both authentication metadata and profile records.

---

## 🏢 Organization & Public Hub Issues

### Issue: Organization URL slug shows "Already Taken"
**Resolution**:
- Slugs must be globally unique across Aldriva. If `aldriva.com/org/my-charity` is taken, try appending your city, state, or year (e.g., `my-charity-nj` or `my-charity-foundation`).

### Issue: Organization dashboard modules show "Coming Soon"
**Explanation**:
- The **Volunteers**, **Gallery**, **Services**, and **Analytics** sub-pages are currently in preview development. All core features (Overview, Events, Fundraisers, Reviews, Settings, and Verification) are fully active.

---

## 🛡️ Verification & Document Upload Issues

### Issue: Verification document upload fails
**Possible Causes & Solutions**:
1. **File Extension**: Permitted extensions are **.pdf, .jpg, .jpeg, .png, .webp**.
2. **File Size**: Each document must be **10MB or smaller**.
3. **Submission State**: Documents can only be uploaded when your submission is in **Draft** or **Needs More Info** status. If already submitted, wait for review completion.

### Issue: Verification submission was rejected
**Resolution**:
1. Navigate to **Dashboard → Settings → Verification** (or **Dashboard → Org → Verify**).
2. Read the **Reviewer Notes** explaining why the submission was declined (e.g., expired ID, blurred scan, or missing name match).
3. Start a new submission or update your draft with clear, valid government documents matching your account details.

---

## ⭐ Following & Review Issues

### Issue: Cannot follow a user or organization
**Possible Causes & Solutions**:
1. **Not Signed In**: You must be logged in to follow.
2. **Self-Follow**: You cannot follow your own personal account or an organization that you own.

### Issue: "You have already reviewed this item" error
**Resolution**:
- Aldriva enforces a one-review-per-member rule for each organization, event, or campaign to prevent rating manipulation.

---

## 🔗 Related Resources

- **[User Profiles](user-profiles.md)**
- **[Profile Privacy & Settings](profile-privacy-and-settings.md)**
- **[Personal Identity Verification](identity-verification.md)**
- **[Organization Verification](organization-verification.md)**
- **[FAQ](faq.md)**
