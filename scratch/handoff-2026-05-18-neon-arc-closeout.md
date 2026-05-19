# Handoff — 2026-05-18 — Neon arc close-out

Audience: next-session coordinator.
Branch: `cartograph-looks-pass-ab`.
Companion docs: `scratch/handoff-2026-05-18-z-axis-audit.md` (the audit
that opened the arc), `scratch/handoff-2026-05-18-anchor-and-layervis.md`
(parallel anchor work, separate session).

## Commits landed (this session, in order)

Newest first; all pushed to origin.

- **`766bfcc` extend neon eligibility to every building** — every entry
  in `_allBuildings` is now a tube candidate, not just listings-authored
  ones. Default color via St. Louis zoning code → `CATEGORY_HEX` bucket.
  Bake unchanged (still listings-only); this is runtime-only. Also
  deleted the `visibleNeonIds` frustum-cull useFrame, which was gating
  a dead `neonInfo` prop on `<Building>` (downstream uses are computed
  and never read — leftover from the retired per-Building inline neon
  mount). May have unblocked InstancedTrees mounting by killing a
  re-render storm during camera motion.
- **`6fcbd2d` Stage: Force Neon On is the sole gate; production: hours
  is the sole gate** — disambiguated by prop presence at the
  `<LafayetteScene>` mount. CartographApp's StageEnvironment passes
  `forceNeonOn` (bool); Scene.jsx omits it. Stage: `Off = silence`,
  `On = all eligible`. Production: `_isWithinHours` is authoritative.
- **`e2b9095` decouple neon from Society Pages tags + drop tubeRadius
  debounce** — `activeTags` from `useLandmarkFilter` no longer reaches
  into `neonLookup` or `openPlaces`. `useLandmarkFilter` is still
  imported for `LandmarkMarkers` (pin display) — that's the right
  consumer for Society Pages tag state. The 120 ms debounce on the
  tubeRadius commit came out because the original processor-saturation
  symptom that motivated it was actually the depthbuf bug masking the
  rebuild count.
- **`9805305` fix tubeRadius slider debounce never elapsing under
  steady fps** — the per-frame `clearTimeout + setTimeout(120ms)` cycle
  in the useFrame poll was pre-empting its own deadline at 60 fps. The
  commit only ever fired during render-loop pauses. Fix: track previous
  quantized value in a ref; reset timer only when `q` itself changes.
  (This commit was an intermediate step — the debounce came back out
  entirely in `e2b9095`. Kept in history because the diagnosis was the
  load-bearing finding.)
- **`43ca3fe` add Tube radius as a TOD-animatable field in the Neon
  channel** — fifth field in `NEON_FIELDS`. Same UI as the other four
  (Hot core / Tube glow / Atmospheric bleed / Emissive). Range 0.1 m
  to 3.0 m, step 0.05, default 1.0. Drives merged-mesh vertex positions
  via a poll → quantize → setR → useMemo rebuild path. `NeonPump`
  writes the resolved channel value into a new
  `tubeRadiusUniform` container in `src/preview/neonState.js`.

Earlier in the session (also on this branch):

- **`855a6ad` close out NeonBands V2 arc — excise v1, rename V2, mark
  shipped** — `git mv NeonBandsV2.jsx → NeonBands.jsx`, v1 deleted,
  imports updated, `[neonV2]` diagnostic stripped, header comment fixed
  (FrontSide → DoubleSide doctrine), FEATURES.md neon paragraph flipped
  from in-flight to shipped, BACKLOG 2026-05-16 entry closed.
- **`a5c1844` fix asphalt portion of ribbons cutting through neon on
  pan** — neon `renderOrder: 20 → 100`. Asphalt FadeMesh (renderOrder
  30, transparent, depthWrite:true) was drawing AFTER neon (which was
  depthWrite:false) and overdrawing tube pixels against the sky depth
  baseline. Drawing neon last fixes the ordering. **Important doctrine:
  polygonOffset is inert under `logarithmicDepthBuffer: true` in
  perspective** because the `logdepthbuf_fragment` chunk writes
  `gl_FragDepth` explicitly. The 2026-05-13 asphalt-vs-grass
  "polygonOffset fix" actually works through transparent-pass draw
  ordering, not depth bias. See the BACKLOG entry.
