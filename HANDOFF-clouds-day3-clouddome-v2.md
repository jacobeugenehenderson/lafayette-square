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

## Reference image

**Day 3 should not start without one.** The whole day-2 spin was tuning toward a visual target the agent couldn't see. Get the user to share a screenshot of a cloud aesthetic they actually want — game, painting, photo, or another piece of software. Tune toward that, not toward "good clouds."

Suggested categories to ask for: a daytime cumulus reference, a sunset reference, a storm reference, a night reference. Three or four images cover the range.

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
