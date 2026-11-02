# OPERATIONS § Displays: superseded text (2026-11-02)

Moved here from `cartograph/OPERATIONS.md` (the Displays line, Look section) when a display's WHEN became its Schedule
(Jacob, 2026-11-01: "In a google invite, it has a very logical setup of 'start/end, recurring'"; Boz's rulings (a)–(c);
Zob's co-sign). The live text is in OPERATIONS; this is the record. Superseded, verbatim:

> ⭐ **You author it in words, never in clock times**: under them, **Lit** is the display's own channel in this Look,
> keyed on the day's sun moments like the lamps (*"fade up 30 minutes at Dusk"*).

Boz's framing (14f78bef), written when only sun keys existed. What it protected still holds: the LEVELS are keyed on the
sun's moments. The Schedule's ends may be clock times.

> The kit works out each moment's clock time in this town on every day (`src/lib/todSlots.js`, the slots' one home and the
> one place a display's schedule reads the sun; a moment the sun never reaches there sits at its closest approach, solar
> noon or solar midnight (the nadir), so every key happens); the lights only ever receive clock times.

> Knobs: **Glow** · **Show** (0 = no show) · **Glow colour** (K) · **Show every** (minutes, from the town's midnight), with
> the ▲/▼ fades (0 minutes = a switch). ↺ returns it to the default: it glows Dusk to Dawn, with a show at every whole town
> hour it can finish (never clipped). *Example, a show every two hours through the night:* **Show every** 120. Shows fall
> on the clock (18:00, 20:00, 22:00 …) wherever **Show** is above 0, and a window keyed on sun moments follows the sun, so
> its first show moves with the season. **Tonight** draws the channel: where it glows, and a tick at each showtime.
> ⛔ A schedule whose showtimes crowd the show (closer than it runs, on any day of the year at the town's position) stops
> `bake-manifest`. ▶ `node checks/claims-a-display-is-authored-on-its-own-channel.mjs`

**Show every** was a per-key, step-held field and the ▲/▼ marks were on the display's keys; both are now the Schedule's
(an entry's interval; Ambient's fades). Every slab published in the old shape is read by
`showChannel.js#readShowScheduleV1` and plays exactly as before (claims-a-display-keeps-its-schedule, every minute of 2026).
