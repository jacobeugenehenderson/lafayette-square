/**
 * intake-rows.mjs — what a pour COULD read, in one place.
 *
 * The manifest is `tree-bake-inputs.mjs` generalised. That module is already
 * exactly this idea for one input class — "ONE answer to *what does scene X's
 * tree bake read* — not two that drift" — including the honest zero on absence.
 * This is the same answer for the whole cartograph render-side column.
 *
 * ⭐ THE SPLIT THAT SHAPES THIS FILE (ratified with Jacob, 2026-07-20):
 *
 *   A row's DEFINITION is kit-global. A row's PROVENANCE is per-town.
 *
 * What `raw/elevation.tif` IS — terrain relief, lands here, obtained from any
 * GeoTIFF — is identical for Lafayette Square and for Łódź. They do not
 * disagree about what elevation is. So the definitions live HERE, once, and
 * `cartograph/data/<scene>/intake.json` carries only what is genuinely that
 * town's: where its copy came from, and its `verified-absent` marks.
 *
 * The rejected alternative was declaring the rows inside each scene's
 * intake.json (`BRIEF-intake-manifest.md §2.1`'s letter). That is ~20 facts
 * copied into six scene files, drifting — the same defect the catalogue already
 * files as live at `content/profile.json` ÷ `src/instances/<look>.js`
 * (`INTAKE-CATALOGUE §3.1 A4`, `feedback_dual_hydration_paths_drift`).
 *
 * ⛔ STATUS IS NEVER STORED. It is computed by looking at disk, on every read.
 * A persisted status is one that goes stale and then lies; a wrong-but-real
 * status is useful, a hardcoded green one is worse than nothing.
 *
 * ⛔ THIS IS AN INDEX, NOT A MANUAL (`BRIEF §2.1a`, `BOZ.md §3` — one home per
 * fact). A row carries a POINTER to the doc and one line of what it unlocks.
 * Do not copy procedure text in here. When the procedure changes, the doc
 * changes; this file keeps pointing at it.
 *
 * SCOPE: the cartograph render-side column (`BRIEF §5.1` floor + `§5.2`
 * electives), enumerated 2026-07-20 and re-verified against the scene dirs on
 * disk before this file was written. The arborist / meteorologist / content
 * columns are catalogued in `INTAKE-CATALOGUE.md` §1/§2/§3 and drop in here as
 * additional `domain` values without a schema change.
 */
import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync, openSync, readSync, closeSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sceneDir } from './config.js'
import { jurisdictionForScene } from './intake-jurisdiction.mjs'

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')

/**
 * ⭐ TWO ROW KINDS.
 *
 * `file` — the row IS a file. Status is `existsSync` + non-zero size. Most rows.
 *
 * `measure` — the row is a PROPERTY OF data already acquired, and its answer is
 * COVERAGE, not presence. Jacob, 2026-07-20: *"You need a way to say how tall
 * the buildings are."* Building fabric has no file of its own — the storey
 * counts live as tags inside `raw/osm.json` (Łódź) or as fields inside a
 * hand-authored ledger (Lafayette Square) — and "does the file exist" cannot
 * express it. `raw/osm.json` is present for every scene; the fabric inside it
 * ranges from complete to nothing.
 *
 * This is what the earlier "cheap signals are derived, not rows" call got
 * wrong. Derived-from-acquired-data is still a thing a town HAS or LACKS, and
 * the operator needs to be told which.
 */
export const KIND = { FILE: 'file', MEASURE: 'measure' }

/**
 * Measurements read multi-megabyte artifacts (centrum's raw OSM is 121 MB), so
 * cache on the source's identity — mtime + size. A pour rewrites the file and
 * invalidates the entry; nothing else can.
 */
const _measureCache = new Map()
function cachedMeasure(key, file, compute) {
  let st
  try { st = statSync(file) } catch { return null }
  const stamp = `${key}:${st.mtimeMs}:${st.size}`
  const hit = _measureCache.get(key)
  if (hit && hit.stamp === stamp) return hit.value
  let value = null
  try { value = compute() } catch { value = null }
  _measureCache.set(key, { stamp, value })
  return value
}

/**
 * How much of this scene's building stock carries a real storey count.
 *
 * Prefers the BAKED slab: it is small, and it reports what actually reached the
 * render rather than what merely exists upstream — the distinction the slab
 * contract exists to enforce. Falls back to `clean/map.json` for a scene that
 * has been fetched but not yet poured, which is precisely when an operator most
 * wants to know whether the fabric is there.
 */
