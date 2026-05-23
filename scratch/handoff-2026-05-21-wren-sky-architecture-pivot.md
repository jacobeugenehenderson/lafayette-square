# Wren — Sky architecture pivot (single maxibrief)

**From:** Meteorologist orchestrator (Claude, working under Jacob)
**To:** Wren
**Date:** 2026-05-21

---

This brief consolidates the multi-thread sky work that's been growing since `bff87b5`. The architecture is now locked, the open questions are closed, and the path is clear. You've shipped most of the scaffolding already; this brief tells you what to walk back, what to keep, and what to add. **Read the ADR first.**

## Read first, in order

1. **`meteorologist/NOTES.md` 2026-05-20 "Sky architecture pivot: procedural canon + per-cell overrides (ADR)"** — top-of-file entry. Load-bearing. The architecture I'm asking you to land. Pay particular attention to the "Shader path" subsection — locked to: procedural hydrates the editable mosaics, mosaic drives render.
2. **The SUPERSEDED entry below it** ("Seasonal sun motion + 4-anchor seasonal sky matrix") — context for what's being walked back. Your `bff87b5` work is the source of the partial-walk-back.
3. **The historical procedural sky** at `git show 47c2760^:src/components/CelestialBodies.jsx` lines 405–510. The `GradientSky` function + its keyframe palette (`night`, `dawnDeep`, `dawnPeak`, `dawnEarlyGolden`, `dawnGolden`, `day`, `duskGolden`, `duskEarlyGolden`, `duskPeak`, `duskDeep`). This IS the project's canonical sky palette. You're extracting it back to a primary source.
4. **The existing summer `SKY_DEFAULTS`** in `src/cartograph/skyGrid.js` lines 62–99. Jacob's hand-painted card. It's already partly the project's canon; preserve its artistry through the 24-hour-grid migration.
5. **Commit `d6b861b`** (Preetham removal) for context on what's already been undone.

## The shape you're building

```
cartograph/proceduralSky.js   (NEW, kit-level)
  ├─ KEYFRAMES — the dawn/dusk/day/night palette tables from the historical GradientSky
  ├─ proceduralSkyAt(sunAltitude, isDawn) → { horizon, low, mid, high, sunGlow }  (pure JS hex)
  └─ GLSL_FRAGMENT — same logic as a fragment-shader template string

src/cartograph/skyGrid.js   (RESHAPED)
  ├─ SKY_HOURS = 24                        (replaces variable SKY_SLOT_COLUMNS)
  ├─ SKY_BANDS = 5                          (unchanged)
  ├─ SKY_ANCHOR_DOY                         (unchanged from bff87b5: 79/172/265/355)
  ├─ ANCHOR_CARDS = { winter, spring, summer, autumn }   ← 4 × 24 × 5 hex tables
  │     summer:  hand-painted, remapped from 22 editorial cols to 24 uniform hours
  │     winter:  procedural-seeded + your artistic deviation
  │     spring:  procedural-seeded + your artistic deviation
  │     autumn:  procedural-seeded + your artistic deviation
  └─ buildMosaicForDate(date, overrides) → 24×5 resolved hex grid

src/components/CelestialBodies.jsx   (PATH RESTORED + extended)
  Shader reads the resolved mosaic each frame (CPU passes 24×5 uniforms).
  Procedural function does NOT re-evaluate at render time — it hydrated the
  ANCHOR_CARDS at build time; the cards drive runtime. What-you-author =
  what-renders.

public/baked/<look>/scene.json   (SCHEMA DOWNGRADE)
  Old (bff87b5):  sky.values.{winter,spring,summer,autumn} = 4×22 matrices
  New:            sky.overrides = [{ hour, band, hex }]  — sparse list, often empty
  Migration:      old shape → drop the per-anchor matrices, convert summer's
                   non-procedural-matching cells to overrides at corresponding hours
                   (preserve hand-painted deviations as Look-level overrides)

src/cartograph/SkyGradientGrid.jsx   (REWORKED)
  24 hour-labeled columns. Each cell renders as a CSS gradient (sample
  resolver at left/middle/right minute) — flat block if no nearby override,
  gradient bleed if adjacent to one. Click cell → author override at
  (hour, band). Shift+click → revert that cell to procedural-canonical.
```

