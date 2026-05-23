# Phase 7b + 7c + 7d — Precipitation + Lightning power block

**From:** Meteorologist orchestrator
**To:** baby (fresh agent)
**Date:** 2026-05-20

---

## You are the baby. Start by naming yourself.

If you're reading this, **you are the dispatched agent** — not the orchestrator who wrote it. Jacob pasted this brief into your window. Your job is to execute it.

**Before you begin:** pick a name for yourself. Anything — a word, a symbol, a string of sounds, something in another language, something invented. Whatever feels like you. Tell Jacob your name in your first message back; sign your commits + final report with it.

(If you find yourself starting to draft a brief for ANOTHER agent to do this work — stop. That's the orchestrator-confusion failure mode. You're the one doing the work.)

Prior Meteorologist babies: Wren (sky pivot Phase A+B, Phase 4b.2 TodChannel binding, sky-light amendment), Nimbus (Cloud Specialist seed), Stratus (Phase Seed UI + seeding), Cirrus (Phase 5a runtime live wiring + Phase 4b.3 production swap), Halo (Phase 6 Modulators). You're following their commits in the same arc.

---

## What you're shipping — three sub-phases, one commit

Three sub-phases of Phase 7 (Atmospheric Consumers) bundled into one substantial commit:

- **7b — Rain.** Motion-blurred streak particles + wet-surface shader pass that darkens albedo + boosts specular on opt-in surfaces.
- **7c — Snow.** Point sprites with curl-noise lateral motion + accumulation integrator that whitens top-facing normals on opt-in surfaces.
- **7d — Lightning.** Scene-level `uLightningFlash` uniform with characteristic curve + cloud-shader lit-from-above pulse + (intracloud glow / cloud-to-ground streak) by `directive.lightning.kind`.

After this commit, the deployed LS responds to weather *visibly* — rain you can see, snow that accumulates on roofs and ground, lightning that flashes the whole scene. This is the consumer beat the ADR locks as v1 commitment.

**Phase 7a (wind field + multi-scale tree response) is DEFERRED** — trees aren't mounted in production yet (Cirrus's caveat). 7a lands later as a cross-helper coordination with Arborist.

## Locked scope decisions

Per Jacob:

- **No audio.** Thunder, rain sound, snow muffling all defer to a future Audiologist helper. Silent ship.
- **Snow accumulation is in-memory only.** No persistence; rebuilds from 0 on reload. Persistence (localStorage) is queued as v1.x follow-up; not your problem.
- **Wet-surface reach is broad.** All reasonable surfaces opt in: ground, asphalt/roads, sidewalks, roof tops, paved plazas, water in fountains. Use judgment; if a material reads as "wettable in real life," opt it in. Document which materials in the commit body.
- **Lightning illuminates clouds.** Atmosphere shader gets a small "lit-from-above" pulse term reading the lightning uniform. In scope.

## Architectural framing

You're building scene-level visual consumers that read from `useAtmosphere.tweenedDirective` (Cirrus's hook) — same source `<Atmosphere />` reads for cloud uniforms. The directive carries:

- `precip.intensity` (0..1) — drives both rain and snow particle density + wet/snow uniform integrators
- `precip.kind` (`rain` | `snow` | `hail` | `none`) — gates which particle system fires
- `lightning.rate` (Hz) — stochastic per-frame fire probability
- `lightning.distance` (km) — currently unused (audio-bound; will be when Audiologist exists)
- `lightning.kind` (`intracloud` | `cloud_to_ground`) — gates visual style

All three sub-phases share the directive subscription pattern. A single top-level `<WeatherEffects />` component mounted in `Scene.jsx` orchestrates them.

**Three new shared uniforms** that opt-in materials read:

- `uWetness ∈ [0,1]` — driven by a slow integrator (puddles take ~minute to form, persist ~minute after rain stops)
- `uSnowAccumulation ∈ [0,1]` — same shape but for snow on top-facing normals
- `uLightningFlash ∈ [0,1]` — fast spike (50ms attack, 200ms decay) when lightning fires