function measureBuildingFabric(scene) {
  const baked = join(REPO_ROOT, 'public', 'baked', scene, 'buildings.json')
  if (existsSync(baked)) {
    const m = cachedMeasure(`fabric:${scene}:baked`, baked, () => {
      const b = JSON.parse(readFileSync(baked, 'utf8')).buildings || []
      // ⚠️ "No building declares a storey count" and "this slab was baked
      // before the field existed" are different facts and must not collapse
      // into the same 0. A slab where NOT ONE entry even carries the key is
      // STALE, not empty — reporting 0/1082 for Lafayette Square would tell the
      // operator to go acquire 1,082 storey counts that are already sitting,
      // hand-authored, in its ledger. Fall through to the upstream source.
      const declares = b.some(x => Object.hasOwn(x, 'stories'))
      if (!declares) return null
      return { known: b.filter(x => x.stories != null).length, total: b.length, from: 'slab' }
    })
    if (m) return m
  }

  // Upstream, in precedence order. The hand-authored ledger is how a US town
  // says this at all (its OSM won't carry it); the OSM tags are how a
  // hand-mapped European town gets it for free (`INTAKE-CATALOGUE §5.1`).
  const ledger = join(sceneDir(scene), 'buildings.json')
  if (existsSync(ledger)) {
    const m = cachedMeasure(`fabric:${scene}:ledger`, ledger, () => {
      const raw = JSON.parse(readFileSync(ledger, 'utf8'))
      const b = Array.isArray(raw) ? raw : (raw.buildings || [])
      return { known: b.filter(x => x.stories != null).length, total: b.length, from: 'ledger' }
    })
    if (m && m.known > 0) return m
  }

  const mapP = join(sceneDir(scene), 'clean', 'map.json')
  if (!existsSync(mapP)) return null
  return cachedMeasure(`fabric:${scene}:map`, mapP, () => {
    const b = JSON.parse(readFileSync(mapP, 'utf8')).buildings || []
    const known = b.filter(x => {
      const lv = parseFloat((x.tags || {})['building:levels'])
      return Number.isFinite(lv) && lv >= 1
    }).length
    return { known, total: b.length, from: 'map' }
  })
}

/**
 * How a row behaves when the file ISN'T there. This is a hard three-way, not a
 * boolean — `INTAKE-CATALOGUE §0`'s headline finding is that absence in this
 * kit does not reliably degrade to nothing, it degrades to *Lafayette Square*,
 * and a row that bleeds must be visibly distinct from one that honestly
 * vanishes. Recording it here is what lets the panel tell the truth about it
 * before the excision lands (`BRIEF-ls-bleed-excision.md`).
 */
export const ABSENT = {
  /** The feature simply isn't rendered. The aspirational model, working. */
  HONEST_ZERO: 'honest-zero',
  /** Falls back to a documented, town-neutral default (OSM tags, AASHTO widths). */
  FALLBACK: 'documented-fallback',
  /** ⛔ Falls back to LAFAYETTE SQUARE's data, under this town's name. */
  LS_BLEED: 'ls-bleed',
}

/**
 * How an operator GETS one. Two-valued by ratification (`BRIEF §2.1a`): a row
 * resolves to a SOURCE (an endpoint/portal, with licence) or to a DOC (the
 * document describing how it gets made). Both are complete answers to "where do
 * I get this"; "unrepeatable" is not an answer.
 *
 * `BUTTON` is a SOURCE that has a programmatic endpoint — the one-button rule
 * (`INTAKE-CATALOGUE §4.2`). Tonight it is a declaration only; the Fetch button
 * itself is deferred (`BRIEF §2.2b`), and this field is the seam it lands on.
 */
export const ACQUIRE = {
  BUTTON: 'button',     // an endpoint exists → one button, no instruction
  SOURCE: 'source',     // a portal/download, but not yet automatable here
  OPERATOR: 'operator', // hand-work: measurement, correction, judgment
  DERIVED: 'derived',   // produced by an earlier step of our own pipeline
}

/**
 * ⚠️ EXTERNAL URLS ARE UNVERIFIED. `INTAKE-CATALOGUE.md`'s header marks every
 * external URL/licence `[unverified]` — the specialists could not confirm them
 * live — and says confirm before they ship on a panel. So no row here carries a
 * URL yet. `acquisition.note` carries the short in-repo-verifiable pointer; the
 * URL lands per-row as each is confirmed. Shipping an unconfirmed URL on the
 * panel is exactly the lie this whole manifest exists to stop.
 */
