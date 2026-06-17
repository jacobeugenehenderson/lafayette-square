# HANDOFF — Edge-of-map: streets fade out, perimeter faces fill (the boundary, wired at last)

**Status: ✅ LANDED + BAKED (`329e032`, 2026-06-16; slab `2a40d50`). Branch `curb-offset-draw`.** Perimeter faces fill, boundary clip wired into the PREBAKE face-walk (not the consumer — the brief's layer was corrected); grid-safe 70/70. **OPEN:** S1 outskirts elbow→fade + map-edge fillets (eye-pending). See **§LANDING**. ⛔ **ROUTE FIRST** (`CLAUDE.md`): `ORIENTATION.md` → `README §⭐ START HERE` → this brief → **`HANDOFF-boundary-trio.md`** (circle-SSOT, crop-to-circle-LAST, `streetFade`) → `cartograph/PREBAKE.md`/`SKELETON.md` (the face-walk seam). **The eye is the gate** (Jacob on the lit Survey).

**One line:** at the neighborhood edge, two symptoms share **one root** — streets are **never clipped to the boundary before the face-walk**. Wire the **already-written-but-never-called** boundary clip in *before* `extractFaces`, and both fix at once. Consolidates Jacob's pre-DataWall notes **#7 (open perimeter polygons)** + the **outskirts "artificial elbow" elbows** (Grattan `[624,-79]`, Dillon `[802,-301]`).

> Consolidates with `HANDOFF-boundary-trio.md` (the standing boundary brief) — this is the *face-walk/fade* half it named; point boundary-trio here on landing.

---

## The two symptoms, one root (recon 2026-06-16, file:line confirmed)

### S1 — streets cut off at the boundary make an artificial ELBOW (should extend + fade out)
A street that reaches the edge is **truncated by the stencil at the OUTPUT stage** (`tileGround.js:2771`, a hard straight cut), not clipped to its natural direction — so it ends in an artificial corner instead of fading. Jacob: *"I'd rather the streets just correctly extend and fade out."* The marked cases (Grattan, Dillon) are outskirts streets, **not** real bends — so this is **NOT** corner-round (task 1); auto-round stays for genuine curves only.

### S2 — large perimeter faces (N + SE) get NO land-use polygon ("open" faces)
`extractFaces` (`tileGround.js:508–630`) emits only **closed** rings — `return faces.filter(f => signedArea(f.ring) > 1e-3)` (`:629`) drops the unbounded outer face **and any ring that doesn't close.** Near the edge, street half-edges **terminate at the boundary with no twin to close the ring** → open ring → dropped → no face → no land-use fill (the big empty N/SE areas). The perimeter is today back-filled crudely as `differenceRings([stencil], tileUnion)` (`:2668–2770`), which is why those zones read as bare.

### The shared root + the fix
**The boundary clip exists but is NEVER CALLED.** `src/cartograph/boundary.js` exports `clipPolylineToBoundary(points)` (`:69`) and `clipPolylineToRadius(points, centerXZ, R)` (`:128`) — **no caller anywhere in the build/bake.** Wire it in **before** `extractFaces` (street-prep, `tileGround.js:~1474`):
- streets get **clean cut endpoints ON the boundary** → the face-walk closes the perimeter rings against them → **S2 faces close and pass the `signedArea` gate** (they fill);
- the cut endpoints are the **natural fade points** → S1 elbows become clean terminations to fade from.

This is the `boundary-trio` doctrine made real: **"build geometry on the full extent; crop to the circle LAST"** — crop the *streets* before the graph walk so edge junctions resolve against the cut, not the stubs.

## The build
1. **Wire the clip (the unblocker).** Call `clipPolylineToBoundary` (or `…Radius` against `neighborhood_boundary.json` `center`/`radius`/`streetFade`) on each street's points in `buildTileGround` **before** `extractFaces` (`tileGround.js:~1474`). Pass the clip polygon through from `bake-ground.js` (`opts.stencil` already exists — extend it to street-prep). Verify the perimeter N/SE faces now close + fill, and the Grattan/Dillon elbows terminate cleanly.
2. **Fade, not hard-stop.** The clipped street endpoint should **fade out** across the `streetFade` band (`neighborhood_boundary.json streetFade.outer`), not abut a hard line — confirm/extend the fade treatment so the cut reads as a fade, per Jacob's "extend and fade out." *(If S2's close + the existing fade already read right on Jacob's eye, S1 may need nothing more.)*
3. **Decide close-vs-show for any face the clip still can't close** (Jacob: "close the polygons OR allow them to show"). Default = **close** (option 1). The fallback (lower the `:629` area threshold / route open faces through the Section fill) is option B — only if a genuine open face survives the clip.

## Coordination — F is EDGE-ONLY + FROZEN, so NOT blocking (updated 2026-06-16, F agent)
The clip only touches **streets that reach the boundary** → only **perimeter faces + outskirts streets** change; the **interior face set is byte-identical**, and the edge result is **frozen (cosmetic)**. So **B (interior junctions), C (interior curb), and A's interior land-use faces do NOT build on anything F moves** — **F is not a blocker; everything can run in parallel.** The only remaining overlap is **textual** (`tileGround.js` — F's `extractFaces` clip vs B's `filletRing` vs C's `iA`, different functions) → separate git worktrees or a clean merge, not a logical dependency. **Grid-safe gate:** interior block faces **byte-identical** before/after — only the perimeter + outskirts move (this is also what makes F non-blocking).

