# Handoff — Hybrid Buildings Bake (slab mesh + per-building index)

> Dispatch-ready brief. Resolves LS punchlist **L1.3** in the *hybrid* direction:
> bake the merged building geometry for draw-call perf **plus a per-building index
> sidecar** so the runtime resolves identity (click / neon / place state) against the
> slab instead of rebuilding from `src/data/buildings.json` at runtime.

**You are the dispatched agent. Name yourself** — pick it independently, from your own
read of the work; the only constraints are that it be novel and NOT already used in this
project (check the claimed roster in `NOTES.md` / `BACKLOG.md` / commits before you choose).
No suggested themes — the name is yours. You own this end-to-end across the phases below. This is a *load-bearing, multi-file* migration
touching the producer, a new consumer, the neon path, and the production cutover — so
it is **strictly sub-phased**. Do **not** bundle producer geometry changes with the
consumer swap; that hides which layer broke what (the D.3 bundling lesson).

---

## Why this exists (prior context — don't re-derive)

A parity session (branch `cartograph-looks-pass-ab`) wired four authored channels into
production — `InstancedTrees`, `StageFog`, `LampGlowDriver`, and the hero camera now
consumes authored `heroKeyframes` via `heroKeyframeAnim` — and switched **Preview** from
the baked merged-mesh (`BakedBuildings`) to the **live `LafayetteScene`** so Preview
emulates what production actually ships.

Net effect: production renders buildings live from `src/data/buildings.json` at runtime,
and the baked `buildings.json` merged mesh now has **zero consumers** (`BakedBuildings`
was its last reader). That violates the slab doctrine ("production trusts the slab
unconditionally, never reaches into source") and leaves `bake-buildings.js` producing
dead output.

**The blocker that kept buildings live** (`SLAB-CONTRACT.md §6.3`, `ls/FEATURES.md:83`):
the merged mesh is sliced by *material group* (foundation / wall / roof), not by
building, so it throws away per-building identity — and the LS app is built on that
identity (click-to-select, neon open-by-hours, place state, place cards). A flat mesh
can't answer "which building did the user tap?"

## The shape of the fix

Bake the merged geometry for draw-call perf **plus a per-building index sidecar** so the
runtime resolves identity against the slab. Production *and* Preview then consume one
`SlabBuildings` consumer; nobody imports the buildings source at runtime.

---

## Phase 0 — Artifact inspection (mandatory first; geometry-brief rule)

Before writing levers, dump and read the real artifacts:

- `public/baked/lafayette-square/buildings.json` group structure + `.bin` section offsets.
- The `for (const b of buildings)` loop in `cartograph/bake-buildings.js` (~530): confirm
  exactly where each building's wall / foundation / roof verts append into the
  per-material buckets — that append site is where you record per-building
  `[startVert, vertCount]` per group. Manifest write ~731; `buildingCount` ~745.
- `src/components/LafayetteScene.jsx`: `Building` (~596) material (roughness 0.9 /
  metalness 0.05 / palette albedo / **night color shift** / textures / emissive-on-select),
  `Foundations` (~342), the exported `getFoundationHeight` / `getRoofPeakHeight`.
- `src/components/SceneNeon.jsx`: `useNeonLookup` + `openPlaces` (needs per-building
  `baseY`, `groundYRaw`, `category`).
- `src/preview/BakedBuildings.jsx`: the existing merged-mesh material — model the new
  consumer's *geometry loading* on it, but **match the live material**, not BakedBuildings'
  simplified vertex-color path.

Write a 10-line findings note in this brief's status before starting Phase A.
**Surface anything here that contradicts this brief.**

## Phase A — Producer: emit the per-building index (no consumer change)

In `bake-buildings.js`, while accumulating each building into the material buckets, record
a per-building entry. Extend the manifest (bump `SLAB-CONTRACT.md §0` version → 2;
consumers must refuse unknown versions):

```jsonc
"buildings": [
  { "id": "...", "footprint": [[x,z],…], "centroidY": <m>, "baseY": <rooftop m>,
    "year": 1890, "wallMaterial": "brick_red", "roofMaterial": "...",
    "zoning": "A", "ranges": { "wall": [v0,vN], "foundation": [v0,vN], "roof": [v0,vN] } }
]
```

`baseY` / `centroidY` MUST be computed by the **same** anchor math the runtime uses
(`getFoundationHeight + size[1] + getRoofPeakHeight + 0.3`; mean-of-footprint-corner raw
elevation) so neon / foundations lift in lockstep on sloped terrain.

- **Fixes:** slab now carries building identity.
- **Doesn't fix:** nothing renders differently yet.
- **Verify:** index length == `buildingCount` (1056); ranges tile the buffer with no
  gaps/overlaps; `--clean` re-bake idempotent (regen everything it deletes).

## Phase B — Consumer `SlabBuildings.jsx` (Preview-only, behind a flag)

New shared consumer: loads `buildings.json` + `.bin`, draws the merged mesh, builds an
in-memory `id → {footprint, centroidY, baseY, …}` map from the index.

- **Match the live material exactly** — this is the "buildings accept light differently"
  issue flagged in the parity session: palette albedo, roughness 0.9, metalness 0.05,
  night color shift, textures — NOT BakedBuildings' simplified vertex-color path.
- Add a per-vertex `aBuildingId` attribute + `uSelectedId` / `uHoveredId` uniforms so
  selection / hover highlight in-shader on the merged mesh (you can't set per-building
  emissive on one shared material).
- Raycast → resolve hit to a building id via the index.
- Mount in **Preview only**, behind a toggle, beside the live mount for A/B comparison.

- **Fixes:** Preview can inspect slab buildings + their real perf.
- **Doesn't fix:** production, neon, place state.
- **Verify** in Cartograph Stage LS at Browse / Hero / Street (Toy + Preview-close camera
  hide sub-pixel coverage + z-fight per doctrine); confirm draw-call drop in the GPU panel.

## Phase C — Neon off the index

Repoint `SceneNeon`'s `openPlaces` to derive from the slab index (`baseY` / `groundYRaw` /
`category`) instead of live `_allBuildings`, gated so the live path still works until
cutover.