/**
 * ⭐ `licence` — WHO WE OWE, AND WHAT WE OWE THEM. The public credit is built
 * from this field and from nothing else.
 *
 * ⛔ PRESENT ONLY WHERE THE ROW'S SOURCE IS FIXED BY THE KIT AND THE TERMS WERE
 * READ AT THE SOURCE. A row whose well is chosen per town (elevation: "any
 * GeoTIFF"; parcels: whichever assessor; canopy: NLCD *or* WorldCover) has no
 * kit-global licence and MUST NOT get a guessed one — the file on that town's
 * disk came from somewhere this module cannot know. Absent `licence` is not an
 * omission, it is the honest answer, and `bake-sources.js` reports it as owed.
 *
 * ⭐ `requires` IS NOT DECORATION — THE TWO OBLIGATIONS ARE DIFFERENT ACTS.
 *   'attribution'  — ODbL §4.3: a Produced Work must carry a notice naming the
 *                    database and the licence, both linked. You must CREDIT.
 *   'licence-text' — CDLA Permissive 2.0 §2.1: sharing the Data means you
 *                    "make available the text of this agreement with the shared
 *                    Data." You must SHIP THE TERMS. Crediting is not that, and
 *                    a surface that renders both as one "© X" line has quietly
 *                    substituted the easy obligation for the real one.
 *
 * ⚠️ VERIFIED 2026-09-01, at the source, by reading the bytes — not from a
 * search summary, which got this wrong (it reported MSBF as ODbL, and so did
 * this file until today):
 *   curl -sL https://raw.githubusercontent.com/microsoft/GlobalMLBuildingFootprints/main/LICENSE
 *   curl -sL https://raw.githubusercontent.com/microsoft/GlobalMLBuildingFootprints/main/README.md | grep -i licen
 *   https://osmfoundation.org/wiki/Licence/Attribution_Guidelines
 *   https://opendatacommons.org/licenses/odbl/1-0/   (§4.3)
 * Re-run those before trusting this block; upstream terms change under you, and
 * a stale licence on a public page is worse than no page.
 */
const OSM_ODBL = {
  source: 'OpenStreetMap',
  sourceUrl: 'https://www.openstreetmap.org/copyright',
  credit: '© OpenStreetMap contributors',
  name: 'Open Database License (ODbL)',
  url: 'https://opendatacommons.org/licenses/odbl/1-0/',
  requires: 'attribution',
}

const MSBF_CDLA = {
  source: 'Microsoft Global ML Building Footprints',
  sourceUrl: 'https://github.com/microsoft/GlobalMLBuildingFootprints',
  credit: 'Building footprints by Microsoft',
  name: 'CDLA Permissive 2.0',
  url: 'https://cdla.dev/permissive-2-0/',
  requires: 'licence-text',
}

/**
 * ⭐ `question` — the row in the operator's voice, not the pipeline's.
 *
 * Jacob, 2026-07-20, on the building-fabric row: *"this would be 'does your
 * community have any augmented building scans?' or something."* The panel's
 * bar is that a capable non-specialist, handed it and a town name, can go
 * acquire these things (`BRIEF §7`). A pipeline noun — "render ledger",
 * "species routing" — fails that bar; a question about the town passes it.
 *
 * ⚠️ INCOMPLETE ON PURPOSE. Only `building-fabric` carries one today, written
 * with Jacob. Writing the other ~19 is the FEATURES pass (`BRIEF §7.1`,
 * deliverable #6) and wants his voice on each, not mine inventing twenty. The
 * panel falls back to `unlocks` where `question` is absent, so a half-populated
 * field degrades to the current reading rather than to a blank.
 */
