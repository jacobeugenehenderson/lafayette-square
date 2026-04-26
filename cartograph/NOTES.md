# Cartograph — Operator Handoff

This document explains how to (re)build the Lafayette Square neighborhood map from
scratch, the principles behind the pipeline, and the work-in-progress problems the
next operator should pick up. Read this top-to-bottom before touching any code.

---

## 2026-04-26 PM (later) — Path B Phases 1+2+3 SHIPPED ("split traffic" works)

Implemented in this session:

1. **Phase 1 — Pre-weld phase analyzer** (`skeleton.js` `analyzePhases`,
   commits `613a6ff` + `6d7045c` tuning). Per name group, classify each
   raw OSM fragment as `divided-A` / `divided-B` / `single-oneway` /
   `single-bidi`. Detects antiparallel oneway pairs by symmetric mean
   perpendicular distance ≤ 60m **and** length ratio ≥ 0.5 **and**
   tangent dot ≤ −0.6, with best-partner resolution (sort all candidate
   pairs by gap ascending, claim greedily).

   Tuning notes: original 30m gap + greedy first-match + asymmetric
   mean-perp let connector stubs lock out same-length carriageway mates.
   Truman Parkway's main 361m carriageway pair sits at symmetric-max
   54m gap, so threshold went to 60m, paired with the length-ratio
   filter to block stub abuse.

   Validation: Lafayette 22 ways → 4 hidden divided pairs surfaced;
   Jefferson 19 ways → 4 (vs the 2 today's `splitAtFolds` recovers
   from a lucky fold). Truman 1 → 3 pairs.

2. **Phase 2 — Phase-aware welding** (commit `78f78bd`, after a
   revert+reinstate dance). `weldChains(fragments, signatureByOsmId)`
   gates every weld on signature equality — `divided-A` only fuses
   with `divided-A`, `single-bidi` only with `single-bidi`, etc.
   This removes the splice bridges where bidi connector fragments at
   intersections previously fused opposing-direction carriageways into
   one super-chain (the Lafayette 22→1 collapse).

   Result: Lafayette 1 → 10 chains (4 divided pairs + 12 bidi
   connector stubs as singletons + 2 unpaired oneway). Jefferson 4 → 8.
   Total streets 123 → 154. **Visible payoff: divided carriageways
   now render as separate parallel ribbons in Designer / Survey.**
   Operator confirmed "we have split traffic."

3. **Phase 3 — Skeleton emits phase metadata** (commit `d6a3c42`).
   Each emitted street carries:
       `phase: { kind: 'single' | 'divided',
                 role: 'spine' | 'carriageway-A' | 'carriageway-B',
                 corridorName, startNode: {x,z}, endNode: {x,z} }`
   Pure data addition. Existing consumers select fields explicitly
   and ignore the new property. Counts: 120 single/spine, 17
   carriageway-A, 17 carriageway-B.

### What still bites mid-Path-B

- **Visible breaks at phase transitions.** With Phase 2 producing
  separate chains for connectors and carriageways, ribbon emission
  (still per-chain, no stitching) leaves visible joins. Phase 5's
  knit step closes these. Mid-state is structurally correct, visually
  rough.
- **Derive still does its own divided detection** (`buildCorridors`,
  `meanPerpDistance`, `innerSign`, `pairId`, `medians`). Phase 4 is
  the rewrite to consume `street.phase` directly and delete that
  whole block plus `splitAtFolds` and `dropShadowedChains` in
  skeleton.

### Operational lesson worth saving

Mid-session the operator reported "no centerlines in Survey, Measure
controls dead, streets look the same." I leapt to a structural
diagnosis (ID churn from Phase 2) and reverted. The actual cause:
**`serve.js` was not running on port 3333.** Vite proxies
`/api/cartograph/*` to localhost:3333 and every fetch was returning
the proxy's connection-refused stub. Reinstating Phase 2 after
restarting `serve.js` worked immediately.

Lesson for next session: when Survey/Measure data goes blank,
**check `lsof -i :3333` first**. If nothing's listening, run
`node serve.js` (background) and reload the browser.

That said, the dependent-map I sketched during the (incorrect) revert
is real and will matter when Phase 4 ships:
- `src/data/ribbons.json` (681KB, dated Apr 25, hand-curated /
  no in-tree writer found) is bundled into the React app and consumed
  by `StreetRibbons.jsx`, `MapLayers.jsx`, `MeasureOverlay.jsx`,
  `MeasurePanel.jsx`, `useCartographStore.js`. Its `streets[].skelId`
  values follow the OLD chain-ID scheme. If Phase 4 (or any later
  refactor) shifts what ribbons.json should contain, we need to find
  or rebuild the producer.
- `useCartographStore._loadCenterlines` matches legacy intent by
  `name` — for Lafayette's 10 chains, only one inherits authored
  intent.
- `corridorByIdx` reads `ribbonsData.corridors[].phases[].chainIds`
  — those IDs correspond to the OLD welding output. Already
  silently empty after Phase 2.
- `overlay.json` is `skelId`-keyed; rewelded streets orphan their
  authored intent. Migration needs to map old IDs → new by name +
  geometry overlap, OR we accept loss for re-welded streets.

### Phase 4 pickup pointer (start of next session)

Read order:
1. This entry.
2. `cartograph/skeleton.js` lines around 379–530 (main, emit site,
   makeStreet) for the phase metadata shape now in skeleton.json.
3. `cartograph/derive.js` lines 2580–2870 (`buildCorridors`,
   `meanPerpDistance`, `medians` emission, `innerSign`/`pairId`
   pass) — this is what Phase 4 deletes/rewrites to consume
   `street.phase` directly.
4. `src/data/ribbons.json` schema — what fields derive currently
   emits and ribbons-consumers depend on. Phase 4 must preserve
   that contract OR coordinate a shape change with the React side.
5. `src/cartograph/stores/useCartographStore.js` `_loadCenterlines`
   — ID-keyed lookups likely to need updating once chain IDs shift
   (which they already have under Phase 2; verify).

Phase 4 is the bigger refactor and deserves a fresh context window.

---

## 2026-04-26 PM — over-welding diagnosed, Path B (phase-aware emission) chosen

**Drove this entry:** operator looked at Jefferson + Lafayette in Measure
mode and noted they show ONE blue centerline despite being divided in
reality. Rather than chase it as a render-visibility issue, we stripped
back to OSM source data. The finding turned a render-side hypothesis
into a structural/architectural one.

### The data finding

| Street | OSM ways | Skeleton chains | Notes |
|---|---|---|---|
| South Jefferson Avenue | 19 | 4 | Mix oneway + bidirectional. Lane counts 1–7. One has explicit `turn:lanes='left\|none\|none\|right'`. |
| Lafayette Avenue | 22 | 1 | 17 oneway + bidirectional ways collapsed into one 2,292m chain. Divided structure entirely lost. |

Skeleton inspection of Jefferson:
- chain-0: 1086m, 6 OSM ways, oneway. Single, NOT detected as divided.
- chain-1: 844m, 5 OSM ways, oneway. Single, NOT detected as divided.
- chain-2: 168m, 4 OSM ways  ┐ paired (welded super-chain folded → splitAtFolds caught it)
- chain-3: 166m, 4 OSM ways  ┘

Of Jefferson's 4 chains, only -2/-3 were tagged as divided — and only
because they happened to fold across themselves during welding, which
`splitAtFolds` then caught. The other 1086m + 844m sections have just
as much divided geometry in reality but their OSM ways didn't fold
during welding, so they stayed as single chains.

**Lafayette is the smoking gun.** No fold occurred during welding (the
17 ways stitched cleanly tail-to-head), so all bidirectional + oneway
fragments collapsed into one polyline running approximately down the
median. The divided pairs the OSM data clearly contains never become
separate chains.

### Why this happens — `skeleton.js` weldChains

The current welder allows any tail-to-head weld, including across
oneway↔bidirectional boundaries. It only forbids FLIPPED welds when one
side is oneway. The "bidirectional connector fragments" at intersections
where carriageways merge act as bridges that splice opposing-direction
oneway carriageways into one super-chain. `splitAtFolds` catches the
180° bend cases (Jefferson -2/-3) but misses the cases where stitching
is geometrically clean (Lafayette).

### Why we can't just make the welder stricter — the ribbon constraint

Ribbon emission in `StreetRibbons.jsx` (line 703 main fills loop, plus
edge strokes + face-clip + caps) operates **per chain**. Each chain
emits its own asphalt + curb + treelawn + sidewalk strips. Caps fire at
each chain's start/end. **There is no stitching between chains** — chain
boundary equals ribbon boundary.

That's why the welder is aggressive: making every road one chain is the
only way the ribbon comes out continuous. The "unified centerline"
strategy isn't a mistake; it's the consequence of how rendering works.

### The three paths considered

**Path A — Stricter welder.** Forbid welds across `oneway` ↔
bidirectional. Result: more chains per road, including isolated
connector stubs at intersections. Ribbons gain visible breaks at every
chain endpoint. Quick to implement. **Rejected — fragile visually.**

**Path C — Manual operator override.** Keep over-welding in skeleton;
operator manually adds couplers + flips `anchor` on chains where
auto-detect missed it. Smallest code change. **Rejected — patch-shaped
and we're past patches.**

**Path B — Phase-aware emission. CHOSEN.** Restructure: skeleton emits
chains per phase. Derive consumes existing phase data. Ribbons gain a
"knit at phase boundary" rule. Architecturally correct; the long-term
shape that matches `project_positive_carriageway_model` ("two
centerlines per divided road, median emergent").

### Path B — comprehensive plan

Goal: every street = a corridor of one or more **phases**. Each phase
emits its own chain(s):
- **Single phase** → 1 chain. Continuous ribbon, two-sided cross-section.
- **Divided phase** → 2 chains (one per carriageway). Two parallel ribbons.
- **Transition node** between adjacent phases is an explicit knit point;
  ribbons join cleanly there (single-phase ribbon merges into two
  parallel divided ribbons, or vice versa).

#### Phase 1 — Skeleton phase analyzer (BEFORE welding)

In `cartograph/skeleton.js`, before `weldChains`:

1. Group OSM ways by name (already done).
2. Within a name group, identify **divided pairs**:
   - Two oneway ways running antiparallel between the same two nodes.
   - Mean perpendicular distance < ~30m (already in derive's
     `meanPerpDistance` logic, move it here).
3. Identify **single-phase fragments**: bidirectional ways, or
   unpaired oneway ways.
4. Identify **transition nodes**: any node where the phase kind changes
   (e.g., bidirectional way ends and a divided pair begins).

Output: a phase decomposition per name — a list of phases ordered
along the corridor's spine, with explicit transition points.

#### Phase 2 — Phase-aware welding

In `weldChains`:

1. Weld within a phase only, not across phases.
   - Single phase → all ways in that phase weld into one chain.
   - Divided phase → ways group by oneway direction; each direction
     welds into its own chain. Output: 2 chains per divided phase.
2. Forbid welds that would cross a transition node.

Output: one chain per phase per direction.

#### Phase 3 — Skeleton emits phase metadata

Each emitted chain carries:
- `id` (existing).
- `name` (existing).
- `oneway` (existing).
- `phase: { kind: 'single' | 'divided', corridorName, role: 'spine' | 'carriageway-A' | 'carriageway-B', transitions: { startNode, endNode } }`.

#### Phase 4 — Derive consumes skeleton's phase info

`derive.js` `buildCorridors` is rewritten to read phase metadata from
skeleton instead of inferring it from welded chain endpoints. Existing
`anchor: 'inner-edge'`, `innerSign`, `pairId` emission still works —
just driven by skeleton's phase info, not derive's after-the-fact
detection.

`splitAtFolds` and `dropShadowedChains` in skeleton are deleted (no
longer needed — the phase analyzer handles separation correctly
upstream).

#### Phase 5 — Ribbon emission with phase-boundary knitting

`StreetRibbons.jsx` main fills loop stays per-chain BUT adds knitting:

At a phase transition node:
- If single → divided: the single chain's endpoint cross-section needs
  to morph into the two divided chains' starting cross-sections.
  Geometrically: the single ribbon "splits" at the node, with the
  median grass appearing as a wedge that opens up.
- If divided → single: inverse — two parallel ribbons converge into
  one centered ribbon, median tapers to zero.
- If single → single (different cross-section): the existing ribbon
  joint suffices; cross-sections share the transition node's
  perpendicular and meet cleanly.
- If divided → divided (different cross-section): each carriageway's
  ribbons join independently at the transition, paired together.

Implementation candidates:
- "Merge plugs" — geometry similar to corner plugs at intersection
  nodes, built at phase transitions to fill the join.
- Or: extend the cross-section taper logic that insert-couplers
  (medians) already use, applying it across phase boundaries.

#### Phase 6 — Emergent grass median + merge points (was Step C)

Once phase-aware ribbons emit, the median between paired carriageways
is the polygon between their inboard pavement edges within a divided
phase. At each transition node where divided meets single, the median
polygon closes (pinches) at the transition point. This is what was
queued as Step C of the inner-edge work; it lands naturally on top of
the phase-aware ribbon system.

### What carries forward from current work

Keep:
- `streetProfiles.innerEdgeMeasure` (zeros inboard treelawn/sidewalk for
  inner-edge chains). The cross-section model is independent of how
  chains are produced.
- `StreetRibbons.inboardPedZoneless` wrapper.
- `MeasureOverlay.selection` using `innerEdgeMeasure`.
- Ordinal-keyed `segmentMeasures` and couplers.
- Overlay file persistence.
- `setAnchor` action (operator override stays).
- Tool-scoped translucency.

Adapt:
- `derive.js` divided-pair detection (`innerSideSign`, `pairId`,
  `meanPerpDistance`) — most logic moves to skeleton, derive consumes.
- `derive.js` `buildCorridors` — driven by skeleton's phase metadata
  rather than detecting from welded chain topology.

Discard:
- `splitAtFolds` (skeleton.js).
- `dropShadowedChains` (skeleton.js).
- Derive's after-the-fact divided detection at lines ~2640–2730.

### Open issues this Path B fix INHERITS (still need addressing after)

- **Auto-survey `pavementHW` values are wrong** for current divided
  chains (Truman 2m, S 14th 5.35m, Park Ave 5.65/6.07m, S Jefferson
  7.72/9.16m). Operator re-measure all 8 inner-edge chains plus any
  newly-detected ones once Path B emits them.
- **Royal-blue authoring centerline visibility** over asphalt. Last
  attempt at depth/render-order fix didn't resolve. Path B doesn't fix
  this directly — still needs the visibility tweak. Top suspect: copy
  MapLayers' yellow-stripe material pattern (`MeshStandardMaterial`,
  `polygonOffsetFactor: -14`, `polygonOffsetUnits: -56`).
- **Loop streets** (Benton, Mackay) still need closed-polyline detection
  for inner-edge anchoring.
- **Corner plug shape at oblique IXes** — still open from 2026-04-24.
- **12 legacy `centerlines.json` measure overrides** — chains flipped
  by 2026-04-25 direction normalization may have left/right swapped.

### Pickup order for next session

