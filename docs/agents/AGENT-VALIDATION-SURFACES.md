# Agent Validation Surfaces

> **Read this before drafting any brief that constructs or validates geometry, shaders, data-flow, or render output.** Jacob built these surfaces deliberately; using them is faster than re-inventing the validation. Going around them produces wasted Agent sessions.

This is a one-page index: **if your work touches X, validate it via Y, here's the production code path.** Each surface has a single positive directive ("use it this way") plus the guardrail boundary ("don't use it for this"). Cross-references go to the memory entries that codify the doctrine.

---

## tl;dr — pick your surface

| The work touches… | Validation surface | Production path | Don't… |
|---|---|---|---|
| **Geometry / bake pipeline / derivers** (buildBlockGeometryV2, bake-ground, bake-buildings, bake-lamps) | **Toy** in Designer (or Stage) | `node cartograph/bake-ground.js` → renders in Toy designer | …build scratch JS / SVG simulators that bypass the production path |
| **Shader / material / visibility at scale** | **Cartograph Stage** at Browse/Hero/Street | mount in Stage; scrub the camera | …assume Stage draws your material at all — **read §Two renderers first** |
| **Tree atlas / specimen authoring** | **Salon (`SpecimenViewport`)** | author + preview live in Salon | …change `treeAtlasMaterial.js` without firing in `SpecimenViewport.jsx` first |
| **Production parity / runtime-mount drift** | **Cartograph Preview** | Preview mounts the same components as production LS | …fork a Preview component from its production sibling |
| **Per-block measure / ribbon authoring** | **Designer + MeasureOverlay** on toy or LS | drag handles → `blockCustoms` writes | …add new fill/material UX without first checking if the existing handles already author it |
| **Instance-coord-shifted runtime state** (pedestal lifts, period material tags, hour gating) | **LS Stage**, not toy | mount in Cartograph Stage on LS | …declare a swap "verified in toy" if it reads a coord-shifted field |

---

## ⛔⛔ TWO RENDERERS, ONE MAP — CHECK WHICH ONE DRAWS YOUR THING

**The kit renders the same map twice, from two different sources, on purpose:**

| | reads | mounts |
|---|---|---|
| **RUNTIME** (app, Preview) | the baked slab — `public/baked/<look>/ground.*` | `BakedGround.jsx` |
| **DESIGNER / STAGE** | `cartograph/data/<scene>/clean/map.json`, live | `MapLayers.jsx` |

⭐ That is a feature: the Designer shows edits before a bake, and the runtime shows
what actually ships. ⛔ **But it means a population can be drawn by DIFFERENT CODE
on the two surfaces, and nothing says so.** A material you change in `src/components/`
may simply not be on screen in the Stage.

### ⚠️ THE INSTANCE, 2026-09-20 — an evening, and it is the cheapest possible lesson
`MapLayers.jsx` painted the lake with `makeFlatMat` — a flat colour swatch — while
`BakedGround` painted the same lake with the kit water shader. Nothing errored.
**Every change to the water was invisible in the Stage, which is where the operator
judges.** Four rounds of tuning went into a material that was not on screen, and the
measurements quoted to Jacob were true about code that was not running in his window.
⭐ The tell, in hindsight, was "I hard refreshed and nothing's changed" — ⛔ **when a
change does not appear, ask WHICH RENDERER is drawing it before you ask what is wrong
with the change.**

### ▶ THE RULE
1. **Before validating a material, grep the other surface for the thing you are
   changing.** `grep -n "<YourThing\|makeFlatMat" src/cartograph/MapLayers.jsx`.
2. **Where both surfaces draw the same object, they mount the SAME COMPONENT** —
   not two materials that happen to agree. ⛔ A shared material FACTORY is not
   enough: the per-frame uniform driving is half the material, and that is exactly
   the half that diverged. `WaterSurface.jsx` is the pattern.
