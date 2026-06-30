# LS — Onboarding playbook (the field procedure)

The operator's manual for **signing people onto the platform in person** — and having them sign others on too. Built on the diamond reference specs: [`PLACE-CARDS.md`](PLACE-CARDS.md), [`GUARDIANS.md`](GUARDIANS.md), [`TOWNIES.md`](TOWNIES.md), [`QR-CODES.md`](QR-CODES.md), [`IDENTITY.md`](IDENTITY.md), [`DEVICE-LINK.md`](DEVICE-LINK.md), [`OPERATIONS.md`](OPERATIONS.md). Those specs map the *mechanics* (file:line); this doc is the *procedure* + the rights analysis.

**Phase 1 (prose) — drafted 2026-06-29 by the Logistician, against the working tree (`curb-offset-draw`). The code-verification appendix (Phase 2) awaits Jacob's approval of this prose.**

> Scope: the **commercial / restaurant Place card** and the **Guardian** claim are the meeting hinge (primary). **Townie** is documented as the secondary, time-gated path.

---

## ⭐ Tomorrow readiness verdict

| Path | Verdict | One-line |
|---|---|---|
| **Commercial Place card** | 🟢 *if the restaurant is already listed* · 🟡 *if brand-new* | ~18 dining listings already carry rich cards; a brand-new place needs an admin-created **dining** listing first (auto-provision makes a *residential* stub — wrong category, empty card). |
| **Guardian claim** | 🟡 | End-to-end wired and the claimant becomes guardian **instantly**. Must-clear before walking out: (1) have the claim QR/secret in hand, (2) confirm the GAS backend deploy is current, (3) accept the handle-step friction (no name suggestions yet — see Massage §a). |

### Blockers Jacob must clear before walking out
1. **Confirm the restaurant is on the map with a real card.** If it's one of the ~18 dining listings — done. If not, **create a proper `dining` listing first** (admin) — do *not* rely on `getClaimSecretAdmin` auto-provision, which stands up a `residential/houses` stub (`Code.js:800`) with no card content and the wrong category.
2. **Have the Guardian claim QR/secret ready.** As admin, Jacob can pull it on the spot from the card's **QR tab** (auto-fetches the secret) or the **QR Studio** — no pre-printing strictly required if the owner can scan a screen. Pre-print or pre-load the `/claim/<id>/<secret>` URL as a backstop. **No card/secret → no claim.**
3. **Verify the backend (GAS) deployment is current** (`OPERATIONS.md §6` notes a possible pending redeploy). The claim, handle, and review writes all hit GAS; if it's stale or unreachable the gates fail open silently (`OPERATIONS.md §3`).
4. **Set the handle-friction expectation.** Today the claim flow *requires* a unique handle before it proceeds (no suggestions/skip). It works, but it's the one rough moment in an otherwise instant flow — Massage §a proposes the fix.

---

## Path A — Commercial / restaurant Place card

**Goal:** the restaurant is on the map with a working, rich card before the owner ever touches it.

### A.1 The procedure (already-listed restaurant — the happy path)
1. The place exists as a listing (`category: 'dining'`) — it shows in the **Society Pages** directory (`SidePanel.jsx`, `lafayettepages` tab) and opens a full **place card** (`PlaceCard.jsx`): Overview · Reviews · Photos · Ticker · **Menu** · etc., tabs appearing only when content exists (`PLACE-CARDS.md §1`).
2. Browsing the directory is **public** — no gate (`PLACE-CARDS.md §1`, `TOWNIES.md §4`). Anyone Jacob hands the map to can see the card immediately.
3. Curated menus live in `src/data/menus.json` and **override** GAS for 10 listings (`PLACE-CARDS.md §3`); everything else a guardian authors writes to GAS via `update-listing`.

### A.2 Brand-new place not yet listed
- A listing must exist before a card or claim QR can resolve. **Admin creates it.** The on-the-fly `getClaimSecretAdmin` path *will* auto-provision a row, but as `residential/houses` (`QR-CODES.md §2`, `Code.js:800`) — wrong for a restaurant and with no card body. So for a restaurant: **create a proper `dining` listing** (name, address, category/subcategory, ideally logo + a few fields) so the card isn't a dead shell when the owner first sees it.
- Delivery readiness (a `menu` with a `schedule` window + the `delivery` tag + a live courier) is **only** relevant if the meeting is about orders — and end-to-end ordering is a "coming soon" placeholder (`PLACE-CARDS.md §3`, `CaryButton`). **Do not promise live delivery.**

