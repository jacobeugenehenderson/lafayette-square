# LS — Whole-Picture Status Map

> ⚠️ **PARTIALLY STALE, AND DELIBERATELY SO — BLOCKED ON THE EXTENT MIGRATION** (Jacob, 2026-08-06; `ROADMAP` header). Refreshed 2026-06-30 for slab-merge + spec cluster; body still 2026-06-02-era. ⛔ **Do not tidy this into a settled state and do not quote the body as current** — it closes when the migration does. The slab-merge has **shipped** (buildings render off the slab via `SlabBuildings`, L1.3 2026-05-26); the 2026-06-29 **spec cluster** ([`PLACE-CARDS`](PLACE-CARDS.md)/[`GUARDIANS`](GUARDIANS.md)/[`RESIDENTS`](RESIDENTS.md)/[`TOWNIES`](TOWNIES.md)/[`QR-CODES`](QR-CODES.md)/[`BULLETIN`](BULLETIN.md)) and [`CARY.md`](CARY.md) now exist as the deep specs. Live architecture home = [`ARCHITECTURE.md §2`](ARCHITECTURE.md). The campaign narrative below is kept as the where-we-stand index; row-level state updated 2026-06-30.

**Kind:** State (where-we-are). **Updated:** 2026-06-30 (slab-merge + spec-cluster refresh; prior: 2026-06-02 forensic inventory campaign).
**Source of detail:** `scratch/ls-forensic-inventory.md` (1153-line section-by-section read), now folded into the LS docs: `ls/FEATURES` (user voice), `ls/ARCHITECTURE` (build), `ls/OPERATIONS` (operator), and the 2026-06-29 spec cluster (`PLACE-CARDS`/`GUARDIANS`/`RESIDENTS`/`TOWNIES`/`QR-CODES`/`BULLETIN`/`CARY`). This map is the *index + state* across them.

> Jacob's framing: LS is **"robust but barely documented."** This campaign confirms the first half (robust across every section read) and begins the second (this is the documentation).

---

## The app, section by section (the "3-ring binder")

| # | Section | State | Headline |
|---|---------|-------|----------|
| 1 | **Runtime / Scene** | 🟢 robust (18 robust / 4 partial / 1 stub of 24) | Slab-complete; consumers follow one pattern. No dead code. |
| 2 | **Places / Listings / Search** | 🟢 robust (15 / 2 partial) | Static bundle + GAS API-shadow; synthetic listings for bare buildings. |
| 3 | **Accounts / Roles / Identity** | 🟢 robust (8 / 3 partial) | Anonymous device-hash → townie → guardian/keyholder → admin. |
| 4 | **Events / Bulletins / Community** | 🟢 robust (4 robust / 2 partial of 7) | EventTicker aggregator; bulletin board (posts→comments→DM threads). |
| 5 | **Time / Atmosphere / Environment** | 🟢 robust (12 / 2 partial) | Live wall-clock vs scrub duality; meteorologist 3-layer consumer contract. |
| 6 | **Data / Backends / API** | 🟢 robust, sound (**~54 GAS actions / 57 routes**) | One Google Sheet, 25+ server-gated privileged writes. Security: see below. (Count reconciled 2026-06-30 against `Code.js` — 24 GET + 33 POST cases, 3 dual-verb; the old "59" was an overcount. Full catalog: `reference/INVENTORY-API.md`.) |
| 7 | **Cary / Courier** | 🟢 **inventoried** (app-integration view) | Courier side live (onboarding, dashboard, dots, OTP); requester side "coming soon". Full app-integration spec now exists: [`CARY.md`](CARY.md); program/legal/schema = `CARY-BRIEF.md` + `cary/`. (Was "ON HOLD" — superseded 2026-06-29.) |

**Verdict:** the production app is robust, well-architected, and (for the rendered neighborhood) slab-complete (**buildings now render off the slab — `SlabBuildings`, L1.3 shipped 2026-05-26**). No dead paths found in sections 1–7. The gaps that exist are completeness gaps (below), not broken features.

