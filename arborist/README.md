# Arborist — the contract

> 🧭 **The front door is [`ORIENTATION.md`](ORIENTATION.md)** — what the Arborist is, the seven
> surfaces, which artifact each one reads, the pipeline, and what is done / owed / abandoned.
> **This file is only the CONTRACT**: inputs, outputs, endpoints, CLI.
> *(Conformed 2026-08-23. It used to carry its own `⭐ START HERE` and read-order — a second front
> door, which is the disease `ORIENTATION` names in its own opening. Excised.)*

⛔ **Procedural and LiDAR are RETIRED** (Jacob, 2026-08-23), not "kept peer tracks". Anything below
that implies otherwise is stale — say so rather than working from it.


## The pipeline (laid — whether a given stage is wired or not)

```
curated parts            authoring (the Salon)          publish spine                          the slab → LS
─────────────            ─────────────────────          ─────────────                          ─────────────
chassis  _chassis/   ┐                                  generate-salon.js  (compose one tree)
bark     bark/       ├─►  pick chassis · bark · leaf  ─► publish-glb.js    (variants + decimate)
leaves   shapes/     │    from MATCHER options,         ► bake-look.js      (single master atlas)
rubric + dossiers    ┘    tune the rubric axes,         ► bake-trees.js     (substitute placements)
                          against the REFERENCE         ► public/baked/<look>/  →  InstancedTrees.jsx
```

**Authoring is live; production is static** (`project_authoring_is_live_production_is_static`). Edits **autosave** to the composition; the **Grove "Bake → Slab"** regenerates-from-source (`generate-salon` → `bake-look` → `bake-trees`) and ships — the explicit per-species **Re-publish** gesture retired 2026-06-25 (autosave + the regenerate-on-bake replaced it). **The slab is the contract:** if it isn't baked into the slab, the public never sees it.

---

## The Arborist surfaces (UI modes)

Open at `/arborist` — lands directly in the **Salon**.

