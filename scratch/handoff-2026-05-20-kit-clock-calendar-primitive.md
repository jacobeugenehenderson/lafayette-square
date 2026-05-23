# Kit primitive — clock + calendar anchor + shared pump

Establish a kit-level shared anchor for **time-of-day** (already half-done) and **date/season** (new). Plus a shared driver component (`ClockCalendarPump`) that ticks both from wall time when in live mode. **No helper-specific code in this phase.** Cartograph / Meteorologist / Arborist consumption is queued as separate cross-helper briefs after this primitive ships.

Orchestrated from Meteorologist because the primitive itself is pure kit-level (lives in `src/hooks/` + `src/components/`) — but the doctrine + pattern serve all four helpers.

---

## Read first

1. **`meteorologist/NOTES.md` 2026-05-20 entry "Kit-level clock + calendar anchor (ADR)"** — the architectural rationale + the shape. Don't deviate from the doctrine; if something feels wrong, surface back to Jacob.
2. **`src/hooks/useTimeOfDay.js`** — already the time-of-day anchor (zustand store, `isLive` + `setTime` + `returnToLive` + `setTimeSpeed` + `setPaused`). Read top to bottom; this is your shape template.
3. **`src/instance.js`** — `INSTANCE.geography.lat`/`lon` is the canonical place anchor used by SunCalc + the kit's geography-dependent code. Use it as the lat/lon source for any sun-path / day-length computation.

---

## Scope (this phase only)

### Files to CREATE

```
src/hooks/
  useCalendar.js                  ← new zustand store: date + dayOfYear + season + isLive

src/components/
  ClockCalendarPump.jsx           ← when mounted with mode="live", ticks both
                                    useTimeOfDay AND useCalendar from wall time.
                                    Mode "scrub" is a no-op (UI drives state).
```

### Files NOT to modify

- **`useTimeOfDay.js` stays as-is.** Already correct shape. Don't touch its API.
- **No helper code.** Cartograph / Meteorologist / Arborist consumption is queued separately.
- **No scene.json schema changes.**
- **No new dependencies** — SunCalc + zustand are already in the project.

### Files to MODIFY (small)

```
cartograph/ARCHITECTURE.md       ← add a small "kit time + calendar anchor" note in
                                   the conventions section (or wherever fits). One
                                   paragraph: useTimeOfDay + useCalendar are the
                                   shared anchors; helpers consume, never mint.
```

---

## `useCalendar` shape

Mirror `useTimeOfDay`'s pattern. The store carries:

```js
{
  currentDate: Date,              // anchor — typically same as useTimeOfDay.currentTime's date,
                                  //   but separable for the scrub case where operator wants
                                  //   "summer noon" without scrubbing two stores
  isLive: boolean,                // true = wall time drives; false = scrubbed
  // Derived getters (computed on read, not stored):
  dayOfYear: () => number,        // 0..365 from currentDate
  season: () => 'spring' | 'summer' | 'autumn' | 'winter',
                                  // derived from currentDate + INSTANCE.geography.lat
                                  // (northern vs southern hemisphere — for LS, northern)
  isLeapYear: () => boolean,
  // Mutations:
  setDate: (date: Date) => void,         // sets currentDate, sets isLive=false
  returnToLive: () => void,              // isLive=true, currentDate = new Date()
  setDayOfYear: (doy: number) => void,   // helper: jump to a day, preserves year
  setSeason: (s: string) => void,        // helper: jump to season midpoint
}
```

**Season derivation (northern hemisphere — LS is at 38.9°N):**

| Season | Day-of-year range (approx) |
|---|---|
| `winter` | 355–365 + 0–78 (Dec 21 – Mar 19) |
| `spring` | 79–171 (Mar 20 – Jun 20) |
| `summer` | 172–264 (Jun 21 – Sep 21) |
| `autumn` | 265–354 (Sep 22 – Dec 20) |

For LS use northern-hemisphere mapping. If `INSTANCE.geography.lat < 0`, invert (southern hemisphere). Document the inversion inline so a future Sydney INSTANCE doesn't surprise anyone.

Keep the API minimal. No locale-specific date formatting; that's a consumer's job. No timezone handling beyond what `Date()` already does — the lat/lon-aware sun-path computation lives in SunCalc on read, not in the calendar store.

