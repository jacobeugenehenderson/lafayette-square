# Handoff — Post + Sky & Light cards

Two sibling cards in the Stage right panel host every TOD-animatable
channel governing the look of the world. Split by mental model:

- **Post** = how the camera sees the world (image-space grade, AO, post
  effects). Visible in all shots, including Browse.
- **Sky & Light** = what the world is (sky gradient, mist, halo,
  constellations, milky way, neon glow). Hidden in Browse — none of it
  is visible looking straight down.

The split is the cleanest dividing line we've found: every Post channel
is **scalar/colorless utility**; every Sky & Light channel is
**colorable atmospheric magic**. See `project_post_vs_skylight_split.md`
for the rule.

Operator scrubs the top-of-Stage TOD playhead; each channel's row shows
what that scene parameter does at the parked slot.

## What these cards are for

Per `project_tod_parameterizer_inflight.md`, the operator authoring
"what does the world feel like at this moment" is dialing post effects
and atmospherics together — but the *kind* of authoring is different.
Post is cinematographer math (exposure, shadow lift, color grade); Sky
& Light is set-dressing the world (emerald mist for St. Patrick's Day,
indigo sky at night). Two cards, one operator pass.

## Card placement

Both cards live in the Stage right panel (`StagePanel` in
`src/stage/StageApp.jsx`) as `Collapsible` blocks. Order:

```
Time of Day → Environment → Post → Sky & Light → Camera → Surfaces
```

Post is always mounted; Sky & Light unmounts in Browse mode.

Each card's content is a stack of `<TodChannel>` mounts via the shared
`StoreChannel` wrapper. The cartograph passes `<CartographPost />` and
`<CartographSkyLight />` into StagePanel via `postSlot` / `skyLightSlot`
props. Standalone `/stage` shows empty bodies (the route is dev-only;
see `feedback_stage_standalone_should_die.md`).

Within each card, channels are organized by typographic landmarks
(small-caps section labels + thin dividers — NOT folders, no nested
state). Inside Post: `CAMERA` / `SHADOW` / `SOFTEN`.

## Browse-mode hide rule

The card **disappears entirely** when the Stage camera mode is Browse.
Browse looks straight down at the ground; no sky, no celestial bodies,
no atmospheric haze is visible. Hiding the card prevents the operator
from authoring values they can't see, and the render path culls the
sky/celestial geometry so Browse stays at full FPS for layer-toggle
authoring.

Implementation note: gate via `cameraMode !== 'browse'` at the card's
mount point. Don't `visible={false}` the children — that still runs
their useMemos. Mount/unmount based on cameraMode.

## Channel inventory

Each channel is a `<TodChannel>` mount. Single-channel uses one slider;
group channels share one timeline across multiple coupled fields.

## Post card inventory

Three sub-groups within Post (typographic landmarks, not folders):

### CAMERA

| key        | label    | range | default | drives                        |
|------------|----------|-------|---------|-------------------------------|
| `exposure` | Exposure | 0–2   | 0.95    | FilmGrade `uExposure` uniform |
| `warmth`   | Warmth   | 0–1   | 0.5     | FilmGrade `uWarmth` (Photo Filter math; tonal-aware luminosity-preserving tint, density 0.6 max — overt without being a hue rotation) |

### SHADOW

| key       | label             | range | default | drives                  |
|-----------|-------------------|-------|---------|-------------------------|
| `ao.radius` | AO radius       | 1–30  | 15      | N8AO `aoRadius`         |
| `ao.intensity` | AO intensity | 0–5   | 2.5     | N8AO `intensity`        |
| `ao.distanceFalloff` | AO falloff | 0–1 | 0.3   | N8AO `distanceFalloff`  |
| `fill`    | Fill (distinct ↔ soft) | 0–2 | 1.0   | FilmGrade `uToe` via piecewise: 0..1 → 0..0.28; 1..2 → 0.28..1.0 |

### SOFTEN

| key         | label              | range | default | drives                              |
|-------------|--------------------|-------|---------|-------------------------------------|
| `bloom.intensity` | Bloom intensity | 0–3 | 0.5    | BloomEffect `intensity`             |
| `bloom.threshold` | Luminance threshold | 0.1–1 | 0.85 | `bloom.luminanceMaterial.threshold` |
| `bloom.smoothing` | Threshold smoothing | 0–1 | 0.4 | `bloom.luminanceMaterial.smoothing` |

