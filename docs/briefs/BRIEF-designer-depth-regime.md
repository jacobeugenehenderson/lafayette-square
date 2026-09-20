<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-20
evict-when: the Designer's coplanar layers sort by a mechanism that is not inert, eye-gated by Jacob, with a source-level check that fails if polygonOffset is ever relied on again under log depth
-->

# BRIEF — the Designer's rim regime: TWO defects

**A — the flicker.** A 2D map is depth-sorting and its sorter is inert.
**B — the hard rim.** The radial fade never reaches the tile layers on any scene but Lafayette Square.

⛔ **TWO DEFECTS, TWO ACCEPTANCES, TWO COMMITS.** They share a file surface — which is the only
reason they share a brief, and why one agent holds both rather than two colliding on
`BlockGeometryV2Debug.jsx`. ⛔ Do not bundle the fixes; `POLYGON-FIRST §5` RULE 3 — one invariant,
one defect. **B was added 2026-09-20 after A was dispatched** (Jacob's eye, second pass) — read it
even if you started on A.

**You are the dispatched agent. Name yourself — one word, yours.**

**Agent: FRESH.** This is a render/depth question with no shared context with the coastal
arc or the intake census. A warm agent would carry geometry framing into a problem that is
not geometry — the shapes are fine, the *order they draw in* is not.

---

## 0. The symptom, with its scene recorded

**Jacob's eye, 2026-09-20, on `huron`, in the Cartograph Designer (Survey tool):**

> *"Survey looks wrong (no fill tint) and is spotty (the highways were janky already so not a
> regression.) There are lots of places where there is new geometry but the layers flickers as in
> YAxis conflict."*

⛔ **THREE SYMPTOMS, AND THIS BRIEF IS ONLY THE THIRD.**
- The **highways** are pre-existing and Jacob excluded them himself. Not yours.
- **"No fill tint"** is a *different root* and is NOT in scope here. One hypothesis is already
  dead (huron carries 33 `layerColors`, the same count as LS — so it is not a missing-colour
  fallback). The live candidate is that huron is the first assessor-less town we have eye-gated,
  so the land-use ladder derives little and faces come back `underived`. ⛔ Not established, not
  yours, do not bundle it.
- **The flicker** is this brief.

⭐ **And Jacob named the cure's shape before the diagnosis existed:** *"practically speaking it's
a 2D map (reality aside) with no 'thickness'."* A map with no thickness should not be
depth-sorting at all. Hold that; it is the design constraint the work is built to, not a hint.

---

## 1. What is measured — read these yourself before you build

All read in source 2026-09-20. ⚠️ Line numbers are a *hint*, not a citation — `PIPELINE §How to
read` rule 3 records 51 of 99 corpus citations as provably stale. **Grep the symbol.**

| where | what |
|---|---|
| `CartographApp.jsx` — the `<Canvas orthographic …>` | sets **`logarithmicDepthBuffer: true`** (~`:1160`) |
| same file, `<PerspectiveCamera makeDefault={!inDesigner} />` | ~`:1167`; the comment at `:178` states the design: the Canvas creates the ortho camera for the Designer, the perspective camera takes over for shots |
| `MapLayers.jsx` — `makeFlatMat` | every coplanar ground material sets `polygonOffset: true`, `polygonOffsetFactor: -pri`, `polygonOffsetUnits: -pri*4` (~`:132`) |
| `MapLayers.jsx` — `const PRI` | the priority table (~`:38`), comment: *"higher = on top **via polygonOffset**"* |
| `BlockGeometryV2Debug.jsx` | ~`:494`: *"polygonOffset (driven by pri in makeMaterial) is **the authoritative depth resolver**"* |
| `BakedGround.jsx` | ~`:8` and ~`:231`: *"polygonOffset is **INERT** under the log-depth canvas"* |
| `cartograph/ARCHITECTURE.md §7` + **§8** *"Layering / coplanar stacking / depth precision"* | the canon: `<logdepthbuf_fragment>` writes `gl_FragDepth` explicitly, which **per the GL spec bypasses `GL_POLYGON_OFFSET_FILL`**. Four mechanisms, and the decision rule for a new ground layer |

