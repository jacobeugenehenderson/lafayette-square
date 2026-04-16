# Lighting & Shadow Parity — Handoff

## Overview

The cartograph (plan view at `/cartograph`) and the browse view (top-down at `/`)
need full lighting parity with the hero view. Right now:

- **Hero view**: Buildings, trees, park lit by real sun. Shadows cast. AO. Film grade. Looks good.
- **Browse view**: Same scene from above — buildings lit, but StreetRibbons ground plane
  is a flat unlit shader. No shadows on streets. Ground looks dead.
- **Cartograph**: Same StreetRibbons flat shader. CelestialBodies mounted but ground
  doesn't respond. Dark and lifeless.

## Three goals

### 1. StreetRibbons must accept cast shadows while keeping flat colors

StreetRibbons uses a custom `onBeforeCompile` shader that zeroes all lighting and
outputs raw `diffuseColor.rgb`. This kills shadow information. The surface colors
are carefully curated for a cartographic look — they must NOT change. But building
and tree shadows must darken them.

**The shader currently does:**
```glsl
// After #include <lights_fragment_maps>
reflectedLight.directDiffuse = vec3(0.0);
reflectedLight.directSpecular = vec3(0.0);
reflectedLight.indirectSpecular = vec3(0.0);
reflectedLight.indirectDiffuse = diffuseColor.rgb;
```

**It needs to do:**
```glsl
reflectedLight.directDiffuse = vec3(0.0);
reflectedLight.directSpecular = vec3(0.0);
reflectedLight.indirectSpecular = vec3(0.0);
reflectedLight.indirectDiffuse = diffuseColor.rgb * shadowFactor;
```

Where `shadowFactor` is a clean 0–1 value from the shadow map. The challenge is
extracting this value — Three.js bakes it into `directLight.color` during the light
loop, so by the time we reach `lights_fragment_maps` it's already been multiplied
into `directDiffuse` which we're about to zero.

### 2. Terrain elevation must be visible via directional light

Terrain elevation is applied (10× exaggeration via `src/utils/elevation.js`).
StreetRibbons vertices are displaced by `getElevation(x, z)` in `mergeRawGeo()`.
Buildings follow terrain via `getFoundationHeight()` in LafayetteScene.jsx.
Park is lifted as a group.

But the flat shader makes elevation invisible — a hill and a valley look identical
because the surface color doesn't respond to light angle. The directional sun at
noon should make slopes facing the sun brighter and slopes facing away darker,
creating visible topographic relief. This is a natural consequence of fixing goal #1
if the normals are correct (they're set to 0,1,0 — may need `computeVertexNormals()`
after displacement, but previous attempt flipped them — winding order may need checking).

### 3. Browse view needs shadow parity with hero view