export const INTAKE_ROWS = [
  // ── THE FLOOR (BRIEF §5.1) — no pour without these four. ──────────────────
  // Centrum poured with exactly these and nothing else, which is the proof the
  // floor is really this short and the strongest evidence for the aspirational
  // model: everything below the fold is elective.
  {
    id: 'geography', domain: 'cartograph', tier: 'floor',
    label: 'Geography',
    path: 'geography.json',
    unlocks: 'the frame and projection everything is placed in',
    absent: { kind: ABSENT.HONEST_ZERO, note: 'no frame — nothing can be placed' },
    acquisition: { kind: ACQUIRE.DERIVED, note: 'written by the Extent commit' },
    doc: 'cartograph/INTAKE.md',
  },
  {
    id: 'neighborhood', domain: 'cartograph', tier: 'floor',
    label: 'Neighborhood',
    path: 'neighborhood.json',
    unlocks: 'the scene identity — name, slug, display details',
    absent: { kind: ABSENT.HONEST_ZERO, note: 'no scene identity' },
    acquisition: { kind: ACQUIRE.DERIVED, note: 'written by the Extent commit' },
    doc: 'cartograph/INTAKE.md',
  },
  {
    id: 'boundary', domain: 'cartograph', tier: 'floor',
    label: 'Boundary',
    path: 'neighborhood_boundary.json',
    unlocks: 'the hood edge — buildings, lamps and trees all test membership against it',
    absent: { kind: ABSENT.HONEST_ZERO, note: 'no hood edge' },
    acquisition: { kind: ACQUIRE.OPERATOR, note: 'the Extent boundary pen or gazetteer ring' },
    doc: 'cartograph/INTAKE.md',
  },
  {
    id: 'osm', domain: 'cartograph', tier: 'floor',
    label: 'OSM extract',
    path: 'raw/osm.json',
    unlocks: 'streets, land-use and buildings — the base geometry',
    absent: { kind: ABSENT.HONEST_ZERO, note: 'no streets, no land-use, no buildings' },
    acquisition: { kind: ACQUIRE.BUTTON, note: 'Overpass via fetch.js — ODbL, local copy fine' },
    licence: OSM_ODBL,
    doc: 'cartograph/INTAKE.md',
  },

  // ── ELECTIVE (BRIEF §5.2) — each unlocks a feature; absent = feature absent.
  {
    id: 'msbf', domain: 'cartograph', tier: 'elective',
    label: 'ML footprints',
    path: 'raw/msbf.json',
    unlocks: 'accurate building footprints in place of OSM outlines',
    absent: { kind: ABSENT.FALLBACK, note: 'OSM buildings — aborts off-continent, expected' },
    // ⛔ WAS RECORDED AS ODbL AND IT IS NOT — corrected 2026-09-01. `fetch-msbf.js:27`
    // pulls `global-buildings/dataset-links.csv`, i.e. GlobalMLBuildingFootprints,
    // whose LICENSE file reads "licensed by Microsoft under CLDA Permissive 2.0"
    // and whose README §License says CDLA Permissive 2.0. (The older, genuinely
    // ODbL dataset is USBuildingFootprints — a different repo we do not fetch.)
    // A web search still answers "ODbL" for this; the raw bytes do not.
    acquisition: { kind: ACQUIRE.BUTTON, note: 'Microsoft GML footprints via fetch-msbf.js — CDLA Permissive 2.0' },
    licence: MSBF_CDLA,
    doc: 'cartograph/INTAKE.md',
  },
  {
    id: 'elevation', domain: 'cartograph', tier: 'elective',
    label: 'Elevation',
    path: 'raw/elevation.tif',
    unlocks: 'terrain relief — the ground stops being flat',
    absent: { kind: ABSENT.FALLBACK, note: 'flat ground (bake-terrain.js exits)' },
    // Verified 2026-07-20: bake-terrain.js is source-agnostic — it samples ANY
    // GeoTIFF against the scene geography. USGS appears only in comments and an
    // error string. ⚠️ The no-data sentinel IS USGS-specific and wants checking
    // per source (`BRIEF §5.6`).
    acquisition: { kind: ACQUIRE.SOURCE, note: 'USGS 3DEP for the US; any GeoTIFF elsewhere' },
    doc: 'cartograph/INTAKE.md',
  },
  {
    id: 'lamps', domain: 'cartograph', tier: 'elective',
    label: 'Street lamps',
    path: 'raw/osm_street_lamps.json',
    unlocks: 'street lamps and their night light-pools',
    // ✅ The unconditional LS fallback (the Altadena wrong-lamps bug) is CLOSED:
    // an authored well is read only for its OWN scene. A lampless town bakes
    // ZERO lamps and says so — it never inherits LS's.
    //
    // ⚠️ Still a bleed *site* only in that LS's authored well lives at the shared
    // default `src/data/street_lamps.json` (80 park lamps) rather than a per-scene
    // `data/lafayette-square/authored_lamps.json`. Moving it retires one of the 13
    // name-imports and the last scene-name special case in bake-lamps.
    //
    // NOTE this row tracks the OSM well only. Lamps bake as the UNION of
    // OSM ∪ authored, deduped at 4 m (`BAKE.md §4.5`) — so a filled row does not
    // mean the authored well is unnecessary, and an authored-only scene is legal.
    absent: { kind: ABSENT.LS_BLEED, note: "LS's authored well still sits at the shared src/data path (guard closed; union since 2026-07-23)" },
    acquisition: { kind: ACQUIRE.BUTTON, note: 'Overpass highway=street_lamp — ODbL' },
    licence: OSM_ODBL,
    doc: 'cartograph/INTAKE.md',
  },
  {
    id: 'parcels', domain: 'cartograph', tier: 'elective',
    label: 'Assessor parcels',
    path: 'raw/stl_parcels.json',
    unlocks: 'land-use codes, zoning, year-built for the content classifier',
    absent: { kind: ABSENT.HONEST_ZERO, note: 'no parcel signal' },
    // ⚠️ Not universal by nature: every US county has an assessor, most publish
    // ArcGIS or Socrata. Outside the US this well often does not exist in this
    // shape — but ADDRESSES do not depend on it, they live in OSM addr:*
    // (`INTAKE-CATALOGUE §3.2`, the correction, 2026-07-20). Scope this row to
    // what an assessor UNIQUELY gives — valuation, zoning, year_built, units.
    //
    // ⭐ The one row the catalogue explicitly says "needs a per-town endpoint
    // field" (`§4.2`). The endpoint is per-jurisdiction, so it is per-town data
    // and lives in the scene overlay's `endpoint`, never here — which is the
    // kit-global/per-town split doing exactly its job. With an endpoint
    // recorded the row becomes BUTTON-acquirable; without one it stays a
    // SOURCE the operator navigates by hand.
    acquisition: { kind: ACQUIRE.SOURCE, note: 'the county assessor — per-jurisdiction, US-shaped', wantsEndpoint: true },
    doc: 'cartograph/INTAKE.md',
  },
  {
    id: 'survey', domain: 'cartograph', tier: 'elective',
    label: 'Street survey',
    path: 'raw/survey.json',
    unlocks: 'true measured street widths — ROW, pavement half-width, lanes',
    absent: { kind: ABSENT.FALLBACK, note: 'OSM/AASHTO defaults (derive.js:707)' },
    // ⚠️ One of the seven inputs only LS has. NOT unrepeatable — an UNDOCUMENTED
    // PROCEDURE (`BRIEF §5.5`). The doc is owed; writing it is that row's
    // deliverable. Pointing at INTAKE.md until it exists.
    acquisition: { kind: ACQUIRE.OPERATOR, note: 'hand-measurement — procedure doc owed' },
    doc: 'cartograph/INTAKE.md',
  },
  {
    id: 'centerlines', domain: 'cartograph', tier: 'elective',
    label: 'Corrected centerlines',
    path: 'raw/centerlines.json',
    unlocks: 'hand-corrected street geometry where OSM digitization is wrong',
    absent: { kind: ABSENT.FALLBACK, note: 'derived from OSM' },
    acquisition: { kind: ACQUIRE.OPERATOR, note: 'seed-centerlines.js, then hand correction' },
    doc: 'cartograph/SKELETON.md',
  },
  {
    id: 'measurements', domain: 'cartograph', tier: 'elective',
    label: 'Measurements',
    path: 'raw/measurements.json',
    unlocks: 'per-scene hand measurements',
    absent: { kind: ABSENT.HONEST_ZERO, note: 'skipped (derive.js:2298)' },
    acquisition: { kind: ACQUIRE.OPERATOR, note: 'the Designer measure tool' },
    doc: 'cartograph/SURVEY.md',
  },
  {
    id: 'render-ledger', domain: 'cartograph', tier: 'elective',
    label: 'Render ledger',
    path: 'buildings.json',
    unlocks: 'the per-scene building render ledger',
    absent: { kind: ABSENT.FALLBACK, note: 'falls to clean/map.json' },
    acquisition: { kind: ACQUIRE.DERIVED, note: 'derive-ls-render-ledger.js' },
    doc: 'NEIGHBORHOOD-INPUTS.md',
  },
  {
    id: 'building-overrides', domain: 'cartograph', tier: 'elective',
    label: 'Building overrides',
    path: 'building-overrides.json',
    unlocks: 'per-building height and kind corrections, and the IN/OUT toggles',
    absent: { kind: ABSENT.HONEST_ZERO, note: 'no overrides applied' },
    acquisition: { kind: ACQUIRE.OPERATOR, note: 'the Extent "Edit buildings" toggle' },
    doc: 'NEIGHBORHOOD-INPUTS.md',
  },
  {
    id: 'tree-species-map', domain: 'cartograph', tier: 'elective',
    label: 'Species routing',
    path: 'tree-species-map.json',
    unlocks: 'census species collapsed onto this scene’s library palette',
    // ⛔ LS-BLEED #3 (`bake-trees.js:430`) — foreign species routed through a
    // St-Louis collapse table.
    absent: { kind: ABSENT.LS_BLEED, note: "bake-trees.js:430 reads LAFAYETTE SQUARE's map" },
    acquisition: { kind: ACQUIRE.DERIVED, note: 'scripts/15 from the census — collapse table hand-authored' },
    doc: 'TREE-INTAKE.md',
  },

  // The four census layers are spatially DISJOINT layers of one census,
  // unioned — not alternatives (`tree-bake-inputs.mjs:100`). All four absent →
  // `treeBakeInputsForScene` returns null, no trees, an honest zero.
  {
    id: 'census-city', domain: 'cartograph', tier: 'elective',
    label: 'City tree census',
    path: 'clean/park_trees.json',
    unlocks: 'real tree positions with measured species and DBH',
    absent: { kind: ABSENT.HONEST_ZERO, note: 'this census layer drops out' },
    acquisition: { kind: ACQUIRE.SOURCE, note: 'municipal forestry inventory — often a records request' },
    doc: 'TREE-INTAKE.md',
  },
  {
    id: 'census-forest-park', domain: 'cartograph', tier: 'elective',
    label: 'Forestry layer 4',
    path: 'clean/forest_park_trees.json',
    unlocks: 'a richer species prior where the layer reaches',
    absent: { kind: ABSENT.HONEST_ZERO, note: 'this census layer drops out' },
    acquisition: { kind: ACQUIRE.SOURCE, note: 'St. Louis FORESTRY_TREES/MapServer/4 — free, STL-shaped' },
    doc: 'TREE-INTAKE.md',
  },
  {
    id: 'census-osm', domain: 'cartograph', tier: 'elective',
    label: 'OSM trees',
    path: 'clean/osm_trees.json',
    unlocks: 'the real-tree floor where no municipal census reaches',
    absent: { kind: ABSENT.HONEST_ZERO, note: 'this census layer drops out' },
    // ⚠️ Overpass 406s the default python-requests/curl UA — send a real
    // User-Agent (`TREE-INTAKE.md §2`). Exactly the kind of gotcha the
    // one-button rule exists to swallow.
    acquisition: { kind: ACQUIRE.BUTTON, note: 'Overpass natural=tree — ODbL, real User-Agent required' },
    licence: OSM_ODBL,
    doc: 'TREE-INTAKE.md',
  },
  {
    id: 'census-derived', domain: 'cartograph', tier: 'elective',
    label: 'Canopy fill',
    path: 'clean/derived_trees.json',
    unlocks: 'synthetic tree fill in parks and yards no point census covers',
    // A legitimate opt-out, not a defect — LS itself ships real-only.
    absent: { kind: ABSENT.HONEST_ZERO, note: 'no synthetic fill — scenes may opt real-only' },
    acquisition: { kind: ACQUIRE.BUTTON, note: 'NLCD canopy (US) or ESA WorldCover — public domain / CC BY' },
    doc: 'TREE-INTAKE.md',
  },
  // ⭐ The row that answers "how tall are the buildings" — and the reason the
  // MEASURE kind exists. Verified 2026-07-20: Księży Młyn's own already-fetched
  // OSM carried 4,361 `building:levels` while every poured building extruded at
  // a flat 8 m default, because the map→baker adapter dropped `tags` on the
  // floor. The data was bought and thrown away (`INTAKE-CATALOGUE §5.2`).
  //
  // ⚠️ Its acquisition is genuinely REGIONAL, which is why it cannot be a
  // simple source row. European OSM is hand-mapped and often cadastre-derived,
  // so the fabric arrives free with the base fetch. US OSM is largely a legacy
  // TIGER import that carries almost none of it — Lafayette Square's storeys
  // and materials are HAND-AUTHORED in `src/data/buildings.json`, all 1,082.
  // Same row, two completely different acquisition paths (`§5.1`).
  {
    id: 'building-fabric', domain: 'cartograph', tier: 'elective',
    kind: KIND.MEASURE,
    label: 'Building detail',
    measure: measureBuildingFabric,
    // ⭐ THE OPERATOR-FACING FRAMING (Jacob, 2026-07-20): *"this would be 'does
    // your community have any augmented building scans?' or something."*
    //
    // Every other row on this panel is named for what the PIPELINE reads —
    // "render ledger", "species routing", "forestry layer 4". That is the wrong
    // voice for a surface whose test is *"could a capable assistant, handed
    // this panel and a town name, go and fetch these things"* (`BRIEF §7`). A
    // question about the town is answerable; a pipeline noun is not.
    question: 'Does this community have building data beyond plain outlines — storey counts, roof shapes, materials?',
    unlocks: 'real storey counts, roof shapes and wall materials — the district stops being uniform boxes',
    absent: { kind: ABSENT.FALLBACK, note: 'every building extrudes at a flat 8 m default' },
    acquisition: { kind: ACQUIRE.SOURCE, note: 'free in OSM where hand-mapped (EU); hand-authored where not (US)' },
    doc: 'INTAKE-CATALOGUE.md',
  },
  {
    id: 'park-polygon', domain: 'cartograph', tier: 'elective',
    label: 'Park polygon',
    path: 'clean/park-polygon.json',
    unlocks: 'the park clip and its water',
    absent: { kind: ABSENT.HONEST_ZERO, note: 'no park clip' },
    acquisition: { kind: ACQUIRE.OPERATOR, note: 'traced in the Designer' },
    doc: 'cartograph/INTAKE.md',
  },
]

