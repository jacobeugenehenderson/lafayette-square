<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-20
evict-when: RULING: Jacob's eye on huron's lakefront — does the revetment read as stacked rock from the water and from the street.
-->

# BRIEF — HURON'S LAKEFRONT IS A BOULDER WALL AND WE DRAW NOTHING

*Written 2026-09-20 by the coordinator seat.*

> ### ⭐ THE ASK — Jacob, 2026-09-20
> *"Huron has a built **rock** (boulder) retaining wall for a lot of it. We should procedurally
> build that."*

> ### ⛔⛔ BLOCKED — TWICE, AND BOTH BLOCKERS ARE UPSTREAM. DO NOT START HERE.
> **This brief cannot begin until `cartograph/_archive/BRIEF-lu-vocabulary-2026-09-20.md` lands.** The geometry is the last third of
> the job and the first two thirds are somebody else's.

---

## 1. You are the dispatched agent. Name yourself — one word, yours.
## 2. Agent: **FRESH.** ⚠️ Sibling briefs: `cartograph/_archive/BRIEF-lu-vocabulary-2026-09-20.md` (blocks you), `BRIEF-water-shader.md` (adjacent — the revetment is the water's edge; coordinate through Boz if both run).

## 3. ⛔ WHAT IS ACTUALLY THERE — measured 2026-09-20, huron's raw

```
man_made:pier            215        natural:reef             4
man_made:breakwater       22        barrier=retaining_wall   6
man_made:groyne            1        barrier=wall            10
```
⭐ **That is a serious working waterfront, not a decorative edge** — and it is the one thing huron has
that no other town in the kit has. **It is also, right now, entirely invisible.**

> ## ⭐⭐ ADDED 2026-09-20 — TWO THINGS THAT CHANGE THIS BRIEF'S PRIORITY AND ITS FIRST STEP
>
> ### ⚠️ ① THE CODE FIX IS LANDED BUT HURON HAS NOT FELT IT — RE-FETCH FIRST
> `man_made` is in `tagPriority` now, but **bucketing happens AT FETCH TIME.** Measured just now:
> huron's `raw/osm.json` still carries **246 features in `other[]` and an EMPTY `man_made` bucket.**
> ▶ **Your first step is a re-fetch, not a code change:** `node cartograph/fetch.js --scene=huron`
> ✅ Safe — huron has no authored `design.json` and its `raw/osm.json` is git-tracked; it has been
> re-fetched twice today. ⛔ **Confirm `ground.man_made` is non-empty before going further**, or you
> will build against features that are still unreachable.
>
> ### ⭐⭐ ② THE REVETMENT IS THE SHORE EDGE THE ELEVATION DATA CANNOT SEE
> *Jacob: "when you walk out Francesca's back door when you get to the big rock wall it's a drop from
> her yard to the water."* **15–20 ft**, held by the wall.
>
> **MEASURED — huron's terrain, acquired and baked today (USGS 3DEP `n42w083`, 5 m grid, ~10 m
> source), all 2,064,969 samples:**
> ```
> waterline samples with a >1 m rise adjacent :  0
> steepest single-step rise from water        :  0.0 m
> ```
> ⇒ ⛔ **A near-vertical 15–20 ft bank is SMEARED INTO A GENTLE RAMP by the sampling. The real shore
> edge is absent from the heightfield and NO RE-BAKE RECOVERS IT.**
>
> ⇒ ⭐⭐ **THE REVETMENT IS NOT DECORATION. IT IS THE ONLY THING THAT CAN PUT THE SHORE EDGE BACK.**
> Building it restores a 15–20 ft feature the elevation source physically cannot carry. ⭐ It also
> explains Jacob's earlier ruling — *"over water the horizon should barely fade; water is usually a
> pretty hard line"* — **because here the water meets a WALL, not a beach.**
> ⚠️ **And it corrects `BRIEF-water-shader` §6d:** the waterline as *"where terrain crosses y = 0"*
> is right about **WHERE** the shore is and says nothing about **WHAT IT LOOKS LIKE** — the crossing
> it finds is the smeared ramp, not the wall.

## 4. ⛔⛔ THE TWO BLOCKERS, IN ORDER — NEITHER IS GEOMETRY

### ① ✅ `man_made` NOW BUCKETS — fixed 2026-09-20, and it was worse than "unbucketed"
`man_made` was in `fetch.js`'s `HEAVY_WAYS` and not in `tagPriority`, so every feature fell to
`ground.other[]` — the `railway` bug, third instance. ⭐ **And `ground.other[]` has ZERO consumers
anywhere in the kit**, so those features were not merely mis-filed, they were **unreachable**.
`man_made` is now APPENDED to `tagPriority` (never slotted — order decides the bucket), so a pour
writes `ground.man_made` and `breakwater`, `groyne` and `pier` are addressable.
⛔ **A RE-FETCH IS NOT NEEDED BUT A RE-POUR IS** — the tag was always carried on the feature; only
the bucket is new. ▶ `node checks/claims-every-lu-tag-has-a-home.mjs` asserts HEAVY ⊆ tagPriority, so
a fourth instance goes red by name.
⚠️ **Their DESTINATION is still unbuilt** — declared `map-layer (STRUCTURE)` in `OSM_LU_DECLARED`,
owned by `docs/briefs/BRIEF-lu-map-layers.md`. That was
`cartograph/_archive/BRIEF-lu-vocabulary-2026-09-20.md`'s second half, not yours.