1. Phase 1 + 2 (skeleton phase analyzer + phase-aware welding). The
   most invasive single change. Verify by running pipeline and counting
   chains per name — Lafayette should produce ~5–8 chains spanning
   single + divided phases instead of 1.
2. Phase 3 + 4 (skeleton emits phase metadata, derive consumes). Mostly
   plumbing; existing `anchor`/`innerSign`/`pairId` stays the same shape.
3. Phase 5 (ribbon knitting). The hardest part — needs visual iteration.
   Start with the simplest case (divided → single transition where
   carriageways converge) and validate before generalizing.
4. Phase 6 (emergent median polygon + merge points). Step C in the
   prior plan; trivially follows from phase 5.
5. Loop back: re-measure the now-correctly-detected divided chains,
   address the centerline visibility issue, etc.

### Memories to update before next session

- New project memory: `project_phase_aware_skeleton_emission.md` —
  scope of Path B, the data evidence, plan with phases, what carries
  forward.
- Update `project_inner_edge_anchor_in_flight.md` to note the model
  pivot: anchor detection moves from derive (after-the-fact) to
  skeleton (by-construction). Inboard-zoneless cross-section stays.
- Cross-reference from `project_positive_carriageway_model.md` →
  the Path B plan IS its concrete implementation.

---

## 2026-04-26 session (in progress) — inner-edge anchor for divided carriageways: Step A shipped, Step B pivoted, render visibility blocker

**Drove this session:** operator asked for "centerlines offset to the
inside" on split-traffic streets so ribbons emit outward, plus all main
roadways must have visible clickable centerlines. Pickup followed the
3-step plan from `project_inner_edge_anchor_in_flight.md`.

### Step A — auto-detect anchor (SHIPPED)

`derive.js` walks `corridors`, marks each chain in a `kind: 'divided'`
phase with `anchor: 'inner-edge'`, `innerSign`, and `pairId`. Re-runs
`pipeline.js` to refresh `ribbons.json`. Detected 8 chains in current
data: truman-parkway-0/1, south-14th-street-0/1, park-avenue-1/2,
south-jefferson-avenue-2/3.

Store `_loadCenterlines` reads ribbons.json via `ribbonById` lookup;
operator override (in overlay file) wins over auto-detect.
`_autoAnchor` tracks the auto value so persistence only writes anchor
when overridden. `setAnchor` action exposed.

`SurveyorPanel` got an Anchor dropdown (Center / Inner-edge). Disabled
when `innerSign === 0` (no paired chain detected).

### Step B — model PIVOT (operator-driven)

Initial Step B shape: visible centerline OFFSET to inner edge +
synthetic one-sided cross-section (outboard absorbs `inbHW + outbHW`,
inboard zeroed). Polyline shifted, perps recomputed, handles anchored
on offset.

Operator pushed back: "each roadway gets a centerline, and I will have
to manually go thru and correctly expand the center out in both
directions." Even for one-way split traffic.

**Pivoted to simpler model:**

- Chain stays at carriageway center. No offset polyline.
- Visible blue centerline = chain.
- Click hit-test on chain.
- Cross-section authored two-sided (pavement + curb both sides). For
  inner-edge chains, the inboard ped zone (`treelawn`, `sidewalk`,
  `terminal`) is zeroed; pavement + curb stay. Outboard keeps full stack.
- Median grass shows naturally between paired chains' inner pavement
  edges (Step C will replace the existing `ribbons.medians` lens with a
  cleaner runtime polygon).

The pivot ripped out:
- `applyInnerEdgeAnchor` (offset + synth pavement).
- Polyline shifting in MeasureOverlay's `centerlineMeshes` and click
  hit-test.
- Anchor shift in `MeasureOverlay.selection` memo.
- Offset rendering in `SurveyorOverlay`.

Replaced with:
- `streetProfiles.innerEdgeMeasure(baseMeasure, innerSign)` — returns
  base measure with inboard `treelawn`/`sidewalk` zeroed and `terminal: 'none'`.
- `StreetRibbons.inboardPedZoneless(street, baseMeasure)` — wrapper used
  in main fills, edge strokes, and face-clip per-segment loops.

### OPEN BLOCKER — blue authoring centerlines invisible over asphalt

Operator reports MeasureOverlay's royal-blue centerlines aren't visible
over the dark asphalt of any street, only at chain ends extending past
the asphalt onto lighter ped-zone backgrounds. Likely depth/render-order
issue: asphalt has `polygonOffset: -8 / -32` shifting it toward the
camera, and `meshBasicMaterial` opaque queue doesn't strictly respect
`renderOrder`.

Tried this session:
1. `transparent + depthTest:false + depthWrite:false + renderOrder:140`.
   Result: still invisible over asphalt.
2. `polygonOffset: -200 / -800`. Result: blue gone entirely on divided
   roads — likely past the near plane.
3. **Currently set:** `transparent + opacity:1 + polygonOffset: -30 / -120 + depthTest:false + depthWrite:false`.
   Plus a per-divided-chain diagnostic in `centerlineMeshes`. Operator
   went to sleep before testing.

**Next-session pickup:**
- Read the diagnostic to confirm two chains per divided road are emitted.
- If two chains emit but only one shows visually → still depth issue.
  Try matching MapLayers' yellow-stripe pattern exactly (`MeshStandardMaterial`,
  `polygonOffsetFactor: -14`, `polygonOffsetUnits: -56`). Yellow stripes
  work, so the proven pattern should too.
- Or render via R3F `<Line>` primitive instead of extruded ribbon.

### Color separation (clarified)

Two distinct line systems — don't conflate:
- **Yellow road stripes** = real road paint, rendered by `MapLayers`
  from `centerStripe` data. One per two-way road; none on divided.
  Part of the final map's visual story.
- **Royal-blue authoring centerlines** = `MeasureOverlay`/`SurveyorOverlay`,
  visible only with a tool active. One per chain (so two on each
  divided carriageway). Pure click target.

### Data quality finding

Auto-survey populated `pavementHW` for the 8 inner-edge chains using
OSM `width`/heuristics; the values aren't real per-carriageway
half-widths. Truman shows 2m where reality is ~10m (6 lanes ÷ 2). All 8
need operator re-measurement once Step B verifies visually. The new
authoring model (chain at center, drag both sides) makes this a
straightforward exercise.

### Three-step plan status

| Step | Status |
|------|--------|
| A. Auto-detect anchor + Survey toggle | SHIPPED |
| B. Inboard-zoneless cross-section | CODE LANDED, awaiting visual verify (blocked on render visibility) |
| C. Emergent grass median polygon | Not started |

### Memories updated

- `project_inner_edge_anchor_in_flight.md` — pickup-point for next session.

---

## 2026-04-25 session — couplers go live: chain direction normalized, segment-keyed measures, by-id chain merging

**Drove this session:** operator reported couplers "twisting" the ribbon and
edits leaking onto offset chain links. Diagnosis exposed three independent
bugs all rooted in the chain↔segment↔measure plumbing being only
half-built. Goal became: make couplers work end-to-end and lock down the
direction/identity invariants so future authoring isn't fragile.

### The four root problems we untangled

1. **Chain direction was arbitrary.** `skeleton.js` welded fragments and
   kept whichever orientation seeded the chain. Adjacent same-name chains
   could flow opposite ways, so Measure's "left" of chain A landed on
   the same physical side as "right" of chain B. Per-segment perpendicular
   computation flipped at chain joints, causing the centerline-visibility
   flicker on rebuild.

2. **Live merge keyed by name.** `StreetRibbons` matched `centerlineData`
   entries to `ribbons.json` streets by `name`. Mississippi (and every
   divided road) emits multiple same-name chains, so live edits to one
   chain landed on the other carriageway in the merge. Symptom: edits in
   segment X "affected offset chain links."

3. **Skeleton vs. ribbons polylines have different point counts.**
   `derive.js` splices intersection vertices into ribbon polylines, so
   Mississippi has 21 skeleton points but 28 ribbon points. Couplers and
   `segmentMeasures` keyed by point-index ranges (`"0-20"`) didn't match
   render-side ranges (`"0-27"`). The drag wrote to the wrong key, the
   renderer looked up the wrong key, stripes refused to follow the
   handles. Handles moved (read from skeleton store directly), fills
   didn't (read by mismatched range key, fell through to default).

4. **Selection translucency leaked across tools.** Selecting a chain in
   any tool dropped its opacity to 0.15 for aerial alignment. The dim
   stuck around when the user changed tool to null because
   `selectedCorridorNames` was set whenever `selectedStreet` was set,
   regardless of `tool`.

### Shipped (all kept in code, do NOT revert)

1. **Canonical chain direction in `cartograph/skeleton.js`** (just before
   the simplify pass write-out). Non-oneway chains are oriented so the
   dominant component of `(last - first)` is positive. Oneway chains are
   left alone (their direction is the direction of travel). Pass logs
   `flipped N non-oneway chain(s)` — currently 50 of 93. This is the
   load-bearing fix that makes `measure.left` mean physical-left
   everywhere.

2. **Couplers carry world coords.** `useCartographStore.toggleCoupler`
   stores `{ kind: 'split', pointIdx, x, z }` rather than a bare index.
   `streetProfiles.segmentRangesForCouplers(pts, couplers)` projects
   each coupler's `(x, z)` onto whichever polyline you pass — skeleton
   in `MeasureOverlay`, ribbons in `StreetRibbons`. The function
   accepts the legacy `(pointCount, couplers)` signature for back-compat.

3. **`segmentMeasures` keyed by ordinal**, not point-index range.
   `"0", "1", "2"` rather than `"0-7", "7-14", "14-22"`. Ordinal keys
   are stable across coordinate systems (skeleton vs. ribbons), so the
   key the drag writes is the same key the renderer reads.
   `measureForSegment(street, ordinal)` is the single read point.
   `setSegmentMeasure` migrates ordinals on coupler add/remove (split
   one ordinal into two, or merge two adjacent into one).

4. **Live merge by `skelId`.** `derive.js` now emits `skelId: st.skelId`
   on each ribbon street. `StreetRibbons`'s three merge sites
   (main fills, edge strokes, face-clip) build `liveById` from the
   centerline store and `lookupLive(st)` prefers `skelId` match, falls
   back to `name`. Mississippi's two carriageways are now independent.

5. **Survey: Ctrl/⌘-click an interior node to toggle a coupler.**
   `SurveyorOverlay` renders coupler nodes as orange diamonds (regular
   nodes stay white circles). `SurveyorPanel` shows live coupler/segment
   count + the gesture hint.

6. **Measure: per-segment selection.** Click resolves to the segment
   under the projection (`resolveSegmentOrdinal`). Drag, dblclick-insert,
   right-click-delete all scope to that segment. `MeasurePanel` shows
   "segment N of M" when applicable; Reset clears the segment override.
   Empty click off any centerline accepts changes (deselects). Enter
   key also accepts. Esc still works.

7. **`StreetRibbons` per-segment fills + corner plugs.** Main fills,
   edge strokes, caps, corner plugs, and face-clipping all walk segments
   per chain. Corner plug picks up `measureForSegment` for whichever
   segment of each leg contains the intersection.

