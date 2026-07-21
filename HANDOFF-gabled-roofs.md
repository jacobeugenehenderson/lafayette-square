# HANDOFF — gabled roofs (the missing pitched form)

**Agent: FRESH.** The diagnosis below was measured on 2026-07-21 and is complete; a fresh agent reads it, verifies the counts, and builds. No prior session context is load-bearing.

> ⛔ **Run the `CLAUDE.md` routing gate first** — `ORIENTATION.md` → `README §⭐ START HERE` → the topic canon. At minimum read **`cartograph/BAKE.md`** (the bake chain) and **`SLAB-CONTRACT.md §3`** (what the slab carries), plus `INTAKE-CATALOGUE §5.2` (the surveyed-roof finding this completes).

---

## 1. The finding

Jacob, previewing Łódź: *"I am also not seeing the augmented historic rooflines… I never ended up seeing any in this neighborhood so I can't even really visually gate."*

He is right, and it is not a rendering fault. **The roof work landed correctly and has almost nothing to act on.**

`36b04c2d` established that both Polish hoods carry surveyed `roof:shape` in OSM we already fetched, and `35d6d9da` wired the precedence chain (override → OSM tag → heuristic) and carried the tags through the adapter. But measured against what the renderer can actually build:

| `roof:shape` | ksi-y-m-yn | centrum | outcome |
|---|---|---|---|
| `flat` | 76 | 99 | → flat — **already the default; no visual change** |
| **`gabled`** | **20** | **41** | falls through — **the renderer cannot build it** |
| `many` | 15 | 19 | falls through → flat |
| `skillion` | 13 | 15 | falls through → flat |
| `hipped` / `half-hipped` | 2 | 4 | → hip ✅ |
| `mansard` | 0 | 3 | → mansard ✅ |
| `pyramidal` | 0 | 4 | falls through → flat |
| `saltbox` · `gambrel` · `gabled_row` | 3 | 0 | falls through → flat |

**Net: 2 buildings changed in Księży Młyn, 7 in Centrum** — out of 1,640 and 2,954. Correctly invisible.

### Two causes

1. **`gabled` is not in the renderer's vocabulary.** `buildingGeometry` (`cartograph/bake-buildings.js:503`) builds exactly three forms — flat, hip, mansard. Gabled is the commonest pitched roof in European housing: **61 buildings across the two hoods**, every one silently flattened.
2. **The heuristic cannot fire on a poured scene.** `classifyRoofFor` (`bake-buildings.js:~243`) opens `if (!year) return 'flat'`, and `year_built` comes from an assessor — which Poland does not provide. So every *untagged* building is flat by construction, and the fallback the tag falls through *to* is also flat.

⭐ **Do not "fix" this by coercing.** Mapping `gabled → hip` would be the wrong shape on 61 buildings and is explicitly ruled out (`INTAKE-CATALOGUE §5.2`: *map the vocabulary and fall through on anything unrecognised; do not silently coerce*). The fix is to **teach the geometry a gable**, not to widen the lookup table.

## 2. The work

### 2.1 Build the gable
`buildingGeometry` (`bake-buildings.js:503`) already has the shape of the answer — see `buildMansardRoof` (`:319`) and the hip branch. A gable is a **ridge line** rather than mansard's inset cap or hip's apex: pick the footprint's dominant axis, run the ridge along it, and slope two faces down to the eaves.

Existing degeneracy guards to imitate (`:586-588`):
```js
if (useShape === 'mansard' && !isConvex(footprint)) useShape = 'flat'
if (useShape === 'hip' && footprint.length > 8)    useShape = 'flat'
```
A gable wants its own: a footprint with no clear dominant axis, or too many sides, should fall back to flat rather than produce a mess. **Follow the house pattern — degrade to flat, loudly in the count, never to a wrong shape.**

Then add `case 'gabled': case 'gabled_row': return 'gable'` to `mapOsmRoofShape` (`:120`). Consider `saltbox` and `gambrel` only if the geometry genuinely covers them; otherwise leave them falling through, which is honest.

### 2.2 ⚠️ THE TRAP — the runtime mirror must move in lockstep
`getRoofPeakHeightFor` (`bake-buildings.js:257`) carries this comment:

> *"Mirrors LafayetteScene.getRoofPeakHeight EXACTLY — this is the rooftop term the runtime neon baseY uses (SceneNeon.jsx:124). **It must agree to the centimetre or neon tubes float above / sink below the baked roof.**"*

So a new roof shape is **two implementations, not one**:
- `cartograph/bake-buildings.js` — `classifyRoofFor` · `getRoofPeakHeightFor` · `buildingGeometry`
- `src/components/LafayetteScene.jsx` — `classifyRoof` (`:151`) · `getRoofPeakHeight` (`:366`) · the roof builder (`:213`) · `roofTopRing` (`:344-359`)

`roofTopRing` matters specifically: it documents which ring the neon rides for each shape (mansard's inset cap vs the footprint for flat/hip). **A gable's neon ring is a decision, not a derivation — make it explicitly and write it in that comment block.**

⭐ Two mirrored implementations of one fact is itself the standing defect (`project_the_palimpsest_code_path_multiplicity`). If unifying them is tractable, that is the better fix and worth flagging to Jacob before building twice.

### 2.3 Re-bake and gate on the eye
```
CARTOGRAPH_SCENE=centrum node cartograph/bake-buildings.js --look=centrum --scene=centrum
CARTOGRAPH_SCENE=ksi-y-m-yn node cartograph/bake-buildings.js --look=ksi-y-m-yn --scene=ksi-y-m-yn
```
⛔ **The eye is the gate, not the count** (`feedback_proxy_render_is_not_the_operator_eye`). "41 buildings now report gable" is a proxy; Jacob looking at Centrum in Preview is the test. Note that until this lands he has *never seen a non-flat roof in these hoods*, so there is no established baseline — say so rather than implying a regression check exists.

## 3. Definition of done

- `gabled` renders as a ridged roof in both Polish hoods, on the eye, in Preview.
- Baker and runtime agree to the centimetre — verify neon does not float or sink on a gabled building (`SceneNeon.jsx:124`).
- Unrecognised shapes still fall through to the heuristic; nothing is coerced.
- Counts logged for what fell back to flat and why, so the next unsupported form is visible instead of silent.

## 4. Adjacent, NOT in scope

- **A building glass shader** (Jacob, 2026-07-21: *"we are going to need to create a building glass shader"*). Its inputs already exist and are unused: `building:levels` on **4,361** buildings in ksi and `building:material` on **151** — storeys × facade is exactly what floor-banded window placement reads. Separate brief; do not fold it in.
- The `year_built` gap. Poland has no assessor, so the heuristic will stay inert on non-US pours regardless of this work. Worth a note in `INTAKE-CATALOGUE`, not a fix here.

---

*Written 2026-07-21 by Tally, from the diagnosis that followed `35d6d9da`. Counts measured against `cartograph/data/<scene>/raw/osm.json` on disk — re-verify before trusting; code drifts.*