### ② AND THEN THEY NEED A HOME THAT IS NOT A LAND USE
⚠️ **A breakwater is not a land-use FACE.** ⛔ Do not let anyone map it into `OSM_TO_LU` — it is a
**linear structure**, and painting a block face the colour of *breakwater* is the error the LU brief
already warns about. It wants a **layer** (`Panel.jsx`'s defs) and a **renderer**, the way `barrier`
has one today.
⭐ **`barrier=retaining_wall` ALREADY RENDERS** — `MapLayers.jsx:743` clips barriers and draws them as
lines. **That is your existing foothold and huron has 6 of them.** ▶ **Establish first whether
breakwater/groyne should join the `barrier` layer or get their own.** They behave like barriers
(linear, clipped, at grade) and differ in that they are *in the water*.

## 5. ⭐ ONLY THE THIRD PART IS NEW — AND THE PRECEDENTS EXIST

▶ **Extend, do not invent.** Two precedents, and read both before designing:
- **Placement along a way:** `cartograph/bake-lamps.js` derives lamp positions along streets at bake
  time and writes `baked/<look>/lamps.json`. ⭐ **A revetment is the same problem** — walk a polyline,
  emit transforms. **Same bake-time shape, same artifact pattern.**
- **Instanced rendering:** `src/components/StreetLights.jsx` and `InstancedTrees.jsx` are the
  `InstancedMesh` precedents in the player. ⛔ **Do not write a third instancing path.**

### WHAT "PROCEDURAL BOULDER" ACTUALLY MEANS HERE — and the trap
⭐ **A revetment is not a fence and not a wall: it is a SLOPED HEAP of graded stone.** The perceptual
signature is **size grading** (armour stone outward, smaller behind), **random rotation**, and
**overlap** — boulders resting on each other, not spaced like fence posts.
⛔⛔ **THE TRAP IS EVENLY-SPACED IDENTICAL ROCKS.** That is what a lamp-placement walk gives you for
free, and it reads as a **beaded necklace** — instantly, and worse than a plain grey line. ⭐ Jitter,
rotation, scale variance and deliberate overlap are not polish here; **they are the feature.**
⚠️ **And it has a CROSS-SECTION, not just a line**: a revetment has a slope from waterline to crest.
▶ **Establish whether a width/slope can be derived** — from the way's own tags, from the gap between
the shoreline and the first land feature, or authored. ⛔ **If it cannot, say so and build the crest
line only** rather than inventing a slope the data does not support.

## 6. ⚠️ WHAT ONLY JACOB CAN DECIDE
- **Is this 3D, 2D, or both?** The Designer draws barriers as **lines**; a boulder heap is a 3D read.
  ⭐ It may be a line in the Designer and instanced geometry in the Slab — **two treatments of one
  feature, which is normal here** (trees are dots in the Designer and chassis in the player).
- **Where do the rocks come from?** ⛔ **THIS IS THE COST QUESTION AND IT IS NOT YOURS.** A handful of
  authored boulder meshes, or purely procedural? ⚠️ `ARCHITECTURE`'s tree doctrine is *"you pick from
  ~241; you never grow one"* — ⭐ **if that reasoning holds for rocks, this is an ASSET acquisition
  brief and not a geometry one, and that changes its owner.** Ask before assuming procedural.
- **Does `pier` (215!) get built too?** ⭐ It is the largest population by far and it is a *different*
  structure — decking on posts, not stacked stone. ⛔ Almost certainly its own brief. **Do not
  absorb it.**

## 7. ⛔ Can the instrument SEE the change?
- ✅ **Checkable and worth pinning:** every `man_made:breakwater`/`groyne` and `barrier:retaining_wall`
  on disk resolves to a placed structure — ⭐ **the count on disk equals the count placed, per town.**
  That kills the silent-drop class, and mutation-test it by removing one from the source.
- ✅ **Placement variance is checkable**, and it is the one that matters: assert that rotation and
  scale are **not constant** across instances. ⭐ That pins §5's beaded-necklace failure, which is
  the way this ships looking wrong.
- ⛔ **"Does it look like rock" is not checkable.** Say so; do not write a check that pretends.

**Eye-gate surface:** huron's lakefront, ⛔ **from the water AND from the street** — a revetment seen
only from above is a grey line and tests nothing. ⚠️ **And no other town has one**, so there is no
control and no regression risk — ⭐ which also means **nothing will catch a mistake except the eye.**

## 8. Write/commit bounds
**In bounds:** a bake-time placement step beside `bake-lamps.js` · an instanced renderer following
`StreetLights.jsx` · its layer row in `Panel.jsx` · the new checks.
⛔ **OUT:** `tagPriority`/`OSM_TO_LU` (**`cartograph/_archive/BRIEF-lu-vocabulary-2026-09-20.md`** — and it blocks you) · the water
shader · `pier` (§6) · `man_made:bridge` (structural, `skeleton.js` territory).
⛔ **A re-pour and a re-bake are both required** to see anything. huron is safe for both; ⛔ **no
other town is — and no other town needs it.**
⛔ **SURFACE SCOPE DRIFT, DO NOT ABSORB IT.** ⚠️ Specific risk: **215 piers sitting right next to
your 22 breakwaters.** They are a different structure and a bigger population. **Ask.**

---

## What "done" looks like
1. huron's 22 breakwaters, 1 groyne and 6 retaining walls **exist as placed structures**, counted.
2. They read as **stacked graded stone, not a bead chain** — variance proven by a check.
3. The cross-section question is **answered either way, out loud.**
4. Jacob has seen the lakefront **from the water and from the street.**
5. `pier` is **asked about, not absorbed.**

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