### A.3 Artifact checklist — Place card
| Artifact | Who makes it | On-the-spot-able? |
|---|---|---|
| The listing row (id, name, address, `dining` category) | Admin (Jacob) — Sheet or admin tooling | ✅ yes, but pre-create for a clean first impression |
| Card content (logo, photos, hours, description, menu) | Guardian after claim, *or* Jacob pre-seeds | ✅ guardian edits inline post-claim |
| Curated menu (one of the 10) | Bundled `src/data/menus.json` | ❌ ship-time only (overrides GAS) |

---

## Path B — Guardian claim (the meeting hinge)

**Goal:** the owner claims his restaurant and becomes its guardian **instantly**, then can edit the card and add staff.

### B.1 The procedure
1. **Jacob presents the Guardian claim QR** (encodes `/claim/<listingId>/<secret>`, `QR-CODES.md §1`). The 8-char hex `claim_secret` *is* the credential — possession proves presence (`GUARDIANS.md §2`).
2. **Owner scans** → `ClaimPage.jsx` fires `claim(listingId, secret)` → `postClaim` (`Code.js:601`) validates the secret (`:614`).
3. **First claimant = guardian** (full perms: `menu,events,replies,photos,hours`); any subsequent claimant on the same listing = **keyholder** (`Code.js:625–633`).
4. **Instant townie bonus** — `postClaim` calls `grantTownieStatus` (`Code.js:636`), backfilling synthetic check-ins so the new guardian is **immediately a townie too** (see Massage §b — this is *not* what the specs imply). The success screen reads "You're a recognized local in the neighborhood" (`ClaimPage.jsx:136`).
5. **Identity gate** — before the success screen, the flow requires a **handle** (mandatory, `ClaimPage.jsx:71` `needsHandle` blocks everything) then offers an **avatar** (skippable, `:74–96`). See Massage §a.
6. **Done** — the guardian opens the place on the map and edits inline; all writes re-verify server-side (`GUARDIANS.md §5`).

### B.2 The #1 artifact — "I have a business name" → "I'm holding a claim card"
This is the critical trace. The claim cannot happen without the secret-bearing QR:

1. **Listing exists** (Path A) with an `id`.
2. **Fetch the claim secret** — `getClaimSecret` (`Code.js:792`) generates an 8-char hex lazily (`Utilities.getUuid().split('-')[0]`) and persists it to the `claim_secret` column. **Who may fetch:** a full guardian of the listing **or an admin** (`getClaimSecretAdmin`). Jacob is admin → he can pull it for any listing (`QR-CODES.md §2`).
3. **Render the QR** — two ways, both client-side via the `QRCode` lib:
   - **Fast path:** open the place card → **QR tab** (`QrTab`, `PlaceCard.jsx:2299`) → switch to **Guardian** type → it auto-fetches the secret and renders `https://lafayette-square.com/claim/<id>/<secret>`. Owner scans it off Jacob's screen.
   - **Printed path:** **QR Studio / Code Desk** (`CodeDeskModal.jsx`, opened from the QR tab, `PlaceCard.jsx:2477`) in **admin mode** → pick the business → Guardian type (auto-fetches secret) → style + **print** the card.
4. **Result:** Jacob is holding (or showing) a printable claim card. Owner scans → guardian.

> **On-the-spot answer:** Yes. As admin, Jacob can generate the secret and render the Guardian QR live from the card's QR tab — no pre-printing required to make the claim work (an on-screen scan suffices). Pre-print only for a polished hand-off or to post at the location.

### B.3 "Get others to sign on" — the spread loop (from a guardian)
- **Staff (keyholders):** a guardian adds staff by having them scan the *same* listing's claim QR (2nd+ claimant = keyholder), then sets per-field permissions in `StaffSection` (`PlaceCard.jsx:2156`, `GUARDIANS.md §4`). The keyholder also becomes a townie on claim (same `grantTownieStatus`).
- **Other businesses:** each needs its **own** listing + claim QR. There is **no referral affordance** — a guardian cannot mint a claim card for a *different* business; that's an admin action (gap, see below).
- **Gap-hunt result:** the only built spread mechanisms are (1) staff-claim on the same listing and (2) the townie check-in loop (Path C). There is **no invite/referral link** for "guardian recruits another business owner" — it routes back through Jacob/admin every time.

### B.4 Artifact checklist — Guardian
| Artifact | Who makes it | On-the-spot-able? |
|---|---|---|
| `claim_secret` (8-char hex) | `getClaimSecret`, guardian **or admin** | ✅ admin can pull for any listing |
| Guardian claim QR (card or on-screen) | QR tab (auto) or QR Studio (printable) | ✅ on-screen instantly; printable in QR Studio |
| Handle (to finish the flow) | The owner, at claim time | ⚠️ required, no suggestions today (Massage §a) |
| Avatar | The owner, skippable | ✅ optional |

