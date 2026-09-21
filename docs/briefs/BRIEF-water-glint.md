<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-20 · the GLINT half landed and was retired 2026-09-21; what remains is the WAVES arc
evict-when: RULING: Jacob's eye on huron's lake with Gerstner crests and Jacobian foam, at the crossover hour, from a LOW camera angle. There is no mechanical proxy for "the waves read as graphic"; the acceptance is the operator's view.
-->

# BRIEF — The waves, and the weather they make visible

> ⚠️ **THIS FILE'S ORIGINAL SUBJECT — THE GLINT — HAS LANDED. The filename is kept so the
> commit record's citations of "the glint brief" still resolve.** What remains below is the
> arc that was recorded here as downstream direction and **was never started**.

## ✅ THE GLINT HALF, LANDED 2026-09-20/21 — compressed to its outcome

Both measured causes were real and both are closed. ① `uWaveK` multiplied **every** octave, so
huron's smallest ripple was 43 m and nothing visibly moved in the seconds an operator looks —
the glitter octaves are now **world-constant** (4.20 / 1.35 / 0.42 m), each drifting at its own
deep-water phase speed `√(gL/2π)`, so the glitter is scale-free by construction. ② the highlights
were **albedo** — *"PAINTED, not reflected"*, in the shader's own words — and nothing in it knew
where the sun was; they are now a specular lobe against the wave-slope distribution.

⭐ **The two findings from the build that are worth more than the fix, both preserved in the code:**
- **GLITTER IS A THRESHOLD, AND JACOB SAID SO TWICE BEFORE IT WAS HEARD** — *"I suggested clipping
  the effect alpha so only the highest highlights show… why does it either look radioactive or not
  there?"* He was right and it is the physics, not a workaround: glitter is the **tail** of the
  slope distribution, so the correct picture is a sparse scatter of very bright points. Spreading
  that energy smoothly over 7 km of water is **nothing per pixel**; there is no setting between
  radioactive and absent, because ⭐ **the difference between noise and sparkle is DUTY CYCLE, not
  amplitude.** ⛔ And a clip must be normalised against the **slope distribution**, never against
  "does this facet see brighter sky than the mean" — that quantity has teeth only at grazing views,
  so it evaporates from overhead: **a threshold that depends on the camera angle is not a clip.**
- ⛔ **IN A NORTH-FACING SHOT ON HURON THE ANSWER IS GEOMETRICALLY ZERO.** The lake is north; at
  41.4°N the sun is always south. **A glitter path cannot exist in a frame the body is behind, and
  no shader term can invent one.** ⇒ the remedy is a **camera bearing**, which is authoring.

**Where it went:** `src/components/waterMaterial.js` · `ls/FEATURES.md §Water` ·
`ls/OPERATIONS.md` (the `glint` knob — `1` is a multiple of the physically correct wave slope,
`0` is the exact pre-glint surface and is what makes the dial falsifiable) ·
▶ `node checks/water-layer-budget.mjs` before tuning any water layer.

⚠️ **The eye gate this half asked for — the moving sun-path streak at low sun — was never recorded
as met.** It is on the board as part of `ROADMAP` H-15's crossover-hour gate, not claimed here.

⛔ **DO NOT START WHAT FOLLOWS BEFORE THAT EYE GATE.** All of it rests on the octave table being right.

---

# ⭐⭐ DOWNSTREAM — THE WATER IS WHERE THE WEATHER BECOMES VISIBLE

> **Jacob, 2026-09-20, on seeing the glint land:** *"I have just realized what to do. This is
> **way** beyond tonight but the WATER and the WAVES are what get connected to the weather system."*

⛔ **Recorded here, not opened.** This is the direction, not a ticket. It lives in this brief
rather than a new file because it is the same surface and the same table.

**⭐ It is far closer than it sounds: every input already exists, and the glint work built the
thing that consumes them.** Fathom's octave table carries a **`steepness`** per octave and a
**drift direction** — today both are constants. They are the two dials wind drives.

| what the weather already computes | where | what it should drive on the water |
|---|---|---|
| `windSpeedMs` | `weather-payload.js:87` | ⭐ **octave `steepness`** — glassy calm → chop. The single highest-value link: steepness is what the specular lobe catches, so wind would visibly change the GLITTER, not just the geometry. |
| `windDirDeg` | `weather-payload.js:97` | the drift vector, currently fixed per octave |
| gust front, with **propagation delay** across the scene | `wind-field.js:15` | ⭐⭐ **cat's paws** — the dark patches that race across a lake ahead of a gust. Already modelled for trees, travelling at a real speed with a real delay. On water it is the most legible weather cue there is, and it is nearly free. |
| `wind.gustsScale` / `gustEnvelope` | `almanac-eval.js:272-273` | the envelope on the above |

