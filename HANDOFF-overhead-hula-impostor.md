# HANDOFF — the overhead "hula" impostor + its Salon perfecting surface

> **Agent: FRESH → name yourself.** **Foreground** (background writes are denied — you must be able to write). **Worktree** (`isolation: worktree`): the working tree on `curb-offset-draw` is dirty with unrelated HiPointe-DeMun tree work — isolate so you don't tangle with it. Docs you author land on trunk per the usual rule; code stays on your branch until Jacob merges.

## Route first (the CLAUDE.md gate — do not skip)
`ORIENTATION.md` → `arborist/README.md §⭐ START HERE` → then the canon sections named below. You are building a tree-render piece; the frame is **role-at-bake + optical parity** (`BATON-tree-render-next.md §"The doctrine to build to"`). Read it; do not re-litigate it.

## What you're building (scope — READ THIS, it is narrow on purpose)
**One thing: the OVERHEAD impostor's *look and motion*, and a Salon surface where Jacob perfects it looking straight down.** This is deliverable 1 of a two-part arc. You are **NOT** doing deliverable 2 (the density policy that swaps HiPointe's 7,167 trees to impostor / un-parking `lodForRole` / the Browse role oracle) — that is a separate brief. If you find yourself editing `bake-trees.js#PROM_THRESHOLD` or `InstancedTrees.jsx#lodForRole` routing, **stop — you've crossed the scope line.** Your job is the geometry + deformer + the Salon preview + the two knobs.