## Acceptance (Jacob's eye, lit Survey)
- The N + SE perimeter areas **fill** (closed faces, land-use painted) — no bare zones.
- Outskirts streets (Grattan, Dillon) **extend + fade** at the edge — no artificial elbow.
- Interior blocks untouched (byte-identical faces); curated/correctness suite unchanged.

*Scoped 2026-06-16 from Jacob's notes #7 + the outskirts-elbow clarification. Sibling to `boundary-trio`; the clip is the lever both symptoms share.*

---

## LANDING — S2 (perimeter faces fill) code-complete, EYE-PENDING (2026-06-16, agent)

⭐ **The brief's "wire the clip in `buildTileGround` before `extractFaces` (`tileGround.js:1474`)" was the WRONG LAYER.** At `smooth=0` (always) that line consumes the **FROZEN** `ribbons.tiles`; `extractFaces` there is only the toy/fallback. The real face-walk that decides the face set runs **once in the prebake** (`derive.js:4122`, the D2 freeze) — clipping in the consumer is a no-op on the live map. **The fix belongs in `derive.js`,** and SSoT-wise it mirrors the boundary injection **already present** at `derive.js:1182` for the *other* walk (`polygonize`→`ribbons.faces`, the LU oracle). Two face-walks; the boundary was injected into one, not the other — that divergence WAS the bug.

⭐ **Topology the brief glossed (probed, `scratch/edge-of-map-probe.mjs`):** the street network extends *past* the circular boundary (extent ±1500 vs radius ~892); streets **cross** the boundary, they don't end on it. `polygonize` **nodes** crossings (so `ribbons.faces` already has the closed perimeter faces); `extractFaces` does **NOT** node its input. So the fix = **clip face-streets to the boundary + inject the boundary ring as closing edges, inserting each crossing into BOTH the clipped street endpoint AND the boundary ring** (identical coord → identical 0.1 mm node, since extractFaces only welds/quantizes, never splits). The boundary-trio "build full, crop LAST" made real. **S1 and S2 DO share this clip root as the brief claimed — but in the prebake, not the consumer.**

**Landed (source):**
- `cartograph/derive.js` — D2 freeze block now clips face-streets to the boundary + injects the subdivided boundary ring before `extractFaces`; boundary edges freeze with `skelId === BOUNDARY_EDGE_SKEL` ('__boundary__'). `boundaryPolyXZ` captured at the existing 1182 load (SSoT).
- `src/lib/tileGround.js` — **already committed in `a67da3e`** (the G1/G3/G4 surfaces commit): `export const BOUNDARY_EDGE_SKEL` + `tilesFromFrozen` resolves a boundary edge to **sentinel streetIdx -1 → `edgeDepth` returns 0 → LU floods to the map edge, no curb/sidewalk** (the behavior `edgeDepth:716` was already built to anticipate). My identical edit = zero-diff no-op.

**Verified (data, NOT the eye):** `ribbons.json` 103→**101 tiles, 31 perimeter, 290 boundary edges**. **Grid-safe gate HOLDS: 70/70 fully-interior tiles byte-identical, 0 regressions** (only boundary-crossers reshape + 31 new perimeter faces). `shape.json` re-baked `{tiles, highway}`; perimeter tiles carry sensible `lu`. `buildTileGround` consumes with no crash; LU fills the perimeter (park 1.0 / residential 0.85 / recreation 0.44 km²).

**⚠️ OPEN (eye / decision):**
1. **Perimeter fillets — possible spurious ADA pads at the MAP EDGE** (30/31 perimeter tiles carry fillets; street-meets-boundary corners read as corners via `cornerAt`, street-sk ≠ boundary-sk(-1)). Source fix if the eye sees them: **suppress `cornerAt` when one side is the boundary sentinel.** Not pre-applied.
2. **S1 (elbow→fade) NOT done** — the clip is prebake-only; the consumer still strokes full streets + hard-crops at the stencil (`tileGround.js:2771`).
3. **Big perimeter tiles get ONE lu class** (coarser than parcel-subdivided `ribbons.faces`) — eye decides if a 0.29 km² flat region reads wrong.
4. **My bake touched shared slab artifacts** (`shape.json`/`ground.*`/`scene.json`/`default.json`) → also advances the **G1/G4 REBUILD GATE** (`HANDOFF-surface-and-wire-geometry.md`). Jacob backup: `/tmp/shape.json.jacob-backup`.
5. **Cache-buster:** exit Survey / hard-refresh to see it (Section fetches `shape.json?t=freezeTag`).

*Probe: `scratch/edge-of-map-probe.mjs`.*
