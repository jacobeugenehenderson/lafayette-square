# Dispatch note — DISC CLEANUP: centerlines stop at the visible map edge

**For a COLD agent.** Self-contained; every location cited file:line. Small, standalone cleanup in the **Neighborhood Disc** arc — independent of the Survey migration and the aerial loader (both separate). Runtime-only, no bake. Pick a name; sign commits.

## The problem (Jacob's eye, 2026-06-02)

In the **Design** layer, the street **centerlines jut out into space beyond the map** — past where the ground visually ends — into empty/faded canvas. It's just the bare centerlines (no strokes), so it reads as "unattractive, suspicion-raising cruft." Vestigial (pre-existing, not from recent work).

## Why it happens (mechanism, verified)

- The ground **feathers out** between `FADE_INNER` (758m) and `FADE_OUTER` (892m) — so the map *visually* ends around 758m and is fully gone by 892m.
- The centerlines are clipped to the **hard disc boundary** (≈892m): `MapLayers.jsx:443-455` builds `centerlineLines` and clips each street via `clipPolylineToBoundary(st.points)` (`:447`), which clips against the full boundary polygon (the 256-gon at `BOUNDARY_RADIUS`).
- So in the **758→892m ring**, the ground is mostly transparent but centerlines still draw at full strength → they trail past the visible map.

## The constraint that picks the fix

**You cannot fade them with a shader.** Centerlines use `THREE.LineBasicMaterial` (`makeLineMat`, `MapLayers.jsx:110-111`), which does **not** accept the `onBeforeCompile` radial-fade shader the ground/aerial use — this is already documented in the codebase at `MapLayers.jsx:555-560` (the barrier lines hit the same wall and solve it by **segment-level geometric clipping** to the boundary). So follow that established pattern: **clip the centerlines tighter**, don't try to fade them.

## The fix

Clip the centerlines to an **inner radius ≈ `FADE_INNER`** (where the map visually ends) instead of the hard outer boundary — so they stop at the visible edge.

- Add a small helper in `boundary.js` next to `clipPolylineToBoundary` (`:69`): e.g. `clipPolylineToRadius(points, centerXZ, R)` — same segment-walk structure (keep in-radius runs, split at crossings), but membership is a circle distance test (`dist(p, center) <= R`) instead of polygon PIP. (A circle is exact for the disc and cheaper than the 256-gon.)
- In `centerlineLines` (`MapLayers.jsx:447`), clip with the new helper using `BOUNDARY_CENTER_XZ` + `FADE_INNER` (both from `boundary.js`) instead of `clipPolylineToBoundary`.
- **Do NOT change the shared `clipPolylineToBoundary`** or its other callers (barriers `:567`, parcels, etc.) — add the inner clip only for centerlines, so nothing else moves.

**Tune the stop radius by Jacob's eye.** `FADE_INNER` (758m) is the natural start, but a hard cut exactly at 758 may look slightly short while the ground is still ~half-visible in the fade band; landing it a bit into the band (≈800–825m) may read cleaner. Expose it as a named const (e.g. `CENTERLINE_CLIP_R`) so it's a one-line nudge.

**Optional stretch (only if the hard cut reads poorly to Jacob):** simulate a fade without a shader by enabling `vertexColors` on the line material and lerping each vertex's color toward the background in the fade band. More work; skip unless the clean clip looks abrupt.

## Definition of done (Jacob's eye, LS, Design layer)

1. Centerlines no longer stick out past the visible map — they stop at/inside the feathered edge.
2. No other layer changed (barriers, parcels, ground clip all unchanged).
3. The stop radius is a single named const, easy to nudge.

## Non-scope

- No change to the ground geometry clip, the boundary definition, the 256-gon→true-circle cleanup, the feather bands, or any non-centerline layer.
- Not the FloorGizmo/card, not the aerial loader, not Survey.
- **⚠️ DO NOT TOUCH the baked ground rim / "noisy banded cloud horizon."** This is *centerlines only*. The ground disc's feathered rim (viewed from the side) is a valued, emergent effect — `BakedGround.jsx` faces-vs-streets dual fade bands (`stencil.fade` / `stencil.streetFade`), the dithered alpha (`FadeMesh`, `#include <dithering_fragment>` + smoothstep), the noise grass shader, and terrain displacement. Your change is in `MapLayers.jsx` centerline geometry + a `boundary.js` helper — nowhere near `BakedGround.jsx`, the stencil bands, the grass material, or terrain. Keep it that way.

## Gotchas (banked)

- Validate on **Jacob's eye in the live app** (LS, Design layer) — not a proxy. "Transforms clean" ≠ "looks right."
- `scratch/` is git-tracked — don't `rm -rf`; delete throwaways by exact name.
- Verify edits applied (Read/`git diff`) before trusting output.

*Provenance: Boz, 2026-06-02, from Jacob's centerline-jut observation. Grounded in `MapLayers.jsx` + `boundary.js` reads — the line-material fade constraint (`:555-560`) is what makes this a clip, not a fade.*
