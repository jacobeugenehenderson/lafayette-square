# Cross-helper maxibrief: 4-anchor seasonal sky matrix in Cartograph

**From:** Meteorologist orchestrator
**To:** Cartograph coordinator
**Date:** 2026-05-20
**Scope:** Coordinator-to-coordinator handoff. You translate to your baby brief(s); I outline the architecture, the contract, the load-bearing details, and the rationale. This is the big follow-up to the kit calendar primitive — the sky color half of the seasonal-authoring story.

---

## Background you need to read

1. **`meteorologist/NOTES.md` 2026-05-20 entries**, both of them. The "Seasonal sun motion + 4-anchor seasonal sky matrix (ADR)" entry at the top sketches what this maxibrief implements; the "Kit-level clock + calendar anchor (ADR)" entry explains the shared primitive your work consumes.

2. **State of the world after today:**
   - `src/hooks/useCalendar.js` shipped — exposes `currentDate`, `dayOfYear()`, `season()`, plus bidirectional sync with `useTimeOfDay`.
   - `src/components/DawnTimeline.jsx` shipped as a unified time card with year-strip + 4 season-name anchors (Spring/Summer/Autumn/Winter at solstices + equinoxes) + playback controls.
   - Year-strip scrubbing now reaches `CelestialBodies.jsx:986` via `SunCalc.getPosition(currentTime, lat, lon)`. **Sun POSITION responds to year-position automatically.** Sky COLOR does not (still TOD-keyed only) — that's what this brief fixes.

3. **The 4 season anchors are physical waypoints:**

   | Anchor | Date | Day-of-year | What it means physically |
   |---|---|---|---|
   | Winter solstice | Dec 21 | ~355 | Lowest sun, longest night, coldest light spectrum |
   | Spring equinox | Mar 20 | ~79 | Sun on celestial equator, day = night, freshening |
   | Summer solstice | Jun 21 | ~172 | Highest sun, longest day, warmest haze |
   | Autumn equinox | Sep 22 | ~265 | Sun returning south, golden tone |

   These are the same anchors the year-strip clickable names point at. Edit at anchor → preview between.

---

## The ask, in one sentence

Replace the single-layer sky matrix in `scene.json` with **4 anchor layers**, gain an **edit-lock UX** in the Sky Builder driven by year-strip thumb proximity, and **interpolate at runtime** between flanking anchors based on `useCalendar.dayOfYear()`.

---

## The three coupled sub-phases

These are three commits' worth of work (or your baby's call on how to split). They're tightly coupled — the schema migration breaks runtime consumers until the runtime interpolation also lands.

### Sub-phase 1 — Schema migration

`scene.json`'s sky channel today is a single grid (5 bands × N TOD swatches). New shape:

```jsonc
"sky": {
  "values": {
    "winter": { /* current grid shape */ },
    "spring": { /* current grid shape */ },
    "summer": { /* current grid shape */ },
    "autumn": { /* current grid shape */ }
  }
}
```

Migration of existing data: the current LS authored swatches become ONE of the four layers, with the other three set to a sentinel meaning "inherit from physics" (or initial-blank, or copied from the populated layer, or whatever your baby thinks reads cleanest). Recommend treating LS's existing matrix as **summer** since the warm-orange-cyan story leans summery; operator can later regenerate the other three from physics, or copy from summer + tune.

Schema version bumps accordingly. `cartograph/bake-scene.js` migration logic for old design.json reads — detect 1-layer shape and wrap into the 4-layer shape's matching slot.

### Sub-phase 2 — Sky Builder UI edit-lock

Today's `SkyGradientGrid.jsx` (and friends in `CartographSkyLight.jsx`) authors the single matrix directly. New behavior:

- **Anchor proximity check.** Read `useCalendar.getState().currentDate` + compute distance to nearest anchor day-of-year. Within ±2 days = "parked on anchor"; outside = "between anchors."
- **At anchor:** matrix shows that anchor's swatches; all swatch cells are editable. Show a small badge: `● editing — Spring` (using the anchor color from DawnTimeline's season bands).
- **Between anchors:** matrix shows the interpolated tween — for each cell, lerp between the two flanking anchors' swatches based on the year-fraction position. All swatches are READ-ONLY (cursor changes, click does nothing or shows a hint). Badge: `🔒 tweening — Spring → Summer` (or whichever pair).
- **Click an anchor name in the year-strip** → year thumb snaps to that anchor; matrix unlocks for editing that anchor's layer. (DawnTimeline's `jumpToAnchor` already does the thumb snap; your work just needs to react to year position changing.)
- **Per-anchor Revert** affordance — restores that anchor's swatches from physical-sky-model seed (sub-phase 3 below) OR from a stored default. Operator can wipe their deviations on one anchor without affecting the other three.

The badge / mode-indicator placement is your baby's UX call. Top of the SkyGradientGrid card seems natural. The visual should make "edit vs preview" unmistakable — operators must not accidentally try to edit a tween cell and wonder why nothing happens.

### Sub-phase 3 — Runtime interpolation

The sky shader (in `CelestialBodies.jsx` or wherever the matrix is read into shader uniforms) needs to:

1. Read all 4 anchor layers from scene.json
2. Each frame, compute `dayOfYear = useCalendar.getState().dayOfYear()` (or pass through as uniform/scenes' resolver)
3. Identify the two flanking anchors + the lerp fraction between them
4. Per cell, interpolate the swatch color: `mix(anchorA.color, anchorB.color, t)`
5. Feed the interpolated grid to the shader as it does today

Cyclic wraparound matters: between autumn (doy 265) and winter (doy 355), straightforward; between winter (doy 355) and spring (doy 79), wraps through year-end. Lerp distance needs cyclic-day-of-year math, not raw subtraction.

If the shader currently uses a baked atlas/texture for the matrix, you may need to either bake 4 textures + mix in shader, OR keep the matrix in uniforms + sample. Baby's call based on what the current pipeline does.

---

## What this depends on

- `useCalendar` (shipped). Read via `useCalendar.getState().dayOfYear()` or subscribe via `useCalendar(s => s.dayOfYear())`.
- Year-strip in DawnTimeline (shipped). Already calls `setDate` with the right Date when an anchor name is clicked; your edit-lock UI just needs to react to the resulting `currentDate` change.
- The current Sky Builder UX (your existing `SkyGradientGrid.jsx` + the 5×N swatch component). Stays intact at the grid level; gains the edit-lock state machine on top.

## What this doesn't touch

- Cloud authoring (Teapot) — unaffected. Cloud preset params already TodChannel-shaped per-cloud; not seasonal.
- Conditions / Almanac directive — unaffected. Their atmospheric modulations sit on top of the (now-seasonal) sky envelope, same way they sit on top of the (currently-static) sky envelope today.
- Meteorologist's CanaryScene — unaffected. CelestialBodies reads `useSceneJson(activeLookId)` and consumes whatever shape the scene.json sky channel is. After sub-phase 1 + 3 ship, the canary sky color automatically responds to year-strip scrubbing because CelestialBodies is the shared consumer.
- Arborist — unaffected.
- Production runtime — unaffected (other than the LS scene.json migrating to the new shape).

This is a Cartograph-internal change with kit-wide visible effects through CelestialBodies. Clean architectural shape.

---

## The "seed-from-physics" companion direction (parked, but worth queuing)

The 4-layer matrix raises authoring burden 4× without help. Pairing with seed-from-physics (parked in earlier ADRs) makes it tractable: each anchor's initial 5×N swatches regenerate from a Hosek-Wilkie or Preetham sky model + the anchor's date + a "dramatize" curve (saturation/contrast push) — then operator deviates.

**Not in this maxibrief's scope.** Sub-phases 1-3 above ship the matrix architecture; seed-from-physics is a separate Cartograph baby brief that follows once the 4-layer scaffold exists. Your baby can stub it as a "regenerate from physics" button that's disabled or shows "coming soon" — placeholder for the future hookup.

But if your baby has the appetite + cycles, implementing a minimal physical sky model (Preetham is ~50 GLSL lines; runs in shader OR can be done in JS per-cell at authoring time) within this same brief would mean every new Look auto-populates with 4 sensible anchor matrices and the operator only deviates. That's a 4× win on authoring burden. Your call.

---

## Coordination

- **Timing flexible.** No critical dependencies after the kit calendar primitive shipped. Pairs naturally with the queued Arborist seasonal-tree consumption (different helper, same anchor).
- **Cross-helper visibility:** when sub-phase 3 lands, Meteorologist's CanaryScene starts showing seasonal sky color shifts automatically (because it mounts `<CelestialBodies />` with the active Look's scene.json). I (Meteorologist orchestrator) don't need to do anything; the architecture earns its keep.
- **Schema-version bump:** coordinate with me before shipping the new scene.json shape so I can flag if Meteorologist's Almanac directive composition needs adjustments. (I don't think it does — directive overrides happen on top of the resolved sky envelope at runtime, and that resolution becomes "interpolate 4 anchors + apply override" instead of "use 1 envelope + apply override." Same composition pattern.)
- **Backward compat:** if any old Look files exist that still have 1-layer scene.json, the migration should detect and wrap. Don't break loading of existing Looks.