8. **Translucency scoped to active tool.**
   - Selected corridor in **Measure** → 0.55 (see edits land while
     aerial reads through).
   - Selected corridor in **Survey** → 0.15 (silhouette + alignment).
   - Survey, unselected → 0.28.
   - **Measure, unselected → 1.0** (only the chain you're editing dims).
   - Default (no tool) → 1.0.
   `selectedCorridorNames` in `CartographApp` is gated on
   `tool && inDesigner`, so leaving the tool restores opacity even if
   `selectedStreet` is still set in the store.

### Data shape (current ground truth)

A street in `centerlineData.streets[i]`:

```
{
  id, name, type, oneway, points, divided,
  measure: { left, right, symmetric },               // chain default / fallback
  segmentMeasures: { "0": {...}, "1": {...}, ... },  // ordinal-keyed overrides
  capStart, capEnd,
  couplers: [{ kind: 'split', pointIdx, x, z }, ...],
}
```

A street in `ribbons.json`:

```
{
  skelId,           // matches centerlineData.streets[i].id
  name, points, measure, capEnds, intersections: [...]
}
```

Read order for resolving the effective measure of a segment ordinal:
`segmentMeasures[ord]` → `street.measure` → pipeline-derived → type default.

### Still open

- **Couplers + segmentMeasures are in-memory only.** Edits evaporate on
  reload, same as caps + chain measure. Persistence comes when the
  overlay file lands. Skeleton owns geometry; the overlay file will own
  caps, couplers, and segmentMeasures.
- **Median (insert) coupler + split coupler in same chain not tested.**
  Code paths are independent so it should work but no current data
  exercises both at once.
- **12 legacy `centerlines.json` measure overrides may be cross-wired**
  if their chain was among the 50 flipped by direction normalization.
  Names: Dolman, Mississippi, S. Jefferson, Missouri, Rutger, +7. Easier
  to redo by hand in Measure than to auto-swap.
- **Corner plug shape at oblique IXes** (the 2026-04-24 problem) is
  unaffected by this session — still open. See that entry below.

### Memories updated

- `project_divided_roads_architecture.md` — defers to the
  positive-carriageway model + segment primitive.

---

## 2026-04-24 evening session — corner plug deep dive: lookup fix landed, geometry still unsolved

**Drove this session:** prior session left corner plugs as the singular
priority. Goals: generate plugs at every IX (was missing ~50% at oblique),
fix undersizing, make non-right angles bulletproof.

### Shipped (kept in code, do NOT revert)

1. **IX-lookup fix** in `src/components/StreetRibbons.jsx:647-678`. Root
   cause: `derive.js:2415` shifts `ix.streets[].ix` by *name* during splice,
   not by chain identity. Multi-chain corridors (Lasalle ×5, Park Ave ×4,
   etc.) corrupt each other's IX-level indices. Chain-internal
   `st.intersections[].ix` is still correct — shifted per-chain.
   Runtime fix: `find()` now uses point proximity to `ix.point` plus the
   partner-name witness, ignoring the broken ix-level index. Diagnostic:
   99/183 → 183/183 cross-street pairs resolve. ~80 missing plugs recovered.

2. **R = treelawn + sidewalk** (operator's option ii). `plugSwWidth` uses
   full outside-curb width, not just the sidewalk stripe. Reads at ADA
   ramp scale (~3 m here vs ~1 m before).

### THE open problem — plug shape at oblique IXes (acute *and* obtuse)

Test case: Mississippi × Park (~69°/111° interior). Right-angle IXes look
fine. Oblique IXes show two artifacts:

- **Acute (~70°) sectors:** plug renders as a thin spike / tongue.
- **Obtuse (~110°) sectors:** small "tooth" where plug curb meets leg
  curb. Initially appeared correct at one set of measure values but
  re-measuring exposed the fragility — shape depends on coincidence,
  not on robust geometry.

Both stem from the same root: the parallelogram-overlap geometry
implicitly assumes 90° corners. The plug's leg-end cross-sections sit
on each leg's *parallel* offset line (parallel to leg A or leg B),
while the leg arms terminate on the *perpendicular* at IX. Those lines
coincide at 90° and diverge at every other angle.

### Approaches tried this session — all reverted, do NOT re-try blindly

1. **Property-line outer envelope.** Helped obtuse, broke acute.
2. **Acute-only tangent push-out** (`R · cot(θ/2)`). Curb width became
   inconsistent — coA/coB didn't move with swA/swB.
3. **Lockstep extension** of swA, swB, coA, coB, swA_outer, swB_outer.
   Curb width fixed but plug *shape* still wrong.
4. **Chord-midpoint apex at acute** (drop propCorner when θ < 90°).
   No visible change — wrong target.
5. **Multiplicative clearance `R = 0.85 × min`.** Operator: "Wrong
   approach. Please revert."
6. **"Concentric arcs with control at IX" rewrite.** Plug bounded by
   propCorner (outer) and asph corner (inner), sides on leg perps at
   IX, two false-curb arcs at curb-outer / asph-outer levels. Operator
   final screenshot: NO plug visible at all — broken.

### Operator's mental model (verbatim & confirmed)

- 4 corners of plug come from **ribbon-overlap intersections per IX**,
  not centerlines, no global formula.
- Diagram points: **1** = where leg A's outer edge meets leg B's outer
  edge; **2, 4** = extension of one ribbon width from 1 along each
  leg's outer line; **3** = bezier midpoint between 2 and 4.
- **Arc bows toward IX.**
- "If the shape is squashed, the arc gets squashed" — operator accepts
  oblique shearing in principle.
- "Curb in the plug should exactly meet curb on both legs."
- "Plug outer corner = property-line corner; inner corner = asph corner."
- "No treelawn in the plug; treelawn butts up to sidewalk."

The tension: points 1/2/4 in the parallelogram-overlap model use sw-outer
offset lines (= `oo`, `swA`, `swB` in code). But operator's "outer corner =
property-line corner" wants `oo` to be at propLine, not at curbOuter+R.
For asymmetric IXes these differ. Several attempts to use propLine corner
broke acute sectors. **Unresolved.**

### Where the code lives

- Plug build: `src/components/StreetRibbons.jsx` ~lines 717–803, inside
  the `meshes` useMemo.
- Cross-section data: `src/cartograph/streetProfiles.js` `refEdges()` and
  `sideToStripes()`.
- Render: `StreetRibbons.jsx` ~line 1311 (`{!surveyActive && meshes.map(...)}`).

### Required reading before next session

1. `feedback_corner_arc_rules.md`
2. `project_corner_plug_rules.md`
3. `project_corner_plug_open_problem.md`
4. `feedback_plug_is_angle_aware.md`
5. `feedback_no_global_fixes.md` — operator reminded of this several
   times this session.
6. **The "Approaches tried" list above** — every dead-end so far.

### Loose ends still from prior session

Still unresolved: `MapLayers.jsx:95` color=undefined warning,
`PlaneGeometry` NaN bounding sphere warning. One-line fixes when grepping.

---

## 2026-04-24 session — runtime face clip + Measure wireframe, corner plugs left as the open problem

**What drove this session:** ribbons were updating live on Measure handle
drags but everything around them (block faces, decorations, corner plugs)
either stayed frozen at pipeline-time widths or rendered incorrectly.
Three specific deltas shipped today; the corner plug shape is the
remaining open problem and is the *singular* next-session priority per
the operator: "every corner must be managed."

### Shipped this session

1. **Runtime face clip (live block reshape).** Removed the face-fill
   pre-clip from `cartograph/derive.js`. Added a `clippedFaces` useMemo
   in `src/components/StreetRibbons.jsx` that re-clips face polygons at
   render time using `clipper-lib`. Per-side independent ribbon offsets
   (NOT min(L,R)) so widening one side actually moves the face on that
   side. Debounced 120 ms via `stableLiveCenterlines` so drag stays
   responsive while faces settle a beat after release. Unclipped faces
   in `ribbons.json`; runtime is the only clip path now.

2. **Measure tool wireframe.** `edgeStrokes` now emits a stroke at
   *every* ring boundary (was pavement edge + property line only). The
   6″ curb now reads as a clearly visible 15 cm gap between two hard
   lines instead of a 1px-wide invisible fill. Plus `decorationsHidden`
   in `src/cartograph/CartographApp.jsx` now hides
   alleys/footways/lamps/stripes/edge-lines/bike-lanes/center-stripes
   any time Fills is OFF in Designer (was only in `designAerialOnly`),
   so Measure + Fills OFF leaves only aerial + ribbons + handles.

3. **Aerial bumped to z=19** in `src/cartograph/AerialTiles.jsx`.
   Doubles pixel density for handle/curb visual alignment. Watch for
   dark tiles in some areas — old comment warned of that; add a z18
   fallback if it recurs.

### E.A.1–3 (carried over from prior session) — DONE

- Park Avenue ribbon fills, Measure-drag mesh invalidation, and
  corner-plug bucket routing all fixed by the same edit:
  `selectedCorridorNames` added to `meshes` deps; corner-plug code now
  sets `activeGroups` per-intersection (selected if either meeting
  street is in the corridor) and pushes through `activeGroups[...]`
  instead of `groups[...]` directly. The crash that was nuking the
  whole `meshes` useMemo for certain selections is gone.

### Stencil mask attempt — REVERTED, do not re-litigate

Briefly tried a stencil-buffer face mask (mask mesh writes bit 1, face
materials read NotEqual). Aerial broke; cause un-diagnosed. Runtime
clipper-lib clip is the live path. SVG export concern doesn't apply
("map is published from Stage" — operator confirmation, see
`feedback_one_renderer.md` lineage). If revisiting stencil ever, the
suspicion is unclipped faces visually covering aerial because the
mask's renderOrder/queue interaction wasn't correct, but proceed with
caution.

### THE open problem — corner plugs

Diagnostic during the session confirmed corner plugs ARE generated:
**145 plugs per material** (`corner_asph`, `corner_curb`, `corner_sw`)
across **107 intersections** went into `groups`, 0 into `groupsSelected`
when nothing was selected. So generation works. The problem is the
*size* of the plug fill polygon, not its existence.

Operator's exact diagnosis (with screenshot, 2026-04-24):

> "All the pieces are here but they do not yet function properly. The
> curb is correct, the asphalt fill is correct; but it's neither wide
> nor tall enough to 'plug' the entire corner. It seems like one or
> more values are either hard coded or uses an inflexible ratio that
> needs finesse… The arc and curb are correct, we are only talking
> about the green space inside, caused by the fact that the plug needs
> to fill the space."

> "The corner plugs need to be responsive to the ribbon handles."

> "We also haven't made non-right angles bulletproof either, but we
> should always keep that possibility in mind."

So three demands on the corner plug for next session:

1. **Plug must scale to fill the entire corner.** Currently the plug's
   outer extent (the `swA → oo → swB` bezier in
   `StreetRibbons.jsx`'s corner-plug block, ~lines 690–786) lands
   short of where it needs to be — block-face green peeks through
   inside the (correctly-placed) curb arc. The arc and curb position
   are RIGHT; the plug fill is too small. Suspect the `plugSwWidth`
   reduction (`Math.min(swWidthA, swWidthB)` when both legs have
   sidewalks; falls to `0` when neither does) and the `swOuterA` /
   `swOuterB` derivation. Don't widen the curb arc; widen the plug
   to reach it.

2. **Plug must respond live to ribbon handle drags.** The plug is in
   the `meshes` useMemo whose deps include `liveCenterlines`, so
   geometry SHOULD rebuild on drag. Verify visually — operator
   reports it doesn't appear to update. The `clippedFaces` debounce
   (120 ms) means face fills lag behind ribbons + plugs, which
   could read as a stale plug visually if the face encroaches into
   the plug area. Worth checking whether removing the debounce or
   tightening it helps perception.

3. **Non-right angles must be bulletproof.** Plug bezier math handles
   arbitrary angles in principle (uses `dA_avg`, `dB_avg`, `lineX`)
   but hasn't been audited at acute / obtuse intersections (e.g.
   Park Ave at Mississippi has non-right corners). Pick 2-3
   non-orthogonal IXes, eyeball, fix.

### Where the corner plug code lives

- Generation: `src/components/StreetRibbons.jsx` lines ~636–786
  (inside the `meshes` useMemo). Read the comments at the top of the
  block — they explain the "narrower sidewalk wins" rule and the
  T-vs-X quadrant guards.
- Cross-section data feeding it: `src/cartograph/streetProfiles.js`
  `refEdges()` and `sideToStripes()`.
- Render: same file, ~line 1311 (`{!surveyActive && meshes.map(...)}`)
  using `makeMaterial(m.color, m.pri, streetFade, ...)`.
- Memory pointers: `feedback_corner_arc_rules.md`,
  `project_corner_plug_rules.md`,
  `project_corner_design_spec.md`,
  `feedback_plug_is_angle_aware.md` (these collectively pin the
  corner contract — read all four before changing the plug).

### Loose ends surfaced this session

- `MapLayers.jsx:95` — `THREE.Material: parameter 'color' has value of
  undefined` warning on every load. One of MapLayers' planes ships
  without a color. Separate from corner plugs but worth a single-line
  fix when grepping.
- `BufferGeometry.computeBoundingSphere(): Computed radius is NaN` on
  a `PlaneGeometry` (also from MapLayers). NaN positions somewhere.
  Likewise a one-line fix.

### Files touched this session

- `cartograph/derive.js` — face-fill clip block removed.
- `src/components/StreetRibbons.jsx` — `clippedFaces` useMemo,
  `stableLiveCenterlines` debounced state, `clipper-lib` import,
  per-side polygon clip math (replaced ClipperOffset with explicit
  centerline+offset rings), edgeStrokes filter relaxed.
- `src/cartograph/AerialTiles.jsx` — zoom 18 → 19.
- `src/cartograph/CartographApp.jsx` — `decorationsHidden` extended.
- `src/data/ribbons.json` — regenerated from current `derive.js`
  (120 unclipped faces, 161 intersections, 6 medians, 69 corridors).
- `src/data/ribbons.json.bak` — backup from earlier in the session.

### Memory updated this session

- `project_runtime_face_clip.md` — NEW
- `project_corner_plug_open_problem.md` — NEW
- `MEMORY.md` — index updated

Read those + the four corner memories before touching the plug code.

---

## 2026-04-23/24 session — skeleton-first pipeline landed; selection-based
## aerial reveal in progress (three specific bugs to finish)

**What drove this session:** replace the tangled OSM chain-stitching in
`derive.js` with a cleaner upstream extractor; settle the divided-road
and median representation once; wire selection-based aerial reveal
(click a centerline → aerial visible behind tool controls for that
street) so the operator can align Measure handles to real curb edges.

### Foundational decisions locked this session

Do NOT re-derive these. Memory files document each:

1. **Skeleton-first pipeline** (`project_skeleton_architecture.md`).
   `cartograph/skeleton.js` emits one clean chain per carriageway from
   OSM. `derive.js` consumes skeleton, not raw OSM ways.
2. **Positive-carriageway model**
   (`project_positive_carriageway_model.md`). Divided roads stay as TWO
   separate centerlines. No pair synthesis, no median couplers, no
   collapse to a single spine. The median is an EMERGENT polygon
   between the two carriageways' inner edges, derived at build time,
   never hand-authored.
3. **Couplers are segment-local** (`feedback_couplers_are_segment_local.md`).
   Medians / jogs / bulges live in couplers on a single carriageway.
   They are NOT a cross-section band and NOT a street-wide property.
4. **Corridor = same-name chains walked by endpoint topology**
   (`project_cartograph_pipeline_shape.md`). Emitted in `ribbons.json`
   as `corridors[]` with ordered `phases` (`single` / `divided`) and
   `transitions` (pinch points where phase kind changes). Click any
   chain → whole corridor is selected.

### Pipeline state (working)

- `cartograph/skeleton.js` → `data/clean/skeleton.json`
- `cartograph/derive.js` (reads skeleton) → `data/clean/map.json` with
  `layers.ribbons` containing `streets`, `intersections`, `faces`,
  `alleys`, `paths`, `medians` (new), `corridors` (new).
- Face fills now clipped to stop at the ribbon outer edge (MIN of
  left/right outer widths per street) so they don't bleed under road
  ribbons — critical for letting aerial show under translucent ribbons.
- Pipeline re-run copies `layers.ribbons` to `src/data/ribbons.json`.

### Runtime state (mostly working; three bugs below)

- Store loads skeleton, merges measure/caps from legacy centerlines.json
  by name, builds `corridorByIdx: Map<streetIdx, Set<streetIdx>>`.
- Corridor-level selection: clicking any chain highlights the whole
  corridor (yellow centerline in Survey).
- StreetRibbons deleted `resolveStreetSources` and friends; skeleton
  is the sole geometry source.
- `medians[]` rendered as green parkGrass polygons.
- Survey/Measure ribbon translucency as before; **selected corridor
  is routed into a parallel `groupsSelected` mesh bucket and rendered
  with extra transparency** so aerial shows through it for alignment.
- Fills toggle hides block land-use globally (Fills OFF = aerial visible).

### Open bugs to finish the selection-based aerial reveal

Three related bugs, probably one root cause. All introduced by the
selected-vs-unselected split I added to the mesh-buildup in
`StreetRibbons.jsx`. **The feature itself is required — the operator
needs aerial visible under the selected street to align Measure
handles to real curb edges.** Don't revert; finish the wiring.

- **E.A.1 Park Avenue street fill not rendering in any mode.**
  Centerlines and handles display fine in Survey/Measure/Designer,
  but no ribbon bands. Data in `ribbons.json` is clean (4 chains,
  valid measures). Suspect the `groups` vs `groupsSelected` split
  is mis-routing Park Ave's geometry — possibly when `selectedCorridorNames`
  is populated at initial render, Park Ave's chains get routed into
  `groupsSelected` and never make it out.
- **E.A.2 Measure handle drags don't visibly update ribbons.**
  Measure's handle drag mutates `st.measure` and reassigns
  `centerlineData.streets` (new array ref), so the `meshes` useMemo
  should re-run. But **`selectedCorridorNames` is NOT listed in
  `meshes`' deps array** — so when selection changes, cached mesh
  geometry with stale `m.selected` flags is returned. Add the dep
  AND verify handle drags invalidate correctly.
- **E.A.3 Corner plug regime disrupted near selected corridors.**
  Corner-plug geometry (around line 765 in `StreetRibbons.jsx`)
  pushes directly into `groups['corner_sw'|'corner_curb'|'corner_asph']`
  — it was not updated to use the `activeGroups` reference. Corner
  plugs always land in the opaque `groups` bucket, never `groupsSelected`.
  Visible as corner-plug/band mismatch on selection. Route corner
  plugs through `activeGroups` too.

Likely one pass through `StreetRibbons.jsx` to:
1. Add `selectedCorridorNames` to every useMemo dep list that reads it.
2. Route corner-plug pushes through `activeGroups`.
3. Verify the silhouette split (already separated into `silhouette` +
   `silhouette-selected`) keeps `selectedCorridorNames` as a dep.
4. Trace Park Ave end-to-end: skeleton → ribbonStreets →
   `meshes.map` render. Log `m.selected` for Park Ave to confirm
   routing is correct.

### If any of those aren't enough

Fallback: instead of splitting the mesh buildup, use **three.js
stencil buffer**. Render the selected corridor's ribbon silhouette
to the stencil pass (colorWrite=false, stencilWrite=true). Then
face fills and non-selected ribbon bands render with stencilFunc
set to reject pixels where the selected silhouette already wrote.
Pure render-time masking, doesn't touch geometry buildup, one place
to guard.

### Files changed this session (not exhaustive)

- `cartograph/skeleton.js` — new file
- `cartograph/derive.js` — consumes skeleton; medians, corridors,
  face fill clip
- `cartograph/serve.js` — `/skeleton` endpoint
- `cartograph/NOTES.md` — this entry
- `cartograph/BACKLOG.md` — corresponding entry
- `src/components/StreetRibbons.jsx` — deleted heuristic layer;
  added median render + selection-based split (current bug source)
- `src/cartograph/SurveyorOverlay.jsx` — rewrite/shrink
- `src/cartograph/SurveyorPanel.jsx` — rewrite/shrink
- `src/cartograph/CartographApp.jsx` — corridor selection wiring
- `src/cartograph/api.js` — `fetchSkeleton` added, `saveCenterlines`
  removed
- `src/cartograph/stores/useCartographStore.js` — major prune +
  `corridorByIdx`
- `src/cartograph/NodeContextMenu.jsx` — deleted

### Memories added / updated this session

In `~/.claude/projects/-Users-jacobhenderson-Desktop-lafayette-square/memory/`:

- `project_skeleton_architecture.md` — updated (SHIPPED)
- `project_positive_carriageway_model.md` — NEW (foundational decision)
- `project_cartograph_pipeline_shape.md` — NEW (full pipeline shape +
  "Frequent re-derivations to avoid" checklist)
- `feedback_couplers_are_segment_local.md` — NEW (don't re-derive
  median-as-band)
- `MEMORY.md` — index updated

Read these before proposing architectural changes.

---

## 2026-04-23 — state of the Survey/Measure tools

See BACKLOG.md "2026-04-22 → 2026-04-23 session" entry for the full punch
list. Short version for an operator picking this up fresh:

1. **The pipeline's OSM-way stitching produces tangled loop chains for
   divided roads.** Park Avenue east of 18th, Truman Parkway, Chouteau
   east section, Lafayette, Russell, S. 12th, S. 14th, Gravois. Visible
   symptom: bowtie/chevron at intersections in Survey; parallel
   "two streets stacked" in Design; sometimes missing ribbons in one mode.
2. **The correct model is one centerline per street + `median` as a
   band** in the cross-section. Authored centerline runs down the ROW
   spine (not a lane); median insert coupler carves a center slice
   filled with the `median` band material. Supported end-to-end in code.
3. **centerlines.json data quality needs an operator pass.** Orphans,
   stubs, duplicates, closed-loop errors. Until the data is clean,
   rendering rules are heuristic (authored-vs-pipeline ratio). Once
   every in-neighborhood street has one clean spine centerline, the
   heuristics collapse and everything becomes a one-liner.
4. **Tonight's unresolved issues** (see BACKLOG E.1–E.12) — aerial
   photo visibility under streets in tool+Fills-ON mode, selection-
   driven translucency, dead-end cap previews for all dead-ends,
   right-side pan dead zone, Measure selectability regression, corner
   plugs on authored streets, median coupler inspector UI.

---

## 2026-04-22 additions — read first

### Survey vs. Measure division of labor (finalized)

- **Survey** owns longitudinal structure: centerline shape, nodes,
  couplers (split + insert), caps, terminal, jog/median inserts.
  Renders as translucent blue silhouette envelope + royal-blue
  centerline spine + property-line outline. Internal stripes are
  suppressed — authoring here answers "where does the street *go*."
- **Measure** owns cross-section: pavementHW / curb / treelawn /
  sidewalk per side, per coupler-segment. Renders as per-stripe
  translucent fills with per-material edge strokes. The **color story**.
  Authoring here answers "what's the street *made of* at this point."
- Both write to `centerlines.json`; Designer ribbon + Stage shots read
  the same live source. No parallel state.
- "Fills" toggle unchanged — the tool's subject matter (street-ways +
  paths) is what the tool swaps; Fills governs everything else.

### Insert-coupler data model

Couplers in `centerlines.streets[i].couplers` are a mixed array of
numbers (legacy split couplers — `{kind:'split', pointIdx:n}` normalized)
and objects. New insert form:

```js
{
  kind: 'insert',        // vs. 'split'
  feature: 'median',     // future: 'jog', 'bulge', 'slip'
  pointIdx: 42,          // anchor node (center of hold zone)
  taperIn: 5,            // meters — entry fairing
  hold: 40,              // meters — full-width span
  taperOut: 5,           // meters — exit fairing
  medianHW: 3,           // half-width of the insert
}
```

One coupler carries the whole "rock in the river" insert — taper-in /
hold / taper-out as a composed object, not four loose keyframes the
operator has to coordinate. `resolveInserts(street)` walks arc-length
and returns per-point `{medianHW, lateralOffset}` with cosine-eased
fairings. Extends to jogs (modifies `lateralOffset`) and slip lanes
without adding primitives. See `streetProfiles.js` for
`normalizeCoupler`, `arcLengthsAt`, `resolveInserts`.

`segmentRangesForCouplers` now filters to `kind:'split'` only — insert
couplers don't segment the street, they modify the cross-section
smoothly along it.

### Silhouette renderer (Survey-only)

`StreetRibbons.jsx` gained a `silhouetteMeshes` useMemo that iterates
**live centerlines** (not `ribbons.streets` — pipeline-segmented output
fragments long streets and produces overlapping stripe-stacked
visuals). One translucent blue envelope per centerline via
`halfRingVarRaw(pts, innerArr, outerArr, perps, side)` with per-point
radii from `resolveInserts`. Survey replaces the per-stripe `meshes`
path wholesale; Measure keeps its own per-stripe rendering unchanged.

### Segment direction alignment (pipeline fix)

Long two-way streets had inconsistent point ordering across their
ribbon segments — OSM's way-ordering is a drawing convention for
two-way roads, not a directional one. `measure.left` / `measure.right`
in `centerlines.json` is authored in the centerline's direction; so
when a ribbon segment is reversed vs the centerline, `measure.left`
draws on physical-right. The runtime guard in StreetRibbons swapped
sides to compensate for rendering, but asymmetric Measure drags hit
the swap at different points along a multi-segment street (like Park
Avenue at 1140m, 3 segments), producing "both sides grew" bugs.

Fixed at the pipeline (`derive.js`): each chain emitted by
`chainAllSegments` is tested against the authored centerline's
direction over the span the chain covers (local tangent, not global),
and reversed if it disagrees. Result: 0/122 direction-mismatched
ribbon segments (was 37/122). Affected streets: Park, Rutger,
Lafayette, Lasalle, Geyer, Jefferson, Truman Parkway, Chouteau, and
~17 others — overwhelmingly two-way.

**Deleted the runtime orientation guards** in `StreetRibbons`'
`meshes` + `edgeStrokes` useMemos. Consistency is now an invariant of
`ribbons.json`, not something the renderer patches over.

### Measure stripe-stroke reduction

Per-stripe strokes now emit at the pavement edge (asphalt outer =
curb inner) and property line (outermost ring) only. Intermediate
curb-outer and treelawn-outer strokes dropped — 10 parallel strokes
on a boulevard became 5. Survey mode unchanged (already outer-only).

### What's next

- **D.1 Survey UI for insert couplers.** Right-click node → Split /
  Median insert / Jog insert. Inspector for taperIn/hold/taperOut/
  medianHW with live silhouette feedback. Data model + renderer ready.
- **D.2 Chevron reads as dead-end.** Park Ave × 18th: pipeline still
  terminates Park Ave's segments at the chevron. Probably resolves when
  the chevron is authored as a median+jog insert in Survey rather than
  split at that node.
- **D.3 Jog inserts.** Same coupler shape, modifies `lateralOffset`.
  Handles chevron jogs directly without a new primitive.

---

## 2026-04-21 additions — read first

### Alley clipping: match ribbon geometry or lose

If you change how `StreetRibbons` computes the outer edge of a street, you
MUST mirror it in `derive.js [7/8] Processing alleys...`. They share one
formula — `streetProfiles.getHalfWidth()` line 229:

```
pavementHW + (terminal !== 'none' ? CURB_WIDTH : 0) + treelawn + sidewalk
```

Any drift between ribbon outer-edge and alley-clip ROW re-creates the
pointy-alley artifact that this session spent hours tracking down. Symptoms:

- **Alleys poke through the sidewalk into the street** → ROW too small
  (forgot curb, forgot to pass survey into `defaultMeasure`, or divided by 2).
- **Alleys terminate as black knife-shaped wedges** → clip polygon turns a
  corner inside the alley buffer because ROW is both too small AND uneven
  around the junction.

`derive.js` imports `CURB_WIDTH` from `streetProfiles.js` — don't duplicate
the constant. `defaultMeasure` takes `(type, survey)` — always pass
`correctedSurvey[name]` so fallback streets pick up their measured
pavement/sidewalk offsets.

### No divide-by-2 for divided streets in alley clipping

`render.js` halves `pavementHalfWidth` for divided streets because the
OSM centerline for a divided street represents the whole ROW and each
direction gets its own ribbon. **Do not replicate that halving in the
alley clip.** The alley-clip ROW buffer must reach the outer back-of-
sidewalk regardless of whether the centerline is whole-pavement or
half-pavement. Fixed Park, Lafayette, Chouteau, Jefferson terminals.

### Flat caps (`EndType.etOpenButt`), not rounded

Previous iteration used `etOpenRound` which bulged alley ends past the
clipped polyline endpoint, undoing the trim. Use `etOpenButt` so the cap
terminates exactly at the trim point. The rounded-cap aesthetic is wrong
here anyway — alleys butt into curb/sidewalk, they don't round off.

### Clipping polylines, not polygons

The alley trim is an **open-path** difference: `Clipper.AddPath(linePath,
ptSubject, /*closed=*/false)`, output via `PolyTree +
Clipper.OpenPathsFromPolyTree(tree)`. Buffering happens AFTER the trim.
Do not try to buffer first and then subtract polygons — that re-creates
the pointy-corner wedges. Trim the centerline, then inflate.

### Task #9 still open

"One of these is fixed" confirmed after iter 15, but the full neighborhood
hasn't been swept. Streets with no survey `pavementHalfWidth` at all
still hit `TYPE_PAVEMENT_HW` defaults — those fallback values may under-
estimate arterials that never got surveyed.

---

## 2026-04-20 additions — read first

### Marker FAB → bottom-right of canvas (clear of Panel)

The Marker tool's FAB lives at `right: calc(340px + 14px); bottom: 14px;`
— the canvas's lower-right corner, just left of the 340px Panel. The main
pencil button sits at the bottom of the column; eraser/undo/clear minis
cascade *above* it when marker is active. Update the `340px` if Panel
width ever changes.

### Toolbar: four orthogonal axes, redesigned

Toolbar is now a row of segmented pill controls plus two single-button
toggles. Tool / shot / scene / Fills are truly orthogonal — pick any
combination, the scene composes coherently. CSS tokens live in
`cartograph.css` under the `.cartograph` scope (`--toolbar-*`).

```
Designer:  [Survey · Measure]  [Fills]  [Browse · Hero · Street]  [Toy]
In a shot: [← Designer]  [Publish]  [Browse · Hero · Street]  [Toy]
```

- **Fills** is a single binary toggle (no longer paired with Aerial — that
  was redundant; aerial is always on, and Fills off naturally exposes it).
- **Toy** is a single binary toggle replacing the old Neighborhood/Toy
  segmented pair.

### Fills: per-tool orientation toggle (revised 2026-04-22)

**Fills ON** (default): full digital map, every layer at full opacity.
Per-layer toggles in the Designer panel control individual layers granularly.

**Fills OFF**, behavior depends on active tool:
- **Design (tool = null)**: hide the calculated map entirely — aerial photo
  only. Design is the color/material picker; Fills-off lets the operator see
  what they're coloring over.
- **Survey / Measure**: hide everything except aerial + the tool's
  translucent roadways (Survey silhouette / Measure stripes) + centerline
  affordances. The roadways are the edit surface and must stay visible.

Per-layer state is preserved underneath — Fills back ON returns to whatever
per-layer state existed. The Fills hide-list is in `CartographApp.jsx` as
`decorationsHidden`; Design-mode additional hide-list gates the roadway
composites too.

Supersedes the 2026-04-20 "same gesture same effect regardless of tool"
rule. The earlier uniformity collapsed Design's job (pick colors, see the
underlayer) into Survey/Measure's job (edit roadways); different tools want
different answers.

