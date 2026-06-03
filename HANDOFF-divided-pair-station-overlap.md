# HANDOFF — Station-overlap gate for divided-carriageway pairing

**State:** dispatch-ready. **Agent: WARM → Groma** (skeleton.js frame / divided-carriageway owner; this is one more gate on the same machinery). *If Groma is cold → FRESH — NOT Theodolite (grade-sep was downstream `tileGround`/`bake`, wrong layer).* **Domain:** cartograph frame (`skeleton.js`), Survey/SHAPE layer.
**Drafted:** 2026-06-03 (Boz). **Re-bake ordering:** branch off **post-`d52e4f6`** (grade-sep landed clean — path is clear; the new bake carries both grade-sep routing AND this pairing fix).

---

## One-line

The skeleton's divided-carriageway pairing heuristic mis-pairs **longitudinally-offset pinch-zone stubs** as opposing carriageways (Truman #5/#6, ~85m apart along the corridor) → a skewed diagonal "median" wedge — the visible "mis-linked" Truman. Add a 4th gate: **longitudinal station-overlap.**

This is NOT `innerSign` (verified correct, per-chain-relative — see refutation below) and NOT derive's matcher (3 clean `pairKey`s). It's a missing gate in the **frame** heuristic, which has been hardened in this exact spot once before.

---

## Read first (hard gate — do not skip)

1. `cartograph/skeleton.js:150-190` — the carriageway-pairing heuristic you are modifying. Read the comment block above it: this area was **already hardened once** ("Greedy first-match was letting connector stubs lock out… Truman"). You are adding one more gate to the *same* heuristic — match its style.
2. `cartograph/RIBBONS.md §3.1` (Inner-edge transform) + the divided-carriageway data shape (`anchor`/`innerSign`/`pairId`, ~line 131) — the model your output feeds.
3. Memory note `feedback_perp_side_convention` — **`innerSign` is correct and per-chain-relative; do NOT touch it.** This fix is upstream of it (which chains get paired at all), not the sign.

---

## Diagnosis (already done — verify, don't re-derive)

**Truman has 8 chains, two clean strands** (every internal node d=0.0m — linkage *along* each carriageway is fine):
- Strand A: `#0`(z282→55) → `#6`(55→-16) → `#3`(-16→-367) → `#1`(spine)
- Strand B: `#2`(z-450→-100) → `#5`(-100→-31) → `#4`(-31→205) → `#7`(spine)

