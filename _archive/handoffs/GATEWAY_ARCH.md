# Gateway Arch — Technical Handoff

## Overview

`src/components/GatewayArch.jsx` renders a 3D Gateway Arch using the real NPS catenary equation. It's a custom `BufferGeometry` with a triangular cross-section (3 faces), `MeshStandardMaterial` with `onBeforeCompile` shader injection for panel detail, edge glint, and foot blending.

## Geometry

The arch shape comes from the actual NPS catenary: `y = A - B * cosh(C * x)` where A=211.5, B=20.96, C=0.03292. The cross-section is an equilateral triangle that tapers from `BASE_RADIUS=6.0` at the feet to `TOP_RADIUS=2.0` at the peak. 120 segments along the curve, 3 faces per segment.

Two custom vertex attributes:
- `aCurveParam` (0→1): position along the catenary from left foot to right foot
- `aEdge` (0 or 1): 0 at face center, 1 at triangle edges — used for seams and glint

## Positioning & Scale

```
ARCH_POSITION = [1470, 0, -490]   // world XZ — behind the neighborhood
ARCH_SCALE    = 2.66              // uniform scale
ARCH_Y_OFFSET = -165              // lowers the arch so legs extend below ground
ARCH_FIXED_ROTATION = 1.36        // Y-axis rotation (radians)
```

The arch is placed at x=1470, well beyond the neighborhood's building extent (x: -512 to 724). From the hero camera at `[-400, 40, 230]` looking toward `[400, 40, -100]`, the arch appears on the skyline behind the buildings.

**The arch is IN the scene's coordinate space, not a skybox element.** Its legs physically extend down into the map. Buildings occlude the legs via normal depth testing — but in gaps between buildings (streets, lots), the legs are visible.

## The Leg Problem

The arch legs extend from `vArchWorld.y ≈ 340` (peak) down to `vArchWorld.y ≈ -165` (feet). The ground plane and streets are at y≈0. Buildings sit at y=0 with heights of ~10–30 units.

**Current solution (jury-rigged):** Hard clip at `vArchWorld.y < -40` in the fragment shader. This Y value was chosen because from the hero camera angle, y=-40 on the arch falls below building rooftops but above street level in screen space. It only works because the hero camera position is fixed. A different camera angle would break it.

Additionally, a `clipBlend` from y=-40 to y=20 fades the legs toward `paintColor` (a ground/horizon mix) so the cut isn't a hard edge.

## Shader Effects (onBeforeCompile)

The shader is injected into four Three.js shader chunks:

### 1. `color_fragment` — Panel detail
- 142 horizontal seam bands + 3 vertical seams at triangle edges
- Per-panel color variation (brightness + warm/cool tint) via hash functions
- `colorStrength = 0.2 + 0.8 * uDayFactor` — panels fade at night (was 0.6 base, reduced to 0.2 to prevent overly distinct patchwork in the dark)

### 2. `roughnessmap_fragment` — Seam roughness
- Slightly rougher at seam lines, clamped 0.03–0.15

### 3. `dithering_fragment` — Post-lighting effects (this is where most of the visual character lives)

Applied in order after PBR lighting:

1. **Sky/ground reflection tint** — faux environment map based on normal direction
2. **Directional wash** — `dot(N, uSunDir)` based, multiplied by `uDayFactor` so it's day-only
3. **Edge glint** — sharp specular glint on triangle edges (`edgeMask`), positioned by sun/moon azimuth
   - `topMask` kills glint in bottom 35% of each leg
   - `uGlintPos` clamped to 0.20–0.80 (can't reach feet)
   - Only the sharp core remains (halo was removed)
   - `uGlintBright` fades smoothly with moon/sun altitude — goes to 0 when both are below horizon
4. **Foot blending** — near-feet color blends toward `paintColor`
5. **Hard clip** — `discard` below y=-40
6. **Clip blend** — color fade near clip line
7. **Ground shadow** — multiplicative dim on lower legs
   - Day: 0.92→1.0 over y=-20 to y=60
   - Night: 0.35→1.0 over same range
   - Purpose: suppress specular hotspots near base (light "from the ground" makes no physical sense)

## Runtime Updates (useFrame)

Every frame updates:
- `material.color` — warmer in golden hour, cooler at night
- `material.metalness` — 0.92 day, 0.50 night
- `material.roughness` — 0.04 day, 0.19 night
- `material.emissiveIntensity` — 0.06 at night, 0 in day
- `uSunDir` — blended sun/moon direction vector
- `uGlintPos` — glint position from light azimuth relative to arch rotation + camera shift
- `uGlintBright` — fades with celestial altitude
- `uHorizonColor`, `uGroundColor`, `uSkyBright` — from sky state

## Known Issues / Bugs

### 1. Moonlight hotspots on legs
**What:** At night, the PBR directional light from `CelestialBodies` creates specular highlights on whichever leg faces the moon. When amplified by bloom, this creates a bright glowing spot on the lower leg.

**Why it happens:** The moon's directional light in `CelestialBodies.jsx` (line ~980) clamps `moonLightAlt` to `Math.max(-0.05, moonAlt)`, so even after moonset the light stays near the horizon. The arch's `MeshStandardMaterial` at metalness 0.5 / roughness 0.19 still has significant specular response. The night bloom threshold drops to 0.35 (from 0.85 in day) — see `useAdaptiveBloom` in `Scene.jsx:196` — so even moderate specular highlights get amplified.

**What we tried and why it didn't work:**
- Capping brightness by height → made one leg look dead gray while the other was fine
- Reducing metalness to 0 / roughness to 1.0 at night → killed all the nice texture/character
- Darkening material color at night (`nightDim`) → killed texture during twilight too, created brightness pops
- Gamma curves → disconnected arch from natural scene lighting, looked artificial

**Why we stopped:** The user strongly prefers the arch to respond naturally to scene lighting. Artificial brightness overrides consistently created worse artifacts than the hotspot itself. The right fix would likely involve either (a) excluding the arch from the moon directional light via Three.js layers, or (b) reducing the moon light intensity in `CelestialBodies` when the moon is near/below the horizon.

### 2. Frozen glint after moonset
**What:** The custom edge glint fades to 0 when the moon sets (brightness tracks altitude), but the glint *position* can appear stuck before that because `moonAlt` is clamped to 0.05 — the azimuth stops advancing as the moon approaches the horizon.

**Mostly fixed:** Glint brightness now fades smoothly with altitude (`moonFade = altitude / 0.15`), so by the time the position freezes, the brightness is nearly zero.

### 3. Legs visible during camera transition
**What:** When transitioning from hero (cinematic) to browse (top-down) mode, the camera sweeps through the scene and the arch legs become momentarily visible in the streets.

**Why:** The leg clip at y=-40 is tuned for the hero camera angle. During the transition, the camera moves to `[0, 600, 1]` (top-down) and the perspective changes. No fix attempted — it's brief and only during transition.

## Important: Do NOT

- Add artificial brightness manipulation (gamma, nightDim, manual color darkening) — the user explicitly rejected this approach multiple times. The arch must respond to scene lighting naturally.
- Switch to `MeshBasicMaterial` — removes all PBR response, kills the visual character.
- Make the arch transparent — legs become see-through, horizon visible through them.
- Change bloom settings to fix arch issues — bloom gives character to everything else in the scene.
