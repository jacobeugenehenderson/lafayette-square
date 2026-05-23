# Step 3 — Meteorologist Condition editor: "now" indicator on TOD + season chips

Small UI affordance in the Condition editor's WhenCard. Highlight the chip whose option matches the current live state from the kit clock + calendar primitive (`useTimeOfDay` + `useCalendar`). Lets the operator see at a glance whether the condition they're authoring would fire RIGHT NOW.

No schema change. No new components. ~30 LOC across one file.

---

## Context

Phase 1 of the kit clock+calendar primitive landed: `src/hooks/useCalendar.js` provides `currentDate` + derived `season()` / `dayOfYear()` getters; `src/hooks/useTimeOfDay.js` (already in place) provides `currentTime` + minute-of-day. The TOD slot for any minute is computed via `todSlotAtMinute(minute, date)` in `src/cartograph/animatedParam.js`.

The Condition editor's WhenCard renders multi-select chips for two of these fields:
- `tod` — chip per TOD slot (dawn, sunrise, noon, golden, sunset, dusk, night)
- `season` — chip per season (spring, summer, autumn, winter)

Each chip is a toggle: clicked once, the condition fires when payload's tod/season matches; unselected = wildcard.

What's missing: visual signal of which chip's option matches **right now**. Operator authoring "snowy thunderstorm" can't tell at a glance whether today (May 19) is in `season: 'winter'` (no, it's spring) without separately checking a clock.

---

## Read first

1. **`meteorologist/NOTES.md` 2026-05-20 ADR "Kit-level clock + calendar anchor"** — the architectural rationale.
2. **`src/meteorologist/WhenCard.jsx`** lines 138–176 (`ChipRow` component) — where the chips render.
3. **`src/hooks/useCalendar.js`** — read for `season()` shape; called via `useCalendar(s => s.season())` returns a string.
4. **`src/hooks/useTimeOfDay.js`** — `currentTime` is a Date.
5. **`src/cartograph/animatedParam.js`** — `todSlotAtMinute(minute, date)` returns a slot id string or null. Import as needed.

---

## Scope

### File to MODIFY (single)

```
src/meteorologist/WhenCard.jsx
```

### What to add

In `ChipRow`, compute `liveOption` based on `field.key`:

```jsx
import useTimeOfDay from '../hooks/useTimeOfDay'
import useCalendar from '../hooks/useCalendar'
import { todSlotAtMinute } from '../cartograph/animatedParam.js'

function ChipRow({ field, value, onChange }) {
  const currentTime = useTimeOfDay(s => s.currentTime)
  const seasonNow   = useCalendar(s => s.season())

  // Compute the live-matching option for this field, or null if N/A
  // (precipKind has no live source; that's expected — operator can't
  // tell from useCalendar whether it's raining outside).
  let liveOption = null
  if (field.key === 'tod') {
    const minute = currentTime.getHours() * 60 + currentTime.getMinutes()
    liveOption = todSlotAtMinute(minute, currentTime)
  } else if (field.key === 'season') {
    liveOption = seasonNow
  }
  // precipKind: no live source available (no real weather feed in canary
  // today); leave liveOption null.

  // ... existing isSelected / toggle logic unchanged ...

  // In the .map():
  const isLive = liveOption !== null && (
    opt === liveOption || (opt == null && liveOption == null)
  )
  // pass isLive into the button's render
}
```

### Visual treatment

