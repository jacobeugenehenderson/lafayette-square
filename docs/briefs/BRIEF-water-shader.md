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
