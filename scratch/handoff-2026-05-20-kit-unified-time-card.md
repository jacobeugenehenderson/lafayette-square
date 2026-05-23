# Kit unified time card — expand DawnTimeline → TOD + ToY + playback

Expand `src/components/DawnTimeline.jsx` from a TOD-only scrub bar into a unified time card with three rows: existing **Time of Day strip** + new **Time of Year strip** + new **playback controls**. Single component, single mount site, kit-level (already in `src/components/`). All current consumers (Stage's Sky & Light card, Meteorologist's Teacup + Condition editor) inherit the new functionality without touching their code.

**This brief supersedes the previously-queued Cartograph DateScrubber brief** — the year strip absorbs that role inside the consolidated card.

---

## Read first

1. **`meteorologist/NOTES.md` 2026-05-20 ADR "Kit-level clock + calendar anchor"** — the architectural rationale for one shared anchor + per-helper UIs.
2. **`src/components/DawnTimeline.jsx`** — the current TOD scrub bar (116 LOC). Your starting point. Read top to bottom; the year strip + playback get added below the existing layout, not as a separate component.
3. **`src/hooks/useTimeOfDay.js`** — exposes `currentTime`, `setTime` (operator scrub), `setTimeFromLive` (pump tick), `isLive`, `returnToLive`, `setTimeSpeed`, `setPaused`, `togglePause`. Playback infrastructure is already there — you're just surfacing it.
4. **`src/hooks/useCalendar.js`** — exposes `currentDate`, `setDate`, `setDateFromLive`, `isLive`, `returnToLive`, `dayOfYear()`, `season()`, `setDayOfYear(doy)`, `setSeason(name)`.
5. **`src/lib/dawnTimeline.js`** — helpers DawnTimeline uses (`getDawnWindow`, `dateToFraction`, `fractionToDate`). The year-strip equivalent helpers you may need to add or inline.

---

## Scope

### File to MODIFY (single)

```
src/components/DawnTimeline.jsx
```

Keep the file name. Renaming to `TimeCard.jsx` would touch every consumer (Stage's SkyLight, Meteorologist's Teacup + ConditionEditor, possibly Preview); not worth the churn. Expand in place.

### File NOT to modify

- `useTimeOfDay.js` / `useCalendar.js` — both already shipped with all the methods you need.
- `src/lib/dawnTimeline.js` — extend with a `yearFractionFromDate(date)` helper if needed (small addition, OR inline the math in the component — your call). Don't restructure.
- Any consumer file (CartographSkyLight, Teacup, ConditionEditor). They mount `<DawnTimeline />`; that mount-site stays.

---

## Component shape after expansion

Three vertically stacked rows inside the existing component (no new file):

```jsx
<div className="space-y-2">
  {/* existing TOD strip — unchanged */}
  <TodStrip />

  {/* NEW year strip */}
  <YearStrip />

  {/* NEW playback controls */}
  <PlaybackRow />
</div>
```

Or factor as inline subcomponents inside DawnTimeline.jsx if it keeps things readable. Don't extract to separate files — keep the cohesion.

### Existing TOD strip

**No changes.** The current scrub-bar logic (waypoint labels + track + thumb + drag handlers) stays exactly as it is. If you find yourself touching it, you've drifted scope.

Optional polish: add a tiny "live" badge on the TOD label row if `useTimeOfDay.isLive`. Tiny green dot + "live" microcopy. Skip if it complicates the layout.

### NEW Year strip

Mirrors the TOD strip's shape: waypoint labels above, draggable track below, thumb at current date.

```
┌─────────────────────────────────────────────────────────────┐
│  J   F   M   A   M   J   J   A   S   O   N   D             │ month markers
│  ────────────────────────────────────●─────────────────     │ year track + thumb
│  winter  ░░░░░░  spring  ░░░░░░  summer  ░░░░░░  autumn     │ season bands
└─────────────────────────────────────────────────────────────┘
```