### ⛔⛔ 1.1 THE "polygonOffset IS INERT" PREMISE IS **NOT ESTABLISHED FOR THE DESIGNER** — corrected 2026-09-20 by the dispatched agent

This brief asserted it as fact and it is not one. `ARCHITECTURE §8`'s corollary is **correct about
the shots** and was written without the ortho branch in view:

> `gl_FragDepthEXT = vIsPerspective == 0.0 ? gl_FragCoord.z : log2(vFragDepth) * logDepthBufFC * 0.5;`

**The Designer camera is ORTHOGRAPHIC**, so `vIsPerspective` is 0 and the chunk writes back
`gl_FragCoord.z` — the rasterizer's own depth, which is the value polygon offset modifies. The
`log2` recompute that would discard the offset runs **only under the perspective shot camera.**

⛔ **This does NOT mean the offset works** — whether it survives an explicit `gl_FragDepth` write is
a GPU rasterization question, unsettled from source. **Cause not established, in both directions.**
⭐ What survives unchanged: log depth is correct and necessary for the 3D shots and ⛔ **must not be
removed.**

### ⛔⛔⛔ 1.2 THE THREE `PRI` COLLISIONS WERE **WRONG** — excised, and here is what is actually measured

*(This section named three collisions and claimed the parks were in one. All three are false; they
are excised rather than bannered, because a false line is shorter than its correction and is read
first. Measured by the dispatched agent, 2026-09-20.)*
- **`PRI.park` is never used** as a renderOrder or a material `pri` — only `PRI.park + 1`. The
  `PRI.landscape - 1` slot is the **water ground** (`groundByKind` iterates `['water']` only). Two
  dead values meeting, with no park on either side.
- **stripe(14) × barrier(14) are not coplanar** — stripe is a mesh at y=0.27, barrier a `THREE.Line`
  at y=0.62. A table collision, not a depth conflict.
- **edgeline(13) × bikelane(13) is real and coplanar** — and both are in `SURVEY_HIDE`, so neither
  draws in the view the symptom was recorded in.

### ⭐⭐⭐ 1.2a THE ACTUAL CLASS — **ONE SLOT, MANY MESHES, MEASURED OVERLAP**

`landscapeByKind` renders **one mesh per `item.use`**, every one at `renderOrder={PRI.landscape}`,
y=0.12, same `polygonOffset`. The conflict is **WITHIN one slot, between meshes that correctly share
it** — so nothing about the `PRI` table can express it. Cross-kind polygon overlap, point-in-ring:

| scene | overlapping |
|---|---|
| **huron** | **126/261 = 48%** |
| hipointe-demun | 91/2284 = 4.0% |
| altadena | 16/368 = 4.3% |
| **lafayette-square** | **5/566 = 0.9%** |

huron's top pairs: `golf_course × sand` 62 · `park × pitch` 34 · `grassland × nature_reserve` 15 —
and the 11 parks from `ea13e35e` appear in six pair types. ⭐⭐ **0.9% on the mould, 48% on town #2.**
Layer 0's signature, and the fourth instance of that class in one day.

⭐ **And the view is answered (Jacob):** the flicker was the **plain Designer, no tool.** That keeps
the file scope right — in the Survey tool `MapLayers` draws only the ground mesh, the water ground
and centerlines, and the scope would have had to move to `BlockGeometryV2Debug`.

---

## 2. ⛔ CONFIRM THESE PREMISES FIRST — and if the code contradicts this brief, STOP AND FLAG JACOB

**The stop is the deliverable, not a failure of the brief.**

1. **Does the flicker reproduce?** On `huron`, in the Designer. ⛔ An eye verdict must record its
   scene (`feedback_an_eye_verdict_must_record_the_scene`) — a verdict taken on LS is a verdict on
   a different map.
2. **Is it the `PRI` collisions, the inert `polygonOffset`, or both?** The discriminating test:
   give one colliding pair distinct `PRI` values and nothing else. If that pair stops flickering
   and others continue, you have both defects and their populations.
3. **Does `MapLayers` render in the perspective shots?** It is mounted with `inShot={!inDesigner}`
   (~`:1263`), which reads as yes. **This is the constraint that stops the cure being a one-liner**
   — at street level things genuinely do sit in front of each other, so depth cannot be blanket-off.

