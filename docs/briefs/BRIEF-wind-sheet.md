# BRIEF — The wind sheet: one shared field that carries the wind for everything

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-04
evict-when: texture-unit headroom is measured on every would-be consumer and reported; one wind field exists, generated once per frame over the town's own extent, driven by the one wind state, with one sampling API exported from the kit; a debug view shows it; its cost is measured in Preview per surface; the checks are green and mutation-tested; Jacob has seen it move. No consumer is migrated here except one optional proof.
-->

**Boz drafted this 2026-10-04 at Jacob's request; Jacob dispatches.** Jacob's design (`arborist/BACKLOG.md`, "ONE SHARED SHEET
CARRIES THE WIND", and "THE OVERHEAD IMPOSTOR, REDESIGNED"). He calls it the **universal triangulator layer**: one dense shared mesh
on which the wind is computed once, which every tree, grass blade and water surface reads instead of carrying its own vertex grid.

## Why it's its own package (Jacob, 2026-10-04)

It's a **shared authority, not a tree feature.** Built inside the tree work it would be shaped around trees, and grass and water would
later need a second wind: the duplicate-authority failure Phase 2 removes. So this package builds **the sheet and its API only**.
**Grain** (the overhead impostor redesign) is its first consumer and builds on it; grass and water migrate after.

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, yours, and not one a RUNNING session holds** (`ListAgents`; ask Jacob to
`/rename`). **Agent: FRESH.**
- The kit's renderer. ⛔ No pours or bakes; `node scripts/bake-in-flight.mjs` before saving anything the dev servers import; ports
  5173 / 5180; no new servers. Commit only your own paths, by name, through a private index if the shared one carries others' changes.
- ⚠️ Live in the same checkout: **Grain** (trees: `InstancedTrees.jsx`, `OverheadTrees.jsx`, `HeroImpostorTrees.jsx`,
  `impostorGeometry.js`, `treeAtlasMaterial.js`), **Plumb** (Preview, `qualityProfile.js`, `deployment.js`), **Lens** (camera,
  `Town.jsx`). Agree before touching their files (`ListAgents` → `SendMessage`). ⛔ Don't migrate the trees: that's Grain's.
- A kit change reaches the Ward only when its pin moves; if the sheet must run in the Ward, plan a pin move and say so. Push and
  bundle publish need Jacob's confirmation in your window.
- **Three-part fix** (`CLAUDE.md`); registers `cartograph/ARCHITECTURE.md` (the decision and the why) and `OPERATIONS.md` (any knob).

## Read first

1. The design: `arborist/BACKLOG.md`, the two 2026-10-04 sections named above.
2. **Today's wind, read in source:** the wind's **state** is shared: `treeSwayUniforms` in `src/components/treeAtlasMaterial.js`
   (`uWindForce`, `uWindIntensity`, gusts), driven each frame by `SwayDriver` (`src/components/InstancedTrees.jsx`) from the weather's
   wind (`_swayWindState`); the Arborist's previews set it too (`Grove.jsx`, `SpecimenViewport.jsx`). But **every consumer computes its
   own noise** from it: `OVERHEAD_WIND_BEGIN` in `treeAtlasMaterial.js` runs 3-octave fBm several times per card vertex per frame;
   `waterMaterial.js` / `WaterSurface.jsx` read `uWindForce` for their own waves; `grassMaterial.js` and `CloudDome.jsx` have their own
   motion. Re-derive the full consumer list with `git grep`; don't trust this one.
3. **The town's extent:** `src/components/sceneStencilState.js` (`ground.json#stencil`, *"NO FALLBACK BY DESIGN"*: an unset stencil
   means the size is unknown).
4. **The texture-unit ceiling:** `docs/briefs/BRIEF-texture-unit-headroom.md` and `ROADMAP H-24`: receivers already sit near the
   16-sampler limit (`MAX_TEXTURE_IMAGE_UNITS`); one sampler too many is `VALIDATE_STATUS false` and **nothing draws, silently**
   (`AGENT-VALIDATION-SURFACES §0`).
5. **The ladder and the deployment layer:** `cartograph/ARCHITECTURE.md §8` (the shared `DownsamplePyramid`), `src/lib/qualityProfile.js`
   and `deployment.json` (Phase 2 F): per-surface choices go through that one function, never a new regime.

## The work, in order (⛔ step 1 can stop the package)

1. **Measure texture-unit headroom first, on every would-be consumer** (tree cards and discs, mesh trees, grass, water, ground if it
   would read wind), per surface, including phone-lo's profile. Report samplers used against the limit. ⭐ Investigate whether the field
   can ride in a texture those shaders **already** sample (a spare channel), so it costs no new slot; Jacob floated this, unchecked. If
   a consumer has no headroom and no shared channel, **stop and report** before building.
2. **One field, generated once per frame:** a single full-screen-triangle pass into a small float (or half-float) render target covering
   the town's own extent from the stencil. ⛔ No constant size; derived from the scene (`CLAUDE.md` Layer 0, Class D). Driven by the one
   wind state above (⛔ no second wind authority). Its resolution is a rung chosen per surface through `qualityProfile.js`, the
   ladder idea applied to wind.
3. **Wind with memory, if it's affordable** (Jacob's reason for a sheet over per-vertex noise: momentum, gusts that build and decay,
   canopies that lag and sway back). Evaluate a ping-pong simulation against a stateless evaluated field; measure both in Preview and
   recommend one. ⛔ Don't decide it on taste.
4. **One sampling API exported from the kit** (re-exported through `Town.jsx`, so the Ward reaches it through its one entry): a GLSL
   chunk plus a uniform binder that any material injects, returning displacement (and any shimmer term) at a world XZ. Document its
   contract in `ARCHITECTURE.md`.
5. **A debug view** (e.g. a `?windDebug` overlay drawing the field over the map) so Jacob can see the gusts travel.
6. **Optional single proof consumer:** if it helps prove the API, migrate ONE non-tree consumer (water or grass), behind nothing, and
   say what changed visually. ⛔ Not the trees (Grain's).

## Out of scope

Migrating the trees (Grain, the overhead impostor redesign); migrating every other consumer (after this lands); Browse tilt and parallax
(the deferred camera-controls item).

## Can the instrument see it?

- `claims-the-wind-field-extent-is-the-towns`: the field's extent is read from the stencil, never a constant (mutation: hard-code a size,
  red).
- `claims-the-wind-has-one-authority`: the field is driven by the one wind state; a consumer that samples the field computes no wind
  noise of its own (mutation-tested).
- **Shader linking:** every material that injects the chunk links, on every surface (`node checks/claims-shader-fragments-declare-what-they-use.mjs`
  and a live `VALIDATE_STATUS` check). A chunk that fails to link makes things vanish silently.
- **Cost:** the field pass measured in Preview's gauges per surface (Phase 2 E/F instruments), GPU and main thread separately.

## Deliverable

The headroom report first (in chat to Jacob), then the field, the API, the debug view, the checks and the cost numbers. **Read this and
the code it cites, tell Jacob what you found, then build. If the code contradicts the brief, or step 1 says there's no room, stop and
flag him.**
