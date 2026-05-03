# Handoff — SpriteClouds, day 2

Continuation of `HANDOFF-clouds.md`. Day 1 spike landed end-to-end but the
puffs read as tiny pink dots in Hero. Visual tuning + likely a scale
rethink needed. CloudDome still mounted as A/B fallback (do not remove).

## What shipped day 1

- `src/components/SpriteClouds.jsx` — new component using
  `@react-three/drei`'s `<Clouds>` + `<Cloud>` (drei 9.92, API:
  parent/children with shared instanced shader).
- Mounted in `src/cartograph/CartographApp.jsx` (line ~634) inside the
  `<group visible={!inDesigner}>` block, alongside `<CloudDome />`.
- Gates on `viewMode === 'hero' || viewMode === 'planetarium'` (Hero +
  Street, per user direction; Browse intentionally skipped).
- Subscribes to `useSkyState` slices (`cloudCover`, `storminess`,
  `sunsetPotential`, `beautyBias`, `sunElevation`) so React re-renders
  push updated `color`/`opacity` props into drei's per-instance shader
  attributes via its internal `applyProps` useLayoutEffect.
- Wind drift via module-level `_windOffset` Vector3 mutated in
  `useFrame` and applied to the parent group's `position.x/.z` (mirrors
  CloudDome's pattern; background-tab gated; delta-clamped).
- Color blend: white → sunset peach → storm slate → near-black night.
- Sun-side illumination: comes free via drei's default
  `MeshLambertMaterial` reading the existing scene directional light.
  No custom shader.

## Confirmed working day 1

1. Component mounts in Hero (proof-of-life logs fired).
2. Renderer paints sprites — a giant magenta diagnostic puff at
   `[400, 200, -100]` was clearly visible in Hero. So texture loads
   (`rawcdn.githack.com/.../cloud.png`) and depth/material are fine.
3. After diagnostic was removed and the field re-centered above the
   Hero look-target, the user reports **"small pink clouds"** are
   visible — meaning sprites are rendering, but at wrong scale or
   wrong color/opacity for the desired look.

## The actual mystery — "small pink clouds"

Two unknowns we did not chase down at end of session:

### 1. Why pink?

The color blend should be near-white at default sky state
(`sunsetPotential≈0`, `storminess=0`, `sunElevation` whatever current
local time is). Pink suggests either:

- **`sunsetPotential` is high** — current local time may have been
  twilight when user tested; `useSkyState` derives this from sun
  elevation (`lowSunFactor` peaks near sunset). The blend target is
  `_sunset = #ff8a55` (peachy-pink). Mixed at `sunsetMix * 0.55` with
  white, that's a credible pink at high sunset potential.
- **drei's per-instance Lambert is being lit weirdly** by the scene's
  warm directional light at twilight (StageShadows uses sun-warm
  light). A Lambert sprite picks up scene tint.
- **HMR carried over old test-puff state** — unlikely after Cmd-Shift-R
  but worth ruling out by hard-restarting the dev server.

**To diagnose:** in console, run
```
useSkyState.getState().sunElevation
useSkyState.getState().sunsetPotential
useSkyState.getState().beautyBias
```
…then force a daytime override:
```
useSkyState.getState().setWeatherTargets({ cloudCover: 0.7, storminess: 0 })
```
and wait ~30s for interpolation. If puffs go white-ish, color logic is
correct and "pink" was just the actual sky state at test time.

(Note: `useSkyState` is module-scope; expose it on `window` in dev if
console access is needed — small one-line addition.)

### 2. Why small?

After day-1 retune, sprites are at:
- `PUFF_COUNT = 11`, `segments = 5–8` per puff
- Altitude `160–460` units
- Field centered at `[200, _, -50]`, radius `1600`
- Bounds `[200–420, 38–70, 200–420]`
- `volume: 5.5`, `growth: 3`

Hero camera: `[-400, 55, 230]` → target `[400, 45, -100]`, FOV 22°.
Distance camera→target ≈ 870 units. At that distance, a sprite of
bounds ~300 units occupies roughly atan(300/870) ≈ 19° — should be a
substantial chunk of frame. So "small" suggests:

- **Sprites are farther than expected.** Field radius 1600 around
  `[200, _, -50]`: nearest sprite to camera could be ~1700 units away,
  farthest ~3500. drei's `fade` prop is at 3500 — sprites fading out
  near the edge.
