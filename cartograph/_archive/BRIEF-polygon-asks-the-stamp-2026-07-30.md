# BRIEF — the polygon must ASK THE STAMP (node identity survives polygonization)

**Status:** DRAFT, dispatch-ready. Active brief (tracked at root). Written 2026-07-22 (Kestrel) from a
live eye-session with Jacob on the Lafayette strip + a full day in the dead-end class. Successor to
the dead-end leg-flip + cap-slope work (**LANDED** 2026-07-22 — brief retired, outcome in
`cartograph/BACKLOG.md §"Retired BRIEFs"`) and `BRIEF-dead-end-mouth-junction.md` (**RETIRED into
this brief** 2026-07-22 — it is now the mouth's evidence appendix, not a separate campaign; its §3
measurements stand, its §4 fix direction is superseded here). **Jacob dispatches.**

> # ⭐⭐ CORRECTION — READ THIS FIRST (2026-07-23, Boz, ruled by Jacob)
>
> **The symptom this brief exists to fix is "THE RIBBONS READ WRONG IN GENERAL." The co-claim m² was
> a BAD PROXY for it, and chasing that number derailed the whole thing.** §8 and §9 below are a pass
> that optimized the proxy — drove co-claim **1403.8 → ~42 m²** with two within-tile FILL bookkeeping
> edits (`25acccf2`) — and on that basis declared *"the premise is falsified; no polygonization
> rewrite; it's just bookkeeping."* **That conclusion is WRONG, and here is the proof:** on Jacob's eye
> those fixes produced **no visible improvement, and if anything slightly worse.** A metric you can
> drive to near-zero with two arithmetic edits while the operator sees nothing change is not measuring
> the symptom. **⛔ RETIRE "gate on `corner-coclaim.mjs`" as the primary gate** (the line below) — it is
> what caused this.
>
> **The premise STANDS and is the whole point:** the ribbons read wrong *because the tile does not carry
> the skeleton's identity.* `RIBBONS §1.1` is the doctrine — *"the polygon is BOTH the geometry source
> AND the identity source"*: the ribbon reads **leg** (`groupRuns`), **corner** (the run seam), and
> **treelawn-vs-sidewalk** (`gleanTreelawn`) off the tile, and `extractFaces` emits the tile as bare
> `{ring, edges}` with the skeleton's identity **thrown away**, so the FILL re-guesses it from shape and
> fragments — legs, corners, materials — *everywhere*, not just at the co-claim hotspots. **Carrying the
> stamp (the frozen `junctionMap.nodes` identity) onto the emitted tile so the FILL READS ownership is
> the fix for the ribbons reading wrong.** That is §0 below, unchanged, and it is correct.
>
> **THE GATE IS THE OPERATOR'S EYE ON THE RIBBONS READING CORRECTLY — leg/corner/material identity
> right, map-wide. NEVER the co-claim number again.** §8/§9 are kept only as the record of the
> metric-chasing detour and its lesson (`proxy ≠ operator eye`); do not execute their conclusion.
> ⚠️ The customs are currently RESET on LS (working tree, backed up `*.pre-reset`) so the raw ribbons
> are visible for exactly this diagnosis; `25acccf2` (the two FILL edits) is a candidate for revert.

> ⚠️ *(Superseded framing, kept for the record — see the CORRECTION above.)* A good-looking LS render is
> NOT evidence the class is fixed — the co-claim can be authored over by hand (Jacob, 2026-07-22).
> ~~Gate on `corner-coclaim.mjs`, then the eye.~~

> ✅ **RE-VERIFIED 2026-07-23 (Wren) — every gate number in this brief still holds on the current
> tree** (trunk `curb-offset-draw`, modified working-tree `design.json`): co-claim **1403.8 m² / 243 of
> 568** · junction-band **82 clean / 63 flagged** (the floor) · triple-derive **70 / 29 / 50 exact**.
> The +3 m² over the 1400.6 below is the modified `design.json`, not drift. **New scope finding →
> §8:** the co-claim mass is **79 % at `plain` ordinary corners** (1115 m²), NOT the §7 divided/median
> class — so the stamp-read fix hits the bulk *in scope*. Read §8 before planning the cut.

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
| `coclaim-by-nodekind.mjs` ⭐NEW | co-claim m² **partitioned by nearest junctionMap node kind** — the §8 in-scope-vs-out proof (79 % `plain`) |
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

---

## 8. Session learnings (2026-07-23, Wren — re-verification + scope + mechanism)

A fresh-agent route + baseline pass before the cut. Three findings that a fresh executor should carry;
none change the thesis, all sharpen the target.

