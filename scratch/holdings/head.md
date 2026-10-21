# Holdings — what each town's folders hold, who reads it, and whether the Inputs model knows it (2026-10-21)

*Plumb, for Boz, on Jacob's ask: "take a swing thru the folders for each of the hoods to determine what data we collected
and confirm we know what's where." Read-only. Disk = the main checkout (where the untracked data lives); code = integration
`33a01e22` (+ `9477fdd8`, data only). This is a snapshot: ⛔ quote no count from it after the day it was taken; re-run.*

## How it was measured (and what that cannot see)

- **Walked:** `cartograph/data/<town>/` and `public/baked/<town>/` for LS, HPDM, Huron, PTown, JH, Altadena; plus `inventory/`
  (incl. `IGNORE/`), `assets/`, `scratch/lafayette-square-research`, `scratch/huron-research`, `scratch/data-licences`,
  `_handoffs`, `cartograph/data/lafayette-square-staging`, `src/data`. Numbered series, `photos/`, `logos/`, `_cache/`, baked
  `trees/` and `share/` are one row each. Not walked: `theward/` (does not exist; the Ward's data lives in the paths above),
  and `scratch/ground-budget/lattice-r1/ls-pour/tree/` (an untracked 1.3 GB, 4,300-file copy of the repo, incl. the LS
  nomination files, from a scratch pour; it is a DUPLICATE of everything, listed once here).
- **What (sampled):** each file was opened. JSON: shape, first keys, and any `source`/`meta`/`generated`/`_comment` field.
  Text/CSV: first non-blank line. Binary: magic bytes. Nothing in the "what" column is guessed from a filename.
- **Source and date:** only what the file says about itself (sampled meta) plus its mtime ("newest"). ⛔ An mtime is when
  the file was last WRITTEN here, not when its publisher dated it. Many raw files carry no date of their own: that is a finding.
- **Read by:** every tracked code file at integration HEAD (`.js .mjs .jsx .ts .py .sh`, excluding `scratch/`, `docs/`,
  `public/`, `cartograph/_archive/`) searched for the file's basename. A file whose every matching line writes (write/mkdir/
  out/save) is "(W)". Tier: **kit** = `cartograph/`, `src/`, `arborist/`, `apps-script/`, server code · **legacy** =
  `scripts/` only · **checks** = `checks/` only · **none**. ⚠️ A basename match is a reference, not proof of a read
  (`buildings.json` and `photos` match many unrelated lines); "none" is the strong finding, "kit" the weak one.
- **Licence row:** `scratch/data-licences/REGISTER.md` (rows R1–R25), matched by a filename pattern I wrote (the patterns are
  in the generator, below). ⛔ That file is untracked, in the main checkout only. `references/registry.json` holds reference
  manuals and research sources; its only data-source rows are `osm`, `naip`, `usda-fia`, `us-census-geocoder`, `noaa-*`.
- **Inputs model:** a row in `cartograph/intake-rows.mjs#INTAKE_ROWS` (path, or a `present()` alternate), or a file named by
  a well the town's `sources.json` declares (via `cartograph/states/*.mjs`), or `sources.json`'s `cropland`/`tide`.
- **Kind:** **external** (came from a publisher) · **authored** (ours: config, operator authoring) · **cache** · **backup** ·
  **doc/code** · **derived** (`clean/`, rosters and listings) · **output** (`public/baked/`). The headline lists judge
  external data only; authored and derived files are listed but not called defects.
- **Regenerate** (from a checkout of the code; `<main>` = the checkout holding the town data; writes only the named file):
  `sh scratch/holdings/regenerate.sh <main> scratch/holdings/HOLDINGS-$(date +%F).md`. The narrative above the tables is
  `scratch/holdings/head.md`, hand-written: its numbers are this run's and must be re-read against the new tables.
  ⛔ The durable form is the check proposed at the end.

## ⭐ Findings, measured

### 1. THE LS NOMINATION CLASS: LS's National Register data is collected three times and the kit reads none of it

- **The nomination itself:** `assets/lafayette-square-hd.pdf`, 136 pages, Acrobat Paper Capture (2006, modified 2017).
  Read by no code.
