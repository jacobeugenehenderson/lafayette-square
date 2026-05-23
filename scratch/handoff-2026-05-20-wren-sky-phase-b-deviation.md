# Wren — Sky Phase B: artistic deviation pass

**From:** Meteorologist orchestrator
**To:** Wren
**Date:** 2026-05-20

---

Phase A is gorgeous. Jacob's words: "Wren is knocking it out of the park." The interface he saw — 24-hour grid, CSS-gradient cells with bleed, override authoring + revert — is *so so cool*. You earned this one.

Phase B is the painter's pass. The architecture from Phase A leaves four `ANCHOR_CARDS` exposed in `src/cartograph/skyGrid.js`, all currently procedural seeds. Summer's seed already matches the project's hand-painted canon (you confirmed this in the Phase A report — same `GradientSky` function, same summer-altitude trajectory). The other three want your eye.

## Read first

1. **`meteorologist/NOTES.md` 2026-05-21 entry** (the Phase A landing record) — what's in place, what you're editing.
2. **`src/cartograph/skyGrid.js`** — `ANCHOR_CARDS_PROCEDURAL` (frozen, your reference) vs `ANCHOR_CARDS` (mutable, your canvas). Edit only `ANCHOR_CARDS`. Procedural seed stays accessible for diffing / reverting.
3. **`cartograph/proceduralSky.js` KEYFRAMES** — the canonical palette you're deviating from. Familiarize yourself with the dawn/dusk/day/night anchor colors so your deviations stay within the project's color world.

## The brief

Three cards to deviate. Free hand on each; the prior brief's character notes are starting points, not prescriptions:

- **Winter** (anchor doy 355, Dec 21): cool zenith, desaturated mids, slightly darkened noon (winter sun is lower + air is clearer — less brilliant blue, more crystalline-pale). Cooler sun-glow. Twilight reads pinker / more delicate. Snow-light feel — almost monochromatic on the cleanest hours.
- **Spring** (anchor doy 79, Mar 20): morning horizon carries a fresh green-yellow cast. Noon zenith crisper than summer. Day-to-day variability vibe — slight warm/cool oscillation across the day. Twilight cleaner than autumn's (less haze).
- **Autumn** (anchor doy 265, Sep 22): golden-amber bias through every daytime hour. Boosted saturation across mid/low bands. Sunset is the showpiece — richer, longer-lingering oranges and pinks. Twilights brief but vivid. Harvest-light.

**Summer** (doy 172, Jun 21) stays as the procedural seed. Jacob's existing summer card was the procedural function in disguise — they match. No edits.

## How to work

1. Sit in Cartograph LS Stage. Set the date to Dec 21 (year strip). Scrub the TOD strip across the day. See what winter reads like with the raw procedural seed.
2. Pick a few hours that feel "off" or "underexpressed" for winter character.
3. Edit `ANCHOR_CARDS.winter[hour][band]` directly in `src/cartograph/skyGrid.js`. Reload Stage. Iterate.
4. When winter feels right, do spring (Mar 20), then autumn (Sep 22).
5. Re-scrub the YEAR strip in between to make sure the lerps between adjacent anchors feel continuous — no jarring color jumps at the boundary days.

You're allowed to leave hours alone if they read fine from procedural. The deviation should feel like an artist's hand on top, not a full repaint. Most cells will probably stay procedural; the ones that get touched are the ones that carry the seasonal character.

## Verification bar

- **Visual in Stage**: scrub year + TOD; each season's character reads as intended; transitions between adjacent seasons are smooth (no May 18 → May 19 hue jumps).
- **Override interaction**: author a test override on a deviated cell — bleed + ramp behavior still works (Phase A architecture unchanged; this is just to verify your edits don't accidentally trip the resolver).
- **Build + load**: `npm run build` + Stage loads clean.

## Disclosure expectations

In the commit body, per-season notes — concise, just enough that Jacob can audit:

> winter: zenith bands shifted ~10% cooler at noon (#... → #...); mid-bands desaturated ~15% across daytime hours; dawnPeak hour 6 brought toward pinker (#...). Approx 18 cells touched.
>
> spring: morning horizon (hours 6-8) given a slight green-yellow cast; noon zenith crisper (saturated +5%); twilights cleaner than procedural. Approx 12 cells touched.
>
> autumn: daytime mid-bands amber-shifted ~12%; sunset hours 18-20 boosted saturation + warmth substantially (this is the showpiece). Twilights brief and vivid. Approx 22 cells touched.

Numbers are illustrative — your actual notes will reflect what you actually did.

## Stash isolate (same as Phase A)

`git status --short` before commit. Anticipated staged set is tiny:
- `src/cartograph/skyGrid.js` (the only edit)
- `meteorologist/NOTES.md` (add a 2026-05-20 entry below Phase A: "Phase B landed — winter/spring/autumn deviation by Wren")
- `meteorologist/BACKLOG.md` (mark Phase B complete)

That's it. Anything else gets stashed.

## Report back

Commit hash, files changed, the per-season disclosure notes, and a visual-verification thumbs-up (this one DOES need pixels — that's the whole point). Jacob forwards to me; I close the sky-pivot arc + return to the kit-clock production mount + queue Phase 4b.2 cloud color work.

The painter's pass. Make it lovely.

— Claude (Meteorologist orchestrator)
