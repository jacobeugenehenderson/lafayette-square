# HANDOFF — D1: carriageway measure hygiene (the "parcel touches the centerline" data bug)

**Goal:** fix, **at the frame level and systemically**, the side-scrambled per-side measures on divided carriageways — the data root of the false corner and the asphalt-flooded median. Carriageway-B's outer `pavementHW` is `0` with its real width filed on the *median* side, so the block runs flush to the centerline (Jacob's *"the parcel touches the centerline"*). This is **D1** of `cartograph/PREBAKE-POLYGONIZATION-PLAN.md` (Mercator) — the data prerequisite the corner cure (D3) can't land without.

**Agent: FRESH** (name yourself). **`isolation: worktree` — sync the worktree to the current trunk tip FIRST** (avoid the stale-base hazard). General-purpose, forensic-then-fix.

> **Push back if the framing is wrong.** This brief asserts the scramble is a derivation/side-keying bug fixable at the source. If the forensics show otherwise (it's authored into `overlay.json`, or the model differs), **say so and flag Boz** — don't force the brief's path. (Two prior agents caught wrong instructions this way; that's the job.)

**Read first (to the section):** `PREBAKE-POLYGONIZATION-PLAN.md §2` (the inner-edge model: chains sit at the carriageways' *inner/median* edges; intended `anchor='inner-edge'` → outer = full carriageway width, median side effectively 0) + the **D1 row** (§4) · `SKELETON.md §2` (`phase`, `seed`, `caps`) + `§4` (anchor / Symmetric↔Asymmetric affordances) · `SURVEY.md §4` (the per-side authoring controls = the operator override path) + `§6` (divided transition) · memories **`[[feedback_geometry_bugs_may_be_data_bugs]]`** (this is its exemplar), **`[[feedback_perp_side_convention]]`** + **`[[reference_ls_local_frame_axes]]`** (the side/axis traps — ground side selection in the DATA/DCEL tags, never visual reasoning). Code: `skeleton.js seedSection` + phase/`innerSign`; `derive.js` divided-pair measure assignment; `tileGround.js effectiveMeasure`/`isMedianFacing` (`:377-387`, how the side is consumed).

**Two mandates from Jacob (non-negotiable):**
- **SYSTEMIC, never hand-patched.** It's a **kit** — we will never know what OSM throws at the next town. Fix the *assignment logic* so it is correct for **every** divided road, keyed **point-order-forward (reversal-proof)**. Verify A/B across **all** divided corridors (LS's 22+, **Truman included**), not just carriageway-B at the park. ⛔ Do not edit individual measure values to make LS look right.
- **Fix in the frame, invisibly — NO user controls.** This is a *data/frame* root, not our polygonization — and the operator does **not** want or need to control the Skeleton or OSM classifications (that messiness is the black box we absorb; the operator just points at issues + fortifies shape). ⛔ **Do not add any operator control for this** — the systemic fix in `skeleton.js`/`derive.js` IS the answer. (The frame data is reachable only at the Survey/pre-wall stage; past the wall it's frozen polygons — so the fix belongs upstream, where it lives.) `[[feedback_geometry_bugs_may_be_data_bugs]]`.

**Tasks:**
1. **Forensic — pin the origin.** Where does the side-scramble enter: `seedSection` (symmetric — shouldn't scramble), the `derive.js` divided-pair per-side assignment, `innerSign`/the side convention, the canonical-direction flip interacting with side-keying, or authored `overlay.json`? Determine whether fixing the *logic* auto-corrects LS, or LS's existing data needs a re-derive/migration (state which; never hand-edit values).
2. **Fix the logic** — divided-pair per-side measure assignment, point-order-forward and reversal-proof: outer side carries the carriageway width, median-facing side effectively 0 (the `anchor='inner-edge'` model). Side selection grounded in the data/DCEL, not the eye.
3. **Rename/annotate `medianWidth`** — it is the **chain gap**, not the median width (Mercator).
4. **Make LS correct** by re-deriving from the corrected logic (not by editing values).

**Done:** A/B over **all** divided corridors (LS + Truman); on **Jacob's live Survey eye**: the Lafayette park-side curb sits ~7 m south of the chain, **the park block no longer touches the centerline**, and **the median strip stops rendering as solid asphalt.** The fix is in the *logic* (systemic, frame-side, invisible to the operator — no new controls). Report origin + which corridors changed. Don't touch canonical docs (Boz conforms). Sync to trunk, commit, report refs.

**Out of scope:** D2 prebake face-freeze · D3 the corner cure (needs D1+D2) · D4 C5/LU · D5 perf · the band-fold thorns. D1 is the data hygiene alone.

---

## REPORT (Gunter, 2026-06-05) — DONE, pending Jacob's live eye

**Origin pinned — three stacked causes, all data-level, none in our polygonization:**
1. **Broadcast smear.** `migrate-overlay.js` ("Broadcast primary's measure + caps to every new chain of this name", :84) fanned one name-keyed corridor `{left,right}` verbatim onto every chain of that name — carriageways included. Corridor half-widths landed on median-facing sides → **42/44 carriageways flooded their median with asphalt** (Lafayette pair: inboard 10.56+6.70 > the 7.92 gap).
2. **Direction-flip scramble.** The longitudinal weld (`5348fbc`, Truman 8→2) **reversed lafayette-avenue-6's point order**. Its overlay measure had been authored CORRECTLY under the old order (outer 6.70 / inboard 0, verified across ribbons.json history: `1f89b86`→`8392b3e` era). left/right keys are point-order-relative; the flip silently swapped the physical sides → outer became 0 = *"the parcel touches the centerline."* The operator never mis-authored; the frame moved under their data.
3. **No inner-edge form at assignment.** Nothing in skeleton/derive ever constructed the documented model (outer = carriageway width, median-facing ≈ 0; `streetProfiles.js` had it in comments only).

**The fix (systemic, frame-side, zero operator controls):**
- `derive.js innerEdgeAssign` (divided-pair pass): per bake, sides resolved through `innerSign` (recomputed from current geometry — reversal-proof). (1) **Reclaim** a misfiled width: outer pavementHW ≤ 0 with inboard > 0 is an impossible road → swap the side sections back (auto-heals any future weld flip). (2) Non-authored (name-fallback/default) carriageway measures = corridor facts → inboard zeroed outright. Authored inboard > 0 is preserved (the "eat into the median" affordance).
- Same reclaim guard at both consumption choke points (`streetProfiles.innerEdgeMeasure`, `tileGround.effectiveMeasure`) so live render + bake agree even on stale-scrambled data. Side convention pinned in code comments at all three sites.
- `repair-carriageway-measures.js` (new, one-shot): re-derives the 44 carriageway overlay entries by rule (reclaim + per-field broadcast-residue detection — exact-float pavementHW repeated across same-name entries). **40 re-derived, 0 hand-edited.** Backup + `--root` for main-tree delivery. 3 survivors with authored inboard > 0, all < their gap (no flood): truman-parkway-0/-1, south-jefferson-avenue-1.
- `medianWidth` → **`chainGap`** (skeleton.js + ribbons `phase`; it measures chain-to-chain, not the median). Back-compat read in derive. Zero src/ consumers existed.

**Corridors changed (re-derive):** all 22 divided pairs except Truman (authored, kept): south-18th, papin, russell, officer-david-haynes (10 chains), geyer, chouteau, lafayette (×3 pairs incl. the park pair: -6 RECLAIM outer 0→6.70, -5 inboard 10.56→0), south-14th, park-avenue (×2), south-jefferson (×3 pairs).

**Verified (proxy — Jacob's live eye is the gate):** A/B all 44 carriageways: 41 inboard→0, 0 non-carriageway/structural diffs; park-side curb 6.75 m off the chain along the ENTIRE -6 run (was flush); median bare-ground rings appear between the chains; map-wide +17 block rings / +18.3k m² ground / +19 asphalt rings (medians un-flooding, nothing vanished). Baseline pipeline reproduced HEAD byte-identically before any change. ⚠️ **Expectation: the false CORNER at the transition node remains** (>15 m wedge at station 315) — that is D3, which can now land on correct data.

**Class-level hazard noted (not fixed, out of scope):** `capStart`/`capEnd` are also point-order-keyed — a future weld flip would swap a chain's caps the same way. Same cure shape if it ever bites.

**Delivery:** the live app reads `overlay.json` from the main tree (live store measure overrides ribbons — `mergeLiveRibbons.js:41`), so the eye-gate needs the migration run there: `node cartograph/repair-carriageway-measures.js --root <main-tree>` (timestamped backup automatic), then reload Survey.
