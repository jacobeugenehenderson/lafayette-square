# HANDOFF — Grade separation on the frame (Groma → Theodolite / Boz)

> **Agent: Groma** (the surveyor's right-angle instrument — lays out the junctions).
> Worktree-isolated on branch `groma-onframe-faces`. Brief: "Faces + intersections
> ON-FRAME + grade separation." Delivered 2026-06-02.
> **Scope landed = Option 2** (Boz's call): carry the grade flag on every street
> through to `ribbons.streets`; hand over the `extractFaces` filter recipe; **defer**
> the (render-inert) derive faces/intersection cleanup; **stay out of `tileGround`.**

---

## TL;DR for Boz

The frame now carries grade separation. **`ribbons.streets[]` has a `gradeSeparated`
flag** (+ raw `layer`/`bridge`/`tunnel` facts) on all 242 streets. **The one-line
consumer filter `streets.filter(s => !s.gradeSeparated)` clears all 29 grade-separated
centerline crossings (verified, 0 survive)** that bowtie the planar face walk — the
interchange-triangle / sliver / false-block degenerates. That filter is **one new line
on Theodolite's side** in `tileGround.extractFaces`; Groma's frame files and
Theodolite's `tileGround` are disjoint, so the merge is clean. Geometry is **byte-
identical** before/after (242→242 streets, **329→329 junctions**, 1588→1588 pts, 0
geometry touched) — this is purely additive plumbing; **no junctions dropped.**

---

## ⚠️ Two premises in the brief were wrong — corrected against live code + data

I read the doctrine (`OSM-FORENSICS-EVAL.md` item 1, `OSM-FORENSICS.md` Part 3,
`PIPELINE.md §Wall`) and verified before building. The doctrine holds (fix the frame,
make consumers read it, never patch downstream). But two specific claims didn't survive
contact with the code, and they changed *who* does the visible fix:

### 1. `derive.js` faces & intersections are **render-inert**. The visible degenerates come from `tileGround`.
- Live render **and** bake drive tile geometry from `tileGround.extractFaces(ribbons.streets)`
  (`bake-ground.js:657` → `buildTileBakeShape` → `buildTileGround`; live: `BlockGeometryV2Debug`
  → same fn). The figure-ground path is "dead-in-place."
- `extractFaces` builds its graph from **shared vertices of `ribbons.streets[].points` only**
  (`tileGround.js:303–337`, 0.1 mm quantization). It **never reads `ribbons.intersections`**
  (fully inert — zero consumers in `src/`) and reads `ribbons.faces` **only for land-use
  coloring** (`tileGround.js:786`), never geometry.
- ∴ Rewiring derive faces/intersections + deleting the 3 m snap is correct *cleanup* (removes
  ~220 lines of inert splice machinery + a raw-OSM bypass), **but by itself changes nothing
  Jacob sees.** Deferred (Option 2).

### 2. The "329 false interchange junctions" premise is **empirically false** — there are 0.
- `skeleton.junctions` (329: T 136 · cross 83 · deadend 100 · Y 10) is built **shared-vertex-only**
  (`buildNodeGraph`). Measured: **0 false junctions from grade separation** — grade-separated
  roads **don't share vertices**, so they were never typed as junctions.
- The real artifact is **29 centerline crossings between grade-separated roads that cross in 2D
  WITHOUT a shared vertex.** `extractFaces` has no node there → the crossing edge bowties the
  face walk → degenerate polygon. (`nodeEdges` in the legacy derive path false-*nodes* the same
  29, a separate symptom of the same cause.)
- **Tag-free detection rule (verified):** OSM at LS has **0 same-layer crossings without a shared
  node** — so *any* interior crossing without a shared vertex **is** a grade separation. (We don't
  rely on this in code; we use the per-street flag below. But it's the ground truth.)

`PIPELINE.md §Wall` has been corrected to this model (the prior text claimed false junctions).

---

## What landed (Groma's files — all additive)

| File | Change |
|---|---|
| `cartograph/skeleton.js` | `gradeFacts()` / `gradeFields()` + `WAY_TAGS_BY_ID` map. Every street (named-welded via `makeStreet`, and unnamed-vehicular ramps/motorways) now carries `layer`/`bridge`/`tunnel` + the operative `gradeSeparated`. **Fixes the named-street tag-drop**: `makeStreet` only saw `fragments[0].tags` and emitted no grade at all — now graded from **all of `chain.sources`**, so a partly-bridge street (Mississippi Ave: `bridge:true, layer:1`) is graded honestly but **`gradeSeparated:false`** (it still bounds blocks). |
| `cartograph/derive.js` | Carry `gradeSeparated` (+ `layer`/`bridge`/`tunnel`) from the skeleton street into the runtime `ribbonStreets` object **and** through the serializer whitelist (`ribbonsLayer.streets.map`) so they survive into `ribbons.json`. (The whitelist is *why* enriched fields silently vanished before — it strips anything not listed.) |
| `cartograph/fetch.js` | Comment only. It already carries **all** tags verbatim (`tags: way.tags`); `tagPriority` is categorization, not a filter. Added a "do NOT prune to a tag subset" note so a future whitelist can't drop `layer`/`bridge`/`tunnel`. |
| regenerated | `skeleton.json`, `map.json`, `src/data/ribbons.json`, `public/baked/lafayette-square/` (bake runs clean: 23 groups, 846,672 verts). |

### `gradeSeparated` — exact definition (read before consuming)
```
gradeSeparated = (chain is entirely off-grade: every source way bridge/tunnel/layer≠0)
              OR (highway ∈ {motorway, motorway_link, trunk, trunk_link})
```
Limited-access corridors abut frontage roads, never bound neighborhood blocks — and an
*at-grade* motorway segment still crosses elevated ramps at the interchange, so the class
clause is needed (the "entirely off-grade" clause alone covers only 18 of the 29 crossings;
together they cover all 29). Partly-bridge **residential/primary** streets (Mississippi,
Nebraska, S. Tucker, S. Jefferson) are **not** flagged → they keep bounding blocks; their
crossings are removed via the flagged *motorway* side instead.

Coverage measured on LS: **55/242 streets `gradeSeparated`** (the freeway corridor + ramps),
**187 kept** in the face graph (the residential grid). `bridge:12, layer≠0:12, tunnel:0`.

---

## ⭐ The recipe for Theodolite — one line in `tileGround.extractFaces`

`extractFaces(streets)` currently walks **every** street's segments into the planar graph
(`tileGround.js:333 streets.forEach((s, si) => …)`), and `buildTileGround` already pre-filters
only by point count (`tileGround.js:600 (ribbons?.streets || []).filter(s => s?.points?.length >= 2)`).

**Exclude grade-separated streets from the face graph.** Either:

```js
// in buildTileGround, where streets is first taken:
let streets = (ribbons?.streets || [])
  .filter(s => s?.points?.length >= 2 && !s.gradeSeparated)   // ← add !s.gradeSeparated
```
…or, if grade-separated roads must still render asphalt, keep them in `streets` for the
asphalt/ribbon passes but skip them when **building the face graph** inside `extractFaces`:
```js
streets.forEach((s, si) => {
  if (s.gradeSeparated) return                                // ← skip face-forming only
  const pts = s?.points
  if (!pts || pts.length < 2) return
  for (let i = 0; i < pts.length - 1; i++) addEdge(pts[i], pts[i + 1], si)
})
```
Verified: after this filter, grade-separated centerline crossings drop **29 → 0** (the only
residual crossing is **Benton Place × Benton Place**, a same-street **loop self-crossing** —
pre-existing, geometry-identical to before my change, a loops matter, **not** grade-sep; see
the loops gap in the tile ledger).

### ⚠️ One consideration for Theodolite/Jacob to decide consciously
Excluding the limited-access corridor from **face-forming** means those roads get **no tile →
no asphalt** unless rendered by a separate ribbon path. Today they render as a degenerate
*mess*; the filter trades "mess" for "absent" at the I-44 edge. If the freeway must still paint,
its asphalt needs a non-tile path (or accept it's absent). This is a tile-model call —
flagging, not deciding.

---

## Verification (Jacob's eye, post-merge)
- ✅ junctions before/after: **329 → 329** (no 3 m-snap deletion in this scope; nothing dropped).
- ✅ grade-separated crossings cleared by `!gradeSeparated`: **29 → 0**.
- ✅ ordinary blocks unaffected: 187 residential/arterial streets kept; partly-bridge streets not over-skipped.
- ⏳ **degenerates clear map-wide / overpasses read separate** — only visible **after Theodolite adds the filter + re-bake.** Until then this bake still shows them (frame plumbing is inert to current `tileGround`).

## Deferred (still open, per Option 2)
- The render-inert derive cleanup: source intersections from `skeleton.junctions`, delete the
  `IX_SEG_SNAP=3.0` snap + the ~220-line splice/micro-collapse machinery + the Goldilocks
  densify (faces from skeleton chains). Pure cleanup / removes the last raw-OSM bypasses; **no
  render effect.** Pick up when the tile model fully owns faces (T4 figure-ground delete).
- **Benton Place loop self-crossing** (1 residual, non-grade) — rides with the loops gap.
- Paths (footway bridges) don't carry grade — `extractFaces` only walks `streets`, so not needed
  for this fix; add if a future consumer walks paths.

— *Groma*
