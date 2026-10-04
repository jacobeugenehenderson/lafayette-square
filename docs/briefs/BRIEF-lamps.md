# BRIEF — Lamps: a standard lamppost for the kit, the model a town's choice, and lamps that cost what they should

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-04
evict-when: a low-poly standard lamppost is the kit default and every town but LS uses it; the lamp model is a town's authored choice (LS keeps its Victorian by declaration); off-screen lamps are not drawn; lamp shadows are measured and decided; the lamp cost is re-measured on LS and Huron with Grain's probe; the bulb glows on the new model; checks green and mutation-tested; Jacob has eyed the standard post by day and night
-->

**Boz drafted this 2026-10-04 at Jacob's request; Jacob dispatches.**

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, yours, and not one a RUNNING session holds** (`ListAgents`; ask Jacob to
`/rename`). **Agent: FRESH.**
- The kit's renderer and lamp data. ⛔ No pours; `node scripts/bake-in-flight.mjs` before saving anything the dev servers import; ports
  5173 / 5180. Commit only your own paths through a private index (others' changes may sit in the shared index).
- ⚠️ Live in the same checkout: **Grain** (overhead trees), **Gale** (the wind sheet), **Plumb** (Preview), **Lens** (camera). Agree
  before touching their files (`ListAgents` → `SendMessage`).
- A kit change reaches the Ward at the next pin move; batch it, and the push and bundle publish need Jacob's confirmation in your
  window. Re-bakes are Jacob's (or Boz's batch, on his go).
- **Three-part fix** (`CLAUDE.md`); registers `cartograph/OPERATIONS.md` ("Lamps"), `cartograph/FEATURES.md`, `cartograph/ARCHITECTURE.md`.

## Why (measured 2026-10-04, Grain's forensic, `scratch/tree-cost/VERDICT.md`)

- **Lamps cost more than trees in Huron's Hero view:** lamps off −53.4 ms vs trees off −15.4 ms (this desktop's GPU); −40 ms in Huron
  Browse. 4,304 triangles per lamp, drawn again in the shadow pass(es): ×2 in Browse, ×3 in Hero. This also accounts for Plumb's
  unexplained 2.5M-triangle gap.
- **The poured towns are ~95%+ calculated lamps** (Jacob): HPDM 1,078 of 1,274 derived · Huron 3,262 of 3,292 · Provincetown 1,765 of
  1,766 · LS 0 of 580 (80 authored, 500 OSM; `design.json#lamps.derive: false`). ▶ re-derive from `public/baked/<town>/lamps.json`.
- **Read in source** (`src/components/StreetLights.jsx`): one model for every lamp in every town, `kitUrl('models/lamp-posts/victorian-lamp.glb')`;
  one instanced mesh with `castShadow` and **`frustumCulled={false}`**, so every lamp draws every frame, in every pass, on screen or not.

## Jacob's rulings (2026-10-04)

- **The Victorian torchiere is Lafayette Square's specialised choice, not the kit's lamp.** *"We already need a new 'non torchiere'
  style lamppost with a more standard design; LS is a specialized option."* ⇒ a **standard lamppost is the kit default**.
- **"The lamp can switch everywhere but LS."** Every town but LS takes the standard post; LS keeps its Victorian, **as its authored
  choice** (declared in LS's Look or instance, never by a town-name check: `CLAUDE.md` Layer 0).
- **The new post is built procedurally for now** (option a): a clean, low-poly pole, arm and head from basic geometry, with no licensing
  question. It can be upgraded later through the same library slot (a sourced or artist-made model).
- **The eventual home is a "street furniture salon"**, where both kinds (and more) are authored, as the Arborist's Salon does for trees.
  ⛔ Record it; don't build it.

## The work

1. **Measure first, with Grain's probe** (`node scratch/tree-cost/probe.mjs`; extend it for a lamps toggle if needed, in `scratch/`):
   LS and Huron, Browse and Hero, desktop and phone-hi. The baseline is today's lamps, then each remedy separately: culled, shadows off,
   and a low-poly model. Report the deltas in the verdict's table format. ⛔ Every ms is this desktop's GPU.
2. **The standard lamppost, procedural, low-poly** (target: hundreds of triangles, not thousands; say the number). ⚠️ **The bulb glow
   depends on the model:** today the Victorian's glass mask (`transmissionMap`) becomes the emissive map that the **Bulb** knob drives,
   and the halo and glow sit at the lamp head. The new post needs a lit part (a material slot or mask) the same pipeline drives, and its
   head height must match what the pools, halo and glow assume. ⛔ No post that silently doesn't glow.
3. **The lamp model is a town's authored choice:** a library of models (Victorian, standard) keyed by id; the town's Look or instance
   names one; **absent ⇒ the standard post**, stated, never inferred. LS declares Victorian. ⛔ No `if town === 'lafayette-square'`.
4. **Off-screen lamps aren't drawn.** Replace `frustumCulled={false}` with real culling (e.g. tile the lamps into a few instanced meshes
   with bounds), measured.
5. **Shadows: measure, then decide with Jacob.** A lamp post's shadow is a thin line and the light pools are already baked into the
   ground. Options: no lamp shadows, or only near ones. Bring the measured saving and before/after screenshots; ⛔ don't decide it alone.
   It changes the look.

## Out of scope

The street furniture salon (recorded only); derived-lamp density and spacing (already authorable: `lamps.derive`, the spacing prior;
creative/data, not this package's).

## The chain

- **Trusts:** `public/baked/<town>/lamps.json` (positions, sources, `reach`), the ground's baked light pools (`ground.poolmap.png`), the
  `lampPool.js` light model and Stage's Light Sources knobs (Bulb, Glow, Glow size).
- **Trusted by:** every town's night look, Preview's measurements and diagnosis, the Ward.

## Can the instrument see it?

- `claims-a-town-chooses-its-lamp`: the model comes from the town's declaration; absent ⇒ the standard post; no town-name branch
  (mutation: a name check, red).
- `claims-lamps-are-culled`: no lamp instanced mesh has `frustumCulled={false}` (mutation-tested).
- The bulb glows on every model in the library (a live check, or a render probe at night).
- Shader linking on every surface (`node checks/claims-shader-fragments-declare-what-they-use.mjs`).
- The eye: Jacob, day and night, on two towns (Huron and LS), before and after.

## Deliverable

The measured table first (in chat to Jacob), then the standard post, the per-town choice, culling, and the shadow decision brought to
him. **Read this and the code it cites, tell Jacob what you found, then build. If the code contradicts the brief, stop and flag him.**
