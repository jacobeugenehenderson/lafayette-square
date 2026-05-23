# Wren — Sky Phase B: rules-based seasonal derivation

**From:** Meteorologist orchestrator
**To:** Wren
**Date:** 2026-05-20

---

Phase A is landed and lovely. Phase B was originally going to be per-cell painting; Jacob steered us off that — he wants the seasons **derived programmatically** from the procedural function via HSV transforms on the keyframe palette, not hand-painted. Cleaner, re-tunable, defensible.

You're working at the rule layer. Three little HSV knob-clusters do all the work; no per-cell authoring.

## The architecture

**Today** (Phase A): `hydrate-anchor-cards.js` samples `proceduralSkyAt(altitude, isDawn)` at each season's real sun-altitude trajectory. The procedural function lerps between the canonical `KEYFRAMES` (dawnDeep / dawnPeak / day / duskGolden / etc.). All 4 seasons render through the SAME keyframes; the only seasonal variation comes from each season's altitude curve (winter's noon altitude is ~28° so its noon never reaches the `day` keyframe at full strength — that's the "low sun all day" cast, for free, no code).

**Phase B**: add a `seasonTransform` arg to `proceduralSkyAt`. Each season gets an HSV transform applied to the KEYFRAMES at sample time. The procedural function lerps as before, but over palette-shifted keyframes.

```js
// cartograph/proceduralSky.js

export const SEASON_TRANSFORMS = {
  summer: { hueDeg: 0,   sat: 1.0,  val: 1.0  },  // identity — summer IS the canon
  winter: { hueDeg: ...,  sat: ...,  val: ...  },  // Wren's call
  spring: { hueDeg: ...,  sat: ...,  val: ...  },
  autumn: { hueDeg: ...,  sat: ...,  val: ...  },
}

export function proceduralSkyAt(sunAltitude, isDawn, seasonTransform = SEASON_TRANSFORMS.summer) {
  // Apply HSV transform to KEYFRAMES (or to the result — both work; pre-transform
  // is cleaner because the lerps stay in the same color space as the canon).
  const tk = transformKeyframes(KEYFRAMES, seasonTransform)
  // ... existing altitude-banded lerp logic, but reading from `tk` instead of KEYFRAMES
}

function transformKeyframes(kf, t) {
  // For each keyframe entry, for each band, convert hex → HSV → apply
  // (h + hueDeg, s * sat, v * val) → back to hex. Wrap hue at 360°,
  // clamp sat/val to [0, 1].
}
```

Hydration then becomes:

```js
// cartograph/pipeline/hydrate-anchor-cards.js
for (const season of ['winter', 'spring', 'summer', 'autumn']) {
  for (let h = 0; h < 24; h++) {
    const altitude = sunAltitudeAt(season.refDate, h)
    const isDawn = h < solarNoonHourFor(season.refDate)
    const bands = proceduralSkyAt(altitude, isDawn, SEASON_TRANSFORMS[season])
    ANCHOR_CARDS[season][h] = bands
  }
}
```

Re-run the hydration script after each transform tweak; the 24×5 card regenerates deterministically.

## The dials (Wren's instrument)

Per season, three numbers:

