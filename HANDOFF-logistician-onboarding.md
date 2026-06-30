# Handoff — Logistician: field-ready onboarding for the "tomorrow trio"

> **Status: DISPATCH-READY (drafted by Boz, 2026-06-29).** Jacob's goal in one line: **"I want to walk out my front door tomorrow and sign people onto the platform — and have them able to sign others on too."** This brief makes that provable for the three paths most likely to come up at his meeting.

## Agent: FRESH — name yourself
**Name yourself** (one word, joins the name-trail). Self-contained arc on a freshly-documented system — the diamond reference specs already exist (see First reads); your job is to turn them into a **field procedure** and then **verify the wiring**, not to re-derive the system.

---

## The mission

Audit + playbook the onboarding paths to **diamond clarity** — logical, repeatable, and provably backed by what the platform actually generates and provides.

**Tomorrow's real scope (Jacob, refined):** the restaurateur can claim his restaurant and become a guardian **instantly** — so tomorrow is really about **(1) the commercial/restaurant Place card** and **(2) Guardians**. Jacob says *"we are wired for this, but we need to spend time massaging"* — so the heart of this arc is **§Massage & fortify** below, not just confirming the happy path.

1. **Commercial / restaurant Place card** — the place is on the map with a working, rich card. **(primary)**
2. **Guardian** — a business owner claims + controls that card, instantly. **(primary — the meeting hinge)**
3. **Townie** — a neighbor earns verified-local status. **(secondary — document it, but it's time-gated and not tomorrow's focus; see §Massage b for how it intersects guardians)**

*(Stay in this lane — do not scope-creep into Residents/Cary/Bulletin onboarding now.)*

## Method — Jacob's three steps, run in TWO phases