---

## Suggested baby phasing

Three babies in sequence:

1. **Schema migration baby.** Sub-phase 1 alone. Migrate scene.json shape + bake-scene.js + read-side defensive code (handle both 1-layer and 4-layer until everything migrates). Don't ship until 2 + 3 are queued so production doesn't see a half-migrated state.
2. **Edit-lock UI baby.** Sub-phase 2. Adds the year-strip-driven edit/preview state machine to SkyGradientGrid and friends. Depends on 1 (or stubs the 4-layer read with a hardcoded 4-copy of the current matrix for early testing).
3. **Runtime interpolation baby.** Sub-phase 3. CelestialBodies (or wherever) reads + lerps. Closes the loop — sky color visibly responds to year scrub.

Or your baby fuses 2 + 3 if your machinery is small enough. 1 alone is risky in isolation (anything that reads scene.json will break until consumers handle the new shape) — recommend staging 1 + 3 together, with 2 following.

---

## Memories to flag to your baby(ies)

- `feedback_stash_isolate_per_file` (amended) — check both working-tree AND staged state before commit.
- `feedback_baby_must_surface_scope_drift` — disclose extensions to brief in commit body.
- `feedback_json_stringify_loses_handauthored_format` — the existing LS scene.json has carefully-authored swatches. Migration should preserve formatting where possible (or accept the reformat with a `*.defaults.json` sibling pattern, similar to `almanac.defaults.json`).
- `project_kit_helpers_pattern` — Cartograph owns Sky Builder + scene.json schema. Other helpers consume via the kit's existing useSceneJson + useCalendar primitives, not via cross-helper imports of Cartograph code.

---

## Report shape

When each sub-phase ships, the report back to Jacob includes:
- Commit hash + files changed
- Schema version + migration story (sub-phase 1 only)
- Edit-lock state machine behaviors (sub-phase 2)
- Interpolation visible at year-scrub (sub-phase 3)
- Scope-drift disclosures
- Thumbs-up

Jacob forwards; I'll close my orchestration loop by spot-checking Meteorologist's CanaryScene to confirm seasonal sky color now shifts as the year-strip moves.

After all three sub-phases ship + Arborist seasonal-tree consumption ships, the kit clock+calendar arc closes. Production runtime mount of `<ClockCalendarPump mode="live">` is the final small commit; everything else seasonal-aware falls out naturally.
