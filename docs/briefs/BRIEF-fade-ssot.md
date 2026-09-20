<!-- BRIEF-STATE
status: OPEN
dispatched: Quill
written: 2026-09-20
evict-when: node checks/claims-fade-derives-from-radius.mjs && node checks/claims-no-slab-outlives-its-schema.mjs && node checks/claims-opting-out-of-the-fade-is-explicit.mjs
-->

# BRIEF — THE CIRCLE HAS ONE RADIUS. THE FADE SET MUST BE DERIVED FROM IT.

*Written 2026-09-20 by the coordinator seat. Ruling by Jacob, same day.*

> ### ⭐ THE RULING, IN JACOB'S WORDS
> *"The street fade should be SSoT, 0 reason to add more and more layers where we have a hard and
> fast rule. If we want the streets to fade over a different schedule that's fine but the OG radius
> should be the selfsame as everything else."*
>
> ⇒ **A SCHEDULE may differ. AN ORIGIN may not.** `streetFade` is allowed to run on its own curve;
> it is not allowed to carry its own copy of where the circle is.
>
> ### ⭐⭐ AND THEN HE WENT FURTHER — SAME DAY, AND THIS IS THE RULING THAT SHAPES THE WORK
> *"The street fade can be a knob but only 1; how wide the fade band is. It may not even be
> advisable to have the fade rate differ from layer to layer; maybe our best bet is to universalize."*
>
> ⛔ **THIS IS A SUBTRACTION, NOT A RECONCILIATION.** Do not unify two formulae into a third.
> **Delete one of them.** `project_remove_complexity_from_the_unmastered_system` — remove rather
> than build on.
>
> ### ⛔⛔ RULING 3, AND IT IS THE ONE THAT SHAPES EVERYTHING — **BUILDINGS ARE NOT IN THE FADE**
> *"No I didn't mean the buildings; there is no such thing as a ghosted building."* (Jacob, 2026-09-20)
>
> **A building is IN or it is OUT. It is never translucent.** And the membership half already
> works — `src/cartograph/MapLayers.jsx:526`:
> ```js
> if (!pointInBoundary(cx, cz)) continue      // binary, against the AUTHORED POLYGON
> ```
> ⛔ **But `:812` then hands the building material the radial fade:**
> ```js
> building: makeFlatMat(color('building'), PRI.building, { fade }),
> ```
> ⇒ A building that **passed** membership still renders at reduced alpha inside the band.
> ⭐ **TWO DIFFERENT SHAPES DECIDE ONE BUILDING'S FATE** — the *polygon* says in/out, and the
> *circle* then makes it translucent anyway. They are not even the same object, so the ghosting
> is not at the edge of membership; it is wherever the two disagree. **That is the defect.**
>
> ### ⛔ RULING 4 — THE FADE IS **ADDITIVE**. It starts AT the rim and lives OUTSIDE it.
>
> ```
> radius, center   the circle              AUTHORED
> fadeBand         how wide the feather    AUTHORED — ⭐ THE ONE KNOB
> ────────────────────────────────────────────────────────────────────
> fade.inner = radius                      ⭐ ADDITIVE — feather begins at the rim
> fade.outer = radius + fadeBand
> streetFade                               ⛔ DELETED — there is one fade
> buildings                                ⛔ NOT IN THE FADE SET AT ALL
> ```
>
> ### ⛔⛔ CORRECTION 2026-09-20, AFTER JACOB SAW IT ON SCREEN — **THE TABLE BELOW MEASURES THE WRONG ARTIFACT**
> The table that follows measures `clean/map.json` — **the DATA**. ⛔ **The RENDERER never draws it.**
> `MapLayers.jsx` culls **nine** populations at `pointInBoundary` before any geometry is built:
> `:529` buildings · `:543` centerStripe · `:557` parkingLine · `:573` bikeLane · `:655` alley ·
> `:679` the landscape categories · `:771`/`:786` parking lots · `:803` the layer loop.
> **Every face is culled to the AUTHORED POLYGON.**
>
> ⇒ **There is nothing outside the polygon to fade into.** An additive feather from `radius` outward
> runs over empty space, and what shows at the boundary is **the polygon's own hard cut**.
> ⭐ **And this explains the old design, which this brief misread as a defect:** the inward fade worked
> **because it feathered content that was actually drawn**, dissolving the polygon's hard edge from the
> inside. **Deleting the inward band removed the only thing hiding that cut.**
>
> ### ⭐⭐ JACOB'S RULING ON SEEING IT — and it is the requirement, not a mechanism
> *"I don't care; the edge should feather and the buildings shouldn't."*
>
> ⇒ **THE RULE, in its kit-shaped form:**
> > **IF A POPULATION TAKES THE FADE, IT MUST BE DRAWN OUT TO WHERE THE FADE ENDS.**
> > **IF A POPULATION DOES NOT TAKE THE FADE, IT IS CULLED AT MEMBERSHIP.**
>
> Buildings do not fade ⇒ they stay culled at the polygon, binary, exactly as `:529` does today.
> ⭐ **Buildings are now the EXAMPLE of the rule, not the exception to it.** Everything that *does*
> fade must be culled against the polygon **scaled out to `fade.outer`**.
>
> ⭐ **THE MECHANISM EXISTS — DO NOT INVENT ONE.** `stencilFromBoundary` (`CartographApp.jsx:783`)
> already scales the boundary polygon outward to a target radius. ⛔ **Reuse it.** A second scaler will
> drift from the first, which is the exact defect this whole brief is about.
>
> ⚠️ **AND THE NINE WERE ENUMERATED BY GREP, NOT BY READING EACH POPULATION.** Some may be line
> materials that cannot fade at all — those belong on the **culled-at-membership** side by the rule
> above. ⛔ **Read each one and sort it by whether it takes the fade. Do not take the list as the sort.**
> **If the rule and the code disagree, the code is the fact.**

