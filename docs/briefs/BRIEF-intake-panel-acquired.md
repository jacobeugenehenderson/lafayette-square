# BRIEF — Bring the whole inputs panel into the pour: every row acquired, or loudly accounted for

<!-- BRIEF-STATE
status: OPEN
dispatched: yes (2026-09-24, Wellhead)
written: 2026-09-24
evict-when: every row in cartograph/intake-rows.mjs has a decided fate (auto-acquired · authored · per-town search) and the pour prints each row's status; Jacob has seen it on a fresh town
-->

**Status:** DISPATCHED 2026-09-24 by Jacob (Boz drafted it).
**Phase 1 is research and design, with no code.** Phase 2 builds one row at a time, each with Jacob's go.

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, your own.**
**Agent: FRESH.** This is a survey of the whole intake, and it needs clean eyes.

- **Phase 1 bounds:** read anything; write read-only probes in `scratch/`; query public data catalogues over the network.
  - ⛔ No `src/` or `cartograph/*.js` edits.
  - ⛔ No pours.
  - ⛔ No downloads committed.
- ⛔ **The `elevation` row is being built by another session (Revetment [a572ba]).** Coordinate with it; don't duplicate it. Its work is the template: an acquired input, `verifiedAbsent` when searched-and-none, and **no `ABSENT.FALLBACK` for a row whose absence makes a wrong map** (`intake-rows.mjs` elevation row, ruled 2026-09-24).

## Jacob's ruling and his instruction

> *"Terrain and lidar needs to be added to the fetch pour." · "The whole inputs panel has to get brought in eventually."*
> *"Given it will be a machine agent doing the research, please also ask to look for the ARTIFACT, not the specific source. (Tree census might be in a couple of places.)"*

## The problem

The kit was cast around Lafayette Square, whose inputs were hand-gathered. `cartograph/intake-rows.mjs` defines the rows:
- **`floor`** (required): geography, neighborhood, boundary, OSM.
- **`elective`** (optional): msbf, **elevation**, lamps, parcels (`raw/stl_parcels.json`, a St. Louis path), survey, centerlines, measurements, render-ledger, building-overrides, tree-species-map, the tree censuses (city, forest-park, osm, derived), building-fabric, park-polygon, overture-places.

`EXTENT-DESIGN` rules that *"owed rows never gate the seal"*. So a pour proceeds without the electives, and **a missing input just makes the town quietly thinner.** Measured instances:
- Provincetown baked **flat**: no terrain, and nothing complained.
- Huron baked **0 street lamps** (`ROADMAP H-17`).

That is Layer 0's silent fallback.

## ⭐ Look for the ARTIFACT, not the source

For each row, first define the **artifact**: what the kit needs, in data terms. For example:
- **"tree inventory":** point locations, plus species and trunk size where available;
- **"terrain":** a bare-earth elevation raster at 1–10 m;
- **"land parcels":** polygons with ids.

**Then** search for where that artifact exists **for a given town**. It is often in **several places at once**:
- city or county open-data portals;
- state GIS clearinghouses;
- federal datasets;
- OSM;
- other open collections.

⭐ **A census is the union of its wells** (`ORIENTATION`, *"combine them all and remove duplicates — never let one source win and hide the others"*). So the method must **discover and union every available well**, never pick one named source. **Never hard-code "the St. Louis census".** The method has to find Provincetown's, Huron's and the next town's without a human.

## Phase 1 deliverable: the classification, in chat to Jacob

For **every** row in `intake-rows.mjs`, decide its fate and justify it:

1. **AUTO — acquirable for any US town by a defined method** (elevation, lamps, trees, buildings, places…). Give:
   - the artifact definition;
   - the discovery method: which catalogues or APIs are queried, and how a candidate is recognised as that artifact (schema, geometry type, fields);
   - how multiple wells are unioned and deduplicated;
   - the licence/terms check each source must pass. Every source goes through `references/`'s terms gate (`references/README.md`, rule 1). Open-data licences are recorded on the source, never assumed.
2. **AUTHORED — the operator's work, not intake** (e.g. survey widths, centerlines, measurements, building-overrides). For a new town, these come from the authoring tools. The pour says "authored: none yet", which is a normal state, not a failure.
3. **PER-TOWN SEARCH — may or may not exist** (parcels, tree censuses). The pour searches, and records either what it found or `verified-absent` with what it looked at. `intake.json` already has `verified-absent`; use it.

Also flag every row whose **definition** is LS-specific (a path like `raw/stl_parcels.json`, a St. Louis dataset baked into the row). That is Layer 0 Class D in the intake itself. **It reaches past the row model into consumers:** `derive.js`'s parcel loader hard-codes `['stl_parcels.json','stlco_parcels.json']`, so huron's declared Ohio well (`sources.json` → `oh_parcels.json`) is never read there (it prints *"St. Louis City/County only"*; Gantry, 2026-09-24). Grep every consumer for a hard-coded well, not just `intake-rows.mjs`.

**Prove the method on real towns, read-only:**
- **Provincetown** (MA), scene `provincetown` (renamed from `02657` on 2026-09-24);
- **Huron** (OH);
- one **Outer Cape** neighbour of Provincetown.

For each, show what the discovery finds per row, and **LS as the regression**: the method must rediscover what LS has by hand.

## The loud-status requirement (Layer 0)

Every pour prints **one line per row**:
- ✅ acquired, with the source(s) and count;
- ✍️ authored, with the count, or "none yet";
- ◻️ `verified-absent`, with what was searched;
- ⛔ **FAILED** or **not looked for**. That's a loud line, never silence.

⭐ Status is **computed from disk**, never stored (`intake-rows.mjs`'s own rule). The Extent panel shows the same list. A check goes red when any row ends a pour in "not looked for".

## Read first (canon, then code)

**Canon:**
- `ORIENTATION` (Layer 0; "a census is the union of its wells");
- `EXTENT-DESIGN` (§0.8, and the owed-rows rule);
- `cartograph/INTAKE.md`;
- `INTAKE-CATALOGUE.md`, if present;
- `ROADMAP H-17` (lamps) and `A09` (the node tags the fetch throws away);
- `references/README.md`.

**Code:**
- `cartograph/intake-rows.mjs` (the row model, and why status is never stored);
- the fetchers `cartograph/fetch.js`, `fetch-msbf.js`, `fetch-dem.mjs` (Revetment's elevation fetcher, 2026-09-24, **the template for every AUTO row**; distinct from the older `elevation.js`, a sparse point-height query for buildings), `fetch-parcels.mjs`, `fetch-overture-places.js`;
- `bake-lamps.js`, `bake-trees.js` (the tree-bake inputs manifest `tree-bake-inputs.mjs` is this idea for one class);
- the Pour and Bake routes in `cartograph/serve.js`;
- `src/cartograph/SourcesPanel.jsx`.

**Confirm, then plan.** Tell Jacob what you found in the code. ⛔ If the code contradicts this brief, stop and flag it.

## Coordination

This checkout is shared by several sessions: Gantry (highways, ground), Revetment (terrain, coast), Ferrule (camera), and Boz.
- Commit only your own paths, by pathspec, after `git status`.
- If a file is already dirty, commit only your own hunk (see the `update-index` method in the memory note on pathspecs), or ask its owner.
- ⛔ No stash, reset, rebase or branch switch.
- Announce anything that writes `cartograph/data/` or `public/baked/`.

**Stop after phase 1's classification and demonstration.** Jacob rules on it, row by row, before any row is built.