### Translucency belongs to ribbons (not the rest)

Survey ribbons render translucent blue (#2250E8, opacity 0.28). Measure
ribbons render translucent per-stripe (opacity 0.45) with handles + edge
strokes on top. Face fills, buildings, paths — **opaque** in every tool.

The aerial-through-ribbon affordance is the tool's edit surface; everything
else stays clean. Earlier experiment with translucent face fills was
reverted (too much visual noise at once).

### Pipeline: paths/alleys clipped to curb

`derive.js` now computes `pavementWithCurb = clippedStreets ⊕ CURB_WIDTH`
and runs every footway / cycleway / steps / path / alley through
`clipFeaturesOutsideCurb` before emission. Paths terminate at the curb,
never punching into asphalt at intersections. One foolproof rule —
no per-endpoint tuning needed.

Z-fight fix: MapLayers' path-family meshes (alley, footway, stripes, edge
lines, bike lanes) lifted by `+0.06m` so they clear StreetRibbons face fills
(group y=0.15 in shot mode) under terrain displacement.

### Toy scene fixture

`src/toy/` is a permanent shader/shadow R&D fixture, accessed via the Toy
toolbar toggle. One 4-way intersection at origin, 4 quadrant blocks, 12
houses (1878-1930 era → mansard / hip / flat roof variation + foundation
pedestals via the *real* `Building` and `Foundations` components), 8 trees
(real `ParkTrees`), 8 lamps (real `StreetLights`).

Imports shared components, exports nothing. To stand up another fixture,
copy `src/toy/` and change the data files in `src/data/toy/`.

Hill terrain attempted then flattened — the global `terrainShader` is
wired to the neighborhood elevation map and isn't trivially swappable.
See task #9 (backlog) for the proper integration.

### No destructive operations

The old `splitAtNode` (turned one centerline into two separate entries
with no rejoin) is gone. Replaced by **opt-in split couplers** —
non-destructive markers on existing centerline nodes, fully reversible
by toggling the same marker off.

**Right-click any interior node in Survey** → toggles a split coupler.
Coupled nodes render as paired semicircles oriented along the street
tangent (the "extension cord" affordance). Stored as
`centerlines.streets[i].couplers: [pointIdx]`.

Phase 1A (UI + data) is shipped. Phase 1B (per-segment measure storage,
per-segment reset, pipeline split at coupler nodes) is queued — helpers
`segmentRangesForCouplers` and `measureForSegment` already exist in
`streetProfiles.js`, store actions `toggleCoupler` and `resetSegment`
already exist.

