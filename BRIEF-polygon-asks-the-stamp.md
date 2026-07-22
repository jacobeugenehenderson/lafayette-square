# BRIEF — the polygon must ASK THE STAMP (node identity survives polygonization)

**Status:** DRAFT, dispatch-ready. Active brief (tracked at root). Written 2026-07-22 (Kestrel) from a
live eye-session with Jacob on the Lafayette strip + a full day in the dead-end class. Successor to
`BRIEF-dead-end-leg-flip-and-slope.md` (LANDED) and `BRIEF-dead-end-mouth-junction.md` (**RETIRED into
this brief** 2026-07-22 — it is now the mouth's evidence appendix, not a separate campaign; its §3
measurements stand, its §4 fix direction is superseded here). **Jacob dispatches.**

> ⚠️ **A good-looking LS render is NOT evidence the class is fixed** — the co-claim can be authored
> over by hand (Jacob, 2026-07-22). Gate on `corner-coclaim.mjs`, then the eye. Never the eye alone.

> ⛔ **ROUTE FIRST (`CLAUDE.md` gate):** `ORIENTATION.md` → `README §⭐ START HERE` → then
> **`RIBBONS.md §1`** (the derivation chain — *"the polygon is BOTH the geometry source AND the
> identity source"*, the line this brief is about) + **`SECTION.md §6`** (the corner construction) +
> **`SKELETON.md`** (node typing). Memory: `[[feedback_shape_pass_fix_needs_rebake_before_the_eye]]`,
> `[[project_the_palimpsest_code_path_multiplicity]]`, `[[feedback_fix_at_source_never_hack_the_symptom]]`,
> `[[project_skeleton_is_the_first_bake]]`.

---

## 0. ⭐ The one-line conclusion (Jacob, 2026-07-22)

**Polygonization is a separate step from the stamp, and the polygon never asks the stamp.** The
skeleton types every node; prebake freezes those types into `ribbons.junctionMap`; then
`extractFaces` walks the face graph and emits `{ring, edges}` — **carrying shape but not identity.**
Every downstream consumer therefore re-infers node identity *from shape*, and shape has already
thrown away the distinction at exactly the hard nodes. **The fix is to make polygonization consume
the stamp and carry identity onto the face it emits, so the FILL READS ownership instead of
negotiating it.**

This is not a corner bug, a cap bug, a mouth bug, or a side bug. Those are all the same bug seen from
four angles.

---

## 1. The measured symptom — corners over-claim, map-wide

`scratch/corner-coclaim.mjs` (568 frozen corners, r=9 m, 0.2 m grid, authored map):

```
CO-CLAIMED (>=2 ped layers own the same point):  1400.6 m2
corners carrying >0.5 m2 of co-claim:            243 of 568   (43%)
worst ~11-14 m2 each
```

The operator's eye-proof: at the leg→arc seam a thin **sidewalk sliver is stranded in the treelawn
with a notch behind it**, on ordinary street corners. `SECTION §6.1` step 2 says `tangentTrim` exists
precisely so the leg strips *"meet the arc with no cream step / green sliver."* **That contract is
broken at 43% of corners.**

`cap-mouth-classify.mjs` found the same signature at dead-end mouths: **0 m² unclaimed, ~15 m²
co-claimed per mouth.** Same magnitude, same shape. It is one class.

> ⚠️ The sweep also prints an "unclaimed" figure (8684 m²). **Not validated** — within a 9 m radius it
> includes legitimate non-ped ground, and Jacob believes it is a data ghost seen before. **Only the
> co-claim number is a finding.**

---

## 2. The chronology — where the stamp already lives (do NOT rebuild it)

The stamp **exists**, is already `[kind]`-shaped, and already rides in the right place:

| # | Step | What it does with node identity | File |
|---|---|---|---|
| 1 | **skeleton** | Types every shared coord by degree: `kindOf(d)` = `1 deadend · 2 through · 3 T · 4 cross · else Y`. ⚠️ `if (d === 2) continue` — **deg-2 nodes are dropped**. | `cartograph/skeleton.js:1522` |
| 2 | skeleton emit | Writes `{streets, paths, junctions, nameTransitions}` — *"`junctions` is additive frame metadata (typed nodes)."* | `skeleton.js:2306` |
| 3 | **prebake** | Passes the typed nodes straight through, and builds the richer **`junctionMap`**. | `cartograph/derive.js:4413` |
| 4 | **`ribbons.json`** | Carries `junctions` (277) **and `junctionMap.nodes` (233)**. Frozen — this is pre-Wall. | artifact |
| 5 | **polygonization** | `extractFaces` walks the face graph → **`{ring, edges}` and nothing else. ASKS NOTHING.** ⬅ **the gap** | `tileGround.js:561` |
| 6 | **FILL** | Re-infers everything from the polygon: runs, corners (`cornerT`), claims, caps, sides. | `tileGround.js sectionPassTile` |

**`junctionMap.nodes` is already what Jacob proposed** — a plural `kinds` array plus the leg pairing:

```
kinds[]: plain 159 · pendant-tip 29 · divided-transition 18 · corridor-terminus 12
         same-corridor-join 11 · continuation 9 · branch 4
fields:  key, at, kinds, legs (233), corners (233), cornersAdjacent (200),
         continuity (69), apron (45), deTaper (15)
```

Dead-ends are **already called out up top** as `pendant-tip`. `legs` and `corners` are already
per-node. `tileGround.js:2172` already consumes it for *"[E3.3] THE CORNER IDENTITIES."*
**So the answer to "where does the stamp live/ride" is: it already lives on `junctionMap`, frozen at
prebake. Nothing new needs a home. The polygon just has to ask.**

---

## 3. The evidence that the polygon does NOT ask

### 3.1 ⭐ Three answers to one question

```
SKELETON says     kind=deadend       : 70 nodes
junctionMap says  kinds=pendant-tip  : 29 nodes
FACE PASS re-derives caps            : 50 caps   (detectTileCaps, from face topology)
```

One fact — *is this node a dead end?* — derived three times, three answers. `detectTileCaps` even
carries a comment justifying why it re-derives from face topology ("the fe layer can't make it"),
when the skeleton decided it two steps upstream. **A consumer re-deriving a fact the artifact already
carries is the signature of this defect.**

### 3.2 Co-claim is 6× WORSE where the stamp exists (`scratch/corner-stamp-coverage.mjs`)

```
corners NEAR a junctionMap stamp (<16 m):  460    mean 2.94 m2/corner co-claim
corners with NO stamp nearby:              108    mean 0.46 m2/corner co-claim
```

⚠️ **Read this correctly.** It does **not** mean the stamp causes damage, and it does **not** mean the
priority is extending coverage to the dropped deg-2 bends (those corners are comparatively clean —
0.46 m²). It means damage concentrates at nodes that have **real identity content** — multiple legs,
pairings, roles — because that is exactly the information polygonization drops and the FILL then
guesses at. **The more identity a node has, the more there is to lose in polygonization.**

**Corollary for scope: deg-2 bend coverage is second-order. Do it after, not first.**

### 3.3 The pattern — stamps get written, then not believed

| Stamp / fact | Where it's decided | What happens downstream |
|---|---|---|
| node `kind` (deadend) | `skeleton.js:1522` | face pass re-detects caps → 70 / 29 / 50 |
| corner identity + legs | `junctionMap.corners` | `sectionPassTile` re-derives `cornerT` per tile anyway |
| which side a leg claims | the edge's own direction | was re-derived from **ring winding** → mirrored half the dead-ends (**FIXED `149f46b0`**) |
| through-ness | `thruNodeEnds` | **0 markers across all 101 tiles — entirely inert, map-wide** |

The already-landed side fix (`149f46b0`) is **this brief's thesis in miniature**: stop deriving side
from the face's winding, read it from the edge's direction. It cost nothing on the detector and
deleted a heuristic. This brief is that move generalized to the whole node.

---

## 3.4 What this brief carries, and what it does NOT (settled at the 2026-07-22 standup)

**IN — one class, four faces.** All gate on `corner-coclaim.mjs`:

| Face | Evidence | Where the detail lives |
|---|---|---|
| Corner co-claim, map-wide | 1400.6 m², 243 of 568 corners | §1 |
| The dead-end MOUTH | 0 m² unclaimed, ~15 m²/mouth co-claimed | `BRIEF-dead-end-mouth-junction.md` §3 (retired-in; read as appendix) |
| Triple-derived dead-ends | 70 / 29 / 50 | §3.1 |
| Inert `thruNodeEnds` | 0 markers across 101 tiles | §3.3 — ⛔ replace, don't leave beside |

**OUT — do not promise these.**

| Not covered | Why |
|---|---|
| **3 unresponsive legs** — `whittemore-place\|right`, `rutger-street-0\|right`, `st-vincent-court-1\|left` | Undiagnosed. Root unattributed. (The *other* 4 — where `assignSegOrdsToFes` hands the terminal segment to a longer neighbouring fe — are plausibly this class, but unproven; claim nothing.) |
| **7 caps flip to no visible change** | Pre-existing and undiagnosed — identical before the coupler landed. Not a regression, not this root. |
| **Waverly + St. Vincent Court** — the map's worst-fragmented junctions | loop×loop / court×avenue. Divided-loop / median-nose class (E2/E3). Different campaign. See §7. |

**✅ CLOSED — do not re-open.** The 10 asymmetric caps that changed appearance when the coupler landed
(each leg now rendering its own surveyed arrangement) were carried as "visible, Jacob's call." Ruled
2026-07-22 on Jacob's eye: **"they are correctly stroked and capped."** Accepted output. ⛔ Do not read
the visible left/right difference as a co-claim sliver or as a sub-threshold treelawn glean artifact —
both readings were tried at the standup and both are wrong. It is the fix working.

---

## 4. The fix DIRECTION

1. **Polygonization consumes `junctionMap` and stamps identity onto the emitted face.** At minimum,
   per ring vertex / edge-pair: *this vertex is a `pendant-tip`* · *this edge-pair is a corner, and
   these are its two legs*. The face stops being a bare `{ring, edges}` and starts carrying the node
   facts the skeleton already decided.
2. **The FILL READS ownership instead of negotiating it.** `sectionPassTile` takes the corner and its
   leg pairing from the face's stamp rather than rebuilding `cornerT`. **Co-claim then becomes
   structurally impossible — two layers cannot both claim ground whose owner is declared.**
3. **Collapse the duplicate derivations** as each consumer starts reading: cap detection (70/29/50 →
   one number), `cornerT`, and the inert `thruNodeEnds` (⛔ **replace it, don't leave it beside the
   new path** — otherwise we have added a fifth private derivation).
4. ⛔ **Do NOT go intersection by intersection.** 243 corners is a class, not a worklist
   (`POLYGON-FIRST §5`: *the deliverable is the DETECTOR, not the 35 fixes*).
5. ⛔ **Do NOT patch this in the FILL.** Same standing prohibition as the mouth
   (`README §START HERE`); four FILL patches already sit on this class.

---

## 5. Acceptance (measured, then the eye)

1. **Co-claim `1400.6 m² → 0`** across the 243 affected corners (`corner-coclaim.mjs`).
2. **junction-band does not regress: 82 CLEAN is the floor** (`correctness-detector.mjs`; current
   152 junctions / 82 clean / 63 flagged).
3. **The 70 / 29 / 50 dead-end discrepancy collapses to ONE number.**
4. **Cap sweep stays at 0 errors** (`cap-sweep.mjs`, 46 round caps).
5. **Authored customs intact** (`cap-fe-key-diff.mjs`) — no slot lost or re-keyed.
6. **The operator's eye** on the leg→arc seam: no stranded sliver, no notch.

⚠️ **This lands in polygonization — UPSTREAM OF THE WALL.** It changes the frozen artifact, so
nothing reaches the eye until `node scratch/rebake-shape.mjs`. *"It didn't do anything"* will be the
first false alarm (`[[feedback_shape_pass_fix_needs_rebake_before_the_eye]]`).

---

## 6. Tooling (all `scratch/`, git-tracked — REUSE, don't rebuild)

| Tool | What it answers |
|---|---|
| `corner-coclaim.mjs` | ⭐ **the gate** — co-claimed m² at every frozen corner (bbox-indexed; without the index it never finishes) |
| `corner-stamp-coverage.mjs` | co-claim split by whether a `junctionMap` stamp is nearby |
| `cap-mouth-classify.mjs` | which layer owns each point at a mouth (co-claim vs unclaimed) |
| `correctness-detector.mjs` | invariant #8 junction-band — the regression guard (82-clean floor) |
| `cap-fill-hash.mjs [plain\|design]` | whole-map FILL fingerprint for parity |
| `cap-sweep.mjs` · `cap-fe-key-diff.mjs` | 46-cap flip sweep · authored-slot orphan check |
| `cap-frozen-vs-live.mjs <skelId>` | ⭐ frozen vs live — run BEFORE diagnosing "the fix didn't take" |
| `cap-side-parity.mjs` | ⚠️ **NOT A GATE** (header says so): blind to `simpson-place`, 22+ of 40 inconclusive, verdict flipped on a sampling change alone |

---

## 7. Notes

- **Landed 2026-07-22 en route to this brief:** `149f46b0` (leg side by node direction, not ring
  winding — the thesis in miniature) · `4da68afe` (co-claim sweep + the 43% finding) · `b1d6e469`
  (mouth-brief corrections: §3.1 retracted, worst-junction attribution fixed).
- ⚠️ `149f46b0` **moves the authored map** (`sidewalk` + `treelawn[residential]` hashes change). The
  ~22 authored slots on `south-18th-street-3`, `park-avenue-1`, `kennett-place`, `mackay-place-0`,
  `missouri-avenue-2` may render differently — some were plausibly authored **around** the mirroring.
  **Those want the operator's eye.**
- **Still open, DIFFERENT class — the loop spurs.** Waverly (`waverly-place-0 × waverly-place-3`) and
  St. Vincent Court (`saint-vincent-avenue-0 × st-vincent-court-0`) are the map's worst-fragmented
  junctions (28+27, 20+20 slivers) and are **loop×loop / court×avenue, not mouths**. Nothing in this
  brief touches them. Do not promise it will.
- **Verify the instrument before trusting the verdict.** `cap-side-parity.mjs` gave 0 mirrored, then
  8, on a sampling change — and was blind to the one case verified two independent ways. Every number
  in this brief that gates anything should be re-run, not quoted.
