# LS — Onboarding playbook (the field procedure)

The operator's manual for **signing people onto the platform in person** — and having each of them sign others on too. Organized around the **three trust roles** a neighbor can hold: **Guardian · Resident · Townie**. Built on the diamond reference specs: [`GUARDIANS.md`](GUARDIANS.md), [`RESIDENTS.md`](RESIDENTS.md), [`TOWNIES.md`](TOWNIES.md), [`PLACE-CARDS.md`](PLACE-CARDS.md), [`QR-CODES.md`](QR-CODES.md), [`IDENTITY.md`](IDENTITY.md), [`DEVICE-LINK.md`](DEVICE-LINK.md), [`OPERATIONS.md`](OPERATIONS.md). Those specs map the *mechanics* (file:line); this doc is the *procedure* + the referral-loop + rights analysis.

**Phase 1 (prose) — refocused 2026-06-30 to the trust-role trio (Guardian · Resident · Townie), against the working tree (`curb-offset-draw`). The code-verification appendix (Phase 2) awaits Jacob's approval of this prose.**

> **What Jacob wants this to prove:** *"sign people onto the platform — and have them able to sign others on too."* So every role below answers two questions: **(1)** the diamond-clear procedure to grant it, and **(2)** the referral loop — how that person gets the *next* one on.
>
> Scope note: this doc reframes the earlier "meeting-hinge" version (Place-card / Guardian / Townie) into the three trust roles. The **commercial Place card** is not a separate path here — it is **Guardian's substrate** (the thing being claimed), folded into §Guardian. **Resident** is now a first-class path (it was missing before) and is the **strongest single on-the-spot lever** — one scan grants residence *and* townie.

---

## ⭐ Onboarding-readiness verdict

| Role | On-the-spot? | Verdict | One-line |
|---|---|---|---|
| **Guardian** | ✅ instant | 🟡 | Claim is end-to-end wired; claimant becomes guardian **instantly**. Needs: a real `dining` card to claim (not the residential auto-provision stub), the claim QR/secret in hand, a current GAS deploy, and the handle-step friction accepted (§a). |
| **Resident** | ✅ instant | 🟡 → 🟢 with QR in hand | The **highest-value single scan**: the resident-invite QR auto-verifies residence on scan (`auto_verify=true`) **and** auto-grants townie. Needs: the **building's resident-invite QR** made/posted (no secret, just the building id — makeable on the spot), a current GAS deploy, handle-friction accepted, and the trust caveat honored (a scan = instant verified resident — hand/post it deliberately). |
| **Townie** | ⚠️ first-scan only | 🟡 | **Cannot be completed on the spot by check-ins** — it is time-gated (3 distinct days in 14). On the spot you capture their **first check-in + identity** and explain the path — *or* onboard them as a Resident (which auto-grants townie instantly). Needs: check-in QRs posted at places. |

### Blockers to clear before onboarding someone
1. **Guardian — stand up a real card first.** If the business is one of the ~18 dining listings, done. If not, **create a proper `dining` listing** (admin) — do *not* rely on `getClaimSecretAdmin` auto-provision, which stands up a `residential/houses` stub (`Code.js:800`) with the wrong category and an empty card.
2. **Guardian — have the claim QR/secret ready.** As admin, Jacob can pull it live from the card's **QR tab** (auto-fetches the secret) or the **QR Studio**; pre-print `/claim/<id>/<secret>` as a backstop. **No card/secret → no claim.**
3. **Resident — have the building's resident-invite QR ready.** Generate it in the **QR Studio** for the building id (Resident type, no secret needed). Posting it at the building lets any neighbor self-onboard. **Treat it as a trust token** — a scan instantly verifies residence + grants townie; the app copy warns *"please don't share it outside your building."*
4. **Townie — confirm check-in QRs are posted** at the places you'll send people to. On the spot, be ready to show one off a phone for a first scan.
5. **Backend (GAS) deploy is current** (`OPERATIONS.md §6` notes a possible pending redeploy). Claim, residence-verify, handle, and review writes all hit GAS; if it's stale or unreachable the gates can fail silently (`OPERATIONS.md §3`).
6. **Set the handle-friction expectation** for all three roles. The identity step today *requires* a unique handle with no suggestions/skip — the one rough moment in otherwise-instant flows. Massage §a proposes the fix.