/**
 * ⭐ OPERATOR-ADDED SOURCES, SHARED BY JURISDICTION.
 *
 * Jacob, 2026-07-20: a resource added for Łódź must be available to every other
 * hood in Łódź. So these do NOT live in the per-scene overlay — they live in
 * one repo-level store keyed by jurisdiction, because "where can you get a
 * Polish heritage register" is a fact about Poland, not about Księży Młyn.
 *
 * Kept as its own file rather than folded into a scene's `intake.json` for the
 * same reason the row definitions are kit-global: one home per fact. A source
 * copied into six scene files is six copies that drift.
 */
const SOURCES_STORE = join(REPO_ROOT, 'cartograph', 'intake-sources.json')

function readSourcesStore() {
  if (!existsSync(SOURCES_STORE)) return {}
  try { return JSON.parse(readFileSync(SOURCES_STORE, 'utf8')) } catch { return {} }
}

/**
 * Every operator-added source visible to this scene, by row id.
 *
 * ⭐ TWO TIERS, because the store ACCUMULATES (Jacob, 2026-07-20: *"perhaps all
 * of these append over time and just create awesome lists of these great public
 * resources"*). This is the compounding asset in the whole manifest — every
 * pour contributes, nothing is ever removed, and the directory of open civic
 * data gets better the more towns exist.
 *
 *  · `native`    — recorded in THIS jurisdiction. Directly usable.
 *  · `elsewhere` — recorded anywhere else, tagged with where.
 *
 * The second tier earns its place because civic data repeats in KIND even when
 * it does not repeat in URL. A Warsaw tree inventory is not Łódź's, but an
 * operator who learns Polish cities publish tree inventories at all has been
 * handed the important half of the answer. Suppressing that would make every
 * jurisdiction start from zero forever, which is the per-session
 * re-derivation this manifest exists to end.
 */
