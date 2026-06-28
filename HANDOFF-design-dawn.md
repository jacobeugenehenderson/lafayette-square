# HANDOFF — Design the "Dawn" look (first-try natural styling, all 3 shots)

**Quick dispatch brief.** You are a **designer agent**. Author a believable, natural-looking **Dawn** time-of-day across the three production shots (Hero · Browse · Street) as a *first try* the operator will refine. You do the design judgment + the value-setting + the image-based troubleshooting; the operator is the render device.

## Agent: FRESH
**Name yourself.** This is a self-contained styling pass — no prior code context needed, just the look channels + an eye for dawn.

### First reads
1. `ORIENTATION.md` → `README.md §⭐ START HERE`.
2. **`cartograph/OPERATIONS.md`** — what every look knob does (Sky & Light, Post, Lamps cards). *(The prose is rough; lean on the field defs for ranges.)*
3. **`src/cartograph/skyLightChannels.js`** — the channels + each field's `min/max/step/default` (your value vocabulary + safe ranges).
4. **`src/cartograph/TodChannel.jsx` header (lines 10–14)** — the channel DATA SHAPE you'll write (`flat: {values:{field:n}}` vs `animated: {animated:'tod', values:{<slot>:{field:n}}, transitionIn, transitionOut}`).

## The loop (how you work — this IS the leverage)
1. **Author** Dawn values into `public/looks/lafayette-square/design.json` — for each relevant look channel, set its **`dawn`** slot keyframe. (A still-flat channel becomes `animated:'tod'` with a `dawn` entry; an already-animated one just gets/updates `values.dawn`.) **Write a tiny helper** (`scratch/set-slot.mjs`: load design.json → `ch.animated='tod'; ch.values.dawn[field]=val` → save) and call it per channel — don't hand-edit 15 JSON blocks by eye.
2. **Bake:** `node cartograph/bake-scene.js --look=lafayette-square` (design.json → scene.json).
3. **Render:** ⚠️ there is **no headless render** — ask the operator to **scrub to Dawn and screenshot Hero, Browse, and Street**, and paste them back.
4. **Evaluate the images yourself** (the operator explicitly wants you to do the troubleshooting): is it too dark? sky the wrong hue? lamps still on? sun from the wrong feel? Name the fix in knob terms, adjust the Dawn values, re-bake, ask for a fresh shot. **Iterate** until each shot reads as a natural dawn.

## What "natural Dawn" looks like (the target)
Low warm sun just breaking the horizon; the sky still cool/violet up high grading to a **warm band at the horizon**; soft, low-contrast light (long, gentle shadows, not harsh); a touch of **ground mist/haze**; **street lamps fading off** (lantern near zero — dawn, not night); **stars fading out**; gentle, not blown, bloom. Believable and inviting, not a postcard.

## The knobs to set for Dawn (start here, tune by eye)
- **Exposure** (Post) — overall brightness; dawn is dim-but-legible, below noon.
- **Ambient** (Sky & Light) — *now a real night-fill control* (landed 2026-06-27): this is your lever if the map reads black; bring it up enough to read, keep it soft.
- **Warmth** (Post) — push warm for the sunrise cast.
- **Sky Layer Gain** — how bright the sky dome sits (brightness only). ⛔ **Do NOT touch the sky COLORS** — see boundaries.
- **Mist** — a little density + a cool-warm dawn tint.
- **Halo** — gentle horizon glow.
- **Sun light / Moon light (dirSun/dirMoon)** — sun low + warm, moon out.
- **Lantern** (Lamps) — near 0 (lamps off at dawn).
- **Stars** (`stars.brightness`) — low/fading.
- **Bloom** — modest; let the rising sun + any lit windows glow softly, don't wash.
- **Grade / Grain** — light touch.

## Scope / boundaries
- **Dawn slot ONLY**, across the 3 shots. Don't author the other 6 slots (that's the next pass).
- ⛔ **Do NOT edit the sky colors (the `sky` channel / gradient stops).** The dome's hues come from the physical sun model — that warm-horizon/cool-up grading happens on its own. Touching them breaks the natural sky. You may adjust **Sky Layer Gain** (brightness) but never the gradient colors.
- **You author DATA (design.json) — never edit render code or the resolver.** If a knob can't get the look you want, say so (it may be a bracket-too-tight or a missing knob — flag it, don't hack code).
- Commit your design.json + the helper + a short `scratch/DAWN-DESIGN-NOTES.md` (what you set + why) on `curb-offset-draw`, selective `git add`. Don't touch others' in-flight files.

## Done = the operator's eye
Dawn reads as a natural, inviting dawn in Hero, Browse, and Street — and you've left notes on the values so the other 6 slots can follow the same recipe.