---

## Role 1 — Guardian (a business owner claims + controls a place card)

**Goal:** the owner claims his business and becomes its guardian **instantly**, then edits the card and adds staff. Grant type: **instant**.

### G.0 The substrate — the Place card being claimed
A Guardian claims a card, so a working card must exist first.
- The place exists as a listing (`category: 'dining'`) → it shows in the **Society Pages** directory (`SidePanel.jsx`, `lafayettepages` tab) and opens a full **place card** (`PlaceCard.jsx`): Overview · Reviews · Photos · Ticker · **Menu** · etc. — tabs appear only when content exists (`PLACE-CARDS.md §1`). Browsing the directory is **public**, no gate (`TOWNIES.md §4`).
- **Brand-new place not yet listed:** admin creates the listing first. The on-the-fly `getClaimSecretAdmin` path *will* auto-provision a row, but as `residential/houses` (`QR-CODES.md §2`, `Code.js:800`) — wrong for a restaurant and with no card body. So **create a proper `dining` listing** (name, address, category/subcategory, ideally logo + a few fields) so the owner's first look isn't a dead shell.
- Curated menus live in `src/data/menus.json` and **override** GAS for 10 listings (`PLACE-CARDS.md §3`); everything else a guardian authors writes to GAS via `update-listing`.
- Delivery (a `menu` `schedule` window + `delivery` tag + a live courier) is only relevant if the meeting is about orders, and end-to-end ordering is a "coming soon" placeholder (`PLACE-CARDS.md §3`, `CaryButton`). **Do not promise live delivery.**

### G.1 The claim procedure
1. **Jacob presents the Guardian claim QR** (encodes `/claim/<listingId>/<secret>`, `QR-CODES.md §1`). The 8-char hex `claim_secret` *is* the credential — possession proves presence (`GUARDIANS.md §2`).
2. **Owner scans** → `ClaimPage.jsx` fires `claim(listingId, secret)` → `postClaim` (`Code.js:601`) validates the secret (`:614`).
3. **First claimant = guardian** (full perms: `menu,events,replies,photos,hours`); any subsequent claimant on the same listing = **keyholder** (`Code.js:625–633`).
4. **Identity gate** — before the success screen, the flow requires a **handle** (mandatory, `ClaimPage.jsx:71` `needsHandle` blocks everything) then offers an **avatar** (skippable, `:74–96`). See Massage §a.
5. **Instant townie bonus** — `postClaim` calls `grantTownieStatus` (`Code.js:636`), backfilling synthetic check-ins so the new guardian is **immediately a townie too** (Massage §b). The success screen reads "You're a recognized local in the neighborhood" (`ClaimPage.jsx:136`).
6. **Done** — the guardian opens the place on the map and edits inline; all writes re-verify server-side (`GUARDIANS.md §5`).

### G.2 The #1 artifact — "I have a business name" → "I'm holding a claim card"
The claim cannot happen without the secret-bearing QR. The trace:
1. **Listing exists** (G.0) with an `id`.
2. **Fetch the claim secret** — `getClaimSecret` (`Code.js:792`) generates an 8-char hex lazily (`Utilities.getUuid().split('-')[0]`) and persists it to the `claim_secret` column. **Who may fetch:** a full guardian of the listing **or an admin** (`getClaimSecretAdmin`). Jacob is admin → he can pull it for any listing (`QR-CODES.md §2`).
3. **Render the QR** — two ways, both client-side via the `QRCode` lib:
   - **Fast path:** open the place card → **QR tab** (`QrTab`, `PlaceCard.jsx:2299`) → switch to **Guardian** type → it auto-fetches the secret and renders `https://lafayette-square.com/claim/<id>/<secret>`. Owner scans off Jacob's screen.
   - **Printed path:** **QR Studio / Code Desk** (`CodeDeskModal.jsx`, opened from the QR tab, `PlaceCard.jsx:2477`) in **admin mode** → pick the business → Guardian type (auto-fetches secret) → style + **print**.