### ⛔ The one thing that is NOT already there: FETCH
Wave height is a function of wind speed **and fetch** — the distance of open water the wind has
crossed. A sheltered lee shore stays glassy in the same wind that raises chop a kilometre out,
and that contrast is most of what makes real water read as real.
⭐ **The signal for it is the same one the shoreline needs:** `coastline.mjs` `arcs` (§6e) — fetch
is the distance from a point to the upwind shore along `windDirDeg`. ⇒ **the arcs work is now
load-bearing for two features, not one**, which strengthens the case for the slab schema bump
that §6e costed and left for Jacob.

### Why this is the right place for weather to show
Trees move in wind; that is legible but local. Water integrates wind over an entire surface, so a
change in conditions is visible **everywhere at once, at every scale** — swell, chop, glitter, and
the gust front crossing. ⛔ And it is the one surface where the operator can SEE the difference
between two conditions without being told which is which, which makes it the natural eye-gate for
the whole weather system.

⚠️ **Do not start this before the glint's eye gate passes.** The whole thing rests on the octave
table being right.

## ⭐⭐ AND THE WAVES THEMSELVES — what "big, visible, graphic" actually requires

> **Jacob, 2026-09-20:** *"I think we'd want to engage fluid systems and even have some kind of
> noise generator for the froth on the front of the crests…? The waves are big, visible, graphic
> IRL."* · and *"Adding clouds, rain and color grading will **sell** it."*

### ⛔ THE BLOCKER IS GEOMETRY, AND IT IS ONE NUMBER
    node -e 'const g=require("./public/baked/huron/ground.json");const w=g.groups.find(x=>/water/.test(x.id||""));console.log(w.vertexCount, w.indexCount/3)'

**657 triangles over ~14 km² — roughly 145 m per triangle edge.** Everything on the water today is
normal perturbation on a FLAT SHEET; there is physically nowhere to put a crest. Representing a
4 m wave as geometry across that area would take **~2 million triangles.**
⭐ **The answer is the one already shipped for shadows (3dcb5dd3): a CAMERA-FOLLOWING GRID** —
dense near the viewer, coarse away, detail spent where the eye is. ⛔ Do not tessellate 14 km².
Same doctrine, same reason, and the precedent is now in the tree.

### ⛔ NOT A FLUID SIM — A SPECTRUM. And the spectrum IS the weather hookup.
Navier-Stokes / SPH solves the wrong problem: open water is not simulated fluid, it is a **wave
spectrum** (Phillips / JONSWAP), whose parameters are **wind speed, wind direction and fetch** —
precisely the three signals the section above already identified. ⭐ So the weather binding is not
bolted on afterward; **it is the wave model's own input.** That is the strongest argument for doing
the waves at all.

### ⭐ WHY REAL WAVES LOOK GRAPHIC — the cheapest high-value term in the whole arc
Sharp crests with broad troughs cannot come from vertical displacement; that gives rolling sine
hills. The sharpness is **HORIZONTAL displacement** — water moving toward the crest and piling it
up (Gerstner). Same wave count, one extra term, and the silhouette changes completely.
⇒ **Do this before anything else in the wave arc.**

### ⭐ FROTH IS DERIVED, NOT PAINTED — noise is the modulator, not the source
Where the horizontal displacement folds the surface onto itself, **the Jacobian of that
displacement goes negative — and that happens on the CREST FRONT**, which is exactly where Jacob
put it by eye. So the foam mask falls out of the wave field:
· Jacobian < threshold ⇒ foam · noise breaks up its edge · a decay term makes foam PERSIST and
dissipate in the wake, and the trailing streak behind a crest is most of what sells it.
⛔ Noise-only froth sparkles in the troughs too and never reads right. *(Same error class as the
painted glint in ②: a real signal existed and was approximated with noise.)*

### ⭐ LAKE ERIE IS THE EASY CASE, and it is why the description is accurate
Erie is shallow (~19 m mean) and fetch-limited, so its waves are **steeper and shorter-period than
ocean swell** — famously choppy whitecaps rather than long rollers. Short wavelengths need less
grid to resolve. ⇒ huron is asking for the CHEAPER thing, and the steepness is the whole look.

### ⛔ THE PRESENTATION LAYER IS ALREADY BUILT — water is the missing surface, not a new stack
`weather/RainParticles.jsx` · `weather/SnowParticles.jsx` · `weather/LightningDriver.jsx` ·
`atmosphere-materials.js` (clouds) · `GRADE_FIELDS` (`skyLightChannels.js:382`) · and a whole
Meteorologist app for authoring Conditions. ⭐ **Clouds, rain and grading already ship.** What they
lack is a surface that integrates the weather over a whole area and shows it at every scale.
⇒ The water is not another feature alongside them; **it is the thing that makes the ones we
already have legible.**

### Staging — each stage is visible on its own and gateable
① camera-following displaced water grid *(unblocks everything; nothing visible until it lands)*
② Gerstner sum off a wind spectrum *(the graphic silhouette — the big visible win)*
③ Jacobian foam + decay *(the crest fronts)*
④ bind ①–③ to windSpeedMs / windDirDeg / gust front / fetch *(the tracker payoff)*
⛔ Not before the glint's eye gate. ⭐ And ② is where a sceptical operator is convinced, so do not
let ① run long without showing something.
