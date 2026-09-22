<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-20 · RE-SCOPED 2026-09-21 (the premise was measured false; see the banner)
evict-when: RULING: Jacob's eye on huron's lakefront — does the revetment read as stacked rock from the water and from the street.
-->

# BRIEF — HURON'S LAKEFRONT IS A BOULDER WALL AND WE DRAW NOTHING

*Written 2026-09-20 by the coordinator seat.*

> ### ⭐ THE ASK — Jacob, 2026-09-20
> *"Huron has a built **rock** (boulder) retaining wall for a lot of it. We should procedurally
> build that."*

> ### ✅ UNBLOCKED 2026-09-21 — the ground it stands on is now right
> This was blocked because the drawn lake sat below its own bed and **stone fitted to that shore would
> have inherited the offset as geometry**, which nobody reading a boulder later would recognise as a
> datum fault. ⭐ **Jacob saw it before any instrument did:** *"there are gashes in the seam which look
> like where our boulders will go."* They were at the shore, so they marked the right PLACE — but their
> size was the datum error, not a wall.
> ▶ `node checks/claims-a-level-body-has-one-surface.mjs` — **GREEN.** huron now bakes from 1 m lidar;
> the lake is one surface (IQR 0.000 m) and the mesh sits on it.
> ⛔ **Re-run that check before placing stone, on every town, every time** — it is this brief's §7
> precondition and it is cheap.

---