**Track:** horizontal, similar height to TOD track (h-6). Position 0 = Jan 1, position 1 = Dec 31. Use day-of-year for fraction math: `fraction = useCalendar.getState().dayOfYear() / (isLeapYear() ? 366 : 365)`.

**Month markers:** 12 evenly-spaced "J F M A M J J A S O N D" letters above the track. Subtle — same opacity treatment as TOD's waypoint labels. Click on a month letter → `setDate` to that month's first day (~useful jump shortcut).

**Season bands:** subtle background tint behind the track segmenting it into 4 sections. Use NAMED_TOD_SLOTS-style color tokens if season colors exist in `src/tokens/design.css` (check for `--season-spring` etc.); otherwise use four muted hues — soft blue (winter), soft green (spring), soft warm (summer), soft amber (autumn). Backgrounds should be subtle — `~15-20% opacity`, not competing with the thumb.

Northern-hemisphere season day-of-year mapping (matches `useCalendar.season()`):
- winter:  355-365 + 0-78    (Dec 21 – Mar 19)
- spring:  79-171              (Mar 20 – Jun 20)
- summer:  172-264             (Jun 21 – Sep 21)
- autumn:  265-354             (Sep 22 – Dec 20)

**Thumb:** filled circle, same visual as TOD thumb. Color changes for scrub vs live (e.g. `#4ade80` green at live; `#60a5fa` blue when dragging — mirrors TOD's pattern).

**Drag:** pointer down + move on the track scrubs the date. `useCalendar.getState().setDate(new Date(year, 0, dayOfYear))`. setDate flips isLive=false.

**Click on month letter:** jump to that month's first day. Convenience for "what does it look like in January?" without needing to drag-aim.

### NEW Playback row

Compact horizontal row, ~32-40px tall:

```jsx
<div className="flex items-center gap-3">
  <PlayPauseButton />   {/* ▶ / ⏸ — drives useTimeOfDay.togglePause */}
  <SpeedSelect />       {/* dropdown: 1× / 60× / 600× / 3600× */}
  <ScopeToggle />       {/* "TOD only" | "TOD + Year" — new local state */}
  <ReturnToLiveButton /> {/* ⟲ live — drives both hooks' returnToLive */}
</div>
```

#### PlayPauseButton

- Reads `useTimeOfDay(s => s.isPaused)`
- onClick → `togglePause()`
- Icon: ▶ when paused, ⏸ when playing
- When `isPaused` flips false, a `useEffect` somewhere in DawnTimeline drives advancement: setInterval that calls `setTime(currentTime + speed * dt)` every N ms. Speed comes from `useTimeOfDay.timeSpeed`.

#### SpeedSelect

- Options: `1×` (real wall-time speed), `60×` (1 minute per second), `600×` (10 min per sec — fastest practical), `3600×` (1 hour per sec — useful for year-long playback)
- Reads `useTimeOfDay(s => s.timeSpeed)`; writes via `setTimeSpeed(n)`

#### ScopeToggle

- Local component state (not in the kit anchor — this is UI-only behavior)
- Values: `'tod'` (default — playing only advances TOD, year stays put) or `'todAndYear'` (playing advances both)
- When `'todAndYear'`, the playback driver also calls `setDate` on `useCalendar` proportionally to keep the year scrubbing with the day.

#### ReturnToLiveButton

- Calls both `useTimeOfDay.getState().returnToLive()` AND `useCalendar.getState().returnToLive()`
- Visually subtle when both `isLive=true` (button dim or disabled); brighter when at least one is scrubbed
- Resumes wall-time tracking — both stores' `currentTime` / `currentDate` snap to `new Date()`

### Playback driver

Inside DawnTimeline, add a `useEffect` that runs while `!isPaused`:

```jsx
useEffect(() => {
  if (isPaused) return
  const intervalMs = 100  // 10Hz tick — visually smooth
  const id = setInterval(() => {
    const tod = useTimeOfDay.getState()
    const realDtMs = intervalMs * tod.timeSpeed
    const newTime = new Date(tod.currentTime.getTime() + realDtMs)
    tod.setTime(newTime)
    if (scope === 'todAndYear') {
      useCalendar.getState().setDate(newTime)
    }
  }, intervalMs)
  return () => clearInterval(id)
}, [isPaused, scope])
```

Two important notes:
1. **`setTime` flips isLive=false.** Playback IS a form of scrub — operator is driving, not wall-time. That's the right semantic. Operator clicks ReturnToLive to get back to live mode (which also implicitly stops playback by flipping isLive=true and snapping to wall time).
2. **`setTime`+`setDate` will accumulate floating-point error over long playback runs.** Doesn't matter for v1 — operator-scrub timescales are short. Don't optimize.

---

## Layout in consumers

DawnTimeline currently renders inside the Sky & Light card and Meteorologist's TOD card. After expansion:

- **Stage's Sky & Light card** — DawnTimeline grows from ~80px tall to ~180-200px tall. Card absorbs gracefully (it's already a glass-panel scrolling card).
- **Meteorologist's Teacup TOD card** — same. Card has room.
- **Meteorologist's Condition editor's TOD card** — same.