4. **Result:** Jacob is holding (or showing) a printable claim card. Owner scans → guardian.

> **On-the-spot answer:** Yes. As admin, Jacob can generate the secret and render the Guardian QR live from the card's QR tab — no pre-printing required (an on-screen scan suffices). Pre-print only for a polished hand-off or to post at the location.

### G.3 Referral loop — how a guardian gets others on
- **Staff (keyholders):** a guardian adds staff by having them scan the *same* listing's claim QR (2nd+ claimant = keyholder), then sets per-field permissions in `StaffSection` (`PlaceCard.jsx:2156`, `GUARDIANS.md §4`). The keyholder also becomes a townie on claim (same `grantTownieStatus`).
- **Other businesses:** each needs its **own** listing + claim QR. There is **no referral affordance** — a guardian cannot mint a claim card for a *different* business; that is an admin action.
- **Gap-hunt result:** the only self-serve spread from a guardian is staff-claim on the same listing. Recruiting *another business* routes back through Jacob/admin every time (gap G-R, below).

### G.4 Artifact checklist — Guardian
| Artifact | Who makes it | On-the-spot-able? |
|---|---|---|
| The listing row (id, name, address, `dining` category) | Admin (Jacob) — Sheet or admin tooling | ✅ yes, but pre-create for a clean first impression |
| Card content (logo, photos, hours, description, menu) | Guardian after claim, *or* Jacob pre-seeds | ✅ guardian edits inline post-claim |
| `claim_secret` (8-char hex) | `getClaimSecret`, guardian **or admin** | ✅ admin can pull for any listing |
| Guardian claim QR (card or on-screen) | QR tab (auto) or QR Studio (printable) | ✅ on-screen instantly; printable in QR Studio |
| Handle (to finish the flow) | The owner, at claim time | ⚠️ required, no suggestions today (§a) |
| Curated menu (one of the 10) | Bundled `src/data/menus.json` | ❌ ship-time only (overrides GAS) |

---

## Role 2 — Resident (a neighbor is verified as living in a building) — the highest-value scan

**Goal:** a neighbor is verified as living in a specific building → unlocks that building's private **Lobby** for **one year** — *and* is auto-granted **townie** in the same motion. Grant type: **instant-capable** (via the QR-invite path).

### R.1 The verify procedure (on-the-spot / QR-invite path)
1. **Neighbor scans the building's resident-invite QR** (encodes `/checkin/<buildingId>` — the same route as a check-in QR; `CheckinPage.jsx` branches on residential, `:181`, `QR-CODES.md §1`).
2. `CheckinPage` detects a residential target (`landmark.category === 'residential'` or a bare building id) → calls `claimResidence(dh, buildingId, true)` with **`auto_verify` on** (`:197`).
3. **Backend `postClaimResidence`** (`Code.js:1680`) sees `auto_verify=true` → sets `status = verified`, `verified_by = qr-invite`, `expires_at = now + 1 year` (`Code.js:1750`) — **verified on scan** (`RESIDENTS.md §2`).
4. **Identity gate** — as with every role, posting in the Lobby needs a **handle** (§a).
5. **Instant townie bonus** — verifying a residence calls `grantTownieStatus` (`Code.js:1766`), so the neighbor is **immediately a townie too** — reviews/bulletin/comments/DMs all unlock in the same scan (`RESIDENTS.md §1`, `TOWNIES.md §1`).
6. **Done** — the building's **Lobby** tab appears on its place card (`LobbyTab`, `PlaceCard.jsx:2492`; gated `isResidentHere`, `:3635`): a residents-only board (text + photos, posts anonymous), a co-resident view, and the verified-resident count. Access is re-checked **server-side** on every lobby read/write (`RESIDENTS.md §5`) — the tab is convenience, the server is the boundary.