**Three distinct `pairKey`s** (so it is NOT derive's single-slot `byPairKey` last-write-wins — each key cleanly holds one A + one B):

| pairKey | pair | z-spans | verdict |
|---|---|---|---|
| `…548-…868` | A=#0, B=#4 | [55,282] ∥ [-31,205] — overlap [55,205] | ✓ good |
| `…677-…552` | A=#2, B=#3 | [-450,-100] ∥ [-367,-16] — overlap [-367,-100] | ✓ good |
| `…823-…867` | A=#5, B=#6 | [-100,-31] vs [-16,55] — **no overlap** | ❌ offset stub-pair |

**Why #5/#6 pass the existing 3 gates** (`skeleton.js:165-175`): tangent-dot (antiparallel ✓ — opposite strands), length-ratio (both ~72m ✓), and `meanPerpDistanceXZ` gap ✓. The gap helper **clamps `t∈[0,1]`** (line 137), so a stub just *past* the end of its mate still measures a small perp distance to the mate's endpoint. **No gate tests that the two segments run *beside* each other.** The median ring `A.points + B.points.reversed` (derive.js, "emergent medians") over an offset pair draws the skewed wedge.

### innerSign refutation (so the next agent doesn't re-chase it)
`innerSign` (`derive.js:2849 innerSideSign`) is computed in **each chain's own digitization frame** = "which perp side of *this* chain faces the partner's center" (left-perp `(-dz,dx)`). It is **per-chain-relative, not a shared axis** — so comparing the two carriageways' raw signs is meaningless. Empirically across all 28 LS pairs: opposite-digitized→same sign (17), same-digitized→opposite sign (9), off-diagonal 0/28. "Both `-1` = bug" was a manufactured non-bug. Leave it alone.

---

## The fix

Add a **4th gate: longitudinal station-overlap.** A true carriageway pair overlaps heavily when projected onto the corridor axis; an offset stub-pair does not.

1. Add a helper near `meanPerpDistanceXZ` (~line 145), e.g. `stationOverlapFracXZ(aCoords, bCoords)`:
   - Shared axis = `avgTangentXZ(aCoords)` (existing helper, line 108), through A's first point as origin.
   - Project every point of A and of B onto that axis (scalar `s = (p−origin)·tHat`, **unclamped**).
   - `[aMin,aMax]`, `[bMin,bMax]` → `overlap = max(0, min(aMax,bMax) − max(aMin,bMin))`.
   - Return `overlap / min(aMax−aMin, bMax−bMin)`.
2. Add `const DIVIDED_MIN_STATION_OVERLAP = <calibrate>` next to the other `DIVIDED_*` constants (lines 99-106), same comment style.
3. In the candidate loop, after the gap check (line 175), before `cand.push`:
   ```js
   if (stationOverlapFracXZ(A.coords, B.coords) < DIVIDED_MIN_STATION_OVERLAP) continue
   ```
   Failing candidates never enter `cand`; the unpaired stubs fall through to `kind:'single-oneway'` and render as plain one-way streets (no median) — the correct outcome. (The ascending-gap greedy resolution already prevents #5 from re-claiming #3, etc. — the cleaner pairs claim first.)

---

## Acceptance gate (definition of done)

Re-bake LS and produce a **28-pair before/after table** over all divided pairs (read from `src/data/ribbons.json` after merge, or off the fresh skeleton). The bar:
- **Keep all 26 good pairs** (overlapping carriageways — Truman #0/#4 & #2/#3, plus the Officer David Haynes / Park Ave / S Jefferson / Lafayette / Papin / etc. pairs).
- **Drop the offset stub-pair** Truman #5/#6.
- **Report what happens to South 18th Street** — it carries the other suspect (a sign-anomalous pair). State whether the gate drops it and whether that's correct (eyeball its z-spans).
- Calibrate `DIVIDED_MIN_STATION_OVERLAP` to the value that cleanly separates (start ~0.4; #5/#6 score 0, good pairs score ≳0.5). **If no single threshold separates cleanly, STOP and flag Boz** — don't force it.

---

## Build commands

- Re-bake LS: `node cartograph/bake-ground.js --look=lafayette-square` (⚠️ **must** pass `--look=lafayette-square` — bare invocation writes a phantom `baked/default/` nothing reads).
- The skeleton regenerates from OSM via the intake/skeleton step — confirm whether your `skeleton.js` change requires re-running that step before the ground bake (the brief author believes it does; `skeleton.json` is the input). **Verify and document the exact command sequence you ran.**

---

## Write / commit boundaries

- **Edit only `cartograph/skeleton.js`** + re-baked artifacts (`cartograph/data/lafayette-square/clean/skeleton.json`, `public/baked/lafayette-square/*`).
- The new code comment **is** the load-bearing record (per `feedback_perp_side_convention` — next agent reads code, not memory). State the convention in the comment.
- **Canonical docs (`RIBBONS.md` / `PIPELINE.md` / etc.) are off-limits** — Boz folds this into the canon after it lands.
- Commit on a branch off current `cartograph-looks-pass-ab`. Commit message ends with the `Co-Authored-By: Claude …` trailer. Report the before/after table in your final message.

---

## Coordination

**Grade-sep has LANDED (`d52e4f6`, Theodolite)** — the earlier "don't race the re-bake" concern is resolved. Branch off the post-`d52e4f6` state; your re-bake will carry both grade-sep routing and this pairing fix. The grade-sep work touched `tileGround.js`/`bake-ground.js` (downstream); you touch `skeleton.js` (the frame) — different layers, no overlap. If you somehow find the divided-carriageway median emission entangled with grade-sep stroke routing, **stop and flag Boz** — but they should be cleanly separate.

---

## On landing (Boz, per the per-touch gate)

- Backlog one-liner + commit ref; retire this file to NOTES.
- Fold the new gate into the canon: `PIPELINE.md` (P1 frame — divided-pair detection) and/or a `RIBBONS §3.1` note that pairing requires station-overlap, not just antiparallel+gap.
- Note the operator safety-valve already documented at `derive.js:3015` ("Operator can override `anchor` per chain in Survey") for any residual mis-pair the heuristic still produces.
