# BRIEF — Street furniture: a standalone tool to catalog, place, light and sequence a town's street hardware

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-11
evict-when: /street-furniture catalogs the pack (every asset declares mount, forward, lit pieces, sign faces, tri budget, or ingest refuses it); lamps, vehicle signals, walk/don't-walk, railroad crossings and name signs are placed from data with every placement overridable in design.json; each family renders through the mesh/impostor/cull tier; the toy sequence runs (vehicle phases, walk with its parallel green, corridor offsets, a scripted level-crossing event); lampModels.js is gone into the catalog; checks green and mutation-tested; Jacob has eyed a signalised junction on two towns, day and night
-->

**Boz drafted this 2026-10-11 with Jacob. Jacob dispatches.** This closes the "street furniture salon" `BRIEF-lamps` recorded,
and `ROADMAP H9` (coordinated signals).

## Jacob's rulings (2026-10-10/11)

- **Its own app, not attached to the Arborist.** It borrows the Arborist's *pattern* (catalog → preview → bake → instanced runtime),
  not its code, route or server.
- **More meshes go through the existing tier selector**: the species bar's mesh / impostor choice, `heroTier` in the bake,
  read by `InstancedTrees.jsx`. Street furniture uses that control, not a second one.
- **The pack is bought on the commercial licence.** The converted GLBs ship. The raw pack stays outside git
  (`~/Desktop/dev.nosync/street_elements`) until the licence text is read for source redistribution (the kit repo is public).
- **LS and HPDM get their missing nodes as an ADDITIVE fetch** (own file, the `fetch-kerbs.mjs` pattern), never a re-fetch of `osm.json`.
- **The traffic system is a toy, not reality:** vehicle signals · street lamps · railroad crossings · walk/don't-walk.
- **Lamps: at least two styles in the pack.** Standard is the default. **LS's Victorian is replaced by the pack's Victorian**, still
  as LS's authored choice in `design.json#lamps.model`. Which heritage post (`street_light_4–7`) is Jacob's pick in the preview.
  The model stays a town's choice.

## What the pack is (measured 2026-10-10; ▶ unzip `obj.zip`, read `^v`/`usemtl`/`Kd`)

100 models, 14 families. **Centimetres. No textures**: flat `Kd` colours, one 364-entry `.mtl` shared by every file.
Lamps: modern 6 m heads (`street_light_1/2/3/8`) · heritage 4 m post-tops (`street_light_4–7`) · wall lanterns (`street_lamp_1–5`,
hung below their origin). 11 traffic lights · 7 name-sign posts (blank panels) · benches, bins, hydrants, bus stops, barriers, fences,
billboards. Face counts ~370 to ~33k per model. **Forward axes disagree** (`street_light_2` +z, `street_light_8` −x, `traffic_light_3` 45°).
⚠️ **Lens slots are not clean:** red (`SG7`) and green (`SG8`) are their own materials, but **amber shares `SG3` with the pedestrian
heads and the push-button triangle**. The pedestrian heads are blank orange panels, with no hand or figure on them.
**Nothing for railroad crossings.**

## What exists (read the code; these are claims)

- **Lamps:**
  - Positions: OSM ∪ authored ∪ derived (`bake-lamps.js#readLampCensus`, `derive-lamps.mjs`) → `public/baked/<look>/lamps.json`,
    with each lamp anchored to the drawn ground (`cartograph/ARCHITECTURE.md §8`).
  - Model library: `src/lib/lampModels.js`, chosen per town by `design.json#lamps.model`.
  - Rendering: `StreetLights.jsx`, which gives each post a **random `rotation.y`** (no heading per lamp). Pools are baked into `ground.poolmap.png`.
- **OSM nodes:**
  - `fetch.js` keeps `highway=*` nodes as `pois`. `traffic_signals`, `stop`, `crossing`, `bus_stop` and `bench` arrive.
  - It never fetches the `railway` key; no town has `railway=level_crossing`.
  - LS and HPDM carry 0 pois (`ROADMAP A09`).
- **Junctions:**
  - The frozen `shape.json` `tiles[].junctions[].legs` names the two streets at each corner.
  - `tiles[].fillets[]` (`C, r, tA, tB`) is the curb corner arc, the seat for poles and signs.
  - `skeleton.json` `junctions[]` carry no legs.
- **Helper apps:** routed in `vite.config.js#serveHelperApps`, with backends proxied by port (`/api/arborist` → 3334).
- **No traffic, sign or level-crossing code exists.**

## The work