## The override math (the elegant bit)

For each cell at (hour h, band b) in the per-day resolved mosaic:

```js
// Base from anchor lerp by dayOfYear
flanking = identifyFlankingAnchors(dayOfYear)   // e.g. (spring, summer) at May 19
mixFactor = positionBetween(flanking, dayOfYear)
base[b] = lerpHex(ANCHOR_CARDS[flanking.a][h][b], ANCHOR_CARDS[flanking.b][h][b], mixFactor)

// Apply each override's spatial + temporal envelope
for (const O of overrides) {
  // Spatial: Chebyshev distance (king-move)
  const hourDist = Math.min(Math.abs(h - O.hour), 24 - Math.abs(h - O.hour))   // cyclic at midnight
  const bandDist = Math.abs(b - O.band)
  const d = Math.max(hourDist, bandDist)
  const spatialWeight = d === 0 ? 1.0 : d === 1 ? 0.5 : 0

  if (spatialWeight === 0) continue

  // Temporal: 15-min ramp on either side of the override hour
  const RAMP = 15
  const m_abs = h * 60 + currentMinuteWithinHour     // 0..59 within hour h
  const ovStart = O.hour * 60
  const ovEnd   = O.hour * 60 + 60
  let temporalWeight
  if (m_abs >= ovStart && m_abs < ovEnd) temporalWeight = 1.0
  else if (m_abs >= ovStart - RAMP && m_abs < ovStart) temporalWeight = (m_abs - (ovStart - RAMP)) / RAMP
  else if (m_abs >= ovEnd && m_abs < ovEnd + RAMP) temporalWeight = ((ovEnd + RAMP) - m_abs) / RAMP
  else temporalWeight = 0

  const combined = spatialWeight * temporalWeight
  base[b] = lerpHex(base[b], O.hex, combined)
}

// Multi-override stacking: each override applies in turn (above loop). For
// cells influenced by multiple overrides at d=1, this approximates an average.
// If results read poorly with stacking, switch to: collect all influences,
// sum weighted contributions, normalize. Disclose if you go that route.
```

## The 10-item walk

These are the BACKLOG items, fleshed out:

### 1. Extract `cartograph/proceduralSky.js`

Copy the keyframe palette + altitude→bands lerp logic from `47c2760^:src/components/CelestialBodies.jsx` lines 405–510. Output:

```js
// cartograph/proceduralSky.js
export const KEYFRAMES = {
  night:           { horizon: '#1a1525', low: '#0f0f18', mid: '#080810', high: '#050508' },
  dawnDeep:        { horizon: '#3a2838', low: '#30254a', mid: '#151838', high: '#0a0c1a' },
  dawnPeak:        { horizon: '#c07050', low: '#885578', mid: '#4a3878', high: '#141838' },
  dawnEarlyGolden: { horizon: '#dda065', low: '#b08088', mid: '#7068b0', high: '#223060' },
  dawnGolden:      { horizon: '#d0b888', low: '#a8a0a8', mid: '#7895c0', high: '#3a6aaa' },
  day:             { horizon: '#9dc5e0', low: '#80b5e0', mid: '#5a9ce0', high: '#4a90e0' },
  duskGolden:      { horizon: '#ccaa70', low: '#aa9088', mid: '#7090bb', high: '#3a68a8' },
  duskEarlyGolden: { horizon: '#dd8840', low: '#bb7065', mid: '#6858a0', high: '#1a2555' },
  duskPeak:        { horizon: '#cc6030', low: '#a05058', mid: '#4a3570', high: '#141835' },
  duskDeep:        { horizon: '#7a3828', low: '#40253a', mid: '#181535', high: '#0a0c1a' },
}

export function proceduralSkyAt(sunAltitude, isDawn) {
  // ... altitude-banded keyframe lerp + sunGlow logic from the historical fn
  return { horizon, low, mid, high, sunGlow }
}

// Optional: GLSL_FRAGMENT template string for shader-side use.
// Phase 4b uses the shader path; this template is for future consumers
// (Preview perf debug, Stage shader inspection, etc.). Include if cheap.
export const GLSL_FRAGMENT = `/* same lerp logic as proceduralSkyAt */`
```

