# LS — Whole-Picture Status Map

**Kind:** State (where-we-are). **Updated:** 2026-06-02 (from the forensic inventory campaign).
**Source of detail:** `scratch/ls-forensic-inventory.md` (1153-line section-by-section read). Boz folds that into `ls/FEATURES` (user voice), `ls/ARCHITECTURE` (build), and a future `ls/OPERATIONS` (operator); this map is the *index + state* across it.

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
| 6 | **Data / Backends / API** | 🟢 robust, sound (59 GAS endpoints) | One Google Sheet, 25+ server-gated privileged writes. Security: see below. |
| 7 | **Cary / Courier** | ⏸️ **ON HOLD** (not yet inventoried) | Supabase data layer noted in §6; UI internals deferred. |

**Verdict:** the production app is robust, well-architected, and (for the rendered neighborhood) slab-complete. No dead paths found in sections 1–6. The gaps that exist are completeness gaps (below), not broken features.

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