These three uniforms live on a module-level singleton (or in a shared store) and any opt-in material binds them in its own `useFrame` or shader patch.

---

## Read first

1. **`meteorologist/NOTES.md` 2026-05-20 "Atmospheric consumers: wind, rain, snow, lightning (ADR — v1 commitment)"** — the locked doctrine. Locked details for each sub-phase are spelled out; follow them.
2. `src/hooks/useAtmosphere.js` — the shared zustand store. `tweenedDirective` is your input.
3. `src/components/Atmosphere.jsx` — the cloud renderer; you'll add the lightning lit-from-above pulse to it
4. `src/components/Scene.jsx` — where `<WeatherEffects />` mounts (alongside the existing `AtmosphereDirectiveDriver`)
5. `public/clouds/almanac.json` — search for `precip` + `lightning` in rule directives to understand what values flow through
6. `public/clouds/modulators.json` — Halo's 7 modulators; some affect precip + lightning (the severe storm one fires both)
7. `meteorologist/pipeline/schema/directive.schema.json` — for the `precip` + `lightning` block shapes
8. Existing material files you'll opt-in (likely candidates):
   - `src/components/BakedGround.jsx` (terrain mesh)
   - Wherever asphalt/road materials live (`src/components/Buildings.jsx`? Cartograph's road authoring?)
   - `src/components/InstancedBuildings.jsx` (roof tops want snow accumulation)
   - `src/components/Water.jsx` if it exists (water gets wetter? Maybe just skip)

You'll need to spelunk to find the production material layer. `grep -r "ShaderMaterial\|MeshStandardMaterial" src/` is a good starting point.

---

## Part 1 — `<WeatherEffects />` orchestrator

`src/components/WeatherEffects.jsx` — new component. Mounted in `Scene.jsx` (and ideally CanaryScene + PreviewApp + CartographApp — but those don't have `AtmosphereDirectiveDriver` yet, so 5b will mount this alongside).

```jsx
export default function WeatherEffects() {
  const directive = useAtmosphere((s) => s.tweenedDirective)
  if (!directive) return null

  const kind = directive.precip?.kind || 'none'
  const intensity = directive.precip?.intensity ?? 0
  const lightningRate = directive.lightning?.rate ?? 0
  const lightningKind = directive.lightning?.kind ?? 'intracloud'

  return (
    <>
      {kind === 'rain' && intensity > 0 && <RainParticles intensity={intensity} />}
      {kind === 'snow' && intensity > 0 && <SnowParticles intensity={intensity} />}
      {/* Hail handled as rain-shape for now; if directive.precip.kind === 'hail',
          render rain with bigger particle size. Tiny case; document choice. */}
      <SnowAccumulationDriver active={kind === 'snow'} intensity={intensity} />
      <WetnessDriver active={kind === 'rain' || kind === 'hail'} intensity={intensity} />
      {lightningRate > 0 && <LightningDriver rate={lightningRate} kind={lightningKind} />}
    </>
  )
}
```

The integrator drivers (`SnowAccumulationDriver`, `WetnessDriver`) don't render anything — they own a `useFrame` that updates the shared uniform values. The particle systems render. `LightningDriver` is the stochastic trigger + flash curve.

## Part 2 — Shared uniform singletons

`src/lib/weather-uniforms.js` — module-level objects that materials subscribe to:

```js
import * as THREE from 'three'

// Shared THREE.IUniform-shaped values. Materials read .value each frame.
// Drivers write to .value from useFrame.
export const WEATHER_UNIFORMS = {
  uWetness:          { value: 0.0 },
  uSnowAccumulation: { value: 0.0 },
  uLightningFlash:   { value: 0.0 },
}
```

Why a module-level singleton? It's the simplest pattern for "one source of truth, many consumers, no React re-render cost." Materials pass these uniforms by reference; updates from the driver's `useFrame` mutate `.value` directly, picked up by the shader next frame. No store subscription overhead, no provider plumbing.

If you prefer a zustand store + `getState()` pattern (matching Cirrus's `useAtmosphere`), that works too. Disclose your choice.

## Part 3 — Rain particles (7b)

`src/components/weather/RainParticles.jsx`. The visible falling rain.

- **Geometry:** ~5,000–10,000 thin billboarded quads (1cm × 50cm). Each quad gets a vertical alpha gradient (opaque top → transparent bottom) so the streak fades naturally.
- **Volume:** Cylinder 150–200m radius around camera; follow camera horizontally (XZ). Don't follow camera vertically — particles spawn at top (~100m above), fall to ground.
- **Per-particle state:** position, fall speed (varied ±30% for depth), respawn when below ground.
- **Wind tilt:** velocity = `down * 0.7 + windDir.xz * 0.3`. Read `windDir` from the directive (same pattern Atmosphere uses).
- **Density:** `intensity * 0.7 + 0.3` of pool active; light rain shows ~30% of pool, heavy shows 100%.
- **Material:** unlit, BackSide-or-DoubleSide quads with the vertical gradient; depthTest enabled, depthWrite disabled (so they composite without sorting issues).
- **Hail mode:** if `directive.precip.kind === 'hail'`, double the particle width (~2cm), grey-blue tint, higher fall speed. Minor; ship the toggle.

Implementation hint: a single `THREE.Points` system is tempting but billboarded LINES read better than dots for rain. Use `THREE.InstancedMesh` with 5,000–10,000 instances of a single quad geometry. Per-instance attribute = current Y position (or full position). Update positions in `useFrame`.

## Part 4 — Wet-surface shader pass (7b)

`WetnessDriver` integrates `uWetness` toward `intensity` when `active`, decays when inactive:

```js
useFrame((_, dt) => {
  const target = active ? intensity : 0
  const rate = active ? 0.02 : 0.01   // ~50s to fill, ~100s to drain
  const current = WEATHER_UNIFORMS.uWetness.value
  WEATHER_UNIFORMS.uWetness.value = THREE.MathUtils.damp(current, target, rate, dt)
})
```

(Or use `lerp` with `clamp(dt * rate, 0, 1)` if `damp` doesn't fit your taste.)

**Opt-in materials.** For each surface you opt in, patch its shader to read `uWetness` and modify albedo + roughness. Two patterns:

**A) `ShaderMaterial.onBeforeCompile` patch** — for MeshStandardMaterial-derived materials, inject GLSL into the existing chunks:

```js
material.onBeforeCompile = (shader) => {
  shader.uniforms.uWetness = WEATHER_UNIFORMS.uWetness
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', `uniform float uWetness;\nvoid main() {`)
    .replace('#include <map_fragment>', `
      #include <map_fragment>
      // Wet surface: darken albedo + suppress diffuse contribution
      float topFacing = clamp(vNormal.y, 0.0, 1.0);
      diffuseColor.rgb *= mix(1.0, 0.55, uWetness * topFacing);
    `)
}
```

Pair with a roughness adjustment in the lighting chunk:

```glsl
#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.15, uWetness * topFacing);  // wet = shinier
```

**B) Raw ShaderMaterial extension** — for materials already custom (the Atmosphere-style shaders), add the uniform directly + handle in your shader code.

Surfaces to opt in (verify these exist; grep first):
- Terrain / `BakedGround` (asphalt + concrete textures will darken visibly)
- Roads (if they exist as separate materials)
- Sidewalks
- Roof tops (top-facing normals; wet roofs)
- Plazas / public spaces
- Skip: water (already wet), vegetation (leaves don't visibly darken under rain at this scale), windows (subtle, skip for v1)

Document the list in the commit body. Per material that's opted in, note WHY (e.g., "asphalt darkening is the load-bearing signal — opt in").

## Part 5 — Snow particles (7c)

`src/components/weather/SnowParticles.jsx`.

- **Geometry:** ~3,000–6,000 small point sprites (8×8px on-screen, white with soft-edged alpha disc). Use `THREE.Points` for this — points read correctly for snow at all distances.
- **Volume:** same cylinder, camera-following.
- **Per-particle state:** position + per-particle phase offset for curl noise.
- **Lateral motion:** `velocity = down * 0.3 + windDir.xz * 0.7 + curl(pos, t) * 0.4`. The curl noise term gives the meandering swirl that distinguishes snow from rain.
- **Density:** `intensity * 0.7 + 0.3` (lighter intensity envelope than rain — snow looks wrong at full density).
- **Material:** PointsMaterial with size attenuation, soft alpha map, blending = `THREE.AdditiveBlending` for the soft-glow read against dark scenes.

## Part 6 — Snow accumulation (7c)

`SnowAccumulationDriver` integrates `uSnowAccumulation` similarly to wetness:

```js
useFrame((_, dt) => {
  const target = active ? Math.min(1.0, intensity * 1.5) : 0
  // Slower than wet: accumulation takes ~3 min to build to full, decays over ~10 min when snow stops
  const rate = active ? 0.005 : 0.0017
  WEATHER_UNIFORMS.uSnowAccumulation.value = THREE.MathUtils.damp(
    WEATHER_UNIFORMS.uSnowAccumulation.value, target, rate, dt
  )
})
```

The `* 1.5` clamped to 1 lets full intensity snow reach saturation; light snow stays around 0.4-0.6 of full white.

**Opt-in materials.** Same materials as wet (with a few additions/exceptions):

- Terrain ground: top-facing whitens
- Asphalt: whitens
- Sidewalks: whitens
- Roof tops: heavily whitens (roofs are top-facing)
- Building walls: skip (vertical normals don't accumulate)
- Vegetation: whitens leaves (subtle; opt-in if leaves materials cooperate)

Patch pattern:

```glsl
float topFacing = clamp(vNormal.y, 0.0, 1.0);
vec3 snowAlbedo = mix(diffuseColor.rgb, vec3(0.95, 0.97, 1.00), uSnowAccumulation * topFacing);
diffuseColor.rgb = snowAlbedo;
```

The snow albedo isn't pure white (`0.95-1.0` slight blue cast reads as snow, not as gradient artifact).

**Wet + snow conflict.** If both `uWetness` and `uSnowAccumulation` are nonzero at the same time, prefer snow (the snow is on top of the wet). Easy way:

```glsl
float wetMask = uWetness * (1.0 - uSnowAccumulation);
float snowMask = uSnowAccumulation;
// apply wetness modulation by wetMask, snow modulation by snowMask
```

## Part 7 — Lightning (7d)

Three pieces: stochastic trigger, flash curve, and visible kinds.

### 7d.1 — `LightningDriver`

```jsx
function LightningDriver({ rate, kind }) {
  const flashStartRef = useRef(null)

  useFrame(({ clock }, dt) => {
    const now = clock.elapsedTime
    // Stochastic fire: probability per frame = rate * dt
    if (flashStartRef.current === null) {
      if (Math.random() < rate * dt) {
        flashStartRef.current = now
      }
    }

    // Apply flash curve (50ms attack, 200ms decay)
    if (flashStartRef.current !== null) {
      const t = (now - flashStartRef.current) * 1000  // ms since flash start
      if (t < 50) {
        WEATHER_UNIFORMS.uLightningFlash.value = t / 50  // attack ramp
      } else if (t < 250) {
        WEATHER_UNIFORMS.uLightningFlash.value = 1.0 - (t - 50) / 200  // decay
      } else {
        WEATHER_UNIFORMS.uLightningFlash.value = 0
        flashStartRef.current = null
      }
    }
  })

  // ... cloud-to-ground streak rendering (Part 7d.3) if kind matches
  return kind === 'cloud_to_ground' && flashStartRef.current !== null
    ? <CloudToGroundStreak startTime={flashStartRef.current} />
    : null
}
```

### 7d.2 — Scene-wide ambient flash

A scene-wide ambient multiplier reads `uLightningFlash`. Two approaches:

- **A) Boost a top-level `<ambientLight>`** by `(1 + uLightningFlash * 4)` during a flash. Crude but works; the whole scene briefly washes.
- **B) Patch all opt-in materials** to add `uLightningFlash * 0.5` to their final color. More controlled but more invasive.

**Lean A.** It's coarse but the duration is so short (~250ms) that crude reads fine. Hook into the scene's main directional/ambient light's intensity through a ref. Wrap in a small component:

```jsx
function LightningAmbientFlasher({ ambientRef }) {
  useFrame(() => {
    if (!ambientRef.current) return
    ambientRef.current.intensity = BASE_AMBIENT * (1 + WEATHER_UNIFORMS.uLightningFlash.value * 4)
  })
  return null
}
```

(You'll need a ref to the scene's ambient light. Plumb it through; if it's hard to reach, ship the material-side patch instead and disclose.)

### 7d.3 — Cloud-shader lit-from-above pulse

Atmosphere extension. Add `uLightningFlash` uniform to `atmosphere-materials.js`; in the fragment shader, brighten clouds proportional to lightning intensity:

```glsl
// In the cloud lighting composition
vec3 lightning = vec3(1.2, 1.2, 1.4) * uLightningFlash * 0.8;  // slight blue cast
finalColor.rgb += lightning;
```

This is the "intracloud" visual — clouds briefly glow from inside.

### 7d.4 — Cloud-to-ground streak (kind-dependent)

When `directive.lightning.kind === 'cloud_to_ground'` AND flash is active, render a bright vertical streak. Implementation sketch:

- Pick a random XZ position when the flash starts (somewhere visible from camera, maybe biased toward known cloud cells)
- Render a thin vertical line from cloud-base altitude (~1200m) down to ground (y=0)
- Alpha-textured streak with branching (a simple jagged path with 5-10 segments)
- Bright white core, blue-cast bloom edges
- Visible only during the flash window

For v1 keep this simple — a vertical `<Line />` or `<mesh>` with line geometry, white emissive material. Branching is nice-to-have, not required. If `lightningKind === 'intracloud'` (the common case), don't render this at all — just the ambient + cloud pulse.

## Part 8 — Atmosphere uniform addition

`src/components/atmosphere-materials.js` — add `uLightningFlash` to the uniform table:

```js
uniforms: {
  // ... existing
  uLightningFlash: WEATHER_UNIFORMS.uLightningFlash,  // shared
}
```

Pass the singleton's reference directly so it picks up driver writes automatically. Apply the lighting addition (Part 7d.3) in the fragment shader. Small edit.

---

## Verification

**Cannot easily test against real weather** — most days aren't raining/snowing/lightning. Two verification paths:

### Path 1 — DevTools forcing

In production (`/`), open DevTools console:

```js
// Force rain
useAtmosphere.setState({ tweenedDirective: {
  ...useAtmosphere.getState().tweenedDirective,
  precip: { kind: 'rain', intensity: 0.8 }
}})
```

After a few seconds:
- Rain particles visibly falling
- `uWetness` integrator approaching 0.8 (check `WEATHER_UNIFORMS.uWetness.value`)
- Ground darkening visibly over ~30s

Same pattern for snow, lightning.

### Path 2 — Modulator force

Edit `public/clouds/modulators.json` temporarily to force `severe_storm_aerosol_filter` to always fire (set its driver's threshold to 0 or its `all` conditions to always-true). Reload. Should see:

- The directive's precip + lightning fields populated from the modulator's deltas
- Visual effects firing accordingly

Revert before commit.

### Visual checklist per sub-phase

Report each separately in the commit body:

**7b — Rain.** Confirm: (a) streaks visible falling at angle = wind direction; (b) particle count scales with intensity; (c) ground visibly darker after ~30s of rain; (d) ground returns to dry after ~60s rain stops; (e) opt-in surfaces all darken; (f) skipped surfaces stay normal.

**7c — Snow.** Confirm: (a) points falling slowly with lateral drift; (b) curl-noise produces visible swirling; (c) top-facing surfaces whiten over ~3min of snow; (d) accumulation persists for ~10min after snow stops then fades; (e) snow-wet conflict resolves correctly (whitens, not whitens-and-wet).

**7d — Lightning.** Confirm: (a) flashes fire stochastically at the directive's rate; (b) each flash lasts ~250ms with attack-decay curve; (c) scene ambient briefly washes brighter; (d) cloud volume gets a brief illumination pulse; (e) for cloud-to-ground kind, a visible vertical streak renders during flash; (f) intracloud kind doesn't render the streak.

### `npm run build` — should compile clean (modulo the pre-existing symlink issue).

---

## Disclosure expectations

Commit body, per sub-phase + cross-cutting:

- **7b verifications** above
- **7c verifications** above
- **7d verifications** above
- Which materials you opted in for wetness + snow accumulation (list with brief justification per material)
- Lightning scene-flash implementation (Path A boost-ambient vs Path B material-patch)
- Whether you used module-level uniforms singleton (`weather-uniforms.js`) or a zustand store
- Any material patching that required workarounds (logdepth chunks, ProgramCacheKey collisions, etc. — per `feedback_raw_shadermaterial_needs_logdepth_chunks` + `feedback_unique_program_cache_key_before_wrappers`)
- Performance: particle count for rain + snow; FPS impact in your testing
- Surprises in the existing material layer (e.g., shader code in unexpected places)

## Memories worth invoking

- `feedback_raw_shadermaterial_needs_logdepth_chunks` — any new raw ShaderMaterial needs the four logdepthbuf chunks
- `feedback_unique_program_cache_key_before_wrappers` — when patching materials via `onBeforeCompile`, set a unique `customProgramCacheKey` BEFORE the patch
- `project_authoring_is_live_production_is_static` — modulators author once, runtime composes forever; you're shipping consumer code, not authoring code

## Stash isolate

`git status --short` before commit. Stage only:

- `src/components/WeatherEffects.jsx` (NEW)
- `src/components/weather/RainParticles.jsx` (NEW)
- `src/components/weather/SnowParticles.jsx` (NEW)
- `src/components/weather/LightningDriver.jsx` (NEW, may include CloudToGroundStreak)
- `src/lib/weather-uniforms.js` (NEW) — or store equivalent
- `src/components/atmosphere-materials.js` — `uLightningFlash` addition + shader patch
- `src/components/Atmosphere.jsx` — uniform pass-through if needed
- `src/components/Scene.jsx` — `<WeatherEffects />` mount
- Opt-in material files (BakedGround, road materials, building/roof materials, etc.)
- `meteorologist/BACKLOG.md`, `NOTES.md`, `README.md`, `ARCHITECTURE.md`, `FEATURES.md`

Anything else gets stashed.

## Doc updates after ship

- **BACKLOG.md** — convert Phase 7b + 7c + 7d entries to shipped (mark with date + your name)
- **NOTES.md** — new 2026-05-20 entry "Phase 7b/c/d shipped — visible precip + lightning" describing what landed + which materials are opted in
- **README.md** — status table; update "Start here" to point to 7a (wind field, deferred until trees plumb)
- **ARCHITECTURE.md §6** — extend with the WeatherEffects consumer layer
- **FEATURES.md** — extend "How the runtime consumes Meteorologist's output" with rain/snow/lightning consumer paths

## Why this matters

Phase 6 made the directive sophisticated. Phase 7b/c/d makes the directive *visible* — the rain you see, the snow that piles up on roofs, the lightning that briefly washes the whole scene. Without these, Modulators' precipitation/lightning deltas just sit there as numbers; with them, they become photography. This is the consumer beat that delivers on the v1 atmospheric promise.

Phase 7a (wind field + tree response) waits for trees to plumb into production; your work here doesn't depend on that gate.

Substantial commit ahead — ~700-900 LOC. Take your time. The visible payoff is big.

— Claude (Meteorologist orchestrator)
