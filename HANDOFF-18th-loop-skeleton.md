# HANDOFF — South 18th Street: detect the U/horseshoe loop in the skeleton (v1-must-fix)

> ⛔ **OBE — DO NOT DISPATCH (2026-06-12, Spline's forensic, branch `spline-18th-loop` @ `e85d231`, `SPLINE-18TH-FINDINGS.md`).** The §2 forensic-first gate **tripped — correctly.** 18th is **NOT a broken loop**: it already renders as coherent normal streets enclosing regular blocks, **curbs present** (ray-cast 3.2–5.5 m both sides the whole length), all legs `anchor:center`/no `pairId` (not mis-paired divided), and `interior:'block'` would be a pure **no-op** (the loop-median emitter only fires on a *single self-closing* chain — 18th is multi-chain + open). The brief's symptoms were a **transient state already fixed the same day by two unrelated commits**, not the loop detector: **`dd4ddb6`** (the prune-revert restored every dead-end's tile-sourced curb — "curb absent" was the active-prune state) + **`646b8b1`** (the `rayHitCurb` distance cap — handles fall back to the ruler instead of floating). **Boz's premise was over-attributed:** the "100–217 m curb-absent" sim was largely a crude-per-vertex-perpendicular artifact on the snaking 18th-3 chain. **No skeleton change warranted.** Kept for the record; if 18th ever genuinely needs loop construction, the §2 inventory + spec still stand — but verify the premise first. *(Residual defects, if any, are out-of-scope classes: a junction-gap handle drift → tune the cap (§5); or a junction-construction kink → §5e/§5g tileGround.)*

**Agent: FRESH → name yourself.** Domain: **`cartograph/skeleton.js`** (the frame's detection — `analyzePhases` / `weldChains` / `repairDividedPairs` / the loop guard). This is a skeleton-detection build, a distinct subsystem from the Section/FILL work in flight; no warm agent fits. **Isolation: `worktree`** (`[[feedback_dispatch_agents_in_worktrees]]` — branch off `curb-offset-draw`, do not build in the shared tree).

**Why now:** the authoring handles float far off the ribbon and the corners are dysfunctional all around South 18th / Dolman / Carroll / Kennett, because the curb is **absent along 18th's body** (a perpendicular ray from 18th's centerline travels 100–217 m before hitting any curb — proven, `scratch/handle-diag.mjs`). The root is upstream: **South 18th is a mis-shapen tangle the skeleton never resolves into a coherent street, let alone the U/horseshoe LOOP it actually is.** It's on the v1-must-fix list and it's a *recurring* class (the "weird street" the whole map trips on).

---

## 0. First reads (ground before you touch anything — HARD GATE)

1. **`README.md` § "⭐ START HERE"** — settled state by topic.
2. **`cartograph/LOOP-STREETS.md` — the home doc.** Read §0 + §1 + §6. **18th is explicitly specified there as a NEW loop SUBTYPE:** a **U/horseshoe dead-end whose interior is a REGULAR BLOCK (NOT a median)** — so its legs are **normal streets with sidewalks on BOTH sides** (the *opposite* cross-section from Benton's grass-median body), and **its loop crosses a NAME-SHIFT** (chains change names around the U), so same-name grouping cannot detect it — it needs `continuesAs` / collinearity. Your fix builds to this spec; if you think it doesn't apply, **stop and flag Boz.**
3. **`cartograph/SKELETON.md`** — §2 (the `streets[]`/`phase`/`continuesAs` schema), §3 steps 2–5 + 8 (the build order: `analyzePhases` divided detector → `weldChains` (signature,pairKey)-gated → `weldLongitudinal` → `repairDividedPairs` → junction-protected RDP, closed-loop auto-detect at `hypot(first,last)<1m`), §5 (the across-intersection gap), and the doctrine in §6.
4. **`cartograph/skeleton.js:189–222`** — the **data-first carriageway gates** (`870a1fd`, OSM2STREETS-GROUNDING §4.2): class compatibility + `*_link`/`service` exclusion + split/rejoin. **These ALREADY un-fabricated the old "18th divided pair"** (a motorway_link ramp + service drive that geometric detection wrongly paired). ⛔ **Do NOT re-litigate the divided detection — it's fixed.** Your job is the LOOP, which was never built.

---

## 1. The target — the concrete 18th tangle (forensic starting inventory)

"South 18th Street" is plastered across **mixed OSM classes** — this is the mess to untangle (from `src/data/ribbons.json`, 2026-06-11):

| skelId | class | endpoints | note |
|---|---|---|---|
| `south-18th-street-1` | **motorway_link** | [367,266]→[356,323] | ramp |
| `south-18th-street-7` | **motorway_link** | [370,251]→[367,266] | ramp |
| `south-18th-street-4` | **service** | [356,323]→[367,266] | service drive |
| `south-18th-street-2` | secondary | [678,−796]→[658,−727] | arterial seg |
| `south-18th-street-5` | secondary | [658,−727]→[691,−450] | **bottom U leg** |
| `south-18th-street-6` | secondary | [705,−447]→[658,−727] | **bottom U leg** (shares [658,−727] with −5 → the turn) |
| `south-18th-street-3` | residential | [516,−414]→[374,229] | long west leg · `continuesAs west-18th-street` |
| `south-18th-street-0` | residential | [259,583]→[294,704] | `continuesAs geyer-avenue-6` (far north — likely unrelated to the U) |
| `west-18th-street` | residential | [516,−414]→[609,−391] | `continuesAs dolman-street-1` |
| `dolman-street-1` | residential | [609,−391]→[475,243] | east leg · `continuesAs west-18th-street` |

**Name transitions present:** `South 18th → West 18th @(516,−414)`, `Dolman → West 18th @(609,−391)`. So the horseshoe spans **South 18th ↔ West 18th ↔ Dolman** — three names, which is exactly why same-name grouping fails.

⚠️ **This inventory is your STARTING point, not ground truth.** The first deliverable is forensic.

---

## 2. Forensic-first (mandatory — produce findings BEFORE building)

The recurring expensive failure on this map is building before confirming the mechanism. **Do not skip this.** Determine, against the data + the aerial (and a render):

1. **What is South 18th actually, on the ground?** A through-arterial with on/off ramps? A horseshoe `Place`? Both (an arterial whose service loop is the horseshoe)? The mixed classes (secondary + ramps + service + residential) suggest the OSM author lumped several real features under one name. **Map which chains form the real closed U, which are ramps/service that should stay separate, and which (`-0`→Geyer) are unrelated.**
2. **Where does the loop close, and across which name-shifts?** Confirm the `west-18th ↔ dolman-1 ↔ south-18th-3` horseshoe and its interior face.
3. **Why is the curb absent along the body?** (the floating-handle symptom). Is it that the chains never weld into a face-bounding ring, so `extractFaces` builds no tile there? Confirm on a render of the curb/tiles at 18th.
4. **Is anything still mis-paired as divided here post-`870a1fd`?** (current data says no — all center-anchored — but verify.)

Write a short FINDINGS section at the top of your result. **If the forensic shows 18th is NOT a clean "U-loop with block interior" but something else, STOP and flag Boz** — the fix changes.

---

## 3. The fix (build to LOOP-STREETS §0/§6, after the forensic confirms it)

Detect the South 18th **U/horseshoe** in `skeleton.js` and emit it as a coherent loop:

- **Detect across name-shifts** — same-name grouping fails, so trace the closed body via **`continuesAs` chains + collinearity / shared-endpoint connectivity** (the loop body is the cycle `south-18th-3 → west-18th → dolman-1 → …` back to a shared node). The closed-loop RDP guard (`hypot(first,last)<1m`, §3 step 8) only catches a *single* closed chain; this loop is *multi-chain across names*, so it needs the connectivity trace.
- **Take PRECEDENCE over divided detection** — a loop's two legs are NOT divided carriageways (even though the data-first gates already stop the ramp/service pairing, make the loop identity authoritative so a future geometric near-miss can't re-pair the legs).
- **Tag the 18th SUBTYPE: interior = REGULAR BLOCK** — `overlay.loops[loopId].interior = 'block'` (the LOOP-STREETS option; Benton's default is `'median'`). The legs render as **normal streets, sidewalks on BOTH sides**, and the enclosed face is a normal block (treelawns/sidewalks/parcels), NOT a grass median. This is the *opposite* of the Benton body cross-section.
- **Keep the ramps/service separate** — `-1`/`-7` (motorway_link) and `-4` (service) are not part of the residential horseshoe; don't fold them in.

Then **re-run the two-step rebuild** (SKELETON §1 / PREBAKE §1): `node cartograph/skeleton.js` → `node cartograph/pipeline.js --skip-elevation` → `node cartograph/promote-ribbons.js` → re-bake. The loop must build clean ribbons + a proper interior block, and the curb must exist along the body.

---

## 4. ⛔ Invariants that still bind (do NOT break)

- **The two-carriageway divided model is LOCKED** (`FEATURES §367–387`). Real divided roads (Truman, Park Ave, S Jefferson, S 14th, Russell, Chouteau, Lafayette) must be **untouched** — A/B carriageways + constructed median intact. Sweep them after.
- **The data-first carriageway gates (`870a1fd`, `:189–222`) stay** — don't loosen them.
- **Junction-protected RDP stays** (§3 step 8 — never the junction-blind simplify; it deleted 79 Ts).
- **Benton / Waverly loops stay correct** — Benton's `'median'` interior (the emergent-face grass body, `e8cc310`) and the endpoint-weld (`tileGround.extractFaces`) must not regress. Your loop work is a *new subtype*, not a rewrite of the existing one.
- **Do NOT touch the Section/FILL/cap/clamp side** — that's a separate arc.

---

## 5. The complementary fix (NOT yours — context only)

The handle-float has a *second*, independent root Boz is handling separately: `rayHitCurb` (`MeasureOverlay.jsx:174`) takes the nearest perpendicular curb crossing with **no max-distance / no street-identity filter**, so even where a curb exists it grabs a far one at junction gaps. Your skeleton fix makes the curb *exist* along 18th (removing the worst case); the ray-cap is defense-in-depth on top. **Don't build the overlay fix — focus on the skeleton root.**

---

## 6. Write / commit boundaries + the gate

- **Edit `cartograph/skeleton.js`** (+ `cartograph/data/lafayette-square/clean/overlay.json` only if the `interior:'block'` option needs an authored entry) + the **regenerated artifacts** (`data/clean/map.json`, `src/data/ribbons.json`, the re-bake). **Canon docs OFF-LIMITS** — Boz folds the outcome into `LOOP-STREETS.md` / `SKELETON.md` on landing.
- Commit on your worktree branch with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. **Flag Boz for the land + the LS re-bake** (targeted checkout + main-tree regenerate; don't race the ground artifacts with other live sessions).
- **Eyeball gate (Jacob, final verdict — verify on a render AND the lit app, not byte-proofs):**
  1. South 18th renders as a **coherent U/horseshoe loop** — a clean closed body, sidewalks on BOTH legs, a **normal interior block** (treelawns/sidewalks/parcels, NOT a green median).
  2. The curb **exists along the body** (no 100 m+ ray-to-curb gaps); the authoring handles sit **on the ribbon**; the corners at Kennett / Carroll / Dolman are functional.
  3. **No regressions:** the real divided roads unchanged; Benton/Waverly loops unchanged; the ramps/service near 18th still render as their own (non-loop) features.
- Final message: a FINDINGS section (§2) + before/after renders of 18th + the regression sweep + the exact rebuild sequence you ran.