- **hueDeg**: rotate the entire palette around the hue wheel. `+10°` = slight warm shift, `-15°` = cool shift toward blue/green. Subtle — most of the seasonal character emerges from the altitude trajectory; hue is the seasoning.
- **sat**: scale saturation. `0.85` = slightly desaturated (winter haze, snow-light), `1.15` = boosted (autumn vividness). Range you'll probably use: 0.75 – 1.25.
- **val**: scale value/brightness. `0.92` = slight darken (winter's lower sun produces less luminous skies even at noon), `1.05` = slight lift. Range you'll probably use: 0.88 – 1.08.

Summer is locked at identity (`hueDeg: 0, sat: 1.0, val: 1.0`) — it's the canon you're deviating from.

Starting suggestions (your call to override):
- **winter**: `hueDeg: -5° to -10°` (cooler), `sat: 0.78`, `val: 0.93`
- **spring**: `hueDeg: +3° to +8°` (slight warm/green-cast), `sat: 0.95`, `val: 1.02`
- **autumn**: `hueDeg: -8° to -15°` (amber/orange bias — hue rotation toward orange), `sat: 1.18`, `val: 0.97`

Hue rotation direction caveat: in HSV with red=0°, the "amber/golden" direction from blue is *negative* (rotating from blue=240° back toward 0°). Whichever way actually reads right in Stage is the right way; don't trust my arithmetic over your eye.

## How to work

1. Sit in Cartograph LS Stage. Set the date to Dec 21.
2. Edit `SEASON_TRANSFORMS.winter` in `proceduralSky.js`. Re-run `node cartograph/pipeline/hydrate-anchor-cards.js` (regenerates ANCHOR_CARDS in `skyGrid.js`). Reload Stage.
3. Scrub the TOD strip. Does winter read like winter? Adjust the three numbers. Iterate.
4. Repeat for spring (Mar 20) and autumn (Sep 22).
5. Scrub the YEAR strip across season boundaries. Confirm smooth transitions — no hue jumps at the lerp midpoints.

Hot-reload approach (if you want faster iteration): the hydrate step could be inlined into `skyGrid.js` module-load so SEASON_TRANSFORMS edits flow through without a script run. Up to you whether to wire that — Jacob would probably enjoy it, but the one-shot script is also fine if iteration speed isn't the bottleneck.

## Verification bar

- **Visual in Stage**: each season's character reads as intended; transitions between adjacent seasons smooth (no May 18 → May 19 hue jumps).
- **Override interaction**: author a test override on the same cell across all 4 seasons — the override should apply identically (Phase A architecture unchanged).
- **Build clean**: `npm run build` + Stage loads.

## Disclosure expectations

Commit body, per-season:

> winter: `{ hueDeg: -7, sat: 0.78, val: 0.92 }` — cooler hue rotation gave the zenith its winter-pale cast; desaturation brought the mid-bands toward crystalline; slight value darken because winter noons read overbright without it.
>
> spring: `{ hueDeg: +5, sat: 0.96, val: 1.03 }` — small warm rotation toward yellow-green for morning freshness; near-identity saturation; slight value lift gives spring noons their crispness.
>
> autumn: `{ hueDeg: -14, sat: 1.20, val: 0.96 }` — significant amber rotation (the showpiece); boosted saturation across all hours; slight darken to keep saturated colors from blowing out.

(Numbers illustrative — yours will be what you actually shipped.)

## Files touched

- `cartograph/proceduralSky.js` — `SEASON_TRANSFORMS` export, `transformKeyframes` helper, `proceduralSkyAt` extended signature
- `cartograph/pipeline/hydrate-anchor-cards.js` — pass season transform into the sample call
- `src/cartograph/skyGrid.js` — regenerated `ANCHOR_CARDS` (output of re-run hydration)
- `meteorologist/NOTES.md` — 2026-05-20 entry below Phase A: "Phase B landed — rules-based seasonal derivation via HSV transforms"
- `meteorologist/BACKLOG.md` — mark Phase B complete

## Stash isolate (same as Phase A)

`git status --short` before commit. Jacob's working tree has unrelated edits — anything outside the list above gets stashed.

## Why this approach

Rules-based seasonality is re-tunable forever. If a future Jacob says "autumn is too aggressive," the fix is one number, not 22 cells. If we add a 5th season anchor (Lunar New Year? Equinox+1?), it's a new transform record, not a new painting session. The override layer (Phase A) still rides on top for any per-Look custom-event authoring — but the canonical seasonal feel comes from rules.

You're authoring the *instrument* now, not the song.

— Claude (Meteorologist orchestrator)