## 1. You are the dispatched agent. Name yourself — one word, yours.
## 2. Agent: **FRESH.** ⚠️ Siblings: `BRIEF-terrain-resolution.md` (the datum — ✅ landed, no longer blocks) ·
`BRIEF-lu-map-layers.md` (owns where a linear STRUCTURE lives) · `BRIEF-water-shader.md` (adjacent —
the revetment is the water's edge). ⭐ `BRIEF-lu-vocabulary` LANDED; it no longer blocks anything.

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
> `man_made` is in `tagPriority` now, but **bucketing happens AT FETCH TIME**, in `fetch.js`'s
> `bucket()` loop, and it writes the buckets into `raw/osm.json`. huron's still carries an empty
> `man_made` bucket with everything in `other[]`, which has zero consumers.
> ▶ **Your first step is a re-fetch:** `node cartograph/fetch.js --scene=huron`
> ✅ Safe — huron has no authored `design.json` and its `raw/osm.json` is git-tracked.
> ⛔ **Confirm `ground.man_made` is non-empty before going further.**
>
> ### ⭐⭐ ② RE-SCOPED 2026-09-21 — THE REVETMENT IS DECORATION AFTER ALL, AND THAT IS GOOD NEWS
> This brief claimed the shore edge was *"absent from the heightfield"* and that the revetment was
> **"the only thing that can put it back."** ⛔ **Both are false.** The bank is in the bake at close
> to full height; what is wrong is where the WATER sits.
> ▶ `node scratch/huron-shore-transect/bake-gradient.mjs` · excised text and the lesson:
> `cartograph/_archive/shore-wall-absent-premise-FALSE-2026-09-21.md`
>
> ⇒ ⭐ **So the revetment is `BRIEF-terrain-resolution`'s own other branch — *decorate an edge that
> exists*.** The stone no longer has to carry terrain shape, which was the one path on which this
> feature could have made the map lie. **Smaller job, safer job — once the datum is fixed.**

## 4. ⛔⛔ THE TWO BLOCKERS, IN ORDER — NEITHER IS GEOMETRY

### ① ✅ `man_made` NOW BUCKETS — fixed 2026-09-20, and it was worse than "unbucketed"
`man_made` was in `fetch.js`'s `HEAVY_WAYS` and not in `tagPriority`, so every feature fell to
`ground.other[]` — the `railway` bug, third instance. ⭐ **And `ground.other[]` has ZERO consumers
anywhere in the kit**, so those features were not merely mis-filed, they were **unreachable**.
`man_made` is now APPENDED to `tagPriority` (never slotted — order decides the bucket), so a pour
writes `ground.man_made` and `breakwater`, `groyne` and `pier` are addressable.
⛔ **A RE-FETCH *AND* A RE-POUR ARE BOTH NEEDED.** ⚠️ This line used to read *"a re-fetch is not
needed"* — **false, and it contradicted this brief's own §① two screens up.** `bucket()` runs inside
`fetch.js` and writes the buckets into `raw/osm.json`, so a re-pour re-reads `other[]` forever.
▶ `node checks/claims-every-lu-tag-has-a-home.mjs` asserts HEAVY ⊆ tagPriority, so a fourth instance
goes red by name.
⚠️ **Their DESTINATION is still unbuilt** — declared `map-layer (STRUCTURE)` in `OSM_LU_DECLARED`,
owned by `docs/briefs/BRIEF-lu-map-layers.md`. That was
`cartograph/_archive/BRIEF-lu-vocabulary-2026-09-20.md`'s second half, not yours.

### ② AND THEN THEY NEED A HOME THAT IS NOT A LAND USE
⚠️ **A breakwater is not a land-use FACE.** ⛔ Do not let anyone map it into `OSM_TO_LU` — it is a
**linear structure**, and painting a block face the colour of *breakwater* is the error the LU brief
already warns about. It wants a **layer** (`Panel.jsx`'s defs) and a **renderer**, the way `barrier`
has one today.
⭐ **`barrier=retaining_wall` ALREADY RENDERS** — `MapLayers.jsx`'s `barriersByKind` clips barriers and
draws them as lines (⛔ cite the symbol, not a line number; this one had already drifted). **That is your existing foothold and huron has 6 of them.** ▶ **Establish first whether
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
### ✅ ANSWERED 2026-09-21 — AND IT NEEDS NO AUTHORED NUMBER. ▶ `node scratch/huron-shore-transect/derivable.mjs`
Walking the slab's own shoreline arc, five of the six things the geometry needs are **read, not chosen**:
| what it needs | where it comes from |
|---|---|
| **footprint** | `shape.json`'s `__water__` runs — the shoreline, stroked as ink by `tileGround.js` (`WATER_EDGE_SKEL`), **already in the shipped slab** with a per-vertex `side` stamp |
| **crest height** | the terrain at the arc, minus the water plane — per vertex |
| **toe** | the water plane. Below it is invisible |
| **stone size** | scales with crest height: a low wall takes smaller rock |
| **rotation · packing · jitter** | position-seeded noise |
| **slope** | ⛔ **the one number, and it is PHYSICS** — see below |
⛔ **The bank cannot supply the slope, and this was measured, not assumed:** the ground landward of the
shore is nearly FLAT and then drops at the line. *That is the yard Jacob described — flat, then a drop to the
water — showing up in the data.* ⇒ The slope must come from **the angle of repose of dumped riprap** — a property of
STONE, not of Huron, so it travels to town #2 unchanged.
⭐ **Name it and source it in the code, with its unit.** It is a material constant, not an LS-sized one
(`CLAUDE.md` Class D: the tell is a constant with *no* unit, or a unit stable only because something
else is fixed). This one has a unit and its stability is physical.

## 6. ⚠️ WHAT ONLY JACOB CAN DECIDE — **TWO OF THESE ARE NOW RULED**

> ### ✅ RULED 2026-09-21, both by Jacob, in his words
> **① PROCEDURAL, not an asset library.** *"I have thought we'd do procedural boulders, as they're
> random and natural."* ⛔ So this is NOT an asset-acquisition brief and its owner does not change.
> The tree doctrine (*"you pick from ~241, you never grow one"*) is **not** extended to rock.
>
> **② NO AUTHORED PARAMETERS — DERIVE.** *"I am not eager to add more user controls, if a true
> procedural option is a good one."* ⭐ Measured the same day: a parameter-free revetment **works**
> (§5). ⛔ **Do not build a panel, a slider or a `design.json` key for this feature.**
> ⭐⭐ **AND THE OVERRIDE IS NOT LOST, it just is not new:** the shoreline is INK in ①, so an operator
> who wants the wall elsewhere **moves the shore** — the same gesture that moves any other shape.
> That satisfies *"the override is the product"* (`ORIENTATION`) without inventing a control.
> ⇒ ⚠️ **This answers the trailing gate for THIS brief, in the opposite direction from what it
> assumed.** Worth testing the same way on `BRIEF-field-shader` (row bearing may be the field
> polygon's principal axis) and `BRIEF-water-shader` (wave direction already comes from the weather
> poller) **before anyone builds a parameter home for three briefs that may need none.**

### Still open, and still his:
- **Is this 3D, 2D, or both?** The Designer draws barriers as **lines**; a boulder heap is a 3D read.
  ⭐ It may be a line in the Designer and instanced geometry in the Slab — **two treatments of one
  feature, which is normal here** (trees are dots in the Designer and chassis in the player).
- **⛔⛔ IS EVERY SHORELINE A WALL? — THE NEW OPEN QUESTION, and it is a PREDICATE, not a parameter.**
  On huron it is emphatically not: a third of the shore is `park` + `nature_reserve` sitting dead at
  the water, and there are beaches. ▶ `node scratch/huron-shore-transect/lu-and-osm.mjs`
  ⭐ **LU and OSM carry real signal and they AGREE with the ground** — where a structure is tagged the
  shore stands several times taller than where none is. ⚠️ **But neither is sufficient alone:**
  `natural=beach` measures *taller* than `barrier=retaining_wall`, so height cannot tell sand from
  stone; and the structure tags are silent on most of the shore, so the tag cannot carry it either.
  ▶ **The rule to ratify (all three reads are already on disk — no control needed):** soft LU/tag
  (`park`, `nature_reserve`, `beach`, `sand`, `wetland`) ⇒ **no stone** · a structure tag ⇒ stone ·
  otherwise stone where the measured wall clears the stone's own minimum size.
  ⛔ **And where reads ① and ② DISAGREE — a tagged retaining wall inside a nature reserve — it must
  PRINT, not pick a winner quietly.** Never happens on huron; will on town #2.
- **Does `pier` (215!) get built too?** ⭐ It is the largest population by far and it is a *different*
  structure — decking on posts, not stacked stone. ⛔ Almost certainly its own brief. **Do not
  absorb it.**

## 7. ⛔ Can the instrument SEE the change?
- ⛔⛔ **FIRST, THE PRECONDITION, AND IT IS RED TODAY:** `node checks/claims-a-level-body-has-one-surface.mjs`.
  ⭐ **Do not place stone while it fails** — the wall would be fitted to a mis-seated waterline and the
  error becomes geometry. The check says so itself, by name, when it fails.
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
⛔ **OUT:** `tagPriority`/`OSM_TO_LU` (LANDED — do not reopen) · **the terrain datum**
(`BRIEF-terrain-resolution` — it blocks you, do not fix it here) · the water shader · `pier` (§6) ·
`man_made:bridge` (structural, `skeleton.js` territory) · **any authored parameter** (§6, ruled).
⛔ **A re-pour and a re-bake are both required** to see anything. huron is safe for both; ⛔ **no
other town is — and no other town needs it.**
⛔ **SURFACE SCOPE DRIFT, DO NOT ABSORB IT.** ⚠️ Specific risk: **215 piers sitting right next to
your 22 breakwaters.** They are a different structure and a bigger population. **Ask.**

---

## What "done" looks like
0. ⛔ **`claims-a-level-body-has-one-surface.mjs` is GREEN before any stone is placed.**
1. huron's breakwaters, groyne and retaining walls **exist as placed structures**, counted — the count
   on disk equals the count placed, mutation-tested by deleting one.
2. They read as **stacked graded stone, not a bead chain** — variance proven by a check.
3. ✅ **The cross-section question is answered** (§5): derived, with one material constant.
4. **The predicate is ratified and the disagreement case prints** (§6).
5. Jacob has seen the lakefront **from the water and from the street.**
6. `pier` is **asked about, not absorbed.**

---

> # ⭐⭐ THE GATE THIS BRIEF IS ACTUALLY JUDGED ON *(Jacob, 2026-09-20)* — **AND IT IS ANSWERED**
>
> ⛔ **"Does it look good" is not an eye-gate.** A first pour being ugly is fine and expected; do not
> tune. ▶ **The gate is: is the element PRESENT and CORRECT.** ⛔ **The one exception is the real risk:**
> a WRONG element that looks PLAUSIBLE — *"the map is lying and nothing says so."*
> ⚠️ **That exception is this brief's whole hazard**, and it now has an instrument: stone fitted to a
> mis-seated waterline looks like a beautiful lakefront and is false. `claims-a-level-body-has-one-surface.mjs`.
>
> ### ⛔⛔ THE GATE'S DEMAND — *"state the parameters this feature needs authored, with units, and say
> whether today's model can hold them"* — **ANSWERED 2026-09-21: THIS FEATURE NEEDS NONE.**
> Footprint, crest, toe, stone size and packing are all **derived** (§5); slope is **one material
> constant**, the angle of repose of riprap, which is a property of stone rather than of a town.
> ⇒ ✅ **Nothing to hold, so no parameter home to invent** — which is what the gate was trying to
> prevent, reached from the other side.
> ⚠️ **`BRIEF-field-shader` and `BRIEF-water-shader` still owe their own answer.** ⛔ **Do not build a
> parameter home for three briefs until each has been asked whether it needs one** — this one did not,
> and the reason (the data was already there) may hold for the others too.