- **Fixes:** neon renders off the slab.
- **Verify:** neon parity at night TOD against the live mount (tube positions lift in
  lockstep, same categories/colors).

## Phase D — Place state / selection / click / place cards

Re-plumb `useSelectedBuilding`, hover, `usePlaceState`, and the place-card mount to resolve
against the index map (raycast → id → state) rather than per-`Building` React props.

- **Fixes:** full interactivity on the merged mesh.
- **Verify:** click selects the right building; ring / highlight correct; place card opens;
  sim-open neon toggles per building.

## Phase E — Production cutover

Swap production `src/components/Scene.jsx` `LafayetteScene` → `SlabBuildings`; **remove the
runtime `src/data/buildings` import from the production path**. Point Preview at
`SlabBuildings` too (drop the Phase-B flag).

- **Fixes:** production reads buildings from the slab; Stage > Preview > Production parity
  complete.
- **Verify:** all three render identically; confirm `dist/` main bundle no longer contains
  the buildings data module.

## Phase F — Retire + docs

Delete `src/preview/BakedBuildings.jsx`. Update `SLAB-CONTRACT.md §6` (new schema + version
2, mark L1.3 resolved), `ls/FEATURES.md:83`, and `cartograph/FEATURES.md` render-environments
table (Preview / production now both slab-buildings). **Don't** delete
`src/data/buildings.json` if Designer / bake still read it as the *source* — only remove the
*runtime* dependency.

---

## Explicitly out of scope

LOD / instancing for buildings; per-building frustum culling beyond what the index trivially
enables; any change to Designer building fortification. **Stage keeps its live
`LafayetteScene` mount** (authoring needs live retint — only production / Preview move to the
slab consumer) UNLESS your Phase-B findings show the shared-consumer + `override ?? scene.<x>`
pattern is clean enough to converge Stage too — surface that as a decision, don't assume it.

## Commit boundaries

One commit per phase, each independently revertible. Canonical off-limits unless the phase
owns them: `RIBBONS.md`, ground / terrain bake. Check in with Jacob at the **Phase A→B seam**
(schema review) and **before Phase E** (the production cutover is the irreversible-feeling
one). **Aesthetics + perf are co-equal** (49/51 doctrine): the merged mesh must look
identical to the live buildings — no flatter lighting — not just measure faster.
