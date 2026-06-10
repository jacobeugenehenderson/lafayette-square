# Lafayette Square

3D neighborhood visualization of Lafayette Square, St. Louis.

**Live site:** https://lafayette-square.com

---

## ⭐ START HERE — what's worked out, by topic (read this FIRST)

> **The settled-state index.** Before diagnosing, deciding, or building *anything*, read this so you build on what's already worked out instead of re-deriving it (re-deriving settled doctrine is the recurring, expensive mistake). Each row = the **settled conclusion** + its **one authoritative home**. The full doc landscape is the "Documentation map" further down; this is the topic-first orientation. *(Boz/agents: this + `BOZ.md` are the first reads, every session.)*

**Pipeline order (Jacob's):** `intake → skeleton → prebake → survey → ⟦WALL⟧ → section → bake → stage`. Currently **stuck on skeleton + survey**; intake skipped for now. Trunk = `cartograph-looks-pass-ab`.

| Topic | Settled conclusion (don't re-derive) | Authoritative home |
|---|---|---|
| **Skeleton** | "The Skeleton is The First Bake" → polygon-ready frame. Centerline over-densification **FIXED** (junction-protected RDP, `smooth=0`). Remaining debt is the **missing across-intersection organ** (doglegs + degenerate corners) — at the intersections, not the lines. ⛔ never conflate clean-lines with clean-corners; junction-protected always; two-carriageway model locked. | **`SKELETON.md`** (deep) · `PIPELINE.md §skeleton` |
| **Prebake** | `skeleton → pipeline.js → promote-ribbons.js → ribbons.json` (First Bake). 2D Survey renders **live** from `ribbons.json` via `buildTileGround` — the *ground bake* is irrelevant to the 2D view. | `PIPELINE.md §prebake` |
| **Survey** | **SHAPE only — NO ped depth** (ped = Section). Smoothing/caps/anchor/corner-R/curb. live==bake. | `PIPELINE.md §survey` + `ARCHITECTURE.md §2.1` |
| **WALL** | The freeze after Survey — chains die here; downstream is a pure consumer. *Should* be at P2 (standing debt). First diagnostic: "is this chains again?" | `PIPELINE.md §Wall` |
| **Corners / thorns** | Cluster split into roots: **band-fold** (T-mouth `iW`-fold + thin-tile → **Option A local clamp**, Bollard) · **no-mouth-side dogleg** (through-vertex corner-treated, should be straight) · **intersection consolidation** (degenerate corners at over-noded complex IXs — highest-leverage, forensic-first). Tile corner = band *bent*, never a constructed primitive. | `HANDOFF-band-fold-fix.md` · `RIBBONS.md §3.9a` |
| **Divided roads** | Carriageways stay 2 chains; **D1 longitudinal weld + station-overlap gate LANDED**; median = emergent geometric face (`extractFaces`), tagging is downstream. **Truman south-of-Park = separate D3/D8** (one-sided cross-streets). | `RIBBONS.md §3.1` · `TRUMAN-FORENSICS.md` |
| **Grade separation** | LANDED — `gradeSeparated` excluded from faces, stroked as flat asphalt, own layer, renders behind local. | `PIPELINE.md §Wall` |
| **The construction model** | **TILE model** (faces of the centerline graph; strips painted inward; round the strips). Figure-ground retired-in-place. | `NOTES.md` 2026-06-01 · `RIBBONS.md` |
| **Section** | ped **FILL** off the frozen shape — strokes inward off the frozen curb. **Built** (per-edge FILL, bent corner, caps, revert UI); what remains is the FILL tail (perf/D6d, cap-wrap, thorns) + the Measure→Section rename, not a build. **Freeze the silhouette, author the FILL live.** | **`SECTION.md`** (deep, the SSOT) |
| **Doc process** | three kinds (Reference/State/Diary), one-kind-per-doc, content flows downstream as it ages; pack-up/pick-up day cycle. | `BOZ.md §2/§5` |

---

## Local development

```bash
npm install
npm run dev
```

`npm run dev` launches **everything in one terminal** with prefixed colored logs:

| Prefix | Process | Port | Role |
|---|---|---|---|
| `web`   | `vite`                  | 5173 | Main neighborhood app + helper UIs (Cartograph, Stage, Arborist) |
| `carto` | `cartograph/serve.js`   | 3333 | Cartograph backend: skeleton/overlay I/O, Looks API, bake CLI runner |
| `arb`   | `arborist/serve.js`     | 3334 | Arborist backend: species library, specimen browser API, tree bake CLI runner |
| `met`   | `meteorologist/serve.js`| 3335 | Meteorologist backend: Teapot (clouds) + Almanac (weather rules) I/O, almanac evaluator endpoint *(not yet wired into dev script — see meteorologist/README.md)* |

`Ctrl-C` kills all three. Escape hatches if you want to run one in isolation:

```bash
npm run dev:web         # vite only
npm run dev:cartograph  # cartograph backend only
npm run dev:arborist    # arborist backend only
```

The dev server reads environment variables from `.env` (gitignored):

```
VITE_API_URL=https://script.google.com/macros/s/AKfycbxv3JihCx0U7JfGqle6ZpsLamkRS5PAEGRn6_NaM0Nc7r5zdY7kyctDioScGy8nVcAqWQ/exec
VITE_SUPABASE_URL=https://ngbvgjzrpnfrqmzkqvch.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

If `VITE_API_URL` is missing, the dev server falls back to in-memory mocks (no real data).
If `VITE_SUPABASE_URL` is missing, the Supabase client returns a safe stub (Cary features inert).

---

## Architecture at a glance

The project is organized as a **public-facing runtime app** plus a small set of **standalone helper apps** that produce the assets the runtime consumes. Each helper publishes one canonical artifact; the runtime composes them.

| Helper | Built in | Publishes | Consumed by |
|---|---|---|---|
| **Cartograph** (`/cartograph`) | `src/cartograph/` + `cartograph/` | `public/looks/<id>/ground.svg` (per Look) | Stage's `SvgGround` |
| **Stage** (`/stage`)             | `src/stage/` + `src/cartograph/Stage*` | (eventually) `stage-config.json` per Look | Runtime scene environment |
| **Arborist** (`/arborist`)       | `src/arborist/` + `arborist/`          | `public/trees/<species>/{skeleton-N.glb, tips-N.json, manifest.json}` | Runtime `InstancedTrees` (planned) |
| **Meteorologist** (in Stage)     | `meteorologist/` + `src/cartograph/` (UI inline) + `src/components/Atmosphere.jsx` (planned) | `public/clouds/{presets,almanac}.json` | Runtime `<Atmosphere />` (planned) |

---

## Documentation map

> **This section is the index — find any doc from here without being told where to look.** Docs live *next to their code* and follow **three kinds**, separated by tense (the architecture is codified in [`BOZ.md`](BOZ.md)): **Reference** (how it works / why — eternal-present) · **State** (where we are / what's next — the `BACKLOG` + the `HANDOFF-*.md` future-looking to-do layer) · **Diary** (how we got here — `NOTES` + git). *One kind per doc; content flows downstream as it ages.*
>
> **⭐ Audience note — three readers within Reference:** **FEATURES** = user/investor (*what it is, why it's special* — the brochure). **OPERATIONS** = operator (*here's the panel, here's the knob, here's when to turn it* — the manual; the engineering/"actuarial" counterpoint to FEATURES, **paired with it per domain**). **README · ARCHITECTURE · PIPELINE · RIBBONS** = developer (contract / build+rationale / execution / geometry). So **FEATURES is never subsumed** — distinct audience; engineer-internals migrate FEATURES→ARCHITECTURE, operator-knobs migrate FEATURES→OPERATIONS, keeping FEATURES the clean pitch. *(OPERATIONS is seeded in cartograph; other domains get one as they're touched.)*

**Start here, any session:**
- **[`BOZ.md`](BOZ.md)** — coordinator onboarding, the living doc Process, and "where to start." The front door.
- **This `README.md`** — the doc index (you're in it) + dev setup.

### Per-domain docs

The project is **four domains** + the runtime, each documented beside its code:

| Domain | Reference | State | Diary |
|---|---|---|---|
| **Cartograph** — map-making toolkit (Designer / Stage / Preview / bake) | [README](cartograph/README.md) · [FEATURES](cartograph/FEATURES.md) *(user/pitch)* · [OPERATIONS](cartograph/OPERATIONS.md) *(operator manual — seed)* · [ARCHITECTURE](cartograph/ARCHITECTURE.md) · [PIPELINE](cartograph/PIPELINE.md) · **[SKELETON](cartograph/SKELETON.md)** (the frame) · **[PREBAKE](cartograph/PREBAKE.md)** (chains → frozen polygon substrate) · **[SURVEY](cartograph/SURVEY.md)** (the SHAPE tool) · **[WALL](cartograph/WALL.md)** (the freeze; frozen-wrong-data is odious) · **[SECTION](cartograph/SECTION.md)** (the FILL tool) · **[BAKE](cartograph/BAKE.md)** (pour the slab) · **[STAGE](cartograph/STAGE.md)** (the Look tool) · **[POLYGON-FIRST](cartograph/POLYGON-FIRST.md)** (⭐ the doctrine made enforceable — checks, not adjectives) · **[RIBBONS](cartograph/RIBBONS.md)** (geometry canon — read before any ribbon/corner work) · **[LOOP-STREETS](cartograph/LOOP-STREETS.md)** (Benton/Waverly loop canon) | [BACKLOG](cartograph/BACKLOG.md) · [DOC-CODE-COHERENCE](cartograph/DOC-CODE-COHERENCE.md) (the corpse-lie ledger) + the root `HANDOFF-*.md` briefs | [NOTES](cartograph/NOTES.md) · [OSM-FORENSICS](cartograph/OSM-FORENSICS.md) · [RENDER-PATH-CENSUS](cartograph/RENDER-PATH-CENSUS.md) |
| **LS app** — the consumer surface (place cards, residence, guardians, Cary) | [FEATURES](ls/FEATURES.md) *(user/pitch)* · [OPERATIONS](ls/OPERATIONS.md) *(operator manual)* · [ARCHITECTURE](ls/ARCHITECTURE.md) · [reference/INVENTORY-DATA](ls/reference/INVENTORY-DATA.md) (every data source) · [INVENTORY-API](ls/reference/INVENTORY-API.md) (every endpoint) · [RUNTIME-DELTA](ls/reference/RUNTIME-DELTA.md) | [STATUS](ls/STATUS.md) (whole-picture section×state map) · [BACKLOG](ls/BACKLOG.md) | — |
| **Arborist** — tree library + bake | [README](arborist/README.md) · [SPEC](arborist/SPEC.md) · [FEATURES](arborist/FEATURES.md) · [ARCHITECTURE](arborist/ARCHITECTURE.md) · [ROSTER-COVERAGE](arborist/ROSTER-COVERAGE.md) | [BACKLOG](arborist/BACKLOG.md) | [NOTES](arborist/NOTES.md) |
| **Meteorologist** — clouds + weather (standalone app at `/meteorologist.html`; the staging area for the slab) | [README](meteorologist/README.md) · [FEATURES](meteorologist/FEATURES.md) *(user/pitch)* · [OPERATIONS](meteorologist/OPERATIONS.md) *(operator manual)* · [ARCHITECTURE](meteorologist/ARCHITECTURE.md) · [INTERFACE](meteorologist/INTERFACE.md) · **[WEATHER-MODEL](meteorologist/WEATHER-MODEL.md)** (nomenclature + model SSOT) · [SPEC](meteorologist/SPEC.md) · [CANON](meteorologist/CANON.md) | [STATUS](meteorologist/STATUS.md) (wiring matrix) · [BACKLOG](meteorologist/BACKLOG.md) · [STAGE_MIGRATION](meteorologist/STAGE_MIGRATION.md) · [CLOUD-PHASE0](meteorologist/CLOUD-PHASE0.md) | [NOTES](meteorologist/NOTES.md) |

Cartograph and LS are **standalone yet completely overlapped** — cartograph could pour slabs for other neighborhoods; LS could surface other operators' slabs. Read the domain relevant to your session; flag mid-session contradictions; update at session end.

#### The cartograph tools — Survey · Section · Stage (first-class; not incidental)

The cartograph authoring app is **three distinct tools**, each its own tab/area with its own toolset, each freezing the artifact the next consumes. They are the spine of the whole map pipeline — canon table in **[`cartograph/ARCHITECTURE.md §2.1`](cartograph/ARCHITECTURE.md)**:

- **Survey** — the hardscape **SHAPE**: centerlines, smoothing, caps, anchor, road metadata, hero-pick *(target: + corner radius + curb)*. Strokes chains outward; **freezes wall #1 (chains die).** *(Target: today the tile topology is frozen but the curb is still live-stroked — `cartograph/PREBAKE.md §4.1`; enforced by the checks in `cartograph/POLYGON-FIRST.md`.)* Tab: the `surveyor` pill in `src/cartograph/Panel.jsx` → `SurveyorPanel.jsx`. Docs: `ARCHITECTURE.md §2.1`, `FEATURES.md §"Toolbar = views, Panel = tools"`.
- **Section** — the pedestrian **CROSS-SECTION + ribbon corner fills**: treelawn/sidewalk widths, the bent-rectangle corner fills, ADA pads, stroked inward off the frozen curb (LU = remainder). *Currently the `measure` pill → `MeasurePanel.jsx`; "Measure" is the vestigial name.* Geometry canon: **`RIBBONS.md`**.
- **Stage** — the **LOOK / slab**: materials, color, visibility, shaders, sky, post-FX, neon, camera; **bakes the slab (wall #2, store dies).** Docs: `FEATURES.md §"Stage"`, `ARCHITECTURE.md`. *(The Designer's `design` pill is the 2D look-editing default; Stage is the 3D look environment + the slab pour.)*

(`Preview` inherits Stage — a Slab Player, not a fourth tool.)

#### The cartograph pipeline stages — where each is authoritatively documented

The build pipeline (Jacob's order: **intake → skeleton → prebake → survey → ⟦WALL⟧ → section → bake → stage**) has ONE authoritative home per stage in **[`cartograph/PIPELINE.md` → "The stages, in order"](cartograph/PIPELINE.md)** (read that first — it carries what each stage is, its current STATUS, and its doctrine; deep-dives below). *Diffuse-doctrine across many files is what caused repeated mistakes — this is the de-diffusion index.*

| Stage | Authoritative home | Deep-dive / detail |
|---|---|---|
| **skeleton** (the frame) | **`SKELETON.md`** (the keystone artifact reference — schema + build stages + affordances + gaps) · `PIPELINE.md §skeleton` + `§Wall` + ladder `P1` | `OSM-FORENSICS.md` · `[[project_skeleton_is_the_first_bake]]` · the "better bones" 4 prongs (BACKLOG NOW) |
| **prebake** (First Bake → `ribbons.json`) | **`PREBAKE.md`** (the keystone — current compile + the polygon-ization target) · `PIPELINE.md §prebake` + ladder `P3` | `[[project_two_bakes_two_walls]]` · `[[feedback_skeleton_pipeline_two_step]]` |
| **survey** (SHAPE tool — *no ped depth*) | **`SURVEY.md`** (the keystone — tile construction + authoring + the wall) · `PIPELINE.md §survey` + `ARCHITECTURE.md §2.1` | `FEATURES.md §Toolbar` · `SECTION.md §7.1` (SHAPE/FILL split) |
| **⟦WALL⟧** (the freeze; chains die) | **`WALL.md`** · `PIPELINE.md §Wall` | `[[project_skeleton_is_the_first_bake]]` · `[[project_two_bakes_two_walls]]` |
| **section** (ped FILL → ground bake) | **`SECTION.md`** (the FILL SSOT) · `PIPELINE.md` · `FEATURES.md` | `RIBBONS.md` (FILL geometry) |
| **bake** (pour the slab → `public/baked/<id>/*`) | **`BAKE.md`** (the keystone — the chain) · `SLAB-CONTRACT.md` (slab format) | `ARCHITECTURE.md §3/§7` |
| **stage** (the Look tool → `scene.json`) | **`STAGE.md`** (the keystone — SC.1–SC.7) · `SLAB-CONTRACT.md §4` | `FEATURES.md §Stage` |

### Cross-domain / strategic (repo root)

- **[`SLAB-CONTRACT.md`](SLAB-CONTRACT.md)** — the formal cartograph↔LS boundary (the slab format; owned by neither app).
- **[`AGENT-VALIDATION-SURFACES.md`](AGENT-VALIDATION-SURFACES.md)** — where to validate (toy vs LS); the guardrails.
- **[`AUDIT-MATRIX.md`](AUDIT-MATRIX.md)** + the `HANDOFF-audit-*.md` set — the forensic-audit campaign.
- **[`plans/`](plans/)** — forward/strategic: productization, basemap-swap, pre-public-cleanout, kit-couplers.
- **[`PUBLISH.md`](PUBLISH.md)** — deploy procedures · `BUSINESS_LISTINGS.md` · `CARY-BRIEF.md`.

### State layer & working dirs

- **`HANDOFF-*.md`** (repo root) — dispatch-ready briefs = the **future-looking to-do**; live ones are indexed from the relevant `BACKLOG`.
- **`scratch/`** — git-tracked working files (briefs, audits, journals); throwaway-ish, *not* canonical.
- **`inventory/`** — the LS content corpus (narrative + page); data, not docs.
- **`_archive/`** — retired docs (git keeps the rest).
- **`memory/`** — the coordinator's continuity (auto-loaded; `MEMORY.md` is its index, and it points back here).

> *Incomplete? This index is incorporated **a bit at a time** — if a doc isn't mapped here yet, add it to its domain×kind cell (or the right root bucket) when you touch it. The index is canonical; keep it honest.*

URL routes during development:

| Route        | What it is |
|---|---|
| `/`          | Public neighborhood viewer (the runtime) |
| `/cartograph`| Cartograph helper app (Designer + Stage + Surfaces) |
| `/stage`     | Standalone Stage page (camera/lighting authoring, no cartograph data) |
| `/arborist`  | Arborist helper app (species library + specimen workstage; scaffold) |

---

## Stack

React Three Fiber, Three.js, Zustand, Tailwind CSS, Vite, Supabase (Cary courier system).

## Backend

- **Apps Script** (`apps-script/Code.js`) — listings, reviews, events, check-ins, residence, guardian claims, QR designs.
- **Supabase** — Cary courier system (requests, sessions, auth). Not yet live.
- **Cloudflare Worker** (`worker.js`) — OG meta tags for social link previews.
- **Cartograph backend** (`cartograph/serve.js`) — local-only Node service for the authoring helpers (Looks API, bake CLI runner, overlay I/O). Not deployed; helpers are dev-time tools.

## Admin access

Append `?admin` to any URL to trigger the admin login prompt. The passphrase is validated server-side and a session token is issued (valid 6 hours, stored in sessionStorage). Use `?logout` to end the session.

Set the passphrase in Apps Script: `PropertiesService.getScriptProperties().setProperty('ADMIN_PASSPHRASE', 'your-secret')`

## Publishing

See [PUBLISH.md](PUBLISH.md) for deployment procedures (frontend, backend, DNS, worker).
