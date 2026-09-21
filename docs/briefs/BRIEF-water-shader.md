<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-20
evict-when: RULING: Jacob's eye on huron's lake, at three times of day, against LS's pond unchanged.
-->

# BRIEF — LIFT THE POND OUT OF LAFAYETTE PARK AND MAKE IT A LAKE

*Written 2026-09-20 by the coordinator seat.*

> ### ⭐ WHY THIS MATTERS MORE THAN IT LOOKS — Jacob, 2026-09-20
> *"Without a hero object, we're going to need to get a lot of visible leverage from the landscape
> itself, and that means beautiful (expensive) water and beautiful fields."*
> *"I think we need more of a GL shader with subsurface scattering and stuff."*
>
> ⛔⛔ **AND THE PREMISE IS LOAD-BEARING: `GatewayArch.jsx` IS LS-GATED, SO TOWN #2 HAS NO HERO OBJECT
> AND NO PATH TO ONE.** The kit's current answer to *"what does a visitor look at"* is an LS-only
> component. ⇒ **The landscape carrying the view is not a nice-to-have. It is the only answer the kit
> has.** This brief is the first half of that; fields are the second and are a separate brief.

---

> # ⭐⭐ REORDERED 2026-09-20 — **GLINT FIRST.** The payoff Jacob named is not what this brief led with.
>
> *"Water will be a bigger immediate payoff; **sun and moon reflecting will be very romantic and
> visibly so.**"*
>
> ⛔ **THE BRIEF AS WRITTEN LED WITH SHORELINE FALLOFF AND DEPTH/SSS, AND HAD NO GLINT IN IT AT ALL.**
> That is backwards for value. **Work in this order:**
>
> | # | step | why here |
> |---|---|---|
> | **①** | **Lift the shader out of `LafayettePark.jsx`** into a kit material | nothing else is reachable until huron can get it |
> | **②** | **Scale-aware frequencies** | at 40 km² the pond constants read as flat plastic — ⛔ silently |
> | **③** | ⭐⭐ **SUN + MOON GLINT** | **the payoff, and the cheapest thing in the brief** |
> | **④** | Shoreline falloff | free — the waterline is the terrain's y=0 crossing (§6d) |
> | **⑤** | Depth / subsurface | ⛔ only if a signal exists; the DEM has no bathymetry (§6d) |
>
> ### ⭐⭐ AND ③ IS CHEAPER THAN IT SOUNDS — MEASURED, NOT ASSUMED
> · The pond material is **already `roughness: 0.15, metalness: 0.35`** — **a reflective surface
>   already.** (`LafayettePark.jsx:472-479`)
> · It **already carries `uSunAltitude`** and a full day→night ramp with a separate `nightWater`
>   indigo. **The sun is already in the shader.**
> · ⭐⭐ **AND THE MOON ALREADY DRIVES A REAL LIGHT.** `CelestialBodies.jsx:71`: *"the very position
>   the `<directionalLight>` consumes. **Sun by day, moon-blended**"*. ⇒ **A standard material in
>   this scene is ALREADY LIT by the correct celestial body at the correct position.**
>
> ⇒ ⛔ **SO THE FIRST QUESTION OF ③ IS NOT "HOW DO WE ADD GLINT" — IT IS "WHAT IS SUPPRESSING IT?"**
> ▶ **MEASURE THAT BEFORE WRITING ANY SHADER CODE.** The fragment shader assembles `waterCol` from
> ramps and caustics and assigns it; a material that computes its own colour can easily be throwing
> the specular contribution away. ⭐ **If the answer is "the override discards it", the fix is small
> and the romance arrives almost free.** If the answer is "there is no specular path at all", say so
> — that is a different and larger job and Jacob should hear which before it is promised.
> ⚠️ **Do not add a second light or a hand-rolled sun vector.** The scene already has the right one,
> and a parallel light is the shape this project has spent a day excising.

## 1. You are the dispatched agent. Name yourself — one word, yours.

## 2. Agent: **FRESH**

⚠️ The LU-vocabulary brief (`BRIEF-lu-vocabulary.md`) touches `m3Colors.js` and `derive.js`. **If it
is live, coordinate through Boz** — see §6, it is also your prerequisite.

