# Agent Validation Surfaces

> **Read this before drafting any brief that constructs or validates geometry, shaders, data-flow, or render output.** Jacob built these surfaces deliberately; using them is faster than re-inventing the validation. Going around them produces wasted Agent sessions.

This is a one-page index: **if your work touches X, validate it via Y, here's the production code path.** Each surface has a single positive directive ("use it this way") plus the guardrail boundary ("don't use it for this"). Cross-references go to the memory entries that codify the doctrine.

---

## ⛔⛔ §0 — BEFORE ANY OF THE SURFACES BELOW: TWO RULES ABOUT INSTRUMENTS

*These sit above the table because they are what makes every surface below readable. They
were both learned at full price, and one of them was already written down somewhere else
and went unread by two agents — which is why it is here, at the top, and not there.*

### ⭐ RULE 1 — WHEN A SURFACE DRAWS NOTHING, READ THE BROWSER CONSOLE BEFORE YOU REASON ABOUT RENDERERS, CAMERAS OR PHYSICS.

**A GLSL program that does not link is INVISIBLE, SILENT, AND IDENTICAL TO A MISSING MESH.**
The material exists. The mesh is in the tree. The geometry is correct. Nothing throws. And
the object is simply not there.

    THREE.WebGLProgram: Shader Error — VALIDATE_STATUS false
    Fragment shader is not compiled.
    ERROR: 0:2212: 'wH' : redefinition

⛔ **AND IT IS SILENT IN EVERY JS-SIDE CHECK.** Throughout six rounds of wrong diagnosis the
verifications kept reporting *"module LOADS ✓"* and *"term present ✓"*. **A module loading says
nothing about its GLSL linking, and a term being PRESENT says nothing about it being present
ONCE.** A non-linking program names its own failing line; inference did not, four times over.

▶ **The gate: LOAD the module and READ THE CONSOLE. A green parse proves nothing.**
▶ **The shapes that cause it here, all seen:** a rewrite that inserts a new block and leaves
  the old one below it (two copies of three declarations in one scope — a hard GLSL error) ·
  a `onBeforeCompile` patch that is not **idempotent**, so a second pass double-patches and
  reproduces the failure *nondeterministically* · lifting a helper out of a shader and leaving
  two downstream blocks reading the locals it removed (this turned the whole sky black) · a
  stray backtick inside a GLSL template literal (four times in one night) · calling a chunk
  three defines for Lambert/Phong and **not** `MeshStandardMaterial`, which renders **uniform
  white** — indistinguishable from a legitimate *"everything is lit"* reading.
⚠️ **A lift that leaves two copies behind has not lifted anything** — make the helper shared,
  do not paste the locals back.

### ⭐⭐ RULE 2 — A READING OF "NOTHING HAPPENED" IS THE ONE YOU MUST NEVER ACCEPT WITHOUT A SECOND, **DIFFERENTLY SHAPED** MEASUREMENT.

Four careful measurements in one evening were each aimed at the wrong moment or the wrong
object, and every one of them read as *nothing happened*:

| the instrument | what it actually measured |
|---|---|
| an operator eye-gate in **Preview** | a **stale bake** — Preview did not cache-bust, so the browser served the previous slab. The verdict came back the **opposite** of the truth. |
| a **`localStorage` probe** | a **fossil**. The value was written by a build that had since been reverted, and was read as live evidence. ▶ **A probe key must be unique per run.** |
| a **render counter on a fresh page load** | the **Designer**, correctly rendering zero of a component that only mounts in a shot. The number was right; the claim built on it was wrong. |
| the **same counter**, a frame later | nothing — **HMR had swapped the module while the instance persisted**, in the very frame the network proved the component was rendering. |
| **`gl.info.render.frame`** | render **PASSES**, not frames — 20 per frame here. Two instruments on one page read **88–99 "fps" and 8.5 fps at the same moment.** A **LIVENESS** gate; ⛔ never an FPS meter. |

⇒ **Every one of these was caught by a DIFFERENTLY SHAPED second measurement — network traffic,
causation, signed area — and never by a better version of the first.** Another counter is not a
second measurement. ⭐ **Ask what STATE the instrument is reading before you trust what it says.**

⭐ **And the positive form, from the night it was learned:** the instrument that finally ended
the guessing was a **20-line Node evaluation of the shader's own maths** with no browser at all
(`checks/water-layer-budget.mjs`). It found in one run what four rounds of screenshots could not
— that from an overhead camera water is **2% reflective**, so every reflection layer being tuned
was multiplied by 0.02 and could not be seen. ⛔ **No screenshot was ever going to say that.**
⚠️ And a **downscaled screenshot is not evidence about per-pixel behaviour** — downscaling
averages exactly the artifact you are claiming to have fixed.

---

## tl;dr — pick your surface