Pure JS, hex strings (not THREE.Color). Portable to Node ESM (for the build-time hydration script).

### 2. Sample for 3 missing seasonal cards (mechanical)

Build-time hydration via `cartograph/pipeline/hydrate-anchor-cards.js`:

```js
// For each season in [winter, spring, autumn]:
//   - referenceDate = solstice or equinox date at LS lat
//   - For each hour h in [0..23]:
//     - clockTime = referenceDate with h:00 local
//     - sunPos = SunCalc.getPosition(clockTime, LS lat, LS lon)
//     - isDawn = h < solarNoonHour
//     - bands = proceduralSkyAt(sunPos.altitude, isDawn)
//     - Append { horizon, low, mid, high, sunGlow } to the card
// Output: 3 × 24 × 5 hex tables → write to skyGrid.js as static data.
```

Runs once during the pivot commit. Re-runnable if you ever tune the keyframes.

### 3. Wren's artistic deviation pass (your painter time)

You have free hand on these three cards. Look at the raw hydrated cards from step 2; then deviate each season per your eye:

- **Winter**: cooler hue cast across the lighter bands (zenith, mid). Subtle desaturation across the day. Slight darken at noon (winter air is clearer, sun lower → less brilliant). Sun-glow cooler. Pinker pre-dawn/post-dusk if it feels right.
- **Spring**: fresh/green-cast horizon at morning. Crisper noon zenith. Slight warm-cool oscillation across the day (spring weather feels variable).
- **Autumn**: golden-amber bias across all daytime hours. Boosted saturation. Richer sunset colors. Cooler short twilights. Reads "harvest-light."

Your eye, your call. Disclose the artistic decisions in the commit body so Jacob can review + veto if any season lands off. Reference: the existing summer card is what "lovely" looks like in this project — match its quality bar.

### 4. Reshape `skyGrid.js`

```js
export const SKY_HOURS = 24
export const SKY_BANDS = ['horizon', 'low', 'mid', 'high', 'sunGlow']

export const ANCHOR_CARDS = {
  winter: WINTER_CARD,
  spring: SPRING_CARD,
  summer: SUMMER_CARD,   // migrated from existing SKY_DEFAULTS
  autumn: AUTUMN_CARD,
}

export function buildMosaicForDate(date, overrides = []) {
  // 1. flanking anchors by dayOfYear
  // 2. lerp 24×5 base
  // 3. apply overrides per spatial/temporal envelope at this minute
  // 4. return resolved 24×5 hex grid
}
```