3. ▶ `node checks/claims-both-surfaces-draw-the-same-water.mjs` holds it for water.
   ⚠️ **AND THE MEASUREMENT TRAPS, 2026-09-20 — four of them in one evening, all
   the same shape: an instrument reporting NOTHING HAPPENED, aimed wrongly.**
   A stale Preview · a leftover `localStorage` probe read as live · a render counter
   on a FRESH LOAD (the Cartograph opens in DESIGNER, so 0 renders is correct there)
   · and a counter that read 0 in the very frame the NETWORK proved the component
   was rendering, because HMR had swapped the module while the instance persisted.
   ⭐ **A "nothing happened" reading is the one you must never accept without a
   second, DIFFERENTLY SHAPED measurement.** Network and causation are differently
   shaped; another counter is not.
   ▶ For this rig: causation — a slab-only re-bake showing up in Stage proves Stage
   consumes the slab. Network — a shot fetches `baked/<look>/ground.colormap.png`,
   which is loaded *inside* `GroundMeshes`.
   ✅ **RESOLVED, and the resolution is the biggest lesson of the night.** The
   slab's water appeared to be missing in the Cartograph, and four explanations
   were built on that — a wrong renderer, a stacking bug, a dispatch that never
   ran, a 2% Fresnel cap. **All four were diagnoses of a shader that was not
   running.** The kit water fragment shader had a duplicated block
   (`'wH' : redefinition`), so the program never linked and the material drew
   NOTHING — which looks exactly like a missing mesh and is silent in every
   JS-side check.
   ⛔ **WHEN A SURFACE DRAWS NOTHING, READ THE BROWSER CONSOLE BEFORE YOU REASON
   ABOUT RENDERERS, CAMERAS OR PHYSICS.** A non-linking program names its own
   failing line; six rounds of inference did not. And note what the JS checks said
   throughout: *"module LOADS ✓"*, *"term present ✓"*. **A module loading says
   nothing about its GLSL linking, and a term being present says nothing about it
   being present ONCE.**

⚠️ And the corollary for eye-gating: **Preview and Stage are not interchangeable.**
Preview mounts the production components; Stage mounts the Designer's. Sending an
operator to the "wrong" one to judge a look is not a preference — it can be a
different picture.

## ⭐ Live vs baked — which surface shows what (READ FIRST; the recurring confusion)

Most "I changed it but nothing moved" / "it looks identical" scares are *surface ↔ live-vs-bake mismatch*, not a broken change. Match the surface to where the change lives:

| Surface | Ground construction comes from | A `tileGround.js` change shows… |
|---|---|---|
| **Designer** (`BlockGeometryV2Debug`) | **LIVE** — calls `buildTileGround` every render. The code comment says it: *"live == bake (both call buildTileGround)."* | …on a **hard-refresh. No bake needed.** |
| **LS production / Cartograph Preview** | **BAKED** — reads `public/baked/<look>/ground.*` | …only **after `node cartograph/bake-ground.js --look=<id>`** + refresh |
| **LS Stage** | baked layers + live-wire authored channels (it auto-rebakes on authoring) | …after its re-bake |

**Per-scene reality (verified 2026-06-02):**
- **Toy → Designer is the only usable surface, and it's LIVE.** The `MAP_REGISTRY` has a toy `StageEnvironment` *stub*, but `hasAerial:false / hasHero:false` and it is **not hooked up** (known flag). So to eyeball a toy construction change: **hard-refresh the Toy Designer** — the bake is irrelevant to what you see there. (Baking toy is harmless but does *not* drive the Designer.)
- **LS → Designer (live) + Stage + production/Preview (baked).** A construction change wants the Designer for fast live eyeballing; the bake + Stage/Preview for the at-scale and frozen-slab check.

**The construction file (tile era):** `src/lib/tileGround.js` (`buildTileGround`) — shared by Designer-live AND the bake, which is *why* "live == bake." (`buildBlockGeometryV2.js` is the **dead** figure-ground path, deleted at T4 — ignore it for tile work.)

> This section exists because the distinction keeps biting (the "Design looks identical after T1" scare; the "is LS Stage fixed too?" mixup, 2026-06-02). When you tell Jacob *where* to look, name the surface AND whether it's live or baked.

---

## Toy