| The work touches… | Validation surface | Production path | Don't… |
|---|---|---|---|
| **Geometry / bake pipeline / derivers** (tileGround, bake-ground, bake-buildings, bake-lamps) | **Designer** on the town the work is about (live — hard-refresh) | `node cartograph/bake-ground.js --look=<id>` → Stage / Preview | …build scratch JS / SVG simulators that bypass the production path |
| **Shader / material / visibility at scale** | **Cartograph Stage** at Browse/Hero/Street | mount in Stage; scrub the camera | …assume Stage draws your material at all — **read §0 and §Two renderers first** |
| **Tree atlas / specimen authoring** | **Salon (`SpecimenViewport`)** | author + preview live in Salon | …change `treeAtlasMaterial.js` without firing in `SpecimenViewport.jsx` first |
| **Production parity / runtime-mount drift** | **Cartograph Preview** | Preview mounts the same components as production LS | …fork a Preview component from its production sibling |
| **Per-block measure / ribbon authoring** | **Designer + MeasureOverlay** on the town being authored | drag handles → `blockCustoms` writes | …add new fill/material UX without first checking if the existing handles already author it |
| **Instance-coord-shifted runtime state** (pedestal lifts, period material tags, hour gating) | **LS Stage** | mount in Cartograph Stage on LS | …declare a swap verified on a surface that never reads the coord-shifted field |

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
   ⛔ **AND BEFORE YOU BELIEVE EITHER SURFACE IS AT FAULT, READ §0.** Four explanations
   were built on this rig in one evening — a wrong renderer, a stacking bug, a
   dispatch that never ran, a 2% Fresnel cap — and **all four were diagnoses of a
   shader that was not running.**

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

**Per-scene reality:** every town has Designer (live) + Stage + production/Preview (baked). A construction change wants the Designer for fast live eyeballing; the bake + Stage/Preview for the at-scale and frozen-slab check.

**The construction file (tile era):** `src/lib/tileGround.js` (`buildTileGround`) — shared by Designer-live AND the bake, which is *why* "live == bake." (`buildBlockGeometryV2.js` is the **dead** figure-ground path, deleted at T4 — ignore it for tile work.)

> This section exists because the distinction keeps biting (the "Design looks identical after T1" scare; the "is LS Stage fixed too?" mixup, 2026-06-02). When you tell Jacob *where* to look, name the surface AND whether it's live or baked.

---

## Cartograph Stage

**What it is.** The live render surface inside Cartograph that mounts the **same components as production LS** (`<LafayetteScene />`, `<NeonBands>`, etc.) on the LS scene's data. Browse/Hero/Street camera shots are available; the operator scrubs through them to validate at the camera scales production users will see.

**Use it for.** Visual-quality shaders, materials, meshes, anything where the rendered output's **scale** matters. The proving ground for visibility-at-LS-scale (sub-pixel coverage, 24-bit z-fight, log-depth precision).

**Use it like this.** Land the shader/material in production code; mount in Cartograph Stage on the LS scene; scrub Browse → Hero → Street → Designer; confirm visible / correct at each. Only THEN push to production deploy.

**Do NOT.** Declare a shader/material ready from a close-up. Cartograph Stage at Browse/Hero/Street IS the proof (the 2026-05-13 neon shader incident: beautiful from ~70 m, invisible at LS Browse's 200–600 m; fixed by Browse-scale tuning).

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

**Use it for.** Per-block / per-IX overrides on any town.

**Use it like this.** Drag handles in Designer; verify the writes round-trip via `blockCustoms`; re-render is live (no re-derive for per-block measures).

**Do NOT.** Add new fill/material UX without first checking what existing handles already author ([[project_doped_artifact_placecard_edit_pattern]] — operator refines per entity, doesn't get a new panel per dimension).

---

## Brief-drafting pre-flight (Boz's tripwire)

Before drafting ANY brief, ask:

1. **Does the production code path already render somewhere you can eyeball?** (For cartograph work — the Designer, live. For trees — Salon.) If yes, validation routes through it; the brief should not include separate spike/scratch tooling that bypasses the production path.
2. **Is this geometry/data-flow, or visibility-at-scale, or instance-coord-shifted runtime?** Different surfaces for each — table at top of this doc.
3. **Are there prior failed paths in memory for this domain?** Grep `feedback_*` memory before designing.

Skipping the pre-flight produced two compounded misses on the 2026-05-28 ribbon-corner brief (designed scratch SVG tooling when the production path was already wired to a live surface). [[boz-the-continuous-coordinator]] carries the pre-flight rule.

---

*Living doc. When a new validation surface is built (or an existing one's posture shifts), update this index AND the memory entries below. Don't let the doctrine fragment back across scattered docs.*

*Memory cross-refs: [[feedback_no_parallel_pipeline_for_scenes]] · [[project_preview_equals_ls_literally]] · [[feedback_salon_preview_is_authoring_surface]]*