> ### ⚠️ THE TABLE BELOW IS RETAINED FOR ITS REASONING ONLY — its conclusion is superseded above
> ### ⭐⭐ (was) WHY 3 AND 4 ARE ONE RULING, NOT TWO
> Additive is impossible **while buildings are in the set**, and trivially right once they are out.
> **Buildings STOP at the rim; nothing else does.** Measured on disk 2026-09-20 (▶ re-derive):
> ```
>                    furthest building vertex        other populations, huron
> huron       3539        3542  =  R+3               pavement       R+9076
> lafayette-sq 892         813  =  R−79              block/sidewalk R+4310
> hipointe    1251        1194  =  R−57              water          R+3459
> altadena    4161        3977  =  R−184             natural        R+3302
> ```
> ⇒ An additive fade has **nothing to fade a building INTO** — full opacity to the rim, then a hard
> stop, which is precisely the hard edge Jacob reported on huron this morning. ⇒ Every population
> that REMAINS in the fade has data for **kilometres** past the rim. **Take buildings out and
> additive + universal become coherent at the same instant.** This is an argument, not a preference;
> if you find yourself re-litigating either ruling, re-read this table first.
> ⭐ **A KNOB ALREADY EXISTS — `innerFadeOffset` — but ruling 4 REVERSES ITS SENSE.** Today it is an
> INWARD offset (`fade.inner = radius − innerFadeOffset`, verified in all four towns); the target is
> an OUTWARD band (`fade.outer = radius + fadeBand`). ⛔ **Do not silently reinterpret the existing
> field's meaning while keeping its name** — a field whose sense flipped under an unchanged name is
> the worst kind of stale. Rename it, or migrate it deliberately and say so in the commit.
>
> ### ⚠️ AND CHECK WHETHER BUILDINGS ARE THE ONLY BINARY POPULATION — ⛔ I HAVE NOT MEASURED THIS
> **TREES and LAMPS are placed content on exactly the same reasoning as buildings.**
> ✅ **ANSWERED 2026-09-20 by Quill, measured not inferred: they do NOT take the fade.**
> `DesignerTrees.jsx` and `DesignerLamps.jsx` contain **zero** references to fade, `pointInBoundary`,
> or any boundary; `MapLayers` retired both to those layers (`:823` trees, `:950-953` lamps) and they
> read the baked slab. ⇒ **They do not have the building defect.**
> ⚠️ **BUT THEY ARE THEREFORE GOVERNED ENTIRELY BY THE STENCIL** — which GROWS under the new rule
> (§7). Nobody has looked at what that does to them. **Not a blocker; do not leave it unsaid.**
>
> ⚠️ **"maybe" is a LEAN, not a ruling.** He is weighing universalizing. §7 tells you what to bring
> him. ⛔ Do not treat the lean as settled, and do not ask him to re-decide the ORIGIN — that part
> IS ruled.