If you find legacy splits (e.g. `Lafayette Avenue` as `-a` / `-b`
entries), run `node cartograph/rejoin-splits.js` — it merges adjacent
same-name centerlines whose endpoints touch within 0.5m. Dry-run with
`--dry-run`. Backs up the file before writing.

### Measure tool fixes

- **Asymmetric drag bug:** the pipeline reverses some ribbon segments
  relative to centerline orientation, so `live.measure.left` would render
  on the visually-right side. New orientation guard in StreetRibbons'
  merge step swaps `left ↔ right` when ribbon tangent disagrees with
  centerline tangent (dot product < 0). Diagnostics gated on
  `window.__measureDebug` if anything regresses.
- **Double-click to insert** now works (empty pointerdown was
  deselecting the street before dblclick could fire).
- **Min stripe width 1.0m** enforced in `applyDrag` so handles can't
  visually collapse onto each other. Right/Ctrl-click is the explicit
  "zero this stripe" gesture.
- **Handles stagger along the street** when `r` values are within
  `HANDLE_LONG + 0.5m` — keeps each independently clickable on tight
  cross-sections (e.g. Park Avenue south-side with 8cm treelawn).

### Stage convergence path locked

After audit: the runtime (lafayette-square.com) is **not** a separate
build target waiting for replacement. It already shares 90% of Stage's
components. The remaining work for "publish" is:

1. Define `public/stage-config.json` schema (arch, SHOTS, palette,
   env defaults).
2. De-fork `StageSky` ↔ `CelestialBodies` (~1150 lines) and `StageArch`
   ↔ `GatewayArch` with a `source: 'runtime' | 'authored'` prop.
3. Wire cartograph "Publish" button to write `stage-config.json`.
4. Delete `VectorStreets` (CSS3D SVG hack); runtime sky goes opaque
   (matching StageSky variant).

Estimated 3-4 focused days. The cartograph map polish is the long pole;
runtime flip is a short tail.

---

## 2026-04-19 additions — read first

### Measure / Survey tool refactor (the big one)

The old 8-band system (`_bands: [{material, width}]`) is gone. Replaced with a
focused per-side model that matches physical reality and the operator's mental
model:

```js
// Per street in centerlines.json (and ribbons.json output):
measure: {
  left:  { pavementHW, treelawn, sidewalk, terminal: 'sidewalk' | 'lawn' | 'none' },
  right: { ...same fields... },
  symmetric: true
}
```

**Hardwired stripe sequence** (from centerline outward, positions imply material):
`asphalt (pavementHW) → curb (fixed CURB_WIDTH) → [treelawn] → [sidewalk | lawn]`

No per-stripe pulldowns — the material of each stripe is determined by its
position in the sequence. Curb is constant-width, not editable. When `terminal`
is `'none'` the side stops at curb (alleys, footways).

**Why this shape:** Previous 8-material system was too much UI for too little
signal. Parking is a separate overlay layer now. Per-side asymmetry is essential
for park-edge streets. `terminal` lets the operator pick one of three real-world
cases (sidewalk / lawn-only / nothing) with one control. See
`src/cartograph/streetProfiles.js` for the helpers (`defaultMeasure`,
`sideToStripes`, `refEdges`).

**Corner plug rules** (see `project_corner_plug_rules.md` memory):
- Every corner has a plug; it's the universal rounding primitive.
- Shape: proven bezier, sized to the NARROWER sidewalk of the two meeting legs.
- Wider sidewalks / treelawns / retail plazas on the other leg BUTT against the
  plug — they do not expand it.
- corner_sw is emitted only when at least one leg has sidewalk; curb + asphalt
  corners emit always.

### Measure tool UX (the new authoring loop)

- **Royal blue centerlines** (architectural color `#2250E8`, 0.7m thick ribbons
  via `polylineRibbon` in `src/cartograph/overlayGeom.js`) in both Measure and
  Survey modes.
- Click a centerline to select. Handles **anchor at the click point** (not the
  midpoint) — store `selectedMeasurePoint` on the store, compute per-click
  tangent frame via `frameAtPoint`.
- Handles are **rectangular pills** (5m × 1.2m, white fill + black outline)
  oriented along the street direction. One handle per real stripe boundary per
  side: `pavementHW`, `treelawnOuter` (only when treelawn > 0), `propertyLine`.
  Curb has no handle (fixed width is inferred).
- **Drag** a handle to resize its boundary. In symmetric mode (default) the
  drag mirrors to the other side. `measure.symmetric: false` unlocks sides.
- **Right / Ctrl-click** a handle to remove that boundary (collapse the stripe).
- **Double-click** anywhere in the sidewalk zone to insert a treelawn/sidewalk
  split. If a side has `terminal: 'none'`, double-click reseeds the pedestrian
  zone at that radius.
- Map rendering when `measureActive`: ribbons render translucent (opacity 0.45)
  with opaque per-material strokes at every stripe's outer boundary. Aerial
  shows through fills; boundaries stay crisp.
- Map rendering when `surveyActive`: ribbons render uniform blue tint
  (#2250E8, opacity 0.28) with slim blue stroke at the outermost (property
  line) boundary only. Per-stripe materials are suppressed.
- Panel has an **Asymmetrical** checkbox that toggles `measure.symmetric`. Each
  side shows its own terminal dropdown + read-only stripe widths.

### Pipeline: survey-aware per-side defaults

`defaultSideMeasure(type, survey, sideKey)` in `streetProfiles.js` now uses
`survey.sidewalkLeft` / `sidewalkRight` per side:
- If present for a sidewalk-eligible street → terminal=`sidewalk`, treelawn
  width computed from the gap between curb-outer and `swDist − SV_SIDEWALK/2`.
- If present on the OTHER side only (asymmetric, park-edge case) → this side
  gets `terminal: 'lawn'` with a modest grass strip.
- If absent on both sides → fallback residential treelawn + sidewalk default.

19 streets came out asymmetric in the current data (park-edges: Park Place,
Park Avenue, Gravois, Soulard, West 18th, Kennett, Singleton, Henrietta,
Waverly, Dillon, Preston, St. Vincent Court, etc.).

Symmetric flag is auto-set: `measure.symmetric = (L.terminal == R.terminal
&& L.treelawn ≈ R.treelawn && L.sidewalk ≈ R.sidewalk)`. Park-edge streets
start asymmetric.

### Stage-view fixes (terrain + markings + alleys)

- **Lamps + glow + pool + base** (4 instanced meshes in `StreetLights.jsx`)
  now terrain-displaced. Added `patchTerrainInstanced` + `UNIFORMS` export in
  `src/utils/terrainShader.js`. The shader samples terrain at each instance's
  world origin (`modelMatrix * instanceMatrix * (0,0,0)`) and lifts all
  vertices of that instance uniformly. No more lamps underground.
- **Street markings** (centerStripe / parkingLine / bikeLane) rebuilt as
  thin quad-strip ribbons (`stripeRibbonGeo` in `MapLayers.jsx`) with
  `makeFlatMat` so they pick up terrain displacement. Previously they were
  `THREE.Line` at fixed y=0.2 — buried under lifted terrain in shots.
- **Alley z-fighting** fixed by reducing `makeFlatMat` polygonOffset from
  `factor=-pri*4, units=-pri*50` to `factor=-pri, units=-pri*4` (matches
  StreetRibbons). Old values were so aggressive they caused precision
  collisions once terrain displaced everything simultaneously.

### Grass shaders wired for residential + treelawn + lawn

- **Residential faces** get a separate `residentialGrass` material
  (`makeGrassMaterial({ color: luColors.residential })`) in shots; same noise
  shader as park, slightly brighter green. Falls back to flat color in Designer.
- **Park grass** already wired; now also `patchTerrain({ perVertex: true })`
  so it displaces with terrain.
- **Treelawn ribbons** use `residentialGrass.material` in shots so the strip
  flows seamlessly into the adjacent block's grass.
- **Lawn ribbons** (park-edge `terminal: 'lawn'`) use `parkGrass.material` in
  shots so the strip reads as an extension of the park lawn.
- Designer keeps flat band colors for plan-view legibility.

### Park data coordinate systems — RECURRING CONFUSER

The data files in `src/data/park_*.json` use different frames. Getting this
wrong produces rotated/misplaced water, trees, or paths.

- `park_trees.json` — **park-local, axis-aligned**. Raw x, z within ±175m
  (matching the `PARK` constants). Must be rotated by `PARK_GRID_ROTATION`
  (-9.2°) to land correctly in world, because the real Lafayette Park is
  tilted 9° from world axes (the street grid is).
- `park_water.json` — **park-local, axis-aligned** (same frame as trees).
  Lake outer / island / grotto polygons are in the park's own frame. Must
  also be rotated by `PARK_GRID_ROTATION`.
- `park_paths.json` — **world-aligned**. Counter-rotates with `-GRID_ROTATION`
  inside LafayettePark to cancel the parent wrapper.

Because LafayettePark wraps its contents in `<group rotation={[0,
GRID_ROTATION, 0]}>`, park-local data (trees, water) needs NO extra rotation
inside LafayettePark, while world-aligned data (paths) counter-rotates.

MapLayers is flat and has no parent rotation, so park-local data needs a
`PARK_GRID_ROTATION` wrapper there to look the same.

**The park face in `ribbons.json`** is already rotated in world (vertex
coords encode the 9° tilt). That's the authority for park boundary — when in
doubt, match what the park face looks like in Designer (which renders the
ribbons face directly).

---

## 2026-04-17 additions — read first

### The big architectural move: Stage is embedded in Cartograph

Previously cartograph had **two Canvases** — a flat ortho one for the
Designer and a perspective one for Stage mode — switched by unmounting one
and mounting the other. This caused a persistent **WebGL context-loss skew
bug**: every time you flipped Designer ↔ Stage, the browser threw away one
GL context and created another, and on return the view-projection matrix
uniforms came back corrupted, producing a "parallelogram" tilt that only a
hard refresh + cache purge could fix. It was the most-reported visual bug
against the cartograph for weeks.

The fix was architectural, not a polish pass: **collapse to a single
Canvas** with two cameras (`OrthographicCamera` for Designer via the
`<Canvas orthographic>` default; `<PerspectiveCamera makeDefault={!inDesigner}>`
for shots). Both cameras always mounted; `makeDefault` swaps which one is
active. `MapControls` is keyed on `inDesigner ? 'ortho' : 'persp'` so it
remounts cleanly when the active camera changes. **No more context loss, no
more skew.**

### Tool vs. Shot: two orthogonal axes

The old `mode` field conflated authoring intent (marker / surveyor / measure
/ stage) with camera intent. These are different concerns. Replaced with:

- **`tool: null | 'surveyor' | 'measure'`** — the authoring tool in use.
  `null` is the default **Design** state (no tool selected). No `'design'`
  enum value; absence is the meaning. Marker is controlled separately via
  `markerActive` because it layers over any tool.
- **`shot: 'designer' | 'browse' | 'hero' | 'street'`** — which camera +
  environment preset is active. `'designer'` = the authoring workspace
  (ortho plan view, aerial tiles, overlays). `'browse'` / `'hero'` /
  `'street'` are the three Stage camera shots authored in `SHOTS` (in
  `src/stage/StageApp.jsx`).

**Toolbar morphs on `shot`:**
- Designer shot → `Marker | Surveyor | Measure` + shot selector
- Any other shot → `← Return to Designer | Publish` + shot selector

Shot selector (`Browse | Hero | Street`) is always visible on the right
side of the toolbar. `Publish` is a stub right now (logs a line) — wire
it up when we're ready to publish.

### Environment pipeline wired into Cartograph

The Stage environment stack now runs inside Cartograph's unified Canvas
whenever a non-Designer shot is active:

- `<StageShadows />` (SoftShadows helper) — gated `{!inDesigner}`
- `<PostProcessing />` (EffectComposer with AO, Bloom, AerialPerspective,
  FilmGrade, FilmGrain) — gated `{!inDesigner}`
- `TimeTicker` + `SkyStateTicker` — always running; ticker callbacks are
  side-effect-only and cheap enough
- `CelestialBodies` + `CloudDome` — wrapped in `<group visible={!inDesigner}>`

All exported from `src/stage/StageApp.jsx`. `StageCanvas.jsx` is deleted —
its entire contents now live inside `CartographApp.jsx` via the shot-only
group.

**Consequence: the Environment panel's sliders in Stage mode now drive live
rendering.** Previously they wrote to `envState` but nothing in cartograph
read that, so they were cosmetic. Now every slider (Exposure, AO, Bloom,
Aerial Haze, Film Grade, Film Grain, Shadows) updates the composer per
frame through refs.

### Arch & Horizon controls + swappable ground disc

Added `archState` to `src/stage/StageApp.jsx` alongside `envState`, exposed
as `setArch` / `useArchState`. Defaults in `ARCH_DEFAULTS`: distance (from
origin along a fixed bearing), scale, rotation, Y offset, and horizon
disc radius + fade band.

`GatewayArch` reads these every frame — no hardcoded constants. A new
`GroundDisc` sibling component renders a soft-edged round plane beneath
the arch, fading from opaque to transparent between `horizonFadeInner` and
`horizonFadeOuter`, colored by the live sky `horizonColor`. Simulates the
horizon so the arch reads as "heroic on the ground" from the shot camera.

`StagePanel` gets a new **Arch & Horizon** collapsible section with sliders
for every archState field. `DesignerArch` (exported from `StageArch.jsx`)
renders a flat-black catenary silhouette in the Designer — the arch is a
plan-view feature of the map, not just a Stage thing.

**This is the first piece of the** `stage-config.json` **authority story**
(see `project_stage_is_scene_authority.md`) — Arch & Horizon values live
in a store that will eventually persist to disk and be consumed by the main
app's scene. For now it's in-memory only.

### Color pickers wired to rendering

The Designer panel's color pickers used to write to `layerColors` in the
store, but neither `MapLayers` nor `StreetRibbons` read that — they used
hardcoded constants (`C.*` in MapLayers, `BAND_COLORS` in streetProfiles).
**All pickers were cosmetic.**

Now:

- `src/cartograph/m3Colors.js` is the single source of truth for defaults.
  It exports `DEFAULT_LAYER_COLORS` (per panel layer id),
  `DEFAULT_LU_COLORS` (per land-use), and `BAND_TO_LAYER` (maps ribbon
  band materials like `'asphalt'` → panel picker ids like `'street'`).
- `MapLayers` subscribes to `store.layerColors` and resolves each material
  via `layerColors[id] || DEFAULT_LAYER_COLORS[id]`. Re-memos on change.
- `StreetRibbons` does the same for band colors, routed through
  `BAND_TO_LAYER` so a single "Streets" picker paints asphalt + parking
  bands, "Curb" paints curb + gutter, "Sidewalk" paints sidewalk + treelawn
  + lawn. Face-fill colors still use `luColors` from the Panel + LU
  defaults.