### R.2 The four verify paths (know which one fires)
| Path | `verified_by` | How it qualifies | On-the-spot? |
|---|---|---|---|
| **QR invite** | `qr-invite` | The claim carries `auto_verify=true` (the resident-QR flow, `CheckinPage:197`) | ✅ **instant on scan** — the on-the-spot lever |
| **Admin** | `admin` | Caller holds the admin token | ✅ Jacob can verify directly |
| **Linked device** | `linked-device` | Another device sharing the caller's `@handle` is already verified for this building (`Code.js:1731–1744`) | ✅ if they've linked a device (`DEVICE-LINK.md`) |
| **Co-resident** | (verified) | A pending claim is later approved by an already-verified resident (`postVerifyResident`, `Code.js:1798`) | ⏳ later — this is the *referral* loop (R.3) |

If none qualify, the claim is stored **`pending`** until a co-resident or admin verifies it.

### R.3 Referral loop — how a resident gets others on (the built-in spread)
- **Co-resident verify** is the designed spread mechanism: an already-verified resident **approves a neighbor's pending claim** (`postVerifyResident`, `Code.js:1798`), surfaced via the Lobby's **co-resident view** (`RESIDENTS.md §4`). So one verified resident can bring the rest of their building on — no admin round-trip.
- **Resident-invite QR** is the other spread: a verified neighbor can hand/post the building's resident QR (auto_verify) so others self-onboard on scan.
- This is the **richest referral loop of the three** — a single seeded resident can verify a whole building, and each new resident is also a new townie.

### R.4 The trust caveat (state plainly)
The resident QR carries **no secret** — it encodes only the building id, and scanning it **auto-verifies residence instantly** (and grants townie). The printed card *is* the trust anchor; the app copy warns *"a gesture of trust between neighbors, please don't share it outside your building"* (`CheckinPage.jsx:286`). Same model as the claim secret (physical possession = trust), but with a lower bar (no per-listing secret) — so hand/post it deliberately. *(Flagged in §d holes as a security note, not an on-the-spot blocker.)*

### R.5 Artifact checklist — Resident
| Artifact | Who makes it | On-the-spot-able? |
|---|---|---|
| The building as a known target (residential landmark or building id) | Exists in the map data | ✅ resolves by id |
| Resident-invite QR (`/checkin/<buildingId>`) | QR Studio, **Resident** type — no secret needed | ✅ generate for any building id |
| Handle (to post in the Lobby) | The neighbor, at first post | ⚠️ required to post, no suggestions today (§a) |
| Linked device (optional, for the linked-device path) | `LinkPage.jsx`, 6-char token 5-min TTL | ✅ if they link a second device |

---

## Role 3 — Townie (a neighbor earns verified-local status) — earned or auto

**Goal:** verified-local status, which unlocks *participating* — reviews, bulletin, comments, DMs (`TOWNIES.md §4`). Grant type: **earned** (time-gated) **or auto** (granted by claim or residence-verify).

### T.1 The earned procedure
1. Scan a place's **check-in QR** (`/checkin/<id>`, `App.jsx:613`) → `postCheckin` logs a row (`Code.js:473`).
2. Set up **identity** (handle + emoji/vignette, `IDENTITY.md`) — required to *post*, not to check in.
3. Repeat across **3 distinct calendar days within a rolling 14-day window** (`LOCAL_THRESHOLD=3`, `LOCAL_WINDOW_DAYS=14`, `Code.js:29`) → townie, computed server-side from check-in history (`TOWNIES.md §1`). The page shows "You're a verified local! Society Pages unlocked." at the threshold (`CheckinPage.jsx:343`).

### T.2 The auto procedure (state both routes)
Townie is **also auto-granted** — no real check-ins — by two other actions, via `grantTownieStatus` (backfills synthetic check-ins):
- **Claiming a listing** (Guardian/keyholder, `postClaim` → `Code.js:636`).
- **Verifying a residence** (Resident, `Code.js:1766`).