⚠️ **AND HE ADDED THE FRAME YOU MUST READ THIS IN:** *"The streets have never been correct, we're
just fixing things as we go."* ⛔ So the authored `streetFade` numbers are **NOT** a protected
authoring gesture here — do not invoke Layer 0 question 3 to leave them alone. That question
protects the operator's *intent*; these literals are unfixed legacy that predates the rule.

---

## 1. You are the dispatched agent. Name yourself — one word, yours.

⛔ Not "Boz" and not a name from this brief. The coordinator never names you.

## 2. Agent: **FRESH**

No warm session holds this. The last agent in the fade region (Ground Layers) is done and its two
commits are **accepted** — do not inherit its context, and do not re-open `faceFade`/`bandFade`
plumbing: that is correct and landed.

## 3. Read this canon, by section

- **`cartograph/ARCHITECTURE.md:418`** — ⛔⛔ **THE STANDING RULING THIS BRIEF OVERTURNS.** It reads:
  *"the fades are partly derived from radius — is **preserve at equal radius, refuse on a change**:
  the bands are absolute metres, so holding them puts the feather inside the disc and scaling them
  invents intent."* **Jacob has now ruled the other way.** ⭐ This is a **ruling superseded by the
  operator**, which is neither ROT nor REGRESSION — it is a decision changing. Per CLAUDE.md's
  three-part fix rule the doc edit is **part of the fix**, not follow-up. Excise the superseded
  sentence (do not leave a correction banner beside it) and record the new ruling in its place.
- **`cartograph/BACKLOG.md:208`, item (d)** — records this as an open question: *"rescope still
  regenerates `innerFadeOffset`/`fade`/`streetFade` from hardcoded constants … needs a ruling on how
  fades scale with radius."* ⭐ **Jacob's sentence IS that ruling.** Close the item as ruled.
- **`EXTENT-DESIGN §5.1`** — the record schema split that `FADE_FIELDS` implements.
- **`cartograph/PREBAKE.md:98`** — the prior statement of the overwrite hazard.

## 4. The code sites, by `file:line`

### ⛔⛔ THREE SOURCES FOR ONE CIRCLE, AND THEY DISAGREE. This is the defect.

**① The stored literals** — `cartograph/data/<scene>/neighborhood_boundary.json`, fields
`innerFadeOffset` · `fade{inner,outer}` · `streetFade{inner,outer}`.

**② `src/cartograph/boundary.js:79-85`**, inside `makeBoundary(nb)`:
```js
const v1Inner        = Math.max(0, radius - (nb?.innerFadeOffset ?? 134))
const fadeInner      = nb?.fade?.inner       ?? v1Inner
const fadeOuter      = nb?.fade?.outer       ?? radius
const streetFadeInner= nb?.streetFade?.inner ?? (fadeInner + 42)
const streetFadeOuter= nb?.streetFade?.outer ?? (radius + 108)
```

**③ `cartograph/boundaryRecords.mjs:47-53`**, a function whose own docstring calls itself
**"THE ONE FADE FORMULA"**:
```js
export function generatedFade(R) {
  return {
    innerFadeOffset: 200,
    fade:       { inner: Math.max(0, R - 200), outer: R },
    streetFade: { inner: Math.max(0, R - 140), outer: R + 160 },
  }
}
```

