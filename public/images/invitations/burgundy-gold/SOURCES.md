# Burgundy Gold — supplied image inventory

All files below were copied byte-for-byte from `C:\Users\Youngyz\burgundy-gold-assets`.
No recolour, resize, recompression, re-encode, crop, or trace was performed.

## Served assets

Only files in this table may live under `public/`. Each row is verified
byte-identically (size + SHA-256) by
`lib/__tests__/burgundy-gold-stage2a.test.cjs`.

| File | Bytes | Pixels | SHA-256 | Source |
| --- | ---: | --- | --- | --- |
| `demo/opening-photo.jpg` | 448100 | 1600 × 2400 | `DB11CF893F31A34BDCAE9FCBCB736320A40E8012DF5247E08589A916512E8B60` | placeholder |

The opening photo is a placeholder until the owner supplies a real
`mf_opening_photo`. It is an existing sample photograph already shipped in this
repository, not an owner-supplied Burgundy Gold asset.

## Placeholder media (placeholder)

The stage 2B demo/preview gallery points at **placeholder** photos that already
ship with the minimalism-dark-blue demo. No file was copied into this folder and
no new image was added; only the existing public paths are referenced.

Origin: `public/images/invitations/minimalism-dark-blue/demo/` (see that
folder's `CREDITS.md`).

| Placeholder file | Origin | Purpose |
| --- | --- | --- |
| `gallery-01.jpg` … `gallery-06.jpg` | minimalism-dark-blue demo library | sample gallery tiles / memories |

## Supplied reference captures — NOT served

The owner supplied eight full-page iPhone captures. They contain baked-in
typography, device chrome and status bars, so they are **reference material
only**. They must never be copied into `public/` or painted behind live text.
Any copy staged under `public/` must be removed.

| File | Bytes | Pixels | SHA-256 | Kind |
| --- | ---: | --- | --- | --- |
| `invitation.png` | 105386 | 349 × 732 | `5A6B3D08B40B15388FB644A4DE97AB4304AF2137A87B5991AE82CC96573A949C` | phone-frame capture |
| `iphone.png` | 6001440 | 640 × 10024 | `13774E8E84ABE6A869247AFD27784377E1C2385E5A33165C5DADF350E190C244` | full-page capture |
| `Screenshot 2026-11-15 205033.png` | 336279 | 396 × 739 | `CD8677B7CB9C854D7A9DDB14715A1932964A27CAEE417E6B5F548048CFC1FDF9` | page capture |
| `Screenshot 2026-11-15 205208.png` | 269596 | 390 × 742 | `5669DE69F50E3417B1C6D9075B51D9987568C73E93DADE93597B1F6906CC31BD` | page capture |
| `Screenshot 2026-11-15 205254.png` | 305163 | 391 × 739 | `80686161894B1D8CD2328319EDB472C11574225DC7BA1227CAD6630904A0BB58` | page capture |
| `Screenshot 2026-11-15 205354.png` | 265095 | 376 × 739 | `5B9507F8C75120643462EEAC1D5326859D350E5A1EFD6B7A1AE8900B7145B42E` | page capture |
| `Screenshot 2026-11-15 205428.png` | 105050 | 372 × 742 | `1B740BA697B521F4C2FFF869C29A7DDDE2C117E3155C9727742DE6B9234E2185` | page capture |
| `Screenshot 2026-11-15 205510.png` | 112305 | 366 × 736 | `804F6F3D57F7BDE705B63D3C0044532A07CAA50655BDD81DB28F1E96CA7A8F64` | page capture |

### Size flag

`iphone.png` is **6001440 bytes (≈5.7 MiB)**, above the 500 KB threshold. It has
not been optimized. Owner approval is required before any optimization.

## Missing artwork

No isolated artwork was supplied — no background, flourish, corner ornament,
divider, gift box or music icon exists as a standalone asset. Every supplied
file is a full-page reference capture. Stage 2A therefore draws ornamentation
with CSS/SVG and renders all copy as real DOM text.