- **`smallestVolume: 0.4` + `concentrate: 'inside'`** distributes most
  segments toward the center of each puff's bounds, so the visible
  cloud is smaller than the bounds box implies.
- **Sun isn't lighting them well** at the current TOD, so they read
  more as faint specks than 3D volumes.

## Recommended next-session moves (in order)

1. **Restart dev server clean.** New file imports + module-scope
   accumulators sometimes get into weird HMR state.

2. **Force a daytime, overcast override** to see clouds at their most
   confident:
   ```js
   // paste in console
   useSkyState.getState().setWeatherTargets({ cloudCover: 0.85, storminess: 0.1 })
   ```
   If puffs now read as substantial white cumulus, the renderer is
   correct and "small pink" was just the live weather + TOD state
   producing a faint twilight result. Move to step 5.

3. **If still small after override:** drop one large fixed puff at
   `[400, 200, -100]` with bounds `[500, 100, 500]`, `volume: 8`,
   `segments: 10`, color `#ffffff`. This is the day-1 diagnostic
   reborn — confirm what "big enough" looks like in Hero, then back
   off from there.

4. **Reconsider scale.** If the diagnostic puff still looks small
   relative to the desired wallpaper aesthetic, the right answer may
   be FEWER but BIGGER puffs (e.g. 5 puffs with bounds 600×100×600,
   segments 12) rather than 11 small ones. Cumulus on a desktop
   wallpaper is usually 3–7 dramatic shapes, not 50 specks.

5. **Then the real authoring loop.** Iterate counts, bounds, altitude,
   color palettes per weather state. Test each of: clear day,
   overcast, sunset, storm, night.

## Known follow-ups that came up day 1

- **Re-render churn.** SpriteClouds re-renders on every interpolation
  tick of `cloudCover`/`sunsetPotential`/etc. Drei's `<Cloud>`
  re-runs its `applyProps` useLayoutEffect each time (deps include
  `color`, `opacity`). For 11 puffs × 5–8 segments that's ~80 segment
  configs re-applied per state tick — visible in the 116ms rAF
  violation. Mitigations:
  - Threshold the subscriptions (only re-render when values cross
    quantization steps, e.g. `Math.round(cloudCover * 20) / 20`).
  - Or move color/opacity to direct mutation: keep refs to each
    `<Cloud>`, traverse drei's internal `clouds.current` config array,
    mutate `cloud.color`/`cloud.opacity` in `useFrame`. More invasive
    but avoids React thrash.

- **Texture source.** Default cloud sprite loads from
  `rawcdn.githack.com`. Works online but isn't great hygiene long
  term. Drop a local `public/textures/cloud.png` (CC-licensed puff
  PNG, drei has one in their repo) and pass `<Clouds texture="...">`
  when ready to lock the asset.

- **Sun-edge silver lining.** Lambert handles sun-side brightness OK
  but doesn't do the dramatic edge glow CloudDome's shader does. If
  the wallpaper bar isn't met, custom shader override on the Cloud
  material (drei's `material` prop accepts a custom Material class).
  Read CloudDome's `silverLining` math at `CloudDome.jsx:131` for the
  reference.

## Files touched day 1

- `src/components/SpriteClouds.jsx` (new, 130 lines)
- `src/cartograph/CartographApp.jsx` (2 lines: import + mount)

Nothing else. Day 1 was scoped tight per the original handoff's "don't
make this the diversion" rule.

## Critical rules still apply

Re-read these before resuming — they're in
`memory/`:
- `feedback_stage_standalone_should_die.md`
- `feedback_default_until_override.md`
- `feedback_trust_operator_with_budget.md`
- `project_weather_and_events_vision.md`

And from the original `HANDOFF-clouds.md`: don't add authoring
surfaces in v1; don't delete CloudDome until user explicitly says so;
don't go full volumetric without checking in.

## Where things stand

- Day-1 spike: ✅ shipped, mounting, painting sprites
- Visual parity-or-better with CloudDome: ❌ not yet (puffs too small,
  possibly mis-tinted)
- Weather-state response: 🟡 wired but unverified across states
- Wind drift: 🟡 wired but not visually confirmed (slow drift; need to
  watch for ~30s on a non-still day)
- Per-look authoring: ⛔ not started, intentionally out of scope for v1
- CloudDome retirement: ⛔ blocked on visual parity

Welcome back. Make the sky beautiful — for real this time.
