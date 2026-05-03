# Handoff — Neon as runtime "Open Places" overlay

Decisions locked 2026-05-02 during TOD parameterizer planning, updated
2026-05-02 PM after bloom landed and the "single curve" simplification was
revisited. Neon is **not** operator-keyframed per category; it's a runtime
overlay driven by end-user "Open Hours" data, with one operator-authored
TOD **group channel** (3 fields — core / tube / bleed) shaping the
nighttime emissive physics globally. Bloom amplifies the result.

## What neon means in the product

Neon calls attention to **open places**. Not just businesses — a residence
holding an open house, a church saying "always welcome," a park hosting an
event. The end-user (the place's guardian, not "our" Stage operator)
activates their neon programmatically by editing Open Hours. Stage operators
author the *physics* (color per category, global glow curve), never the
per-place on/off.

## Render model — three coupled emissive layers

A neon tube isn't one fader; it's a **layered emissive structure** that
warms up across the day. The Stage operator authors three values per TOD
slot, all sharing one timeline (group channel, same shape as Lamp Glow's
grass/trees/pool triple). Bloom is now in the post pipeline and amplifies
the final emissive — that means the operator gets real authoring leverage
over how the tube ignites.

```
emissive(place, t) =
    mix(categoryColor, white, 0.7) × coreMask(uv)  × uCore(t)
  + categoryColor                  × tubeMask(uv)  × uTube(t)
  + categoryColor × 0.4            × bleedMask(uv) × uBleed(t)

  × isOpenAt(place, t)
```

The three TOD-animated channels:

| key   | label              | what it controls                                                                 |
|-------|--------------------|----------------------------------------------------------------------------------|
| core  | Hot core           | White-hot center stripe of the tube — the "filament" of the neon                 |
| tube  | Tube glow          | Saturated category-color body of the tube — the visible neon band                |
| bleed | Atmospheric bleed  | Soft outer emissive past the tube geometry — what bloom picks up and smears      |

Each is a 0–1 float, single value across all categories. The category just
provides hue; the *physics* (how hot, how saturated, how much haze) is the
neon-physics group, shared.

**Authoring story across the day** (operator dials):
- **Noon / Golden** — all 0. Band reads as a flat colored graphic at the roofline
- **Sunset** — `tube` ignites (~0.3); `core` and `bleed` still 0
- **Dusk** — `tube` full, `core` warming (0.4), `bleed` starting (0.3)
- **Night** — `core` full, `tube` full, `bleed` full; bloom does the
  atmospheric heavy lifting

This decomposition gives Looks real expressive range: a Look can have a
slow warm-up (tube ignites long before core), a snap-on (all three jump
at sunset), or a "neon never quite ignites" (tube only, no core).

**The other two terms in the equation:**

- **`categoryColor`**: 8 categories already authored in
  `CartographSurfaces.jsx` (`neon_dining`, `neon_historic`, …). Scalar,
  never animates. Authored once per Look.
- **`isOpenAt(place, t)`**: per-place boolean evaluated at runtime from
  each place's Open Hours schedule. Already a runtime-authored data path;
  Stage doesn't touch it.

The band is visible during the day as a graphic (flat colored geometry)
even when all three emissive terms are 0. Band geometry is always-present
art for places that *can* light up; the three-layer emissive rides on top
when the place is open and the curves call for it.

## Architecture — Path B (universal lazy)

Decided over Path A (per-category presence policy). Neon geometry is **never
baked into the per-Look bundle.** Instead:

- **Bake ships eligibility metadata only:** for every place that *could*
  light up, bake includes an eligibility tag keyed to the building. The band
  geometry is derived at runtime from the building footprint — no mesh, no
  material per place in the bundle. ~1500 residentials = ~1500 tag bytes.
- **Runtime instances the currently-open set.** One instanced draw for the
  whole town's neon: per-instance color (from category), per-instance
  category-color uniform fed to the shader. The three TOD uniforms
  (`uCore`, `uTube`, `uBleed`) are global — every active instance reads
  them. `isOpenAt(place, t)` is the per-instance gate. Peak active set is
  probably 30–50 places at busy hours, regardless of total building count.
- **No per-place glyphs/text.** The band is category-colored only, no
  business names/logos. (This is what unlocks Path B — if bands needed
  per-place visuals, we'd be forced into Path A's per-category policy with
  eager artifacts.)

## Rendering approach — single quad strip, shader cross-section

The current renderer (`LafayetteScene.jsx:459`) uses `TubeGeometry` over
a CatmullRom curve. That's the source of the GPU-heavy + jagged-aliased
symptoms (`project_neon_existing_baseline.md`). Replace with a **single
mitred quad strip per place, fragment shader paints the cross-section**.

### Geometry — one ribbon per place, lightest possible

For each open place, walk the roof footprint and emit one triangle strip
hugging the perimeter:

- 2 vertices per footprint corner (inside edge + outside edge of the band)
- Mitre at corners by averaging adjacent edge normals
- ~30 verts for a typical 15-corner Victorian footprint
- 30 places open simultaneously → ~900 verts total. One instanced draw
  call covers all of them.

The strip lies flat at the roofline (constant Y above footprint). Width
is a uniform. For Lafayette's flat-roofed Victorian housing, no per-edge
Y variation needed.

### Shader — cross-section painted by fragment

The strip is geometrically flat (zero thickness in profile). The
*visual* tube look comes from the fragment shader using `uv.y` across
the strip's width:

```glsl
// Cross-section coordinate: 0 at centerline, 1 at edges.
float r = abs(uv.y - 0.5) * 2.0;

float coreMask  = exp(-r*r * 16.0);   // tight bright filament
float tubeMask  = exp(-r*r * 4.0);    // softer colored body
float bleedMask = exp(-r*r * 1.0);    // wide soft halo (bloom catches)

vec3 emissive = vec3(0.0);
emissive += mix(uCategoryColor, vec3(1.0), 0.7) * coreMask  * uCore;
emissive += uCategoryColor                       * tubeMask  * uTube;
emissive += uCategoryColor * 0.4                 * bleedMask * uBleed;

totalEmissiveRadiance += emissive;
```

Gaussian falloff gives a soft tube look. Anti-aliasing is shader-perfect
(no facet shimmer ever). Bloom catches the bleed mask and does the
volumetric work. The three TOD uniforms (`uCore`, `uTube`, `uBleed`) are
the operator's group-of-3 channel.

### Instancing

One InstancedMesh for all open bands. Per-instance attributes:

- `aCategoryColor` (vec3) — looked up at instance build time from the
  place's category
- `aIsOpen` (float) — 0 or 1, refreshed when Open Hours state changes
  (sparse, event-driven, not per-frame). Multiplied into emissive in
  the shader.

Global uniforms (`uCore` / `uTube` / `uBleed`) refresh once per frame
from the TOD envelope pump. One shader program total — Bloom-stable per
`project_tree_atlas_unified.md`'s constraint.

### GPU cost

~30 verts × 30 places = ~900 verts at peak active set. Negligible — a
fraction of one tree. The shader is three `exp()` calls per fragment;
trivial. Bloom amplifies the bleed naturally without geometric cost.

This is roughly 1/50× the original `TubeGeometry` approach.

### Edge cases worth thinking through

- **Sharp corners (acute angles)** need longer mitre offsets to keep
  band thickness uniform. Standard polyline math.
- **Very small buildings** (footprint perimeter < ~10m) might not
  warrant a band — consider a min-perimeter cull at instance build time.
- **Browse-mode skip** — at Browse zoom, bands collapse to subpixel.
  Don't mount them at all. TOD curve still resolves, feeds nothing.
- **Buildings with non-flat rooflines** — for Lafayette this isn't a
  concern. Future Looks with variable roof heights would need per-edge
  Y values from a roof-edge dataset.

## Bake-time pruner — neon carve-out

Earlier rule was "channel resolves to default → omit from bundle." Neon
*eligibility* is infrastructure and never omitted — even a Look where the
operator left `todNeonGlowCurve` flat at 0 still ships eligibility metadata
so end-users can light their places. The glow curve itself follows normal
prune rules (omit if flat at 0). The carve-out is one line:

```
prune(channel) unless channel === neonEligibilityRegistry
```

## What this displaces from the TOD authoring panel

- Per-category neon `emissiveIntensity` is **not promoted** to TOD-animated.
  Stage doesn't author per-category curves.
- The ~~Neon~~ entry comes off the promotable list. In its place, Sky &
  Light hosts one shared **group-of-3 `<TodChannel>`** — `core` / `tube`
  / `bleed`. Same shape as Lamp Glow's grass/trees/pool triple. Per-place
  hue stays in the category palette (per-instance attribute, never
  TOD-animated).

## Sequencing

1. ✅ Band visual quality pass — single mitred quad strip per place,
   fragment shader with three Gaussian masks (core/tube/bleed), additive
   blending. Lives in `src/components/NeonBands.jsx`.
2. Eligibility metadata schema in bake bundle (tag per eligible place;
   geometry derives from footprint at runtime).
3. Runtime instanced renderer keyed on the currently-open set. (Toy mounts
   the renderer for ALL toy buildings via `forceOn`; LS migration from
   the legacy `LafayetteScene.jsx:459` per-Building tube is the next
   step here.)
4. ✅ Group-of-3 `<TodChannel>` (`core`/`tube`/`bleed`) in Sky & Light,
   wired through `neonState.js` uniforms via `NeonPump` in CartographApp.
5. End-to-end: edit a place's Open Hours → its band lights up at night
   with the operator's authored intensity curve. Open Hours plumbing
   joins via per-instance `aIsOpen` attribute when LS migration lands.

## Why this matters beyond neon

This is the cleanest example in the codebase of operator-authored physics
(Stage) × end-user data (Open Hours) × runtime composition. Get the
contract right here and other future place-driven overlays (event banners,
delivery indicators, capacity glow) inherit the pattern.
