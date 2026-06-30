# LS — Guardians, claiming, & staff permissions

How a business owner claims their listing, the guardian/keyholder permission model, staff management, and the server-side gating behind every guardian edit. One of the three trust-role specs alongside [`TOWNIES.md`](TOWNIES.md) and [`RESIDENTS.md`](RESIDENTS.md). The **card content** a guardian edits is specced in [`PLACE-CARDS.md`](PLACE-CARDS.md); the **claim QR + the QR Studio** are in [`QR-CODES.md`](QR-CODES.md); for the pitch see [`FEATURES.md`](FEATURES.md); for the role/powers table + procedures see [`OPERATIONS.md`](OPERATIONS.md); for endpoints see [`reference/INVENTORY-API.md`](reference/INVENTORY-API.md).

Last verified: 2026-06-29 against the working tree (`curb-offset-draw`).

---

## 1. What it is

A **Guardian** is the owner/operator who has claimed a business listing and controls its card. The **first** person to claim a listing becomes its guardian (full control); anyone they add afterward is a **keyholder** with exactly the per-field permissions the guardian grants. All guardian/keyholder writes are **re-verified server-side** (the backend checks the caller against the Guardians sheet on every mutating endpoint), so UI state is never the security boundary.

---

## 2. The claim flow

Claiming proves **physical presence**: the `claim_secret` (8-char hex) is printed on the QR card posted at the location.

1. Scanning opens `/claim/<listingId>/<secret>` → `ClaimPage.jsx` calls `claim(listingId, secret)` (`useGuardianStatus.js:100`) → `postClaim` (`api.js:181`).
2. Backend `postClaim` (`Code.js:601`) validates the secret against the listing:
   ```js
   if (result.rowData.claim_secret && result.rowData.claim_secret !== secret)
     return errorResponse('Invalid claim secret', 'unauthorized')   // Code.js:614
   ```
3. **First claimant = guardian; subsequent = keyholder** (`Code.js:625`):
   ```js
   var role = existingForListing.length === 0 ? 'guardian' : 'keyholder'
   var permissions = role === 'guardian' ? 'menu,events,replies,photos,hours' : ''
   guardianSheet.appendRow([listing_id, device_hash, role, permissions, nowISO()])
   ```
4. On success the client stores `{ id, role, permissions }` in `localStorage` (`lsq_guardian_listings`).

> ⚠️ **Claiming also auto-grants townie status.** `postClaim` calls `grantTownieStatus` (`Code.js:636`), backfilling synthetic check-ins — so a guardian/keyholder is a **townie immediately** and can review *other* places right away (no real check-ins required; `postReview` is a pure townie gate). As-built; whether this is intended vs. a loophole is **flagged for review** (onboarding arc, 2026-06-29). See [`TOWNIES.md`](TOWNIES.md).

**The secret** is generated/retrieved by `getClaimSecret` (`Code.js:792`): auto-provisions a listing (admin only), auto-generates an 8-char hex secret if missing (`Utilities.getUuid().split('-')[0]`), persists it to the `claim_secret` column. The **QR Studio** (`PlaceCard.jsx:2299`, `QrTab`) renders the guardian QR pointing at `https://lafayette-square.com/claim/<id>/<secret>`.

---

## 3. Guardian vs Keyholder — the permission model

Permissions are the set `['menu', 'events', 'replies', 'photos', 'hours']` (`useGuardianStatus.js:9`). A **guardian** implicitly has all of them; a **keyholder** has exactly the comma-separated subset stored on their row.

**Guardians sheet** (`Code.js:1937`):
```
['listing_id', 'device_hash', 'role', 'permissions', 'created_at']
```
- `role`: `'guardian'` (empty/null = legacy guardian) | `'keyholder'`
- `permissions`: comma-separated, e.g. `'menu,events,replies,photos,hours'`