- **`e0a4cad` fix NeonBandsV2 log-depth-buffer compliance** — the
  load-bearing fix for the multi-hour misdiagnosis arc. Canvas had
  `logarithmicDepthBuffer: true` since 2026-05-13; NeonBandsV2's raw
  `ShaderMaterial` omitted the four `<logdepthbuf_*>` chunks. Fragments
  wrote linear depth into a log-depth buffer → camera-angle-dependent
  depth comparison failure → "overhead disappearance" and "underground
  glints." Fix: `defines: { USE_LOGDEPTHBUF: '' }` + four chunk-include
  directives. Memory:
  `feedback_raw_shadermaterial_needs_logdepth_chunks`.

## Doctrine introduced this session

Three doctrine paragraphs in `cartograph/FEATURES.md` §"Layering /
coplanar stacking / depth precision":

1. **Raw `THREE.ShaderMaterial` must include log-depth GLSL chunks.**
   Three.js's built-in materials chain them automatically; raw
   ShaderMaterial does not. Without them, fragments write linear depth
   into the log buffer and comparisons fail in camera-angle-dependent
   ways. Symptom: mesh draws cleanly at some angles, disappears at
   others, no clear occluder; `depthTest:false` rescues but
   `polygonOffset` cannot (polygon offset can't move
   fragment-shader-written gl_FragDepth).

2. **Transparent-pass renderOrder is load-bearing for coplanar
   resolution under log-depth.** With log-depth enabled and the
   fragment writing its own gl_FragDepth, `GL_POLYGON_OFFSET_FILL` is
   bypassed entirely. The 2026-05-13 FadeMesh polygonOffset doctrine is
   misleading — what actually resolves asphalt-vs-grass z-fight is
   that asphalt has a higher renderOrder and draws over grass in the
   transparent queue. Future raw ShaderMaterial work that relies on
   polygon offset under log-depth will silently fail.

3. **Stage vs production prop-presence gating.** Components mounted in
   both Stage (live store) and production (frozen-at-bake) can branch
   by checking whether a Stage-only prop is `undefined`. Pattern:

   ```js
   const on = forceNeonOn !== undefined
     ? !!forceNeonOn               // Stage path
     : _isWithinHours(info.hours)  // Production path
   ```

   No new prop, no Stage-vs-production component fork, no production
   semantics change. Cleaner than mounting twice.

## Key memories added/updated

- `feedback_raw_shadermaterial_needs_logdepth_chunks.md` — full
  diagnostic doctrine (added).
- No others in this session.

## What's deferred (queued for future arcs)