**What it is.** A 4+4 grid of 9 authored blocks in `src/data/toy/toy-input.json` (re-derived to `toy-ribbons.json` via `cartograph/derive-toy.js`), plus boundary stencil + lamps + buildings — the kit's design surface and the cleanest place in cartograph to develop emitter + geometry changes. Full V2 pipeline live (block fills, ribbons, corner authoring kit, smoothing, curb, bake). Three deliberate topology irregularities: VW3's bent chain, HW3's 45° saw-tooth jog, a dead-end stub. Plus Benton-toy teardrop (Type-A closed-chain) and Waverly-toy couplet (Type-B divided pair).

**⛔ REACH IT AT THE URL: `cartograph.html?scene=toy`.** Toy is DELIBERATELY absent from the neighborhood picker (the Extent hub) and the Look pulldown — those are for real, map-based neighborhoods, and **toy has no map and never will**: it's a purpose-built, simplified, *smaller-than-a-real-neighborhood* fixture so geometry is easier to work out. The URL is its home; don't look for it in a menu (2026-07-11).

**⛔ BOSSY DIRECTIVE — intractable geometry goes to toy.** When a corner / block / ribbon / curb / tile-ground problem resists a fix on LS or a real hood, STOP fighting it at full scale. Reproduce it in **toy (`?scene=toy`)** — 9 authored blocks + the three deliberate topology irregularities give you a minimal, deterministic, **hard-refresh-live** surface with no bake in the loop. The hardest geometry code (`tileGround.js`, the derivers, the corner/block emitters) is written and reasoned against toy as *the* controlled case — meet the problem there, shrink it, solve it, then flip the flag on for LS. This is what toy is *for*; it is not a fallback, it is the first move.

**Use it for.** Geometry, construction, data-flow, derivers, deterministic-bake behavior. The production code path runs on toy identically to LS: `node cartograph/bake-ground.js` bakes toy via the scene-parametric pipeline (`c109a9f`); results render live in Toy designer; per-fixture diagnostics inspectable through the same console/overlays as LS.

**Use it like this.**
1. Land code changes directly in production files (`src/lib/buildBlockGeometryV2.js`, `cartograph/bake-ground.js`, etc.) behind a flag (`opts.useX`).
2. Turn the flag on **for toy only**, off for LS, in the scene-parametric path.
3. Run `node cartograph/bake-ground.js` (it bakes both scenes; check `dist/baked/toy/`).
4. Open Toy designer; look at the rendered result.
5. If clean: flip the flag on for LS, re-bake, eyeball LS.

**Do NOT.**
- Build scratch JS that simulates the construction outside the production code path. ([[feedback_toy_is_the_construction_spike_surface]] — the positive directive missed twice on 2026-05-28.)
- Generate scratch SVGs when the bake produces renderable artifacts. The doctrine "toy IS a scene, not a parallel pipeline" ([[feedback_no_parallel_pipeline_for_scenes]]) applies to spike tooling too.
- Declare a shader/material/visibility result "good in toy" — toy is ~36m × 68m with camera ~70m away; LS Browse is 200–600m altitude. ([[feedback_toy_not_proving_ground_for_ls_visibility]].)
- Trust a verification that depends on instance-coord-shifted data (pedestal lifts, period tags, hour gating). ([[feedback_toy_hides_instance_data_bugs]].)

**Authoring data:** canonical source is `src/data/toy/toy-input.json` → `derive-toy.js` → `src/data/toy/toy-ribbons.json`. Per-IX measure overrides go through `blockCustoms` via the Measure tool (no `derive-toy.js` rerun). `cartograph/data/toy/raw/centerlines.json` is **vestigial** ([[project_toy_canonical_input_path]]).

---

## Cartograph Stage

**What it is.** The live render surface inside Cartograph that mounts the **same components as production LS** (`<LafayetteScene />`, `<NeonBands>`, etc.) on the LS scene's data. Browse/Hero/Street camera shots are available; the operator scrubs through them to validate at the camera scales production users will see.

**Use it for.** Visual-quality shaders, materials, meshes, anything where the rendered output's **scale** matters. The proving ground for visibility-at-LS-scale (sub-pixel coverage, 24-bit z-fight, log-depth precision).

**Use it like this.** Land the shader/material in production code; mount in Cartograph Stage on the LS scene; scrub Browse → Hero → Street → Designer; confirm visible / correct at each. Only THEN push to production deploy.

