<!-- BRIEF-STATE
status: OPEN
dispatched: Tamp (kit) · Quire (the Ward)
written: 2026-09-28
evict-when: RULING: Jacob's eye on the phone ring (north-up and turned, noon and night) and the computer rose
-->
# BRIEF — The compass

**For:** the kit (Tamp) and the Ward (Quire). **Rewritten:** 2026-09-28 (the rim design it replaces is in the Diary:
`cartograph/_archive/BRIEF-compass-bezel-rim-SUPERSEDED-2026-09-28.md`). **Report to:** Warden.
**Jacob, 2026-09-28:** *"a maxi compass around the part of the map we're looking at, which is either N for people
outside the hood or rotates dynamically for people in the hood."* · *"computer gets no ring"* — only the little rose.

## 1. What it is
- **Narrow screen:** the map is seen **through** the ring, so the ring is **as large as the map's space allows** — Jacob:
  *"if we're looking at the map thru the ring it needs to be maximum size in the space; on a phone that would be a
  square at the top of the screen."* The app makes its map area that square and asks for `<Town compassDial={{ at:
  'fill' }}>`: the dial inscribed in the map's viewport. (Where it sits is the app's layout; `top-center` and the edges
  remain for a smaller badge.) In **Street**, the same dial as a small badge.
- **Wide screen:** **no ring, and no compass in Street.** It keeps the little compass rose it already has — the old
  player's `src/components/CompassRose.jsx` (`CompassRoseSVG`), shown when not at ground level (`App.jsx`). The Ward
  ports it **faithfully**: the same drawing, the same size. Not redesigned.
- **Not in the movie** (the hero shot draws no compass).

**Narrow versus wide is the APP'S LAYOUT, not the device** (Jacob, 2026-09-28: the ring is *"narrow-screen detail, so I
can see it on my desktop"*). The app passes `<Town compassWhen>` — the media query for its own narrow layout (the
Ward: its stacked Society, i.e. `not all and (min-width: 60rem) and (orientation: landscape)`, its own breakpoint). The
kit carries no breakpoint, so it can never drift from the app's layout; narrow a desktop window and the ring appears.
Only the ring's TURN needs a real heading (§2). Never a user-agent. A compass layer with no `compassWhen` refuses.

## 2. Which way it turns — the map's camera decides, and the dial follows it
The dial reads which way the view faces **from the camera**, every frame, so it can never disagree with the map:
- **North-up** — a visitor outside the town, or no heading (no sensor, permission refused): the map is north-up, so
  the ring is.
- **Heading-up** — inside the town with a heading: the map turns with the person (the Ward's plan camera, the device
  compass), and the ring turns with it. **A twist is momentary**: on release the map settles back to the correct
  bearing, with the same eased give as a drag's end; **only the rotation settles — pan and zoom stay** where the
  person left them. Reduced motion: it returns without the ease, and stays north-up.
- The **heading** is true, not magnetic: the device's compass + the World Magnetic Model's declination for the town's
  place and today (the Ward's `src/compass/heading.js` + `declination.js`). No heading → north-up, never a guessed north.
- **Screen readers** hear "facing north-east" on change, rate-limited (`compassWord` in the model).

## 3. The look — one model, the Look authors it
`src/lib/compassBezel.js` is the one model; every size is a fraction of the dial's own radius and every spacing an
angle, so it reads the same at any size and holds no town's data. A Look authors any of it under `compass` in its
design; the defaults:
- **Ticks:** minor every 2°, intermediate every 10°, major every 30°, cardinal every 90°; the finer tiers recede
  (less opacity), the cardinals lead.
- **The north mark:** 🔺, one definition (a swap is one line), in place of N's tick; a small N under it.
- **Colour:** Cary's verdigris (the Ward's `--cary-rule`: day `#2F7D63` / night `#56B892`) — lent to the compass by
  Jacob; the note sits on the token.
- **Keyline:** a thin light line round every mark (the Ward's `--ground`), so each carries its own contrast over any map.
- **Glow in the dark:** after sunset (the town's clock, so a scrub moves it) the colour eases to its night value and
  lifts; the 🔺, which cannot be tinted, gets a red halo (⏳ proposed, awaiting Jacob's eye).
- **The face** — a ring, darker inward, lighter at the rim, a thin light rim line and a soft shadow — is drawn in
  **the host's colours**: `CompassBezel.css` consumes `--compass-face-centre · --compass-face-rim · --compass-rim-line ·
  --compass-shadow` and supplies none. A host that sets none gets a loud console error, never a borrowed palette.

## 4. Where the pieces live
- **The kit:** `src/lib/compassBezel.js` (the model), `src/components/CompassBezel.jsx` + `.css` (the dial: the ring
  in plan on a handheld, and the same dial as Street's badge where an app places one). A `<Town>` layer, **opt-in**
  (`layers.compass: true`) — an app that never asks draws exactly what it drew before.
- **The Ward (Quire):** the rotation (heading-up inside the town, settle-back, pan/zoom kept), the heading and
  declination modules (built), the permission tap, the spoken readout, the face tokens, and the **computer rose port**.
- **The map's framing** (it is now free to frame the lit places rather than the whole disc) is the Ward's camera plus
  a kit helper — not this brief.

## 5. No fallbacks
- No heading → north-up; never a guessed north, never magnetic passed off as true.
- Declination outside the model's window (WMM2025: 2025.0–2030.0) → the heading is withheld with its reason.
- A host that sets no face colours → the dial says so, once.

## 6. Checks
▶ `node checks/claims-the-compass-is-one-dial.mjs` — one dial (plan and Street draw the same `BezelDial`); nothing on
the ground; no town data in the model; the computer gets no ring (the input rule, no user-agent); the model's rules.
▶ The Ward: `npm run check` — `declination-matches-noaa`, `heading-is-true-or-nothing`.

## 7. Eye gate
Jacob, on a phone: the ring north-up and turned, at noon and at night; and the computer's rose.