export function altSourcesForScene(scene) {
  const j = jurisdictionForScene(scene)
  const store = readSourcesStore()
  const out = {}
  for (const [key, rows] of Object.entries(store)) {
    const isNative = j && key === j.key
    for (const [rowId, list] of Object.entries(rows)) {
      const bucket = out[rowId] || (out[rowId] = [])
      for (const s of list) bucket.push(isNative ? { ...s } : { ...s, elsewhere: key })
    }
  }
  // Native first — a directly usable well outranks a transferable pattern.
  for (const list of Object.values(out)) list.sort((a, b) => (a.elsewhere ? 1 : 0) - (b.elsewhere ? 1 : 0))
  return out
}

/**
 * Record a source against this scene's JURISDICTION, so the next hood in the
 * same city inherits it. Returns the updated list for that row.
 */
export function addAltSource(scene, rowId, name, url = null) {
  const j = jurisdictionForScene(scene)
  if (!j) throw new Error(`no geography for scene '${scene}' — cannot place it in a jurisdiction`)
  const store = readSourcesStore()
  const forJur = store[j.key] || (store[j.key] = {})
  const list = forJur[rowId] || (forJur[rowId] = [])
  // Idempotent: re-adding the same well must not stack duplicates.
  if (!list.some(s => s.name.toLowerCase() === name.toLowerCase())) {
    list.push({
      name,
      // Only treat the name as a URL when the WHOLE string is one. An operator
      // typing "https://gis.example — the city GIS" means a labelled pointer,
      // not a fetchable address; storing the prose as the URL would hand the
      // archiver something it can never download.
      url: url || (/^https?:\/\/\S+$/i.test(name.trim()) ? name.trim() : null),
      addedFor: scene,
      operator: true,
      // ⭐ ARCHIVAL INTENT (Jacob, 2026-07-20: *"we try to download what we can
      // locally… to preserve the asset"*). A recorded URL is a POINTER, and
      // `BRIEF §4` is explicit that a pointer is not an input: every input is a
      // file on disk and a pour must survive the network being unplugged.
      // Public data also rots — portals are retired, layers are renamed, and
      // licences change under you. So the record tracks whether we actually
      // hold a copy, and `null` is an open work item rather than a detail.
      //
      // ⚠️ LICENCE-GATED, always. CC0 / ODbL / public-domain sources may be
      // kept permanently; marketplace assets may NOT be redistributed, which is
      // exactly why `botanica/` and `public/trees/` are gitignored and why a
      // fresh clone has zero chassis (`INTAKE-CATALOGUE §1.2 B1`). Never
      // archive without knowing which of those a source is.
      licence: null,
      archived: null,
      archivedAt: null,
    })
  }
  mkdirSync(dirname(SOURCES_STORE), { recursive: true })
  writeFileSync(SOURCES_STORE, JSON.stringify(store, null, 2))
  return list
}

