<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-20
evict-when: RULING: Jacob's eye on huron's farmland, near and far, against LS's park grass unchanged.
-->

# BRIEF — A FIELD IS NOT A LAWN

*Written 2026-09-20 by the coordinator seat. Second of two landscape-leverage briefs; the first is
`BRIEF-water-shader.md`.*

> ### ⭐ THE ASK — Jacob, 2026-09-20
> *"Will we be able to fill a field with Corn? Just realizing we should add more foliage if that's
> possible."* · *"Without a hero object, we're going to need to get a lot of visible leverage from
> the landscape itself, and that means beautiful (expensive) water and beautiful fields."*

---

## 1. You are the dispatched agent. Name yourself — one word, yours.

## 2. Agent: **FRESH**

⚠️ `BRIEF-water-shader.md` is the sibling and may be live. **You share a pattern and nothing else** —
different scale, different physics, different failure modes. ⛔ Do not merge the work; coordinate
through Boz if both are running.

## 3. ⛔⛔ THE PREREQUISITE, AND IT IS HARD: **`farmland` IS NOT A THING YET**

`derive.js:3144` `OSM_TO_LU` has **no entry for `landuse:farmland`, `meadow`, `orchard` or
`greenhouse_horticulture`.** A tag with no mapping **never becomes an LU polygon at all** — the face
falls to the parcel vote, else to the **`'residential'` default.** ⇒ **huron's 53 agricultural
features are currently invisible, presented as somebody's lawn.**

▶ **`BRIEF-lu-vocabulary.md` is that work and it BLOCKS this brief.** ⛔ **Do not start here.** There
is nothing for a crop shader to attach to, and building one first would mean inventing your own
classification — a second producer, which this project already has too many of.
⭐ **What you CAN do before it lands:** §5's measurement, and the scale study in §4②. Both are
independent of the class existing.

## 4. THE MECHANISM EXISTS — `grassMaterial.js` IS THE TEMPLATE, NOT AN ANALOGY

`src/components/BakedGround.jsx:63-82`:
```js
const GRASS_MATERIALS = new Set(['lawn','treelawn','median'])      // by material kind
const GRASS_FACES     = new Set(['park','residential','recreation']) // by LU class  ⭐
```
⇒ **A per-face-kind surface treatment, keyed off the LU class.** A `farmland` class takes a crop
variant exactly the way `park` takes grass. ⚠️ **And note: another three-entry table holding
precisely the three faces LS has** — the same shape as `OSM_TO_LU`, `lu-policy`, and the Designer's
toggle panel. **Adding a fourth should not require a fourth table; establish whether it does.**

`src/components/grassMaterial.js` is **196 lines and already wired into the whole environment** —
`applyWeatherToShader`, `uSunAltitude`, a clip map, the lamp lightmap and `_lampGlow`.
⭐⭐ **THAT WIRING IS THE PRIZE AND IT IS WHY THIS IS CHEAPER THAN IT SOUNDS.** A crop material that
goes through the same sockets inherits **time of day, weather and lamp light for free** — and a field
that does not change with the sky looks painted no matter how good the geometry is. ⛔ **Extend the
factory. Do not write a parallel material** (`feedback_no_parallel_pipeline_for_scenes` in spirit).

### ① WHAT A CROP IS, THAT A LAWN IS NOT
⭐ **ROWS.** That is the whole perceptual difference and it is mostly free: the grass noise is
isotropic; a crop is **strongly anisotropic** — a row frequency and a row *bearing*.
⚠️ **And the bearing is a real question, not a constant:** rows follow the field's own long axis, and
that is derivable per-face from the polygon (minimum-area rectangle, or the dominant edge direction).
⛔ **A fixed bearing across every field in a town will read as wallpaper** — it is the single most
likely way this ships looking wrong. Derive it per face.
⭐ Also unlike a lawn: **seasonal height and colour** (bare soil → green → gold → stubble) and a
**headland** — the turning strip at the field edge where rows stop. The headland is cheap and it is
most of what makes a field read as *worked* rather than *striped*.

