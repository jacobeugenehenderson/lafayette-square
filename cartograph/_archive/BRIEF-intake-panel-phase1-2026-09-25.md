# Diary — BRIEF-intake-panel-acquired, phase 1 (dispatched and done 2026-09-24, Wellhead)

Retired from the live brief 2026-09-25. The live state is in `docs/briefs/BRIEF-intake-panel-acquired.md` §State.

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, your own.**
**Agent: FRESH.** This is a survey of the whole intake, and it needs clean eyes.

- **Phase 1 bounds:** read anything; write read-only probes in `scratch/`; query public data catalogues over the network.
  - ⛔ No `src/` or `cartograph/*.js` edits.
  - ⛔ No pours.
  - ⛔ No downloads committed.
- ⛔ **The `elevation` row is being built by another session (Revetment [a572ba]).** Coordinate with it; don't duplicate it. Its work is the template: an acquired input, `verifiedAbsent` when searched-and-none, and **no `ABSENT.FALLBACK` for a row whose absence makes a wrong map** (`intake-rows.mjs` elevation row, ruled 2026-09-24).


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


## Rulings on phase 1 (Jacob, 2026-09-24)

*"Remember this is all a cleaning pass as well."*

1. **The machine SUGGESTS a well; the operator CONFIRMS it** into the town's `sources.json`. Same shape as the gazetteer ring, which is a hint until adopted. The reason is measured: one St. Louis server offers dozens of layers that match "parcels".
2. **`census-forest-park` merges into one municipal tree-inventory row** that holds every well found. It was one St. Louis layer filed as a row.
3. **`render-ledger` is retired** (done, `intake-rows.mjs`). Its only producer writes Lafayette Square's path.
4. **Poles and lamps are different artifacts; list them separately.** A utility-pole layer is not a lamp census unless it marks lighting.

▶ The method and the per-town results, re-runnable (read-only):
- `scratch/intake-artifact-discovery-probe.mjs` — catalogue search by keyword and bbox (Tally). ⛔ Alone it fails the LS regression.
- `scratch/intake-jurisdiction-host-probe.mjs <lat> <lon>` → `scratch/intake-server-crawl-probe.mjs <root> <bbox>` — the town's own GIS host, found from its official website. Rediscovers LS's forestry and assessor wells.
- `scratch/intake-host-discovery-probe.mjs` — ⛔ a NEGATIVE result: harvesting every host near the town returns noise. Recognition must test values, not field names.

