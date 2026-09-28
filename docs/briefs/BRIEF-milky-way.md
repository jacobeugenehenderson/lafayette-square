<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-26
evict-when: the Milky Way is on in every app, reads as a soft band with sharp stars at the Hero and Street cameras (no JPEG blocks, no stretched stars), sits where the real one is for the town's latitude and time, fits the phone budget, and Jacob has seen it at night.
-->

# The Milky Way, once and for all

**You are the dispatched agent. Name yourself: one word, not a name another RUNNING session holds**
(check `ListAgents`, then ask Jacob to `/rename`). **Agent: FRESH.**

## The ask (Jacob, 2026-09-26)

*"It would be EXCELLENT if we could fix the Milky Way once and for all."* Earlier (2026-06-17): *"At some point
we'll animate the Milky Way into the scene, so we'll really build out the planetarium features."*

## What's there (Boz read it; confirm it)

- **The renderer exists and is switched off.** `src/components/CelestialBodies.jsx#MilkyWaySphere` wraps
  `public/textures/milky_way.jpg` on a sphere inside the sky dome. It's sidereally rotated (LST from the town's
  longitude) inside a group tilted by the town's latitude, and its opacity is the `milkyWay` TOD channel × the
  night factor. The mount is commented out (grep `<MilkyWaySphere`). The Stage control is hidden in
  `src/cartograph/CartographSkyLight.jsx` (commented out, with the reason).
- **Why it was parked (2026-05-02):** *"Brunier panorama shows visible JPEG artifacting + stretched/oversized stars
  at Hero/Street FOV; needs higher-res source or cubemap rebuild."*
- **The source image is 12000×6000, 17 MB JPEG.** That's past many phones' maximum texture size, so it gets
  resized. Even at full size one texel is about 1.8 arc-minutes, so at the Hero FOV (22°) each texel covers
  several screen pixels, and every photographed star becomes a smeared blob.
- **The stars are already drawn sharply and separately** as points from a catalog
  (`src/data/planetarium/bright_stars.json`, plus filler stars), so the panorama's own stars are redundant.
- Latitude and longitude come from `INSTANCE.geography`. Since `8e33f28c` that's the right town in Stage too
  (it was Lafayette Square's in every town's Stage before).
- The canon's line about it: `ROADMAP.md`, *"Milky Way re-enable"*; `ls/STATUS.md` and `ls/OPERATIONS.md` (keep,
  re-enable).

## ⭐ The direction to test first (a proposal, not a ruling)

**Split the band from the stars.** Photographed stars are what break at close FOVs, and sharp stars already exist
as points. So:
- the **band** is diffuse light only: the panorama with its stars removed or heavily blurred, at a resolution
  that fits every device (it's soft, so low resolution is enough);
- the **stars** stay the catalog points, sharp at any FOV.
- Measure both against the current look, and against the alternatives: a cubemap, or a higher-resolution source.
  Report to Jacob with screenshots at the Hero, Street and Browse cameras at night before choosing.

## Requirements, whichever way it goes

- **Kit:** position from the town's own latitude, longitude and time. No LS constants. It works in every town and
  every app (Stage, Preview, production).
- **Close inspection:** judged at the Hero and Street cameras, not only from far away.
- **Cost:** measure texture memory and frame cost on the phone profiles (`src/preview/deviceProfiles.js`). A
  17 MB texture is not shippable to phones as it stands.
- **The control:** restore the Stage `milkyWay` channel, and make sure its ends are truly 0 and full brightness.
  The Stage controls audit (`BRIEF-stage-controls-audit.md`) checks that for every other knob.
- **A check:** it's mounted in every app that draws the sky; its opacity is 0 by day and follows the channel;
  and its orientation puts the galactic centre where the sky says it is for a known date, time and place.
  Mutation-test it.

## Bounds

- Write in `CelestialBodies.jsx` (the Milky Way parts only), `CartographSkyLight.jsx` (the control), the texture
  assets under `public/textures/`, and the check. `CelestialBodies.jsx` is shared by every app: show the day sky
  unchanged.
- No bake needed unless the channel's shape changes; `bake-scene` then needs Jacob's go.
- Commit only your own paths (`git commit -- <paths>`); the working tree is shared.
- Canon: `ls/STATUS.md` and `ls/OPERATIONS.md` (re-enabled), `ROADMAP` (close the line), `OPERATIONS` (the
  control), `FEATURES` (the night sky). Commit messages name the register reached.

**The instruction is confirm-then-build:** read the code, measure the current look and its cost, show Jacob the
options with screenshots, then build.