**Palette direction shifted** from "M3 muted neutrals" → "vibrant graphic
map" during the session. The muted palette was calibrated for flat
pass-through viewing (Designer) but crushed to near-black under ACES tone
mapping in shots. Bumped residential to grass-green (#5A8A3A), asphalt to
#4A4A48, sidewalks to warm cream (#B8B2A4). This is still placeholder —
we'll converge on final colors once the park/shader work lands.

**Pickers currently hidden**: `tree`, `lamp`, `labels`. Each needs its own
authoring section (light color + intensity for lamps, foliage material for
trees, typography + scale for labels) — not a color well. Tree/lamp are
mostly driven by `LafayettePark` / `StreetLights` internals right now;
labels have no renderer.

### Caps propagation bug fixed

**Symptom:** operator set `capStart`/`capEnd` in Survey mode, edit saved to
`centerlines.json`, but the ribbon map didn't update to show the cap.

**Root cause, two parts:**

1. `updateStreetField` in the store was mutating the street in place and
   calling `set({ centerlineData: { ...centerlineData } })` — the outer
   object identity changed but the `streets` array stayed the same
   reference. `StreetRibbons`' `useMemo([liveCenterlines])` therefore
   didn't re-run. Fix: rebuild the streets array in the setter.
2. The merge loop in `StreetRibbons` was blanket-applying
   `capEnds: { start, end }` to every ribbon segment matching the
   centerline's name. For chain-split streets (one centerline → multiple
   ribbon segments), this produced spurious caps at intersection joints.
   Fix: apply `capStart` only when the ribbon segment's first point
   matches the centerline's first point (within 0.5m); same for `capEnd`.

### Park architecture (the unfinished piece)

**Decision made today, work only partly executed.** The park should be a
ribbon-rendered surface like any other block. "Park" is the authored layer;
grass is its current material. Future material variants (snow, autumn,
drought, illuminated night) are Park-surface treatments, not separate
layers. The Park material is picked in Stage like any other surface.

**Current state (end of 2026-04-17):**

- `StreetRibbons` face fills now render every face including the park (the
  earlier filter that skipped `use: 'park'` is removed).
- `DesignerPark.jsx` exists but renders only paths + water (no boundary
  polygon). Path + water **placement is still wrong** — the coords in
  `park_paths.json` and `park_water.json` are in some park-local system;
  neither `rotation = GRID_ROTATION` nor `-GRID_ROTATION` aligns them to
  world, which implies they may already be world-aligned and my rotation
  added the offset. Empirically test with `rotation = 0` first.
- `LafayettePark` still renders its own SVG-backed grass plane in shots,
  which z-fights with the ribbon park face. This is expected during the
  transition.

**Tomorrow's work, in order:**

1. Place paths + water correctly (iterate rotation until they sit inside
   the ribbon park face).
2. Remove `LafayettePark`'s grass plane (its territory is the ribbon park
   face now).
3. Attach the noise-based grass shader (currently living in
   `LafayettePark`'s `ParkGround` component) to the ribbon park face's
   material **only in shots**. In Designer the face stays flat-colored.
4. Once LafayettePark's path/water rendering is what shots use, Designer
   can consume the same component. Then `DesignerPark` dies.

### Ribbon lighting pipeline details

- `SHADOW_TINTED_FLAT` is applied to ribbons in shots (not just Designer).
  Math: extract luminance ratio from PBR output, undo BRDF's 1/π division
  so palette tones land near their Designer values, clamp to `[0.25, 3.5]`
  so shadows don't go to void and bright-lit surfaces have headroom.
- `polygonOffset` on ribbons is `factor = -pri, units = -pri * 4` —
  negative pulls ribbons toward the camera in depth to beat terrain (which
  has zero offset), and `factor = -pri` preserves intra-ribbon priority
  (higher pri = more negative = more forward). Asphalt pri=8 beats
  terrain; sidewalk pri=5 sits behind corner plugs pri=10, etc.
- Ribbon group is lifted to `y = 0.15` in shot mode so it clears the
  terrain mesh (`y = -0.1` with uExag displacement on top). In Designer
  (terrain hidden) the lift is zero so MapLayers' footway polygons at
  `y = 0` aren't buried under ribbons.
- **Terrain mesh is hidden in shots** via `<group visible={false}>` but
  its shader uniforms stay live so ribbons and buildings still get the
  terrain displacement. Good for now; we may bring it back once the park
  is fully owned by ribbons.

### Known issues carried into tomorrow

- **Park paths + water mis-placed** (see Park architecture above)
- **No cast shadows on ribbons at any time of day** (including /stage).
  The shadow map renders, the ribbons have `receiveShadow: true`, the
  shader reads `reflectedLight.directDiffuse` (which includes shadow
  attenuation) — yet visible cast shadows don't appear on the street
  surfaces. Investigate: shadow-camera frustum coverage, bias/normalBias,
  or the SHADOW_TINTED_FLAT clamp swallowing the shadow delta.
- **Ribbons in shots look darker than expected for midday** — palette
  brightening helped significantly but the darker base colors (asphalt
  especially) still crunch through ACES + PostProcessing. This is at
  /stage parity now; diverging further would mean either further palette
  brightening or a graphic-map emissive treatment.
- **Designer sidewalks render too visibly** — the sidewalk tone
  (`#B8B2A4`) is correct for the plan view but shows as prominent white
  strips against dark asphalt. When LafayettePark eventually owns the park
  surface and we refine the palette, revisit.
- **Camera in shots can go underground** — I unlocked `minPolarAngle: 0,
  maxPolarAngle: π` so the operator can diagnose underside rendering.
  Leave unlocked; it's diagnostic-useful.

### Files touched today

- `src/cartograph/CartographApp.jsx` — unified Canvas + camera rig
- `src/cartograph/StageCanvas.jsx` — **deleted**
- `src/cartograph/stores/useCartographStore.js` — `tool` + `shot` replace `mode`
- `src/cartograph/Toolbar.jsx` — morph on shot, shot selector
- `src/cartograph/Panel.jsx` — reads tool, palette from `m3Colors.js`, hides unwired pickers
- `src/cartograph/m3Colors.js` — **new**. Canonical palette + band→layer mapping
- `src/cartograph/DesignerPark.jsx` — **new**. Paths + water (placement unfinished)
- `src/stage/StageApp.jsx` — adds `archState`, exports `StageShadows`/`PostProcessing`, adds `ArchHorizonControls`
- `src/stage/StageArch.jsx` — reads `archState`, adds `GroundDisc` + `DesignerArch`
- `src/stage/StageSky.jsx` — sky-dome ticker fix (confirmed; no change today)
- `src/components/StreetRibbons.jsx` — live `layerColors`, SHADOW_TINTED_FLAT π comp, polygon offset flip, no-face-filter for park, cap-match by terminal point

---

## 2026-04-16 additions — read first

**Dead-end caps are per-endpoint + operator-marked.** Each street in
`centerlines.json` has `capStart: 'round'|'blunt'|null` and `capEnd` set by the
operator in Survey mode (per-endpoint cap dropdown). The pipeline reads these
directly and emits `capEnds: {start, end}` on each ribbon street.
`StreetRibbons.jsx` renders them via `quarterCapRaw`. No auto-detection —
operator is authority. Supersedes the earlier auto-detection attempt which
produced too many false caps on divided-road inner endpoints.

**Divided one-ways remain a distinct class** (Truman Parkway, Benton Place,
Mackay Place loop streets, parts of Russell/Jefferson). The operator can now
correctly leave their inner-facing endpoints uncapped via Survey mode, so caps
are no longer blocked by them. Still want Phase 14 for median rendering and
plug handling.

**Manual measurement snapping.** On drag-release in Measure mode, band width
rounds to the nearest `SNAP_TARGETS` entry (5/6/8/10 ft for sidewalk, 7 or 8 ft
for parking, etc.). At typical map zoom 1 px ≈ 3 inches — sub-foot precision is
fiction. Survey-derived widths stay raw. Enables reliable template duplication.

**Measure caustic ruler (2026-04-16).** Clicking a centerline in Measure mode
draws a perpendicular **ruler** from centerline to property line at the street's
midpoint, colored per band with dots at each boundary. Operator clicks *on the
ruler* at a radius to **insert a new band boundary** — the band being split
keeps its material on both halves; the operator relabels via the panel
dropdown. Drag the dots to tune widths (snap-always). No along-street band
strips — those duplicated what `StreetRibbons` already shows.

**Default band stack is deliberately minimal.** Generic street =
`asphalt + curb`. Sidewalk-eligible (residential/secondary/primary) =
`asphalt + curb + sidewalk`. **No default parking or treelawn** — the operator
adds those via the ruler where reality shows them. This matches the "irregular
geometry" reality of the neighborhood (wide plaza sidewalks at retail,
missing sidewalks next to ramps, non-standard parking).