**Server-side helpers** (`Code.js:853–894`) — all honor **linked devices** (`getLinkedHashes`, so a guardian's other linked devices also pass):
- `isStaffOf(listingId, dh)` — any role
- `isFullGuardianOf(listingId, dh)` — guardian only
- `getStaffPermissions(...)` — returns all five for a guardian, else the parsed subset
- `staffHasPermission(listingId, dh, perm)` — the per-field check

The client mirrors these (`useGuardianStatus.js:43–70`: `isGuardianOf`, `isFullGuardianOf`, `permissionsFor`, `hasPermission`) for UI only.

---

## 4. Staff management

The roster UI is `StaffSection` (`PlaceCard.jsx:2156`); all staff operations are **guardian-only** (`isFullGuardianOf`):

| Action | Function | Notes |
|---|---|---|
| List staff | `getListingStaff` (`Code.js:898`) | returns `{ device_hash, handle, avatar, vignette, role, permissions, created_at }` per member |
| Set a keyholder's permissions | `postUpdateStaffPermissions` (`Code.js:925`) | comma-separated `permissions` |
| Promote keyholder → guardian | `postPromoteStaff` (`Code.js:954`) | grants all five perms |
| Demote guardian → keyholder | `postDemoteStaff` (`Code.js:979`) | can't demote yourself; **can't demote the last guardian** (`:guardianCount <= 1`) |
| Revoke (remove) | `postRevokeStaff` (`Code.js:1010`) | can't revoke yourself; deletes the row |

API wrappers: `api.js:240–258`.

---

## 5. What a guardian edits — and the server-side gates

**Editable field whitelist** (`postUpdateListing`, `Code.js:673`):
```
name, address, category, subcategory, phone, website, description, logo,
home_based, rating, review_count, hours_json, amenities_json, tags_json,
photos_json, history_json, reservation_url, menu_url, menu_json
```
A **guardian** may edit any of these. A **keyholder** is gated per field via `STAFF_PERM_MAP` (`hours_json→hours`, `menu_json/menu_url→menu`, `photos_json→photos`); fields not in the map are guardian-only:
```js
if (!isFullGuardian) {
  const neededPerm = STAFF_PERM_MAP[colName]
  if (!neededPerm || !staffHasPermission(listing_id, device_hash, neededPerm)) continue   // Code.js:704
}
```

**Every guardian endpoint re-verifies the caller server-side:**

| Endpoint | Function | Gate |
|---|---|---|
| `update-listing` | `postUpdateListing` (`Code.js:653`) | guardian OR staff (`:665`); per-field `STAFF_PERM_MAP` (`:704`) |
| `upload-photo` / `remove-photo` | `postUploadPhoto` / `postRemovePhoto` (`Code.js:1959` / `2007`) | `staffHasPermission(..,'photos')` |
| `event` | `postEvent` (`Code.js:578`) | `staffHasPermission(..,'events')` |
| `reply` | `postReply` (`Code.js:552`) | `staffHasPermission(..,'replies')` |
| `accept-listing` / `remove-listing` | `Code.js:724` / `751` | `isFullGuardianOf` (guardian only) |
| `listing-staff`, `update-staff-perms`, `promote/demote/revoke-staff` | `Code.js:898–1031` | `isFullGuardianOf` (guardian only) |

> Note on menus: a guardian's menu edits write `menu_json` to GAS, but for the curated listings in `src/data/menus.json` the bundled file **overrides** GAS at boot — see [`PLACE-CARDS.md`](PLACE-CARDS.md) §3.

---

## 6. The data model (guardian/secret fields on a listing)

On the Listings sheet (`Code.js:1920`): `guardian_hash`, `guardian_token`, `claim_secret`, `created_by`, `accepted` / `accepted_at`. The `getListings` serializer **strips** `guardian_hash`, `guardian_token`, and `claim_secret` from the public response (`Code.js:337`) and exposes only the derived `has_guardian`. Staff identity (handle/avatar) is resolved from the **Handles sheet** (`Code.js:1931`).

## Source map
| Thing | File | Key lines |
|---|---|---|
| Claim page | `src/pages/ClaimPage.jsx` | 9–26 |
| Claim hook + FE perms | `src/hooks/useGuardianStatus.js` | `claim` 100–121 · helpers 9, 43–70 |
| Claim backend | `apps-script/Code.js` | `postClaim` 601–649 (secret 614; role 625) · `getClaimSecret` 792–831 |
| Permission helpers (BE) | `apps-script/Code.js` | 853–894 |
| Staff UI | `src/components/PlaceCard.jsx` | `StaffSection` 2156–2296 · `QrTab` 2299–2350 |
| Staff backend | `apps-script/Code.js` | listing-staff 898 · update-perms 925 · promote 954 · demote 979 · revoke 1010 |
| Update-listing gate | `apps-script/Code.js` | 653–720 (auth 665; per-field 704) |
| Other write gates | `apps-script/Code.js` | reply 552 · event 578 · upload-photo 1959 · remove-photo 2007 · accept 724 · remove 751 |
| Sheets | `apps-script/Code.js` | Listings 1920 · Guardians 1937 · Handles 1931 |
| API wrappers | `src/lib/api.js` | postClaim 181 · staff 240–258 |

*New doc, 2026-06-29. Reference-kind: when the permission set, the editable whitelist, or the staff-op rules change, update §3/§5 + the source map.*