⭐ **② AND ③ ARE DIFFERENT FORMULAE FOR THE SAME NUMBERS**, and ① shadows both — every field is
`??`, so **a stored literal always wins and the derivation is dead code in every town but `toy`.**

|                    | ③ `generatedFade` | ② `boundary.js` default |
|--------------------|-------------------|--------------------------|
| `fade.inner`       | `R − 200`         | `R − innerFadeOffset(??134)` |
| `fade.outer`       | `R`               | `R` ✓ agree |
| `streetFade.inner` | `R − 140`         | `fadeInner + 42` |
| `streetFade.outer` | `R + 160`         | **`R + 108`** |

### ⭐ AND THE SPLIT IS LS-vs-THE-KIT — Layer 0's signature shape

Measured on disk, 2026-09-20 (▶ re-derive; do not quote):

```
scene              radius   fade            streetFade       matches
huron              3539     3339 → 3539     3399 → 3699      ③ generatedFade exactly
hipointe-demun     1251     1051 → 1251     1111 → 1411      ③ generatedFade exactly
altadena           4161     3961 → 4161     4021 → 4321      ③ generatedFade exactly
lafayette-square    892      758 →  892      800 → 1000      ② boundary.js defaults exactly
toy                 180     (absent)        (absent)          — derives at read time
```

⛔⛔ **`fade.outer === radius` in ALL FOUR.** Exactly, every time. It is a **redundant copy of
`radius`** stored as a literal. `fade.inner === radius − innerFadeOffset` in all four likewise.
⇒ **Six numbers per town, all derivable, all stored.** Move the radius and five of them lie.

⭐ **LS's instance numbers (134/42/108) are `boundary.js`'s kit DEFAULT**, while every town actually
poured through the Extent tool carries 200/140/160. **LS is the mould, frozen as the kit** — and the
real kit convention lives only in ③.

### The consumers — all of them read the bundle, which is the good news

- `src/cartograph/MapLayers.jsx:493` — `fade` memo; ⛔ note `injectRadialFade` reads
  `fade.center[0]/[1]` (**array**).
- `src/cartograph/BlockGeometryV2Debug.jsx:270-279` — `faceFade`/`bandFade`; ⛔ `useSurfaceMaterial`
  reads `fade.center.x/.z` (**object**). **The two descriptor shapes differ. Verified 2026-09-20 by
  Ground Layers — "follow MapLayers" is right about mechanism and wrong copied literally.**
- `src/cartograph/CartographApp.jsx:788` — `(nb?.streetFade?.outer ?? radius) + 50`, the stencil target.
- `cartograph/sceneStencil.js:32` · `cartograph/bake-ground.js:1039` · `src/lib/tileGround.js` ·
  `src/components/BakedGround.jsx`.

### The writers — where the literals get re-stamped

- `cartograph/serve.js:1742` (`commit-extent`) and `:1889` (`rescope`) — both log
  *"preserved AUTHORED fade set"*. ⛔ **Under the new ruling "preserve" is the bug, not the safeguard.**
- `cartograph/boundaryRecords.mjs:107` — `makeDiscRecord` copying `streetFade` forward verbatim.
- `cartograph/boundaryRecords.mjs:40` — `FADE_FIELDS`, the list that makes the set a carried record.

## 5. The chain — what this trusts, and what trusts this

**Upstream, what this trusts:** `radius` and `center` on the disc record (`EXTENT-DESIGN §3.3` — the
bb is a square holding the disc, frozen at hard fetch). ⛔ **The radius is live-editable in R15** —
that is the whole reason this must derive: Jacob moves the radius and today five stored numbers
silently keep pointing at the old circle.

**Downstream, what trusts this, by name:** the Designer 2D map (`MapLayers`), the Section/Survey
surfaces (`BlockGeometryV2Debug` via `useSurfaceMaterial`), the stencil
(`CartographApp:788` → `sceneStencil.js`), and the **bake** (`bake-ground.js:1039` writes
`streetFade` into the slab). ⛔ **The bake is the one that makes a mistake durable** — a wrong fade
set reaches `map.json`/`ribbons.json` and then the Slab.