/**
 * ⭐ A SAMPLE of what a good one looks like.
 *
 * Jacob, 2026-07-20: *"'See a sample json file here' maybe."* This answers
 * `BRIEF §2.2`'s own stated requirement — *"how to tell a good file from a bad
 * one"* — for the DATA rows. An operator told to go acquire
 * `raw/osm_street_lamps.json` has no way to check their work without an example
 * of a correct one, and Lafayette Square is the complete dataset, so every row
 * has a reference copy to point at (`INTAKE-CATALOGUE`: *"LS is the final-Boss
 * version"*).
 *
 * ⚠️ Falls back to LS ONLY as a documentation sample, and says so via `from`.
 * This is the one legitimate reading of another town's file in the whole kit —
 * it is shown to a human as an example, never fed to a bake. Do not let it
 * become an eighth LS-bleed site (`INTAKE-CATALOGUE §0`).
 *
 * ⛔ BOUNDED READ. Centrum's `raw/osm.json` is 121 MB; slurping it to show a
 * head would stall the panel and could exhaust memory. Read a fixed prefix off
 * a file handle and mark the truncation honestly.
 */
const SAMPLE_BYTES = 2400

export function sampleForRow(scene, rowId) {
  const row = INTAKE_ROWS.find(r => r.id === rowId)
  if (!row || !row.path) return null

  let from = scene
  let file = join(sceneDir(scene), row.path)
  if (!existsSync(file)) {
    // Not acquired here — show the reference copy instead, clearly labelled.
    from = 'lafayette-square'
    file = join(sceneDir('lafayette-square'), row.path)
    if (!existsSync(file)) return null
  }

  let fd
  try {
    const st = statSync(file)
    const buf = Buffer.alloc(Math.min(SAMPLE_BYTES, st.size))
    fd = openSync(file, 'r')
    readSync(fd, buf, 0, buf.length, 0)
    // Binary artifacts (elevation.tif) have no readable head — say so rather
    // than spraying control characters at the operator.
    const isText = row.path.endsWith('.json') || row.path.endsWith('.csv')
    return {
      row: rowId,
      path: row.path,
      from,
      bytes: st.size,
      truncated: st.size > buf.length,
      sample: isText ? buf.toString('utf8') : `(binary — ${row.path.split('.').pop()}, ${(st.size / 1048576).toFixed(1)} MB)`,
    }
  } catch {
    return null
  } finally {
    if (fd !== undefined) { try { closeSync(fd) } catch { /* already gone */ } }
  }
}