### ② SCALE — the failure mode this brief shares with the water one
⛔ The grass material's frequencies are tuned for **a lawn seen from a sidewalk.** huron's farmland
is measured at **37 features**, and a field is viewed mostly **near-to-mid**, not at 40 km² like the
lake. ⚠️ **Different problem from water, same discipline: derive the frequency from the feature's own
extent, not a constant.** A row spacing that looks right on a 20 m verge is corduroy on a 400 m field.

## 5. ⭐ THE MEASUREMENT TO DO FIRST — it decides how much of this is worth building

▶ **Size the audience before designing the treatment.** Per town, per candidate class, measure:
**how many faces, what total area, and what fraction of the disc.** huron's raw carries
**farmland 37 · meadow 12 · greenhouse_horticulture 3 · orchard 1** — ▶ re-derive, and get the AREA,
which nobody has. ⛔ **If farmland is 2% of huron's disc, a corn shader is a luxury; if it is 30%, it
is the town's whole look.** Neither is known today and the brief should not assume.
⚠️ **And measure it on altadena too** — it is the other non-LS town with area to spare, and a
treatment justified by one town is an instance patch.

## 6. ⚠️ WHAT ONLY JACOB CAN DECIDE
- **How many crop treatments?** One generic "cropland", or corn / soy / wheat distinctly? ⭐ OSM
  carries `crop=*` on some farmland — ▶ **measure how many of huron's 37 actually have it** before
  proposing a per-crop system that the data cannot feed.
- ⭐⭐ **`orchard` is genuinely trees, planted in rows by a farmer.** It is not a crop shader and it is
  not a park. It may belong to the ARBORIST — a placement pattern, not a surface — and that is a
  different brief with a different owner. ⛔ **Do not absorb it. Ask.**
- **`meadow` vs `grassland` vs `grass`** — three tags, and it is not obvious they are three looks.
- **Season.** Is the town's crop state authored, derived from the weather year, or fixed? ⛔ A
  seasonal field implies a seasonal tree canopy, and that is a much larger arc. **Do not open it.**

## 7. ⛔ Can the instrument SEE the change?
⚠️ **Largely not, and say so rather than faking it** — this is a LOOK, and a check asserting
"beautiful" would be worse than none. What IS checkable, and should be:
- ⭐ **row bearing is DERIVED per face, not constant** — mutation: hardcode one and prove it fails.
  That pins §4①, the thing that silently degrades into wallpaper.
- frequency derived from extent, not a constant (§4②).
- every agricultural face resolves to the crop material once the class exists — **and none does
  today**, which is the §3 prerequisite stated as an assertion.

**Eye-gate surface:** huron, **near AND far** — ⛔ a field that reads well overhead and as corduroy at
eye level has failed. ⭐ **LS's park grass UNCHANGED is the control**: if the lawn moves, the
extension was not faithful.

## 8. Write/commit bounds
**In bounds:** `grassMaterial.js` and a crop variant beside it · `BakedGround.jsx`'s face-kind tables
· the new check.
⛔ **OUT:** the LU vocabulary itself (`BRIEF-lu-vocabulary.md`, and it blocks you) · water
(`BRIEF-water-shader.md`) · the arborist's placement (`orchard`, see §6) · seasonality.
⛔ **LS's grass must come out UNCHANGED.** It is the control and the one surface an operator knows.
⛔ **SURFACE SCOPE DRIFT, DO NOT ABSORB IT.**

---

## What "done" looks like
1. The agricultural audience is **measured by area**, two towns, before anything is built.
2. A crop treatment exists as a **variant of the grass factory**, inheriting weather, sun and lamps.
3. **Row bearing and frequency are derived per face** — and a check proves it, mutation-tested.
4. LS's grass is unchanged; Jacob has seen huron's fields **near and far.**
5. `orchard` is **asked about, not absorbed.**