**Live centerlines → StreetRibbons.** `StreetRibbons.jsx` accepts a
`liveCenterlines` prop (the store's `centerlineData.streets`). For each street,
live `_bands` / `capStart` / `capEnd` override `ribbons.json`'s static values.
Measure / Survey edits show in the rendered map **instantly**, no pipeline
rebuild needed. Intersections and face fills stay static from the pipeline.

**Fills toggle = orientation mode.** Global toolbar button. Off = hide
StreetRibbons + MapLayers fills, keep line features (center stripes, edge
lines, bike lanes) + aerial visible. Operator uses this to visually align the
rendered map against the real aerial imagery.

**Glass-card styling.** Toolbar and each Panel section use the same glass
treatment as Stage (`.glass-panel` values from `src/index.css`, mirrored in
`.carto-glass` in `cartograph.css`): `rgba(0,0,0,0.25)` + blur(20px)
saturate(160%) + subtle border/shadow. Floating over the canvas so the map
shows through.

---

## 1. What the map is

A vector neighborhood map of Lafayette Square (St. Louis, MO) rendered as a Three.js
scene. The cartograph is the authoring tool — it shows the same 3D scene as the main
app but viewed from a flat, top-down orthographic camera. One renderer, two viewports.

The ground plane is built from **ribbon geometry**: each street is a set of
non-overlapping annular ring strips (asphalt, curb, treelawn, sidewalk) generated
from measured centerlines and cross-section profiles. Corner plugs merge sidewalks
at intersections using proven quadratic bezier curves. Block interiors are filled
with a single color per polygonized face based on dominant land-use classification.

**What renders:**
- **Streets** as ribbon rings (asphalt fill + curb edge, sidewalk/treelawn only where measured)
- **Land-use fills** (one color per block face: residential, commercial, park, etc.)
- **Buildings** (footprints positioned to assessor centroids)
- **Corner plugs** (sidewalk merge at intersections)

**Key constraint:** the system does NOT guess at sidewalks or treelawns. An unmeasured
street renders as pavement + curb only. Sidewalks appear only where the operator has
explicitly placed measurement bands. This prevents the map from showing inaccurate
geometry that the user would have to audit and undo.

The pipeline is intended to be reusable — it should not be Lafayette-Square-specific.
Avoid hardcoded coordinates, bespoke fixes, or one-off carve-outs unless truly
unavoidable. Generalizable always wins.

---

## 2. Data sources (inputs)

| File | Source | Contents |
|------|--------|----------|
| `cartograph/data/raw/centerlines.json` | Surveyor mode (seeded from block_shapes + OSM) | **PRIMARY**: 451 street centerlines with metadata (type, oneway, dead-end, loop, smooth). Each street has `_original` for revert. Editable in Surveyor mode. |
| `cartograph/data/raw/measurements.json` | Measure mode | Per-street cross-section overrides. Measurement bands define asymmetric left/right profiles. |
| `cartograph/data/raw/osm.json` | OpenStreetMap (one-time fetch) | All highway features, building footprints, landuse/leisure/amenity polygons. **Fallback** — centerlines.json takes priority. |
| `cartograph/data/raw/survey.json` | City Assessor + OSM sidewalk distance | Per-street `pavementHalfWidth`, lane count, oneway, cycleway. **Fallback** — measurements.json takes priority. |
| `cartograph/data/raw/elevation.json` | USGS National Map (cached) | Sparse elevation samples for building elevations and contour generation |
| `scripts/raw/stl_parcels.json` | St. Louis City Assessor (one-time fetch) | Parcel polygons with land_use_code, zoning, building_sqft, centroid, rings |
| `cartograph/data/neighborhood_boundary.json` | Hand-curated | Polygon defining what's "in the neighborhood" |
| `cartograph/data/clean/marker_strokes.json` | Marker mode | Freehand strokes for debugging — human → operator communication |
| `src/data/ribbons.json` | Pipeline output | Street ribbon geometry for Three.js rendering (streets, profiles, intersections, face fills) |

### CRITICAL: data file safety

These raw files are gitignored but **must never be re-fetched**. The 2026-04-05
incident: a `min_lon` change in `scripts/config.py` from `-90.2255` to `-90.2210`
caused a re-fetch that lost ~4 parcels and changed many parcel vertex positions
permanently. The original 2345 parcels are unrecoverable; we now have 2341 that are
slightly different.

- The correct `min_lon` is **`-90.2255`** (the true original value)
- `.gitignore` now tracks `stl_parcels.json`, `osm.json`, `survey.json`,
  `elevation.json`, `map.json`
- Before doing ANYTHING that re-fetches, back up the existing file first

---

## 3. Architectural principles

These are the load-bearing decisions behind the pipeline. Internalize before changing
the code.

### 3.1 Streets are the master grid
Streets (their measured centerlines + standard widths) define the quadrilateral grid
of the neighborhood. Block faces come from polygonizing the street network. Streets
are the AUTHORITY for "where blocks live."

### 3.2 Variable street/sidewalk gap is intentional
Lafayette Square is a historic neighborhood with non-standard, varied geometry. The
gap between street curb and sidewalk varies street-by-street and sometimes block-by-
block. We measure this from the actual data:
- `survey.json` provides per-street `rowWidth` and `pavementHalfWidth`. The difference
  `(rowWidth/2) − pavementHalfWidth` = the natural variable sidewalk + tree-lawn zone
  on each side
- OSM `footway=sidewalk` lines provide ground-truth confirmation of where sidewalks
  actually exist

### 3.3 Parcels do NOT define block shape
Parcels (assessor data) provide land-use classification and lot detail INSIDE blocks.
They are not the source of truth for block boundaries. The historical neighborhood has
multi-tenant lots, missing parcels, easements, and other irregularities that make
parcel unions an unreliable source for block geometry.

### 3.4 Buildings sit on blocks; they don't define them
Building footprints are decoration. A block exists because of the street grid, not
because there's a building there. Don't use building data to inform block shape.

### 3.5 Sidewalks confirm block existence (positive signal, not geometry)
OSM `footway=sidewalk` lines are inset from the actual block edge (drawn down the
centerline of the sidewalk concrete). They are NOT literal block edges. Use them as
a presence signal: "if there's a sidewalk in a region, that confirms there's a block
nearby." Use this as a fallback validation, not as geometry.

### 3.6 Visual smoothing belongs in the renderer, not the geometry pipeline
Clipper polygon operations should produce sharp-cornered polygons (`jtMiter` joins,
no arc tolerance bloat). All visual corner rounding happens in `render.js` via
`bezierPolyD()` (cubic Bézier corners). This keeps polygon vertex counts low and
gives clean, scale-independent visual output.

---

## 4. Procedure: how to build the map

### 4.1 Prerequisites (do once, then never re-run)
```bash
cd cartograph
node fetch.js              # one-time: fetch OSM data into data/raw/osm.json
node survey.js             # one-time: generate variance data into data/raw/survey.json
# stl_parcels.json should already exist in scripts/raw/ — DO NOT re-fetch
```

### 4.2 Build the map
```bash
cd cartograph
node pipeline.js --skip-elevation     # skips USGS fetch (uses cached elevation)
node render.js                        # generates SVG + preview HTML
open data/clean/preview.html          # view the result
```

### 4.3 Live preview with marker tool
```bash
cd cartograph
node serve.js                         # serves preview at http://localhost:3333
                                      # marker strokes auto-save to marker_strokes.json
                                      # /analyze endpoint reports parcels under strokes
```

The marker tool is the primary way for humans to communicate problem locations to
the operator. When the user says "look at the marker strokes," read
`data/clean/marker_strokes.json` and find which blocks/streets each stroke is near.

---

## 5. Pipeline stages (what happens inside `pipeline.js`)

```
[1] Load raw OSM      → data/raw/osm.json
[2] Snap coordinates  → snap.js (quantize to 0.01m grid)
[3] Derive layers     → derive.js
    [3a] Filter vehicular streets, alleys, sidewalks
    [3b] Polygonize street network → DCEL faces
    [3c] Classify faces (block / park / parking / island / fragment)
    [3d] Assign parcels to block faces
    [3e] Detect dead-end street endpoints
    [3f] Buffer streets → pavement polygons
    [3g] Build blocks per face (current: parcel-union with morph-close)
    [3h] Carve dead-end channels through blocks (Divide rule)
    [3i] Round corners, simplify
    [3j] Derive lot inset, sidewalk strip, alleys, contours
    [3k] Compute building footprints with assessor sizes
[4] Elevation         → USGS interpolation (cached)
[5] Write             → data/clean/map.json
```

`render.js` consumes `map.json` and produces `map.svg` + `preview.html`. It applies
neighborhood boundary filtering, bezier corner rendering, street labels, and the
marker tool UI.

### Key files
| File | Role |
|------|------|
| `pipeline.js` | Top-level orchestration |
| `node.js` | Snap streets to a planar graph (split at intersections) |
| `polygonize.js` | DCEL face extraction from the noded graph |
| `classify.js` | Tag faces as block / park / parking / island / fragment |
| `derive.js` | The big one — does block building, sidewalk derivation, lot inset, alleys, lamps, contours, and building enrichment |
| `render.js` | Convert `map.json` to SVG (bezier corners, layers, labels, preview HTML) |
| `serve.js` | Local dev server with marker tool persistence |
| `standards.js` | Constants for street widths, sidewalk widths, curb radii, etc. |

---

## 6. Block-building approach (current state)

For each polygonized face classified as `block`:

1. **`buildParcelBlock(faceParcels, faceRing)`** unions all parcels in the face using a
   morph-close (4m expand → union → 4m contract) at `jtRound` join with coarse
   `ARC_TOL`. Then `Clipper.CleanPolygon` at 3m removes footway-easement notches.

2. **Curve detection** — if the face has a long run of consecutive short edges (the
   densified S 18th Street arc), replace the parcel block with a face inset at
   `6.5 + sidewalkZone` so the block follows the curve.

3. **Loop-street cutting** — Benton Place and Mackay Place are CLOSED LOOPS. Their
   geometry is cut OUT of surrounding blocks so the sidewalk follows the loop curve.

4. **Dead-end Divide rule** — for each dead-end street endpoint inside a face, buffer
   the street segment by `halfWidth + sidewalk + 2m` and subtract from the block.
   This carves a road channel from the block at the dead end.

5. **roundCorners (jtMiter)** — apply two passes of shrink-expand at `jtMiter` joins
   for smooth structural corners (no arc vertex bloat).

6. **Sidewalk inset** — `shrinkPaths(block, sidewalkWidth)` produces the lot polygon.
   The block is the outer ring; the lot is the inner inset; the sidewalk strip is
   `block − lot`. Both render in `render.js` via `bezierPolyD` for smooth corners.

7. **Land use classification** — count parcels per `land_use_code`, dominant code
   determines the lot fill class (residential / commercial / vacant / etc).

### Files relevant to block building (line numbers approximate)
- `derive.js:1038` — vehicular street filter
- `derive.js:1100-1120` — densify S 18th curve, extend LaSalle
- `derive.js:1123` — `nodeEdges(streetPolylines)`
- `derive.js:1124` — `polygonize(nodedSegments)`
- `derive.js:1316` — assign parcels to block faces
- `derive.js:1438` — dead-end vertex detection (uses noded segments)
- `derive.js:1354` — `buildParcelBlock` function
- `derive.js:1413` — `buildFaceBlock` (face inset fallback)
- `derive.js:1533` — block building loop per face
- `derive.js:1668` — dead-end "Divide" treatment
- `derive.js:1763` — roundCorners + add to allBlockPaths
- `derive.js:1808` — loop street median creation
- `derive.js:1822` — sidewalk strip / lot inset

---

## 7. The work-in-progress problem — REFRAMED 2026-04-07

> The previous operator (§7 in earlier revisions) framed the WIP as "dead-end Place
> streets fail to split faces, leaving missing corner blocks." A long diagnostic
> session on 2026-04-07 disproved that framing for the markers actually on the map.
> Read this section in full before touching any code. It's the most important part
> of this document right now.

### 7.1 What the user actually circled

There are 6 marker strokes in `data/clean/marker_strokes.json` (as of 2026-04-07).
Their centers, the nearest named features, and what layer they fall into:

| # | Center (m)   | Size  | Nearest features              | In any layer? |
|---|--------------|-------|-------------------------------|---------------|
| 0 | (360, -196)  | 46×49 | Mississippi Alley, Rutger ~30m| **void**      |
| 1 | (517, -157)  | 46×27 | service+footway, Dolman ~30m  | **void**      |
| 2 | (288, -37)   | 43×24 | footway+service, Vail Pl ~26m | **void**      |
| 3 | (541,  45)   | 56×82 | service, Truman/Dolman ~33m   | **void**      |
| 4 | (-253,-282)  | 55×52 | 3 service ways, Park Ave ~44m | **void**      |
| 5 | (-217,-197)  | 39×31 | service+footway, Park Ave ~33m| **void**      |

Five of six are nearest to **alleys / service ways**, not to dead-end Place streets.
Only stroke 2 is even *near* a Place (Vail), and it's mid-frontage, not at the tip.
**These are mid-block voids, not corner-lot omissions.** §7 in the previous revision
was solving the wrong problem for these markers.

### 7.2 Diagnostic done, results

A diagnostic with **proper hole testing** (point-in-polygon must respect ring holes,
not just outer rings) confirmed: **all 6 stroke centers lie in pure void** — outside
every block, every pavement polygon, every alley feature. They sit in the geometric
gap between the parcel-union block edge and the street/alley pavement edge, with
gaps of **5–17 m** wide.

A false lead during the diagnostic: an early pass showed 5/6 strokes "inside the
pavement layer" with one giant 2679×2520 m pavement polygon containing 80 holes.
That suggested a street-buffer winding/orientation bug. **It was a mistake in the
diagnostic** — the test ignored hole rings. The pavement polygon has a huge bbox
because the connected vehicular street network (incl. I-44 ramps, Truman Pkwy,
Jefferson Ave) extends well past the visible neighborhood, but the *filled area*
is just thin ribbons with 80 block-shaped holes. **There is no pavement-layer bug.**
Don't go down this path again.

### 7.3 Mechanical cause of the voids

Blocks are built from `buildParcelBlock()` (`derive.js:1354`), which morph-closes
the assessor parcel union. Assessor parcels stop at the property line, not the
ROW edge. The property line is usually back-of-sidewalk, not curb. So the block's
perimeter sits 5–17 m inside the actual face boundary. The 4 m morph-close is too
small to bridge that, and there's nothing else trying to fill the space, so it
renders as void (sometimes pavement-shaped on the outside, but inside the block hole).

### 7.4 The deeper conceptual problem (USER-CONFIRMED 2026-04-07)

While debugging the above we worked out — through several dead ends — what's
*actually* wrong with the model. Quoting and synthesizing the user:

> "Alleys don't get sidewalks. My plan was that alleys render over the block and
> clip to the block or join to the street."

> "There are many places that are paved with concrete that aren't street or
> sidewalk. There are big lawns around the park. The stores that front onto Park
> Avenue by the park have sidewalks 3 or 4× the usual width."

> "The treelawn and sidewalk is attached to the blocks." (i.e., the gap between
> curb and the block edge is NOT a separate zone — it's part of the block.)

> "We worked pretty hard to formalize the streets; if everything is going to come
> from the streets do we need to go back to the streets for the final real cleanup?"

The reframe that came out of this conversation:

**The model has been trying to express THREE categories of ground using only TWO
layers (street + block). The missing third category is "infrastructural space" —
concrete that is neither street nor block-sidewalk:**

- The plaza-like sidewalks in front of the Park Avenue commercial strip
- The wide aprons and lawns around Lafayette Park
- Civic forecourts, ceremonial pavers, oversized sidewalks at notable buildings

Currently these get absorbed into whichever neighbor "wins" the geometry fight,
and none are right.

The cleaner mental model the user converged on:

```
STREET PAVEMENT  →  curb-to-curb fill, includes parking and bike lanes
                    halfwidth = pavementHalfWidth
   |
   curb  ← THE single primitive that defines the block edge
   |
BLOCK            →  everything inside the curb that's "land"
                    INCLUDES tree-lawn AND sidewalk strip on perimeter, plus
                    interior lots and buildings.
                    Block edge = the curb itself, NOT back-of-sidewalk,
                    NOT ROW outer edge, NOT property line.
   ⤷ subdivided visually into: sidewalk strip (perimeter inset) + lot (interior)

INFRASTRUCTURAL  →  paved-but-not-street, not-block (NEW, DOESN'T EXIST YET)
                    ~5-10 polygons, hand-curated, rendered on top of blocks
                    in a sidewalk-ish but distinct color
```

**Implication for the pipeline:** parcels stop being a geometry source. They become
a *land-use classifier and building positioner only*, used to color the lot fill
and place building footprints. **Block geometry comes from streets** — specifically,
each polygonized face has its block built by offsetting each bordering street
inward by `pavementHalfWidth` (so the block edge sits exactly at the curb). The
sidewalk strip is then inset from the block by a sidewalk width as today.

The user has correctly noted that this means the streets are now load-bearing for
the entire pipeline, and any cleanup of blocks goes back to cleaning streets.

### 7.5 Risks and open questions for this reframe

Before any code changes, the new operator should think through:

1. **Are the OSM street centerlines actually clean enough to offset cleanly?**
   The user has done significant work — `survey.json`, `correctedSurvey` overrides,
   `dividedStreets`, S 18th densification, LaSalle extension, loop-street handling.
   Streets are the most-curated layer in the pipeline. But "good enough to use as
   the only geometry source" is a higher bar than "good enough as a master grid
   for polygonize." Test before committing.

2. **Variable, irregular setbacks.** Some lots are *deeper* than the uniform
   pavementHalfWidth offset would suggest (corner clip-offs, churches with
   ceremonial setbacks, the school on Park Ave). A pure street-offset model loses
   these. The user is *willing* to lose them in exchange for a clean curb network,
   but verify on the spike.

3. **Per-edge street resolution.** To offset each face edge by the right amount,
   the new code needs to know which OSM street each face edge came from. The DCEL
   from `polygonize.js` has half-edge → source-segment back-pointers; the resolution
   plumbing is probably already there but should be verified before building on it.

4. **"Infrastructural space" data.** This is a curated polygon list (~5-10 features
   for Lafayette Square). It does not yet exist anywhere. Spec to confirm with user:
   file location (`data/raw/infrastructural.json`?), schema (id, name, ring,
   render class), where in `derive.js` it's loaded, where in `render.js` it's drawn.

### 7.6 Recommended next move (the spike)

Do NOT start with a full reframe. Do the smallest possible test of the reframe:

1. Pick one face you trust visually (e.g., a typical interior block on Mississippi
   Avenue between two cross streets).
2. Build that one block by **only** offsetting its bordering polygonized face edges
   inward by their `pavementHalfWidth` (lookup via `correctedSurvey` / `survey.json`,
   fall back to `STANDARDS`). Discard the parcel union for this experiment.
3. Render it alongside the current parcel-union block for the same face.
4. Visual diff. Does it look right? Does it touch the curb everywhere it should?
   Does the sidewalk inset still work? Are the corners clean?

If the spike looks right, plan a phased migration. If it looks ragged because OSM
centerlines aren't clean enough, the next investment is in cleaning street data
(possibly a curated street centerline file), not in plugging block-builder bugs.

### 7.7 Things explicitly OFF the table now

- **Per-edge variable inset of the parcel-union block by `(rowWidth/2 − pavementHalfWidth)`.**
  This was proposed mid-conversation as a "plug" fix. The user objected: it
  treats block-edge as a derived quantity that needs coaxing into alignment with
  pavement-edge, instead of treating it as the curb itself. Drop this approach.

- **Dead-end Place projection / chord-splitting** (the previous §7 proposal).
  Not relevant to the markers actually on the map. There may still be missing
  corner lots at dead-end Places, but that's a separate problem from what's
  currently circled. If it comes back, address it after the reframe.

- **Pavement layer fixes / megablob hunting.** There is no pavement layer bug.
  The "megablob" was a diagnostic mistake from ignoring hole rings.

---

---

## 8. Recently fixed issues (so you don't redo them)

| Issue | Fix | When |
|-------|-----|------|
| Sidewalk footway notches | `Clipper.CleanPolygon` at 3m after morph-close | 2026-04-03 |
| Street width / sidewalk overlap | `render.js` uses `pavementHalfWidth × 2` (curb-to-curb) instead of full ROW; `survey.js` computes pavement from lane geometry | 2026-04-03 |
| S 18th curve | Catmull-Rom densification at 3m of "West 18th Street" OSM segment in both `derive.js` and `render.js`; LaSalle extended to meet S 18th | 2026-04-03 |
| Land-use lot coloring | Per-class CSS rules driven by dominant parcel `land_use_code` | 2026-04-03 |
| Building relocation | `deriveBuildings()` translates OSM footprint to assessor centroid | 2026-04-05 |
| Neighborhood boundary | `data/neighborhood_boundary.json` polygon filters what renders | 2026-04-05 |
| Polygon vertex bloat (jagged blocks) | `roundCorners` and `shrinkPaths` use `jtMiter` (no arc vertices); visual rounding moved to `render.js` `bezierPolyD()` | 2026-04-06 |
| Smooth block corners at all zoom levels | `bezierPolyD()` in `render.js` emits cubic Bézier curves at corners; straight edges stay as `L` commands | 2026-04-06 |
| Benton/Park corner gap | Park-parcel exclusion only for actual park land-use codes (4800 series) | 2026-04-03 |
| Reframed mid-block voids diagnosis | Confirmed via marker-stroke diagnostic that voids are gap between parcel-union block and curb, not a polygonize / pavement bug. See §7. | 2026-04-07 |

---

## 9. Things that have been TRIED and DID NOT WORK (don't redo these)

- **Excluding dead-end streets from polygonize input** by per-OSM-way endpoint degree.
  Result: misidentified Park Avenue, Lafayette Avenue, Chouteau Avenue, etc. as
  dead-ends because their OSM ways are split into many segments and per-way endpoints
  don't snap perfectly. Lost the entire Park Avenue corridor.
- **Polygonizing OSM sidewalks instead of streets** as the primary face source.
  Result: 86% of sidewalk endpoints are degree-1 (don't connect). Even at 1m snap
  it's 60%. Only 85 face-cycles emerge vs 106 baseline blocks; many fragments and
  duplicates. Sidewalks are useful as a presence signal, not as primary geometry.
- **Using building footprints to fill block gaps via parcel "rescue"** logic.
  Result: extends blocks to where buildings exist, but the user explicitly rejected
  this — buildings sit on blocks; they don't define them.
- **Face-fill via face-polygon inset union** with morph-close result.
  Result: blocks extended into streets (lamp-inside-block jumped from 10% → 19% in
  validation). Inset distances vary too much to use a uniform value.
- **Street-buffer orientation flip + SimplifyPolygons on `streetBufferPaths`** to
  fix a phantom "megablob" pavement polygon (2026-04-07). The megablob doesn't
  exist; it was a diagnostic mistake from skipping hole rings in point-in-polygon.
  Pavement layer is fine. Don't touch the pavement union code in pursuit of this.

---

## 10. Style & quality rules

- **No idiosyncratic fixes**: every change should be principled and generalizable.
  This pipeline must work for OTHER neighborhoods, not just Lafayette Square.
- **No global fixes for local problems**: scope each fix tightly. If something
  breaks one corner, don't apply a global pipeline change to fix it.
- **Curated > automated**: prefer hand-tuned data sources where they exist (the
  `survey.json` ROW values, the `correctedSurvey` overrides in `derive.js`).
- **Don't propose collecting PII**: this map is public-facing. No phone, email,
  real names tied to addresses.
- **Streetlamps must render on lot or sidewalk, never in street**: this is a hard
  constraint. Validation prints `Lamp validation: N/641 lamps inside blocks (N%)`
  at the end of the pipeline. Baseline target: ~10%. If your change pushes this
  significantly higher, blocks are extending into streets — investigate.

---

## 11. Cartograph application modes

The cartograph is a Three.js app with an orthographic top-down camera. It renders
the same scene as the main app (StreetRibbons.jsx) viewed flat. Four modes:

### 11.1 Marker mode
Freehand strokes for debugging. Human→operator communication channel.
Strokes persist to `data/clean/marker_strokes.json`. The `/analyze` endpoint
reports which blocks/parcels overlap the marker bbox.

### 11.2 Surveyor mode
Centerline editor. The operator cleans up street geometry and sets metadata.

- Click a street to select → shows editable centerline with draggable nodes
- Metadata panel: name, type, one-way, dead-end, loop
- Smooth slider (0–100): Catmull-Rom tension for curved streets
- Toggle Node (hide/show individual points), Toggle Street (disable/enable)
- Revert to Original (restores `_original` from seed data)
- Arrow key nudging (0.15m, shift = 1.0m)
- Exit surveyor → saves centerlines.json → rebuilds pipeline → reloads

Data: `data/raw/centerlines.json` (451 streets, seeded by `seed-centerlines.js`)

**Surveyor defines WHAT and WHERE.** Type, direction, topology, geometry.

### 11.3 Measure mode
Cross-section editor. The operator defines per-side widths from aerial imagery.

- Click-click line placement with waypoints
- Per-segment material assignment (asphalt, concrete, brick, etc.)
- Drag endpoints and waypoints, arrow-key nudging
- Aerial overlay with centerlines as reference

Data: `data/raw/measurements.json` (per-street cross-section overrides)

**Measure defines HOW WIDE.** Asymmetric left/right profiles supported.
Only measured cross-sections render — no default sidewalks or treelawns.

### 11.4 Design mode (planned)
Styling controls for the composed map:
- Material colors (asphalt, curb, land-use fills)
- Per-layer strokes (color + width, like Photoshop layer effects)
- Font and text treatments for street labels
- **Launch button** → opens the main app (localhost:5175) with same scene +
  lighting, shadows, terrain, post-processing

### 11.5 Data flow
```
Surveyor → centerlines.json (geometry + metadata)
                ↓
Measure  → measurements.json (per-side cross-section overrides)
                ↓
         survey.json + standards.js (fallbacks)
                ↓
         Pipeline (derive.js) → ribbons.json (ribbon geometry + face fills)
                ↓
         StreetRibbons.jsx ← ONE RENDERER
            ↓                    ↓
   Cartograph (flat)      Main app (3D)
   orthographic cam       perspective cam
   surveyor/measure       lighting/terrain
```

### 11.6 Authority stack for cross-section profiles
```
1. measurements.json  (operator-measured, per-side)     ← highest
2. survey.json        (OSM sidewalk distance + assessor ROW)
3. standards.js       (generic defaults by street type)  ← lowest
```

Only measured data produces sidewalk/treelawn rings. Survey and standards
provide pavement width only.

---

## 12. Build commands cheat sheet

```bash
cd cartograph

# Seed centerlines (one-time, or delete centerlines.json to re-seed)
node seed-centerlines.js

# Full pipeline rebuild
node pipeline.js --skip-elevation

# Legacy SVG preview (being replaced by Three.js cartograph)
node render.js && node serve.js  # http://localhost:3333

# Copy ribbons to app data
node -e 'const m=require("./data/clean/map.json"); require("fs").writeFileSync("../src/data/ribbons.json", JSON.stringify(m.layers.ribbons,null,2))'

# Inspect data
node -e 'const r=require("../src/data/ribbons.json"); console.log("streets:", r.streets.length, "ix:", r.intersections.length, "faces:", r.faces?.length)'
node -e 'const c=require("./data/raw/centerlines.json"); console.log("centerlines:", c.streets.length)'
```

### serve.js endpoints
| Method | URL | Purpose |
|--------|-----|---------|
| GET/POST | `/markers` | Marker strokes |
| GET/POST | `/measurements` | Measurement data |
| GET/POST | `/centerlines` | Surveyor centerline data |
| GET | `/analyze` | Report parcels/blocks under markers |
| POST | `/rebuild` | Run render.js, return when done |

---

## 13. Three.js ground plane (StreetRibbons)

The ground plane is native Three.js ribbon meshes rendered by `StreetRibbons.jsx`.
This component renders the ENTIRE neighborhood from `src/data/ribbons.json` — 122
streets, 180 intersections, 99 face fills. It is used by both the cartograph
(orthographic top-down) and the main app (3D perspective).

### Ring model (WORKING for all 122 streets)

Each street material is a non-overlapping **ring** (annular strip, inner→outer HW),
split at IX into left/right halves. Materials don't overlap on the same street, so
there are NO priority conflicts between same-street layers.

Priority (only matters at crossings where streets overlap):
face_fill(1) < treelawn(3) < sidewalk(5) < curb(6) < asphalt(8)

**Default rendering:** pavement + curb only. Sidewalk and treelawn rings only appear
where the operator has explicitly measured them. The system does not guess.

### Face fills (WORKING)

Each polygonized block face gets a single flat color from its dominant land-use
classification (residential, commercial, park, etc.). 99 faces, rendered at
priority 1 (lowest). Streets render on top.

### Corner plugs (WORKING on Rutger × Missouri, not yet all intersections)

### Conceptual model (established 2026-04-13)

**Streets are positive geometry. Blocks are negative space.**

The street cross-section profile — asphalt, treelawn, sidewalk — is the authoritative
geometry, measured via the cartograph measurement tool. The block is whatever land
remains after the streets and their full cross-sections are accounted for. The block
is never explicitly constructed in this context.

At a corner, two streets meet. The corner problem is: **extend the outermost street
materials around the bend where two cross-sections meet.** This is additive to the
street, not subtractive from the block. There is no "void" to fill — the black area
at the intersection is asphalt (road surface), which is already correct.

**Curb is aesthetic, not measured.** The curb is a colored edge rendered along the
outer boundary of the asphalt, wherever asphalt meets sidewalk or treelawn. It has
configurable color and width but is NOT a measured material in the cross-section
profile. It does not participate in the measurement tool scheme.

### Corner band: what it is

The corner band is **sidewalk** (or grass, if neither street has sidewalk at that
edge). It extends the outermost pedestrian material from one street around the
bend to the other street.

**Shape:**
- **Outside edge (toward the block):** two straight lines meeting at angle θ,
  where θ is the actual angle between the two streets. This is the block corner /
  property line. NOT assumed to be 90° — θ is a real variable computed from street
  directions at the intersection.
- **Inside edge (toward the street):** quadratic bezier curve. This is the curb
  line rounding the corner — the physical curve a pedestrian walks along.

The band is a wedge-like shape: thick at the middle of the curve, tapering to zero
where it meets each arm (because at those points the arm's sidewalk ring is already
the full width).

**Sidewalk arms merge at the corner.** Both streets' sidewalk rings flow into the
same corner band. There is no "which street owns the corner" — the corner is the
merge zone where both sidewalks meet, just as in real life (you walk down one
sidewalk, the corner curves, you're on the other sidewalk).

**Treelawn always dead-ends** before the corner (ADA curb ramp constraint). The
sidewalk fills through behind the treelawn's blunt end.

### Corner materials by case

| Street A outer | Street B outer | Corner band material |
|----------------|----------------|---------------------|
| Sidewalk       | Sidewalk       | Sidewalk (merge)    |
| Sidewalk       | Treelawn       | Sidewalk (treelawn dead-ends) |
| Treelawn       | Sidewalk       | Sidewalk (treelawn dead-ends) |
| Grass          | Grass          | Grass (merge)       |

### Proven corner bezier (reuse this, don't re-derive)

The quadratic bezier with ctrl = 2×mid(P0,P1) − oo has been validated across all
4 quadrants with the oo↔ii distance-check swap. This curve:
- Bows inward (toward IX), rounding the corner
- Is tangent to both streets' straight edges at the endpoints

DO NOT change the bezier formula. It works.

### Things extensively tried that DID NOT WORK (don't redo)

| Approach | Why it failed |
|----------|---------------|
| **Filled ribbons** (center→halfWidth, overlapping layers) | Treelawn/sidewalk overlap on same street; polygonOffset doesn't reliably resolve z-fighting between them |
| **Fan from oo** (triangle fan radiating from block corner) | PBR lighting produces different colors per-triangle due to position-dependent shadow sampling; visible radial artifacts even in merged mesh |
| **Fan from IX** (triangle fan radiating from intersection) | Same PBR artifact, plus the fan center is inside the asphalt zone |
| **Circular arcs centered at IX** | Arc is tangent to arm ring outer edge (same radius); can never extend past the straight edge, so rounding is invisible |
| **Proportional scaling from oo** | Crushes thin layers (curb becomes sub-pixel at the corner) |
| **Merged mesh (same-material rings + fans in one BufferGeometry)** | Did NOT fix color mismatch — PBR shading is position-dependent, not draw-call-dependent |
| **Filled ribbon + arc fans** | Required overlapping layers with priority; treelawn interrupted by sidewalk due to z-fighting |
| **Y offsets between layers** | Causes visible color/lighting differences with MeshStandardMaterial (shadow map position-dependence) |
| **Large polygonOffset multipliers** | "No visible change" — polygonOffset alone cannot resolve coplanar z-fighting in this setup |
| **Stencil buffer clipping** | R3F/Three.js stencil props had no visible effect |
| **Custom shader discard** | Crashed WebGL context |
| **Overlay patches / corner fills at higher priority** | Adding geometry on top of arm strips doesn't remove the sharp L-corner underneath; the patch is either invisible (same color over same color) or creates seams (different mesh = different PBR shading) |
| **Arc geometry near IX** | Buried under full-length asphalt (pri 8 > sidewalk 5); never visible |
| **Per-material corner bands (curb + sidewalk as separate bands)** | Curb is now aesthetic, not a measured band; only one corner band needed (sidewalk) |

### Architecture decisions (locked)

- **Rings, not filled ribbons**: non-overlapping annular strips per material.
  Priority only needed at crossings (asphalt vs everything else).
- **Treelawn never arcs**: dead-ends at corner. Sidewalk fills the curb ramp area.
- **Curb is aesthetic**: a colored edge along the asphalt outer boundary, not a
  measured ring. Configurable color/width, rendered as a visual stripe. Not part
  of the cross-section measurement scheme.
- **Streets are positive, blocks are negative**: the corner band extends the street
  outward, it does not cut into or modify a block polygon.
- **Angle θ is a real variable**: streets don't always meet at 90°. All corner
  geometry must work for any intersection angle.
- **Sidewalk arms merge at corners**: no "ownership" — both streets' sidewalks
  flow into a single corner band.
- **Three.js meshes**: BufferGeometry with MeshStandardMaterial, receiveShadow.
  Must accept terrain and lighting (this surface is the base of a 3D scene).
  All coplanar at Y=0 within the group (group at Y=0.15 world).
- **Coordinates**: [x,z] = Three.js [x,z] directly.
- **NEVER use Y offsets** for coplanar stacking; polygonOffset only.

### Key files

| File | Purpose |
|------|---------|
| `src/components/StreetRibbons.jsx` | Three.js ribbon renderer (arms + corner plugs + face fills) |
| `src/components/Scene.jsx` | Mounts StreetRibbons in the main app scene |
| `src/data/ribbons.json` | Pipeline output: streets, profiles, intersections, face fills |
| `cartograph/data/raw/centerlines.json` | Surveyor-edited street centerlines (canonical) |
| `cartograph/data/raw/survey.json` | Per-street pavement widths (fallback) |
| `cartograph/data/raw/measurements.json` | Per-street cross-section overrides (highest authority) |
| `cartograph/seed-centerlines.js` | One-time script to generate centerlines.json from curated + OSM |
| `cartograph/serve.js` | Dev server with endpoints for markers, measurements, centerlines, rebuild |

---

## 14. Glossary

- **Face**: a closed polygon produced by polygonizing the street network (DCEL output)
- **Block**: the rendered land between streets — derived from a face via parcel union or face inset
- **Lot**: the inner area of a block, after the sidewalk perimeter is inset
- **Sidewalk strip**: the perimeter ring `block − lot` (rendered in sidewalk color)
- **Tree lawn**: the grass/planting strip between curb and sidewalk concrete
- **ROW**: right-of-way (full assessor width including pavement, curbs, tree lawn, sidewalks)
- **Dead-end Divide**: the rule that carves a road channel from a block where a dead-end street terminates inside it
- **Loop street**: a closed-loop street like Benton Place or Mackay Place (rendered with a green median)
- **Morph-close**: ClipperOffset expand → union → contract — fills small gaps between adjacent polygons
- **bezierPolyD**: the render-side function that converts a sharp polygon ring into a Bézier-cornered SVG path