⭐ **Convert the constraint into a check, per BOZ §3.5** — it crosses topics, so it must travel with
the operation:
> **`fade.outer === radius` and `fade.inner === radius − innerFadeOffset`, for every scene on disk.**

That single assertion catches the whole class in a town nobody has looked at, and it fails today on
nothing — which is the point: it pins the invariant *before* someone moves a radius.

## 6. ⛔ Can the instrument SEE the change?

**Yes, and name the surface.** The fade set is **on disk** in `neighborhood_boundary.json`, so a
check reads files, not the live app — `node -e` it in one line and it is decisive.

⭐ **`toy` is your controlled fixture and it already exists** — it carries `radius: 180` and **no
`fade`/`streetFade` at all**, so it is the ONLY scene that exercises the derivation path today.
Per BOZ §3.8, route validation through it via the production path. ⛔ Do not build a parallel spike.

⚠️ **Eye-gate surface — ⛔ CORRECTED 2026-09-20, the original was WRONG:** Survey renders **live**;
Section renders from the frozen **`shape.json`** (`BlockGeometryV2Debug.jsx:611`). ⛔⛔ **NOT the baked
slab — neither Designer surface reads `baked/<look>/ground.json`.** ⇒ **A fade change is live in BOTH
Survey and Section immediately; NO BAKE IS INVOLVED.** *(This brief originally said "Section needs a
re-bake before it means anything." That was the coordinator collapsing "the frozen shape" and "the
baked slab" into one word. `baked/<look>/ground.json` belongs to `BakedGround` / `GatewayArch` /
`CartographSurfaces` — the 3D side, downstream of Stage.)*

## 7. Write/commit bounds

**In bounds:** `src/cartograph/boundary.js` · `cartograph/boundaryRecords.mjs` · `cartograph/serve.js`
(the two preserve sites) · the four `neighborhood_boundary.json` records · a new check ·
**and the two canon edits named in §3** (`ARCHITECTURE:418`, `BACKLOG:208 (d)`) — those are *part of*
the fix, per CLAUDE.md's three-part rule, and the commit message must name the register it reached.

⛔ **OUT of bounds:** `faceFade`/`bandFade` plumbing (landed and accepted) · the depth/`renderOrder`
work in `c3dab6c6` · anything in `MapLayers` beyond reading the bundle.

⛔ **SURFACE SCOPE DRIFT, DO NOT ABSORB IT.** In particular: **do not re-pour or re-bake any town to
make numbers agree** without coming back. A re-bake is the irreversible step here.

### ✅ SUPERSEDED — THE BAND IS RULED. See §7d. Kept for the reasoning only.
### ⚠️ (was) THE ONE THING THAT NEEDS JACOB BEFORE YOU WRITE A NUMBER
Universalizing forces **one band width** where there are currently two. **LS is 134; every
Extent-poured town is 200.** ⛔ Under ruling 4 this band now runs OUTWARD, so the two numbers do not
mean what they meant when they were written — **render both, do not reason about them.** ⛔ Picking silently either changes LS's look or every other town's.
**Measure both, show him the delta on ONE surface, and let him pick.** Do not choose for him and do
not split the difference.

⭐ **Two consequences to price and put in front of him — both measured 2026-09-20, re-derive them:**

**① THE STENCIL MOVES — and it costs ZERO buildings, measured.**
⭐ Before you worry about this: the furthest building vertex is `R+3` on huron and INSIDE the rim on
the other three (see the table above). **A stencil at `radius + 50` clears every building in all four
towns.** The ring being given up contains no building anywhere. Say it aloud; do not slip it in.