---

## Path C — Townie (secondary, time-gated)

**Goal:** a neighbor earns verified-local status — which unlocks reviews, bulletin, comments, DMs (`TOWNIES.md §4`).

### C.1 The procedure
1. Scan a place's **check-in QR** (`/checkin/<id>`, `App.jsx:613`) → `postCheckin` logs a row (`Code.js:473`).
2. Set up **identity** (handle + emoji/vignette, `IDENTITY.md`) — required to *post*, not to check in.
3. Repeat across **3 distinct calendar days within a rolling 14-day window** (`LOCAL_THRESHOLD=3`, `LOCAL_WINDOW_DAYS=14`, `Code.js:29`) → townie, computed server-side from check-in history (`TOWNIES.md §1`).

### C.2 Hard reality — you cannot make a townie on the spot
Townie status is **time-gated** (3 days in 14). The honest in-person move tomorrow: get the visitor's **first check-in + identity**, and explain the path. *(The one exception is claim-grant — a guardian/keyholder is auto-backfilled to townie at claim, `Code.js:636` — but that's the Guardian path, not the organic townie path.)*

### C.3 Artifact + spread
- **Check-in QRs** encode only an id (no secret); the printed card *is* the trust. They should be **posted at places** so anyone can scan. Jacob can also show a check-in QR off his phone for an on-the-spot first scan.
- **Spread:** townies recruit by getting friends to check in. There is **no explicit invite mechanism**; device-link (`DEVICE-LINK.md`) is for one person's *own* devices, **not** referral.

---

## Massage & fortify (the analysis)

### a. Frictionless identity at claim time
**What the handle step demands today** (`ClaimPage.jsx:152` `HandleStep`, backend `postSetHandle` `Code.js:1149`):
- A handle matching `^[a-zA-Z0-9_]{3,20}$`, **unique** (case-insensitive, `check-handle` / `Code.js:1139`).
- The "Continue" button is disabled until the typed handle is *both* valid *and* confirmed available (`ClaimPage.jsx:221`).
- **It is mandatory and has no skip** — `needsHandle` blocks the success screen (`:71`). (Only the *avatar* step has "Skip for now," `:86`.)
- There is **no `starter_name`, no suggestions, no "surprise me."** A claimant with no handle idea faces a blank uniqueness-gated input — the one friction point in an otherwise instant claim.

**Backend reality:** `postSetHandle` accepts `{ device_hash, handle, avatar, vignette }` only — there is **no `starter_name` concept**, and `vignette` is validated `^v[0-7]$` (`Code.js:1162`). So nothing server-side needs to change for suggestions.

**Smallest change (client-only, proposed):**
1. In `HandleStep`, add a **suggestion row** of 3–5 tappable handle chips, auto-generated (e.g. adjective+noun+number, or seeded from an optional `starter_name` input), each pre-checked against `checkHandleAvailability` so every chip is known-available. Tap a chip → it fills the input and is instantly submittable.
2. Add a **"surprise me"** affordance that regenerates the suggestions.
3. Optional: a small `starter_name` text field ("what do people call you?") that seeds the suggestions — purely a client convenience; it is **not** persisted (the backend has no field for it).

This turns "I don't have a name yet" into a one-tap non-event with **zero backend change**. (Flag: the suggestion generator + the optional `starter_name` affordance **do not exist yet** — this is net-new client UX.)

### b. A guardian who wants to review *other* restaurants
**The model:** guardian status (of place X) and townie status are **independent** — reviewing place Y requires *townie* status, gated server-side in `postReview` (`Code.js:532` → `not_townie` if distinct check-in days < 3). `postReview` does **not** special-case guardians — it checks only the townie threshold.

**The crucial correction (verified in code):** the brief and the specs assume "a guardian does **not** get townie automatically." **That is wrong as-built.** `postClaim` calls `grantTownieStatus(device_hash)` (`Code.js:636`), which backfills synthetic check-ins (`Code.js:1766`) until the device meets the 3-in-14 threshold. **So a guardian (and any keyholder) is auto-granted townie status at claim** — and can immediately review *other* restaurants. The plain answer for the playbook: **yes, a guardian can review other places the moment they claim, because claiming makes them a townie too.** Nothing wrongly blocks it; if anything, the surprise is that it's *more* permissive than the specs state.

