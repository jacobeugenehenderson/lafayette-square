# HANDOFF — Neighborhood Perimeter Builder (the extent editor UI)

> ## ✅ BUILT + FRAMING BUG RESOLVED (2026-07-04) — `src/cartograph/ExtentApp.jsx`.
> The tool is **built and the whole intake→3D arc works from the UI, no CLI.** `◎ Extent` nav → **ZIP→Locate** (pan only, no fetch) → **frame** → **Fetch this view** (Phalanges: geography+OSM+skeleton over the framed bbox) → **name 4+ boundary streets** (corridor-collapsed pool, hover-preview) → **corners resolve from skeleton junctions** (the real path — NOT marks) → geographic centroid + circle → **Commit** (recenter geography · `reproject-raw.js` · `skeleton.js` · write `neighborhood_boundary.json` + `neighborhood.json`) → **Pour → Designer** (one-click `pipeline`→`promote-ribbons`→ensure Look→`bake`; **scene-generic — WORKS**). Supporting: **Data-Wall boundary clip** in `pipeline.js` (drop out-of-boundary · buildings→centroid<R · **streets polyline-clipped** — neuters overshooting named arterials, S Big Bend 3882m→2144m); `bake-buildings.js` hard boundary cull; `skeleton.js` **directional-corridor kit fix** (opposite-prefix N/S streets → one road; LS byte-identical). Canon updated this session: `cartograph/INTAKE.md §0.5`, `PIPELINE.md` (intake+prebake+pour), `PREBAKE.md §2.5`, `SKELETON.md §3 step 14`, `STAGE.md §5`, `BAKE.md`, `OPERATIONS.md`, `ARCHITECTURE.md`, `FEATURES.md`, `README`, `NEIGHBORHOOD-INPUTS §11`.
>
> **✅ THE FRAMING BUG IS RESOLVED (2026-07-04, session close).** It was **not** a camera bug — the *content* was genuinely off-center on the disc (2D looked right because it fits-to-content; 3D browse frames the origin-centered disc). Two root causes, both fixed at source:
> 1. **hipointe-demun was never corner-committed** — its center was the raw fetch-frame midpoint, not the named-street box. Fix: committed the box **Big Bend / Forest Park Pkwy / Skinker / Clayton** (Jacob's eye) → geography re-centered to the box centroid → content sits on `[0,0]` (building centroid verified `≈(2,85)`, matching demo on the same box).
> 2. **Buildings drifted ~557 m off their blocks** after the re-center — `reproject-raw.js` re-projected `osm.json` but **not `msbf.json`** (the building source), so streets moved to the new frame and buildings stayed behind. Fix: **generalized `reproject-raw.js` to reproject every frame-dependent raw file** (osm + msbf + admin_boundaries) via a deep lon/lat→x/z walk — verified `MATCH`. A re-center now moves *all* layers together.
>
> **Also landed this session:** `PUBLISH.md §0.5` (the multi-neighborhood deploy doctrine — "one factory, many destinations"); the Extent tool's **Commit + Pour merged into one "Pour → Designer" action** (`ExtentApp onBuild`, staged progress) — the two-button seam *was* the "2D updated, 3D stale" confusion.
>
> **▶ NEXT ARC — the Building Roster Editor** (per-building select → hide; the §5.2 first slice): **`HANDOFF-building-roster-editor.md`.** Motivated by the couple of SW buildings clipped just past the rim + the operator's "show all buildings inside the pre-gradient circle, then hide by hand" model. Still open/minor: marker tool in Stage (3D); per-scene hero keyframes; the post-commit **radius-edit-doesn't-persist** gap in the Extent tool (bump the slider → nothing writes until commit). **This work COMMITTED on `curb-offset-draw` + shipped to staging this session.**
>
> *The original build brief below is kept for the design rationale + the artifact contract — still accurate.*

---

**Agent: FRESH.** New builder, clean context — this is a UI build, not a continuation. Name yourself (one word) and answer to it. **You will be supervised live** (Jacob + Boz): propose the UX for approval **before** building (Phase 0 below), then build in reviewable steps.

## Why this exists (read this first)
Defining a neighborhood's **extent** — the perimeter polygon + the containing circle that clips/fades the pour — is currently done by hand-editing two JSON files + re-running the pour by CLI. That is error-prone and it does not work: a full session was lost trying to *derive* HiPointe-DeMun's boundary from OSM street data, because **street-name data is unreliable for this** (fragmented/duplicate segments — "Wydown Terrace" vs "Boulevard", multiple "Oakland"/"Clayton"; long through-streets; the neighborhood's own written description had **East/West inverted** — Big Bend is the WEST edge, not East). The fetch also grabs a symmetric bbox full of neighbor towns, so density can't isolate the hood either. **The only reliable definer is the operator's eye on a LABELED aerial** — and today the Designer shows **no street labels**, so the operator can't place it. This tool fixes that. *(Memory: `feedback_dont_hand_derive_extent_build_the_tool`.)*

## Route + canon (mandatory, in order)
1. `CLAUDE.md` (route gate) → `ORIENTATION.md` → `README.md §⭐ START HERE`.
2. **`NEIGHBORHOOD-INPUTS.md §9, §10 (the Box/Circle model), §11 ("the boundary is living")`** — this IS the spec for what you're building. §10: *① Box (type border streets → corner intersections → best-guess, OR draw it; drag corners on the aerial) → ② Circle (center+radius that CONTAINS the box, stencil fades the margin).* §11: the boundary is re-editable anytime; **acquisition + bake must be re-runnable against a changed extent.**
3. `SLAB-CONTRACT.md §2.1` (the stencil/fade the circle produces) + `cartograph/BAKE.md` (the bake chain).
4. Memory: `feedback_dont_hand_derive_extent_build_the_tool`, `project_hipointe_demun_pour_step0_landed`, `feedback_installations_are_independent`.

## The two artifacts you read/write (the extent contract)
Per installation, under `cartograph/data/<scene>/`:

**`geography.json`** — the projection SSOT (config.js `_loadGeography` + config.py read it when `CARTOGRAPH_SCENE=<scene>`):
```
{ "lat": <center lat>, "lon": <center lon>, "timezone": "America/Chicago",
  "lonToMeters": <m per ° lon at this lat>, "latToMeters": 111000,
  "bbox": { "minLat", "maxLat", "minLon", "maxLon" } }   // the FETCH extent
```
**`neighborhood_boundary.json`** — the stencil (center is always local `[0,0]` == the geo center):
```
{ "version":2, "center":[0,0], "radius":R, "innerFadeOffset":200,
  "fade":{ "inner":R-200, "outer":R },              // face-fill fade band
  "streetFade":{ "inner":R-140, "outer":R+160 },    // wider band (streets trail the rim)
  "boundary":[ 256-point polygon of radius R around [0,0] ] }
```
**Coordinate frame** (`config.js`): `x = (lon-lon0)*lonToMeters` (east +), `z = (lat0-lat)*latToMeters` (south +). `localToWgs84` is the inverse. No rotation constants anywhere.

## The re-pour chain (all scene-aware via `CARTOGRAPH_SCENE`) — what a re-scope must run
A center shift *within* the current fetch bbox needs only re-project (steps 4-7); a shift/grow *beyond* it needs the fetches too (1-3). §11: your tool must trigger the right subset.
1. `CARTOGRAPH_SCENE=<s> node cartograph/fetch.js` → `raw/osm.json`
2. `CARTOGRAPH_SCENE=<s> node cartograph/fetch-msbf.js` → `raw/msbf.json`
3. `CARTOGRAPH_SCENE=<s> python3 scripts/03-fetch-stl-parcels.py` (+ `03b-fetch-stlco-parcels.py`) → `raw/*_parcels.json`
4. `CARTOGRAPH_SCENE=<s> node cartograph/skeleton.js` → `clean/skeleton.json`
5. `CARTOGRAPH_SCENE=<s> node cartograph/pipeline.js --skip-elevation` → `clean/map.json`  *(HiPointe has no per-scene elevation yet → --skip-elevation)*
6. `CARTOGRAPH_SCENE=<s> node cartograph/promote-ribbons.js --scene=<s>` → `clean/ribbons.json`
7. Bake: `POST /looks/<lookId>/bake?force=1` on the cartograph server (`serve.js`, :3333) → terrain + slab.

There is **no endpoint today** that writes the extent JSONs + runs this chain — the pour is manual CLI. You will likely add a `serve.js` endpoint (e.g. `POST /:scene/rescope`) that writes the two JSONs and runs the appropriate steps, so the UI can drive it. (Follow serve.js's existing scene-route + `runShell` patterns.)

## Where the UI lives
- **`src/cartograph/AerialTiles.jsx`** already renders the aerial (global ArcGIS World_Imagery, positioned via the active scene's geography from the store) with a circular crop. This is the canvas your editor draws on.
- **Street labels are the load-bearing missing piece.** `src/lib/streetLabels.js` (`getStreetLabels`) already computes labels from street data (used by `LafayetteScene`); reuse/adapt it, or overlay OSM road names. Without labels the operator can't identify Big Bend/Skinker/Clayton.
- Tools are a mode in `useCartographStore` (`setTool`: `'surveyor'|'measure'|null`). Add a `'perimeter'` (or `'extent'`) tool.
- Look/scene switching: `activeLookId` / `scene` in the store; `?scene=` URL override is authoritative.

## The work
**Phase 0 — propose the UX, get approval (do NOT build yet).** Sketch (ASCII/plan) how the operator: opens a scene → sees the aerial WITH street labels → defines the perimeter → gets the containing circle → persists → re-pours. Present 2-3 interaction options with a recommendation. Supervised approval gate.

**The control (decided):** the operator **places the CIRCLE directly on the labeled aerial — a center handle + a radius handle** (drag to move, drag to resize). That's the whole geometry control. The polygon/box is only a *mental frame* the operator eyeballs the circle against using the street labels (Big Bend, Skinker, etc.) — **do not build a polygon-editing control.** On commit the tool writes both JSONs (center handle → geo center + `bbox`; radius handle → the fade bands + the 256-gon `boundary`) and offers a **"Re-pour"** action that runs the chain above. *(No street-name geocoding — it's the unreliable part; the labeled aerial + direct handles are the capability.)*

**Descriptive metadata — border-street fields (build the capture, not the wiring).** Alongside the circle, provide **text entry fields for the neighborhood's border streets** (e.g. West / North / East / South, free-text) plus a **name + short blurb**. These are **descriptive metadata, NOT geometry** — they do not drive the circle. Persist them (propose the home: a `meta` block in `geography.json`, or a small `neighborhood.json` — your call). Rationale Jacob flagged: (a) **SEO** — the public-facing "bounded by Big Bend, Forest Park, Skinker, Clayton" description; (b) a **forward hook for map management** (later: add/subtract buildings/features, geocode-seed the circle). Scope NOW = capture + persist + surface the fields; do **not** wire them to geometry or feature-editing yet.

**Phases 1+ — build to the approved sketch, reviewable steps.** Persist correctly (the exact JSON contract above), keep it re-runnable (§11), and make the re-pour driveable from the UI.

## Acceptance =
Operator opens **HiPointe-DeMun** in Cartograph, sees a **labeled** aerial, and **drags the circle's center + radius handles** to frame the neighborhood bounded by **Big Bend (W) · Forest Park (N) · Skinker (E) · Clayton (S)** — reading those streets off the labels — with the circle only slightly larger than that frame. They also fill the **border-street + name/blurb** metadata fields. On commit the tool writes `geography.json` + `neighborhood_boundary.json` (+ the metadata), and re-pours so 2D + 3D render the neighborhood **centered**. Re-editing the circle later re-scopes + re-pours cleanly (§11). **Installation-agnostic** — no HiPointe hardcode; a Provincetown drop-in uses the same tool with zero kit edits (`feedback_installations_are_independent`).

## Boundaries
- **Installation-agnostic; do not name any installation in shared code** (`lafayette-square` = default fast-path, `toy` = fixture only).
- **Lafayette Square must stay byte-identical** — its extent doesn't change; verify LS's pour/render unaffected.
- Commit per reviewable step; the coordinator (Boz) coordinates the shared branch (`curb-offset-draw`). Flag before touching canonical docs.
- The current HiPointe slab is baked locally (roughly centered from the last hand-pour); your tool + the correct polygon supersede that hand-work.
