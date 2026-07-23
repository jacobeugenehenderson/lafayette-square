# BRIEF — the comprehensive canon sweep (accord + archive)

**Agent: WARM → Boz, fresh session.** This is the librarian/archivist pass (`BOZ.md §3` — the accord sweep + per-touch gate). It touches ALL canon, so it must be run with **clean context** (a saturated session is how buried-signal misses happen — the exact thing the sweep exists to fix). Do NOT run it at the ragged end of a long session. **Jacob asked for it 2026-07-23; run it first thing a fresh session, or dispatch per-doc agents.**

> ⛔ **Route first** (`CLAUDE.md`): `ORIENTATION.md` → `README §⭐ START HERE` → the doc you're sweeping. Read `BOZ.md §2` (three kinds: Reference/State/Diary) + `§3` (the living Process, the accord sweep, the per-touch gate) before editing anything.

---

## 0. The doctrine, in four rules

1. **Active docs carry LIVE doctrine + OPEN state only.** Everything superseded / landed / finished migrates OUT.
2. **The one law: additive/archiving, never destructive.** Superseded content is never deleted — it **moves** to its right home: landed-fact → Reference; decision/why → ARCHITECTURE; operator-knob → OPERATIONS; engineer-internal → ARCHITECTURE; narrative → NOTES; the verbose deep-dive → dated `cartograph/_archive/`. git is the verbatim backstop.
3. **Repoint every ref in the same breath.** The Archivist's one unforgivable error is the dead pointer — move a doc/section, grep the corpus for refs to it, repoint them to the LIVE home (not the archive).
4. **The accord test:** read any two docs side by side — could they disagree about *what's current · what's superseded · where the live home is*? If yes, the sweep isn't done. Cheapest repair is always a pointer ("superseded → see X"), never a silent stale assertion.

**Standard for "clean enough" = AGENT-ACCESSIBILITY, not tidiness:** could an agent read this doc and extract the load-bearing facts *without missing them in the noise*?

---

## 1. ⭐ PRIORITY — FEATURES + OPERATIONS (the standing laggards)

`BOZ.md §3` names FEATURES + BACKLOG as the perennially-bloated docs; Jacob adds OPERATIONS. Do these first and most carefully.

- **`cartograph/FEATURES.md`** — the clean PITCH (user/investor: *what it is, why it's special*). Strip: engineer-internals (→ ARCHITECTURE), operator-knobs (→ OPERATIONS), dated banners, DONE-narratives, superseded threads. It should read as the brochure, nothing else.
- **`cartograph/OPERATIONS.md`** — the operator MANUAL (*here's the panel, the knob, when to turn it*). It is FEATURES's matched pair. Strip superseded procedures; ⚠️ **`EXTENT-EXCAVATION.md §B4` found OPERATIONS still states the RETRACTED excluder/circle-is-the-boundary model** (`OPERATIONS:20` step 5) — fix it to the ring-of-streets→polygon procedure (`EXTENT-DESIGN §3.2`, `ARCHITECTURE §Extent`). Also fold the standing "Extract CSS from JS into a product dashboard" + a11y passes if touched (`BOZ.md §1`).

## 2. The Extent canon — reflect THIS week's work (the biggest accord debt)

The Extent subsystem changed more than any other and the canon lags it. The live home is now **`EXTENT-DESIGN.md`** (design of record; `EXTENT-EXCAVATION.md` = its evidence layer).

- **Update `ORIENTATION.md`** (the curriculum one-liner) + **`README §⭐ START HERE` Extent row** to point at `EXTENT-DESIGN.md` and state the settled model in plain language: *what Extent makes = the served skeleton (a labeled point cloud + node stamps); hood<disc<bb; the bb centroid never moves; the seal is the identity registry; the disc centroid is a draggable handle.*
- **⚠️ Sweep the RETRACTED excluder/circle-is-the-boundary model out of the canon** — `EXTENT-EXCAVATION §B4` lists the leaks the retraction commit `004a33e3` missed: `PREBAKE.md:56`, `ARCHITECTURE.md:168`, `INTAKE.md:15/26`, `OPERATIONS.md:20`, `NEIGHBORHOOD-INPUTS.md:318`, `PIPELINE.md:197`, `BACKLOG.md:119`. An agent obeying the routing gate is still told the wrong thing today. Fix the *step-by-step procedures*, not just the headers (that's what the last retraction missed).
- **Record the settled facts as canon:** D4 fixed (commit freezes the frame origin, stores the disc off-origin via `makeCircleBoundary(radius,center)`) → `ARCHITECTURE §Extent`; the identity lock (`fetch-msbf` consults the centroid-keyed registry, never renumbers) → `ARCHITECTURE` + `PIPELINE`; the ⭐ **palimpsest/served-path lesson** (pouring a 2nd scene clobbers LS through the 19 hardwired `src/data/*` name-imports — retire them before the swap) → a loud note in `ARCHITECTURE` + the LS-bleed home.

## 3. Retire the 12 landed BRIEFs (root)

Each root `BRIEF-*.md` that has LANDED: capture outcome + commit-refs as a `BACKLOG.md` one-liner, route fact→Reference / narrative→NOTES, **then delete** (⚠️ commit an untracked brief BEFORE deleting — git is the archive only for tracked files). Known-landed: `BRIEF-hpdm-identity-lock.md` (this session), `BRIEF-polygon-asks-the-stamp.md` (dispatched), the dead-end trio, `BRIEF-ls-bleed-excision.md` (partially — its class regression guard is `served-parity.mjs`). Verify each against git before retiring; don't retire an OPEN brief.

## 4. Per-doc pass (the rest of the canon)

For each: **history first** (read its prior discussion + NOTES + any HANDOFF), then migrate superseded→Diary, landed→Reference, narrative→NOTES, repoint refs. Docs, with what to watch:
`ARCHITECTURE` (excluder leaks; add D4 + identity) · `PIPELINE` (excluder footer :197) · `INTAKE` (excluder :15/26) · `PREBAKE` (:56 full retracted model) · `RIBBONS`/`SKELETON`/`SECTION` (dead-end class landed 07-22 — fold to canon, the stamp brief is the open thread) · `BACKLOG` (strip DONE-narratives + dated banners — a standing laggard) · `NOTES` (append-only Diary — fine, just receive the migrated narrative) · `NEIGHBORHOOD-INPUTS` (excluder :318) · `EXTENT-EXCAVATION` (keep as evidence; add a header pointer "→ design of record: EXTENT-DESIGN.md").

Domains beyond cartograph if time: `ls/`, `arborist/` (quartet), `meteorologist/`.

## 5. Acceptance

1. **Reachability** — every live topic reachable from `ORIENTATION.md` in ≤2 hops; no orphan.
2. **Accord** — no two docs disagree on what's current / superseded / where the live home is (spot-check the Extent docs against each other + the excluder-model greps return zero live assertions).
3. **FEATURES = clean pitch, OPERATIONS = clean manual** — one kind each, no leaked internals, no DONE-narratives.
4. **No dead pointers** — grep for every moved section's refs, all repointed to the live home.
5. **A short writeup** in NOTES: what moved where, what was retired, what contradictions were resolved.

⛔ **Safety** (`BOZ.md §3`): draft each pass, let Jacob review the diff (or trust git). For aggressive cuts, flag uncertain load-bearing-vs-diary regions before cutting, and lift any load-bearing fact to its Reference home BEFORE pruning. Everything inside `lafayette-square.nosync/`.
