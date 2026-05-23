# Z-axis / depth-buffer audit — LS Stage + production render path

Date: 2026-05-18.
Branch: `cartograph-looks-pass-ab`.
Constraint: research-only, no commits, no production code edits.

## TL;DR

The neon-tube overhead-disappearance has a single root cause that the
prior debug pass missed: **`logarithmicDepthBuffer: true` is enabled on
the Canvas (`src/cartograph/CartographApp.jsx:801`), but `NeonBandsV2`'s
raw `ShaderMaterial` does not include the `<logdepthbuf_*>` GLSL chunks.**
The tube fragments write *linear* gl_FragDepth into a *logarithmic*
depth buffer that every other opaque mesh in the scene writes correctly
(MeshStandardMaterial chains the chunks automatically when log-depth is
on; raw ShaderMaterial does not). The two depth scales are not
commensurable, so the depth comparison between tube fragments and any
opaque scene fragment that happens to be co-located in screen-space
returns garbage — sometimes the tube wins, sometimes it loses, with a
camera-angle-dependent bias. From an overhead camera that bias goes
"lose" for most of LS.

This also explains the prior puzzle that `polygonOffsetFactor: -10,
polygonOffsetUnits: -10` did not restore the tubes: polygonOffset
biases the *linear* z value the tube fragment writes. The scene
fragments it competes against are at *log-scaled* z. No magnitude of
linear polygonOffset can move the tube past those values into the
right ordering — it's the wrong axis.

`depthTest: false` works because it bypasses the broken comparison
entirely.

## A. Inventory of opaque depth-writers in Stage

Walked LafayetteScene + the Stage/Browse Canvas mount path
(`CartographApp.jsx:786–870`). All mounted opaque depth-writers, plus
how they handle terrain lift and depth:

| Mesh | File:line | Y range (approx) | renderOrder | polygonOffset | depthWrite | terrain lift | log-depth correct? |
|------|-----------|------------------|------------|---------------|------------|--------------|--------------------|
| Foundations (merged) | `LafayetteScene.jsx:341–490` | -0.4 to +pedestal (≤1.2m) above mean-corner-raw | default 0 | none | true | aCentroidY × uExag on MeshStandardMaterial onBeforeCompile | ✅ chunked |
| Building walls + roofs | `LafayetteScene.jsx:604–969` | foundation top → foundation+size[1]+peakHeight | default 0 | none | true | `patchTerrainAtCentroidRaw` (MeshStandardMaterial) | ✅ chunked |
| BakedGround FadeMesh | `BakedGround.jsx:139–202` | terrain ± per-group offset | per-group | yes (factor 0, units −renderOrder) | true | `patchTerrain(perVertex:true)` MeshStandardMaterial | ✅ chunked |
| BakedGround GrassMesh | `BakedGround.jsx:204–247` | same | per-group | yes (parity with FadeMesh, 2026-05-13) | true | `patchTerrain(perVertex:true)` MeshStandardMaterial | ✅ chunked |
| LafayettePark paths / lake banks / ponds / elevated | `LafayettePark.jsx` (multiple) | 0–0.5m | various | yes (factor −1, units −1 on paths) | true | per-item terrain (PondGroup / ElevatedGroup) | ✅ chunked (MeshStandard) |
| InstancedTrees | `InstancedTrees.jsx` (atlas billboards or mesh) | 0–25m | default | none | true | `patchTerrainInstanced` | ✅ chunked |
| StreetLights — lamp posts/heads (opaque) | `StreetLights.jsx:108–185` | 0–~6m | default | none | **various: glow/halo/pool/base all `depthWrite:false`**; the underlying post mesh is MeshBasic + patchTerrainInstanced | true on the post | ✅ chunked (MeshBasic + standard chunks) |
| GatewayArch | `GatewayArch.jsx:152` | high | varies | none | true (one mesh) | rigid | ✅ chunked |
| MapLayers — Stage-active subset | `MapLayers.jsx`, with `'ground'` in SHOT_SKIP (FEATURES.md L332) | 0–0.1m | various | yes | true | inherits from MeshStandard | ✅ |
| ClickCatcher | `LafayetteScene.jsx:971–979` | -0.5m | default | none | n/a — `<meshBasicMaterial visible={false}/>` (Material.visible=false, render skipped) | none | n/a (not drawn) |
| **NeonBandsV2 (TUBE)** | `NeonBandsV2.jsx:271–383` | rooftop+0.3 → rooftop+2.3, plus aCentroidY×uExag (≈10–25m lift) | **20**, `frustumCulled={false}` | none | **false** (transparent additive) — but `depthTest` defaults to **true** | aCentroidY × uExag, hand-rolled in VERT | **❌ raw ShaderMaterial, no logdepth chunks** |