## 3. ⛔ FIRST, THE CORRECTION THAT SHAPES THE BRIEF: **WE ALREADY HAVE A GOOD WATER SHADER**

The coordinator initially reported *"there is no water shader"* after grepping a filename and not
opening it. **Wrong.** `src/components/LafayettePark.jsx:471-575` is a real one, and you should read
it before anything else:

```js
const mat = new THREE.MeshStandardMaterial({
  color:'#1a4a5a', transparent:true, opacity:0.78, depthWrite:false,
  roughness:0.15, metalness:0.35, side:THREE.DoubleSide })
mat.onBeforeCompile = (shader) => { shader.uniforms.uTime; shader.uniforms.uSunAltitude; … }
```
It carries **three-octave FBM** (`wp*0.12`, `*0.3`, `*1.2`), a **circular ripple**
(`sin(dist*0.4 - uTime*1.5)`), **refraction distortion**, **caustics**, **specular crests** and a
**full time-of-day ramp** down to a separate `nightWater` indigo. ⭐ It is not a placeholder. **Do not
start over. Lift and extend.**

### ⭐⭐ AND THE FINDING THAT MAKES THE SSS ASK CHEAP: THE DEPTH RAMP ALREADY EXISTS
`:551-556`:
```glsl
vec3 wDeep    = vec3(0.06,0.18,0.25);   // dark teal depths
vec3 wMid     = vec3(0.10,0.28,0.32);
vec3 wShallow = vec3(0.14,0.38,0.38);   // lighter edges
vec3 waterCol = mix(wDeep, wMid, smoothstep(0.3,0.55, ripple));
waterCol      = mix(waterCol, wShallow, smoothstep(0.5,0.7, refractedNoise));
```
⛔⛔ **THE DEEP→MID→SHALLOW RAMP IS DRIVEN BY RIPPLE NOISE, NOT BY DEPTH.** On a pond that reads fine
— it is a texture. ⭐ **On a lake it is the whole ballgame, and the structure Jacob is asking for is
ALREADY THERE AND FED THE WRONG INPUT.** The subsurface-scattering work is substantially *"give this
ramp a real depth signal"*, not *"write a new model."* **Start there.**

## 4. THE THREE GAPS, in the order they bite

### ① IT IS WELDED TO THE MOULD
It lives inside `LafayettePark.jsx`, whose header says *"LafayettePark is LS-specific landmark
RENDER"*, and is built from `src/data/lafayette-square/park_water.json` — a **static name-import**.
⇒ **huron's Lake Erie cannot reach it.** Same shape as the Gateway Arch: the good thing exists and is
bolted to LS. ▶ Extract to a kit material beside `grassMaterial.js`, fed by LU class, the way grass is.