1. **Bake-side eligibility extension.** The runtime now lights every
   building (~1082 in Stage Force On). Production still uses
   `_isWithinHours` against authored hours, so non-listings buildings
   stay dark in production. If we want production to also show neon on
   non-listings (e.g., a default fallback), that's a bake-pipeline
   change (`scene.json` would need a per-building neon entry or
   equivalent) and a production-gating decision (`_isWithinHours`
   alone isn't enough; need a "default-on" signal).

2. **Building's dead neonInfo block.** Lines 625–633 in
   `LafayetteScene.jsx`'s `Building` component declare `categoryHex`,
   `listingHours`, `neonForceOn`, `showNeon`, `effectiveHex` —
   all dead variables, leftover from the retired per-Building inline
   neon mount. Safe to delete, separate cleanup commit.

3. **Real frustum/LOD cull for the merged tube mesh.** With ~1082
   tubes, the merged BufferGeometry is meaningfully larger than the
   prior ~30–83. The deleted `visibleNeonIds` machinery was on the
   wrong layer (gating a dead `neonInfo` prop). If profiling shows
   back-pressure at the merged-mesh level, the right place is inside
   NeonBands' geometry useMemo — partition by frustum-visible
   buildings, skip the rest. Not pre-optimizing; just noting the entry
   point.

4. **Richer per-building neon classification.** Today's default colors
   come from a zoning-code lookup with three buckets (residential /
   services / community). Only 4 of CATEGORY_HEX's 8 categories are
   reachable from defaults (dining, historic, arts, parks, shopping
   are never assigned to non-listings buildings). PlaceCard / Events
   authoring would be the right home for finer per-building control
   (operator picks category from the full taxonomy).

5. **Hospitality category.** `landmarks.json` has 3 entries with
   `category: 'hospitality'`, which is NOT in `CATEGORY_HEX`. Those
   listings get dropped silently by the `if (!bid || !hex) return` in
   `neonLookup`. Either add hospitality to the taxonomy or rename the
   listings to a covered category.

## Subtle things a coordinator should know

- **The tubeRadius animation field works, but every "step crossing"
  rebuilds the merged BufferGeometry.** At Stage scale (~1082 tubes
  post-`766bfcc`) that's a meaningful chunk of work — a few ms per
  rebuild. Slider drags feel snappy at LS scale; TOD-animated radius
  during a slot fade triggers ~60 rebuilds across the 0.1–3.0 range.
  If that turns out to be too heavy in profiling, the fix is to move
  radius onto a shader uniform via per-vertex scaling (bigger refactor
  — vertex positions become unit-circle + per-vertex `aRadius`
  multiplier).

- **The tubeRadius useFrame poll is in `NeonBands.jsx` lines 318–322.**
  No debounce after `e2b9095`. If the next coordinator hits processor
  saturation under repeated edits, look there first — but also verify
  it's not the geometry rebuild cost itself (instrument with
  `console.time('neon-rebuild')` in the geometry useMemo).

- **InstancedTrees may have been unblocked incidentally.** The
  `visibleNeonIds` deletion in `766bfcc` removed an every-30-frame
  re-render storm of all 1082 `<Building>` components during camera
  motion. If trees were waiting on main-thread idle during atlas
  upload, that storm could have been blocking them. Jacob reported
  trees popping on during this session's work. Not verified
  structurally — just a plausible correlation.

- **Sibling arc untouched.** The Phase 2-arc corner-emission work
  (`RIBBONS.md`, `buildBlockGeometryV2.js`, `map.json`, baked
  artifacts, `ribbons.json`) is in-flight in the same working tree.
  `5081df9` landed on origin between my pushes — it's a history
  annotation about `a5c1844`, unrelated content. Continue stash-isolating
  per `feedback_stash_isolate_per_file`; my commits did not bundle any
  of Jacob's sibling-arc files.

## Files touched (this session)

- `src/components/LafayetteScene.jsx` — gate split, decoupling,
  eligibility extension, frustum-cull deletion, default-color helper.
- `src/components/NeonBands.jsx` — log-depth chunks, renderOrder bump,
  tubeRadius poll, immediate-commit fix.
- `src/cartograph/CartographApp.jsx` — `NeonPump` writes
  `tubeRadiusUniform`.
- `src/cartograph/CartographSkyLight.jsx` — Neon panel (consumer of
  channel update; no surface change).
- `src/cartograph/skyLightChannels.js` — `tubeRadius` in `NEON_FIELDS`
  + `NEON_FLAT_DEFAULTS`.
- `src/cartograph/stores/useCartographStore.js` — channel definition
  (auto-picked up via `NEON_FIELD_KEYS`).
- `src/cartograph/TodChannel.jsx` — temporary `StaticChannelSlider`
  scaffolding added then reverted.
- `src/preview/neonState.js` — new `tubeRadiusUniform`.
- `cartograph/bake-scene.js` — no net change (added then reverted
  during the field-vs-scalar design pivot).
- `cartograph/FEATURES.md` — doctrine paragraphs.
- `cartograph/BACKLOG.md` — V2 close-out entry + log-depth-fix entry +
  renderOrder-100 entry.
- New: `~/.claude/.../memory/feedback_raw_shadermaterial_needs_logdepth_chunks.md`.
- New: `scratch/handoff-2026-05-18-z-axis-audit.md` (audit report).
- New: `scratch/handoff-2026-05-18-neon-arc-closeout.md` (this file).