No mount-site changes needed. Every existing `<DawnTimeline />` mount inherits the new rows automatically.

---

## Out of scope (DO NOT in this brief)

- **No new files** beyond what already exists. Expand DawnTimeline in place.
- **No changes to useTimeOfDay / useCalendar / ClockCalendarPump**. They have everything you need. If you find yourself wanting to add a method, surface back.
- **No schema changes.** Year strip authoring doesn't change scene.json or anything else; only operator scrub state.
- **No production runtime auto-mount.** Operator still has to interact; production gets `<ClockCalendarPump mode="live">` separately in Step 5.
- **No cross-tab sync.** v2 nice-to-have.
- **No theme changes to other consumers.** Stage SkyLight + Teacup + Condition editor keep their existing card chrome; they just contain a taller DawnTimeline.
- **No rename of `DawnTimeline.jsx`.** Touching every import is invasive; expand in place.
- **No removing the existing TOD strip layout.** It's working; keep it.

---

## Verification

1. `npm run dev` boots clean.
2. Open `/meteorologist` → any cloud → Teacup → look at the right rail's top "Time of Day" card. Should now have three rows: TOD strip (existing), Year strip (new with month markers + season-band background + thumb), Playback row (▶/⏸ + speed + scope toggle + Return to Live).
3. Drag the year strip's thumb → useCalendar.currentDate updates. Verify via DevTools: `useCalendar.getState().dayOfYear()` matches the dragged position.
4. Click a month letter (e.g. "J" for Jan) → date jumps to Jan 1.
5. Season-band backgrounds align with `season()` boundaries (winter shows behind Dec-Mar 19, etc.).
6. Click ▶ (play) with scope='tod' → TOD thumb auto-advances; year thumb stays put. Hit ⏸ → both stop.
7. Toggle scope to 'TOD + Year', click ▶ → both thumbs advance together (TOD wraps at midnight, year advances by the equivalent fraction).
8. Speed selector: 1× = barely visible motion, 60× = visible scrubbing, 600× = year flies past.
9. Click Return-to-Live → both stores snap to wall time, both thumbs jump to current position, isLive=true for both. Playback stops.
10. Open Meteorologist Condition editor → WhenCard's TOD + Season chips should have live dots tracking the new year-strip and TOD-strip values in real time (Step 3 logic).
11. Open Cartograph Stage → Sky & Light card → same DawnTimeline now shows the expanded card. (Stage now has its date scrub by default, no separate DateScrubber needed.)

---

## Stash-isolate

```bash
git stash push -- src/components/DawnTimeline.jsx
```

Plus `src/lib/dawnTimeline.js` IF you needed to add a year-fraction helper there. Verify `git status --short` shows only the intended paths staged. Per amended `feedback_stash_isolate_per_file`, check staged state AND working-tree state.