---

## 3. The question, in order

1. **Which layers actually flicker** — all coplanar ground layers, or only the colliding pairs?
2. **Is `PRI` intended as a total order?** If yes, the collisions are a plain defect. If two layers
   are genuinely never coplanar, say so per pair — ⛔ and then it is not a defect, it is a fact that
   needs recording.
3. **Scope the cure to the ortho view without breaking the shots.**

### ⭐ The cure's shape is already in the repo — twice. Do not invent a third.

- `MapLayers.jsx` **already uses `depthTest: false`** for one overlay (~`:790`). The mechanism is in
  the file, used once.
- **The ParkTitle fix is the pattern for the scoping problem**: `ParkTitleMesh({ occlude })` — the
  3D scene passes `occlude`, the 2D Designer map leaves it off. **Same component, occlusion decided
  by the CALLER.** Recorded in `ls/BACKLOG.md`, the landmark-labels row; read it before designing
  anything. It also records why the *previous* always-on-top approach had to be retired, which is
  the failure mode to avoid repeating.

⛔ **Not Y-lift.** `ARCHITECTURE §8` lists a tiny Y-lift as a Designer-only option and it would
work — but it simulates thickness on a map that has none, to feed a depth test that should not be
consulted. Jacob's constraint, and it is the design call, not a preference.

---

## 3b. ⛔ DEFECT B — the rim is CUT but never FADED, on every scene but LS

**Jacob's eye, `huron`, second pass:** *"the hard edge tells me this is stamped after the gradient
edge and not before."* ⭐ **He is right in effect, and the mechanism is two sites that must move
together.**

The tell is in one frame: a **woods overlay fades correctly** while the **block fill beside it cuts
hard.** Two different renderers — `MapLayers` fades, the tile render does not.

**① The fade is gated off for every scene but LS.** `CartographApp.jsx` `sceneConfig`, three branches:

| branch | `useBoundary` | `stencil` |
|---|---|---|
| lafayette-square (~`:807`) | **true** | `LS_STENCIL` |
| toy (~`:860`) | false | `TOY_STENCIL` |
| **generic poured scene (~`:904`)** | **false** | `stencilFromBoundary(sceneBoundary)` |

⇒ `BlockGeometryV2Debug` (~`:254`) sets `faceFade = useBoundary ? FACE_FADE : null` and the same for
`bandFade`. On a poured town both are **null**. ⭐⭐ **And the generic branch still computes a
stencil — so a poured town gets the CUT and not the FADE.** The gate's own comment says it:
*"LS turns on the soft-circle."*

**② ⛔ FLIPPING THE FLAG ALONE DOES NOT FIX IT — and this is the half that will waste a session.**
`boundary.js` (~`:218-224`) derives `BOUNDARY_CENTER_XZ` · `FADE_INNER/OUTER` · `STREET_FADE_*` from a
**static import of `lafayette-square/neighborhood_boundary.json`** (~`:17`), and
`BlockGeometryV2Debug` builds `FACE_FADE`/`BAND_FADE` from those module constants. Turn `useBoundary`
on for huron and it fades at **LS's 892 m radius on a 3539 m disc** — the falloff lands deep inside
the town and the rim still cuts. **Both halves, or neither.**

⭐ **The cure exists and this consumer does not use it.** `boundary.js`'s own header: *"`makeBoundary(nb)`
is the KIT factory: hand it ANY installation's `neighborhood_boundary.json` — loaded by id, never
imported here."* And `MapLayers`' `injectRadialFade` **already takes a per-scene `fade`**, with a comment
naming this exact hazard: *"the feather must track the ACTIVE scene's disc, or a poured scene's edge
content fades at LS's radius."* ⇒ **One file learned it; the other did not.** Follow `MapLayers`.

⛔ **THIRD INSTANCE OF ONE CLASS IN ONE DAY** — `MapLayers`' `natural=water` skip (`ROADMAP H-8`), the
`leisure=park` class skip (`ea13e35e`), and this. Perfect on the mould, broken on every town that is
not it. **The kit-shaped fix is per-scene resolution, never a second `useBoundary: true`.**