Delete `SKY_DEFAULTS_4ANCHOR` (bff87b5's now-obsolete export). Existing helpers (`resolveSkyAtMinute`, `getSkyColumnMinutes`) may need rework or removal — your call. The minute-of-day interpolation between adjacent hour columns still happens shader-side; the resolver gives the shader its 24×5 input.

### 5. Migrate existing summer SKY_DEFAULTS → 24-hour grid (preserve artistry)

The current SKY_DEFAULTS has 22 editorial columns (4 dawn, 4 sunrise, 1 noon, 4 golden, 4 sunset, 4 dusk, 1 night). For each editorial column:

1. Compute the column's representative summer clock-hour (via `getTodSlotMinutes(SUMMER_REF_DATE)` + the within-slot fraction)
2. Round to the nearest of [0..23]
3. Assign that summer's editorial column's swatches to that hour in SUMMER_CARD

For hours that get NO editorial column mapped (e.g., 1am, 2am, 3am — summer's column count compresses heavy night), populate from proceduralSkyAt with summer's sun-altitude at that hour. So summer's card is hybrid: hand-painted where Jacob had editorial cols, procedural-seeded elsewhere.

Document the mapping in a comment table inside skyGrid.js — operator should be able to see which hours are hand-painted heritage vs. procedural seed.

### 6. scene.json schema downgrade

Old shape (bff87b5):
```json
"sky": {
  "values": {
    "winter": [/* 22 editorial cols */],
    "spring": [...], "summer": [...], "autumn": [...]
  }
}
```

New shape:
```json
"sky": {
  "overrides": [
    { "hour": 18, "band": "horizon", "hex": "#ff2244" },
    { "hour": 18, "band": "low",     "hex": "#cc4466" }
  ]
}
```

Sparse list. Most Looks have empty overrides → defaults to procedural-canon ANCHOR_CARDS for that date.

Migration in `cartograph/bake-scene.js`: detect old shape, drop the 4-anchor matrices (they're now kit-level data, not per-Look). If anything in the old summer matrix DIFFERED from the new SUMMER_CARD's procedural hydration at that hour, save as a Look-level override (preserves the hand-painted deviation). Otherwise drop.

### 7. Override resolver implementation

Inside `buildMosaicForDate(date, overrides)`. The math from the override section above. Notes on edge cases:

- **Hour distance wraps at midnight.** `dist_h = min(|h - hO|, 24 - |h - hO|)`. Band distance doesn't wrap.
- **Multi-override stacking.** Loop applies overrides sequentially; lerp the base toward each in turn. If two overrides at d=1 both influence one cell, results may read as "average of both blends" which is the intended behavior. If you find pathological cases (e.g., 5 overrides clustering), switch to weighted-sum-normalize and disclose.
- **Override at d=1 from different sides.** Cell at hour 18 with overrides at (17, horizon) and (19, horizon): both contribute 50% blend. Order-of-application may matter. Use the weighted-sum approach for symmetry if you go that route.
- **Performance.** Computing per minute is fine — the resolver runs CPU-side; shader receives uniforms each frame; not in the inner loop. If override list grows past ~20, consider caching by minute.

### 8. Sky Builder UI: 24 hour-labeled columns + CSS gradient cells

Each cell renders as a CSS linear-gradient (horizontal) sampling the resolver at three minutes:
- Left edge: `resolveAt(date, h * 60)` — start of hour h
- Middle: `resolveAt(date, h * 60 + 30)`
- Right edge: `resolveAt(date, h * 60 + 59)` — end of hour h

If all three are the same hex: flat block. If they differ: linear-gradient with three color stops at 0%, 50%, 100%. CSS will interpolate smoothly between.

Hour labels: `0  1  2 … 23` thin numerals below each column. Bold/colored at `0`, `6`, `12`, `18` (every 6 hours). Sun-overhead marker (a small icon) at the column where solar noon falls on the active date.

Click a cell → author override at (hour, band) with the cell's current hex (operator can then pick a new color). Shift+click → remove override (cell reverts to procedural-canon). Hover tooltip: `Sky at 7pm — horizon band — override active` or `(procedural canon)`.

### 9. Restore procedural sky shader path

Keep the existing CelestialBodies' bands-mixing path; mosaic feeds the bands. Each frame the shader receives the 24×5 mosaic as uniforms (or a small texture) + the current minute; it lerps adjacent hour-columns for minute-of-day continuity within the existing band-altitude shader logic. Procedural function isn't called from the shader. (You'll know best how to wire this efficiently — feel free to deviate from this sketch.)

### 10. Doc sweep

Update at minimum:
- `meteorologist/NOTES.md` — add a 2026-05-21 entry below the ADR documenting what landed
- `meteorologist/BACKLOG.md` — mark the "Sky architecture pivot" item complete; collapse the queued sub-phase 2 line (it was retired)
- `meteorologist/README.md` — phase list extends with this commit
- `cartograph/ARCHITECTURE.md` or `FEATURES.md` — if anything in there describes the sky data shape, update

Meteorologist-internal docs (ARCHITECTURE / INTERFACE / FEATURES) mostly stay; they describe per-cloud TodChannel authoring not sky-builder shape. Quick scan; touch only if something's wrong.

## Stash isolate (still applies)

Per `feedback_stash_isolate_per_file` (amended): Jacob's working tree is wide. Before commit, `git status --short` — verify ONLY the intended paths are staged. The previous baby's catch (pre-staged files from an old session) is the kind of thing to defend against.

Anticipated staged set:
- `cartograph/proceduralSky.js` (NEW)
- `cartograph/pipeline/hydrate-anchor-cards.js` (NEW, one-shot)
- `src/cartograph/skyGrid.js`
- `src/cartograph/SkyGradientGrid.jsx`
- `src/cartograph/stores/useCartographStore.js` (if override actions move there)
- `src/components/CelestialBodies.jsx`
- `cartograph/bake-scene.js` (migration logic)
- `cartograph/pipeline/schema/...` (if sky channel has a schema there — check)
- `meteorologist/NOTES.md`, `BACKLOG.md`, `README.md`
- (optionally) `cartograph/ARCHITECTURE.md` or `FEATURES.md`

## Phasing inside the brief (your call)

If you want one big commit: ship Phase A (mechanical: extract + reshape + migrate + UI rewire) and Phase B (artistic: 3 deviated seasonal cards) together. Cleanest because the architecture works visibly the moment all pieces land.

If you want two commits: A first ("mechanism shipped; cards are raw procedural seeds"), B second ("Wren's artistic deviation on 3 cards"). Splits responsibility; lets Jacob review the mechanism before the artistic call.

I'd lean ONE commit — the artistic deviation IS what makes the click-an-anchor-and-see-something-change feature visible. Without B, the year-strip scrub produces only sun-altitude-driven Preetham-style variation (which is now gone), not the seasonal-character story.

Up to you. Either flow ships the same architecture.

## Memories to respect

- `feedback_stash_isolate_per_file` (amended 2026-05-19) — check staged state AND working-tree before commit
- `feedback_baby_must_surface_scope_drift` — disclose extensions in commit body
- `feedback_json_stringify_loses_handauthored_format` — scene.json migration touches summer's hand-painted swatches; preserve format where possible (or document the reformat)
- `feedback_kit_helper_css_import_index_not_tokens` — already correct
- `project_kit_helpers_pattern` — Cartograph owns sky authoring; other helpers consume via published artifacts

## Disclosure expectations

Same bar as before. Disclose:
- Whether you went one-commit or two
- Any deviations from the spatial/temporal envelope math (e.g., switched to weighted-sum-normalize for multi-override)
- The summer migration's hour-mapping choice (which editorial cols mapped to which hours, especially where two editorial cols landed on the same hour)
- Your artistic deviation reasoning per season — even short ("winter: shifted zenith blue cooler ~10%, desaturated mid bands, brought sun-glow toward pinker pre-dawn")
- Any places the brief was wrong or contradictory

## Report back

When done, report to Jacob: commit hash(es), files changed, visual verification status, scope-drift disclosures, artistic-deviation notes, thumbs-up. Jacob forwards to me; I'll do the final orchestrator-level doc sweep + close the kit clock+calendar arc with the production `<ClockCalendarPump mode="live">` mount.

Good hunting. Same bar as before: honest disclosures, scope-faithful commits, the painter's eye where it counts.

— Claude (Meteorologist orchestrator)
