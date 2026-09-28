# BRIEF — The town's edge as a compass bezel

**For:** a fresh agent, kit and Ward. **Written:** 2026-09-28 (Warden). **Report to:** Warden.
**Jacob, 2026-09-28:** *"We use the round neighborhood shape as the horizon… make the circle a compass face,
and literally tie it to the device's compass so it's helpful in an orienteering way, and it totally ties in the
municipal element too."* · *"I kind of think this should be totally runtime."* · *"maybe it's not a ring but a
series of tics?"* · street names at the rim: *"unknown"* · heading: *"whatever's helpful"* · *"not in movie."* · *"the map can be North up unless they are in the
hood"* (with the live user dot).

## 1. What it is
The neighbourhood is one closed shape, and its rim is an edge of the drawing (the kit's own doctrine). This
gives that edge a job: **a bezel of ticks around the town's edge** — no drawn ring; the ticks imply the circle,
as on a watch bezel. The four cardinal ticks are heavier, with small N · E · S · W.

## 2. Totally runtime — nothing new in the slab, nothing new in the bake
Everything it needs is already published:
- **The circle:** `ground.json`'s `stencil` — `center` and `radius` per town.
- **Street exits** (optional layer, §3): `labels.json` carries every named street as a polyline. Intersect each
  with the circle once, on load; the name sits at its crossing, on the bezel.
- **True north from the phone's heading:** the World Magnetic Model, computed in the player from the town's
  latitude/longitude and **today's date** — more correct than a baked number, because declination drifts.
- **The heading:** the device orientation API. iOS needs a user tap to grant it, so it starts from a control.

## 3. Behaviour — the helpful defaults (Jacob: "whatever's helpful")
- **Where:** Society's map (plan view) and Street. **Not in the movie.**
- **North-up unless you are in the neighbourhood** (Jacob, 2026-09-28). The map already carries a live user
  dot — the person's position, placed with `TownPoint`. Outside the town's disc, or with no position, the
  map is north-up. **Inside the disc, the map turns with the person by default**, the bezel's N pointing at
  true north, and the dot shows which way they face. It moves because the *person* moved — "the scene never
  takes you anywhere" holds.
- **A control, always:** "North up" / "Face my direction" is a named switch whenever it applies, so a
  person inside can hold the map still. iOS asks permission for the heading on a tap; until granted, the
  map stays north-up and the switch asks.
- **In Street,** the bezel shows which way the camera faces, and replaces the old `CompassRose.jsx` (delete it;
  one compass, not two).
- **Street names at the rim — undecided ("unknown").** Build it as a Town layer, switchable, and show Jacob a
  frame of each town with and without it. He chooses the default.
- **Reduced motion:** stays north-up; heading changes are smoothed, never jittery. Screen readers hear
  "facing north-east" on change, rate-limited.

## 4. No fallbacks
- A town with no disc (`stencil: null`) has no bezel, and says so once.
- No heading from the device → no "face my direction" control; never a guessed north.
- Declination that cannot be computed → the control is withheld with its reason; never magnetic passed off as
  true.

## 5. Where the pieces live
- **The kit** (`Town` layer `compass`): ticks, cardinals, optional street exits, drawn from the stencil and
  labels; takes a `heading` prop (degrees true, or null) for Street's indicator.
- **The Ward:** the "face my direction" control, the device-orientation permission, the declination, the
  map's rotation, and the spoken readout.

## 6. Checks — each seen to fail first
- Street exits computed from `labels.json` match the circle to within a metre on two towns.
- The declination for a known town and date matches NOAA's published value within its stated tolerance.
- The bezel meets the map legibility floor (`BRIEF-map-legibility-floor`) at noon, dusk and midnight.
- No constant in the bezel is a town's: radius, centre and tick count come from the town's own disc.

## 7. Eye gate
Jacob, on two towns, north-up and facing: the ticks, the cardinals, the street exits both ways.