**Acceptance for B — separate from A's:** on a poured town (`huron`), the block/tile layers fade over
**that town's own** band, and LS renders **unchanged**. ⛔ An LS-only check proves nothing here by
construction — it is the one scene that already worked.

### ✅ THE OPEN PREMISE IS ANSWERED FROM THE COMMIT RECORD — `useBoundary: false` GUARDS NOTHING

*(Answered 2026-09-20 by the dispatched agent. It was never defensive, so there is nothing to route
around and no stop owed on this count.)* `64cb6387` set it false as an **explicit placeholder** and
says so in its own message — *"the soft-circle fade (boundary.js is still LS-module-hardcoded) remain
LS-only; a bake + boundary.js scene-param are the next pieces."* **The next piece landed the same
day** (`47e2ca81`, the `makeBoundary(nb)` factory) and this consumer was never rewired onto it.
⇒ **ASPIRATION filed as done**, per `CLAUDE.md`'s three causes.

⛔⛔ **AND A CONSTRAINT ON THE CURE THAT THE COMMIT RECORD CARRIES:** `47e2ca81` **removed** a static
per-scene registry that literally held `'hipointe-demun': makeBoundary(hpBoundaryData)` — to kill
cross-installation imports. **So the cure must resolve BY ID AT RUNTIME. ⛔ Do not re-add a static
map.** ⭐ `MapLayers` already does exactly that (`store.sceneBoundary` → `makeBoundary(...)` → `fade`),
and `genericSceneConfig(sceneBoundary)` already receives the boundary it needs. **The rails are laid.**

### ⛔⛔ AND THE CONSEQUENCE IS WORSE THAN "FADES AT THE WRONG RADIUS"

Measured radii: LS **892 m** · huron **3539 m** · altadena **4161 m** · HPDM **1251 m**, against LS's
band of inner 758 / outer 892. ⇒ Flipping the flag alone on huron does not misplace the falloff —
**every tile beyond 892 m goes to ALPHA 0. Roughly 90% of the town disappears.** State it that way;
"the wrong radius" undersells it into something someone might ship.

---

## 4. The chain — what this trusts, and what trusts this

**Upstream (what this trusts):** the `logarithmicDepthBuffer: true` decision on the Canvas, which
is **load-bearing for the 3D shots** and must not move. `ARCHITECTURE §7`'s corollary and the
memory `feedback_polygonoffset_inert_under_logdepth`.

**Downstream (what trusts this):** every operator judgement made in the Designer. ⛔ **This is the
sharp end and it is why the ticket matters more than a cosmetic flicker suggests:** Survey is where
the operator authors SHAPE by eye, and `ROADMAP`'s DoD everywhere is *"Jacob's eye on the real
render, never a proxy."* A view whose layer order is decided by depth-buffer luck is **a proxy
wearing the operator's own view as a disguise** — and it fails differently per camera angle, so two
looks at the same block can disagree.

⭐ **Convert the constraint into a check, per `BOZ §3`.** The constraint crosses topics (render
config ↔ 2D map stacking), so it belongs with the *operation*, not in either topic's prose:

> **`checks/claims-the-2d-map-does-not-depth-sort.mjs`** — a SOURCE-level check, parsing the values
> out of `MapLayers.jsx` rather than restating them, so it cannot go stale
> (`checks/claims-revert-field-coverage.mjs` is the pattern):
> ⛔⛔ **BOTH ASSERTIONS THIS SECTION ORIGINALLY SPECIFIED ARE STRUCK.** *"No two `PRI` entries share a
> value"* **cannot see the defect** — the conflict is WITHIN one slot, between meshes that correctly
> share it, so a total order on `PRI` passes green while 48% of huron still fights. And *"no material
> in the ortho view relies on `polygonOffset`"* was built on §1.1's premise, which is no longer
> established. ⭐ **A check that tests the table when the defect is in the population is the sharpest
> version of `POLYGON-FIRST §5` RULE 1b — measuring a proxy that correlates instead of the definition.**
>
> ⭐ **Jacob has ruled the scope: measure the OVERLAP, per town, reading each scene's `map.json`.**
> That is the definition, not a proxy for it — and it is per-town by construction, so LS's 0.9% can
> never stand in for huron's 48%.
>
> ⛔ **Mutation-test it** (`project_the_check_is_the_deliverable_mutation_test_it`): re-introduce a
> collision, and re-add a `polygonOffset` — each must fail it by name. A check nobody has seen fail
> proves nothing.