---

## Surface anything not in this brief

Likely OK drifts:
- A small helper file `src/lib/yearTimeline.js` if you want to factor year-fraction math out of the component. Single small file, low ceremony — disclose it.
- Adding a `--season-spring` / `--season-summer` / etc. CSS variable set to `src/tokens/design.css` if no season colors exist there. Tiny addition; one extra file modified; disclose.
- Refactoring the TOD strip + Year strip into local subcomponents inside DawnTimeline.jsx for readability. No file changes.

NOT OK:
- Adding methods to useTimeOfDay or useCalendar.
- Renaming DawnTimeline.
- Modifying consumer files.
- Production runtime mounts.
- Schema changes.

---

## Memories to respect

- `feedback_stash_isolate_per_file` (amended) — check staged state.
- `feedback_baby_must_surface_scope_drift` — disclose anything beyond brief.
- `feedback_heavy_render_sliders_need_draft` — the playback driver runs at 10Hz, which is fine (cheap state writes); if the year-strip drag feels heavy, use a draft + pointer-up commit pattern like DraftSlider in cartograph. The existing TOD strip's drag handler doesn't draft today; year strip can follow the same pattern.
- `project_kit_helpers_pattern` — DawnTimeline is kit-level; consumers don't import each other.

---

## Cleanup task for orchestrator

After this lands, I (Meteorologist orchestrator) will delete the now-superseded brief `scratch/handoff-2026-05-20-cartograph-datescrubber.md`. Step 2 in the kit-clock+calendar phasing is officially absorbed into this consolidation. The phasing arc becomes:

- ✅ Step 1: kit primitive (shipped)
- ✅ Step 3: Meteorologist WhenCard live dots (shipped)
- **THIS BRIEF: unified time card** (replaces Step 2)
- ⏳ Step 4: Arborist seasonal-tree consumption (brief queued, cross-helper)
- ⏳ Step 5: Production runtime mount of `<ClockCalendarPump mode="live">` (small direct commit after 4)

---

## Commit + report

Single commit on `cartograph-looks-pass-ab`. Message shape:

```
kit: DawnTimeline → unified time card (TOD + ToY + playback)

Expands the existing kit-level DawnTimeline component from a TOD-only
scrub bar into a unified time card with three rows: Time of Day strip
(unchanged), Time of Year strip (NEW), and Playback row (NEW).
Replaces the previously-queued separate Cartograph DateScrubber —
single component, single mount site, all consumers inherit.

Year strip:
- 12-month track with month-letter waypoints
- Subtle season-band backgrounds (winter/spring/summer/autumn)
- Draggable thumb → useCalendar.setDate
- Click month letter → jump to month's first day

Playback row:
- Play/pause → useTimeOfDay.togglePause; driver useEffect ticks
  setTime at 10Hz scaled by useTimeOfDay.timeSpeed
- Speed select: 1× / 60× / 600× / 3600×
- Scope toggle: 'TOD only' (year stays put) vs 'TOD + Year' (both
  advance together)
- Return-to-Live: snaps both stores back to wall time + flips isLive

No changes to useTimeOfDay / useCalendar / consumer files. All
existing <DawnTimeline /> mounts (Stage Sky & Light, Meteorologist
Teacup, Meteorologist Condition editor) inherit the expanded card.

Modified:
- src/components/DawnTimeline.jsx

Verification:
- Year-strip drag + month-letter jump update useCalendar
- Playback advances TOD; scope toggle adds year-tick when on
- Speed selector tracks useTimeOfDay.timeSpeed
- Return-to-Live restores both isLive flags + snaps to wall time
- Meteorologist WhenCard live dots track new year-strip position
- Stage Sky & Light card absorbs taller DawnTimeline gracefully

Co-Authored-By: <baby name> <…>
```

Report back to Jacob with: commit hash, scope-drift disclosures (especially around any helper files added — `yearTimeline.js`, design-token additions), verification status against the 11 checks above, thumbs-up.