> ✅ **Resolved 2026-06-30 (was a spec-inaccuracy to-do).** The claim-grant path is now documented in all three sibling specs: [`GUARDIANS.md §2`](GUARDIANS.md) (the ⚠️ "Claiming also auto-grants townie status" callout), [`OPERATIONS.md §2`](OPERATIONS.md) (the Townie row notes "also auto-granted on claiming a listing or verifying a residence"), and [`TOWNIES.md §1`](TOWNIES.md) (the ⚠️ "two other actions auto-grant townie" callout). Only the original Massage-b *premise* in this doc understated it; the as-built behavior (`postClaim` → `grantTownieStatus`, `Code.js:636`) is correctly captured below and across the cluster.

### c. Business medallions + the structure they represent
There are **two distinct visual systems**, and they encode different things:

**1. Vignettes (`src/lib/vignettePresets.js`, `VignetteChooser.jsx`) — avatar *style*, not role.**
- 8 presets `v0–v7`, each a gradient/glow composition **derived from the chosen emoji's own 3-color palette** (`getVignetteStyle(emoji, presetId)`):
  - Coordinated: `v0` Decorator · `v1` Soft · `v2` Vivid · `v3` Bold.
  - Contrast: `v4` Complement · `v5` Cool · `v6` Warm · `v7` Midnight.
- They dress a **person's emoji avatar** (`AvatarCircle.jsx`). They are **cosmetic** — they carry **no role meaning** and there are **no business-specific vignettes**. A business's own identity on its card is its **logo** (or initials fallback), not a vignette.

**2. RoleBadge (`src/components/RoleBadge.jsx`) — the role *medallion* (the Gateway Arch silhouette).** This is the "structure" piece — it maps a medallion to a member-type:
| Medallion theme | Color | Represents | Where shown |
|---|---|---|---|
| `visitor` | glass / translucent | anonymous, no emoji set | `AvatarCircle` fallback (`:37`) |
| `resident` | burnt orange / brown | verified resident | review composer, lobby (`PlaceCard.jsx:2567`, `:2629`) |
| `guardian` | **teal / aquamarine** | claimed-business owner | on the card (`PlaceCard.jsx:1196`); post composer (`:2567`) |

- **The "business medallion" = the teal guardian Arch.** A claimed business's owner wears it; surface it in onboarding so a fresh guardian sees their teal Arch as proof of control.
- **Holes in the medallion structure:** there is **no dedicated medallion for `townie`, `keyholder`, or `admin`.** A keyholder is rendered via the guardian/resident branch (`PlaceCard.jsx:2567` is binary `isGuardian ? guardian : resident`), so a keyholder shows as a *resident* medallion when posting — a mismatch worth noting. Townies (the most common participant) have no badge at all beyond their emoji avatar.