Transparent additive / no-depth-write meshes are not depth-writers and
thus cannot occlude the neon. The SelectionRing (`LafayetteScene.jsx:567–574`),
all StreetLights glow / halo / pool / bulb materials, and sky/celestial
ShaderMaterials all match this. They are not the suspect.

## B. The depth-writer occluding the tubes

Identified: **no single opaque mesh is the wrong one.** Every opaque
depth-writer in the inventory is doing the right thing for the
logarithmic buffer. The tube is the one writing incorrect depth, and
losing the comparison against essentially every opaque fragment that
happens to be screen-coincident from above.

Evidence converging on this:

1. `NeonBandsV2.jsx:218–267` defines a raw `ShaderMaterial` with custom
   `vertexShader` / `fragmentShader` strings. The vertex emits
   `gl_Position = projectionMatrix * viewMatrix * wp` and does not
   `#include <logdepthbuf_pars_vertex>` or `<logdepthbuf_vertex>`. The
   fragment does not `#include <logdepthbuf_pars_fragment>` or
   `<logdepthbuf_fragment>`. The material constructor at line 346 also
   omits a `defines: { USE_LOGDEPTHBUF: '' }` block.
2. The Canvas explicitly opts into `logarithmicDepthBuffer: true`
   (`CartographApp.jsx:801`, with a comment citing the 2026-05-13 water /
   treelawn fixes — operator already had z-precision issues at altitude
   and turned this on as the cure). FEATURES.md §"Layering / coplanar
   stacking / depth precision" (L241+, L252+) documents the decision.
3. All other opaque depth-writers in the inventory are
   `MeshStandardMaterial` / `MeshBasicMaterial`; when log-depth is on,
   three.js's WebGLPrograms patches the standard chunks for these
   automatically. They write log-scaled gl_FragDepth via
   `<logdepthbuf_fragment>`.
