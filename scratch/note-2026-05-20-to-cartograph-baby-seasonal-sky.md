# Wren — next up: 4-anchor seasonal sky matrix

**From:** Meteorologist orchestrator (Claude, working under Jacob)
**To:** Wren, picking up `scratch/handoff-2026-05-20-cartograph-4anchor-seasonal-sky.md`
**Date:** 2026-05-20

---

Wren — great work on Phase 4b.1 and the unified time card. The DST catch on `useCalendar.dayOfYear` and the "year-strip drag preserves the current hh:mm:ss.ms from currentDate" touch were both unprompted and exactly right. Same bar for this one.

## What's changed since you last shipped

While you were between tasks, I committed two small direct edits in your wake:

1. **`5e98533` — year-strip seasons + bidirectional clock/calendar sync.** Replaced your 12 month-letter markers on the year-strip with 4 season-name anchors (Spring / Summer / Autumn / Winter at solstices + equinoxes). And — the bigger thing — made `useCalendar.setDate` ↔ `useTimeOfDay.setTime` bidirectionally sync. Direct setState writes on both stores; no recursion. This was load-bearing: scrubbing your year-strip now reaches `CelestialBodies.jsx:986` via `SunCalc(currentTime, lat, lon)`. **Sun position responds to year-position immediately** — December sun low, June sun high, equinox sun on the celestial equator.

2. **Doc sweep** (commits `d593f40` + `c3a0b58`) — README / NOTES / BACKLOG / INTERFACE / FEATURES / ARCHITECTURE all reflect the new state. INTERFACE §6 now distinguishes the unified time card (your work) from the per-channel TodChannel rows below it (they were conflated; you can blame my original brief writing).

So now: scrubbing the year visibly moves the sun. **Sky color does NOT yet follow the year** — that's the gap your maxibrief fixes.

## The new work

`scene.json`'s sky channel goes from 1 grid → 4 anchor layers (winter / spring / summer / autumn). Sky Builder gains an edit-lock UX (operator parks year-strip on an anchor → matrix unlocks; off-anchor → matrix is read-only preview of the tween between the two flanking anchors). Runtime interpolates between anchors based on `useCalendar.dayOfYear()`.

The maxibrief breaks it into three sub-phases (schema migration, edit-lock UI, runtime interpolation) and discusses sequencing. **Read the maxibrief in full** — I won't repeat the architecture here.

## Things you already know that apply

- **TodChannel-pattern parallel.** Anchors are the keyframes; between anchors = interpolated preview; operator must park on a keyframe to edit. Same model you already implemented for TOD's slot chips.
- **Year-strip already has the 4 anchor click targets.** Spring / Summer / Autumn / Winter — clicking them snaps the thumb. Your UI work uses `useCalendar.currentDate` to detect anchor proximity.
- **Bidirectional sync means writing to either store updates both.** Your runtime interpolation code reads `useCalendar.dayOfYear()` (or `useCalendar(s => s.dayOfYear())` for reactive subscription); writes are unaffected because CelestialBodies already does the right thing.
- **The kit anchor + pump pattern.** Same architecture as the unified time card. You wrote it; you know it.

## Things this brief surfaces that are subtle

- **Cyclic day-of-year math.** Winter (anchor doy ~355) wraps around to spring (anchor doy ~79). Interpolation between them needs to handle the year-boundary correctly — don't use raw subtraction.
- **Schema migration is the riskiest part.** Existing LS scene.json has carefully-authored swatches that should map to one anchor (recommend `summer` — see maxibrief for rationale). Per `feedback_json_stringify_loses_handauthored_format`, consider shipping `scene.defaults.json` siblings to preserve the hand-authored formatting forever.
- **Backward compat through the transition.** Code that reads sky channels should handle both 1-layer (today) and 4-layer (post-migration). Wrap-and-coerce on read; cleanest cuts on write.

## Suggested phasing (your call)

The maxibrief recommends three sub-phases:
1. **Schema migration** — `scene.json` shape + bake-scene.js migration logic + read-side wrap
2. **Edit-lock UI** — Sky Builder gains the park-on-anchor-to-edit state machine
3. **Runtime interpolation** — CelestialBodies (or wherever sky shader reads matrix) lerps between anchors

**Recommended:** ship 1 + 3 together (otherwise production has a half-migrated schema). 2 can follow as a separate commit. Or do all three in one big commit if you prefer atomic — your call based on review-load preference.

## Stash isolation matters

The amended `feedback_stash_isolate_per_file` (after the Phase 4a baby's pre-staged-files catch) applies again. Jacob's working tree has wide in-flight diff. Verify staged state immediately before commit via `git status --short`.

## Disclosure expectations

Same as before: if you make a load-bearing choice the brief doesn't pin (e.g. how cyclic interpolation handles the winter wrap; which anchor LS's existing matrix migrates to; whether colors interpolate in RGB or LAB), disclose in the commit body. Those become the project's doctrine if not surfaced.

The bar this session has been: scope-faithful single-commit deliveries with honest verification + thoughtful surfaced decisions. You set that bar; I'd love to see it again here.

## Back-channel

If you spot architectural friction the maxibrief misses, surface to Jacob; he routes to me and we reconcile. The maxibrief is my best understanding from outside the code path; your eyes on the actual schemas + shaders might surface something I underspecified.

Good hunting. The visible win lands the moment your runtime interpolation reads the new shape — Meteorologist's CanaryScene will start showing seasonal sky color shifts on the next refresh, with no Meteorologist-side changes. The architecture earns its keep.

— Claude (Meteorologist orchestrator)
