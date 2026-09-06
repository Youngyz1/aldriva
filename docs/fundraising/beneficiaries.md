# Beneficiary Setup & Claims

Aldriva distinguishes between the **Organizer** (the person or group running the campaign) and the **Beneficiary** (the person, family, or cause receiving the funds).

---

## 👥 Supported Beneficiary Types

When configuring an Organization Fundraiser, you can choose from the following beneficiary types:

| Beneficiary Type | Label | Required & Optional Details |
| :--- | :--- | :--- |
| **Self** | *Myself / Organization* | Funds go directly to the organization running the campaign. |
| **Person** | *Another person* | Full name, personal relationship (e.g., *"Sister"*, *"Colleague"*), optional photo. |
| **Family** | *Family* | Family name (e.g., *"The Davis Family"*), family description, optional photo. |
| **Organization** | *Organization* | Organization name, website URL, optional logo/photo. |
| **Charity** | *Registered charity* | Official charity name, nonprofit registration number, website. |
| **Community** | *Community project* | Project name, community description, optional photo. |
| **Animal** | *An animal or pet* | Pet name, species (e.g., *"Golden Retriever"*), optional photo. |

---

## ✉️ Beneficiary Profile Claim Workflow

To ensure transparency and trust, third-party beneficiaries can be invited to claim and verify their profile on Aldriva:

```
1. Organizer creates campaign with external Beneficiary
                      │
                      ▼
2. System creates unlinked Beneficiary record & secure 64-char claim token
                      │
                      ▼
3. Organizer clicks "Send Invite" in Campaign Edit page (/fundraisers/edit/[id])
                      │
                      ▼
4. Beneficiary receives branded invitation email with secure link:
   https://aldriva.com/beneficiary/claim/[token]
                      │
                      ▼
5. Beneficiary logs in or registers on Aldriva
                      │
                      ▼
6. Beneficiary profile binds to their account (/dashboard/beneficiary)
```

---

## 🛡️ Security & Claim Rules

- **Authentication Required**: Claiming a beneficiary profile requires logging into an Aldriva account. The claim link alone does not grant access; it binds the beneficiary record directly to the authenticated account.
- **One-Time Claim**: Once claimed, the token is consumed and the profile status updates to **Claimed** across the campaign.
- **Verified Transparency**: The public campaign page displays a verified badge indicating the beneficiary has confirmed their identity.

---

## 🔗 Related Documentation
- [Creating a Fundraiser](creating-a-fundraiser.md)
- [Verification & Trust](verification-and-trust.md)
- [Managing Your Fundraisers](managing-fundraisers.md)