---

## `<ClockCalendarPump />` shape

```jsx
import { useEffect } from 'react'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useCalendar from '../hooks/useCalendar'

export default function ClockCalendarPump({ mode = 'scrub', tickMs = 60000 }) {
  // mode='live': advance both stores from wall time on a tickMs interval.
  // mode='scrub': no-op. UI drives state; pump just signals "we're in
  //               an authoring context, don't auto-advance."

  useEffect(() => {
    if (mode !== 'live') return
    const tick = () => {
      const now = new Date()
      useTimeOfDay.getState().setTimeFromLive(now)   // NEW method? OR existing setTime?
      useCalendar.getState().setDateFromLive(now)
    }
    tick()
    const id = setInterval(tick, tickMs)
    return () => clearInterval(id)
  }, [mode, tickMs])

  return null
}
```

**Question to resolve in implementation:** does `setTime`/`setDate` flip `isLive` to false (the current useTimeOfDay behavior — scrubbing implies leaving live mode), or do we need a separate `setTimeFromLive` that preserves `isLive=true`?

**Recommended:** add `setTimeFromLive(date)` and `setDateFromLive(date)` methods that set state WITHOUT flipping `isLive` to false. Only operator-driven scrub calls flip the flag. The pump uses the `*FromLive` variants. Surface this as a small useTimeOfDay edit if needed (one extra method, no API break for existing consumers).

The pump's job is *one place to mount* when you want live wall-time advancement. Production scenes will mount this. Authoring tabs won't (or will mount in `mode="scrub"` which is a no-op).

**`tickMs` default = 60000 (one minute).** A canary scene tick at minute resolution is fine for TOD-driven sky/cloud advancement; finer-grained motion (cloud drift, tree sway) is driven by `useFrame` clock.elapsedTime separately, not by this pump.

---

## Cartograph ARCHITECTURE.md update

