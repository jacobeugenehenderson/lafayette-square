# HANDOFF — D1: carriageway measure hygiene (the "parcel touches the centerline" data bug)

**Goal:** fix, **at the frame level and systemically**, the side-scrambled per-side measures on divided carriageways — the data root of the false corner and the asphalt-flooded median. Carriageway-B's outer `pavementHW` is `0` with its real width filed on the *median* side, so the block runs flush to the centerline (Jacob's *"the parcel touches the centerline"*). This is **D1** of `cartograph/PREBAKE-POLYGONIZATION-PLAN.md` (Mercator) — the data prerequisite the corner cure (D3) can't land without.

**Agent: FRESH** (name yourself). **`isolation: worktree` — sync the worktree to the current trunk tip FIRST** (avoid the stale-base hazard). General-purpose, forensic-then-fix.

> **Push back if the framing is wrong.** This brief asserts the scramble is a derivation/side-keying bug fixable at the source. If the forensics show otherwise (it's authored into `overlay.json`, or the model differs), **say so and flag Boz** — don't force the brief's path. (Two prior agents caught wrong instructions this way; that's the job.)

**Read first (to the section):** `PREBAKE-POLYGONIZATION-PLAN.md §2` (the inner-edge model: chains sit at the carriageways' *inner/median* edges; intended `anchor='inner-edge'` → outer = full carriageway width, median side effectively 0) + the **D1 row** (§4) · `SKELETON.md §2` (`phase`, `seed`, `caps`) + `§4` (anchor / Symmetric↔Asymmetric affordances) · `SURVEY.md §4` (the per-side authoring controls = the operator override path) + `§6` (divided transition) · memories **`[[feedback_geometry_bugs_may_be_data_bugs]]`** (this is its exemplar), **`[[feedback_perp_side_convention]]`** + **`[[reference_ls_local_frame_axes]]`** (the side/axis traps — ground side selection in the DATA/DCEL tags, never visual reasoning). Code: `skeleton.js seedSection` + phase/`innerSign`; `derive.js` divided-pair measure assignment; `tileGround.js effectiveMeasure`/`isMedianFacing` (`:377-387`, how the side is consumed).

**Two mandates from Jacob (non-negotiable):**
- **SYSTEMIC, never hand-patched.** It's a **kit** — we will never know what OSM throws at the next town. Fix the *assignment logic* so it is correct for **every** divided road, keyed **point-order-forward (reversal-proof)**. Verify A/B across **all** divided corridors (LS's 22+, **Truman included**), not just carriageway-B at the park. ⛔ Do not edit individual measure values to make LS look right.
- **Residuals must be operator-fixable in Survey.** Where OSM is too broken to derive correctly, the operator fortifies — so **confirm the Survey per-side override works** (the asphalt-edge per-side handle + "Asymmetric / edit sides separately"): an operator can correct a mis-derived side by hand. If that path can't express a side-swap/correction, flag the gap. **The frame data is only accessible in Survey (pre-wall)** — the systemic fix lives in `skeleton.js`/`derive.js`; the operator override lives in Survey; past the wall it's frozen polygons.

**Tasks:**
1. **Forensic — pin the origin.** Where does the side-scramble enter: `seedSection` (symmetric — shouldn't scramble), the `derive.js` divided-pair per-side assignment, `innerSign`/the side convention, the canonical-direction flip interacting with side-keying, or authored `overlay.json`? Determine whether fixing the *logic* auto-corrects LS, or LS's existing data needs a re-derive/migration (state which; never hand-edit values).
2. **Fix the logic** — divided-pair per-side measure assignment, point-order-forward and reversal-proof: outer side carries the carriageway width, median-facing side effectively 0 (the `anchor='inner-edge'` model). Side selection grounded in the data/DCEL, not the eye.
3. **Rename/annotate `medianWidth`** — it is the **chain gap**, not the median width (Mercator).
4. **Make LS correct** by re-deriving from the corrected logic (not by editing values).
5. **Confirm the operator override** path in Survey covers residuals.

**Done:** A/B over **all** divided corridors (LS + Truman); on **Jacob's live Survey eye**: the Lafayette park-side curb sits ~7 m south of the chain, **the park block no longer touches the centerline**, and **the median strip stops rendering as solid asphalt.** The fix is in the *logic* (systemic), and an operator can hand-correct a residual side in Survey. Report origin + which corridors changed. Don't touch canonical docs (Boz conforms). Sync to trunk, commit, report refs.

**Out of scope:** D2 prebake face-freeze · D3 the corner cure (needs D1+D2) · D4 C5/LU · D5 perf · the band-fold thorns. D1 is the data hygiene alone.