## The shape to build to (settled with Jacob this session — build to THIS, don't reinvent)
The overhead impostor is a stack of **horizontal "cake-layer" discs** (BATON's cake-layers), seen from directly above. Each disc-layer carries **three stacked deformations**, in order of how intrinsic they are to the tree:

1. **The ruche (the tree's resting shape).** The disc's rim is **ruched** — gathered into a *fixed* set of scallops/folds around its circumference: a **standing** angular corrugation `y(θ) = A_ruffle · sin(k·θ + φ)`, with **NO travel term** (`−ωt`) — the folds are anchored, fold #3 stays fold #3. `φ` (fold phase) is **per-instance, derived from the existing per-placement `rotY`** so no two trees' ruffles line up (this is the anti-stamping lever — overhead shows ALL trees at once, a synced grid is the failure). The fold pattern can be **baked into the disc-ring geometry** (a scalloped ring); the shader only *flexes* its amplitude over time. Cheaper and rock-stable.
2. **The hula (the tree's own gentle life).** Each whole disc **rocks/bends on a horizontal axis** — low-frequency, non-directional, **phase-offset per layer up the stack** and base-anchored (amplitude grows with height like real wood; the trunk-height layers barely move, the crown rocks). This is the disc the ruffle rides on.
3. **The wind blows across *that* (the environment, directional).** The **shared** wind field — `treeSwayUniforms.uWindForce.xz` / `uWindIntensity` / the gust uniforms, the **SAME** ones the mesh trees use (locked doctrine: one weather system, mesh + impostor together — do **NOT** invent a separate wind) — crosses the ruched, hula-ing form: the discs lean/ripple **downwind**, the windward edge of the ruffle catches it, gusts pulse across. The ruche + hula are precisely what gives the wind *something to catch* — a smooth disc has nothing.

**The payoff you are protecting:** from directly overhead the wind has a compass direction, and all trees lean + gust the *same* way at once — you see the weather move across the neighborhood. That legibility is the point of the overhead impostor; the two intrinsic deformers exist so the wind reads on it and so 7,167 discs don't stamp.

## Where the code lives (exact anchors — read these, build with them, don't fork them)
- **The deformer shader family to extend:** `src/components/treeAtlasMaterial.js` — `cantDeformBasis` (~L335, the existing per-instance lean/twist/wander rest-pose deform), its `uDeformLeanRange/TwistRange/WanderRange/Seed` uniforms (~L287-290), and `injectFoliageSway` (~L173, where `treeSwayUniforms` bind + the per-`aWindTier` sway math ~L436-510). Your ruche-flex + hula-rock are **new animated deformers in this same vertex path**, layered *before* the wind sway (wind oscillates around the deformed rest pose, exactly as `cantRot` does today ~L401-403). The overhead disc geometry already carries `aTreeHeightNorm` (layer height, base-anchored) and `aWindTier` — reuse them.
- **The impostor geometry builder:** `src/components/impostorGeometry.js` (`buildImpostorGeometry`, the hero 2-quad `CROSS_PLANES` cake). **The overhead layer is NOT a cross** — a cross has no rim to ruffle. Build a sibling `buildOverheadHulaGeometry(rec, season)` (or a mode flag) that emits **tessellated ruched disc-rings** (~16–24 perimeter segments per layer, a handful of layers). Same per-vertex attributes, same shared atlas material.
- **The runtime instancer:** `src/components/InstancedTrees.jsx#ImpostorSpecies` (~L427) — note it already bakes each tree's `rotY` into the instance matrix (~L445), which is your free per-instance fold phase.
- **The overhead capture / framing (for skinning, see sequencing below):** `src/arborist/SpecimenViewport.jsx#presetFraming('browse')` (~L105) is **already a literal top-down plan view** (`topDown:true`, camera overhead). `src/components/captureImpostor.js#renderTreeToTexture` is the front-on RTT; an overhead variant reuses the same save/restore with the browse framing.
- **The Salon plate + preview pattern:** `src/arborist/ChassisPlate.jsx` (plate props: `name/label/selected/approved/onPick/onApprove`, the ★ Approve gate), `src/arborist/SalonWorkstage.jsx` (the plate-rack), `src/arborist/stores/useArboristStore.js` — the composition slice **already has a `deformer: {}` slot** (~L565, L736) and `setSalonSlotParams` (~L683) with autosave (~L804). Author the two knobs into `composition.deformer` (or a `composition.impostor.overhead` sub-block) via that existing machinery — **autosave for free**.

## Build order (perfect-the-motion first; Jacob's eye is the gate)
1. **Geometry:** `buildOverheadHulaGeometry` — the ruched disc-ring stack. Bake the standing fold pattern into the ring; stamp `aTreeHeightNorm` per layer.
2. **Shader:** the ruche-flex + hula-rock deformers in `treeAtlasMaterial.js`, layered before the wind sway, driven by new `uDeform*` ranges + the shared wind uniforms. Fold phase off the instance matrix (as `cantAnchorXZ` already does ~L389).
3. **Salon overhead preview + 2 knobs:** a preview framed with `presetFraming('browse')` (straight down) and **two sliders — ruffle depth, hula amount** — writing to `composition.deformer` via `setSalonSlotParams` (autosaves). A ★ Approve plate like the others. This is the surface Jacob perfects on. **Skin the discs with the existing shared atlas material first** (works today) so the *motion* is perfectable immediately; the captured top-down RTT skin (real canopy-from-above, better parity) is the **very next pass on the same geometry** — note it, don't block motion-perfecting on it.
4. **Wire the shared wind** so a live gust blows through the preview while Jacob dials the resting character.

## The doctrine rails (violating these is the predictable failure)
- **Knobs, not hardcoded ramps** — ruffle depth / hula amount / wavelengths are authored uniforms (`uDeform*Range` family), never baked constants (`feedback-no-hardcoded-ramps-use-knobs`).
- **Shared wind only** — `treeSwayUniforms`, never a new wind (`BATON §"Wind = the real weather, shared"`).
- **Anchored folds, no traveling wave** — Jacob explicitly rejected the `−ωt` around-the-rim "swimming"; it looks artificial across 7,167 trees. Standing ruche that *flexes*.
- **Per-instance phase off `rotY`** — the anti-stamping guarantee for the overhead.
- **Optical parity** — the discs ride the same DoF/fog/bloom/grade as real geo (shared material, single program). Don't fork the optics.
- **Surface-metaphor → shape** — the spec above IS the translation; don't go hunting reference images (`feedback_no_reference_image_hunting`).

## Eye-gate + hand-off back to Jacob
Done = **in the Salon, overhead preview, looking straight down:** the ruched discs flex, the hula rocks, and a live shared-wind gust leans + ripples them downwind; the two knobs change the resting character; per-tree fold phase visibly differs (no stamped grid). Then **hand the dials to Jacob to perfect** — the numbers are his eye's call, not yours. Report what you built + the knob ranges; do not claim "confirmed" without driving the actual preview (`feedback_dont_claim_confirmed_without_verifying`).

## Commit boundaries
Worktree branch; **canon docs are off-limits** (Boz folds the outcome into `arborist/` canon + `BATON-tree-render-next.md` after Jacob eye-gates). Commit only your own files (selective add). Surface any scope drift to Jacob before crossing it (`feedback_baby_must_surface_scope_drift`).