So the fastest way to make someone a townie on the spot is **not** the check-in ladder — it's **onboard them as a Resident** (if they live here) or as a **Guardian/keyholder** (if they run/staff a place).

### T.3 Honest framing — you cannot make an *earned* townie on the spot
The earned path is **time-gated** (3 days in 14). The honest in-person move: capture the visitor's **first check-in + identity** and explain the path — logical and repeatable, but not instant. Reach for the Resident or Guardian auto-grant if it applies.

### T.4 Referral loop — how a townie gets others on
- **Check-in QRs are everywhere** (posted at places) — townies recruit by getting friends to check in. There is **no explicit invite mechanism**; device-link (`DEVICE-LINK.md`) carries one person's *own* identity to another device, **not** referral.
- **Gap-hunt result:** the townie loop is the weakest of the three — organic and unincentivized. (Gap T-R, below.)

### T.5 Artifact checklist — Townie
| Artifact | Who makes it | On-the-spot-able? |
|---|---|---|
| Check-in QR (`/checkin/<id>`, no secret) | QR Studio, **Townie** type; posted at places | ✅ show off a phone for a first scan |
| Handle (to post once townie) | The visitor | ⚠️ required to post, no suggestions today (§a) |

---

## Massage & fortify (the analysis)

### a. Frictionless identity at sign-on — don't put people on the spot
This applies to **all three roles** at their identity step (Guardian at claim, Resident/Townie at first post).

**What the handle step demands today** (`ClaimPage.jsx:152` `HandleStep`, backend `postSetHandle` `Code.js:1149`):
- A handle matching `^[a-zA-Z0-9_]{3,20}$`, **unique** (case-insensitive, `check-handle` / `Code.js:1139`).
- "Continue" is disabled until the typed handle is *both* valid *and* confirmed available (`ClaimPage.jsx:221`).
- **It is mandatory and has no skip** — `needsHandle` blocks the success screen (`:71`). (Only the *avatar* step has "Skip for now," `:86`.)
- There is **no `starter_name`, no suggestions, no "surprise me."** A person with no handle idea faces a blank uniqueness-gated input — the one friction point in otherwise-instant flows.

**Backend reality:** `postSetHandle` accepts `{ device_hash, handle, avatar, vignette }` only — there is **no `starter_name` concept**, and `vignette` is validated `^v[0-7]$` (`Code.js:1162`). So nothing server-side needs to change for suggestions.

**Smallest change (client-only, proposed):**
1. In `HandleStep`, add a **suggestion row** of 3–5 tappable handle chips, auto-generated (adjective+noun+number, or seeded from an optional `starter_name` input), each pre-checked against `checkHandleAvailability` so every chip is known-available. Tap a chip → it fills the input and is instantly submittable.
2. Add a **"surprise me"** affordance that regenerates the suggestions.
3. Optional: a small `starter_name` field ("what do people call you?") that seeds suggestions — a client convenience, **not** persisted (no backend field).

This turns "I don't have a name yet" into a one-tap non-event with **zero backend change**. (Flag: the suggestion generator + optional `starter_name` affordance **do not exist yet** — net-new client UX.)

### b. Role independence + the cross-product (fortify the model)
The three roles are **independent** in principle, but two of them **auto-confer townie**. State the full cross-product plainly:

| Holds… | Automatically also… | Mechanism |
|---|---|---|
| **Guardian / keyholder** (claimed a listing) | **Townie** ✅ | `postClaim` → `grantTownieStatus` (`Code.js:636`) |
| **Resident** (verified residence) | **Townie** ✅ | `postClaimResidence` → `grantTownieStatus` (`Code.js:1766`) |
| **Guardian** of place X | **Townie for reviewing place Y?** ✅ (because claim auto-granted townie) | `postReview` is a pure townie gate (`Code.js:532`); it does **not** special-case guardians |
| **Guardian** of place X | **Resident?** ❌ | Lobby keys on *verified residence of that building* only (`RESIDENTS.md §5`); claiming a business is not residence |
| **Townie** | **Guardian / Resident?** ❌ | Those require a claim secret / residence verify respectively |

