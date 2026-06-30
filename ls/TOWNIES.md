# LS — Townies & the check-in trust ladder

How a visitor becomes a verified local ("townie"), and what that unlocks. One of the three trust-role specs alongside [`GUARDIANS.md`](GUARDIANS.md) and [`RESIDENTS.md`](RESIDENTS.md); for the pitch see [`FEATURES.md`](FEATURES.md); for the role/powers table see [`OPERATIONS.md`](OPERATIONS.md); the **check-in QR** itself is in [`QR-CODES.md`](QR-CODES.md); for endpoints see [`reference/INVENTORY-API.md`](reference/INVENTORY-API.md).

Last verified: 2026-06-29 against the working tree (`curb-offset-draw`).

---

## 1. What it is

A **Townie** is a verified local: someone who has checked in on **3 distinct calendar days within a rolling 14-day window**. It's the neighborhood's trust gate — being a townie is what unlocks *participating* (reviewing places, posting to the bulletin, commenting, starting DM threads). Status is **computed server-side** from check-in history; there's no flag to set and no way to fake it. Verifying a residence also auto-grants townie status (`grantTownieStatus`, see [`RESIDENTS.md`](RESIDENTS.md)).

Config (`apps-script/Code.js:29`): `LOCAL_THRESHOLD = 3` · `LOCAL_WINDOW_DAYS = 14` · `TIMEZONE = 'America/Chicago'`.

---

## 2. Earning it — the check-in flow

Scanning a place's **check-in QR card** opens `/checkin/<locationId>` (route `src/App.jsx:613`). `CheckinPage.jsx` reads status via `useLocalStatus` and fires `checkin(locationId)` (`:215`), which logs a row through `postCheckin` (`Code.js:473`). When the count crosses the threshold, the page shows **"You're a verified local! Society Pages unlocked."** (`CheckinPage.jsx:343`).

> Check-in is **QR-scan only** today. (An earlier idea — "check-ins also fire quietly whenever you open a place card" — is *not* implemented in the current code; don't document it as a behavior.)

---

## 3. The data model

**Checkins sheet** (`Code.js:1928`):
```
['device_hash', 'location_id', 'timestamp', 'date']
```
- `date` is `yyyy-MM-dd` in **Central time** — this is the field distinct-day counting keys on (multiple check-ins the same calendar date count as **one** day, regardless of how many places).

**Status shape** (`getCheckinStatus`, `Code.js:446`):
```js
{ device_hash, distinct_days, threshold: 3, window_days: 14, is_local }   // is_local === distinct_days >= 3
```
Client hook `useLocalStatus` (`src/hooks/useLocalStatus.js`) exposes `{ isLocal, distinctDays, threshold, loading, checkin }`.

**The computation** (`getCheckinStatus` / `isTownie`, `Code.js:446` / `776`):
```js
const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - LOCAL_WINDOW_DAYS)
const cutoffStr = Utilities.formatDate(cutoff, TIMEZONE, 'yyyy-MM-dd')
const distinctDates = new Set()
rows.forEach(r => { if (r.device_hash === deviceHash && r.date >= cutoffStr) distinctDates.add(r.date) })
return distinctDates.size >= LOCAL_THRESHOLD
```

---

## 4. What it unlocks — and the gates

Townie status gates **participation**, all enforced **server-side** via the `isTownie(deviceHash)` helper (`Code.js:776`) — the API rejects non-townies before writing:

| Action | Endpoint / function | Gate |
|---|---|---|
| Post a review (with optional photo) | `postReview` (`Code.js:515`) | distinct-days < 3 → `not_townie` (`:532`); UI catches it at `PlaceCard.jsx:1071` |
| Post to the bulletin board | `postBulletin` (`Code.js:1261`) | `!isTownie` → `unauthorized` (`:1267`) |
| Comment on a bulletin post | `postComment` (`Code.js:1344`) | `!isTownie` → `unauthorized` (`:1354`) |
| Start a DM thread | `postStartThread` (`Code.js:1395`) | `!isTownie` → `unauthorized` (`:1401`) |

**The Society directory itself is public** — browsing/searching places is **not** gated (no `isLocal` check on the `lafayettepages` tab in `SidePanel.jsx`). The "Society Pages unlocked" message marks the moment participation opens up, not a directory paywall. The UI also surfaces the gate ahead of time (e.g. `BulletinModal.jsx:657` `gateReason`), but the security boundary is the server check.

---

## Source map
| Thing | File | Key lines |
|---|---|---|
| Config (3 / 14 / TZ) | `apps-script/Code.js` | 29–31 |
| Status query | `apps-script/Code.js` | `getCheckinStatus` 446–469 |
| Log a check-in | `apps-script/Code.js` | `postCheckin` 473–511 |
| Townie helper | `apps-script/Code.js` | `isTownie` 776–788 |
| Gates | `apps-script/Code.js` | review 515/532 · bulletin 1261/1267 · comment 1344/1354 · thread 1395/1401 |
| Checkins sheet | `apps-script/Code.js` | 1928 |
| Route | `src/App.jsx` | 613–614 (`/checkin/<id>`) |
| Check-in UI | `src/pages/CheckinPage.jsx` | 173–430 (status 174; fire 215; message 343) |
| Status hook | `src/hooks/useLocalStatus.js` | 1–58 |
| API wrappers | `src/lib/api.js` | `postCheckin` / `getCheckinStatus` 171–177 |
| Review UI gate | `src/components/PlaceCard.jsx` | 1071–1073 |
| Bulletin UI gate | `src/components/BulletinModal.jsx` | 657–662 |

*New doc, 2026-06-29. Reference-kind: when the threshold/window or the gated-action set changes, update §1 config + the gates table + the source map.*
