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

---

## Phase 0 — Findings (agent: **Ballast**, 2026-05-26)

### ⛔ Phase 1 is BLOCKED — `roofOutline` has NOT landed

The brief's hard dependency is absent. Verified three ways:
- `public/baked/lafayette-square/buildings.json` (version 2, 1082 buildings): NO `roofOutline` or
  `roofOutlineRange` on any entry. Building keys are `id, footprintRange, centroidY, baseY,
  wallMaterial, roofMaterial, zoning, ranges`. `ANY roofOutline? false`.
- Zero `roofOutline` references anywhere in `src/` or the producer `cartograph/bake-buildings.js`.
- Alidade's cutover commits (A–D, through `f7f67d3`) are in, but the `roofOutline` index-emit
  **addendum** (memory note #3) has not been committed/re-baked yet.

**→ Phase 1 cannot start until Alidade emits `roofOutline` into the index + re-bakes.** Holding it.

### ✅ Phase 2 root cause FOUND — production runs the renderer in LINEAR depth

The hero depth bug is fully mechanistic (no eyeball needed to find it; eyeball needed to confirm the
fix). The chain:

1. **Kit doctrine: log depth is mandatory** (`CanaryScene.jsx:22` — "logarithmicDepthBuffer is
   mandatory — kit-wide depth precision"). Stage (`CartographApp.jsx:805`) and Preview
   (`PreviewApp.jsx:599`) both set `logarithmicDepthBuffer: true`.
2. **Production `Scene.jsx` Canvas (gl block `:648`) OMITS it** → r3f default `false` → the
   production renderer runs **linear** hardware depth. This contradicts the brief's stated premise
   ("Canvas runs with logarithmicDepthBuffer: true") and the NeonBands header comment, which both
   assume log depth everywhere. It is true only in Stage/Preview.
3. **NeonBands forces `defines: { USE_LOGDEPTHBUF: '' }` unconditionally** (`:370`) — but NOT
   `USE_LOGDEPTHBUF_EXT`. In three r0.16x the **fragment** chunk is double-gated
   (`#if defined(USE_LOGDEPTHBUF) && defined(USE_LOGDEPTHBUF_EXT)`), so NeonBands **never writes
   `gl_FragDepth`** — the active path is the **vertex** chunk's `#else` branch:
   `gl_Position.z = log2(max(EPSILON, w+1)) * logDepthBufFC - 1.0; gl_Position.z *= w`.
4. **`logDepthBufFC` is only uploaded when `capabilities.logarithmicDepthBuffer` is true**
   (`three.module.js:30327`). In production it's never uploaded → defaults to **0**.
5. → neon vertex z collapses to `(x·0 − 1.0)·w = −w` → NDC z = **−1** → the **near plane**. Every
   neon fragment lands at depth ≈ 0, passes the LESS depth test against everything, and draws over
   nearer trees. **That is the symptom.** It is production-hero-specific (Stage/Preview have a
   correct `logDepthBufFC`, so neon depth-tests correctly there).

**CONTRADICTION with the brief's hypothesis framing:** the bug is NOT a `gl_FragDepth` mismatch
(the frag path never runs — `_EXT` undefined). It is the **vertex** log-depth transform reading a
zeroed `logDepthBufFC` because the *production renderer itself* isn't in log mode. `depthWrite:false`
is a red herring — even with depthWrite off, the depth *test* uses this collapsed z.

**Proposed fix — Option B (local to NeonBands, brief-aligned):** gate the `USE_LOGDEPTHBUF` define on
`gl.capabilities.logarithmicDepthBuffer` (read via `useThree`). In Stage/Preview (log on) → identical
to today. In production (linear) → define dropped, chunks compile out, neon uses standard linear z
like every other production material → correct occlusion. No touch to the glow/blend/normal doctrine;
keeps `depthWrite:false`. Cache key must encode the logdepth state to avoid program-cache collision.

**Alternative — Option A:** add `logarithmicDepthBuffer: true` to `Scene.jsx`'s gl block (aligns
production with the kit doctrine + Stage/Preview). Correct in principle but a scene-wide depth-encoding
change (z-fighting/coplanar-stacking blast radius across ground ribbons, buildings, terrain) and edits
`Scene.jsx`, not `NeonBands.jsx`. Out of Phase 2's stated NeonBands scope. **Recommend B**; flag A as a
separate doctrine-parity question for Boz/Jacob.

**Empirical confirmation available:** temporarily setting `logarithmicDepthBuffer: true` in `Scene.jsx`
should make the hero occlusion correct — the "toggle to localize" test the brief suggests.

---

## ✅ COMPLETE (Ballast, 2026-05-26) — both phases landed + verified

- **Phase 1** (`0274dcd`) — roof-outline trace. Slab path parses Alidade's `roofOutline` .bin section
  through `SlabBuildings` → index → `SceneNeon`; live/Stage path derives the matching ring via the new
  exported `LafayetteScene.roofTopRingFor` (same `classifyRoof` + inset 0.30 as the producer).
  Hip roofs (159, degenerate <3-pt rings) fall back to the footprint so they keep their neon.
  **Verified by Jacob:** neon hugs the actual rooftop.
- **Phase 2** (`0ccd5cc`) — hero depth culling. `USE_LOGDEPTHBUF` define gated on
  `gl.capabilities.logarithmicDepthBuffer` (production = linear, Stage/Preview = log). Glow doctrine +
  `depthWrite:false` untouched. **Verified by Jacob.**

**Memory updated:** `feedback_raw_shadermaterial_needs_logdepth_chunks` refined — production runs LINEAR
depth; gate the define, don't force it.

**Left for Boz/Jacob (NOT done — out of scope):** Option A — whether to enable
`logarithmicDepthBuffer:true` in `Scene.jsx` so production matches the "mandatory kit-wide" doctrine +
Stage/Preview. Real divergence, scene-wide blast radius, separate decision.
