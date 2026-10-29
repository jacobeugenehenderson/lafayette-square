# BRIEF — the day strip has its line: the morning comes from real readings

<!-- BRIEF-STATE
status: OPEN (premises co-signed by Zob at kit 19bb2d25, with corrections, 2026-10-28)
dispatched: 2026-10-28 night, Isotherm (fresh). Stopped at the premises: the sky read a missing cloud cover / weather code
as 0 = clear (`targetsOf`, `weather-payload`, `windSheet`, `skyCode`), so §2.A's "the sky never reads a missing field as 0"
could not hold in nws.js alone. Ward ruled (a): the `?? 0`s are deleted and the readers refuse by name
(WeatherFieldMissingError), so scope widened into useWeather, windSheet, weather-payload, SidePanel, weatherAt, dawnTimeline.
Kit part on branch isotherm/the-day-strip-has-its-line (Zob reviews). Follow-up, not built: a cited cloudLayers → cover
standard (needs Jacob's terms approval) would let an observed hour carry cloud cover.
written: 2026-10-28 night (Ward, at Jacob's word via Boz: "have Ward commit the brief")
evict-when: the line spans the whole dawn-to-dawn window in every devTown on staging, the checks below are GREEN and seen
RED, the kit part is merged on Zob's PASS and the Ward part on Ward's green, both ship with a Ward pin move, and Jacob
passes it by eye. Then this moves to cartograph/_archive/ dated.
-->

**You are the dispatched agent. Name yourself: one word, yours, not one a running session holds (`ListAgents`, then `/rename`).**
**Agent: FRESH** (no live seat holds the kit's weather feed). **Report to Ward.** **Instruction: confirm the premises, then
build.** If the code disagrees with this brief, stop and flag it to Ward: the stop is the deliverable.

## 0. The ask

Jacob, 2026-10-28, on HPDM: *"there is supposed to be a smooth light line"*. His ruling of 2026-09-29: the Almanac's day
strip carries the day's temperature as ONE smooth line, with a red dot at the high, a blue dot at the low, and the slider
circle riding the line. It is missing on staging in every town and on HPDM production.

Read first: `CLAUDE.md` Layer 0 (no fallbacks; a missing value is said by name) · the kit's
`checks/claims-one-weather-per-instant.mjs` · theward `README.md` §4 "The day strip".

## 1. Premises (kit: co-signed by Zob at 19bb2d25 · theward: Ward's read at 25ee07f). Confirm each by symbol.

1. **REGRESSION at kit `2df8d341`** (2026-10-20, Open-Meteo → NWS, for licence). `nws.js#nwsWeather` builds `hourly`
   from the grid's first validTime (`first = ceil(gridStart / H)`). Open-Meteo carried yesterday 00:00 onward
   (`past_days=1`).
2. `weatherAt.js#forecastAt` throws `WeatherRangeError` outside `hourly[0] … hourly[last]`.
3. theward `src/almanac/weather.js#dayCurve`:
   `try { a = weather.at(win.start…); b = weather.at(win.end…) } catch { return null }`. The window is today's dawn →
   tomorrow's dawn, so any gap at the start loses the WHOLE line, silently.
4. **Measured 2026-10-28** (gridpoints `temperature.values[0]` against suncalc's dawn; ⛔ re-measure, never quote): the
   grid starts after dawn in every town (HPDM and LS by six hours, the coastal towns by minutes). §3's Ward check
   re-measures it per town.
5. Collateral, all from the same gap:
   - DayStrip's `hiLo` covers only the covered hours, so the low dot can be the wrong low.
   - DayStrip's `thumbY = … : 50` is a silent fallback.
   - Other readers of the gap, by symbol: SidePanel (catches at currentTime) · Town.jsx's exported `weather.at` (what the
     Ward calls) · WindSheet ("held across a WeatherRangeError … said once") · `useAtmosphereDirective`, the SKY: a scrub
     back to dawn holds the LAST directive, a plausible-looking wrong sky.
6. `nws.js#pressureSeries` reads `/stations/{id}/observations?start=` only 4 h back, keeps only `barometricPressure`,
   tries the first `STATIONS_TRIED` (5) listed stations and caches whichever reports PRESSURE; whether that is
   nearest-first is not established. NWS observations also carry temperature, dewpoint, wind, humidity, `cloudLayers`
   and `presentWeather`.

## 2. The change

**A. KIT**, branch off `integration/2026-10-20` in `.claude/worktrees/`:
- `nws.js` fills `hourly` from STATION OBSERVATIONS for the hours from the strip's window start (the town's dawn, or
  earlier) to the grid's first hour. ⛔ Observation hours only BEFORE the grid's first hour, never both at one instant
  (one weather per instant).
- The temperature station is chosen by its OWN reporting of temperature, never by reusing the pressure station.
- A filled hour carries ONLY what the station observed. Every field it lacks is absent and said by name, so the sky
  never reads a missing field as 0 or clear.
- Cloud cover from `cloudLayers` only with a cited standard (a `references/registry.json` finding). Otherwise absent.
  ⛔ Never a typed oktas table.
- **The seam:** the station is a point, the grid is the town's cell, so the line can step at the grid's first hour.
  Measure the step per devTown. If it exceeds the line's own resolution, name it and propose to Ward how the strip shows
  it. ⛔ Never smoothed away silently.
- No observation reachable is a named refusal, never a silent gap.

**B. WARD**, in theward, off `ward-pin/2026-10-28b`:
- `dayCurve`: an uncovered end says by name which end and why, and the line draws the covered part (or refuses
  visibly). ⛔ Never blank and silent.
- Delete `thumbY`'s `: 50`. With no line, the circle's placement is said, not guessed.
- `hiLo` over the window as now covered.

## 3. Checks (each reads the source or runs it; each seen to FAIL by a mutant)

- **Ward:** for every devTown, the line spans the whole dawn-to-dawn window. Mutant: the kit's fill removed → RED. It
  also reports each town's measured gap (premise 4) from the live feed.
- **Kit:** a filled hour carries only observed fields. Mutant: a filled hour with invented cloud cover → RED.
- **Kit:** `claims-one-weather-per-instant` stays GREEN with the fill. Mutant: overlap one hour → RED.
- **Reported:** the seam step per devTown.

## 4. Bounds

- No server without Ward's say. `git commit -- <paths>` only. Commit messages name the register they reach (likely
  OPERATIONS: the weather provider's coverage).
- The kit part merges on Zob's PASS; the Ward part on Ward's green; both ship with a Ward pin move and the next
  Promote, on Jacob's word.
- Out of scope (surface it, don't absorb it): non-US towns (`OutsideCoverageError`) and any change of weather provider.