**The crucial correction (verified in code):** the brief and specs once assumed "a guardian does **not** get townie automatically." **That is wrong as-built.** Because `postClaim` calls `grantTownieStatus`, **a guardian (and any keyholder) can review *other* places the moment they claim.** Nothing wrongly blocks it — if anything it's *more* permissive than the specs originally implied. Same for a resident (residence-verify → townie).

> ✅ **Resolved 2026-06-30 (was a spec-inaccuracy to-do).** The auto-grant is now documented across the cluster: [`GUARDIANS.md §2`](GUARDIANS.md) (the ⚠️ callout), [`RESIDENTS.md §1`](RESIDENTS.md), [`TOWNIES.md §1`](TOWNIES.md) (the ⚠️ "two other actions auto-grant townie" callout), and [`OPERATIONS.md §2`](OPERATIONS.md). Open question is **design-intent** (intended convenience vs. loophole to tighten), flagged for the onboarding arc.

### c. Business medallions + the structure they represent
There are **two distinct visual systems**, encoding different things:

**1. Vignettes (`src/lib/vignettePresets.js`, `VignetteChooser.jsx`) — avatar *style*, not role.**
- 8 presets `v0–v7`, each a gradient/glow **derived from the chosen emoji's own 3-color palette** (`getVignetteStyle(emoji, presetId)`):
  - Coordinated: `v0` Decorator · `v1` Soft · `v2` Vivid · `v3` Bold.
  - Contrast: `v4` Complement · `v5` Cool · `v6` Warm · `v7` Midnight.
- They dress a **person's emoji avatar** (`AvatarCircle.jsx`). They are **cosmetic** — no role meaning, and **no business-specific vignettes**. A business's identity on its card is its **logo** (or initials fallback), not a vignette.

**2. RoleBadge (`src/components/RoleBadge.jsx`) — the role *medallion* (the Gateway Arch silhouette).** This is the "structure" piece — a medallion per member-type:
| Medallion theme | Color | Represents | Where shown |
|---|---|---|---|
| `visitor` | glass / translucent | anonymous, no emoji set | `AvatarCircle` fallback (`:37`) |
| `resident` | burnt orange / brown | verified resident | review composer, lobby (`PlaceCard.jsx:2567`, `:2629`) |
| `guardian` | **teal / aquamarine** | claimed-business owner | on the card (`PlaceCard.jsx:1196`); post composer (`:2567`) |

- **The "business medallion" = the teal guardian Arch.** A claimed business's owner wears it; surface it in onboarding so a fresh guardian sees their teal Arch as proof of control. A verified resident wears the burnt-orange Arch — surface that too, at Lobby unlock.
- **Holes in the medallion structure:** there is **no dedicated medallion for `townie`, `keyholder`, or `admin`.** A keyholder is rendered via the guardian/resident branch (`PlaceCard.jsx:2567` is binary `isGuardian ? guardian : resident`), so a keyholder shows as a *resident* medallion when posting — a mismatch. Townies (the most common participant) have no badge beyond their emoji avatar.

