# Handoff — Onboarding: the trust-role trio (Townie · Guardian · Resident)

> **Status: DISPATCH-READY (Boz; refocused 2026-06-30 to the trust-role trio per Jacob's direction — supersedes the earlier "tomorrow trio" [Place-card/Guardian/Townie] meeting framing; git keeps that version).** Jacob's goal: **"sign people onto the platform — and have them able to sign others on too,"** provable for the three trust roles a neighbor can hold.

## Agent: FRESH — name yourself
**Name yourself** (one word, joins the name-trail). Self-contained arc on a freshly-documented system — the diamond reference specs already exist (see First reads); your job is to turn them into a **field procedure** and then **verify the wiring**, not to re-derive the system. **Runs in parallel to the render-pipeline arc — you touch NO render files (`Scene.jsx`/`PostProcessing.jsx`/`PreviewApp.jsx`), so no collision.**

---

## The mission

Audit + playbook the three onboarding paths to **diamond clarity** — logical, repeatable, and provably backed by what the platform actually generates and provides. The three trust roles:

1. **Guardian** — a business owner claims + controls a place card. **Instant** (printed claim QR). *(The commercial Place card is the thing being claimed — so "does a working card exist for this place?" is in-scope as Guardian's substrate, not a separate path.)*
2. **Resident** — a neighbor is verified as living in a building → unlocks the private Lobby (1 year). **Instant-capable** (QR-invite `auto_verify` / co-resident / admin) **and verifying residence auto-grants Townie** (`grantTownieStatus`, `RESIDENTS.md §2`). The strongest on-the-spot onboarding lever.
3. **Townie** — a neighbor earns verified-local status (reviews/bulletin/DMs). **Earned** (3 check-ins in 14 days) **or auto** (granted by resident-verify). Honest framing required: the *earned* path can't be made instant.

**The through-line Jacob cares about (the referral loop):** each role must not only be grantable, but let that person **get others on too.** Guardian → keyholders + refers other businesses; Resident → co-resident verify (a verified resident approves a neighbor's pending claim — a real built-in spread mechanism, `postVerifyResident`, `RESIDENTS.md §2`); Townie → check-in QRs are everywhere. Audit each loop; gap-hunt the missing ones.

## Method — Jacob's three steps, run in TWO phases

**Phase 1 — PROSE (do first; HARD GATE on Jacob's eye before Phase 2):**
1. For each role, write the **diamond-clear onboarding procedure** — exact, repeatable, numbered steps. No hand-waving, no "and then it works."
2. Confirm we **generate and provide everything necessary** for (a) a person to sign on, and (b) that person to get **others** on (the referral loop). An **artifact + capability audit**: what physical/digital thing must exist, who makes it, whether it's makeable on the spot.

→ **STOP and surface the prose to Jacob.** He perfects it. **Do not touch code-verification until the prose is approved** — his words: *"Once we have the prose perfect, I want to analyze the code."*

**Phase 2 — CODE-VERIFY (only after Jacob approves the prose):**
3. Walk the code and confirm the implementation does **exactly** what the diamond prose says — step by step. Produce a **per-step pass/fail with file:line evidence**, plus a **gap list**: anything the prose promises the code doesn't deliver, and anything Jacob must do (print a card, provision a listing, run an admin action) to onboard someone.

## First reads (hard gate — `CLAUDE.md`; don't re-derive)

The diamond specs already exist — **build on them, to the section:**
- `ls/GUARDIANS.md` (claim + staff perms) · `ls/RESIDENTS.md` (residence + the 4 verify paths + Lobby + the auto-townie grant) · `ls/TOWNIES.md` (the 3-in-14 check-in ladder) · `ls/IDENTITY.md` (device-hash · handle · avatar) · `ls/QR-CODES.md` (the 4 QR types — claim / check-in / resident-invite / device-link — + the Code Desk studio) · `ls/OPERATIONS.md` (admin/roles table) · `ls/PLACE-CARDS.md` (the card a Guardian claims).
- Routing gate: `ORIENTATION.md` → `README.md §⭐ START HERE`.

## What "diamond clarity" must resolve, per role

**A. Guardian (claim + control) — instant**
- Procedure: Jacob presents the **printed Guardian claim QR** (`/claim/<listingId>/<secret>`) → owner scans → becomes guardian → edits the card inline (`GUARDIANS.md`, `QR-CODES.md`).
- **The artifact question (#1 to nail):** does that claim QR physically exist for the business? Made in the **QR Studio (Code Desk)**; the secret comes from `getClaimSecret` (guardian **or** admin, `apps-script/Code.js:792`), generated lazily. **Can Jacob generate + print these in advance / on the spot?** Trace "I have a business name" → "I'm holding a printable claim card." No card → no claim.
- **Card substrate:** does the place already have a working card? (~18 dining listings exist, most richly built — `PLACE-CARDS.md`.) Brand-new place not yet listed → admin auto-provision (`getClaimSecret`, admin-only). State exactly what Jacob does to stand one up.
- Referral: a new guardian adds **keyholders** (staff, per-field perms) + can refer other businesses (each needs its own QR/claim). Any referral affordance, or fully manual? (gap-hunt.)

**B. Resident (claim residence + the Lobby) — instant-capable, auto-grants Townie**
- Procedure: neighbor scans the **building QR** → `CheckinPage` detects a residential target → `claimResidence(dh, buildingId, auto_verify=true)` → verified via one of the **4 paths** (admin · QR-invite `auto_verify` · linked-device · co-resident) → private **Lobby** unlocks (1 year) (`RESIDENTS.md §2/§4`).
- **The on-the-spot lever:** the **QR-invite path** (`auto_verify=true`) verifies instantly on scan — so a resident CAN be onboarded on the spot (unlike an earned Townie). Confirm which QR Jacob hands/posts for this (**resident-invite QR**, `QR-CODES.md`) and that it carries `auto_verify`.
- **The bonus:** resident-verify **auto-grants Townie** (`grantTownieStatus`, `Code.js:1766`) — so onboarding a resident instantly also makes them a townie. Surface this in the playbook (it's the highest-value single scan).
- Referral: **co-resident verify** is the built-in spread — a verified resident approves a neighbor's pending claim (`postVerifyResident`). Document it as the resident referral loop.
- Identity: residence resolves by device-hash **or** any device sharing the `@handle` (linked-device path) — so the handle/identity step (below) matters here too.

**C. Townie (earn local status) — earned or auto**
- Procedure (earned): scan a place's **check-in QR** (`/checkin/<id>`) → check-in logged → set up **identity** (handle + emoji/vignette, `IDENTITY.md`) → repeat across **3 distinct days in 14** → townie (unlocks reviews/bulletin/DMs, `TOWNIES.md`).
- Procedure (auto): granted automatically on resident-verify (path B) — state both routes.
- **Honest framing (state plainly):** the *earned* path is **time-gated** — you cannot make someone a townie on the spot *by check-ins*. On-the-spot you get their **first check-in + identity** and explain the path — OR use path B (resident-verify) if they live here. Logical + repeatable ≠ instant.
- Artifact: are **check-in QR cards** printed + posted at places? Can Jacob show/hand one (phone or card) for an on-the-spot first scan?
- Referral: check-in QRs are everywhere; townies spread by getting friends to check in. Any explicit invite mechanism? (gap-hunt — device-link is for one person's *own* devices, not referral: `DEVICE-LINK.md`.)

## Massage & fortify (the real heart of this arc)

The mechanics are wired; the work is making the moment feel *good* and the model *sound*. Each is a Phase-1 analysis item (what exists → what should change), then verify/spec in Phase 2.

**a. Frictionless identity at sign-on — don't put people on the spot.** Someone signing on may have **no handle idea in the moment**. Today `set-handle` expects a chosen, unique `@handle` (`IDENTITY.md`). Design a low-friction path: **`starter_name` + emoji** + a round of **generic filler suggestions** (auto-generated handle options) so they pick one instantly — no blank-page anxiety. Analyze what the handle step demands today and the smallest change that makes "I don't have a name yet" a non-event. (Propose the UX; flag if it needs a `starter_name`/suggestion affordance that doesn't exist yet.) *This applies to all three roles at their identity step.*

**b. Role independence + interactions (fortify the model).** The three roles are **independent** — clarify and verify each intersection in code, state plainly in the playbook:
- A **Guardian** of place X is NOT automatically a Townie; reviewing *other* places Y requires **Townie** status (3-in-14). Confirm a guardian who *is* also a townie can review Y, and nothing wrongly blocks/allows it.
- A **Resident** verify **does** auto-grant Townie (confirmed in `RESIDENTS.md §2`) — verify the grant actually fires and the townie privileges light up.
- Map the full cross-product so no role silently confers (or fails to confer) another's powers.

**c. Business medallions + the structure they represent.** Custom **vignette tiles** (`src/lib/vignettePresets.js`, `VignetteChooser.jsx`) + a **role medallion/badge** (`src/components/RoleBadge.jsx`). Find whether there are **role/business-specific** vignettes/medallions, document the full set + **which medallion = which role/member-type**, and include them in onboarding (a claimed business / a resident / a townie should wear its medallion). Feature to surface + reference to capture.

**d. Fortify the rights & privileges matrix.** Consolidate into **one authoritative, complete matrix** — every member-type (Visitor · Townie · Resident · Keyholder · Guardian · Admin) × every privileged action (review · reply · bulletin/comment/DM · edit-card fields · manage staff · lobby read/write · claim/verify) — and **verify each cell against the server-side gate** (not just the UI; e.g. the lobby read/write re-checks residence server-side, `RESIDENTS.md §5`). Surface any inconsistency or hole.

## Deliverable

- **`ls/ONBOARDING.md`** — the permanent operator playbook: one section per role with the **diamond field procedure** + the **artifact/capability checklist** ("what must exist · who makes it · on-the-spot-able?") + the **referral-loop** analysis. Plus the **frictionless-identity** recommendation (§a) and the **medallion/vignette structure** (§c). *(A prior version of this file may exist from the earlier framing — reconcile, don't duplicate.)*
- **A fortified rights & privileges matrix** (§d) — member-type × action, each cell backed by its server-side gate with file:line — as a section of `ls/ONBOARDING.md` or a short companion (`ls/RIGHTS.md`); your call, tell Boz.
- **An onboarding-readiness verdict at the top** — 🟢/🟡/🔴 per role with the exact blockers Jacob must clear to onboard someone (e.g. "print Guardian claim QRs for A/B/C," "post resident-invite QRs at building X," "confirm check-in cards are posted at Y").
- **(Phase 2) a code-verification appendix** — per-step pass/fail with file:line + the gap list.

## Boundaries / conventions
- **Phase 1 = prose.** Read code only as much as needed to state procedures truthfully; the deep verification is Phase 2, after Jacob's gate.
- **Verify against the lit app** where you can — Jacob's eye is the gate (`feedback_proxy_render_is_not_the_operator_eye`).
- **Surface to Boz/Jacob at the phase gate** — the prose → eye → code sequence is the whole point; don't run it together.
- The `ls/*` specs are **read-only inputs**; if you find an inaccuracy, note it for Boz to fold in (the docs are freshly swept — but you may still catch real ones).
- Commit your own file(s) with **selective `git add`** on `curb-offset-draw`; don't sweep the cascade/Stage/render WIP (`scene.json`, `looks/*`, `src/cartograph/*`, the render files).

*Refocused 2026-06-30 (Boz) from the "tomorrow trio" to the trust-role trio (Jacob's onboarding = Townie/Guardian/Resident). Indexed in `ls/BACKLOG.md` (Concurrent). Retires to `ls` NOTES/Diary + `ls/ONBOARDING.md` (the Reference home) on landing.*
