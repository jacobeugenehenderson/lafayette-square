# Handoff — Neon Fidelity: Roof-Outline Trace + Hero Depth Culling

> Dispatch-ready brief. Two pre-existing neon-renderer bugs surfaced at the buildings-bake C/D
> review (2026-05-26), confirmed shared across live (Stage) + slab (production) — so they did NOT
> block that cutover; they're their own arc. Both live in `NeonBands.jsx` / `SceneNeon.jsx`.

**You are the dispatched agent. Name yourself** — pick it independently, novel + NOT already used
in this project (check `arborist/NOTES.md` / `cartograph/BACKLOG.md` / commits before choosing).
No theme suggestions. You own this end-to-end.

Two **independent** fixes, **two phases, two commits** (each independently revertible). They share
the neon files but are unrelated mechanisms — keep them separate so a regression is attributable.

**Sequencing:** start **after Alidade's buildings arc lands** (cutover + her `roofOutline` index
emit). Phase 1 *consumes* the `roofOutline` she bakes; Phase 1 cannot start until it exists. Phase 2
(depth) has no such dependency but still edits `NeonBands.jsx`, so run after Alidade is off
`SceneNeon`/`NeonBands` to avoid contention. **No convergence with the tree arc** (Azimuth doesn't
touch these files).

---

## Phase 0 — Inspect (mandatory; the depth bug has a five-wrong-diagnoses history)

- `src/components/NeonBands.jsx`: the merged-mesh material — `transparent:true`, `depthWrite:false`,
  `AdditiveBlending`, `renderOrder:100`, raw `ShaderMaterial` with **manual logdepth chunks**
  (`USE_LOGDEPTHBUF` define + `<logdepthbuf_*>` includes). `buildTubeFor` (reads `place.baseY` +
  the traced polygon). Cross-section / winding / DoubleSide-no-flip glow model.
- `src/components/SceneNeon.jsx`: `openPlaces` — slab path (`:134`, `footprint: e.footprint`) and
  live path (`:166`, `b.footprint`). **Both trace the building footprint today.**
- The roof geometry source: `LafayetteScene.jsx` `Building`'s roof mesh (`getRoofPeakHeight`,
  `classifyRoofFor`) — for the **live/Stage** path, this is where a roof top-edge can be obtained
  to match Alidade's baked `roofOutline`.
- Confirm Alidade's `roofOutline` is in the slab index (`.bin` + `roofOutlineRange`) before Phase 1.

Write a findings note before Phase 1. **Surface anything that contradicts this brief.**

## Phase 1 — Trace the roof outline, not the building footprint

The tube must sit on the actual rooftop perimeter. On flat roofs `roofOutline` == footprint (no
visible change); on mansard/hip it's the inset top edge (tube pulls in to the real roof edge).

- **Slab path (production/Preview):** `SceneNeon` reads `roofOutline` from the index (Alidade's
  baked field) instead of `footprint`; pass it to `NeonBands.buildTubeFor`.
- **Live path (Stage):** derive the matching roof top-edge from the roof geometry `LafayetteScene`
  already builds (same `classifyRoofFor` path), so **Stage neon matches production** — do not let
  the slab path trace the roof while Stage still traces the footprint (`project_stage_consumer_parity`).
  If a clean runtime derivation isn't available, surface it as a decision rather than forking.
- `baseY` (tube height) is unchanged — this is purely the traced *polygon*, not the height.

- **Verify:** at a dark TOD, mansard/hip buildings show the tube hugging the roof edge (not hanging
  over the wall); flat roofs unchanged; **Stage and production identical** (slab toggle on↔off in
  Preview). Listing-vs-zoning color split unchanged.

## Phase 2 — Hero depth culling (neon must not draw over nearer trees)

**Symptom:** in hero, neon on far buildings renders in front of trees that are nearer the camera.
**Not** a render-order bug — trees are opaque (`alphaTest`, depthWrite:true) and draw first, so the
depth is in the buffer; neon (`renderOrder:100`, transparent) draws after and *should* depth-test
against it. **Leading hypothesis:** the raw `ShaderMaterial`'s fragment depth doesn't match the
scene's `logarithmicDepthBuffer`, so with `depthWrite:false` the **depth test** compares against a
mismatched value and the far neon fragment wrongly passes. Investigate the logdepth define/chunk
path first (does the vertex chunk set the varying? is `gl_FragDepth` written on the test path?);
test by temporarily toggling `logarithmicDepthBuffer` and/or `depthWrite:true` to localize.

- **⚠️ Do NOT unwind the glow doctrine while fixing depth:** `DoubleSide` + **no `gl_FrontFacing`
  N-flip** + `AdditiveBlending` is load-bearing (memory `feedback_neon_cylinder_doubleside_no_flip`
  — this is the spot that burned five wrong diagnoses). The fix is in the depth-test / log-depth
  path, not the blend/normal model. Keep `depthWrite:false` unless you prove otherwise (additive
  self-blending depends on it).
- Whatever you change, re-verify against the existing depth interaction the `renderOrder:100`
  comment documents (neon must still sit correctly over transparent baked-ground at street level).

- **Verify:** hero pan — neon on far buildings is correctly occluded by nearer trees; near-building
  neon still reads; no regression to the ground-level neon-over-asphalt behavior; works at the
  authored Look's TOD across the full pan.

---

## Explicitly out of scope

The neon glow model (cross-section, winding, DoubleSide-no-flip, additive); the open-by-hours /
`useListings` logic; `baseY`/anchor math (Alidade's index owns it); baking `roofOutline` (that's
Alidade's producer commit — you consume it). Buildings or tree arcs.

## Commit boundaries

One commit per phase, each independently revertible. Phase 1 (roof trace) and Phase 2 (depth) do
NOT share a commit. Canonical off-limits: the neon glow doctrine above. Check in with Jacob after
**each phase** (both are visual-parity calls — dark-TOD eyeball). **49/51:** the tube must read
beautifully; tracing the roof edge and fixing occlusion are fidelity wins, not just correctness.
Surface anything not in this brief in your status + commit bodies.