### d. Rights & privileges matrix
See **[the matrix below](#rights--privileges-matrix)** — kept in this file (rather than a separate `RIGHTS.md`) so the whole onboarding prose is one surface for Jacob's gate.

---

## Rights & privileges matrix

Member-type × privileged action. **G** = the gate; cells cite the **server-side** enforcement (the security boundary; UI mirrors are advisory only, `GUARDIANS.md §1`, `OPERATIONS.md §3`).

Member-types: **Visitor** (anon device) · **Townie** (3-in-14) · **Resident** (verified building) · **Keyholder** (staff, per-field) · **Guardian** (claimed listing) · **Admin** (`?admin` + passphrase).

| Action | Visitor | Townie | Resident | Keyholder | Guardian | Admin | Server gate |
|---|:--:|:--:|:--:|:--:|:--:|:--:|---|
| Browse / search directory, read cards | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | none (public, `TOWNIES.md §4`) |
| Check in (scan check-in QR) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | none — logs a row (`postCheckin`, `Code.js:473`) |
| Set handle / avatar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | format+unique only (`postSetHandle`, `Code.js:1156`) |
| Post a **review** | ❌ | ✅ | ✅¹ | ✅² | ✅² | ✅² | `distinct_days≥3` (`postReview`, `Code.js:532`) |
| Post to **bulletin** | ❌ | ✅ | ✅¹ | ✅² | ✅² | ✅² | `isTownie` (`postBulletin`, `Code.js:1267`) |
| **Comment** on bulletin | ❌ | ✅ | ✅¹ | ✅² | ✅² | ✅² | `isTownie` (`postComment`, `Code.js:1354`) |
| Start a **DM thread** | ❌ | ✅ | ✅¹ | ✅² | ✅² | ✅² | `isTownie` (`postStartThread`, `Code.js:1401`) |
| Read/post in a building **Lobby** | ❌ | ❌ | ✅ | ❌³ | ❌³ | ✅ | verified resident of *that* building (`RESIDENTS.md`) |
| **Claim** a listing | ✅⁴ | ✅⁴ | ✅⁴ | — | — | ✅ | valid `claim_secret` (`postClaim`, `Code.js:614`) |
| **Edit card** (whitelisted fields) | ❌ | ❌ | ❌ | per-field⁵ | ✅ all | ✅ | guardian or staff + `STAFF_PERM_MAP` (`postUpdateListing`, `Code.js:665`/`704`) |
| Upload / remove **photo** | ❌ | ❌ | ❌ | if `photos` | ✅ | ✅ | `staffHasPermission(..,'photos')` (`Code.js:1959`/`2007`) |
| Post an **event** | ❌ | ❌ | ❌ | if `events` | ✅ | ✅ | `staffHasPermission(..,'events')` (`postEvent`, `Code.js:578`) |
| **Reply** to a review | ❌ | ❌ | ❌ | if `replies` | ✅ | ✅ | `staffHasPermission(..,'replies')` (`postReply`, `Code.js:552`) |
| Edit menu / hours | ❌ | ❌ | ❌ | if `menu`/`hours` | ✅ | ✅ | per-field `STAFF_PERM_MAP` (`Code.js:704`) |
| **Manage staff** (list/perms/promote/demote/revoke) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | `isFullGuardianOf` (`Code.js:898–1031`) |
| **Accept / remove** listing | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | `isFullGuardianOf` (`Code.js:724`/`751`) |
| **Fetch claim secret** | ❌ | ❌ | ❌ | ❌ | own listing | any listing | `isFullGuardianOf` or admin (`getClaimSecret`, `Code.js:792`) |
| Auto-verify a residence · auto-provision listing · setup photo folder | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | admin token (`OPERATIONS.md §1`) |

**Notes / footnotes:**
- ¹ A **Resident is auto-granted townie** at residence-verify (`grantTownieStatus`, `RESIDENTS.md`), so a resident clears every townie gate.
- ² A **Guardian and Keyholder are auto-granted townie at claim** (`grantTownieStatus`, `postClaim` `Code.js:636`) — so they can review/bulletin/comment/DM **immediately**, including on *other* places (Massage §b). *This is the corrected, as-built behavior; the specs understate it.*
- ³ Lobby access keys on **verified residence of that specific building**, independent of guardian/keyholder/townie status. A guardian is not a resident by virtue of claiming a business.
- ⁴ "Claim" is open to any device holding a valid secret; the *role granted* depends on order (1st = guardian, rest = keyholder, `Code.js:625`). Residential listings have **no** guardian claim (`PlaceCard.jsx:2418`).
- ⁵ Keyholder edit rights are exactly the granted subset of `menu · hours · photos · replies · events` (`STAFF_PERM_MAP`); fields outside the map are guardian-only (`Code.js:704`).

### Matrix holes / inconsistencies flagged (for Boz / Phase 2)
1. **Townie auto-grant on claim** (`Code.js:636`) — as-built, a guardian/keyholder becomes a townie immediately on claim. *(Confirmed in code; now documented in `GUARDIANS.md §2` / `OPERATIONS.md §2` / `TOWNIES.md §1` as of 2026-06-30 — the prior "undocumented" flag is resolved.)* Open question is design-intent (intended convenience vs. loophole to tighten), flagged for review in the onboarding arc.
2. **Keyholder has no distinct medallion** — renders as `resident` in the post composer (`PlaceCard.jsx:2567` binary `isGuardian ? guardian : resident`). Townie and admin also lack medallions (Massage §c).
3. **Admin powers ride a long-lived bearer token in the request body** (6-hour, `OPERATIONS.md §1`) — known security hotspot (`project_ls_security_arc`); not a tomorrow blocker but the most privileged path is the least hardened.
4. **No referral affordance for guardian→other-business** (B.3) — spread of new *businesses* is admin-only; only staff-claim and the townie check-in loop self-serve.
5. **Auto-provision category mismatch** — `getClaimSecretAdmin` stands up `residential/houses` (`Code.js:800`), unsuitable for a restaurant claim (A.2).

---

## Phase 2 — code-verification appendix

*Deferred. Awaits Jacob's approval of the prose above. Will produce a per-step pass/fail with file:line and a gap list, walking each numbered procedure (B.1, B.2, A.1–A.2, C.1) against the implementation.*

*New doc, 2026-06-29 (Logistician). Phase-1 prose. Sources: the `ls/*` diamond specs + targeted code reads (`Code.js`, `ClaimPage.jsx`, `useHandle.js`, `RoleBadge.jsx`, `vignettePresets.js`, `AvatarEditor.jsx`).*