---

## 5. ⛔ Can the instrument SEE the change?

**Ask this before writing any gate** (`BOZ §3` item 6).

- **The flicker itself is a RENDER symptom with no artifact.** It is not in `shape.json`, not in
  `map.json`, not in the slab. ⛔ **So there is no disk artifact that can witness it, and a check
  that claims to measure the flicker is measuring something else.** Say so rather than building one.
- **The eye is the gate for the symptom.** The check in §4 gates the *cause* — a source property,
  which is exactly what a source-level check can hold.
- ⭐ **Which surface:** the Designer renders **live**, not from `shape.json`, so no re-bake, no
  re-pour and no re-freeze is needed to see a change. That is unusual here and it makes the loop
  fast — ⛔ but it also means nothing you do will show up in any frozen artifact, so do not go
  looking for it there.

---

## 6. The validation surface that already exists

⛔ **Do not build a parallel spike, a scratch renderer or an SVG harness**
(`feedback_no_parallel_pipeline_for_scenes`, `feedback_toy_is_the_construction_spike_surface`).

- **The `toy` scene is the controlled fixture** and it exists on disk (`cartograph/data/toy/clean/`
  carries `skeleton.json` + `overlay.json`). ⚠️ **PREMISE TO CONFIRM:** `cartograph/BACKLOG.md`
  records that *"the toy scene … is no longer reachable from Cartograph."* If that is still true,
  **say so and use `huron`** — do not build a way to reach toy as a side quest.
- **`docs/agents/AGENT-VALIDATION-SURFACES.md`** — read it for where to validate.
- The production path here **is** the Designer. Validate in it.

---

## 7. Bounds

- ✅ **In scope:** `src/cartograph/MapLayers.jsx`, `src/cartograph/BlockGeometryV2Debug.jsx`, the
  `sceneConfig` branches in `src/cartograph/CartographApp.jsx` (defect B only), and new checks under
  `checks/`. ⭐ `src/cartograph/boundary.js`'s `makeBoundary(nb)` factory is to be **used**, not
  changed.
- ⛔ **Out of scope:** the Canvas's `logarithmicDepthBuffer` setting · the 3D shot render path ·
  `BakedGround` / the slab / the bake · the "no fill tint" symptom · the highways.
- ⛔ **Canon is off-limits** unless Jacob says otherwise. ⭐ **One exception, and it is a
  correction rather than an addition:** `MapLayers.jsx`'s `PRI` comment says *"higher = on top via
  polygonOffset"* and `BlockGeometryV2Debug.jsx` calls polygonOffset *"the authoritative depth
  resolver."* **Both are false under this Canvas.** Correct the comments in the same commit that
  changes the mechanism — a false comment outlives its correction because it is shorter and reached
  first (`CLAUDE.md`, PRUNE AS YOU GO).
- **Commit gate:** name the register the change reaches, or say *"reaches no register"* outright.
  My read: this restores intended behaviour rather than adding a capability, so it likely reaches
  none — but that is yours to state, not to inherit.
- ⛔ **Surface scope drift, do not absorb it.** If the flicker turns out to be neither cause,
  **stop** — that is a finding, and a bigger one than the fix.

---

## 8. The instruction

**Read the canon sections and the code sites above — both — and tell Jacob what you found before
you build anything.** If the code contradicts this brief, **stop and flag him.** ⭐ The stop is the
deliverable.

⚠️ **Two of this brief's own claims are the likeliest to be wrong**, because they are the ones I
inferred rather than reproduced: that the flicker is *caused* by the inert `polygonOffset`, and
that the `PRI` collisions are unintended. **Neither is established.** Confirm or kill them first.

---

*Written 2026-09-20 (Boz), from Jacob's eye on huron and from source. ⛔ Not dispatched — Jacob
dispatches. The cure's shape is Jacob's own: a 2D map with no thickness should not be depth-sorting.*