Per `feedback_postprocessing_v6_setters.md`: bloom intensity is a real
setter on the effect; threshold/smoothing must be set on
`luminanceMaterial`, NOT on the effect (the constructor-only options
silently no-op if mutated).

## Sky & Light card inventory

All channels are **colorable atmospheric magic** — none of them are
scalar-only utility (that's Post's job).

### Sky gradient (group of 3 — colors)

| key      | label         | range  |
|----------|---------------|--------|
| `top`    | Top color     | hex/HSL |
| `horizon`| Horizon color | hex/HSL |
| `bottom` | Bottom color  | hex/HSL |

Three colors that drive the skydome's vertical gradient. Color values
animate per slot — at noon all three are bright sky tones, at sunset
horizon shifts warm and bottom shifts to a deeper warm-mauve, at night
all three desaturate toward indigo. (Color animation may need a small
extension to the `<TodChannel>` primitive, which currently handles
floats; an HSL or vec3 representation works fine since the same
lerp/step pattern applies per channel.)

Replaces the hand-tuned hour-bucket branches in `StageSky.jsx`'s
`CelestialBodies`. This is the rip-out the original handoff called
"the loudest violation of stage-is-source."

### Mist (was Fog) — single, colorable

| key      | label  | range | drives                          |
|----------|--------|-------|---------------------------------|
| `density`| Density | 0–1  | `scene.fog.density` (currently FogExp2 hardcoded 0.00015) |
| `color`  | Color  | hex   | `scene.fog.color`               |

Distance-based world-space fade. Renamed from "Fog" because the operator
uses it as creative atmosphere, not a technical softening dial — emerald
mist for St. Patrick's Day is a stage element, not a Post effect.

### Halo (was Haze) — single, colorable

| key       | label    | range | drives                         |
|-----------|----------|-------|--------------------------------|
| `strength`| Strength | 0–0.5 | AerialPerspective `uHazeStrength` |
| `color`   | Color    | hex   | AerialPerspective `uHazeColor` (currently pulled from `useSkyState.horizonColor`) |

Image-space horizon-band tint (only fires near horizontal middle, only
on midtones, scaled by sun altitude). Renamed from "Haze" by the same
logic as Mist — already colorable, lives next to the sky gradient as a
companion atmospheric.

### Constellations + Milky Way (singles, camera-mode gated)

| key            | label                | range  |
|----------------|----------------------|--------|
| `constellation`| Constellation intensity | 0–1 |
| `milkyWay`     | Milky Way opacity    | 0–1    |

These channels are TOD-animatable but **render only when camera mode is
Hero or Street**. In Browse the camera looks down; the celestial dome
isn't even mounted, so authoring is moot but the channels still resolve
(cheap). The gate is camera-mode at the renderer, not at the channel.

Twinkle math + sidereal rotation are programmatic — not animated per
slot. Operator authors visibility/intensity; the runtime makes the stars
behave like stars.

### Neon glow (group of 3)

| key      | label              | range  |
|----------|--------------------|--------|
| `core`   | Hot core           | 0–1    |
| `tube`   | Tube glow          | 0–1    |
| `bleed`  | Atmospheric bleed  | 0–1    |

The shared TOD curve for every neon-eligible place's roof band. See
**`HANDOFF-neon.md`** for the full neon contract — this card just hosts
the operator-facing channel; the runtime overlay, eligibility metadata,
quad-strip renderer, and shader cross-section all live there.

## Sun/moon astronomical solver

Position, phase, sidereal rotation, and Milky Way orientation are
**computed**, never authored. Inputs:

- **Latitude / Longitude** — per-Look constant. Lafayette = (38.6160,
  -90.2161) (already wired in `animatedParam.js` and the various
  scene/timeline modules).
- **Date** — per-Look. Drives sun arc + moon phase + sidereal rotation
  of the celestial sphere. Default = "today"; future Looks may pin a
  specific date for seasonal Looks (a winter Look, a midsummer Look).
- **Slot's `t` (minute-of-day)** — already feeds the SunCalc lookup in
  `getTodSlotMinutes`. The astronomical solver evaluates at the playhead
  minute every frame.