### ② IT IS POND-SCALED AND WILL NOT FAIL LOUDLY
Those FBM frequencies and `sin(dist*0.4 …)` are **hardcoded world-space constants tuned to a pond.**
Measured, huron: **1 water feature · 1,899 ring points · 40.11 km² · 101.9% OF THE DISC** (LS 0.00,
altadena 0.00 — ⚠️ **every town we have is 0% water or effectively all of it; there is no middle
case, and LS's is the pond**).
⇒ At `wp*0.12` on a 40 km² surface the first octave is invisible noise and the circular term is a
single wave crossing kilometres. ⛔ **It will not error. It will look like flat plastic** — the worst
outcome, and the one nothing in the build will catch.
▶ **Drive the frequencies off the feature's own extent**, not constants. ⭐ **This step is not
optional and it is not cosmetic: it is what makes step ③ visible at all.**

### ③ THE PHYSICS IS REFLECTIVE, AND THE ASK IS TRANSMISSIVE
`metalness:0.35, roughness:0.15` models **a mirror**. Subsurface scattering is the other end — light
entering the medium, depth-dependent colour, turbidity, shoreline falloff. ⭐ **That is what makes
shallow water read as WATER rather than as a shiny plane**, and on huron it is where the leverage is:
**`natural:sand` 61 and `natural:beach` 14** — the sandy shallows going green-gold against slate
depths is the shot that carries the town.

## 5. ⛔⛔ THE GATING MEASUREMENT — DO THIS BEFORE YOU DESIGN ANYTHING

**SSS needs a depth signal and I have established that NO BATHYMETRY EXISTS ANYWHERE IN THE
PIPELINE.** Grep is clean; the only hit is a mention in `ARCHITECTURE.md`.

⭐ **The computable proxy is DISTANCE-TO-SHORE**, and huron's lake ring has **1,899 points** to build
it from. ▶ **Establish, first, before any shader work:**
1. Can a signed distance-to-shore be produced per water feature at bake time, as a texture or a
   vertex attribute? At what cost on a 1,899-point ring?
2. ⚠️ **huron's lake is a CLIPPED multipolygon** — `fetch.js` says so in terms: a ring whose members
   were scoped away at the envelope **cannot close**, and it is marked `clipped` rather than closed.
   ⛔ **So one "shore" of huron's lake is the FETCH ENVELOPE, not a shore.** A naive distance field
   will make the open edge read as shallow — **a beach in the middle of Lake Erie.** This is the
   single most likely way this brief ships something wrong, and it will look plausible.
3. If distance-to-shore is not producible, **say so and stop** — the ramp keeps its noise input and
   §4① and §4② still deliver a lake that is not plastic. ⭐ **That is a real, shippable outcome; do
   not treat it as failure.**

## 6. ✅ ANSWERED 2026-09-20 — AND THE REAL GAP IS NOT VOCABULARY, IT IS **PRODUCER COVERAGE**

> **This section originally said `natural:water` has no LU class and asked whether it needs one. Lex
> (BRIEF-lu-vocabulary) answered it and found something bigger while doing so.**

**① THE LU QUESTION IS CLOSED: `natural:water` does NOT need an LU class, and giving it one would be
the bug.** It already has a producer — `derive.js`'s `waterFeats` ← `mintProtopolygon`'s `waterRings`
← the coast/relation path → `layers.water`. ⭐ **Both renderers skip `natural=water` DELIBERATELY and
route to it** (`bake-ground.js`'s `NATURAL_KEYS` comment; `MapLayers.jsx`'s `landscapeByKind`). It is
now declared `none` in `OSM_LU_DECLARED` with that reason. ⛔ **Do not add an LU class for water. A
second producer is what this project has too many of already.**

### ⛔⛔ ② AND THE ACTUAL GAP, FROM THE POUR'S OWN OUTPUT — NOT FROM READING CODE
huron's re-pour printed, verbatim:
> *"⚠️ 40 water bodies lie wholly inside the disc — **a pond is not a coast, not applied**"*
> *"15 closed water bodies cross the rim but are held WHOLE by the fetch — not applied"*

⇒ ⭐⭐ **THE WATER PRODUCER REACHES THE COAST AND NOT INLAND PONDS. AN INLAND POND IS DRAWN BY NOTHING
AT ALL.** On huron that is **55 water bodies** the pipeline acquired, classified, and then did not
draw.

⛔ **THIS REPLACES §6's PREREQUISITE AND IT CHANGES WHAT THIS BRIEF IS.** The shader work in §3–§5
assumes water arrives and needs a better material. For **the coast, that is true** — huron's lake is
drawn. For **55 inland bodies it is false**: there is no geometry to shade.
▶ **SO §5's MEASUREMENT GAINS A PRIOR STEP:** before the depth signal, establish **which water this
town actually draws.** A beautiful lake shader that leaves 40 ponds invisible is a worse outcome than
today, because the lake will look finished.
⚠️ **And it is a PRODUCER question, not a shader one** — possibly `derive.js`, possibly the fetch's
relation handling. ⛔ **Establish whether it is in this brief's bounds before you touch it, and come
back if it is not.** It may want its own dispatch.
⭐ Note the irony and do not repeat it: this was found **in the pour's printed output**, by someone
running it for another reason — not by reading the code. The producer says what it is not doing,
every run, and nobody had read it.

## 6b. (superseded — retained for provenance) THE ORIGINAL PREREQUISITE

`derive.js`'s `OSM_TO_LU` has **no entry for `natural:water`** — 157 features across four towns.
⇒ **There is no LU class for a water material to attach to**, the way grass attaches to
`park`/`residential`/`recreation`. ▶ `BRIEF-lu-vocabulary.md` is that work and it explicitly asks
whether water needs an LU class or is correctly drawn by another path. ⛔ **Establish which before
you wire anything** — if water is drawn by its own path today, attaching to LU would be a second
producer, and this project already has too many.

## 6c. ⛔⛔ THIRD CORRECTION — `bake-ground` SKIPS WATER ENTIRELY, BY DESIGN, FOR AN LS REASON

`cartograph/bake-ground.js:825-826`, verbatim:
```js
// natural subtypes — water is owned by park_water.json, skip it here.
const NATURAL_KEYS = new Set(['wood', 'scrub', 'tree_row'])
```
And `:788` says what owns it: `src/data/<scene>/park_water.json`.
⇒ ⭐⭐ **WATER IS MODELLED AS A PARK FEATURE, NOT AS TERRAIN.** LS's water IS a park pond, so that was
true for LS and is false for a town whose water is a Great Lake. **huron has no `park_water.json` and
therefore no water in the Slab and no path to get it there.**

**MEASURED on the completed huron slab, 2026-09-20:** `ground.json` carries **34 groups** — 11 face,
23 mat, including the new `agricultural` and `cemetery` — and ⛔ **no `water` group of any kind.**

⇒ **THIS IS THE THIRD LAYER OF ONE GAP**, and none of the three is a shader problem:
| # | layer | finding |
|---|---|---|
| ① | LU vocabulary | `natural:water` needs NO LU class — it has a producer, a second would be the bug ✅ correct |
| ② | producer coverage | reaches the COAST, not inland ponds — **40 bodies on huron, drawn by nothing** |
| ③ | **the ground bake** | **skips water outright**, because an LS-shaped file owns it |
⛔ **§3–§5 of this brief assume water arrives and wants a better material. For huron it never arrives.**

## 6d. ⭐⭐ WATER IS A DATUM, NOT A DRAPED SURFACE — and this corrects the coordinator, not the code

> **Jacob, 2026-09-20, correcting this seat mid-diagnosis: *"But it makes sense that water would be at 0."***

He is right, and the measurement proves it more neatly than the argument: **huron's `terrain.json`
records `baseElev = 173.24 m`, and Lake Erie's surface is ~173.5 m.** `bake-terrain` normalizes to
local-min = 0 — ⭐ **and on a lakeshore town the local minimum IS THE LAKE.**

⇒ **Water at y = 0 is not an object awaiting a lift. It is the datum everything else is measured from.**
| population | how it meets the ground | |
|---|---|---|
| buildings | **seated** per building — `centroidY` sampled at the footprint | ✓ |
| paths · stripes · curbs | **draped** per vertex | ✓ |
| **water** | ⛔ **NEITHER. A LEVEL SURFACE at one elevation, everywhere.** | **Lake Erie does not follow the ground; the ground rises out of it.** |

⛔ **The coordinator was about to write "water must be seated like the buildings." That would have
been wrong and it would have produced a lake that undulates.** Recorded because the next reader will
have the same instinct — everything else on the surface needed lifting that day, and water did not.

### ⭐⭐⭐ AND IT HANDS §5 ITS SHORELINE FOR FREE — BUT NOT ITS DEPTH
**THE WATERLINE IS WHERE THE TERRAIN CROSSES y = 0.** Not a polygon to fetch, not a ring to walk —
a contour of a field we already bake. ⇒ §5's *"can a signed distance-to-shore be produced"* has a
better answer than the 1,899-point ring: **the shore is a level-set of the heightfield**, and it is
correct even where the OSM ring is clipped by the fetch envelope. ⭐ **That also disposes of §5's
worst trap — "a beach in the middle of Lake Erie" — because the envelope edge is not a zero crossing.**

⚠️ **BUT DEPTH IS STILL NOT AVAILABLE, AND NOW WE KNOW WHY.** Measured: only **16.3%** of huron's
2,064,969 terrain samples lie within 0.5 m of zero, against a lake that is **35.5% of the disc.**
⇒ **The USGS DEM CLAMPS the water body rather than sounding it. There is no bathymetry in the source.**
⭐ So the honest split, and it should shape the whole build:
- **shoreline falloff — AVAILABLE AND FREE.** Build it.
- **true depth-driven subsurface scattering — NOT AVAILABLE.** Any depth ramp would be **fabricated
  from distance-from-shore**, which is a LOOK, not a measurement. ⛔ **Fabricate it if Jacob wants the
  effect — but say in the code that it is fabricated.** A plausible depth that is not depth is this
  project's signature defect.

## 6e. ⛔⛔ WATER IS SIXTEEN TAGS AND FOUR KINDS OF THING — **ANTICIPATE THEM, DO NOT BUILD THEM**

> *Jacob, 2026-09-20: "there are numerous water types and we should anticipate them all."*

**Measured across huron · lafayette-square · hipointe-demun · altadena** (▶ re-derive, do not quote):
```
waterway=stream   200    natural=water    157    water=pond      71    waterway=drain  32
natural=wetland    26    waterway=ditch    20    water=basin     19    waterway=canal   9
waterway=dam        8    water=stream       5    water=reservoir  5    waterway=river   5
waterway=weir       5    water=river        3    water=lake       3    waterway=flowline 2
```
⇒ **SIXTEEN TAGS. ONE PRODUCER** (`natural=water`, §6①). And they are **four different kinds of
thing**, which is the part that matters for anything you design:

| kind | tags | count | why it is different |
|---|---|---|---|
| **POLYGON body** | `natural=water` + a `water=*` subtype | 157 | ⭐ the subtype is **thrown away today** — a pond is not a lake is not a settling basin, and **71 of huron's are ponds** |
| ⭐⭐ **LINEAR waterway** | stream · river · canal · ditch · drain · flowline | **268** | **the LARGEST population, and not a polygon at all.** A ribbon with a direction and a width, nearer to a street than to a lake |
| **STRUCTURE** | dam · weir | 13 | built objects in water, like the revetment — geometry, not surface |
| **WETLAND** | `natural=wetland` | 26 | neither water nor land; a material question of its own |

### ⛔ WHAT THIS DOES AND DOES NOT CHANGE FOR THIS BRIEF
⭐ **It does NOT expand your build.** Glint on huron's lake is still the job, and the lake is a
polygon body that is already drawn. ▶ **Ship that.**
⛔⛔ **BUT DO NOT DESIGN AS THOUGH WATER IS ONE THING.** A lake shader that assumes a large flat
polygon will be wrong for a stream, and **the next town is a river town** — 200 streams are already
on disk in the four towns we have. ⭐ **A flowing ribbon wants direction and speed; a lake wants
wind fetch and a horizon.** They are different shaders, not one shader with a parameter.
▶ **So: name the four kinds in whatever you write, say which one you built for, and leave the
attachment point keyed by kind** — the way `GRASS_FACES` keys a treatment by class id.
⚠️ **And per the authoring-model gate at the end of this brief: state the parameters a LINEAR water
would need** (direction, speed, width) **even though you are not building it.** That is what stops
the river town discovering the model cannot hold it.

⚠️ **THE SUBTYPE IS THE CHEAPEST WIN HERE AND IT IS NOT YOURS.** `water=pond|lake|reservoir|basin`
already rides on the 157 polygons we DO draw and is discarded before it reaches anything.
⛔ Surface it; do not wire it. It belongs with the LU/vocabulary work, not with a shader.

## 7. ⛔ Can the instrument SEE the change?

⚠️⚠️ **MOSTLY NOT, AND SAY SO RATHER THAN FAKING IT.** This is a LOOK. There is no assertion that
distinguishes beautiful water from plastic water, and ⛔ **a check that claims to would be worse than
none.** What IS checkable, and should be:
- ⭐ **that the frequencies are DERIVED from feature extent, not constant** — mutation: hardcode one
  back and prove it fails. That pins §4②, the step that silently degrades.
- that **no scene-name literal** appears in the extracted material (the §4① regression).
- that every water feature resolves to the kit material, in every town.

**Eye-gate surface:** Jacob's eye, **huron's lake, at three times of day** — ⛔ the time-of-day ramp
is half this shader and a single daytime screenshot tests none of it. ⭐ **And LS's pond UNCHANGED is
the control**: if the pond moves, the extraction was not faithful.

## 8. Write/commit bounds

**In bounds:** a new kit water material (beside `grassMaterial.js`) · the `LafayettePark.jsx`
extraction · its wiring in `BakedGround.jsx` · bake-side depth-signal work if §5 says it is possible.
⛔ **OUT:** fields/crops (its own brief) · the LU vocabulary itself (`BRIEF-lu-vocabulary.md`) ·
`GatewayArch.jsx` · the fade/boundary arc.
⛔ **LS's pond must come out BYTE-IDENTICAL in appearance.** It is the control and it is the one
surface an operator already knows. If the extraction changes it, the extraction is wrong.
⛔ **SURFACE SCOPE DRIFT, DO NOT ABSORB IT.** ⚠️ This brief's specific drift risk is **rewriting
rather than lifting** — a new shader will feel cleaner than an extraction and it throws away a
working time-of-day ramp, caustics and refraction that nobody will rebuild as well under deadline.

---

## What "done" looks like
1. The pond shader is **a kit material**, no scene literal, and **LS's pond is unchanged.**
2. huron's lake renders with **extent-derived** frequencies — not plastic at 40 km².
3. The depth question is **answered either way, out loud**, and the clipped-envelope trap is handled
   or named.
4. Jacob has seen huron's lake **at three times of day.**

---

> # ⭐⭐ THE GATE THIS BRIEF IS ACTUALLY JUDGED ON *(Jacob, 2026-09-20 — applied to every open brief)*
>
> ### ⛔ "DOES IT LOOK GOOD" IS NOT AN EYE-GATE. IT IS AN AUTHORING SESSION, AND IT IS NOT YOURS.
> *"Until I am in the authoring moments of the camera, I'm just looking at elements. I think we spend
> a lot of time worrying about the moment an operator sees the map for the first time being ugly or
> random, and I think that's a silly concern."*
>
> ⭐ **A first pour being ugly is FINE AND EXPECTED.** *"Even grass with houses on it looks beautiful
> and gets the project advancing."* ⇒ **Do not hedge against an aesthetic judgment. Do not tune.**
> ▶ **THE GATE IS: is the element PRESENT and CORRECT?** Does it arrive · is it seated · does the
> class exist · did the count change. Measurable, falsifiable, and none of it about composition.
>
> ⛔ **THE ONE EXCEPTION, AND IT IS THE REAL RISK:** where a WRONG element looks PLAUSIBLE — a
> cornfield rendering as lawn, a pond rendering as nothing, buildings buried under terrain. ⭐ That
> is not an aesthetic worry, it is *"the map is lying and nothing says so."* **Protect that. Ignore
> the rest.**
>
> ### ⭐⭐ AND THE QUESTION THAT REPLACES IT — ASK IT EXPLICITLY, IN WRITING
> *"When I decide that cornfields are a priority, have we paved the way for that or did we screw
> ourselves? We have color pickers today, but 'color' is hardly what row crops are made of."*
>
> **MEASURED 2026-09-20 — what a land-use class can carry TODAY:**
> ```
> face group in the slab :  kind · id · color · renderOrder · polygonOffsetUnits
> authorable per class   :  layerColors · luColors          ← COLOUR, and nothing else
>                           materialPhysics · materialColors ← present, EMPTY, and PBR-shaped
> ```
> ⇒ ✅ **THE RENDER SIDE IS NOT FORECLOSED.** `BakedGround.jsx`'s `GRASS_FACES` selects a whole
> shader by class id, so attaching a generator to a class is **purely additive.** The road is paved.
> ⇒ ⛔ **THE AUTHORING SIDE HAS NO SHAPE FOR IT.** There is nowhere to put row bearing, wave
> direction or stone grading, and `materialPhysics` is the WRONG SHAPE, not merely empty — a material
> says *how a surface answers light*; a generator says *what structures exist and how they are laid out.*
>
> ### ⛔⛔ SO THIS BRIEF OWES ONE THING BEFORE IT BUILDS ANYTHING
> ▶ **STATE THE PARAMETERS THIS FEATURE NEEDS AUTHORED** — name them, with units — **and say whether
> today's model can hold them.** ⚠️ **THREE OPEN BRIEFS HIT THIS SAME WALL** (`BRIEF-field-shader`
> rows/bearing/season · `BRIEF-water-shader` wave scale/turbidity/shoreline band ·
> `BRIEF-boulder-revetment` stone grading/slope/overlap).
> ⛔ **DO NOT INVENT A PARAMETER HOME. THREE BRIEFS EACH INVENTING ONE IS THE ACTUAL WAY WE SCREW
> OURSELVES** — three incompatible authoring models and no panel that can hold them. ▶ **Propose the
> shape, bring it to Boz, and it gets decided ONCE for all three.**