### 8.1 ⭐ The co-claim mass is IN scope — 79 % is `plain` ordinary corners

`scratch/coclaim-by-nodekind.mjs` (new; partitions the 568-apex co-claim by the **nearest
junctionMap node kind within 16 m**):

```
  1115.0 m2   79%   plain                                  ← ordinary corners = the target
    52.0 m2    4%   corridor-terminus+divided-transition   ┐
    42.5 m2    3%   divided-transition                     │ §7 divided/median class ≈ 10% total,
    43.8 m2    3%   same-corridor-join                     │ explicitly OUT of this brief
    24.5 m2    2%   continuation+corridor-terminus         ┘
    50.1 m2    4%   NONE (no stamp <16 m)
     0.0 m2    0%   pendant-tip                            ← see 8.3
  TOTAL ~1403.6
```

**This retires a worry and strengthens the brief.** The single *worst* apex `[153,209]` (15 m²) sits
by a `corridor-terminus+divided-transition` node — a §7 outlier — which tempted the reading "the total
is dominated by the divided class we don't cover." It is not: **the mass is plain corners.** So the
stamp-read fix on ordinary-corner identity addresses ~79 % of the co-claim directly, and **`co-claim →
0` (§5.1) is a plausible target for THIS brief's scope**, not something the §7 campaign gates. Suggest
the executor track the `plain`-only subtotal as the true acceptance line and let the ~10 % divided
residue fall to §7 — don't chase it here and don't let it block the landing.

### 8.2 The mechanism, sharpened — co-claim is INDEPENDENT-EMIT-PATH overlap, not legs-vs-pad