### d. Rights & privileges matrix
See **[the matrix below](#rights--privileges-matrix)** — kept in this file (rather than a separate `RIGHTS.md`) so the whole onboarding prose is one surface for Jacob's gate.

---

## Rights & privileges matrix

Member-type × privileged action. Each cell cites the **server-side** enforcement (the security boundary; UI mirrors are advisory only, `GUARDIANS.md §1`, `OPERATIONS.md §3`).

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
| Read/post in a building **Lobby** | ❌ | ❌ | ✅ | ❌³ | ❌³ | ✅ | verified resident of *that* building (`getLobbyPosts`/`postLobbyPost`, `RESIDENTS.md §5`) |
| **Verify** a co-resident's pending claim | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | verified resident of the building (`postVerifyResident`, `Code.js:1798`) |
| **Claim** a listing | ✅⁴ | ✅⁴ | ✅⁴ | — | — | ✅ | valid `claim_secret` (`postClaim`, `Code.js:614`) |
| **Claim** a residence | ✅⁶ | ✅⁶ | ✅⁶ | ✅⁶ | ✅⁶ | ✅ | auto-verify path / co-resident / admin (`postClaimResidence`, `Code.js:1680`) |
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
- ¹ A **Resident is auto-granted townie** at residence-verify (`grantTownieStatus`, `Code.js:1766`), so a resident clears every townie gate.
- ² A **Guardian and Keyholder are auto-granted townie at claim** (`grantTownieStatus`, `postClaim` `Code.js:636`) — so they can review/bulletin/comment/DM **immediately**, including on *other* places (§b). *This is the corrected, as-built behavior; the specs once understated it.*
- ³ Lobby access keys on **verified residence of that specific building**, independent of guardian/keyholder/townie status. A guardian is not a resident by virtue of claiming a business.
- ⁴ "Claim a listing" is open to any device holding a valid secret; the *role granted* depends on order (1st = guardian, rest = keyholder, `Code.js:625`). Residential listings have **no** guardian claim (`PlaceCard.jsx:2418`).
- ⁵ Keyholder edit rights are exactly the granted subset of `menu · hours · photos · replies · events` (`STAFF_PERM_MAP`); fields outside the map are guardian-only (`Code.js:704`).
- ⁶ "Claim a residence" is open to any device; whether it lands **verified** vs **pending** depends on the four paths (R.2). The QR-invite path (`auto_verify=true`) verifies on scan; otherwise it waits for a co-resident/admin.

### Matrix holes / inconsistencies flagged (for Boz / Phase 2)
1. **Townie auto-grant on claim & residence** (`Code.js:636` / `:1766`) — as-built, claiming a listing *or* verifying residence makes you a townie immediately. *(Documented across the cluster as of 2026-06-30.)* Open question is design-intent (intended convenience vs. loophole to tighten).
2. **Resident QR has no secret** (R.4) — a scan of `/checkin/<buildingId>` auto-verifies residence + grants townie with no per-building secret; the physical card is the only trust anchor. Lower bar than the claim secret; flagged as a security note (by-design, but the most permissive on-the-spot grant).
3. **Keyholder has no distinct medallion** — renders as `resident` in the post composer (`PlaceCard.jsx:2567` binary `isGuardian ? guardian : resident`). Townie and admin also lack medallions (§c).
4. **No referral affordance for guardian→other-business** (Gap G-R) — spread of new *businesses* is admin-only; only staff-claim self-serves.
5. **No explicit townie invite** (Gap T-R) — the townie loop is organic check-ins only; device-link is own-devices, not referral.
6. **Auto-provision category mismatch** — `getClaimSecretAdmin` stands up `residential/houses` (`Code.js:800`), unsuitable for a restaurant claim (G.0).
7. **Admin powers ride a long-lived bearer token in the request body** (6-hour, `OPERATIONS.md §1`) — known security hotspot (`project_ls_security_arc`); not an onboarding blocker but the most privileged path is the least hardened.

---

## Phase 2 — code-verification appendix

*Deferred. Awaits Jacob's approval of the prose above. Will produce a per-step pass/fail with file:line and a gap list, walking each numbered procedure (G.0–G.2, R.1–R.2, T.1–T.2) against the implementation — plus verifying the auto-townie grants (§b) actually fire and the medallions light up.*

*Refocused 2026-06-30 to the trust-role trio (Guardian · Resident · Townie); supersedes the 2026-06-29 meeting-hinge draft (git keeps it). Phase-1 prose. Sources: the `ls/*` diamond specs + targeted code reads (`Code.js`, `ClaimPage.jsx`, `CheckinPage.jsx`, `useHandle.js`, `RoleBadge.jsx`, `vignettePresets.js`, `AvatarEditor.jsx`).*
