# LS — Residents & the private Lobby

How someone claims their home, the four ways residence gets verified, and the residents-only building Lobby behind it. One of the three trust-role specs alongside [`TOWNIES.md`](TOWNIES.md) and [`GUARDIANS.md`](GUARDIANS.md); for the pitch see [`FEATURES.md`](FEATURES.md); for the role/powers table + procedures see [`OPERATIONS.md`](OPERATIONS.md); the **resident-invite QR + device-link QR** are in [`QR-CODES.md`](QR-CODES.md); for endpoints see [`reference/INVENTORY-API.md`](reference/INVENTORY-API.md).

Last verified: 2026-06-29 against the working tree (`curb-offset-draw`).

---

## 1. What it is

> ⚠️ **"Residents" (this doc) ≠ "resident place card."** This doc is the **role/system** — claiming residency, the four verify paths, the private Lobby. The **resident place card** is a *card kind* (a residential home's card: rent range + the Lobby tab) and is documented in [`PLACE-CARDS.md`](PLACE-CARDS.md) §1. Same neighborhood, two different things.

A **Resident** is someone verified as living in a specific building. Residence is per-building, **lasts one year**, and unlocks that building's **private Lobby** — a residents-only message board (text + photos), the co-resident view, and a verified-resident count. Anyone can *claim* a home; the claim is only useful once *verified*. Verifying a residence also auto-grants **townie** status — on **all four** verify paths: the three auto-verify paths call `grantTownieStatus` (`apps-script/Code.js:1766`), and co-resident approval grants it too (`postVerifyResident`, `Code.js:1830`, added 2026-06-30 for parity). See [`TOWNIES.md`](TOWNIES.md).

---

## 2. Claiming + the four verification paths

A residential claim starts by scanning the building's QR card. `CheckinPage.jsx` detects a residential target (`landmark.category === 'residential'` or a bare building id, `:181`) and calls `claimResidence(dh, buildingId, true)` with `auto_verify` on (`:197`). The backend (`postClaimResidence`, `apps-script/Code.js:1680`) sets `status` to `verified` or `pending` depending on which path qualifies:

| Path | `verified_by` | How it qualifies |
|---|---|---|
| **Admin** | `admin` | Caller holds the admin token (`isAdmin`) |
| **QR invite** | `qr-invite` | The claim carries `auto_verify=true` (the neighbor-QR invite flow from `CheckinPage:197`) |
| **Linked device** | `linked-device` | Another device sharing the caller's `@handle` is already a verified resident of this building (`Code.js:1731–1744`) |
| **Co-resident** | (verified) | A pending claim is later approved by an already-verified resident of the building (`postVerifyResident`, `Code.js:1798`) |

If none qualify, the claim is stored `pending` until a co-resident or admin verifies it.

**The year.** On verify, expiry is set to **+1 year** (`Code.js:1750`): `expiryDate.setFullYear(+1)` → an ISO `expires_at`. On any status read, an expired record is treated as **no residence** (`Code.js:1631`, `exp < now → null`).

**Device linking** (`LinkPage.jsx`, `App.jsx`): a 6-char link token (5-min expiry) carries your `@handle` onto a second device. Once linked, that device qualifies for the **linked-device** auto-verify path on any building your other device already holds.

---

## 3. The data model

**Residents sheet** (`apps-script/Code.js:1938`):
```
['device_hash', 'building_id', 'status', 'verified_by', 'created_at', 'verified_at', 'expires_at']
```
- `status`: `pending | verified`
- `verified_by`: `admin | qr-invite | linked-device` (or set by co-resident verify)
- `expires_at`: ISO, verification + 1 year

**Status read** (`getResidenceStatus` → `fetchResidenceData`, `Code.js:1604`) resolves the caller either by direct `device_hash` or via any device sharing their handle, and returns:
```js
{ building_id, status, expires_at }   // or null if none / expired
```
Client store `useResidence` (`src/hooks/useResidence.js`) holds `{ buildingId, status }`, hydrated at boot from the `init` batch (`useInit.js:88`).

**LobbyPosts sheet** (`Code.js:1939`):
```
['id', 'building_id', 'device_hash', 'text', 'photo_url', 'created_at']
```
A lobby post served to the client (`Code.js:1665`) is **anonymous by design** — `handle` and `avatar` are always `null`; only `is_mine` (does the caller own it) is exposed:
```js
{ id, text, photo_url, created_at, handle: null, avatar: null, is_mine }
```

---

## 4. The private Lobby

The Lobby is a tab on the place card (`LobbyTab`, `PlaceCard.jsx:2492`). It appears **only** when the viewer is a verified resident of *that* building, or admin (`PlaceCard.jsx:3635`):
```js
const isResidentHere = isResidential && residenceBuildingId === building?.id && residenceStatus === 'verified'
// …
if (isResidentHere || isAdmin) t.push({ id: 'lobby', label: 'Lobby' })
```
It shows the residents-only board (text + photos, posts anonymous), a co-resident view, and the verified-resident count (`getResidentCount`, `Code.js:1643`). A resident can delete their own posts (`removeLobbyPost`, author-only). `postLeaveResidence` (`Code.js:1895`) clears all residence records for a device.

---

## 5. Server-side gates

Residence access is enforced **server-side**, not just hidden in the UI — the backend re-verifies the caller on every lobby read and write:

- **Read** (`getLobbyPosts`, `Code.js:1650`): rejects unless the caller's resolved residence matches the building **and** `status === 'verified'` (`:1655`, `forbidden`).
- **Write** (`postLobbyPost`, `Code.js:1836`): same verified-resident check before inserting (`forbidden` otherwise).
- Resolution honors linked devices (`fetchResidenceData`, `Code.js:1604`) so a verified resident's other linked devices also pass.

The frontend tab gate (`isResidentHere`) is convenience; the security boundary is the server check.

---

## Source map
| Thing | File | Key lines |
|---|---|---|
| Claim + 4 verify paths | `apps-script/Code.js` | `postClaimResidence` 1680–1763 (paths 1729–1747; expiry 1750) |
| Co-resident verify | `apps-script/Code.js` | `postVerifyResident` 1798 (also grants townie, 1830) |
| Status read / resolution | `apps-script/Code.js` | `getResidenceStatus` 1638 · `fetchResidenceData` 1604 (expiry 1631) |
| Townie grant on verify | `apps-script/Code.js` | `grantTownieStatus` 1766 (auto-verify paths) · 1830 (co-resident path) |
| Lobby read/write/count | `apps-script/Code.js` | `getLobbyPosts` 1650 · `postLobbyPost` 1836 · `removeLobbyPost` 1865 · `getResidentCount` 1643 |
| Leave residence | `apps-script/Code.js` | `postLeaveResidence` 1895 |
| Sheets | `apps-script/Code.js` | Residents 1938 · LobbyPosts 1939 |
| Claim UI (residential QR) | `src/pages/CheckinPage.jsx` | 173–217 |
| Device linking | `src/pages/LinkPage.jsx` · `src/App.jsx` | link-token flow |
| Residence store + hydration | `src/hooks/useResidence.js` · `src/hooks/useInit.js` | store 1–15 · hydrate 88–92 |
| Lobby UI + tab gate | `src/components/PlaceCard.jsx` | `LobbyTab` 2492 · tab gate 3635/3650 |
| API wrappers | `src/lib/api.js` | claimResidence 386 · lobby-posts 396 · resident-count 382 · verify-resident 392 · leave 410 |

*New doc, 2026-06-29. Reference-kind: when the residence/lobby mechanics change, update the verify-path table + the data model + the source map.*
