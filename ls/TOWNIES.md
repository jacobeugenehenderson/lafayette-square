# LS — Townies & the check-in trust ladder

How a visitor becomes a verified local ("townie"), and what that unlocks. One of the three trust-role specs alongside [`GUARDIANS.md`](GUARDIANS.md) and [`RESIDENTS.md`](RESIDENTS.md); for the pitch see [`FEATURES.md`](FEATURES.md); for the role/powers table see [`OPERATIONS.md`](OPERATIONS.md); the **check-in QR** itself is in [`QR-CODES.md`](QR-CODES.md); for endpoints see [`reference/INVENTORY-API.md`](reference/INVENTORY-API.md).

Last verified: **2026-09-10** against the working tree.

---

## 1. What it is

A **Townie** is a verified local: someone who has checked in on **3 distinct calendar days within a rolling 14-day window**, counted across **every device linked to their handle** (see ⭐ below). It's the neighborhood's trust gate — being a townie is what unlocks *participating* (reviewing places, posting to the bulletin, commenting, starting DM threads). Status is **computed server-side** from check-in history.

> ⚠️ **Two other actions auto-grant townie**, via `grantTownieStatus` (which backfills synthetic check-ins): **claiming a listing** and **verifying a residence** (all four paths, including co-resident approval — see [`RESIDENTS.md`](RESIDENTS.md)). So a guardian, keyholder or verified resident is a townie **immediately**, with no real check-ins, and can review *other* places at once. ⭐ **Intended, not a loophole** (Jacob, 2026-06-30).

Config (`apps-script/Code.js`): `LOCAL_THRESHOLD = 3` · `LOCAL_WINDOW_DAYS = 14` · `TIMEZONE = 'America/Chicago'`.

> ### ⭐ STANDING BELONGS TO THE PERSON, NOT THE HANDSET (2026-09-10)
> Townie was the **only** trust gate that did not resolve linked devices, so someone who
> earned it on their phone and then linked a laptop could not post from the laptop — the
> common case, since townie is the standing most people hold.
> ⛔ **Three readers had to move together**, not one: `isTownie` (the gate), `getCheckinStatus`
> (the count the visitor is *shown*) and `grantTownieStatus` (the backfill). Fixing the gate
> alone ships a button that works beside a page saying it should not.
> ▶ **Rides a GAS deploy**, not a site push.

---

## 2. Earning it — the check-in flow

Scanning a place's **check-in QR card** opens `/checkin/<locationId>`. `CheckinPage.jsx` reads status via `useLocalStatus` and fires `checkin(locationId)`, which logs a row through `postCheckin`. When the count crosses the threshold, the page shows **"You're a verified local! Society Pages unlocked."**.

> Check-in is **QR-scan only** today. (An earlier idea — "check-ins also fire quietly whenever you open a place card" — is *not* implemented in the current code; don't document it as a behavior.)

---

## 3. The data model

**Checkins sheet:**
```
['device_hash', 'location_id', 'timestamp', 'date']
```
- `date` is `yyyy-MM-dd` in **Central time** — this is the field distinct-day counting keys on (multiple check-ins the same calendar date count as **one** day, regardless of how many places).

**Status shape** (`getCheckinStatus`):
```js
{ device_hash, distinct_days, threshold: 3, window_days: 14, is_local }   // is_local === distinct_days >= 3
```
Client hook `useLocalStatus` (`src/hooks/useLocalStatus.js`) exposes `{ isLocal, distinctDays, threshold, loading, checkin }`.

**The computation** — ⛔ **not restated here, deliberately.** A copy of the implementation in a
doc goes stale the moment the implementation moves, and this one did: it showed the old
single-`device_hash` match for two months after linked-device resolution landed. Read the source:

```
grep -n -A12 'function isTownie' apps-script/Code.js
```

---

## 4. What it unlocks — and the gates

Townie status gates **participation**, all enforced **server-side** via the `isTownie(deviceHash)` helper — the API rejects non-townies before writing:

| Action | Endpoint / function | Gate |
|---|---|---|
| Post a review (with optional photo) | `postReview` | distinct-days < 3 → `not_townie`; UI catches it in `PlaceCard.jsx` |
| Post to the bulletin board | `postBulletin` | `!isTownie` → `unauthorized` |
| Comment on a bulletin post | `postComment` | `!isTownie` → `unauthorized` |
| Start a DM thread | `postStartThread` | `!isTownie` → `unauthorized` |

**The Society directory itself is public** — browsing/searching places is **not** gated (no `isLocal` check on the `lafayettepages` tab in `SidePanel.jsx`). The "Society Pages unlocked" message marks the moment participation opens up, not a directory paywall. The UI also surfaces the gate ahead of time (`BulletinModal.jsx`'s `gateReason`), but the security boundary is the server check.

---

## Source map

⛔ **No line numbers.** They drift on every edit and are then quoted for months; this table's
did, silently, until the 2026-09-10 pass. Locate any row by symbol instead:

```
grep -n 'isTownie\|getCheckinStatus\|postCheckin\|grantTownieStatus' apps-script/Code.js
```

| Thing | File | Symbol |
|---|---|---|
| Config (3 / 14 / TZ) | `apps-script/Code.js` | `LOCAL_THRESHOLD` · `LOCAL_WINDOW_DAYS` · `TIMEZONE` |
| Status query | `apps-script/Code.js` | `getCheckinStatus` |
| Log a check-in | `apps-script/Code.js` | `postCheckin` |
| Townie helper (the gate) | `apps-script/Code.js` | `isTownie` |
| Auto-grant / backfill | `apps-script/Code.js` | `grantTownieStatus` |
| Linked-device resolution | `apps-script/Code.js` | `getLinkedHashes` |
| Gates | `apps-script/Code.js` | `postReview` · `postBulletin` · `postComment` · `postStartThread` |
| Checkins sheet | `apps-script/Code.js` | the `HEADERS` map |
| Route + UI | `src/App.jsx` · `src/pages/CheckinPage.jsx` | `/checkin/<id>` · `CheckinPage` |
| Status hook · API | `src/hooks/useLocalStatus.js` · `src/lib/api.js` | `useLocalStatus` · `getCheckinStatus` |
| UI gates | `PlaceCard.jsx` · `BulletinModal.jsx` | review gate · `gateReason` |

*New doc 2026-06-29; line numbers excised and the computation de-restated 2026-09-10. Reference-kind: when the threshold/window or the gated-action set changes, update §1 and the gates table — the source map is symbols now and does not need touching.*