Add a paragraph in the "Conventions worth knowing" section (or wherever feels natural; you'll see it). Suggested text:

```markdown
- **Shared clock + calendar anchor.** `src/hooks/useTimeOfDay` (current
  minute-of-day) and `src/hooks/useCalendar` (current date, day-of-year,
  season) are kit-level singletons. ANY helper that needs time or season
  consumes these — never mints its own. Each helper hosts its own scrub
  UI (DawnTimeline for TOD, DateScrubber for date) over the shared
  state. `<ClockCalendarPump mode="live">` mounted in a production scene
  ticks both from wall time; authoring tabs leave the pump off and let
  scrub UIs drive. Drift-prevention rationale in
  `meteorologist/NOTES.md` 2026-05-20 ADR.
```

---

## Stash-isolate per file

```bash
git stash push -- \
  src/hooks/useCalendar.js \
  src/components/ClockCalendarPump.jsx \
  cartograph/ARCHITECTURE.md
```

Then **`git status --short` before commit** — verify only those three paths are staged. Per `feedback_stash_isolate_per_file` (amended 2026-05-19), Jacob's pre-staged work in other paths is common; check the index, not just the diff.

---

## Verification

1. `npm run dev` boots; no module errors.
2. `useCalendar.getState().dayOfYear()` returns a number 0-365 in DevTools console.
3. `useCalendar.getState().season()` returns a string from {'spring','summer','autumn','winter'}.
4. `useCalendar.getState().setDate(new Date('2026-12-25'))` — `season()` then returns `'winter'`, `dayOfYear()` returns ~359.
5. `useCalendar.getState().setDate(new Date('2026-07-04'))` — `season()` returns `'summer'`, `dayOfYear()` returns ~185.
6. Mount `<ClockCalendarPump mode="live" />` temporarily in one of the existing apps (e.g. add to `src/components/Scene.jsx` for the test); verify `useTimeOfDay.getState().currentTime` updates within ~60 seconds. Remove the test mount before commit.
7. `<ClockCalendarPump mode="scrub" />` is a no-op (no setInterval scheduled).
8. `npm run build` succeeds (existing infra build issue with `public/photos/lafayette-square/other` broken symlink is pre-existing and not yours to fix).

---

## Non-goals (DO NOT in this phase)

- **No helper UI changes.** No DateScrubber in Cartograph (separate cross-helper brief). No Conditions editor consuming useCalendar (Meteorologist orchestrator does directly). No Arborist seasonal-tree consumption (separate cross-helper brief).
- **No production runtime mount.** `<ClockCalendarPump mode="live">` mount in Scene.jsx is queued for post-1-4 phasing. Don't mount in production now.
- **No cross-tab sync.** BroadcastChannel or localStorage sync is v2.
- **No schema changes.** scene.json + presets.json + almanac.json untouched.
- **No new dependencies.** SunCalc + zustand are present; use them.
- **No edits to `useTimeOfDay.js`'s public API** beyond optionally adding `setTimeFromLive` (one new method, additive). If you find yourself wanting to change existing API, surface back.

---

## Surface anything not in this brief

Per `feedback_baby_must_surface_scope_drift` — disclose in commit body + status:

Likely OK drifts:
- Adding `setTimeFromLive` / `setDateFromLive` methods to keep the live-pump path from flipping `isLive` to false. (Recommended above; just disclose.)
- A small JSDoc on each store explaining the live-vs-scrub contract.
- Northern/southern hemisphere season-derivation comment.

NOT OK:
- Modifying `useTimeOfDay`'s existing actions or shape.
- Adding scrub UI in any helper.
- Mounting the pump in production code.
- New deps.
- Touching schemas or scene.json.

---

## Memories to respect

- `feedback_stash_isolate_per_file` (amended) — check staged state AND working-tree state before commit.
- `feedback_baby_must_surface_scope_drift` — disclose scope drift in commit body.
- `project_kit_helpers_pattern` — Cartograph + Arborist + Meteorologist + Courier each publish one artifact; helpers don't mint shared primitives, the kit does. This work IS the kit, not a helper.

---

## Phase preview (so you know what you're building toward)

After this primitive lands:

- **Cartograph** gets a `DateScrubber` UI next to `DawnTimeline` (separate cross-helper brief to Cartograph coordinator).
- **Meteorologist** consumes `useCalendar.season` in the Condition editor for `whenBlock.season` matching (Meteorologist orchestrator commits directly; no baby).
- **Arborist** consumes `useCalendar` for seasonal tree variant selection (separate cross-helper brief to Arborist coordinator, pairs with their year-round trees work).
- **Production runtime** mounts `<ClockCalendarPump mode="live">` (separate small commit after 1-4).

Your scope: ONLY the primitive scaffold. Don't anticipate; just land the hook + pump + doctrine line.

---

## Commit + report

Single commit on `cartograph-looks-pass-ab`. Message shape:

```
kit: clock + calendar anchor — shared primitive + pump

Establishes the shared time-of-day + date/season state singletons that
all four helpers consume. No helper code in this commit — kit-level
scaffold only.

useTimeOfDay (exists) stays as-is; the new useCalendar (date,
dayOfYear, season) joins it as a parallel kit primitive. New
<ClockCalendarPump mode="live"> driver component ticks both from wall
time when mounted in live mode (production); no-op in scrub mode
(authoring). Drift-prevention pattern: one shared anchor, N per-helper
UIs (consume, never mint).

Northern-hemisphere season mapping; SunCalc + zustand reused; no new
deps. ADR rationale in meteorologist/NOTES.md 2026-05-20.

Created:
- src/hooks/useCalendar.js
- src/components/ClockCalendarPump.jsx

Modified:
- cartograph/ARCHITECTURE.md — kit-anchor convention note

Verification:
- useCalendar.season() returns correct values for solstice/equinox test dates
- ClockCalendarPump mode="live" ticks useTimeOfDay + useCalendar from wall time
- ClockCalendarPump mode="scrub" is a no-op
- npm run dev clean; no module errors

Co-Authored-By: <baby name> <…>
```

Report back to Jacob with: commit hash, scope-drift disclosures, verification status, thumbs-up. Jacob forwards to me; I'll then queue:
- Cartograph coordinator's DateScrubber brief
- Arborist coordinator's seasonal-tree-consumption brief
- My own (direct) Meteorologist Condition-editor consumption commit
