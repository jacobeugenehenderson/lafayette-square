# BRIEF — Bring the whole inputs panel into the pour: every row acquired, or loudly accounted for

<!-- BRIEF-STATE
status: OPEN
dispatched: yes (2026-09-24, Wellhead)
written: 2026-09-24
evict-when: every row in cartograph/intake-rows.mjs has a decided fate (auto-acquired · authored · per-town search) and the pour prints each row's status; Jacob has seen it on a fresh town
-->

**Status:** phase 1 done 2026-09-24 (Wellhead); phase 2 in progress, one row at a time with Jacob's go. The phase-1 dispatch text and rulings are in the Diary (`cartograph/_archive/BRIEF-intake-panel-phase1-2026-09-25.md`).

## State (2026-09-25)

**Ruled (Jacob, 2026-09-24):** the machine SUGGESTS a well, the operator CONFIRMS it into `sources.json` · one municipal tree-inventory row · `render-ledger` retired · poles and lamps are different artifacts · *"remember this is all a cleaning pass as well."*

**Landed:** `render-ledger` row retired `307d6e64` · tree rows merged `4a6dbc4e` · parcels by declaration in the fetch, every consumer, the row and the check (`3d29da6a`), and in `derive.js` (`9a2f84c3`) · duplicate ways and relations dropped at the fetch (`3950935c`, `effe2a60`) · the radius has one home (`59950f41`) · Extent's Bake applies, reports and restores (`5a329c74`).

**Open:**
- Parcels feed LAND USE only (ruling (b)): written, not landed. It changes LS's and HPDM's legacy block layers, so it is held until the per-town tree-mask numbers are measured and seen.
- The AUTO rows are not yet in the pour: Overture places, canopy fill, OSM trees and lamps (both already inside `raw/osm.json`'s `pois`).
- Lamps: the row's path is a hand export nothing writes; poles ≠ lamps; the derived-lamps ruling is unbuilt.
- The tree files are still named after St. Louis layers (`park_trees` / `forest_park_trees`).
- Per-row loud status on every pour, and a computed "not looked for" state.
- The suggest/confirm surface for wells; provincetown's MassGIS parcels unconfirmed (`claims-intake-absence-is-loud` red on it).
- huron + provincetown need a re-fetch (`claims-osm-ground-has-no-duplicates` red on both) — Jacob's call.
- The discovery method's probes: `scratch/intake-{artifact-discovery,jurisdiction-host,server-crawl}-probe.mjs`; the blind host harvest (`intake-host-discovery-probe`) is a negative result.

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

## The loud-status requirement (Layer 0)

Every pour prints **one line per row**:
- ✅ acquired, with the source(s) and count;
- ✍️ authored, with the count, or "none yet";
- ◻️ `verified-absent`, with what was searched;
- ⛔ **FAILED** or **not looked for**. That's a loud line, never silence.

⭐ Status is **computed from disk**, never stored (`intake-rows.mjs`'s own rule). The Extent panel shows the same list. A check goes red when any row ends a pour in "not looked for".

## Coordination

This checkout is shared by several sessions: Gantry (highways, ground), Revetment (terrain, coast), Ferrule (camera), and Boz.
- Commit only your own paths, by pathspec, after `git status`.
- If a file is already dirty, commit only your own hunk (see the `update-index` method in the memory note on pathspecs), or ask its owner.
- ⛔ No stash, reset, rebase or branch switch.
- Announce anything that writes `cartograph/data/` or `public/baked/`.

## Next phase: the skeletal content pass at intake (Jacob, 2026-09-24)

> *"The entire research 'step' is set off discretely. So far, I've been doing it once we have a 'generally' stable map … but this is another thing that we can anticipate. I'm thinking specifically about zoning-level info, the number of restaurants, etc. and the initial research pass. So that would be skeletal information; a later step would fill out the listings (to fill in the ticker and menus where we can)."*

**The split, and why it holds:** the skeleton is keyed to the **extent**, not to baked buildings. So it runs at intake and survives every re-pour. Only the **join** of a place to its building needs a stable map, and that already happens at content-bake (`bake-content.js`).

**What the skeleton produces, per town, computed from disk and printed on every pour (⛔ never a count in prose):**
- **Places by category:** dining, bars, shops, civic, worship, schools, lodging. The unioned wells are OSM POIs plus Overture Places, deduplicated (`INTAKE-CATALOGUE §3.3`), with Overture's licence derived per record (`overture-licence.mjs`).
- **The going-concern share:** website / phone / `opening_hours` (`INTAKE-CATALOGUE §4.1`).
- **The zoning / land-use mix** where an assessor well exists. The format is declared, never guessed (`§3.2`), else `verified-absent`, loudly.
- **The address spine's coverage.** This decides whether the Society Pages can be wired (`§3.2`, the roster acceptance test).
- **The ranked to-do list for the later fill** (`prominence.mjs`). Today it runs only at content-bake: say what it needs that the skeleton lacks.

**The fill stays a later, separate step:** hours, menus, descriptions and photos, worked down that ranked list (`§3.2b`), feeding the ticker (`ROADMAP H-22`/`H-30`) and menus.

**Deliverable first, in chat to Jacob, before building:**
- which existing producers already compute each line;
- what has to move earlier, and what can't;
- the one intake status line per skeleton row.

Prove it on Provincetown and Huron, with LS as the regression.
