<!-- BRIEF-STATE
status: OPEN
dispatched: Tamp
written: 2026-09-28
evict-when: RULING: Jacob's eye gate on two towns — north-up and facing
-->
# BRIEF — The town's edge as a compass bezel

**For:** a fresh agent, kit and Ward. **Written:** 2026-09-28 (Warden). **Report to:** Warden.
**Jacob, 2026-09-28:** *"We use the round neighborhood shape as the horizon… make the circle a compass face,
and literally tie it to the device's compass so it's helpful in an orienteering way, and it totally ties in the
municipal element too."* · *"I kind of think this should be totally runtime."* · *"maybe it's not a ring but a
series of tics?"* · street names at the rim: *"unknown"*, then *"drop the street names at the rim"* · heading: *"whatever's helpful"* · *"not in movie."* · *"the map can be North up unless they are in the
hood"* (with the live user dot).

## 1. What it is
The neighbourhood is one closed shape, and its rim is an edge of the drawing (the kit's own doctrine). This
gives that edge a job: **a bezel of ticks around the town's edge** — no drawn ring; the ticks imply the circle,
as on a watch bezel. The four cardinal ticks are heavier, with small N · E · S · W.

## 2. Totally runtime — nothing new in the slab, nothing new in the bake
Everything it needs is already published:
- **The circle:** `ground.json`'s `stencil` — `center` and `radius` per town.
- **True north from the phone's heading:** the World Magnetic Model, computed in the player from the town's
  latitude/longitude and **today's date** — more correct than a baked number, because declination drifts.
- **The heading:** the device orientation API. iOS needs a user tap to grant it, so it starts from a control.

## 3. Behaviour — the helpful defaults (Jacob: "whatever's helpful")
- **Where:** Society's map (plan view) and Street. **Not in the movie.**
- **North-up unless you are in the neighbourhood** (Jacob, 2026-09-28). The map already carries a live user
  dot — the person's position, placed with `TownPoint`. Outside the town's disc, or with no position, the
  map is north-up. **Inside the disc, the map turns with the person by default**, the bezel's N pointing at
  true north, and the dot shows which way they face. ⭐ **It rotates about the TOWN's centre, like a compass
  card — never about the dot, and it never follows or recentres on the person** (Jacob, 2026-09-28: "it
  should center in its center. it just rotates like a compass"). The dot moves across the town; the town
  only turns. **Pan and zoom stay the person's, in every mode** (Jacob: "the user can still drag the map
  horizontally and zoom") — the heading drives ROTATION only, never position or scale.
- **Pinch zooms and twist rotates, in every mode** (Jacob: "pinch scale and rotate, too"). ⭐ **A twist is
  momentary: on release the map settles back to the correct bearing** (Jacob: "the map settles in the correct
  direction") — true north outside the neighbourhood, the person's heading inside it — with the same eased
  "give" as the end of a drag. The map is never left pointing the wrong way, so there is no "rotated by hand"
  mode to escape from. **Only the rotation settles: pan and zoom stay exactly where the person left them**
  (Jacob: "the scale and pan remain, though"). Reduced motion: it returns without the ease.
  ⚠️ The old player's plan camera disables rotation (`cameraRegimes.js` plan regime) — the Ward's plan camera
  enables it.
- **In Street,** the bezel shows which way the camera faces, and replaces the old `CompassRose.jsx` (delete it;
  one compass, not two).
- **No street names at the rim** (Jacob, 2026-09-28: *"drop the street names at the rim"*). Ticks and
  N · E · S · W only. No exit layer is built.
- **Reduced motion:** stays north-up; heading changes are smoothed, never jittery. Screen readers hear
  "facing north-east" on change, rate-limited.

## 4. No fallbacks
- A town with no disc (`stencil: null`) has no bezel, and says so once.
- No heading from the device → no "face my direction" control; never a guessed north.
- Declination that cannot be computed → the control is withheld with its reason; never magnetic passed off as
  true.

## 5. Where the pieces live
- **The kit** (`Town` layer `compass`): one model (`compassBezel.js` — ticks and cardinals from the stencil), two renderings: on the ground at the rim in plan, and a screen-space bezel in
  Street driven by a `heading` prop (degrees true, or null).
- **The Ward:** the "face my direction" control, the device-orientation permission, the declination, the
  map's rotation, and the spoken readout.

## 6. Checks — each seen to fail first
- The declination for a known town and date matches NOAA's published value within its stated tolerance.
- The bezel meets the map legibility floor (`BRIEF-map-legibility-floor`) at noon, dusk and midnight — this
  check waits on that brief's harness and Jacob-calibrated threshold. Until then the bezel's colours are
  authored values with a neutral default, never a town's constant.
- No constant in the bezel is a town's: radius, centre and tick count come from the town's own disc.

## 7. Eye gate
Jacob, on two towns, north-up and facing: the ticks and the cardinals.