**Phase 1 — PROSE (do first; HARD GATE on Jacob's eye before Phase 2):**
1. For each path, write the **diamond-clear onboarding procedure** — the exact, repeatable, numbered steps a person follows to sign on. No hand-waving, no gaps, no "and then it works."
2. Confirm we **generate and provide everything necessary** for (a) a person to sign on successfully, and (b) that person to get **others** to sign on too (the spread/referral loop). This is an **artifact + capability audit**: what physical/digital thing must exist, who makes it, and whether it can be made on the spot.

→ **STOP and surface the prose to Jacob.** He perfects it. **Do not touch the code-verification until the prose is approved** — his words: *"Once we have the prose perfect, I want to analyze the code."*

**Phase 2 — CODE-VERIFY (only after Jacob approves the prose):**
3. Walk the code and confirm the implementation does **exactly** what the diamond prose says — step by step. Produce a **per-step pass/fail with file:line evidence**, plus a **gap list**: anything the prose promises the code doesn't deliver, and anything Jacob must do (print a card, provision a listing, run an admin action) before tomorrow.

## First reads (hard gate — `CLAUDE.md`; don't re-derive)

The diamond specs already exist — **build on them:**
- `ls/PLACE-CARDS.md` (card kinds + data) · `ls/GUARDIANS.md` (claim + perms) · `ls/TOWNIES.md` (check-in ladder) · `ls/QR-CODES.md` (the QR types + the Code Desk studio) · `ls/IDENTITY.md` (handle/avatar setup) · `ls/OPERATIONS.md` (admin/roles).
- Routing gate: `ORIENTATION.md` → `README.md §⭐ START HERE`.

## What "diamond clarity" must resolve, per path

**A. Commercial / restaurant Place card**
- Does the place already have a card? (~18 dining listings exist, most richly built — `PLACE-CARDS.md`.) State the procedure for "this restaurant is on the map with a working card."
- **Brand-new place not yet listed:** how does a listing get created so a card + QR resolve? (Admin auto-provision via `getClaimSecret`, `apps-script/Code.js:792` — **admin only**.) What exactly must Jacob do to stand one up on the spot?
- Delivery-readiness (a menu + the `delivery` tag) only matters if the meeting is a restaurant wanting orders — note that requester-side ordering is "coming soon" (`CARY.md`), so don't promise live delivery.

**B. Guardian (claim + control)**
- Procedure: Jacob presents the **printed Guardian QR card** (`/claim/<listingId>/<secret>`) → owner scans → becomes guardian → edits the card inline (`GUARDIANS.md`, `QR-CODES.md`).
- **The artifact question — #1 thing to nail:** does that Guardian QR card physically exist for the business? It's made in the **QR Studio (Code Desk)**; the secret comes from `getClaimSecret` (guardian **or** admin), generated lazily. **Can Jacob generate + print these in advance / on the spot?** No card → no claim. Trace the exact path from "I have a business name" → "I'm holding a printable claim card."
- "Get others to sign on": a new guardian can add **keyholders** (staff, per-field perms) and refer other businesses (each needs its own QR/claim). Is there any referral affordance or is it fully manual? (gap-hunt.)

**C. Townie (earn local status)**
- Procedure: scan a place's **check-in QR** (`/checkin/<id>`) → check-in logged → set up **identity** (handle + emoji/vignette, `IDENTITY.md`) → repeat across **3 distinct days in 14** → townie (unlocks reviews/bulletin/DMs, `TOWNIES.md`).
- **Hard reality to state plainly:** townie status is **time-gated** — you **cannot** make someone a townie on the spot. Tomorrow Jacob gets their **first check-in + identity** and explains the path. The diamond procedure must be honest about this (logical + repeatable ≠ instant).
- Artifact question: are **check-in QR cards** printed + posted at places? Can Jacob show/hand a check-in QR (phone or card) for an on-the-spot first scan?
- "Get others to sign on": check-in QRs are everywhere; townies spread by getting friends to check in. Any explicit invite mechanism? (gap-hunt — note device-link is for one person's *own* devices, not referral: `DEVICE-LINK.md`.)

## Massage & fortify (Jacob's refinements — the real heart of this arc)

Tomorrow's mechanics are wired; the work is making the moment feel *good* and the model *sound*. Treat each of these as a Phase-1 analysis item (what exists today → what should change), then verify/spec in Phase 2.

**a. Frictionless identity at claim time — don't put people on the spot.** A guardian claiming on the spot may have **no handle idea in the moment**. Today `set-handle` expects a chosen, unique `@handle` (`IDENTITY.md`). Design a low-friction path: let them enter a **`starter_name` + emoji** and get a **round of generic filler suggestions** (auto-generated handle options) so they can pick one instantly and move on — no blank-page anxiety. Analyze: what does the handle step demand today, and what's the smallest change that makes "I don't have a name yet" a non-event? (Propose the UX; flag whether it needs a `starter_name`/suggestion affordance that doesn't exist yet.)

**b. A guardian who wants to review *other* restaurants.** A manager is a guardian of place X but may want to post reviews on place Y. Clarify + fortify the rights model: **guardian status (of X) and townie status are independent** — reviewing Y requires *townie* status (3-in-14 check-ins, `TOWNIES.md`), which a guardian doesn't get automatically. Confirm in code that a guardian who *is* also a townie can review others, and that nothing wrongly blocks (or wrongly allows) it. State the answer plainly in the playbook.

**c. Business medallions + the structure they represent.** There are custom **vignette tiles** (`src/lib/vignettePresets.js`, `VignetteChooser.jsx`) and a **role medallion/badge** component (`src/components/RoleBadge.jsx`). Find whether there are **business-specific** vignettes/medallions, document the full set, and include them in onboarding (a claimed business should wear its medallion) — AND document the **"structure" each represents** (which medallion = which role/member-type). This is both a feature to surface in the procedure and a reference to capture.

**d. Fortify the rights & privileges matrix.** We've addressed rights/privileges of the member-types before (`OPERATIONS.md` roles table; `useGuardianStatus.js`; the server gates in the role specs). Consolidate them into **one authoritative, complete matrix** — every member-type (Visitor · Townie · Resident · Keyholder · Guardian · Admin) × every privileged action (review, reply, bulletin/comment/DM, edit-card fields, manage staff, lobby, claim) — and **verify each cell against the server-side gate** (not just the UI). Surface any inconsistency or hole. This is the "make sure it's fortified" Jacob asked for.

## Deliverable

- **`ls/ONBOARDING.md`** — the permanent operator playbook: one section per path with the **diamond field procedure** + the **artifact/capability checklist** ("what must exist · who makes it · on-the-spot-able?") + the **referral-loop** analysis. Plus the **frictionless-identity** recommendation (§a) and the **business medallion/vignette structure** (§c).
- **A fortified rights & privileges matrix** (§d) — member-type × action, each cell backed by its server-side gate with file:line — as a section of `ls/ONBOARDING.md` or a short companion (`ls/RIGHTS.md`); your call, tell Boz.
- **A "Tomorrow readiness" verdict at the top** — 🟢/🟡/🔴 per path with the exact blockers Jacob must clear before walking out (e.g. "print Guardian QR cards for A/B/C," "confirm check-in cards are posted at X").
- **(Phase 2) a code-verification appendix** — per-step pass/fail with file:line + the gap list.

## Boundaries / conventions
- **Phase 1 = prose.** Read code only as much as needed to state procedures truthfully; the deep verification is Phase 2, after Jacob's gate.
- **Verify against the lit app** where you can — Jacob's eye is the gate (`feedback_proxy_render_is_not_the_operator_eye`).
- **Surface to Boz/Jacob at the phase gate** — the prose → eye → code sequence is the whole point; don't run it together.
- The `ls/*` specs are **read-only inputs**; if you find an inaccuracy, note it for Boz to fold in (you may catch real ones).
- Commit your own file(s) with **selective `git add`** on `curb-offset-draw`; don't sweep the cascade/Stage WIP (`scene.json`, `looks/*`, `src/cartograph/*`).
