# HANDOFF — Clouds, day 3 (CloudDome v2 reboot)

**Created:** 2026-05-03 evening
**Supersedes:** `HANDOFF-clouds-day2.md` (sprite-based approach abandoned).
**Status:** SpriteClouds component parked, mount commented out in `src/cartograph/CartographApp.jsx`. CloudDome remains live as today's renderer.

## What we learned (so day 3 doesn't repeat day 2)

The day-1+2 spike used `@react-three/drei`'s `<Clouds>` + `<Cloud>` sprite-based components. After several rounds of parameter tuning at multiple scales (volume 8 → 80 → 400, segments 12 → 40, distance 880 → 3700 units), the visual ceiling of this approach was clear: **drei's sprite Clouds produce stylized cartoon-puffs, not photoreal-stylized cumulus.** They look like soft alpha PNGs because that's what they are.

The user's bar is "photorealistic even if stylized" with eventual accurate weather representation in a "Sims-like diorama." Sprite billboards cannot reach that bar without a fundamentally different approach.

The existing `CloudDome.jsx` (noise-shader-based) was described by the user as "not terrible" — meaning the noise-shader lane is closer to right than the sprite lane. The path forward is **upgrade CloudDome**, not replace it.

## What "done" looks like (CloudDome v2)

A CloudDome shader rewrite that:

1. **Reads as photoreal-stylized cumulus, not noise.** Visible cloud structure with soft fluffy edges, sun-side lit highlights, shadow-side depth.
2. **Responds to weather state** (`useSkyState`'s `cloudCover`, `storminess`, `sunsetPotential`, `windVector`, `sunElevation`):
   - Clear day → sparse, scattered fair-weather cumulus
   - Cloudy → denser cumulus field
   - Overcast → smooth stratus / nimbostratus sheet
   - Storm → cumulonimbus structures with darker base, brighter tops
   - Sunset → warm sun-side colors
   - Night → starlit silhouettes (very dim)
3. **Drifts with wind direction** at a believable rate.
4. **Fits mobile budget.** No full volumetric raymarching unless we can clear ~200 calls / 1M tris / 256MB GPU.
5. **Stays stable across the daily TOD cycle** — no popping, no flickering, smooth transitions.

## Recommended technical approach

In rough order of fidelity vs. cost:

### Tier 1 (probably the right answer): Layered fbm-noise shader on the existing dome
- Multiple octaves of 3D simplex/Worley noise for cloud-like structure
- Domain warping for cumulus-shaped lobes (instead of uniform clumps)
- Sun-direction parameter → directional brightening on the sun-facing side, warmer color
- Sky-side ambient → cool tint on the under-side
- A "cloud type morph" parameter `cloudType ∈ [0, 1]` driven by `storminess` to interpolate between cumulus (high contrast, structured) and stratus (low contrast, smooth sheet)
- A "density" parameter driven by `cloudCover`
- Cheap silver-lining edge effect (already present in CloudDome's existing shader; preserve)

### Tier 2 (if Tier 1 doesn't reach the visual bar): Volumetric raymarching with low step count
- Raymarch through a 3D noise field at 8–16 steps per pixel — cheap enough to ship if shader is tight
- Sample sun-direction at each step for self-shadowing approximation
- Mobile budget concern: even 8 steps × 1M screen pixels = real fragment work. Profile early.

### Tier 3 (last resort): Pre-baked cloud cubemaps per weather state
- Author cubemaps offline (Blender / dedicated cloud authoring tool)
- Snap or crossfade between them by weather state
- Free at runtime, but restricts dynamic response (no real-time wind drift inside a cloud's structure)

**Start with Tier 1.** If after a real attempt it doesn't clear the bar, escalate to Tier 2 with explicit user check-in.

## Tune to principles, not to a reference image

**Do NOT ask the user for reference images.** The user's stated position: image hunting is "a ridiculous waste of life." They are correct — the physics of how clouds appear is knowable from first principles, and tuning to *principle adherence* is more rigorous than tuning to vibes-from-a-screenshot.

Real cumulus reads as 3D solids in air because of these specific phenomena, in priority order:

### 1. Three-tier lighting (the killer feature)
Every visible point on a cloud is one of:
- **Sun-side cap**: bright warm white. The sun hitting the top.
- **Body**: medium-bright, neutral white-gray.
- **Shadow-side / underside**: darker and slightly cool — picks up sky color (blue cast in day, purple-gray in storm).

If your shader doesn't differentiate these three, the cloud reads as a flat noise blob. This is THE biggest lever; nail it first.

### 2. Silver lining (Mie forward-scattering)
At sun-facing thin edges, light scatters through the droplets and brightens dramatically. Compute: `dot(viewDir, sunDir)` near 1, AND density low (we're at an edge) → boost brightness with warm tint. Existing `CloudDome.jsx` line ~131 has reference math for this; preserve and improve.

### 3. Self-shadowing
Thicker parts are darker because light traveled further through droplets. Implementation: from the shading point, trace 4–8 short steps toward the sun, accumulate density, multiply the lit color by `exp(-shadowDensity × shadowStrength)`. Cheap and visually massive.

### 4. Cauliflower / lobe structure (domain warping)
Flat bottoms, bulging convex tops, mid lobes. Don't sample noise at world position directly — sample at `worldPos + warpScale × noise(worldPos × warpFreq)`. Lobes emerge for free. Cumulus's signature shape. Without this you get blob-noise.

### 5. Vertical density gradient
Inside the cloud altitude band, density is not uniform: full in the middle, taper at top, taper at bottom. This is what makes cumulus "sit on a flat base" — the bottom-side falloff creates the illusion of condensation height.

### 6. Color shifts with TOD
Same density structure, different palette:
- **Noon**: top `#ffffff`, body `#dcdcd8`, base `#9faab8`
- **Sunset**: top `#ffd9a8`, body `#f0a888`, base `#7a4f6a`
- **Storm**: top `#e8e8ea`, body `#888894`, base `#3a3e48`
- **Moonlit**: top `#c8d4e0`, body `#7a85a0`, base `#404858`

Drive the palette interpolation off `useSkyState`'s `sunElevation`, `sunsetPotential`, `storminess`. Same noise, swapped lookup tables.

### 7. Cloud-type morphing by weather state
Same shader, different parameter set:
- `cloudCover ≈ 0.3`, `storminess = 0`: scattered fair-weather cumulus (sparse density, well-defined lobes, gaps of clear sky)
- `cloudCover = 0.9`, `storminess = 0`: full cumulus field (dense lobed cover, less sky visible)
- `storminess > 0.4`: cumulonimbus (taller vertical extent, darker base, higher contrast)
- `storminess > 0.6` AND `cloudCover > 0.7`: stratus/nimbostratus (flatten vertical gradient, dampen lobes — looks like a sheet)

### 8. Wind drift
Offset the noise lookup by `windVector × time`. Already done in existing CloudDome.

## The verifiable checklist

After each tuning iteration, the agent (and the user, on review) verifies:

- [ ] Visible **sun-side / body / shadow-side** distinction on the same cloud at noon
- [ ] **Silver-lining edge** visible when sun is behind a cloud near the horizon
- [ ] **Self-shadowing**: a thick cloud has a darker core than its periphery
- [ ] **Cauliflower lobes**: cloud silhouette is irregular and convex-bumpy, not noise-clumpy
- [ ] **Flat-ish base**: cumulus reads as sitting on a horizontal layer
- [ ] **Color shift across TOD**: scrub time of day → palette evolves continuously
- [ ] **Weather-type morph**: `setWeatherTargets({storminess: 0.7, cloudCover: 0.8})` produces stratus, not cumulus
- [ ] **Wind drift** visible at moderate `windVector`
- [ ] **No popping or flickering** during state transitions
- [ ] **Mobile budget**: Preview's GpuPanel reports under-budget on tris and draws

Each item passes or fails individually. Iterate on whichever fails. Done when the checklist is all green AND the user agrees it reads as photoreal-stylized.

## Constraints + don't-touches

- **Do NOT delete `src/components/SpriteClouds.jsx`.** Keep it as a parked experiment so future operators can see what we tried. Mount stays commented out in `CartographApp.jsx:688`.
- **Do NOT delete `CloudDome.jsx`'s existing logic until v2 reaches parity-or-better.** Build the new shader alongside, A/B compare, then retire old.
- **Don't add authoring panel surfaces in v1.** Authoring (per-Look cloud overrides, weather-state tweaks) comes after the renderer is good enough to be worth authoring.
- **Don't fork into mobile-only and desktop-only paths.** One shader; LOD/quality knobs if needed.

## Working environment

```
cd ~/Desktop/lafayette-square.nosync
npm run dev  # vite 5173, cartograph 3333, arborist 3334
```

Stage view at `http://localhost:5173/cartograph.html`. Preview canary at `http://localhost:5173/preview.html`.

## Memory references

Read before starting:
- `project_weather_and_events_vision.md` — the broader vision (Lafayette Square as a living place, real weather + scheduled events)
- `feedback_premium_visuals_no_shortcuts.md` — premium look is non-negotiable, no global visual downgrades
- `feedback_mobile_first_preview.md` — Preview is the canary; ~200 calls / 1M tris / 256MB budget
- `project_post_vs_skylight_split.md` — when v1 lands and authoring is added, clouds belong on Sky&Light (not Post)

## Files touched in days 1-2 (now parked)

- `src/components/SpriteClouds.jsx` (parked, retained)
- `src/cartograph/CartographApp.jsx` — import retained, mount commented out

## Critical rules still apply

- Stage authors, Preview reads.
- Defaults match today; operator overrides per slot.
- Operator gets sliders + a budget meter; trust them.

Welcome to day 3. Tier 1 shader. Reference image first. Don't repeat day 2.
