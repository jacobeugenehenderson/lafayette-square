# HANDOFF — T3: migrate the corner-edit handles onto the TILE corners (one corner truth)

**State:** dispatch-ready. **Goal:** make *every rendered corner* get a live, visible corner-edit handle in Survey — by sourcing the handle corner-list from the **live tile corners**, not the legacy `ribbons.intersections`. Today "many corners don't register as corners" (Jacob, on the live tool) because the handles are built off a different, smaller, legacy topology than the map is rendered from.

**Agent:** a cartograph **Survey/authoring** specialist (touches `CornerEditHandles.jsx` + a small `tileGround.js` corner-set emit + the store). `isolation: worktree`. **Domain:** Survey SHAPE authoring — the corner-radius handles. **Scope:** the **corner slice of T3** (the broader T3 authoring migration is `HANDOFF-tile-T3-authoring.md`; this is the corner-handle piece, sharpened by the 2026-06-08 diagnosis — it supersedes that doc's corner section).

> **Read first (the diagnosis is done — don't re-derive, build the fix):**
> - This brief's "The root" below (traced live in code 2026-06-08, with counts).
> - `SURVEY.md §3`/§4 (the tile construction + the T3 authoring-migration gap: *"the overlays still compute the dead figure-ground to position handles"*) · §4 corner-radius 3-tier.
> - `SECTION.md §5` "one *geometry* truth" + §6 "the corner is two things in two tools" — the doctrine this realizes on the Survey side.
> - `RIBBONS.md` invariant #1 (corner = the band bent around the arc, one identity) — why both the handle and the Section bend must ride the **same** corner.
> - `scratch/SURVEY-CONSTRUCTION-FORENSIC.md` (Caliper) — the *fillet→corner re-keying* gap (93 collisions / 77 orphans); this brief **subsumes** its bucket-B fidelity fix (see step 1).

---

## The root (grounded in code, with counts — don't re-derive)

The app effectively keeps **two maps** of the neighborhood. The corner handles are built from the **old leftover one**, while the picture is drawn from the **real current one**:

The corner-edit handles get their corner **list** from `computeIxLayout(ribbons)` (`CornerEditHandles.jsx:132`), which iterates **`ribbons.intersections`** — the legacy raw-OSM intersection list (`PREBAKE.md §3`: *"legacy; near-zero live consumers"*). The render is built from the **skeleton/tile graph**. They are different topologies:

| source | count | role |
|---|---|---|
| `ribbons.intersections` | **258** | the handle corner-list source (the *old leftover list*) |
| `ribbons.junctions` | **329** | the skeleton/tile node graph the render is built from |
| tile convex corners (Caliper) | **544** | the corners actually drawn |

**Three compounding failures, all from the wrong source — fixed by one move (source from the tile corners):**

1. **Missing handles.** A tile corner whose node isn't in the 258-entry legacy list gets **no layout entry → no handle.** (329 vs 258 nodes, before the per-corner expansion.)
2. **Divided avenues skipped** (`:158`) — `if (!m?.left?.pavementHW || !m?.right?.pavementHW) continue` drops any leg without *both* side widths. A divided carriageway is seeded `pavementHW=0` on the median side (`SURVEY §4`), so **every divided-avenue leg is dropped** → the park's divided corners get no handles specifically. (Also `resolveSrefChain` name-match misses; the θ≤5°/≥175° skip at `:195`.)
3. **Invisible handles — key mismatch** (`:493-494`) — even when a corner *is* in the layout, the render draws the magenta arc only if `achievedFillets[ck]` resolves, where `ck = sortedCornerKey(V_legacy, legKeyA_legacy, legKeyB_legacy)`. The tile build keys its fillets by `cornerKeyAt(tile.ring[vi], tile.edges, vi)` (`:2008`). The legacy `V` (raw-OSM point) rarely matches the tile vertex to 3-dp → **lookup misses → the handle draws nothing** (still grabbable at the wrong `c.Q` fallback, but invisible). Large share of "handles don't go live."

**The authoritative, injective corner set already exists in the build:** each tile ring's **sharp corners** (`sharpCornerIndices(tile.ring)`, `:2003`), each with key `cornerKeyAt(tile.ring[vi], tile.edges, vi)` and position `tile.ring[vi]`. That key is **exactly what `resolveVertR` reads overrides off** (`:986-991`) — so an override written against it round-trips to the radius for free. This is the 544, one-per-tile-vertex, injective by construction.

---

## The cure — source the handle list from the tile corners

Make the corner the **one identity** both the handle (Survey) and the curb arc (the render) ride. Concretely:

### 1. Tile-side: emit the corner SET from `buildTileGround` (`tileGround.js`)
Alongside `cornerFillets`, emit a flat `cornerSet[]` — one entry per **sharp tile corner**, keyed identically:
```
{ key:   cornerKeyAt(tile.ring[vi], tile.edges, vi),
  V:     tile.ring[vi],               // the sharp corner point (the IX vertex)
  legA, legB,                         // the two leg keys (split from the key, for the write path)
  vertR: vertR[vi],                   // the resolved radius (already computed :1980)
  fillet: <the fSink arc that rounds THIS corner, or null if R=0 / unfilleted> }
```
- **Attach `fillet` injectively (corner-driven)** — iterate sharp corners; each claims the nearest *unclaimed* `fSink` arc (apex→corner), instead of the current fillet-driven `nearestCornerVertexIndex` snap (`:2004-2008`) that collides (93) and orphans (77). **This subsumes Caliper's bucket-B re-keying fix** — do it here since you're emitting the set anyway. Keep emitting `cornerFillets` too (Section/other readers) until those migrate.
- **No geometry changes.** You are *reading out* the corner set the build already computes (`tile.ring`, `tile.edges`, `vertR`, `fSink`). `iA`/`asphalt`/`block`/`vertR` must be **byte-identical**. Add `cornerSet` to the return (`:2206`).

### 2. Store: bridge it (`useCartographStore.js` + `BlockGeometryV2Debug.jsx`)
Add `tileCorners: []` + `setTileCorners`, and set it next to `setTileCornerFillets(tileGeos?.cornerFillets)` (`BlockGeometryV2Debug.jsx:704`): `setTileCorners(tileGeos?.cornerSet || [])`. (Under the Survey tool `tileGeos` is the live build, so this is populated; under measure/Phase-D it may be null — gate as the fillet bridge does.)

### 3. Handle-side: rebuild `computeIxLayout` to read `tileCorners` (`CornerEditHandles.jsx`)
Replace the `ribbons.intersections` derivation with one that maps `tileCorners` → the handle layout:
- **One handle per tile corner.** Group by `ixKey` (the `V`) for the `<group key>` structure if convenient, but the corner identity is the full `key`.
- **Position:** if `entry.fillet` present → the arc midpoint (existing `grabTarget` math off `C/r/apex`); else (R=0 / unfilleted) → the sharp vertex `V`.
- **Visible always:** change the render gate (`:493-494`) so an unfilleted corner draws a small **square marker at `V`** (so square corners are visible *and* un-squarable), instead of drawing nothing. A filleted corner draws the arc as today.
- **Write path is unchanged and round-trips:** `setCornerCornerRadius(V, legA, legB, r)` → `cornerCornerRadiusOverrides[ixKey|sorted(legA,legB)]`, which is exactly the key `resolveVertR` reads (`:986`). Keep the 3-tier (per-corner → per-IX → scale), the right-click revert, the drag-to-centre R=0 snap, and the gold (authored) / magenta (default) / white (drag) coloring.
- **Delete the legacy bits this orphans** in the corner-handle path (`resolveSrefChain` corner use, the `pavementHW` leg-gate, the `ix.streets` walk) — but only the corner-handle path; don't touch other `ribbons.intersections` consumers.

---

## Boundaries

- ⛔ **No SHAPE geometry change.** This consumes the tile corners for *authoring*; it must not alter `extractFaces`/`filletRing`/`iA`/`vertR`. **Render byte-identical when no override is authored** (machine-A/B the asphalt/curb/block + `vertR`).
- ⛔ **Don't delete the dead figure-ground or `ribbons.intersections`** — that's **T4**. This brief only stops the *handles* from depending on them.
- ⛔ **Survey-only.** Do not touch `sectionPass`/the Section corner. (See the coupling note.)
- ⛔ **No canon edits** — report; Boz folds.

## The Section coupling (note it, don't bundle — false-corner discipline)

Jacob's point: the Section bent-ribbon must ride the **same** corner the handle does (internal connectivity, RIBBONS #1). Today the Section corner is its **own** construction off frozen `iA` (Plumb's disk-primitive, **Fix B**, `SECTION.md §5/§6` — exact line may have drifted post-intersection-everywhere; re-confirm before that build). **That is the paired move, in a separate brief.** The shared identity is the tile corner this brief emits (`cornerSet`/`cornerKeyAt`); when Fix B lands, the Section bend slices the band off the same frozen arc. Two distinct roots, one identity — do **not** try to land both here.

## Validation (Jacob's eye, live :5173 — the gate)

- **Click *Edit corners* → every rendered corner shows a live handle**, including the **divided-avenue / park corners** that get none today (Mississippi×Lafayette, Park×S-18th, and the rest). Spot-count: the handle set should track the **544 tile corners**, not the 258 legacy intersections.
- Drag a handle → the **radius tunes and the curb responds live**; drag to centre → **R=0 square** (and the square marker shows); right-click → reverts that one; gold shows on authored.
- **No geometry regression** — un-authored render byte-identical (asphalt/curb/block/`vertR`).
- Spot-check the previously-invisible class (corners that were in the layout but drew nothing) now render their arc on the true curb.

## Coordination

- **`band-fold-fix@8e1e414` is an unmerged branch that edits `tileGround.js`** (pending Jacob's eye-gate). Branch off **trunk** (`cartograph-looks-pass-ab`); if band-fold lands first, rebase (your edits are the corner-set emit + return — small surface; check the `:2206` return line for collision with the band-fold hygiene edits).
- Edit `CornerEditHandles.jsx` + `tileGround.js` (corner-set emit only) + store + the one bridge line. Re-baked artifacts as needed. **Report:** the handle count vs 544, the byte-identical render proof, and the divided-corner spot-check.

## On landing (Boz)

- Fold into `SURVEY.md §4` (corner handles now ride the tile corners — the T3 corner migration) + flip the relevant BACKLOG row; note Caliper's bucket-B re-keying is **subsumed** (injective corner-driven fillet claim). Update `HANDOFF-tile-T3-authoring.md`'s corner section (superseded by this). Retire this brief → NOTES. The **Section Fix B** brief (the paired one-identity move) is the next corner step.