**Do NOT.** Declare ready from toy (see Toy's "Do NOT"). Cartograph Stage IS the proof; toy is the form-iteration step before it.

Reference: [[feedback_toy_not_proving_ground_for_ls_visibility]] (the 2026-05-13 neon shader incident — beautiful in toy, invisible in LS production; fixed by Browse-scale tuning).

---

## Cartograph Preview

**What it is.** The production-parity surface inside Cartograph. Preview and production LS are two consumers of the same slab with identical render trees; Preview adds inspection bolt-ons over the top ([[project_preview_equals_ls_literally]]).

**Use it for.** Validating that a production change works the same way in the deployed LS app. Catching runtime-mount drift between Cartograph and production. Verifying Browse altitude / camera framing changes ([[project_camera_framing_slab_contract]]).

**Use it like this.** Same components, same slab. If Preview shows X and LS shows Y, that's drift to track down — usually a forked component or a hardcoded value where the slab should be the truth ([[project_slab_is_the_instance_identity]]).

**Do NOT.** Fork a Preview component from its production sibling for "Preview-only inspection logic" — bolt-ons go on top of the shared tree, not via fork.

---

## Salon (SpecimenViewport)

**What it is.** The tree-atlas authoring surface. Where vendor specimens become bake-ready trees through atlas refinement + canopy tuning + season palette authoring.

**Use it for.** Any change to `treeAtlasMaterial.js`, atlas UV recovery, leaf shader, bark sampling, season-curve palettes. Tree pipeline changes that affect the rendered specimen.

**Use it like this.** Author + preview live in `SpecimenViewport.jsx`. Every shader change fires there first; if it's invisible in Salon, it's undeployed downstream.

**Do NOT.** Change `treeAtlasMaterial.js` without firing the change in `SpecimenViewport.jsx` preview ([[feedback_salon_preview_is_authoring_surface]]).

---

## Designer + MeasureOverlay

**What it is.** The per-block authoring surface. Operator drags handles (`pavementHW`, `treelawnOuter`); ctrl/right-click collapses/inserts strip dividers; corner-radius authoring kit (`CornerEditHandles.jsx`) sets per-IX radii. Writes flow through `blockCustoms[blockKey][edgeOrd]`.

**Use it for.** Per-block / per-IX overrides on either toy or LS. The right surface for authoring §-cases (lopsided IX, sharp-radius IX, shallow-leg) into toy as test fixtures.

**Use it like this.** Drag handles in Designer; verify the writes round-trip via `blockCustoms`; re-render is live (no `derive-toy.js` rerun for per-block measures).

**Do NOT.** Add new fill/material UX without first checking what existing handles already author ([[project_doped_artifact_placecard_edit_pattern]] — operator refines per entity, doesn't get a new panel per dimension).

---

## Brief-drafting pre-flight (Boz's tripwire)

Before drafting ANY brief, ask:

1. **Does the production code path already run on a controlled fixture?** (Almost always yes for cartograph work — Toy. For trees — Salon.) If yes, validation routes through that fixture; the brief should not include separate spike/scratch tooling that bypasses the production path.
2. **Is this geometry/data-flow, or visibility-at-scale, or instance-coord-shifted runtime?** Different surfaces for each — table at top of this doc.
3. **Are there prior failed paths in memory for this domain?** Grep `feedback_*` memory before designing.

Skipping the pre-flight produced two compounded misses on the 2026-05-28 ribbon-corner brief (designed scratch SVG tooling when toy was already wired). [[feedback_toy_is_the_construction_spike_surface]] crystallizes the lesson; [[boz-the-continuous-coordinator]] carries the pre-flight rule.

---

*Living doc. When a new validation surface is built (or an existing one's posture shifts), update this index AND the memory entries below. Don't let the doctrine fragment back across scattered docs.*

*Memory cross-refs: [[feedback_toy_is_the_construction_spike_surface]] · [[feedback_no_parallel_pipeline_for_scenes]] · [[feedback_toy_not_proving_ground_for_ls_visibility]] · [[feedback_toy_hides_instance_data_bugs]] · [[project_toy_canonical_input_path]] · [[project_preview_equals_ls_literally]] · [[feedback_salon_preview_is_authoring_surface]]*