| Mode | What it is | Code |
|---|---|---|
| **Salon** | The authoring viewer (default) — a **plate-rack** (2026-06-25, `SALON-INTERFACE.md`): navigate by **roster species**; pick **chassis** (live gray silhouettes) · **bark** (swatches) · **leaf** (cutouts) as visual plates with per-plate **★ Approve** + `(Add +)`; tune the trims (leaf size, color). Edits **autosave**; **3-variants** toggle eye-gates the deformer. Deformer automatic-by-morphology; Tilt/Y-up in an "advanced" drawer; Re-publish/Adopt/Oubliette/gradient-editor/Studio-Worm retired. | `src/arborist/SalonWorkstage.jsx` + `ChassisPlate.jsx` |
| **Grove** | Gallery of the published trees on one ground plane + the **ship-to-slab bake**. Roster-driven (a published composition appears in the Look's roster). *See the open question below.* | `src/arborist/Grove.jsx` |
| **Coverage** | Read-only "have vs need" per roster species (🟢 literal / 🟡 composite / 🔴 gap) **+ the Forest-Builder per-part Kit readiness** (Chassis · Bark · Leaves). The path to the goal. | `src/arborist/CoverageView.jsx` |
| **Library** | The parts inventory by rubric value (leaves by silhouette, barks by type, chassis by habit) + the gaps. | `public/library/INVENTORY.md` (rendered view pending) |
| ~~Procedural · LiDAR · Scan~~ | ⛔ **RETIRED 2026-08-23.** Still reachable at `?legacy=procedural` / `?legacy=lidar` / `?legacy=workstage` and still compiled into the deployed bundle — removal is `LEDGER-exorcism-wren.md §B`. | — |
| **Shelves** | Curate the SUPPLY: put each chassis on its habit shelf. | `ShelvesWorkstage.jsx` (`?legacy=shelves`) |
| **Diorama** | ONE finished tree as it ships, lit by the real sky. | `src/components/TreeDiorama.jsx` (`?view=fullmonte`, `?embed=tree`) |

---

## Contract

| | |
|---|---|
| **Inputs (Authored track)** | parts — `public/trees/_chassis/*.glb`, `public/textures/bark/<ref>/`, `public/textures/leaves/shapes/<pack>/` · vocabulary — `arborist/rubric.json` + `arborist/dossiers/<id>.json` · per-species recipe — `arborist/state/<id>/compositions.json` |
| **Outputs (artifacts)** | `public/trees/<id>/{skeleton-N-lod{0,1,2}.glb, tips-N.json, manifest.json}` + `public/trees/index.json` ; per-Look `public/baked/<look>/{trees-atlas.json, master PNGs, trees/<id>/…}` → the slab |
| **Kit state** | `arborist/state/part-index.json` (tagged parts) · `public/library/**` (canonical part tree + `INVENTORY.md`) |
| **Backend** | `arborist/serve.js` on port **3334** (proxied at `/api/arborist`) |
| **Ship-to-slab** | the Grove's **Bake → Slab** (`POST /grove/bake?look=`), which regenerates every composed species from source, rebuilds the index, packs the atlas, then places the census. ⛔ Note the two axes: `bake-look --look <id>` (the LOOK's atlas) then `bake-trees --scene <name>` (the NEIGHBOURHOOD's census). `bake-trees` was renamed off `--look` on 2026-07-15 — it always meant the scene. |
| **UI route** | `/arborist` (opens to the Salon) |

Artifacts are **deterministic** + **pristine**: same recipe + same on-disk parts → byte-identical GLB. *(Reliability caveat learned 2026-06-20: the Salon preview caches by a composition snapshot — any new leaf/composition param must be added to that snapshot, and bump its `buildVersion` on emission-code changes, or the preview silently serves stale.)*

---

## Key API endpoints (`arborist/serve.js`, port 3334)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/coverage` | Roster have-vs-need join **+ per-part Kit readiness** (`forestBuilder`) — powers Coverage + the Salon roster navigator |
| `GET` | `/salon/:id/options` | The matcher's **ranked options** per part-type + the **dossier** (reference plates + required) for the species |
| `GET` | `/salon/:id/{chassis,bark,leaves}` | Part catalogs |
| `GET\|POST` | `/salon/:id/compositions` | The per-species recipe overlay (absent-keys-preserved merge) |
| `POST` | `/salon/:id/:slot/preview-atlas` | Build the per-composition preview (atlas + UV-rewritten GLB via `generateSingleCompositionGLB`) |
| `POST` | `/salon/:id/publish?look=<id>` | **Stage** the species to the library (authoring; does NOT bake the slab) |
| `POST` | `/atlas/bake?look=<id>` | **Ship-to-slab** — re-run `bake-look` (the Grove bake) |
| `GET\|POST` | `/salon/curation[/:chassis]` | Chassis approve / reject / rename (the "approved" signal) |

*(Legacy peer-track routes — `/species/:id/seedlings`, `/species/:id/bake` (`bake-tree.py`), `/procedural/*`, `/lidar/*` — remain for LiDAR/Procedural. Full route list: `FEATURES.md`.)*

---

## Key CLI

| Command | What it does |
|---|---|
| `node arborist/serve.js` | Backend (auto-started by `npm run dev`) |
| `node arborist/ingest.js` | Conform + tag the parts → `part-index.json` + `public/library/` + `INVENTORY.md` |
| `node arborist/generate-salon.js [--species <id>]` | Headless Salon republish (compositions → GLBs) |
| `node arborist/build-leaf-atlas.mjs` | Compose varied tile-grid atlases for scanned leaf packs |
| `node arborist/bake-look.js --look <id>` | Pack the per-Look master atlas (the ship-to-slab bake) |
| `node arborist/bake-trees.js --scene <name>` | Place the NEIGHBOURHOOD's census onto the roster |

---

## The Grove → Slab

**One production gesture: the Grove's "Bake → Slab"** (`POST /grove/bake?look=`). It regenerates
every composed species from its recipe + parts, rebuilds the index, packs the Look's master atlas,
then places the neighbourhood's census — in that order. ▶ `sed -n '1156,1216p' arborist/serve.js`

- **Grove membership is automatic**, never a manual "publish to add": a species with an authored
  composition appears. ⛔ There is **no per-species Re-publish gesture** and has not been since
  2026-06-25 — edits autosave.
- **The slab is the contract:** if it isn't baked, the public never sees it.
- ⚠️ **Under Jacob's 2026-08-23 ruling the Grove should show only what is ALREADY baked and
  slab-ready.** It does not yet — it is a pre-bake surface and it hides a species that ships.
  `ORIENTATION.md §7 OWED`.

⛔ **EXCISED 2026-08-23 — a long troubleshooting block lived here** claiming `/grove/bake` "never
calls `generate-salon`" and instructing the operator to `POST /salon/:id/publish` **each** edited
species first. **That has been false since `15682e55`.** It was the single most misleading passage
in this folder: it told the operator to perform a step that no longer exists, to fix a staleness
that no longer happens. Retired to `_archive/`.


## Read order

1. `scratch/FOREST-BUILDER-KIT-MATCHER.md` — the ratified kit-matcher architecture + staged plan (the live design).
2. This README — the current contract + front door.
3. The quartet — `FEATURES.md` (operator surface) · `ARCHITECTURE.md` (load-bearing patterns: publish-loop, master atlas, deformer, the cartograph↔arborist boundary) · `BACKLOG.md` (in-flight + next-up) · `NOTES.md` (dated decision record).
4. `../cartograph/ARCHITECTURE.md` — the kit-wide publish-loop pattern the Arborist mirrors.

## Cross-references
- `_archive/STAGE0-KEYSTONE-2026-08-23.md` · `_archive/LIBRARY-BUILDER-2026-08-23.md` — retired Stage-0 records. History, not canon.
- [[project_arborist_kit_matcher]] — the project thread