**The 2026-06-29 spec cluster** (the deep per-surface specs that fold this map's sections out): [`PLACE-CARDS.md`](PLACE-CARDS.md) (the Society Pages + card model) · [`GUARDIANS.md`](GUARDIANS.md) · [`RESIDENTS.md`](RESIDENTS.md) · [`TOWNIES.md`](TOWNIES.md) · [`QR-CODES.md`](QR-CODES.md) · [`BULLETIN.md`](BULLETIN.md) · [`CARY.md`](CARY.md) · [`ONBOARDING.md`](ONBOARDING.md) (the field procedure — **Phase 1 prose + Phase 2 code-verify complete 2026-06-30**) · [`IDENTITY.md`](IDENTITY.md) · [`DEVICE-LINK.md`](DEVICE-LINK.md).

> **Landed 2026-06-30 (onboarding arc, `curb-offset-draw`):** the trust-role trio playbook + rights matrix ([`ONBOARDING.md`](ONBOARDING.md)); and three code changes ride the next deploy — **co-resident verify now grants townie** (`Code.js:1830`, all four residence paths reach townie), **`postClaim` rejects a listing with no secret set** (`Code.js:616`), and **business-voice replies** (a review reply renders as the business, not the staffer — `PlaceCard.jsx`). Backlogged: generic business place-card templates · admin-bestowed "honorary townie".

---

## Security — read directly from `Code.js` (§6)

The backend is **sound**: all 25+ privileged-write endpoints re-verify `device_hash` against the Guardians/Residents sheet **before** mutating. Section 3's "client-only gate" worry is **refuted** — the PlaceCard role-tabs are UI only; the server gates the writes. What remains is a **narrowed, post-doc-formalization arc** (`project_ls_security_arc`, per Jacob 2026-06-02):

- 🔴 **Admin token** (ship-blocker) — passphrase → 6h UUID in `localStorage`, passed in the body, no per-action re-validation. Fix: signed/ephemeral JWT or per-action re-verify.
- 🔴 **No rate-limiting** — unlimited POSTs after the townie gate. Fix: per-device throttle.
- 🟡 **Device-hash forgeable** — privileged writes protected (QR presence + sheet lookup); regular posts impersonable. Anonymous by design.
- 🟡 **No audit log** — Sheet mutations unversioned.

---

## Completeness gaps (small, known)

- Milky Way mount is **disabled** (`CelestialBodies.jsx` ~1194, "hidden 2026-05-02") — **KEEP → re-enable** (Jacob), one-line uncomment, *not* cruft.
- `HERO_CENTER`/`HERO_TARGET` — vestigial fallback, **removable** at cleanup (hero framing is slab-authored now).
- `EventForm` guest-list field — **unwired** (UI absent). Low priority.
- **No event-delete / review-edit / review-delete** UI — guardian edits via Sheet. Low.
- `useCommunityStats` / `useResidence` — partial (stale-until-reload; claim logic lives in PlaceCard, should migrate to the hook).
- Places are **decoupled from the slab** (categories/icons hardcoded in tokens) — blocks the future "place-as-slab-layer" vision; productization item, not a bug.

---

## Where this sits on the road to LS-live

LS is the **reference consumer** of the cartograph factory. Two halves move in parallel:

1. **The app (this map):** robust ✓. Remaining: fold this inventory into `ls/FEATURES`/`ARCHITECTURE`/`OPERATIONS` → the security arc (admin-token ship-blocker) → REDEPLOY (the render-conformance arc left a pending redeploy) → optionally inventory Cary (§7, on hold) + close the completeness gaps.
2. **The factory (cartograph):** the tile re-pour — T3 authoring → T4 delete figure-ground → boundary-trio → slab-content → rebake. LS consumes whatever slab the factory bakes; the two meet at the slab contract (which §1/§6 confirm LS reads cleanly).

**Next Boz step:** fold §§1–6 into the `ls/` Reference docs; Cary stays on hold; the security arc waits on doc-formalization.