The browse view in Scene.jsx is the same scene as the hero view, just from a
top-down perspective camera. It already has SoftShadows, N8AO, and CelestialBodies.
The only thing blocking shadows on the ground is the StreetRibbons flat shader
(same issue as goal #1). Fixing the shader fixes both browse and cartograph.

## Approaches tried and failed

1. **Extract shadow from directDiffuse ratio** — `litLum / baseLum` after lighting.
   Fragile: breaks with dark colors (divide near-zero), shifts with time-of-day.

2. **Standard materials with brightened colors** — Removed flat shader, scaled colors
   2–3×. Result: garish specular highlights, wrong palette, looks fake.

3. **ShadowMaterial catcher plane** — Transparent plane above StreetRibbons. Doesn't
   follow terrain displacement, creates floating dark patches.

4. **Output_fragment replacement** — Replaced final output to extract shadow from
   `outgoingLight` vs `diffuseColor`. Same ratio fragility as #1.

## Recommended approach

Capture the shadow factor directly from Three.js's shadow map sampling. The shadow
value for each directional light is computed via `getShadow()` inside
`#include <lights_fragment_begin>`. Options:

**A. Patch `lights_fragment_begin`** — Replace the entire chunk with a custom version
that accumulates `float accShadow = 1.0;` by multiplying each light's shadow result.
Then use `accShadow` in the final output. Brittle across Three.js updates but minimal
new code.

**B. Custom ShaderMaterial** — Full custom fragment shader that samples
`directionalShadowMap[0]` directly. The shadow projection matrix and map are available
as uniforms. More control, decoupled from Three.js internals.

**C. Two-pass render** — Render a shadow-only pass to a screen-space texture (just
shadow attenuation, no color). The flat shader reads this texture to darken. Clean
separation but needs render target plumbing.

**D. Depth-based shadow in post-processing** — A custom post-processing effect that
reads the shadow map and composites shadow darkness onto the final image. Avoids
touching the material shader entirely.

## Key files

| File | Role |
|------|------|
| `src/components/StreetRibbons.jsx` | Ground plane, flat shader `makeMaterial()`, terrain displacement in `mergeRawGeo()` |
| `src/components/Scene.jsx` | Main app: Canvas, SoftShadows, N8AO, PostProcessing, CameraRig |
| `src/cartograph/CartographApp.jsx` | Cartograph: Canvas, SoftShadows, N8AO, CelestialBodies |
| `src/components/CelestialBodies.jsx` | Sun/moon directional light, shadow camera |
| `src/components/LafayetteScene.jsx` | Buildings (`castShadow`), uses `getElevation()` for foundation height |
| `src/components/LafayettePark.jsx` | Park group lifted by `getElevation(0,0)` |
| `src/components/Terrain.jsx` | Terrain mesh, V_EXAG from elevation.js |
| `src/utils/elevation.js` | `getElevation(x,z)`, `V_EXAG=10`, `displaceGeometry()` |
| `src/cartograph/MapLayers.jsx` | Cartograph-only layers (buildings, park, stripes, labels, lamps, trees) |

## Shadow camera config (CelestialBodies.jsx)

```
mapSize: 4096 × 4096
far: 2400
left/right/top/bottom: ±900
bias: -0.0001
normalBias: 0.15
```

## Surface colors (DO NOT CHANGE)

```js
// Streets
asphalt:  '#2e2e2c'
sidewalk: '#7a756a'
curb:     '#aa8866'
treelawn: '#4a6a3a'

// Land use
residential: '#3a5a2a'
commercial:  '#6a6258'
park:        '#2a4a1a'
parking:     '#3a3a38'
// (full list in StreetRibbons.jsx)
```

## Constraints

- Surface colors must not change — they are the curated cartograph palette
- No Y-offsets for coplanar stacking — polygonOffset only (HARD CONSTRAINT)
- Must work in both orthographic (cartograph) and perspective (hero/browse) cameras
- Three.js 0.160.0, React Three Fiber 8.15.0, @react-three/postprocessing 2.15.0
- The flat shader must remain the default look — shadows are an additive darkening

## Elevation details

- Terrain data: 126×97 grid, bounds X[-534,790] Z[-999,347]
- Real elevation: 0–2.86m. Exaggerated 10× → 0–28.6m
- Park center (origin) is at 0m. Edges rise: Chouteau ~13m, Jefferson ~12m
- Street vertices displaced in `mergeRawGeo()` via `getElevation()`
- Face fill vertices displaced inline during triangulation
- Normals currently hardcoded (0,1,0) — may need recompute for directional shading

## Test procedure

1. `cd cartograph && node serve.js` (port 3333)
2. `npm run dev` (port 5173)
3. Open `localhost:5173` — set Almanac to noon, clear sky
4. Hero view: terrain hills visible, building shadows on streets
5. Browse view (scroll wheel to exit hero): same shadows visible from above
6. `localhost:5173/cartograph`: building shadows on streets, terrain shading
7. Surface colors match the curated palette in all views
</content>
</invoke>