/**
 * The per-town overlay. Holds ONLY what is genuinely this scene's — provenance
 * stamps and `verified-absent` marks. Never row definitions, never status.
 * Absent file is the normal case: no town has recorded provenance yet.
 */
function readSceneOverlay(scene) {
  const p = join(sceneDir(scene), 'intake.json')
  if (!existsSync(p)) return {}
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'))
    return parsed?.rows || {}
  } catch {
    // A malformed overlay must not blank the panel — the rows are the point,
    // the provenance is the garnish. Degrade to "no provenance recorded".
    return {}
  }
}

/**
 * THREE states, not two (`BRIEF §2.2d`). `verified-absent` — searched, nothing
 * exists — is INFORMATION, and Łódź's documented `logo:null` entries are the
 * proof: without it the next operator re-spends the hours rediscovering that a
 * thing has no source.
 */
export const STATUS = {
  FILLED: 'filled',
  EMPTY: 'empty',
  VERIFIED_ABSENT: 'verified-absent',
}

/**
 * Compute every row's state for one scene, by looking at disk.
 *
 * @param {string} scene — the NEIGHBOURHOOD id (a scene dir under cartograph/data/).
 * @returns {{scene, rows: Array}} every row, always — filled or not. The panel
 *   is a complete collection checklist; the RENDER is what hides missing things
 *   (`BRIEF §5.5`). Those are opposite behaviours and must not be conflated.
 */
export function intakeStatusForScene(scene) {
  const dir = sceneDir(scene)
  const overlay = readSceneOverlay(scene)
  // Sources any operator recorded for this JURISDICTION — a well found while
  // pouring Centrum is a fact about Łódź and belongs to Księży Młyn too.
  const alt = altSourcesForScene(scene)
  const jurisdiction = jurisdictionForScene(scene)

  const rows = INTAKE_ROWS.map(row => {
    const own = overlay[row.id] || {}

    // MEASURE rows report COVERAGE, not presence. Partial coverage is the
    // normal, honest state — Łódź measures 689 of 1,640 — so it reads as
    // filled-with-a-number rather than as a failure. A row that is real but
    // partial must not look the same as one that is missing.
    if (row.kind === KIND.MEASURE) {
      const m = row.measure ? row.measure(scene) : null
      const status = !m || m.known === 0
        ? (own.verifiedAbsent ? STATUS.VERIFIED_ABSENT : STATUS.EMPTY)
        : STATUS.FILLED
      return {
        ...row,
        measure: undefined,          // the function itself must not serialise
        status,
        detail: m ? `${m.known} / ${m.total}` : null,
        coverage: m ? [m.known, m.total] : null,
        bytes: null,
        mtime: null,
        provenance: own.source || own.note || null,
        acquiredAt: own.acquired || null,
        endpoint: own.endpoint || null,
        altSources: alt[row.id] || [],
      }
    }

    const abs = join(dir, row.path)

    // A zero-byte file is not an acquired input. Treating it as filled is the
    // hardcoded-green lie in miniature.
    let present = false
    let bytes = null
    let mtime = null
    if (existsSync(abs)) {
      try {
        const st = statSync(abs)
        present = st.size > 0
        bytes = st.size
        mtime = st.mtimeMs
      } catch { /* raced or unreadable — treat as absent, honestly */ }
    }

    const status = present
      ? STATUS.FILLED
      : (own.verifiedAbsent ? STATUS.VERIFIED_ABSENT : STATUS.EMPTY)

    return {
      ...row,
      status,
      bytes,
      mtime,
      // Per-town provenance, surfaced but never merged into the definition.
      provenance: own.source || own.note || null,
      acquiredAt: own.acquired || null,
      // The per-jurisdiction endpoint (`INTAKE-CATALOGUE §4.2`). Per-town data,
      // so it lives in the overlay. Recorded → the row is one button away;
      // absent → the operator navigates the portal by hand.
      endpoint: own.endpoint || null,
      altSources: alt[row.id] || [],
    }
  })

  return { scene, jurisdiction, rows }
}
