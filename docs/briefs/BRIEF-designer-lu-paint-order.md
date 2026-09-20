<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-20
evict-when: node checks/claims-coplanar-ground-has-a-painters-order.mjs
-->

# BRIEF — TWELVE LAND-USE FACES SHARE ONE PAINT SLOT IN THE DESIGNER

*Written 2026-09-20 by the coordinator seat.*

> ### ⭐ THE OPERATOR'S REPORT, AND THE DESIGN INTENT THAT CONSTRAINS THE FIX
> *"Earlier, we collapsed the layers into a paint sequence stack for the 2D browse camera; we need to
> fix the depth conflicts with all the new LUs."*
> *"I initially made the ground layers in a single plane on purpose so we could just have a single
> stretchable and lightable layer."*
>
> ⛔⛔ **THE SINGLE PLANE IS THE PRODUCT, NOT A LIMITATION.** ⇒ **PAINT ORDER IS THE ONLY LEVER.**
> Do not reach for y-offsets (ruled out by Jacob 2026-09-20: *"practically speaking it's a 2D map
> with no 'thickness'"*), and do not reach for `polygonOffset` — it is **inert under the log-depth
> buffer** this Canvas uses, which is the finding `c3dab6c6` was built on.

---

## 1. You are the dispatched agent. Name yourself — one word, yours.
## 2. Agent: **FRESH.** ⚠️ `src/cartograph/` has had several sessions through it today; `git status` before your first write.

## 3. ⛔⛔ THE DEFECT — ONE LINE, AND THE NEW CLASSES MADE IT VISIBLE

`src/cartograph/BlockGeometryV2Debug.jsx:1191`:
```js
for (const lu of luClasses) out.set(lu, makeMaterial(luColorOf(lu), PRI.residential, faceFade, …))
```
⭐⭐ **EVERY LAND-USE FACE IS DRAWN AT THE SINGLE PRIORITY `PRI.residential`.** Twelve distinct
materials, one slot. With the plane coplanar and depth not written, **the winner is whatever the
renderer emits last** — which is stable only by accident and changes with traversal.

**And the same shape for the bands** — `:1045`, `:1055`, `:1070`: every `treelawn:<lu>` variant is
built at `PRI.treelawn`. ⛔ The SLAB gives those eleven distinct slots (18–28). The Designer gives
them one.

### ⭐ THE OVERLAP IS MEASURED AND IT IS NOT SMALL
`checks/claims-coplanar-ground-has-a-painters-order.mjs`, run 2026-09-20:
```
altadena          368 polys ·  16 cross-kind (4.3%) ·  1 same-kind
hipointe-demun   2284 polys ·  91 cross-kind (4.0%) · 27 same-kind
huron             262 polys · 127 cross-kind (48.5%) · 18 same-kind   ⛔
lafayette-square  566 polys ·   5 cross-kind (0.9%) ·  4 same-kind
```
⭐⭐ **LS IS AT 0.9% AND HURON IS AT 48.5%.** That spread is why this was invisible: **the mould town
cannot witness it.** The check's own note says so — *"a town at ~1% cannot witness a defect that
disfigures a town at ~50%."*

### ⚠️ AND `PRI` CARRIES TWO PRE-EXISTING COLLISIONS, NEVER RESOLVED
`src/cartograph/MapLayers.jsx`'s `PRI`: **`edgeline: 13` and `bikelane: 13`** · **`stripe: 14` and
`barrier: 14`**. Flagged 2026-09-20 in `BRIEF-designer-depth-regime.md` and left open. ⛔ Fix them in
this pass or say why not — a table whose job is distinctness should not have known duplicates in it.

## 4. ⭐⭐ THE SLAB ALREADY SOLVED THIS — COPY IT, DO NOT INVENT

`cartograph/bake-ground.js`'s `PAINT_ORDER` produces, in huron's shipped slab, **34 groups at
renderOrder 0…33, every one distinct**, with the new classes slotted in:
```
 0 face:residential … 8 face:underived  9 face:agricultural  10 face:cemetery
11 mat:parking_lot … 17 mat:scrub
18 mat:treelawn:residential … 27 mat:treelawn:agricultural  28 mat:treelawn:cemetery
29 mat:sidewalk  30 mat:curb  31 mat:asphalt  32 mat:alley  33 mat:stripe
```
⇒ **The shape is proven and shipped. The Designer simply never got it.**

⛔⛔ **DERIVE THE ORDER; DO NOT WRITE A SECOND LIST.** A hand-kept Designer table is a copy that will
disagree with `PAINT_ORDER` the next time someone adds a class — and *"the vocabulary is named in 14
places"* is a finding this repo already has. ▶ **The Designer's per-class slots should come FROM the
same source the bake uses**, so a thirteenth class cannot silently collide.
⚠️ **Establish whether `PAINT_ORDER` is importable from the browser side** before assuming it — if
`bake-ground.js` is node-only, the shared home may need to move, and **that is a design call: bring
it to Boz rather than duplicating.**

## 5. ⛔ Can the instrument SEE the change?
⚠️⚠️ **THE EXISTING CHECK PASSES AND DOES NOT COVER THIS.**
`claims-coplanar-ground-has-a-painters-order` currently asserts **3 fixed slots + 1 per-kind band**
over the *landscape* family (`gnd-*`, `ls-*`, `waterGeo`, `parkingLotGeo`) — ⛔ **it does not see the
LU FACE materials at `:1191` at all.** It printed `✅ PASS` while twelve faces shared a slot.
⇒ ⭐ **Widening that check IS the deliverable.** The class is *"every coplanar family is ordered by
the painter"*, and the face family was never in it.
⛔ **MUTATION-TEST IT:** point two LU classes at the same slot and prove it fails **by naming both**.
⚠️ And a passing check that never looked is the exact failure this repo hit twice today — say in the
header **which families are covered**, so the next reader can see the boundary instead of inferring it.

**Eye-gate surface:** ⭐ **huron, not LS** — at 0.9% LS cannot show you the defect or the fix.
⛔ The gate is *"do overlapping faces paint in a stable, declared order"*, **not** *"does the map look
nice"* — the map already looks fine, which is precisely why this survived.

## 6. Write/commit bounds
**In bounds:** `BlockGeometryV2Debug.jsx`'s LU material construction · `MapLayers.jsx`'s `PRI` ·
`claims-coplanar-ground-has-a-painters-order.mjs` · a shared order source if §4 says one is needed.
⛔ **OUT:** `bake-ground.js`'s `PAINT_ORDER` — ⭐ **it is CORRECT and it is the reference. Do not
"improve" it.** Also out: the fade/boundary arc · anything y-lifting the plane.
⛔ **SURFACE SCOPE DRIFT, DO NOT ABSORB IT.** ⚠️ Specific risk: discovering that the Designer and the
bake build faces from different geometry. **If they do, STOP — that is a bigger finding than this
brief and it changes what "same order" even means.**

---

## What "done" looks like
1. Each LU face and each treelawn variant has a **distinct, declared** paint slot in the Designer.
2. The order is **derived from one source**, not a second hand-kept list.
3. `PRI`'s `edgeline`/`bikelane` and `stripe`/`barrier` duplicates are **resolved or explained.**
4. The check covers the **face family** and has been **seen to fail** on a deliberate collision.
5. Verified on **huron** (48.5% overlap), with LS unchanged as the control.

---

> # ⭐⭐ THE GATE THIS BRIEF IS ACTUALLY JUDGED ON
> ⛔ **"Does it look good" is not an eye-gate.** ⭐ This brief is the purest case of the real rule:
> **a wrong element that looks plausible.** Twelve faces fighting for one slot render a perfectly
> handsome map — the wrong polygon simply wins, silently, and differently on another machine.
> ▶ The gate is: **is the order DECLARED and DISTINCT.** Measurable, and nothing to do with taste.