Traced through `sectionPassTile`: the co-claim is **not** a within-tile legs-vs-pad fight. Leg strips
and the corner pad both peel from a **single shared `bandRem`** via `differenceRings(bandRem,
g.sectors)` — inside one tile those three ped layers ({sidewalk, treelawn, LU}) cannot overlap by
construction. The co-claim is the **independent emit paths that never clip against each other**: leg
sectors (`strokeOpen`, trimmed by `tangentTrim`), the corner pad (`cornerT`), `cornerTreelawn`, the
dead-end mouth-wrap, the LU flood, **and cross-tile accumulation at a shared node** (each tile decides
its own boundary near the shared apex; the whole-map sweep sees them overlap). **This is why the fix is
"declare the owner": once the corner boundary is read from ONE stamp on the shared node, every path
lands on the same line and the overlap is structurally gone** (§4.2's claim, now grounded in the code).
`tangentTrim` (`tileGround.js:1308`, *"meet the arc with no cream step / green sliver"*) is the exact
contract that breaks — it re-derives the trim per-tile from the nearest fillet, so two tiles disagree.

### 8.3 Two measurement surfaces — `corner-coclaim` (apexes) ≠ `cap-mouth-classify` (mouths)

`corner-coclaim.mjs` samples **fillet apexes**; the pendant-tip / mouth co-claim (§1's *"~15 m²/mouth"*
from `cap-mouth-classify.mjs`) reads **0.0 m² on the apex sweep** (8.1). They measure different loci —
mouths don't emit the fillet apexes the corner sweep enumerates. **So the MOUTH face (§3.4 row 2) is
gated by `cap-mouth-classify.mjs`, NOT `corner-coclaim.mjs`** — don't expect the apex gate to move when
a mouth fix lands, and don't read a flat apex-gate as "the mouth isn't fixed." Gate each face on its
own instrument.

### 8.4 Standup decision (Jacob, 2026-07-23)

Work lands in a **worktree** under `.claude/worktrees/` (risky, upstream-of-Wall, byte-moves the
authored map — isolate the rebake churn from trunk's prod LS). And **these learnings are folded back
into this brief for a FRESH agent to execute** (Jacob's call) — this brief stays the self-contained,
dispatch-ready SSoT; the sequencing of the cut (incremental-with-rebake-checkpoints vs. one landing) is
the fresh agent's first standup question, informed by §8.1 (the target is reachable) and §4 (the four
collapses). ⛔ Still true: nothing reaches the eye until `node scratch/rebake-shape.mjs` (§5).

---

## 9. ⛔ EXECUTION FINDINGS (2026-07-23, Seal) — SUPERSEDED, see the CORRECTION at the top. [Original header, kept as record: "the premise is falsified; converges on TWO FILL bookkeeping corrections, NOT a polygonization rewrite"]

> ⛔ **This section's conclusion is RETRACTED (2026-07-23, Boz, ruled by Jacob).** It equated the
> co-claim m² *metric* with the symptom ("the ribbons read wrong in general") and, having driven the
> metric to ~42 with two FILL edits (`25acccf2`) that changed nothing on Jacob's eye, wrongly declared
> the stamp premise falsified. The premise stands — the stamp is the fix for the ribbons reading wrong
> (`RIBBONS §1.1`; the CORRECTION banner up top). Kept below **only** as the record of the
> proxy-chasing detour. Do NOT execute its "two bookkeeping corrections" conclusion as the campaign.

A fresh-agent execution pass (worktree `polygon-asks-stamp`, off HEAD `19aaf3f4`) measured the actual
mechanism at each of the brief's two checkpoints. **Both checkpoints' core premise — "the polygon does
not ask the stamp; the fix is upstream identity" — is falsified by measurement.** This is a *real
result*, ruled by Jacob 2026-07-23: the co-claim is not an identity negotiation, it is two within-tile
FILL emit-path clipping omissions. The stamp architecture is **not** being built.

### 9.1 CP1 (dead-ends / 70·29·50) — the polygon ALREADY asks the stamp; Δ=0-render bookkeeping

`scratch/deadend-triple-sets.mjs`: the three counts are **not one fact with three answers competing to
drive the render** — they are three estimators with different information, and the correct one already
governs:
- **50** = face-topology caps (`detectTileCaps`), frozen onto `tiles[].caps` at prebake, **read by the
  FILL at `tileGround.js:3051`** to draw the round caps. `cap(50) ⊂ deadend(70)` is **50/50 exact.**
  This IS "the polygon asks the stamp" — already true, already shipping.
- **70** = skeleton graph-degree deadend — over-counts by exactly **20 boundary danglers** (all deg-1 at
  the ±900 m periphery). Skeleton is the FIRST bake; it cannot see faces, so it legitimately can't
  filter them. The `709-720` comment ("50 real caps survive") is **correct, not a lazy re-derivation.**
- **29** = junctionMap `pendant-tip` (an "L↔R asymmetry" heuristic, `derive.js:4143`) — **misaligned**
  (misses 35 real caps, +12 non-caps) and **inert**: its only FILL role (`tip-wrap` continuity) is
  *explicitly skipped* at `tileGround.js:2240` → deferred to the caps.

⇒ Collapsing 70/29/50→1 is honest hygiene but **Δ=0 on the render**. Caps are the **worked existence
proof** the stamp travels the freeze — which DE-RISKS the mechanism, but there is nothing to build here.
**Decision (Jacob): skip the cap-collapse, pivot to CP2.**

### 9.2 CP2 (corners / the 1115 m²) — 78 % is a `luRemainder` double-count, not identity; 22 % is a deferred design call

`scratch/coclaim-by-pair.mjs` partitions the 1403.8 m² co-claim by layer-pair. §8.2's claim that *"inside
one tile those three ped layers cannot overlap by construction"* is **empirically false**:

```
  tl∩lu : 1091.4 m²  (78%)  treelawn laps block-LU   ← within-tile bookkeeping bug
  sw∩tl :  312.1 m²  (22%)  sidewalk laps treelawn   ← within-tile pad/leg lap (design call)
  sw∩lu :    0.2 m²
```

- **tl∩lu (1091, the dominant mass) — an unambiguous bug, FIXED.** `luRemainder`
  (`tileGround.js` ~1533) subtracts `cornerPad` but **not** `cornerTreelawn` (the pad-derived
  `luInner` + slid-walk `luWedge`, which are pushed to `tlByLu` yet never peeled from `bandRem`). So
  that ground is owned by BOTH treelawn AND the LU remainder. The fix subtracts `cornerTreelawn` too —
  completing line 1530's own stated contract (*"whatever the legs + pads didn't claim flows to LU"*).
  **This is a FILL bug at ordinary corners, NOT the mouth class the FILL-patch prohibition guards** (the
  four prohibited patches are the *additive* dead-end mouth-wrap, `abf7c600`/`42ec46e7`; `luRemainder`
  has never carried this subtraction — clean history check). Result: **co-claim 1403.8 → 312.4**,
  unclaimed 8684.3 **unchanged** (no new gaps), junction-band **82 clean holds**, cap-sweep **0 errors**,
  customs **0 lost / 0 changed** (diff confined to `tileGround.js`; `buildBlockGeometryV2`/`feCustomKey`
  untouched). Before/after render: `scratch/coclaim-crop-{BASELINE,FIXED}-{a,b}.png` — the red
  double-claim band vanishes, treelawn clean, sidewalk intact, no holes. ⛔ **Gate is Jacob's eye on the
  lit app**, not the 312.4 (post-Wall FILL → a reload shows it, no rebake).
- **sw∩tl (312) — FIXED via tangent-trim (Jacob's direction 2026-07-23): treelawn ends at its TRUE
  TANGENT, not "pick a winner."** Diagnosis (proxy crops `coclaim-crop-SWTL-z{1,2}.png`): the leg
  **treelawn overruns its tangent** into the whole concrete corner (the pad is correctly whole; the green
  laps *into* it) — NOT the pad reaching too far. Fix: clip the leg treelawn against `cornerPad`. The
  pad's leg-ward side **IS the tangent radius** (`C→tA` ⊥ the leg), so this trims the treelawn to exactly
  its true tangent — completing `tangentTrim`'s own contract ("no cream step / green sliver", SECTION
  §6.1 s2) for the deeper strip. **The ADA concrete pad stays WHOLE (street-edge always concrete, s3);
  the treelawn YIELDS — it never wraps the curb.** ⛔ The reverted §6.2 "wrap" (route concrete →
  `cornerTreelawn`) is NOT taken. sw∩tl 312 → ~42 (residual = sharp/no-fillet corners on the `e.a+R`
  fallback + deep-trim grazing). ⛔ **Gate = Jacob's eye on the lit 5173 app, never the 42** — sw∩tl going
  to 0 two different ways is the proof the number can't settle it (SECTION §6.1 note).

### 9.3 Net

The brief's thesis ("the polygon must ask the stamp") is a sound *principle* and caps are its existence
proof — but for THIS map's measured co-claim it was the wrong *diagnosis*: no polygonization rewrite is
warranted. The campaign lands as **two within-tile FILL corrections in `sectionPassTile`** — (1) tl∩lu:
`luRemainder` also subtracts `cornerTreelawn`; (2) sw∩tl: the leg treelawn is clipped to the concrete
pad = its true tangent — **+ Jacob's eye on 5173.** Whole-map co-claim 1403.8 → 42.6 m² (residual = the
`e.a+R` sharp-corner fallback + deep-trim grazing; not chased — the eye gates, not the number). Guards
green: floor 82 clean, cap-sweep 0 err, customs 0 lost/changed, diff confined to `tileGround.js`.
Tooling added (all `scratch/`, git-tracked): `deadend-triple-sets.mjs`, `coclaim-by-pair.mjs`,
`coclaim-crop.mjs`.

---

## 10. ⭐ THE LIVE EXECUTION PLAN (2026-07-23, Boz+Jacob standup) — Phase 1: the plain-block `[kind]` stamp

> **This is the section to execute. It supersedes §9 (retracted) and re-grounds §4 on the seam we
> actually traced.** Ruled at a fresh-context standup: the symptom is *"the ribbons read wrong in
> general,"* the fix is the `[kind]` stamp (Jacob), and the co-claim m² is **retired as a gate** — the
> gate is Jacob's eye on the ribbons reading right, map-wide (the CORRECTION banner up top).

### 10.1 The two-axis finding — what already rides, what's dropped (traced, not assumed)

The tile carries identity on **two axes**, in different states. This is the correction to §0's
one-liner (*"the polygon never asks the stamp"* is overstated — it asks on one axis, not the other):

| Axis | Rides on the frozen tile today? | Read by | State |
|---|---|---|---|
| **Leg + material** — `{streetIdx, forward, side}` per edge | ✅ **YES** (`tileGround.js:704`) | `groupRuns` (`:959`), `gleanTreelawn` (`:850`) | **Fine — not the problem.** |
| **Corner / node `[kind]`** — which run-ends are real corners, of what kind | ❌ **NO** | `cornerT` re-derives from shape+guards (`:1316`) | **The dropped axis — this is Phase 1.** |
| Caps (dead-end tips) | ✅ YES (`:704` → read `:3066`) | face-topology `detectTileCaps` | existence proof the stamp travels the freeze |

⇒ My leg/material grep does **not** contradict the stamp thesis — it **localizes** it. The axis that's
re-guessed is the **corner decision**, exactly the `[kind]` stamp Jacob named.

### 10.2 The seam Phase 1 targets — the corner bid at the run-end

`cornerT` (`tileGround.js:1218`, built at the `ends.forEach` loop `:1316`) fires a **corner bid at each
run END** — a vertex where `(streetIdx, side)` changes — and suppresses it via a pile of **ad-hoc,
shape-derived guards**: `tipped[i] || through[i] || isNameTransition(p,run) || isThruNode(p,run)`
(`:1315`, `:1317`). That is the entire "is this a corner?" decision, and it never asks *"does a real
`junctionMap` node live at this vertex, and of what `[kind]`?"*

- **Why plain blocks read wrong:** a frontage split into two `streetIdx` at a **same-name chain seam**
  (not a name transition → `isNameTransition` misses it) fires a **spurious mid-frontage corner** — a
  pad/fillet where the eye sees a straight run. Map-wide, that's the plain-block fragmentation.
- **The `[kind]` fix:** carry the node `[kind]` (from `ribbons.junctionMap.nodes`, keyed by vertex `at`)
  onto the emitted tile, and let the corner bid read it: **a run-end is a corner iff it maps to a real
  node of a corner-bearing kind.** No node → no corner (spurious mid-frontage pad gone). Real node →
  bid governed by its `[kind]` (`plain` corners, `continuation`/`same-corridor-join` handled per kind).

### 10.3 ⛔ The guardrail — CONSOLIDATE onto E3.3, do NOT build a fifth path

The FILL **already consumes `junctionMap` globally** at `[E3.3] THE CORNER IDENTITIES`
(`:2187`–`:2710`, gated `consumeJM`). A fresh agent reading §0's *"the polygon never asks the stamp"*
will build a **redundant** per-tile stamp beside E3.3 — the exact anti-pattern §4.3 forbids (*"replace
it, don't leave it beside — otherwise we've added a fifth private derivation"*). **The `[kind]` stamp
must be the vehicle E3.3 already wants, and the four ad-hoc guards (`isThruNode` — one of §3.3's inert
markers — `isNameTransition`, `through`, `tipped`) collapse INTO the one `[kind]` read, not sit beside
it.** First executor task is to map how E3.3's node consumption relates to `cornerT`'s run-end bid, and
route the `[kind]` through the existing seam.

### 10.4 Phase 1 scope — plain-block corner identity ONLY

- **IN:** carry node `[kind]` onto the frozen tile; the `cornerT` run-end bid reads it; the spurious
  mid-frontage corners on plain blocks stop; the guards it subsumes are removed (not left beside).
- **OUT (Phase 2, after Jacob's eye on Phase 1):** junction corners / mouths / the divided-median class
  (§7). Do **not** touch them in Phase 1. Phase 1's win must be visible on **plain blocks, map-wide**.

### 10.5 Acceptance — the eye, then the guards (co-claim RETIRED as a gate)

1. ⭐ **Jacob's eye on :5173, map-wide:** plain-block frontages read as continuous runs — no spurious
   mid-block pad/fillet, sidewalk/treelawn coherent along a straight frontage. **This is THE gate.**
2. **Regression floor holds:** junction-band **82 clean** (`correctness-detector.mjs`), cap-sweep **0
   err** (`cap-sweep.mjs`), authored customs **0 lost / 0 re-keyed** (`cap-fe-key-diff.mjs`).
3. ⛔ **NOT the co-claim number.** `corner-coclaim.mjs` may be *observed* but it does **not** gate
   (§9's lesson: it moved 1403→42 with zero visible change).
4. ⚠️ **Upstream of the Wall** if the `[kind]` is carried at polygonization (`derive.js`/`extractFaces`)
   — nothing reaches the eye until `node scratch/rebake-shape.mjs`
   (`[[feedback_shape_pass_fix_needs_rebake_before_the_eye]]`). *"It didn't do anything"* is the first
   false alarm. If the `[kind]` read lands purely in the FILL (`sectionPassTile`, post-Wall), a reload
   suffices — the executor confirms which side of the Wall the change sits on and rebakes accordingly.

### 10.6 Mechanics

- **Worktree** under `.claude/worktrees/` (upstream-of-Wall, byte-moves the map — isolate rebake churn
  from trunk's prod LS; §8.4). **Jacob dispatches a fresh baby; Boz drafted this plan.**
- **Customs are RESET on LS** (working tree, `*.pre-reset` backup) — raw ribbons visible for the eye.
- **`25acccf2` is a revert candidate** — the two §9 FILL edits (`+19/-2` in `tileGround.js`) that
  changed nothing on the eye. It also carries three git-tracked `scratch/` tools; if reverted, back out
  only the `tileGround.js` hunk and keep the tooling. (Executor's call once Phase 1 lands — the edits
  may simply be superseded rather than reverted.)
- **Sequencing (Jacob's call, 2026-07-23):** plain-block identity **first** (this section), junctions
  **second** — front-load a visible map-wide win, stand up with Jacob before Phase 2.