4. `depthTest: false` makes the tubes appear (operator's diagnostic).
   This is consistent with — and *only* consistent with — a broken
   depth-test, not a stencil / renderOrder / blending issue.
5. `polygonOffset: -10/-10` does not help. Linear polygonOffset cannot
   compensate for a fragment that's writing depth on the wrong scale.

The "occluder" is therefore the *whole opaque scene*: roofs, walls,
parkland, ground groups, even foundations below grade — any of them
can win the test against a tube fragment depending on whose linear
z happens to clamp to a number that exceeds the log-mapped fragment.

## C. Z-fighting hotspots

I did not start the dev server (per the no-edit guard and the brief's
research-only constraint), so I'm citing what's already documented in
FEATURES.md plus what the inventory surfaces as structural risk:

1. **FadeMesh / GrassMesh coplanar parcels.** Documented at
   FEATURES.md L300–304; 2026-05-13 fix added polygonOffset parity to
   GrassMesh. Currently resolved.
2. **MapLayers `ground` plane vs BakedGround park faces.** Documented
   at FEATURES.md L332; `SHOT_SKIP` includes `'ground'` for shot mode.
   Currently resolved.
3. **LafayettePark paths vs lake banks vs bridges.** PATH_LAND_Y 0.4,
   PATH_BRIDGE_Y 0.5, water 0.35; path material carries
   polygonOffset −1/−1 (LafayettePark.jsx:301–303). Currently resolved.
4. **Tube ↔ opaque scene (this audit).** Not previously catalogued
   because the symptom — disappearance, not flicker — was read as a
   geometry/visibility bug, not a depth-precision bug.
5. **Foundation top ↔ wall base seam.** Foundation top sits at `+fh`,
   wall mesh's local Y starts at 0 (translated by foundationY in mount).
   They are coincident at a single Y plane per building. No flicker
   reported; the wall is opaque on top of the foundation, no transparent
   overlay, depth-write-order from mesh ID ordering is consistent. Not
   currently a regression but a candidate for future polygonOffset
   hygiene.
6. **All other raw `ShaderMaterial` mounts that *do not* `depthWrite`:**
   GatewayArch line 450 (depthWrite:false), CloudDome, PlanetariumOverlay
   227/376, CelestialBodies (5 instances), all StreetLights billboards.
   These are safe — they read depth from the buffer (which can return
   slightly-stale values relative to the log scale but still monotonic
   in the camera's projective sort, so additive layers degrade quietly
   rather than vanish) and they don't write depth that anyone else
   competes against. **NeonBandsV2 is the only raw ShaderMaterial whose
   geometry actively participates in opaque sort** through its
   `depthTest: true` default.

## D. Near / far plane analysis

`PerspectiveCamera` at `CartographApp.jsx:818–820` uses `near=1`,
`far=60000`. That is a 60,000:1 ratio. In a *linear* 24-bit depth
buffer this would be dangerously sparse: ~90% of precision lives in
the first few meters; at Browse altitude (~1.3km up) the 35cm
water-above-ground gap is at the edge of resolvable precision and would
intermittently swap depth bins, sinking water into ground (the
2026-05-13 symptom).

With `logarithmicDepthBuffer: true` the precision is redistributed —
roughly equal absolute precision at every distance — so sub-meter gaps
remain resolvable at any reasonable altitude. The cost is ~5% (cited in
FEATURES.md L252).

Practical range for LS: shows in plain reading of the camera mount —
near ~1m for street/planetarium hero zoom, far has to clear the
fog-disabled sky dome (≤60000m). The current near/far is conservative
but appropriate; the failure mode here is *not* the dynamic range
itself, it's the **mixed depth encoding** between log-aware and
log-unaware materials. With every depth-writer log-aware, the current
range is fine. Tightening near (e.g., to 5) would buy precision but
not fix the categorical mismatch.

## E. Neon fix recommendation

Recommended fix: **add the four `<logdepthbuf_*>` chunks and the
`USE_LOGDEPTHBUF` define to NeonBandsV2's ShaderMaterial.** Specifically:

```js
new THREE.ShaderMaterial({
  defines: { USE_LOGDEPTHBUF: '' },
  vertexShader: `
    #include <common>
    #include <logdepthbuf_pars_vertex>
    attribute vec3 aColor;
    attribute float aCentroidY;
    uniform float uExag;
    varying vec3 vColor;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;
    void main() {
      vColor = aColor;
      vec3 lifted = position;
      lifted.y += aCentroidY * uExag;
      vec4 wp = modelMatrix * vec4(lifted, 1.0);
      vWorldPos = wp.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * wp;
      #include <logdepthbuf_vertex>
    }
  `,
  fragmentShader: `
    #include <common>
    #include <logdepthbuf_pars_fragment>
    ...existing uniforms / varyings...
    void main() {
      #include <logdepthbuf_fragment>
      ...existing body...
      gl_FragColor = vec4(emissive, alpha);
    }
  `,
  ...rest unchanged...
})
```

Cost analysis:

- **Visual:** Restores correct occlusion at all camera angles, including
  overhead. Tubes still get correctly occluded by their own roof and by
  trees / lamps that genuinely sit between them and the camera. No
  visible difference from the present "depthTest:false at every angle
  except overhead" state when the tube is *not* being occluded — the
  fix is invisible when the comparison was previously winning.
- **Perf:** Negligible. The chunks add ~3 GLSL ops per vertex / fragment.
- **Doctrine:** Aligns NeonBandsV2 with the rest of the renderer.
  Removes a structural inconsistency that would have re-bitten
  whoever next added an opaque-competing ShaderMaterial.
- **Generalizes to (C):** This is the doctrine-level fix. See §F.

Alternatives considered and rejected:

- **renderOrder up + transparent-queue position:** Already
  `renderOrder: 20`, `transparent: true`. Three.js sorts transparents
  back-to-front by mesh centroid; even so, the depthTest comparison
  against opaque depth-buffer is per-fragment, and that's where the
  log/linear mismatch bites. RenderOrder doesn't disable depthTest.
- **`depthTest: false`:** Tubes appear, but they also draw OVER trees /
  lamps / buildings that should occlude them from oblique angles. Loses
  the parallax cue that the tube is physically *on* the wall. Not a
  fix; a debug bypass.
- **polygonOffset more aggressively:** Already shown not to work
  (linear-vs-log scale mismatch). No headroom in this axis.
- **Move tubes to higher renderOrder above bloom:** Bloom is a
  post-process; renderOrder doesn't reach it. Irrelevant.
- **Fix the underlying depth-writers:** Nothing is wrong upstream — they
  are all log-aware. This would be a misdiagnosis.

## F. Broader z-axis recommendation

The audit surfaces one **structural** rule the codebase has been
relying on implicitly and is documented only obliquely in FEATURES.md:

> **Any raw `THREE.ShaderMaterial` in this codebase that participates in
> the opaque depth queue (i.e., `depthTest: true` against scene
> fragments) must include the `<logdepthbuf_*>` chunks and define
> `USE_LOGDEPTHBUF`. MeshStandardMaterial / MeshBasicMaterial chained
> via `onBeforeCompile` are exempt — three.js handles those.**

The codebase has 12+ raw ShaderMaterials (see Bash grep in audit).
Today, NeonBandsV2 is the only one with `depthTest:true` against opaque
scene fragments — the rest are `depthWrite:false` additive billboards
(sky, sun/moon, lamp glow / halo / pool, planetarium overlay,
GatewayArch glow) where the read-side mismatch is invisible. Going
forward, however, the production code is one merge away from this
recurring. Suggested doctrine entries (BACKLOG candidates, not commits):

1. Add a one-paragraph rule to `cartograph/FEATURES.md` §"Layering /
   coplanar stacking / depth precision" stating the above explicitly,
   with NeonBandsV2 as the example.
2. Add a memory: `feedback_shadermaterial_needs_logdepth_chunks`,
   linked from `project_terrain_doctrine_2026_05_14`. Note the
   diagnostic tell (depthTest:false rescues, polygonOffset doesn't).
3. Consider a tiny `withLogDepthBuf(shaderOpts)` helper in
   `src/utils/terrainShader.js` (or a new `src/utils/depthBuf.js`) that
   accepts `{vertexShader, fragmentShader, defines}` and returns the
   chunk-injected version. Centralizes the rule; mirrors how
   `patchTerrain` centralizes the terrain-lift convention.

The five existing z-fighting hotspots listed in §C are all already
resolved by polygonOffset / SHOT_SKIP / per-mesh Y selection. No
additional remediation needed there.

## Surprising / out of scope

1. **`<meshBasicMaterial visible={false}/>` in ClickCatcher.** Material
   has its own `.visible` flag (defaults true). When set to false the
   renderer skips the mesh entirely. Working as intended, but worth
   flagging — to a reader who knows only `Object3D.visible`, this looks
   like it should still render an invisible-but-depth-writing plane at
   y=−0.5, and the diagnostic instinct on a depth-overdraw symptom is
   to suspect this first. It is innocent.
2. **`frustumCulled={false}` on NeonBandsV2's mesh** (line 382) is
   correct given the GPU lift — the CPU-fit bounding sphere sits at
   pre-lift Y. Comment at lines 336–340 captures the reasoning. No
   change needed.
3. **The `[neonV2]` diagnostic console.log at lines 308–334.** Operator
   has it confirming centroidY 9–26 m range. That data is consistent
   with the lift mechanism working correctly — the disappearance is
   *not* a wrong-Y bug. Once the logdepth chunks land, the log can come
   out (the brief flagged this as in-flight state; preserve until then).
4. **`ROOF_DROP = -TUBE_RADIUS`** (NeonBandsV2.jsx:47, in-flight
   uncommitted) is consistent — places the tube's bottom flush with the
   rooftop instead of bisecting the wall. Independent of the depth fix;
   keeps the wall geometry clear of the tube bottom in any case.
5. **There is no depth-prepass, no custom renderTarget config, and no
   shader chunk override** elsewhere in the renderer that would shift
   the diagnosis. The depth pipeline is vanilla three.js + log-depth +
   the post-process composer.