- **Its OCR extraction**, `inventory/lafayette-square-hd__*` (7 files, tracked, mtime 2026-02-15; `inventory/README.txt`
  describes them): `explicit_buildings_master.csv` (283 address rows with source page and excerpt) ·
  `inventory_style_groups.csv` (Item 7 style groups, years with OCR corrections marked) · `survey_map_legend.csv` ·
  `utm_reference_points.csv` (**5 UTM zone-15 points**) · `verbal_boundary_description.txt` (Item 10, "Beginning at the point of
  intersection of the north line of the east-west alley of City Block 1323 and the east line of Jefferson Avenue…") ·
  `narrative_sections.md` · `page_corpus.md`. Only `explicit_buildings_master.csv` has a reader, and it is **legacy only**
  (`scripts/match-nps-buildings.mjs`, `scripts/merge-nps-to-buildings.mjs`).
- **Its merge into the legacy ledger:** `src/data/nps-building-matches.json` (34 records; e.g. "2229 Park" → `bldg-0316`,
  "1923-37 Park" → no match) and `src/data/buildings.json` (1,082 buildings): `historic_status` on 1,056 (1,055
  "contributing"), `architecture.style` 780, `nps_style_group`/`nps_style_period` 775, `nps_style_inferred` 741,
  `nps_listed`/`nps_source_pages`/`nps_context` 32, `original_owner` 16, `architect` 5.
- **Who reads it:** the LS app does, through the legacy content path (`src/data/loadInstanceData.js` maps LS `buildings` to
  `./buildings.json`; `PlaceCard.jsx` shows `historic_status` and `nps_style_period`). **The kit does not:**
  `bake-content.js` reads a town's NR data only from `content/nr-inventory.json` (HPDM has one: 221 rows, `{housenum, street,
  year, style, contrib}`); LS has none. Tonight's LS dry run (`bakeContent({ scene:'lafayette-square', dryRun:true })`):
  `nr_attributed 0`, and every roster record has `contributing: null`, `style: null`, `period: null`.
- ⇒ **When LS moves onto the roster path (the reapplication), every NR field above is lost unless LS gets a
  `content/nr-inventory.json`.** The rows to build it from are the extraction CSVs and the legacy ledger, not a new OCR.
  Nothing in the Inputs model or the register knows any of these files (R24 is HPDM's inventory only).
- ⭐ **For Zob's district-code fix (held `9477fdd8`):** I told Boz tonight that LS has "no district polygon". **That was
  wrong as stated:** the nomination carries its own boundary, as five UTM points and an Item 10 metes-and-bounds description.
  Whether the five points enclose the district (the NR form's usual meaning) and how they sit on LS's frame is **not
  measured**.

### 2. Researched listing enrichments, collected and read by no kit code

- `scratch/huron-research/` (16 JSON files, plus 16 `-NOVEL.md` and `HOST-WORKLIST.md`) and
  `scratch/lafayette-square-research/` (4 JSON files). Each JSON is keyed by listing id (`huro-lst-0228`, `lmk-025`) with
  `_source` URL, `_fetched` date, `_match_name` and `_confidence` per entry. The only code that names any of them is
  `checks/claims-research-is-keyed-to-the-place-it-describes.mjs`, and the filename it names is `civic.json`.
  Whether their contents reached the towns' `listings.overrides.json` by hand is **not established**. No licence row:
  they are third-party web pages (hoodline, stlmag, cityofhuron.org…), each entry naming its own URL.

### 3. Tree, canopy and tree-mix inputs: read only by the legacy `scripts/` pipeline

On every St. Louis town and on Huron/PTown: `raw/canopy.tif`, `raw/city_trees_raw.json`, `raw/osm_trees_raw.json`,
`raw/forest_park_trees_raw.json` (HPDM), `tree-mix.json`. Their readers are `scripts/13…18-*.py|mjs` only. The kit reads their
products (`clean/park_trees.json`, `clean/osm_trees.json`, `clean/derived_trees.json`, which the Inputs model knows). Whether
the legacy scripts are still the producer of those clean files for every town is **not established** here.

### 4. READ BUT UNDECLARED: external data the kit reads that the Inputs model has no row for

Generated list below. The classes: **content/** (HPDM `nr-inventory.json`, `menus.json`, `photos/`, `logos/`; Huron
`events.json`; LS `menus.json`), **water** (`raw/bathymetry-sources.txt`, `raw/water-datums.json`, PTown `raw/tide.json`,
which `sources.json` does not declare), **`raw/elevation.json`** (LS, Huron; read by `derive.js`/`pipeline.js`, while the
elevation row knows only `elevation.tif`/`elevation-sources.txt`), HPDM **`raw/admin_boundaries.json`**, and LS's top-level
**`buildings.json`** (the render ledger, "projected from src/data/buildings.json").

### 5. NO LICENCE ROW

Generated list below. The external data with none: LS `content/menus.json` and top-level `buildings.json`, Huron
`content/events.json`, the research folders, the LS master-inventory spreadsheets, the art packs under `assets/`
(`assets/botanical-reference-hires/README.txt` names ambientCG CC0 for part, per R20), and `src/data/` (incl.
`planetarium/*`: star and constellation catalogues, publisher not established). **The LS nomination** (pdf and extraction)
matches no row of its own; the generator files it under R24, which covers HPDM's only.

### 6. DUPLICATES

- **The LS master inventory spreadsheet in 20 versions:** `inventory/IGNORE/` holds 19 (`v2`…`v9`, `single_tab*`,
  `rebuilt_institutional*`, `filled_from_nomination_and_inference`, two "copy" files), and `assets/Lafayette-Square Master
  Inventory.xlsx` is byte-identical to `inventory/IGNORE/… copy.xlsx`. All read by no code; which version is canonical is not
  recorded anywhere I found. ⛔ Not opened cell by cell: what each version adds is not established.
- **The scratch pour tree** above: the whole repo again, 1.3 GB.
- **Byte-identical pairs** (generated list below): mostly `clean/terrain.*` = `public/baked/<town>/terrain.*` and
  `content/*` = `public/baked/<town>/content/*` (the bake copies them; expected), `clean/elevation.json` = `raw/elevation.json`
  (LS, Huron), the tree atlases shared between LS, HPDM and Huron, and four towns' identical 34-byte `building-overrides.json`.

### 7. Per-town notes

- **JH:** 46 of 47 rows untracked. The worktree copy holds only `sources.json`, so in a worktree `readSources('jacksonheights')` throws
  ("Create data/jacksonheights/geography.json first"): its geography is untracked, in the main checkout only. Its NYC wells' raw files are present
  (`nyc_parcels`, `nyc_buildings`, `nyc_address_points`); its tree wells' files (`nyc_forestry_trees.json`,
  `nyc_street_tree_census_2015.json`) are not on disk.
- **Altadena:** 37 rows, 1.1 GB; read by no live surface for buildings (`loadInstanceData.js`: "0 address, NOT WIRED").
- **Backups and stale copies** (generated list): `*.prebak`, `centerlines.backup-*`, `ribbons.json.pre-promote-*`, an
  Illustrator `~ai-*.tmp` in `assets/`.
- **`_handoffs/`** holds 55 markdown handoffs and no data.

## The check that would keep this true (proposed, not built)

`checks/claims-every-holding-is-known.mjs`, safe tier, read-only:
1. **Read the disk:** walk the same roots per town (`eachTown`), collapsing series as above.
2. **Read the model, never restate it:** import `INTAKE_ROWS` (with each row's `present()` alternates), `readSources(town)`
   plus the state records' well `file`s, and a new **`HOLDINGS` declaration** for what is legitimately neither: derived
   (`clean/`, by the producer that writes it), authored config, caches, and strays with a named owner and purpose. Each row
   names its **licence-register id** (so the register moves from an untracked scratch file into a tracked one the check reads).
3. **Fail loudly** (Layer 0 q2) on: a file no model row and no `HOLDINGS` row claims · an external file with no licence id ·
   a declared file missing from disk · an input whose only readers are `scripts/` or `checks/` (the LS-nomination class) ·
   two byte-identical external files outside the bake's known copies.
4. **Mutation-test it:** drop an unknown file into a fixture town, strip a licence id, delete a declared file, add a legacy-only
   reader; each must go RED.

Open questions it would force (Jacob's, not mine): whether `scratch/*-research` and `inventory/` are holdings (declare them
with an owner) or residue (Diary them); which master-inventory version is canonical; whether the LS nomination becomes LS's
`content/nr-inventory.json` (finding 1).

---

## The tables (generated)
