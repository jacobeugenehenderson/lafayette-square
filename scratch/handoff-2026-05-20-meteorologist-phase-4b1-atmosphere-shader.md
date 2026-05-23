# Meteorologist Phase 4b.1 — `<Atmosphere />` raymarched shader + statically-bound test cloud

Implement the v3 raymarched cloud shader. Replace `<CloudDome />` in `CanaryScene.jsx` with a new `<Atmosphere />` mounting a `BoxGeometry` slab + `ShaderMaterial` that volumetrically raymarches a procedural cloud field with all **five photoreal levers** (three-tier lighting, silver lining, self-shadowing, domain warping, vertical density gradient). **Hardcode** uniforms to `cumulus_humilis` values for this phase. **Do NOT** wire to active preset state — that's Phase 4b.2.

This is the biggest single piece of the project. Plan to take your time on the shader; everything else hangs off it.

---

## Read first, in this order

1. **`HANDOFF-clouds-day3-clouddome-v2.md`** §"Tune to principles, not to a reference image" (lines 58–118). **This is the canonical reference for shader tuning** and the verifiable checklist. The 5 photoreal levers are spelled out with explicit implementation hints; the verifiable checklist (lines 105–118) is your acceptance criteria. The doc's earlier "architectural plan" sections are SUPERSEDED — only the principles section is current.
2. **`meteorologist/SPEC.md` §"Runtime"** (search for `<Atmosphere />`) — the high-level architecture sketch: BoxGeometry slab at cloud altitude, raymarched in fragment shader, three quality tiers via `uQualityTier`, transition to multi-preset blend in v1.x.
3. **`src/components/CloudDome.jsx`** — your reference FBM + domain warp + Mie-scatter math. Lines ~50–100 have value-noise + FBM with two domain warp passes; lines ~130–180 have the Mie forward-scatter math you'll adapt for the silver-lining lever. **Crib the math, don't import the file** — `<Atmosphere />` is a fresh implementation.
4. **`src/meteorologist/CanaryScene.jsx`** — your mount point. The CloudDome you're replacing sits as `<CloudDome />` near the bottom of the JSX. Swap it for `<Atmosphere />`. Keep the `CloudCoverSeed` hack for now (it does nothing once Atmosphere is reading hardcoded uniforms, but it doesn't hurt; Phase 4b.3 retires it).
5. **`public/clouds/presets.json`** → find the `cumulus_humilis` entry (id `"cumulus_humilis"`). Its params (now in TodChannel shape) are your hardcoded uniform values for this phase. Concrete values listed in §"Hardcoded uniforms" below.
6. **`src/hooks/useSkyState.js`** — already drives CloudDome; Atmosphere reads from `useSceneJson(activeLookId)` instead (sun direction + intensity + tint come from the active Look's scene.json, not from useSkyState). See §"Sun direction sourcing" below.

---

## Scope (Phase 4b.1 only)

### Files to CREATE

```
src/components/
  Atmosphere.jsx                  ← React component: mount + uniform plumbing + useFrame ticker
  atmosphere-materials.js         ← shader factory: returns a configured ShaderMaterial
  atmosphere-shaders/
    atmosphere.vert.glsl          ← vertex shader (world-pos passthrough; logdepth chunks)
    atmosphere.frag.glsl          ← fragment shader (raymarch + 5 levers)
```

Inline the GLSL strings in `atmosphere-materials.js` if you prefer (the `.glsl` files are optional, but keep the shaders readable as named blocks).

### Files to MODIFY

```
src/meteorologist/CanaryScene.jsx     ← swap <CloudDome /> for <Atmosphere /> in both slot configs
```

That's it. NO changes to CloudDome.jsx (it stays — Phase 4b.3 retires it). NO changes to the store. NO changes to schemas, serve.js, or any other helper.

---

## Component shape

### `<Atmosphere />`

```jsx
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSceneJson } from '../lib/useSceneJson.js'
import { createAtmosphereMaterial } from './atmosphere-materials.js'

export default function Atmosphere({ lookId }) {
  const scene = useSceneJson(lookId)
  const material = useMemo(() => createAtmosphereMaterial(), [])
  const meshRef = useRef()

  useFrame(({ clock, camera }) => {
    // Update per-frame uniforms: time (for wind drift), sun dir (from scene.json),
    // camera position (for raymarch entry/exit).
    material.uniforms.uTime.value = clock.elapsedTime
    if (scene?.dirSun) {
      const { azimuth, elevation, intensity, tint } = scene.dirSun.values || {}
      // resolve at current TOD minute via animatedParam.resolveGroupAtMinute,
      // OR just use the flat default for Phase 4b.1 (Phase 4b.2 wires TOD).
      // Direction vector: from sun azimuth/elevation in degrees.
    }
    material.uniforms.uCameraPos.value.copy(camera.position)
  })

  // Slab geometry: BoxGeometry at cloud altitude, centered over canary.
  // Width/depth large enough to fill the visible sky from camera positions.
  // Height = thickness from cumulus_humilis = 500m, base = 1200m → spans y∈[1200, 1700].
  return (
    <mesh ref={meshRef} position={[0, 1450, 0]} material={material}>
      <boxGeometry args={[8000, 500, 8000]} />
    </mesh>
  )
}
```

Use **BackSide** rendering (`material.side = THREE.BackSide`) so the camera can be inside the slab without it being culled — raymarch happens against the back faces, ray enters at front (which is now the inside), exits at the back.

### `createAtmosphereMaterial()`

Returns a `THREE.ShaderMaterial` with:

```js
new THREE.ShaderMaterial({
  uniforms: {
    // Cloud-shape params (hardcoded cumulus_humilis values for 4b.1)
    uCoverage:       { value: 0.32 },
    uDensity:        { value: 0.85 },
    uBaseAlt:        { value: 1200 },
    uThickness:      { value: 500 },
    uWarpFreq:       { value: 0.001 },
    uWarpAmp:        { value: 280 },
    uNoiseSeed:      { value: 91 },
    uOctaves:        { value: 4 },
    // Lighting params (hardcoded cumulus_humilis values for 4b.1)
    uSunScatter:     { value: 1.3 },
    uAmbientFloor:   { value: 0.32 },
    uEdgeSilver:     { value: 1.05 },
    uShadowStrength: { value: 0.65 },
    uDrift:          { value: 1.0 },
    // Per-frame
    uTime:           { value: 0 },
    uSunDir:         { value: new THREE.Vector3(0, 0.7, 0.7).normalize() },
    uSunColor:       { value: new THREE.Color('#ffe6c8') },  // hardcoded warm noon for 4b.1
    uSkyColor:       { value: new THREE.Color('#9faab8') },  // hardcoded daytime sky base
    uCameraPos:      { value: new THREE.Vector3() },
    // Quality
    uSteps:          { value: 24 },   // primary raymarch steps (desktop_high)
    uShadowSteps:    { value: 6 },    // shadow march toward sun
  },
  vertexShader: ATMOSPHERE_VERT,
  fragmentShader: ATMOSPHERE_FRAG,
  side: THREE.BackSide,
  transparent: true,
  depthWrite: false,        // additive blending; don't occlude geometry behind
  depthTest: true,
})
```

**REMINDER:** raw `ShaderMaterial` does NOT chain `<logdepthbuf_*>` chunks automatically. Include the four chunks in vert + frag (`<logdepthbuf_pars_vertex>` / `<logdepthbuf_vertex>` / `<logdepthbuf_pars_fragment>` / `<logdepthbuf_fragment>`) per memory `feedback_raw_shadermaterial_needs_logdepth_chunks`. Otherwise the cloud will disappear at certain camera angles.

**Unique program cache key** before mounting (memory `feedback_unique_program_cache_key_before_wrappers`): set `material.customProgramCacheKey = () => 'atmosphere-v3'`. Doesn't matter much for Phase 4b.1 since there's only one Atmosphere mount; matters when Phase 4b.3 swaps multiple sites.

---

## Hardcoded uniforms (cumulus_humilis)

These are the operator-authored values for fair-weather cumulus, pulled from `public/clouds/presets.json` `cumulus_humilis.params.*.values.value`:

| Uniform | Value | Lever it drives |
|---|---|---|
| `uCoverage` | 0.32 | Fraction of slab volume that contains cloud |
| `uDensity` | 0.85 | Optical thickness multiplier |
| `uBaseAlt` | 1200 m | Cloud base altitude (world Y) |
| `uThickness` | 500 m | Vertical extent |
| `uWarpFreq` | 0.001 (1/m) | Domain warp noise frequency |
| `uWarpAmp` | 280 m | Domain warp amplitude (drives cauliflower lobing) |
| `uNoiseSeed` | 91 | FBM seed |
| `uOctaves` | 4 | FBM octave count |
| `uSunScatter` | 1.3 | Mie forward-scatter strength |
| `uAmbientFloor` | 0.32 | Min lit value in shadowed regions |
| `uEdgeSilver` | 1.05 | Silver-lining gain at thin density boundaries |
| `uShadowStrength` | 0.65 | Self-shadow opacity multiplier |
| `uDrift` | 1.0 | Wind-drift response |

Use these as literal initial values in `createAtmosphereMaterial()`. Phase 4b.2 will replace these with per-frame `resolveGroupAtMinute(channel, minute)` calls reading from the active preset; you can ignore that today.

---

## The five photoreal levers — implementation tasks

In priority order. Implement in this order; if you can't finish all five in one session, ship what you have AND mark the unfinished ones in the commit body (see "Fallback path" below).

### 1. Domain warping (cauliflower / lobe structure)

Per HANDOFF lever #4. Without this you get blob-noise; this is what makes cumulus look like cumulus. Two-pass FBM with domain warps; **crib from `src/components/CloudDome.jsx` lines ~50–100** (its `fbm()` function does exactly this).

```glsl
float fbm(vec3 p) {
  // First domain warp pass
  vec3 warp1 = vec3(
    noise(p + vec3(0.0, 0.0, 0.0)),
    noise(p + vec3(5.2, 1.3, 0.0)),
    noise(p + vec3(0.0, 2.7, 8.1))
  );
  p += warp1 * uWarpAmp * uWarpFreq;  // scale by uniform amplitude/frequency

  // Standard 4-octave FBM at p
  float sum = 0.0, amp = 0.5, freq = uWarpFreq;
  for (int i = 0; i < int(uOctaves); ++i) {
    sum += amp * noise(p * freq);
    freq *= 2.0; amp *= 0.5;
  }
  return sum;
}
```

CloudDome uses 2D noise; you'll want **3D noise** for a volumetric slab. Implement a 3D value-noise (`noise(vec3)`) — same hash function CloudDome uses, just on a 3D lattice. Or use a 3D Worley or 3D simplex if you find an open-licensed snippet you like; value-noise is simplest and fast enough.

**Verification:** cloud silhouette is irregular and convex-bumpy, not noise-clumpy.

### 2. Vertical density gradient (flat-base cumulus)

Per HANDOFF lever #5. Density inside the slab is **not uniform** — full in the middle, taper at top, taper at bottom. The bottom taper is what makes cumulus "sit on a flat layer."

```glsl
float verticalProfile(float y) {
  // y is the world-space height; uBaseAlt is the slab's bottom, uThickness is its height.
  float h = (y - uBaseAlt) / uThickness;        // 0 at base, 1 at top
  // Cumulus profile: hard floor at h≈0, slow ramp through h∈[0.1, 0.4],
  // peak at h≈0.5, gentle taper through h∈[0.5, 1.0].
  // smoothstep is your friend:
  float floor = smoothstep(0.0, 0.1, h);
  float ceil  = 1.0 - smoothstep(0.6, 1.0, h);
  return floor * ceil;
}

// In the raymarch sample:
float density = fbm(samplePoint) - (1.0 - uCoverage);
density = max(0.0, density);
density *= verticalProfile(samplePoint.y);
density *= uDensity;
```

The `coverage` uniform here is doing what its name says: shifting the FBM threshold so only the top `(1-coverage)` of the noise field contributes. Higher coverage = more cloud volume.

**Verification:** cumulus reads as sitting on a horizontal layer; base is visibly flat-ish.

### 3. Three-tier lighting (the killer feature)

Per HANDOFF lever #1. THE biggest lever. Three regions on every visible cloud point:
- **Sun-side cap**: warm-bright, top of the cloud
- **Body**: neutral mid-gray
- **Shadow-side/underside**: cool-dark, picks up sky color

The classic implementation: at each raymarch sample, compute density gradient → that's your "up-normal." Dot with sun direction → that's your sun-facing factor. Use it to lerp between three colors.

```glsl
// Approximate normal: density-gradient in 3 axes, ε-separated samples
vec3 cloudNormal(vec3 p) {
  float eps = 30.0;  // meters; tune
  vec3 n;
  n.x = sampleDensity(p + vec3(eps, 0, 0)) - sampleDensity(p - vec3(eps, 0, 0));
  n.y = sampleDensity(p + vec3(0, eps, 0)) - sampleDensity(p - vec3(0, eps, 0));
  n.z = sampleDensity(p + vec3(0, 0, eps)) - sampleDensity(p - vec3(0, 0, eps));
  return normalize(-n);  // outward
}

// Three-tier blend
float sunFactor = dot(normal, uSunDir);              // [-1, 1]
sunFactor = sunFactor * 0.5 + 0.5;                   // [0, 1]
vec3 sunSide = uSunColor * 1.3;                      // warm-bright top
vec3 body    = mix(uSkyColor, uSunColor, 0.6);       // neutral mid
vec3 shadow  = uSkyColor * uAmbientFloor;            // cool-dark base

vec3 litColor = mix(shadow, body, smoothstep(0.0, 0.5, sunFactor));
litColor     = mix(litColor, sunSide, smoothstep(0.5, 1.0, sunFactor));
```

**Verification:** visible sun-side / body / shadow-side distinction on the same cloud at noon. If your cloud is uniformly bright or uniformly grey, you haven't implemented this.

### 4. Self-shadowing

Per HANDOFF lever #3. From each raymarch sample, trace `uShadowSteps` (6) short steps **toward the sun**, accumulate density, multiply lit color by `exp(-shadowDensity × shadowStrength)`. Cheap + visually massive.

```glsl
float marchShadowDensity(vec3 p) {
  float shadowDensity = 0.0;
  float stepSize = uThickness / float(uShadowSteps) * 0.5;
  for (int i = 1; i <= int(uShadowSteps); ++i) {
    vec3 sp = p + uSunDir * stepSize * float(i);
    shadowDensity += sampleDensity(sp);
  }
  return shadowDensity;
}

// In the raymarch loop:
float shadow = exp(-marchShadowDensity(samplePoint) * uShadowStrength);
litColor *= shadow;
```

**Verification:** a thick cloud has a darker core than its periphery; thin clouds remain bright.

### 5. Silver lining (Mie forward-scattering)

Per HANDOFF lever #2. At sun-facing **thin** edges, light scatters through droplets → dramatic warm brightening. Compute `dot(viewDir, sunDir)` near 1 AND density low (we're at an edge) → boost.

```glsl
// In the raymarch loop, before accumulating into the integral:
float vdotS = dot(rayDir, uSunDir);             // [-1, 1]; 1 = looking toward sun
float forwardScatter = smoothstep(0.7, 1.0, vdotS);
float edgeFactor = 1.0 - smoothstep(0.0, 0.3, density);
float silver = forwardScatter * edgeFactor * uEdgeSilver * uSunScatter;
litColor += silver * uSunColor;
```

**Verification:** silver-lining edge visible when sun is behind a cloud (camera looks toward sun through a thin edge).

---

## Raymarch loop sketch

```glsl
void main() {
  vec3 rayOrigin = uCameraPos;
  vec3 rayDir    = normalize(vWorldPos - uCameraPos);

  // Slab AABB intersection: solve for t_enter and t_exit against the BoxGeometry.
  // The BoxGeometry is centered at (0, 1450, 0) with size (8000, 500, 8000).
  // Use slab method (component-wise t-min / t-max), clamp to >= 0 (don't march
  // backward from camera).
  float tEnter, tExit;
  if (!intersectSlab(rayOrigin, rayDir, tEnter, tExit)) {
    discard;  // ray misses slab
  }
  tEnter = max(tEnter, 0.0);

  float stepSize = (tExit - tEnter) / float(uSteps);
  vec3 stepVec   = rayDir * stepSize;
  vec3 p         = rayOrigin + rayDir * tEnter;

  vec4 accum = vec4(0.0);  // RGB premultiplied alpha
  for (int i = 0; i < int(uSteps); ++i) {
    float density = sampleDensity(p);   // FBM + warp + vertical profile + threshold
    if (density > 0.001) {
      vec3 n     = cloudNormal(p);
      vec3 lit   = threeTierLighting(n, uSunDir, uSunColor, uSkyColor);
      lit       *= selfShadow(p);
      lit       += silverLining(rayDir, uSunDir, density);

      // Front-to-back accumulation:
      float alpha = (1.0 - accum.a) * density * stepSize * 0.005;  // tune the 0.005 multiplier
      accum.rgb += alpha * lit;
      accum.a   += alpha;
      if (accum.a >= 0.99) break;  // early-out when opaque
    }
    p += stepVec;
  }

  gl_FragColor = vec4(accum.rgb, accum.a);
}
```

The `0.005` multiplier in the alpha accumulation is a rough conversion from "density per meter" to "opacity per step"; you'll likely tune it. Start there.

---

## Sun direction sourcing

For Phase 4b.1, sun direction can be either:

- **Option A (simplest, recommended for 4b.1):** hardcode `uSunDir` to a fixed warm-noon angle (e.g., `vec3(0, 0.7, 0.7).normalize()` — 45° above horizon, southwest-ish). Don't bother with TOD-scrubbed sun for this phase.
- **Option B (if trivial):** read `scene.dirSun.values.azimuth` + `scene.dirSun.values.elevation` from `useSceneJson(lookId)`, convert to a unit vector, pass to material in `useFrame`. The scene.json is shared with CelestialBodies in the same Canvas, so the sun position is consistent.

Pick A unless you find yourself with extra time after the 5 levers. Phase 4b.2 will wire B properly via TOD resolution.

---

## Slot framings

`CanaryScene` has two slots: `chamber` and `ground`. Both should render the same `<Atmosphere />`. The camera positions are different (configured in `canaryCamera.js`), but the cloud shader itself doesn't need to know which slot — the BoxGeometry slab is large enough (8km × 8km × 0.5km) to fill the sky from both vantage points.

If you find one slot's framing crops the cloud awkwardly, surface it. Don't expand the slab to 20km without disclosing — wider slabs cost raymarch budget.

---

## Quality tier (mobile vs desktop)

Phase 4b.1 ships **desktop_high** only:
- `uSteps: 24` (primary raymarch)
- `uShadowSteps: 6` (toward-sun shadow march)

The `uQualityTier` selector for phone_high / phone_low (per SPEC.md) is Phase 5+ polish. For 4b.1 just ship the 24/6 path; we'll trim mobile if Preview's GPU panel reports we're over-budget.

**Mobile budget reference** (memory `feedback_mobile_first_preview`): full scene must stay under ~200 calls / 1M tris / 256MB GPU. Atmosphere is one draw call (the BoxGeometry), 12 tris. The cost is the fragment shader's raymarch — 24 primary × 6 shadow = 144 noise samples per pixel. At 1920×1080 that's ~300M samples per frame. Heavy but feasible; we'll measure in Preview after 4b lands.

---

## Out of scope (DO NOT in Phase 4b.1)

- **No reading from active preset.** Uniforms are hardcoded to cumulus_humilis values. Phase 4b.2.
- **No TodChannel uniform binding** (no `resolveGroupAtMinute` calls). Phase 4b.2.
- **No CloudDome retirement.** Leave `CloudDome.jsx` in place; just swap the mount in CanaryScene. Phase 4b.3.
- **No mobile-quality variant.** Single quality tier. Phase 5+.
- **No multi-preset blending** (the directive.clouds[] up-to-3-blend system). Phase 5+.
- **No wind authoring** beyond `uDrift` being one of the hardcoded uniforms. Wind offset accumulator can be a global `vec3` constant or driven by `uTime`; don't wire to Almanac's `wind.dir`/`wind.scale` yet.
- **No post-FX changes.** Don't touch Bloom, AO, etc. Atmosphere is just another transparent mesh in the scene graph; bloom interaction is its own validation later.
- **No new dependencies.**
- **No edits to CloudDome.jsx or any other production file** outside CanaryScene.jsx.

---

## Fallback path (if all 5 levers don't land in one session)

The 5 levers compound — each multiplies what came before. If you run out of time / variance is high, ship what you have and disclose the unfinished ones in the commit body. **Minimum-viable Phase 4b.1**:

1. Domain warping ✅ (lever 4) — non-negotiable; without it you have noise blobs
2. Vertical density gradient ✅ (lever 5) — without it cumulus is a sphere, not flat-based
3. Three-tier lighting ✅ (lever 1) — the killer feature; without it the cloud is a uniform grey blob

If you can ship 1+2+3 only, that's a real Phase 4b.1. Levers 4 (self-shadow) and 5 (silver-lining) become a follow-up sub-phase (4b.1b). Document the cut clearly in the commit body so the next baby picks them up.

**What you must NOT ship without:** any of the three above. Three-tier lighting in particular — if the cloud reads as uniform gray, the whole exercise failed.

---

## Verification

The HANDOFF checklist (lines 105–118) is your acceptance criteria. Each line passes or fails individually:

1. ✅ Visible **sun-side / body / shadow-side** distinction on the same cloud at noon (with the hardcoded warm-noon sun direction).
2. ✅ **Silver-lining edge** visible when you orbit the camera so the sun is behind the cloud (might need a temporary debug camera if your slot framings don't expose this).
3. ✅ **Self-shadowing**: a thick cloud has a darker core than its periphery.
4. ✅ **Cauliflower lobes**: cloud silhouette is irregular and convex-bumpy, not noise-clumpy.
5. ✅ **Flat-ish base**: cumulus reads as sitting on a horizontal layer.
6. ⏭ Color shift across TOD — Phase 4b.2 (driven by TOD-resolved uSunColor / uSkyColor).
7. ⏭ Weather-type morph — Phase 5+ (different preset binding).
8. ⏭ Wind drift visible — uDrift wired but no Almanac connection yet; just check `uTime`-driven offset moves the cloud.
9. ✅ **No popping or flickering** during slot toggle (CanaryScene's `key={slot}` remount may briefly blank the cloud; that's OK — should not flicker mid-render).
10. ⏭ Mobile budget — measure in Phase 5+ with Preview's GpuPanel.

Plus standard:
- `npm run dev` boots clean; no shader compile errors in console.
- `npm run validate -- public/clouds/presets.json public/clouds/almanac.json` → `ok: 52 presets, 16 rules` (no schema changes, validator should still pass).
- Switch between Teapot/Conditions modes; click any cloud or condition → Atmosphere renders in both viewports.
- Browser console: no R3F mount errors, no GLSL compile errors. WebGL extension warnings about derivatives are OK if you use `dFdx`/`dFdy` anywhere.

---

## Stash-isolate per file

```bash
git stash push -- \
  src/components/Atmosphere.jsx \
  src/components/atmosphere-materials.js \
  src/components/atmosphere-shaders/ \
  src/meteorologist/CanaryScene.jsx
```

**Then immediately run `git status --short` and verify ONLY those paths are staged** — per the amended `feedback_stash_isolate_per_file` memory, Jacob may have pre-staged files from a prior session that `git diff` doesn't show. If you see staged paths you don't recognize, `git reset HEAD -- <those-paths>` to unstage. Phase 4a baby caught a 10-file slip via this check; don't skip it.

---

## Surface anything not in this brief

Likely OK drifts (just disclose):
- A debug uniform like `uDebugMode` (returns raw density / pure FBM / etc. for visual debugging). Useful during shader iteration; can stay or be removed.
- A helper function file like `src/components/atmosphere-noise.glsl` if you want to factor out the 3D noise + FBM separately.
- A different alpha-accumulation constant (the `0.005` placeholder). Tune it.
- Reading scene.dirSun for the sun direction (Option B above) if it's trivial.

Likely NOT OK:
- Reading from active preset / TodChannel resolution → Phase 4b.2.
- Retiring CloudDome.jsx or swapping mounts outside CanaryScene → Phase 4b.3.
- Adding post-FX or modifying any Canvas-level settings beyond what CanaryScene already has.
- Mobile-quality fork (`uQualityTier`-driven step counts) → Phase 5+.
- Multi-preset blend → Phase 5+.

Memory: `feedback_baby_must_surface_scope_drift`.

---

## Memories to respect

- `feedback_raw_shadermaterial_needs_logdepth_chunks` — **load-bearing for this phase.** Include the four `<logdepthbuf_*>` chunks in vert + frag. Symptom of forgetting: cloud disappears at some camera angles.
- `feedback_unique_program_cache_key_before_wrappers` — set `material.customProgramCacheKey = () => 'atmosphere-v3'` so three's program cache doesn't collapse this onto a sibling material.
- `feedback_no_reference_image_hunting` — tune by first-principles physics + the HANDOFF's verifiable checklist; do NOT ask Jacob for reference photos.
- `feedback_beautiful_first_lightweight_51` — 49% beautiful / 51% stable+lightweight. Don't crank step counts hoping for fidelity; the levers compound multiplicatively, not additively. A 12-step march with good domain warping reads better than a 64-step march with no warping.
- `feedback_stash_isolate_per_file` (amended) — per above.
- `feedback_baby_must_surface_scope_drift` — per above.

---

## Phase 4b.2 preview

Once Atmosphere renders, the next step is wiring TodChannel resolution. The 13 hardcoded uniforms in `createAtmosphereMaterial()` get replaced with per-frame calls to `resolveGroupAtMinute(activePreset.params[paramKey], currentMinute)` to extract the scalar value at the current TOD. Slider scrubs in Teacup's right rail now visibly affect the viewport. Animated channels (operator has authored multiple TOD slots) lerp between keyframes as time scrubs.

Phase 4b.3 retires CloudDome and swaps the production mount sites.

---

## Commit + report

Single commit on `cartograph-looks-pass-ab`. Message shape:

```
meteorologist: Phase 4b.1 — Atmosphere raymarched shader (cumulus_humilis hardcoded)

Implements the v3 volumetric cloud shader with the five photoreal
levers per HANDOFF-clouds-day3-clouddome-v2.md:

1. Domain warping (cauliflower lobes via two-pass 3D FBM domain warp)
2. Vertical density gradient (flat-base cumulus profile)
3. Three-tier lighting (sun-side / body / shadow-side via density-gradient normal)
4. Self-shadowing (6-step shadow march toward sun, exp falloff)
5. Silver lining (Mie forward-scatter at thin sun-facing edges)

Hardcoded uniforms to cumulus_humilis values from presets.json. No
active-preset binding (Phase 4b.2). CloudDome.jsx retained; swap of
production mount sites is Phase 4b.3.

Created:
- src/components/Atmosphere.jsx — mount + uniform plumbing + useFrame ticker
- src/components/atmosphere-materials.js — shader factory
- src/components/atmosphere-shaders/{atmosphere.vert,atmosphere.frag}.glsl

Modified:
- src/meteorologist/CanaryScene.jsx — <CloudDome /> → <Atmosphere />

Verification:
- All five HANDOFF checklist items 1-5 visible at default cumulus_humilis params
- Three-tier lighting differentiates on every visible cloud
- Cloud reads as flat-based cumulus, not a sphere or noise blob
- No GLSL compile errors; no R3F mount errors
- Logdepth chunks included; cloud renders at all camera angles
- Validator clean (no schema changes)

Co-Authored-By: <baby name> <…>
```

Report back to Jacob with: commit hash, scope-drift disclosures, which of the 5 levers landed (if not all), surprises, browser-side verification status against the HANDOFF checklist (1-5 minimum, 9), and a thumbs-up.