**① (detail) THE OLD INWARD-MODEL NUMBERS.** `CartographApp.jsx:788` derives it from `streetFade.outer + 50`. Delete
`streetFade` and the target becomes `radius + 50`:
```
huron            3749 → 3589   −160 m  ( 4.5% of R)
lafayette-square 1050 →  942   −108 m  (12.1% of R)
hipointe-demun   1461 → 1301   −160 m  (12.8% of R)
altadena         4371 → 4211   −160 m  ( 3.8% of R)
```
⚠️ **LS and HPDM lose ~12% of stencil radius; huron and altadena ~4%.** The stencil is stamped LAST
on finished geometry (`RIBBONS §1`), so this is about what gets KEPT. ⛔ **It is not obviously
safe and it is not obviously harmful** — content past `radius` is invisible once the fade completes
at `radius`, so shrinking to `radius + 50` is *consistent*; but the stencil also governs layers that
do not fade at all (see ②). **Cause not established. Measure it on one scene and show him.**

**② FOUR LAYERS CANNOT FADE AT ALL, SO "UNIVERSAL" HAS A LITERAL LIMIT — SAY IT OUT LOUD.**
`LineBasicMaterial` does not accept the radial-fade shader (`MapLayers.jsx:96`, `:738`), so these
hard-CLIP instead of feathering, and universalizing the rate cannot reach them:
- centerlines — `MapLayers.jsx:585` clipped to `clcR = fadeInner + 52`
- barriers (fence/wall/hedge/retaining_wall) — `MapLayers.jsx:743`
- the boundary ring itself — `MapLayers.jsx:846`
- Survey's curb + grout overlays — `BlockGeometryV2Debug.jsx:1227`, `:1232`

⭐ **THE GOOD NEWS, AND IT MAKES HIS INSTINCT SAFE: every one of them is off by default, a Survey
working overlay, or the edge of the drawing itself.** Checked against huron's `design.json`:
`centerline:false`, `fence/wall/hedge/retaining_wall:false`. The boundary ring SHOULD be hard — it
is the edge of the drawing, never an absence (`project_neighborhood_is_a_compound_shape`). ⇒ In
practice universalizing reaches every layer the operator actually sees. **Tell him that; it is the
fact that makes the "maybe" answerable.**

## 7b. ⭐ NEW SCOPE — the Extent tool indicator (Jacob, 2026-09-20)

*"Maybe even an indicator in the extent tool as to where the fade starts and stops."*

Draw the fade's start and stop as rings in the Extent tool, beside the radius handle.
⭐ **Fold it into this work, do not spin it off** — it makes the one knob legible **at the moment it
is turned**, and the absence of exactly that is most of why this drifted into four stored copies.

## 7c. ⛔⛔ THE DELETION LANDMINE — READ THIS BEFORE YOU DELETE ANYTHING

*Found by Quill 2026-09-20, holding at the §7 gate. Verified independently by the coordinator seat.*

`cartograph/bake-ground.js:1035`:
```js
const manifestStencil = stencil.faceFade && stencil.streetFade ? {
  center: stencil.center, radius: stencil.radius,
  fade: stencil.faceFade, streetFade: stencil.streetFade,
} : null
```
`src/components/BakedGround.jsx:117`:
```js
if (!stencil) return null        // → the runtime SKIPS the radial fade shader
```

⛔⛔ **DELETE `streetFade` AND THIS PREDICATE GOES NULL FOR EVERY TOWN.** Every baked town silently
loses its fade **entirely** — not a wrong band, *no shader at all*. ⚠️ **And it is invisible until a
re-bake**, so it ships looking fine and degrades the Slab later. ⭐ That is `CLAUDE.md` Layer 0
question 2 in its purest form: a fallback converting a deletion into a plausible-looking success.

▶ **It must change in the SAME commit as the deletion.** Not a follow-up, not a TODO.

⭐ **And `BakedGround.jsx:118` is the two-schedule split itself, in the runtime:**
```js
const band = group.kind === 'face' ? stencil.fade : stencil.streetFade
```
It collapses to one band under ruling 4 — and this is the line that proves the two schedules were a
real, shipped regime rather than stale data. **Collapse it deliberately and say so.**

## 7d. ⭐ THE SIXTH SCENE, AND IT SETTLES THE BAND ARGUMENT

`lafayette-square-staging` — **R 850, `innerFadeOffset` 200, fade 650→850, streetFade 710→1010.**
It carries the **KIT** schedule.

⇒ ⛔ **LS-proper's 134 is a lone holdout that disagrees with its own staging twin.** The brief's
earlier table listed five scenes and missed this one.

