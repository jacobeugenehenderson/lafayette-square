# HANDOFF — Neighborhood Perimeter Builder (the extent editor UI)

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

**Recommended shape** (yours to refine): a **polygon/box the operator places on the labeled aerial** (drag vertices, or click the border streets), the tool **auto-fits the containing circle "just slightly larger" than the polygon** (center on the polygon centroid, radius = its circumscribing radius + small margin), writes both JSONs (center → geo center + bbox; radius → the fade bands + 256-gon), and offers a **"Re-pour"** action that runs the chain above. *(Type-the-street-names geocoding is a nice future seed but is the unreliable part — visual placement is the real capability; don't gate on geocoding.)*

**Phases 1+ — build to the approved sketch, reviewable steps.** Persist correctly (the exact JSON contract above), keep it re-runnable (§11), and make the re-pour driveable from the UI.

## Acceptance =
Operator opens **HiPointe-DeMun** in Cartograph, sees a **labeled** aerial, places the perimeter to **Big Bend (W) · Forest Park (N) · Skinker (E) · Clayton (S)**, the tool centers that polygon in a circle **only slightly larger** than it, writes `geography.json` + `neighborhood_boundary.json`, and re-pours so 2D + 3D render the neighborhood **centered**. Re-editing the perimeter later re-scopes + re-pours cleanly (§11). **Installation-agnostic** — no HiPointe hardcode; a Provincetown drop-in uses the same tool with zero kit edits (`feedback_installations_are_independent`).

## Boundaries
- **Installation-agnostic; do not name any installation in shared code** (`lafayette-square` = default fast-path, `toy` = fixture only).
- **Lafayette Square must stay byte-identical** — its extent doesn't change; verify LS's pour/render unaffected.
- Commit per reviewable step; the coordinator (Boz) coordinates the shared branch (`curb-offset-draw`). Flag before touching canonical docs.
- The current HiPointe slab is baked locally (roughly centered from the last hand-pour); your tool + the correct polygon supersede that hand-work.