1. **Ingest + catalog** (`/street-furniture`, `src/street-furniture/`, `street-furniture/{ingest.mjs,serve.js}` on port 5555; ▶ `cartograph/OPERATIONS.md §Street furniture`):
   - Convert to GLB, centimetres → metres, prune to the materials each model actually uses.
   - LODs through `@gltf-transform` + `meshoptimizer` (already deps); an impostor per model. Output is served like the lamp GLB is
     today (`kitUrl`; `public/models/` is gitignored).
   - Each asset carries a record: family · mount (ground / wall / overhead) · forward · **lit pieces** (lamp glass; red / amber / green;
     walk / hand) · **sign faces** (panel + text frame) · tri budget.
   - ⛔ **An asset missing any field is refused, never defaulted.** ⛔ **Lit pieces are tagged by MESH PIECE, not material**, because of
     `SG3`. ✅ **Built: ingest splits each material into pieces and stamps every vertex with its piece's index (`_PIECE`),
     one primitive per material.** A node per piece was tried and dropped: each piece simplified with its borders locked
     (23k → 21k instead of → 10k). The attribute survives decimation (every piece is still there at r0.25) and is the
     runtime's lit mask in one draw.
   - The UI: an icon gallery, and a preview stage where you set the forward direction, tag the lit pieces and watch the sequence.
2. **Lamps join the catalog.** `lampModels.js` becomes the catalog's lamp family and **is deleted in the same commit**. Its contract
   carries over (`headY`, lit mask driving the Bulb knob, absent ⇒ standard, said; unknown id throws). The pack's posts become entries.
   **LS moves to the pack's Victorian.** `public/models/lamp-posts/victorian-lamp.glb` and the unused vendor files beside it are deleted
   in that commit, and LS's pools and halo are re-checked against the new `headY`.
   Lamps get a **heading** (face the street they light) in place of the random rotation.
3. **Additive fetch** (LS and HPDM, and any town lacking them): `highway=traffic_signals|stop|give_way|crossing`,
   `crossing=traffic_signals`, `railway=level_crossing|crossing` → `raw/osm_street_furniture.json`, read alongside `pois`.
4. **Placement bake, per family, every placement overridable** (`design.json`, keyed by the junction or street, never by index):
   - **Vehicle signals:** at a `traffic_signals` node, matched to the `shape.json` junction it falls in **by geometry**. A pole goes on
     the fillet, with its head facing each approach.
   - **Walk / don't-walk:** at `crossing=traffic_signals`, both ends of the crossing.
   - **Level crossing:** a crossbuck, flashers and a gate (procedural) on each road approach at a `railway=level_crossing`.
   - **Name signs:** one corner per junction. The panel text comes from the junction's leg names, and each panel faces the street it names.
   - **Benches, bins and bus stops:** from OSM, stood behind the curb by the lamps' legal-ground test.
   - ⛔ Every candidate is placed or dropped **with a reason**. ⛔ Nothing is silently skipped. A tile with no fillet is a loud class.
5. **Runtime:**
   - One instanced mesh per model, drawn by its tier (mesh / impostor / cull), and every element anchored to the drawn ground.
   - Lit pieces carry an emissive mask. ⛔ An impostor of a signal or lamp still lights (the mask is baked with it).
6. **The toy sequence:**
   - Vehicle phases: opposing approaches share a phase, which runs green → amber → red.
   - Walk runs with its parallel green; the hand flashes before amber.
   - Along a corridor, each junction's offset = distance ÷ a speed, a green wave.
   - Lamps follow the sun, as today.
   - Level crossing: a scripted "train" event flashes the lights and lowers the gate. No train is drawn unless Jacob asks.
   - The cycle is one clock the Ward can drive.

## Out of scope

Real signal timing or traffic engineering · vehicles · `BRIEF-lamps`' culling and shadow decision (still open there).

## Layer 0 (town #2)

- No constant sized on LS. Pole setback, head height and sign height come from the asset record and the fillet, never a number tuned here.
- A town with no signals gets no signals, and says so in the census. It does not get invented ones.
- Authored overrides are the product. ⛔ A check never scores an override as a defect.

## Can the instrument see it? (mutation-test each)

- `claims-every-furniture-candidate-is-accounted-for` (the tree funnel's shape: placed + dropped-with-reason = candidates).
- `claims-a-catalog-asset-declares-its-lit-pieces` (refuses a missing field; refuses a lens that shares a piece).
- `claims-every-signal-faces-every-approach` · `claims-a-name-sign-reads-its-junction`.
- `claims-a-town-chooses-its-lamp` re-pointed at the catalog (it exists; it must keep failing on a town-name branch).
- The eye: Jacob, a signalised junction on two towns, day and night.

## Deliverable

Ingest + catalog first, with the pack's asset table (fields, tris before and after) shown to Jacob. Then lamps into the catalog, the fetch,
placement, runtime, sequence. **Read this and the code it cites, tell Jacob what you found, then build. If the code contradicts the brief,
stop and flag him.**