✅ **BAND RULED: 200, kit-wide** (Jacob, 2026-09-20, direct to Quill). §7's hard stop is **DISCHARGED**
— you no longer need to bring him two renders. ⚠️ **LS moves 134 → 200 and its look changes.** That is
the ruling, not a defect; ⭐ and the staging twin above is the reason it is the right one.

Also verified in all five fade-carrying scenes (toy has none): **`fade.outer === radius` exactly**, and
**`fade.inner === radius − innerFadeOffset` exactly.**

## 7e. ⚠️ THE **UNAUTHORED-FADE** BRANCH — the one thing still genuinely open

> ⛔ **DO NOT CALL THIS "the toy branch."** Quill checked it at the call sites 2026-09-20:
> `stencilFromBoundary` has exactly **two** call sites — `CartographApp.jsx:793` (`LS_STENCIL`,
> module-level, LS only) and `:903` (`sceneBoundary ? stencilFromBoundary(sceneBoundary) : null`, the
> generic poured-scene path). **Toy reaches neither** — `:859` hands it `TOY_STENCIL`, a literal
> 360×360 box, plus `useBoundary: false`.
>
> ⇒ ⭐⭐ **The `?? radius) + 50` fallback is reachable ONLY at `:903`: a poured scene that HAS a
> boundary but has NOT yet had its fade authored.** That is **town #7 between its pour and its fade**,
> and **there is no scene on disk in that state today** — which is exactly why a 50 m split has sat
> in the code unseen. ⛔ **Framing it as a toy bug would have "fixed" the one scene that cannot reach
> the code**, and left town #7 broken. This is Layer 0's whole argument in one line.

**The two stencil twins already disagree, today, on `toy`:**

| | expression | toy |
|---|---|---|
| `CartographApp.jsx:788` | `(nb?.streetFade?.outer ?? radius) + 50` | **230** |
| `cartograph/sceneStencil.js:41` | `streetFade ? streetFade.outer + 50 : radius` | **180** |

**50 m apart**, and `sceneStencil.js`'s own header already flags the Designer twin as unreconciled.
⛔ `targetR = fade.outer + 50` fixes both **only if the no-fade branch is decided too** — a town with
no authored fade has no `fade.outer` to add 50 to.

⭐ **The coordinator's recommendation, and it is a recommendation, not a ruling:** **no fade ⇒ no
scale-out.** `targetR = radius`, which is `sceneStencil.js`'s existing behaviour; the Designer twin's
`?? radius) + 50` looks like the accident. **Reason: the +50 exists to protect a feather. With no
feather there is nothing to protect, and the margin would keep geometry that nothing fades into.**

⭐ **And the call-site check STRENGTHENS the recommendation rather than merely surviving it:** at
`:903` the scene has **no feather at all**, so scaling the block-fill mask out by 50 m keeps a ring of
geometry that **nothing fades into and nothing draws against.** `targetR = radius` is the coherent
branch.

## 8. The validation surface that already exists

`toy` (above) for the derivation path. For the record round-trip, **`checks/claims-boundary-record-split.mjs`
already exists and already tests this area** — ⚠️ but its section **D** (`:121-129`) asserts
`pipeline.js still binds 'const keepR ='`, which died with the clip excision (`ec7dd3f4`,
2026-09-05); the check names its own remedy in the assertion string. **Its other six sections pass.**
Excising D is a separate five-line job — if you touch that file, surface it, don't silently fold it in.

---

## What "done" looks like

1. One origin. `radius` + `center` + `innerFadeOffset` are the only stored facts; the rest derives.
2. ⛔ **`streetFade` is GONE, not reconciled** — one fade, one formula, one place. If a second
   schedule survives this work, the work did not land.
3. A check pinning `fade.outer === radius`, mutation-tested so it is seen to FAIL.
4. `ARCHITECTURE:418`'s superseded ruling excised and replaced; `BACKLOG:208 (d)` closed as ruled.
5. Jacob has chosen the schedule, on a measured before/after.