When `isLive === true`, add a small filled-circle indicator inside the chip — `●` (U+25CF, the chip's color or `var(--on-surface-medium)`) prepended to the label with a 2-3px gap. Subtle but unmistakable.

If chip is BOTH selected AND live: dot inherits the chip's gold color (already-applied selected style — no extra work).
If chip is live but NOT selected: dot uses `var(--on-surface-medium)` so it doesn't compete with the gold "engaged" affordance.

Don't change the chip's button border, background, or click behavior. The only addition is the leading dot.

### Optional but recommended

Add a `title` (tooltip) on live chips: `${label} — current state`. Lets the operator hover-confirm the indicator's meaning the first time they see it.

---

## Out of scope (DO NOT in Step 3)

- **No schema change.** No new fields. `whenBlock` shape unchanged.
- **No store changes.** Reading hooks directly is fine; nothing to wire through useMeteorologistStore.
- **No changes to RangeRow / ScalarRow.** Range fields (tempC, humidity, etc.) don't have a "live indicator" concept yet — no live payload source for those in the canary. Skip.
- **No precipKind live indicator.** No live source.
- **No changes to Condition editor headers / cards above WhenCard.**
- **No changes to scene.json, presets.json, almanac.json.**

---

## Verification

1. `npm run dev` boots clean.
2. Open `/meteorologist` → Conditions mode → click any condition (e.g. "Clear day") → editor mounts.
3. Find the WhenCard's `Seasons` row. The chip matching the actual current season (look up the date — for May 19 it's `spring`) shows a leading dot.
4. Find the WhenCard's `TOD slots` row. The chip matching the actual current TOD slot (e.g. at 2pm local, probably `noon` or `golden` depending on date/lat — verify against DawnTimeline's display) shows a leading dot.
5. Live chips that aren't selected = grey dot. Live chips that ARE selected = gold dot (inherits selected color).
6. Toggle a chip on/off → live indicator persists (it's about live state, not authored state).
7. Scrub TOD via DawnTimeline → the `TOD slots` row's live dot moves to the new active slot in real time.
8. Operator scrubs date via `useCalendar.getState().setDate(new Date('2026-12-25'))` in DevTools → `Seasons` row's live dot moves to `winter`.

---

## Stash-isolate

```bash
git stash push -- src/meteorologist/WhenCard.jsx
```

Then `git status --short` and verify only that one path is staged. Per amended `feedback_stash_isolate_per_file`, check both working-tree AND staged state.

---

## Surface anything not in this brief

Likely OK:
- A tiny helper component like `<LiveDot color={...} />` if you find yourself wanting to factor the dot rendering out.
- A `useMemo` on `liveOption` if the per-render derivation feels noisy.

NOT OK:
- Adding live indicators to RangeRow / ScalarRow / precipKind chips (no source for these).
- Modifying useCalendar / useTimeOfDay / animatedParam.
- Changing chip click behavior.
- Adding new files.

---

## Memories to respect

- `feedback_stash_isolate_per_file` (amended) — check staged state.
- `feedback_baby_must_surface_scope_drift` — disclose anything beyond this brief in commit body.
- The kit primitive (`useCalendar`) just shipped — read its public API directly, don't reimplement season derivation.

---

## Commit + report

Single commit on `cartograph-looks-pass-ab`. Message shape:

```
meteorologist: WhenCard — live indicator on TOD + season chips

Small visual affordance. Each chip in the WhenCard's tod / season
rows shows a leading dot when its option matches the current live
state from the kit clock + calendar primitive (useTimeOfDay +
useCalendar). Lets the operator see at a glance whether the
condition they're authoring would fire right now.

ChipRow reads useTimeOfDay.currentTime + useCalendar.season() and
derives the live option for tod (via todSlotAtMinute) + season
fields. Live + selected = gold dot (inherits chip color); live +
unselected = subtle grey dot. precipKind chips have no live source
(no real weather feed in canary today) — no dot.

Modified:
- src/meteorologist/WhenCard.jsx — ChipRow extended with live-option
  derivation + dot indicator.

Verification:
- Season dot tracks useCalendar.getState().setDate() changes
- TOD dot tracks useTimeOfDay scrub
- Live + selected = gold; live + unselected = subtle grey
- npm run dev clean

Co-Authored-By: <baby name> <…>
```

Report back to Jacob with: commit hash, scope-drift disclosures, verification status, thumbs-up.