So the operator's slot determines *when* the sun is, the solver
determines *where* it is. The Sky & Light card's authored channels
control how the world looks given those positions.

## Promote-to-animated semantics

Same as every other `<TodChannel>` consumer:

- Channel starts flat (`{values: {key: defaultValue, ...}}`)
- Operator clicks "animate" → row appears
- Each filled slot stores values for that slot
- Resolver lerps numerics, steps booleans (when those land)
- Bake serializes the channel as scalar OR slot-keyed table

The store actions pattern is the lampGlow template — every channel
gets its own `setX` / `animateX` / `unanimateX` / `addXSlot` /
`removeXSlot` / `setXTransition` actions. Use
`resolveLampGlowAtMinute` (group-shape resolver in `animatedParam.js`)
or `resolveAnimatedAtMinute` (single-shape resolver) per channel
type. **Worth factoring** these into one `resolveGroupAtMinute` helper
since the codebase will accumulate many group consumers — currently
LampGlow and (incoming) Bloom + Sky group + Neon group.

## Bake-pruner behavior

Each channel that resolves to its default across all slots gets omitted
from the per-Look bake bundle. A "high noon, sunny" Look ships without
night-side data; a "midnight street" Look ships with the full sky/bloom
tables but skips daytime channels.

Carve-out: **neon eligibility metadata is infrastructure, always
shipped** (per `HANDOFF-neon.md`). The neon glow curve itself follows
normal prune rules — flat-at-zero curve → omit the table; eligibility
registry stays.

Other carve-outs may emerge as Sky & Light builds out. Capture them
here when they do.

## Sequencing — recommended build order

**Done:**
1. ✅ Card scaffolding (Sky & Light + Browse hide gate; Post added later)
2. ✅ Bloom group channel (Post / SOFTEN)
3. ✅ Warmth + Fill (Post / CAMERA + SHADOW)
4. ✅ Exposure + AO (Post / CAMERA + SHADOW)
5. ✅ Per-channel revert + twirl-collapsible TodChannel UX

**Next:**
6. **Sky gradient (group)** — needs skydome shader patch to read three
   color uniforms instead of hardcoded hour-bucket branches in
   `StageSky.jsx`'s `CelestialBodies`. Biggest remaining piece.
7. **Mist + Halo** — both colorable; need color-field support in
   TodChannel (currently scalar-only). Bind Mist to `scene.fog.density`
   + `.color`; bind Halo to AerialPerspective uniforms.
8. **Neon glow group** — channel mount is ~20 lines. Runtime overlay
   work happens per `HANDOFF-neon.md`.
6. **Constellations + Milky Way** — camera-mode gate at the renderer
   side; channel mounts here. Cheap.
7. **Atmosphere (haze + fog)** — last because the underlying scene
   doesn't currently have proper haze/fog; needs a fog shader patch.

## Critical references

- `project_tod_parameterizer_inflight.md` — full TOD architecture, locked
  decisions, sequence within the larger project.
- `project_backlog_light_dome_elaboration.md` — the original elaboration
  plan; this card is the implementation surface for that backlog.
- `src/cartograph/TodChannel.jsx` — the consumed primitive. Read it
  before writing your first channel.
- `src/cartograph/CartographSurfaces.jsx:502–530` — `LampGlowEditor`
  template. Every channel mount in Sky & Light follows this shape.
- `src/cartograph/animatedParam.js` — slot vocabulary, minutes,
  resolvers.
- `feedback_postprocessing_v6_setters.md` — the bloom setter gotcha.
- `project_bloom_known_problem.md` — bloom history; what to expect when
  re-enabling.
- `project_camera_model_three_modes.md` — Browse/Hero/Street state
  machine; informs the Browse-mode hide.
- `HANDOFF-neon.md` — neon's runtime side; this card hosts the channel
  but the rendering work lives there.

## Why this card exists

Per `feedback_stage_is_source_preview_is_mirror.md`: Stage authors the
truth, Preview mirrors. Today, lighting is the loudest violation of
that rule — Preview hardcodes `BasicLights` because Stage's `CelestialBodies`
is a tangle of hand-tuned hour-bucket branches with no authoring
surface. The Sky & Light card is what makes lighting Stage-authored,
which lets Preview drop its fallback and read the real values. Until
this lands, every "Preview looks great / Stage looks dark" gap is real
architectural debt.
