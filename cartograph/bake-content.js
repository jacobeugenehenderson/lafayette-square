/**
 * bake-content.js — the CONTENT-JOIN pipeline step.
 *
 * Spatially joins the raw sources (OSM POIs · assessor parcels · NR survey)
 * onto the BAKED, post-Extent building set and writes the three content
 * layers, so **content membership == slab membership, by construction**:
 *
 *   cartograph/data/<scene>/content/roster.json    — Layer 1 (one per baked building)
 *   cartograph/data/<scene>/content/listings.json  — Layer 2 (business POIs, 0..N per building)
 *   cartograph/data/<scene>/content/profile.json    — Layer 0 (installation profile)
 *
 * The JOIN is the "best guess" (§0.0). Hand-authoring is the OVERRIDE that
 * wins and survives a re-run — it lives in committed sidecars the join never
 * clobbers:
 *
 *   content/listings.overrides.json  { adds:[…], patches:{ key: {…} } }
 *   content/roster.overrides.json    { patches:{ id: {…} } }
 *   content/menus.json · content/photos/<slug>/ · content/logos/  (already separate)
 *
 * roster.json / listings.json become DERIVED artifacts (like the slab): the
 * hand-authored SSOT is the override sidecars + profile.json. A re-run with no
 * input change is a no-op diff (idempotent).
 *
 * Join target = the BAKED building set (public/baked/<scene>/buildings.json).
 * A POI/parcel joins to a building iff that building is IN the baked set, so
 * every emitted building_id is guaranteed present in the slab (0 orphans).
 *
 * Scene-generic. TWO guards, because a re-bake here can DESTROY hand-authored
 * content rather than merely regenerate it:
 *   · LS — content is hand-curated + conflated into src/data/buildings.json;
 *     the step refuses LS unless --force.
 *   · EXTERNAL BASE — a scene whose listings base did NOT come from OSM POIs
 *     declares `meta.baseSource` in listings.overrides.json (Łódź: "overture").
 *     This step can only derive an OSM base, so for those scenes it writes
 *     roster/profile but PRESERVES listings.json. Without this, baking Łódź
 *     after an Extent edit took listings.json from 84 records to 5 (2026-07-20)
 *     — the OSM join yields ~0 there, so only the surviving adds got written.
 *     Declared in DATA, not by scene name, so the next non-OSM town is covered.
 *
 *   node cartograph/bake-content.js --scene hipointe-demun
 *   node cartograph/bake-content.js --scene hipointe-demun --dry-run   (stats, no write)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeIfChanged } from './io.js'
import { requireExplicitMap } from './scene.js'
import { readSources, undeclaredMessage, PARCEL_FIELDS } from './sources.js'
import { classifyZoning } from '../src/tokens/categories.js'
import { createVocabularyGate } from './osm-vocabulary.mjs'
import { rankRoster } from './prominence.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ──────────────────────────────────────────────────────────────────────────
// Geometry helpers (all inputs are already in the scene's local metric frame:
// buildings, parcels, and OSM coords all carry x/z — verified aligned).
// ──────────────────────────────────────────────────────────────────────────

function pointInPolygon(x, z, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1]
    const xj = ring[j][0], zj = ring[j][1]
    const intersect = ((zi > z) !== (zj > z)) &&
      (x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

function ringCentroid(pts) {
  let sx = 0, sz = 0, n = 0
  for (const p of pts) {
    const x = Array.isArray(p) ? p[0] : p.x
    const z = Array.isArray(p) ? p[1] : p.z
    sx += x; sz += z; n++
  }
  return n ? [sx / n, sz / n] : [0, 0]
}

const dist2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2

// Footprint area in m² (the frame is metric). Shoelace, sign-free.
function ringArea(pts) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length]
    a += x1 * z2 - x2 * z1
  }
  return Math.abs(a) / 2
}

// ──────────────────────────────────────────────────────────────────────────
// Loaders
// ──────────────────────────────────────────────────────────────────────────

function mapDir(scene) { return join(ROOT, 'cartograph', 'data', scene) }
function contentDir(scene) { return join(mapDir(scene), 'content') }

// The authoritative membership set + render fields: the baked slab index.
// `.buildings[].id` IS what shipped — every emitted id must be here. The id is
// source-agnostic: `msbf-*` on a US pour, `osm-*` on an OSM/foreign pour.
function loadBakedBuildings(scene) {
  const p = join(ROOT, 'public', 'baked', scene, 'buildings.json')
  if (!existsSync(p)) throw new Error(`no baked slab for scene "${scene}" (${p}) — bake-buildings must run first`)
  const j = JSON.parse(readFileSync(p, 'utf8'))
  const map = new Map()
  for (const b of (j.buildings || [])) {
    map.set(b.id, {
      id: b.id,
      wall_material: b.wallMaterial ?? null,
      roof_material: b.roofMaterial ?? null,
      baseY: b.baseY ?? null,
      centroidY: b.centroidY ?? null,
      stories: b.stories ?? null,
      zoning: b.zoning ?? null,
    })
  }
  return map
}

// Building geometry (rings → centroid), keyed to the baked id. clean/map.json
// is the post-membership-filter set the bake consumed; intersect with the
// baked id set so geometry and membership can never disagree.
function loadBuildingGeom(scene, bakedIds) {
  const p = join(mapDir(scene), 'clean', 'map.json')
  if (!existsSync(p)) throw new Error(`no clean/map.json for scene "${scene}"`)
  const map = JSON.parse(readFileSync(p, 'utf8'))
  const out = new Map()
  for (const b of (map.buildings || [])) {
    // Source-agnostic building id — MUST mirror `bake-buildings.js` exactly:
    // MSBF where present (US pours), else OSM (foreign/OSM pours). This side
    // was left MSBF-only when the producer was made source-agnostic, so every
    // OSM pour joined ZERO geometry: Księży Młyn shipped 1,640 roster records
    // with 0 addresses, 0 zoning and 0 parcel matches, which emptied the
    // property atlas (`useListings` filters bare buildings on `address`) and
    // left roster/listings mutually incoherent (roster said 5, listings 84).
    //
    // ⭐ THE THIRD SOURCE. `bake-buildings.js` has TWO producers — the map.json
    // adapter (`adaptMapBuildings`, msbf-*/osm-*) and the curated-project default
    // that reads `src/data/buildings.json` and keeps its own `bldg-*` ids. This
    // loader knew only the adapter's two, so the curated pour joined ZERO geometry
    // and bake-content could not read it at all — which is why the ONE town with
    // hand-curated ground truth was the one town outside the harness. The id is
    // still whatever the baker stamped; we are reading the third stamp, not minting
    // a fourth. (`clean/map.json` carries it as `projectId`.)
    const id = b.msbfId != null ? `msbf-${b.msbfId}`
      : (b.osmId != null ? `osm-${b.osmId}`
      : (b.projectId != null ? b.projectId : null))
    if (!id) continue
    if (!bakedIds.has(id)) continue
    const ring = (b.ring || []).map(p => [Array.isArray(p) ? p[0] : p.x, Array.isArray(p) ? p[1] : p.z])
    if (ring.length < 3) continue
    const [cx, cz] = ringCentroid(ring)
    out.set(id, { id, ring, cx, cz })
  }
  return out
}

// Assessor parcels — every declared well, merged. All are pre-projected to the local
// frame (centroid:[x,z], rings:[[[x,z]]]); `jurisdiction` distinguishes them.
//
// ⛔⛔ THE FILENAMES USED TO BE ST. LOUIS'S, RIGHT HERE:
//     for (const [file, jur] of [['stl_parcels.json','city'], ['stlco_parcels.json','county']])
// so every town that was not St. Louis printed "missing stl_parcels.json" and matched
// 0 parcels — `INTAKE-CATALOGUE §0`'s LS-bleed, in the acquisition path, and `§4.2`'s
// *"needs a per-town endpoint field"* left unbuilt since 2026-07-20. The town now
// DECLARES its wells (`cartograph/sources.js`) and this reads the declaration.
//
// ⭐ Returns `{ parcels, absentByField }`. The second is the whole reason the
// declaration exists: a field no declared well provides is a field the roster must
// emit as null rather than as zero/false. `§3.2`'s correction — what an assessor
// UNIQUELY gives is valuation · zoning · year_built · units — is only actionable if a
// town can say which of those its well does not have.
function loadParcels(scene) {
  const src = readSources(scene)
  if (!src.declared) {
    // ⛔ LOUD, and not a `console.warn` buried between two other lines. An undeclared
    // town is not a town without an assessor; it is a town nobody has looked into, and
    // the two must never print the same.
    console.warn('\n' + undeclaredMessage(scene, src.path) + '\n')
    return { parcels: [], absentByField: null, declared: false }
  }
  if (!src.parcels.length) {
    console.log(`  [parcels] DECLARED-NONE — ${src.absentReason}`)
    return { parcels: [], absentByField: new Set(PARCEL_FIELDS), declared: true }
  }

  const out = []
  // A field is absent for this SCENE only if EVERY declared well lacks it — two wells
  // can complement each other (LS's city + county pair is exactly that).
  const absentByField = new Set(PARCEL_FIELDS)
  for (const decl of src.parcels) {
    for (const f of (decl.provides || [])) absentByField.delete(f)
    for (const f of Object.keys(decl.constants || {})) absentByField.delete(f)
    const p = join(mapDir(scene), 'raw', decl.file)
    if (!existsSync(p)) {
      // ⛔ A DECLARED WELL WITH NO FILE IS AN ERROR, not a skip. The town said this
      // exists; the pour must not quietly continue as though it had said nothing.
      throw new Error(`[parcels] scene "${scene}" declares source "${decl.id}" → raw/${decl.file}, which is not there.\n` +
        `  Acquire it: CARTOGRAPH_SCENE=${scene} node cartograph/fetch-parcels.mjs`)
    }
    const j = JSON.parse(readFileSync(p, 'utf8'))
    let n = 0
    for (const par of (j.parcels || [])) {
      if (!par.centroid) continue
      n++
      out.push({
        handle: par.handle,
        address: par.address ? par.address.replace(/\s+/g, ' ').trim() : null,
        year_built: par.year_built || null,
        building_sqft: par.building_sqft || null,
        appraised_value: par.appraised_value || null,
        land_use_code: par.land_use_code != null ? String(par.land_use_code).trim() : null,
        land_use_code_format: decl.land_use_code_format || null,
        // ⛔ Undeclared means UNREADABLE, never "assume St. Louis". A zoning letter is
        // only an STL district if the town says its assessor speaks that alphabet.
        zoning_code_format: decl.zoning_code_format || null,
        zoning: par.zoning ? par.zoning.trim() : null,
        units: par.units ?? null,
        num_buildings: par.num_buildings ?? null,
        // ⛔ `!!par.vacant` asserted "not vacant" about every parcel from a well that
        // does not carry the flag. Undefined stays null; only a real false is false.
        vacant: par.vacant == null ? null : !!par.vacant,
        historic_district: par.historic_district || null,
        // ⭐ A declared constant fills a column the rows do not carry — never a literal
        // city name in this file. (`jur === 'city' ? 'St. Louis' : null` lived here.)
        municipality: par.municipality || (decl.constants || {}).municipality || null,
        jurisdiction: par.jurisdiction || decl.jurisdiction,
        cx: par.centroid[0], cz: par.centroid[1],
        rings: par.rings || [],
      })
    }
    console.log(`  [parcels] ${decl.id} (${decl.jurisdiction}): ${n} from raw/${decl.file}`)
  }
  if (absentByField.size) console.log(`  [parcels] NO declared well provides: ${[...absentByField].join(', ')} — these stay null, never zero`)
  return { parcels: out, absentByField, declared: true }
}

// County land-use code table: CODE,LAND_USE_DESCRIPTION,LUCODE,OBJECTID
// The assessor's code→description table. ⛔ The FILENAME was hardcoded to St. Louis
// County's, so every other town printed "county-land-use-codes.csv missing" forever.
// It is declared now, and `landUseCodes: null` is a POSITIVE declaration — "this well's
// codes are self-describing, there is no table to acquire" — which is a different state
// from "nobody has said" and prints differently (`cartograph/sources.js`).
function loadLandUseCodes(scene) {
  const map = new Map()
  const src = readSources(scene)
  if (!src.declared) return map          // already shouted about by loadParcels
  if (src.landUseCodes === null) { console.log('  [landuse] declared self-describing — no decode table needed'); return map }
  if (src.landUseCodes === undefined) {
    console.warn(`  ⛔ [landuse] scene "${scene}" declares parcel wells but says nothing about \`landUseCodes\`.`)
    console.warn(`     Add \`"landUseCodes": { "file": "<name>.csv" }\` or \`"landUseCodes": null\` (self-describing).`)
    return map
  }
  const p = join(contentDir(scene), src.landUseCodes.file)
  if (!existsSync(p)) { throw new Error(`[landuse] scene "${scene}" declares ${src.landUseCodes.file}, which is not in content/.`) }
  const lines = readFileSync(p, 'utf8').replace(/^﻿/, '').split(/\r?\n/)
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i])
    if (row.length < 3 || !row[0]) continue
    map.set(String(row[0]).trim(), { desc: row[1], bucket: row[2] })
  }
  return map
}

function parseCsvLine(line) {
  const out = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

function loadNrInventory(scene) {
  const p = join(contentDir(scene), 'nr-inventory.json')
  if (!existsSync(p)) return []
  return JSON.parse(readFileSync(p, 'utf8'))
}

// Named OSM POIs from raw/osm.json. THREE producers, one consumer:
//   .ground.<class>[]  ways + relation rings  { osmId, tags, isClosed, coords:[…] }
//   .pois[]            TAGGED NODES          { osmId, osmType:'node', category, tags, coords:[one] }
//   .buildings[]       named footprints
// We keep name-bearing features and compute an x/z anchor from their coords.
//
// ⭐ The one-coordinate case was ALREADY handled here (`coords.length > 2 ? centroid :
// coords[0]`) years before anything could produce one — intake was the broken half, and
// `fetch.js` threw every node's tags away at ingest. Reading `.pois` is the whole of the
// consumer-side change; nothing about the anchor or the dedupe had to move.
function loadOsmPois(scene) {
  const p = join(mapDir(scene), 'raw', 'osm.json')
  if (!existsSync(p)) throw new Error(`no raw/osm.json for scene "${scene}"`)
  const j = JSON.parse(readFileSync(p, 'utf8'))
  const out = []
  const seen = new Set()
  const consume = (f) => {
    const tags = f.tags || {}
    const name = tags.name
    if (!name) return
    const coords = (f.coords || []).map(c => [c.x, c.z]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))
    if (!coords.length) return
    const [cx, cz] = coords.length > 2 ? ringCentroid(coords) : coords[0]
    const key = `${f.osmId}|${name}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ osmId: f.osmId, name, tags, cx, cz, ring: coords.length > 2 ? coords : null })
  }
  // ⛔⛔ AN ABSENT `pois` ARRAY IS A FETCH VINTAGE, NOT A TOWN WITHOUT POINT FEATURES,
  // and the two are indistinguishable downstream unless somebody says so HERE.
  // `fetch.js` threw every tagged NODE's tags away at ingest until brief A landed
  // (2026-09-20). A town fetched before that carries `ground` + `buildings` and NO
  // `pois` key at all — so every business mapped as a node is invisible, the listings
  // base is thin, and the prominence rank is computed on a well with a hole in it.
  // ⭐ It looks EXACTLY like a quiet town. Reported, never inferred.
  const nodeTagsPresent = Array.isArray(j.pois)

  const ground = j.ground || {}
  for (const cls of Object.keys(ground)) if (Array.isArray(ground[cls])) for (const f of ground[cls]) consume(f)
  // ⭐ Point features. `consume` keys its dedupe on `osmId|name`, and an OSM node and an
  // OSM way can share an id — different namespaces, same integer — so a node POI and a
  // way POI with the same id and name would collapse into one. Namespaced here rather
  // than in `consume`, because a WAY's key must not change: it is the existing towns'.
  if (Array.isArray(j.pois)) for (const f of j.pois) consume({ ...f, osmId: `n${f.osmId}` })
  // Named building footprints carry the campus halls / dorms / apartments /
  // churches the ground POIs miss — the bulk of the named directory.
  if (Array.isArray(j.buildings)) for (const f of j.buildings) consume(f)
  return { pois: out, nodeTagsPresent }
}

// ──────────────────────────────────────────────────────────────────────────
// Classifiers — reuse the existing Society Pages taxonomy vocabulary
// (src/tokens/categories.js top-level categories + the subcategories the
// installation's content already uses). NOT a new taxonomy.
// ──────────────────────────────────────────────────────────────────────────

// OSM primary tag → { category, subcategory }. null → not a listing.
function classifyPoi(tags) {
  const a = tags.amenity, shop = tags.shop, leisure = tags.leisure
  const tourism = tags.tourism, office = tags.office
  // Dining
  if (a === 'restaurant') return ['dining', 'restaurants']
  if (a === 'fast_food' || a === 'food_court') return ['dining', 'restaurants']
  if (a === 'cafe' || a === 'coffee') return ['dining', 'cafes']
  if (a === 'bar' || a === 'pub' || a === 'biergarten' || a === 'wine_bar') return ['dining', 'bars']
  if (a === 'ice_cream' || shop === 'confectionery' || shop === 'pastry') return ['dining', 'desserts']
  // Community / institutional
  if (a === 'place_of_worship') return ['community', 'churches']
  if (a === 'school' || a === 'kindergarten') return ['community', 'schools']
  if (a === 'university' || a === 'college') return ['community', 'university']
  if (a === 'library') return ['community', 'library']
  if (a === 'community_centre' || a === 'events_venue' || a === 'conference_centre') return ['community', 'events-venue']
  if (a === 'townhall' || a === 'social_facility' || a === 'social_centre' || office === 'ngo' || office === 'association') return ['community', 'organizations']
  // Arts
  if (a === 'cinema') return ['arts', 'cinema']
  if (a === 'theatre' || a === 'arts_centre') return ['arts', 'venues']
  if (tourism === 'museum' || tourism === 'gallery') return ['arts', tourism === 'museum' ? 'museum' : 'galleries']
  if (a === 'studio') return ['arts', 'studios']
  // Hospitality
  if (tourism === 'hotel' || tourism === 'motel') return ['hospitality', 'hotels']
  if (tourism === 'guest_house' || tourism === 'bed_and_breakfast') return ['hospitality', 'bed-and-breakfast']
  // Services
  if (a === 'bank' || a === 'bureau_de_change' || office === 'financial' || office === 'accountant') return ['services', 'financial']
  if (a === 'pharmacy') return ['shopping', 'pharmacy']
  if (a === 'hospital' || a === 'clinic' || a === 'doctors' || a === 'dentist' || a === 'nursing_home' || office === 'physician') return ['services', 'health']
  if (a === 'fuel' || a === 'car_wash' || a === 'car_repair' || shop === 'car_repair' || shop === 'car') return ['services', 'automotive']
  if (leisure === 'fitness_centre' || a === 'gym' || leisure === 'sports_centre') return ['services', 'fitness']
  if (a === 'parking' || a === 'parking_entrance') return ['services', 'parking']
  if (shop === 'hairdresser' || shop === 'beauty' || shop === 'nail' || a === 'spa') return ['services', 'beauty']
  if (a === 'dry_cleaning' || shop === 'dry_cleaning' || shop === 'laundry') return ['services', 'cleaners']
  // Shopping
  if (shop === 'supermarket' || shop === 'grocery' || shop === 'convenience' || shop === 'greengrocer') return ['shopping', 'grocery']
  if (shop === 'chemist') return ['shopping', 'pharmacy']
  if (shop) return ['shopping', 'retail']
  // Parks / recreation
  if (leisure === 'park') return ['parks', 'parks']
  if (leisure === 'garden') return ['parks', 'gardens']
  if (leisure === 'pitch' || leisure === 'playground' || leisure === 'track' || leisure === 'sports_hall' || leisure === 'recreation_ground') return ['parks', 'recreation']
  if (leisure === 'pavilion' || a === 'shelter') return ['parks', 'pavilions']
  // Named building footprints (campus halls, dorms, apartments, churches) —
  // last, so an amenity/shop/leisure tag on the same feature wins.
  const bld = tags.building
  if (bld === 'university' || bld === 'college' || bld === 'dormitory') return ['community', 'university']
  if (bld === 'school') return ['community', 'schools']
  if (bld === 'church' || bld === 'chapel' || bld === 'cathedral' || bld === 'religious') return ['community', 'churches']
  if (bld === 'hospital') return ['services', 'health']
  if (bld === 'apartments') return ['residential', 'apartments']
  if (bld === 'house' || bld === 'detached' || bld === 'residential') return ['residential', 'houses']
  if (bld === 'commercial' || bld === 'office') return ['commercial', 'storefronts']
  if (bld === 'retail') return ['shopping', 'retail']
  if (bld === 'civic' || bld === 'public' || bld === 'government') return ['community', 'organizations']
  if (bld === 'parking') return ['services', 'parking']
  return null
}

// County/city land-use code → structural use. County codes are 3-digit
// strings decoded via the CSV bucket; the code prefix also carries structure.
//
// ⚠️ SHARED FACT, TWO CONSUMERS — the sibling is `cartograph/parcel-landuse.mjs`,
// which reads the same assessor codes for the GROUND's land-use class (the paint
// derive.js emits). They stay separate deliberately: this one is per-BUILDING and
// produces a structural `use` + `use_subtype` + `use_confidence` that OSM listing
// tags then refine (`refineUseFromListing`); that one is per-FACE and produces a
// paint class with no catch-all. The code→bucket meaning is what they share, and
// it is homed in parcel-landuse.mjs — change a bucket's meaning there and check
// this site (`docs/agents/BOZ.md §3`, one home per fact).
function classifyUse(parcel, luMap) {
  const code = parcel && parcel.land_use_code
  if (!code) return { use: 'unknown', use_subtype: null, use_confidence: 'low' }

  // ⛔⛔ THE NUMERIC RANGES BELOW ARE ST. LOUIS CITY/COUNTY ASSESSOR CODES, and until
  // now they were applied to whatever digits any town's code happened to contain. That
  // is not a missing feature, it is a CONFIDENTLY WRONG answer — `CLAUDE.md` Layer 0 q2
  // in its worst form, because it is louder than silence and reads as a result.
  //
  // ⭐ Worked instance, on the town this was found on: Ohio's statewide LUC arrives as
  // `"500: Res-Vacant Land"`. Stripped to digits that is 500, which lands in
  // `n >= 400 && n < 700` → **commercial, confidence HIGH** — a residential vacant lot
  // reported as a confident commercial building. 0% parcel match was better than that.
  //
  // ⇒ A town DECLARES what shape its codes are (`land_use_code_format` in sources.json):
  //     'stl-assessor-numeric' — the St. Louis city/county ranges + the decode CSV
  //     'self-describing'      — the code carries its own meaning ("500: Res-Vacant Land")
  //   and an UNDECLARED format gets `unknown`, never a guess. Naming the St. Louis
  //   taxonomy after St. Louis is the point: a town adopting it is asserting its codes
  //   mean what St. Louis's mean, which is a claim someone has to actually make.
  const fmt = parcel.land_use_code_format
  if (fmt === 'self-describing') {
    // ⭐ Text, not ranges. The word after the code is English land-use vocabulary and is
    // the same vocabulary the `bucket` fallback at the end of this function already
    // matches — so this reuses that classifier rather than adding a second one, and it
    // is not keyed to any state.
    return classifyUseFromText(String(code))
  }
  if (fmt !== 'stl-assessor-numeric') {
    return { use: 'unknown', use_subtype: null, use_confidence: 'low' }
  }

  const c = String(code).replace(/\D/g, '')
  const n = parseInt(c, 10)
  // County 3-digit residential codes
  if (c === '110' || (n >= 1100 && n < 1120)) return { use: 'residential', use_subtype: 'single_family', use_confidence: 'high' }
  if (c === '114' || (n >= 1140 && n < 1150)) return { use: 'residential', use_subtype: 'duplex', use_confidence: 'high' }
  if (['115', '119', '121', '122', '123', '124', '125', '130', '140'].includes(c) ||
      (n >= 1150 && n < 1500)) return { use: 'residential', use_subtype: 'multi_family', use_confidence: 'high' }
  if (c === '190' || (n >= 1900 && n < 2000) || parcel.vacant) return { use: 'vacant', use_subtype: null, use_confidence: 'high' }
  // Industrial 2xx / city 2xxx-3xxx manufacturing
  if ((n >= 200 && n < 400) || (n >= 2000 && n < 4000)) return { use: 'industrial', use_subtype: null, use_confidence: 'medium' }
  // Commercial 4xx-5xx / city 4xxx-5xxx
  if ((n >= 400 && n < 700) || (n >= 4000 && n < 7000)) return { use: 'commercial', use_subtype: null, use_confidence: 'high' }
  // Exempt / institutional 9xx / city 9xxx
  if ((n >= 900) ) return { use: 'institutional', use_subtype: null, use_confidence: 'medium' }
  // fall back to the decode table's bucket text
  return classifyUseFromText((luMap.get(c) || {}).bucket || '')
}

// Land-use vocabulary → structural use, from ENGLISH TEXT rather than a code range.
// ⭐ Shared by two callers on purpose: the decode table's `bucket` column (St. Louis)
// and a self-describing code (Ohio's `500: Res-Vacant Land`). One classifier, so a town
// whose codes explain themselves needs no per-state parser and no acquisition step.
// ⛔ VACANT IS TESTED FIRST. "Res-Vacant Land" contains both words, and a vacant lot
// reported as a house is the same confident-wrong failure the ranges above produced.
function classifyUseFromText(text) {
  const t = String(text || '')
  if (!t.trim()) return { use: 'unknown', use_subtype: null, use_confidence: 'low' }
  if (/vacant/i.test(t)) return { use: 'vacant', use_subtype: null, use_confidence: 'medium' }
  if (/industrial|utility|warehouse|manufactur/i.test(t)) return { use: 'industrial', use_subtype: null, use_confidence: 'medium' }
  if (/exempt|exm|church|school|municipal|government|public|cemetery|hospital/i.test(t)) return { use: 'institutional', use_subtype: null, use_confidence: 'medium' }
  if (/commercial|retail|office|com-/i.test(t)) return { use: 'commercial', use_subtype: null, use_confidence: 'medium' }
  if (/single|1-family|one family/i.test(t)) return { use: 'residential', use_subtype: 'single_family', use_confidence: 'medium' }
  if (/multi|duplex|apartment|two family|2-family/i.test(t)) return { use: 'residential', use_subtype: 'multi_family', use_confidence: 'medium' }
  if (/^\s*res\b|residential|dwelling|farm|agricultur/i.test(t)) return { use: 'residential', use_subtype: null, use_confidence: 'low' }
  return { use: 'unknown', use_subtype: null, use_confidence: 'low' }
}

// Refine the parcel-code use with the building's hosted OSM listing — the
// original join "refined by OSM tags for named institutions and by spatial
// context." A named campus hall / church / school reads institutional even
// when its parcel land-use code is a coarse exempt bucket.
function refineUseFromListing(use, primary) {
  if (!primary) return use
  const c = primary.category, s = primary.subcategory
  if (c === 'community') {
    if (s === 'university') return { use: 'institutional', use_subtype: 'campus', use_confidence: 'high' }
    if (s === 'schools') return { use: 'institutional', use_subtype: 'school', use_confidence: 'high' }
    if (s === 'churches') return { use: 'institutional', use_subtype: 'church', use_confidence: 'high' }
    return { use: 'institutional', use_subtype: 'civic', use_confidence: 'high' }
  }
  if (c === 'arts') return { use: 'institutional', use_subtype: 'cultural', use_confidence: 'high' }
  if (c === 'services' && s === 'health') return { use: 'institutional', use_subtype: 'medical', use_confidence: 'high' }
  if (c === 'residential' && use.use === 'unknown')
    return { use: 'residential', use_subtype: s === 'apartments' ? 'multi_family' : 'single_family', use_confidence: 'medium' }
  // commercial-ish listing on a non-residential building → commercial (a
  // residential building hosting a shop stays residential + mixed_use)
  if (['dining', 'shopping', 'hospitality', 'services'].includes(c) && use.use !== 'residential')
    return { use: 'commercial', use_subtype: null, use_confidence: 'high' }
  return use
}

// Roster category/subcategory — the bare-building default from the assessor zoning
// letter, overridden by a hosted listing.
//
// ⛔⛔ THE LOCAL COPIES OF `ZONING_CAT`/`ZONING_SUB` ARE GONE. They lived here, in
// `useListings.js`, in `PlaceCard.jsx`, in `SceneNeon.jsx` and (dead) in
// `categories.js` — five copies, no two agreeing — and the comment above them claimed
// to MIRROR `useListings`, which it did not: they split on five keys. A comment
// asserting a parity that does not hold is worse than no comment, because it is the
// thing a reader checks instead of the code. One home now: `src/tokens/categories.js`.
// ⭐ Checked against St. Louis Title 26 in the process, and the majority was wrong —
// see that file's header. `D` is residential; `H` is commercial.
function rosterCategoryFromZoning(zoning, zoningFormat, use, use_subtype) {
  const hit = classifyZoning(zoning, zoningFormat)
  if (hit && hit.category) return { category: hit.category, subcategory: hit.subcategory }
  // A county parcel carrying zoning "Municipal", or a town whose zoning vocabulary we
  // cannot read, falls through to the parcel's structural USE — which is derived from
  // the land-use code and is not St-Louis-shaped.
  if (use === 'residential') return { category: 'residential', subcategory: use_subtype === 'single_family' ? 'houses' : use_subtype === 'multi_family' ? 'lofts' : 'houses' }
  if (use === 'commercial') return { category: 'commercial', subcategory: 'storefronts' }
  if (use === 'industrial') return { category: 'industrial', subcategory: 'warehouses' }
  if (use === 'institutional') return { category: 'community', subcategory: 'organizations' }
  if (use === 'vacant') return { category: 'residential', subcategory: 'unnamed' }
  // ⛔⛔ AND HERE IS WHERE `|| 'residential'` USED TO BE. Zoning unreadable AND use
  // unknown means we know nothing about this building, and the roster must say so.
  // `category: null` is the honest answer; `'residential'` was a confident wrong one,
  // and on a town with no STL zoning letter it was every building in the town.
  return { category: null, subcategory: null }
}

// ──────────────────────────────────────────────────────────────────────────
// Address normalization + NR join
// ──────────────────────────────────────────────────────────────────────────

const STREET_ABBR = { AVE: 'AVENUE', AV: 'AVENUE', BLVD: 'BOULEVARD', ST: 'STREET', RD: 'ROAD', DR: 'DRIVE', LN: 'LANE', PL: 'PLACE', CT: 'COURT', TER: 'TERRACE', PKWY: 'PARKWAY', BND: 'BEND' }
function normAddress(addr) {
  if (!addr) return null
  let s = addr.toUpperCase().replace(/\s+/g, ' ').trim()
  // strip duplicated house number ("7222 7222 WISE AVE")
  s = s.replace(/^(\d+)\s+\1\b/, '$1')
  // unit suffixes
  s = s.replace(/\b(APT|UNIT|STE|SUITE|#)\s*\S+$/i, '').trim()
  const parts = s.split(' ')
  return parts.map(w => STREET_ABBR[w] || w).join(' ')
}
function addrHouseStreet(addr) {
  const n = normAddress(addr)
  if (!n) return null
  const m = n.match(/^(\d+)\s+(.*)$/)
  return m ? { house: m[1], street: m[2] } : null
}

function buildNrIndex(nr) {
  const idx = new Map()
  for (const r of nr) {
    if (!r.housenum || !r.street) continue
    const street = r.street.toUpperCase().replace(/\s+/g, ' ').trim().split(' ').map(w => STREET_ABBR[w] || w).join(' ')
    idx.set(`${String(r.housenum).trim()}|${street}`, r)
  }
  return idx
}

// ──────────────────────────────────────────────────────────────────────────
// Historic-district membership (LS `architecture.district` convention).
// Proximity to designated signals: assessor national flag + NR joins + the
// DeMun nomination streets; Richmond Heights (county south of Clayton) excluded.
// ──────────────────────────────────────────────────────────────────────────

const DISTRICT_STREETS = ['ALAMO', 'SAN BONITA', 'SOUTHWOOD', 'NORTHWOOD', 'ROSEBURY', 'DE MUN', 'DEMUN']
function inDistrictStreet(street) {
  const s = (street || '').toUpperCase()
  return DISTRICT_STREETS.some(d => s.includes(d))
}

// ──────────────────────────────────────────────────────────────────────────
// Overrides
// ──────────────────────────────────────────────────────────────────────────

function loadJsonOr(p, fallback) {
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback
}

// ──────────────────────────────────────────────────────────────────────────
// Spatial grid — bucket points into 50 m cells for candidate prefiltering.
// ──────────────────────────────────────────────────────────────────────────

const CELL = 50
function buildGrid(items) {
  const g = new Map()
  for (const it of items) {
    const key = `${Math.floor(it.cx / CELL)},${Math.floor(it.cz / CELL)}`
    let arr = g.get(key); if (!arr) { arr = []; g.set(key, arr) }
    arr.push(it)
  }
  return g
}
function gridNear(grid, x, z, radiusCells = 1) {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL)
  const out = []
  for (let dx = -radiusCells; dx <= radiusCells; dx++)
    for (let dz = -radiusCells; dz <= radiusCells; dz++) {
      const arr = grid.get(`${cx + dx},${cz + dz}`)
      if (arr) out.push(...arr)
    }
  return out
}

// building centroid → parcel (containment, else nearest ≤ maxD m)
function joinParcelToBuilding(b, parcelGrid, maxD = 45) {
  const cands = gridNear(parcelGrid, b.cx, b.cz, 1)
  // containment first
  for (const par of cands)
    for (const ring of par.rings)
      if (pointInPolygon(b.cx, b.cz, ring)) return par
  // else nearest centroid
  let best = null, bestD = maxD * maxD
  for (const par of cands) {
    const d = dist2(b.cx, b.cz, par.cx, par.cz)
    if (d < bestD) { bestD = d; best = par }
  }
  return best
}

// POI anchor → baked building (containment, else nearest ≤ maxD m)
function joinPointToBuilding(x, z, buildingGrid, maxD = 25) {
  const cands = gridNear(buildingGrid, x, z, 1)
  for (const b of cands)
    if (pointInPolygon(x, z, b.ring)) return b.id
  let best = null, bestD = maxD * maxD
  for (const b of cands) {
    const d = dist2(x, z, b.cx, b.cz)
    if (d < bestD) { bestD = d; best = b.id }
  }
  return best
}

// ──────────────────────────────────────────────────────────────────────────
// PROMINENCE — the cheap OSM signal well, gathered per building.
//
// ⭐ WIDER THAN THE LISTINGS JOIN, DELIBERATELY. `buildBaseListings` keeps only
// what `classifyPoi` recognises as a business; prominence keeps EVERY named
// feature, because a church tagged `historic`+`wikidata` and nothing else is not
// a listing and is obviously one of the most prominent buildings in a town.
// Same `pois` array, same `joinPointToBuilding` — one join implementation, two
// readings of it (`feedback_no_parallel_pipeline_for_scenes`).
//
// ⛔ A FEATURE LARGER THAN THE BUILDING IS NOT HOSTED BY IT. A park or a campus
// ring has a centroid, and that centroid lands on whatever building happens to sit
// in the middle — which would credit the park's `wikidata` to a random house and
// rank it first in the town. That is the confident-wrong class, so containment is
// not enough: the host must be at least as big as its guest.
function gatherOsmProminence(pois, buildingGrid, buildingGeom) {
  const out = new Map()   // building id → { tags, poi_count }
  let oversized = 0
  for (const poi of pois) {
    const id = joinPointToBuilding(poi.cx, poi.cz, buildingGrid, 25)
    if (!id) continue
    if (poi.ring) {
      const g = buildingGeom.get(id)
      if (g && ringArea(poi.ring) > ringArea(g.ring) * 1.2) { oversized++; continue }
    }
    let e = out.get(id)
    if (!e) { e = { tags: {}, poi_count: 0 }; out.set(id, e) }
    e.poi_count++
    // Union of tags across everything the building hosts. First writer wins so
    // the result does not depend on iteration order.
    for (const [k, v] of Object.entries(poi.tags || {})) if (!(k in e.tags)) e.tags[k] = v
  }
  return { byBuilding: out, oversized }
}

// ──────────────────────────────────────────────────────────────────────────
// Layer 2 — base listings from OSM POIs
// ──────────────────────────────────────────────────────────────────────────

function buildBaseListings(pois, buildingGrid, luByBuilding) {
  const out = []
  let skipped = 0
  for (const poi of pois) {
    const cls = classifyPoi(poi.tags)
    if (!cls) { continue }
    const building_id = joinPointToBuilding(poi.cx, poi.cz, buildingGrid, 25)
    if (!building_id) { skipped++; continue } // POI not on any baked building → outside slab
    const [category, subcategory] = cls
    const t = poi.tags
    out.push({
      _key: `osm-${poi.osmId}`,
      id: null, // assigned after merge
      building_id,
      name: poi.name,
      category, subcategory,
      address: t['addr:housenumber'] && t['addr:street'] ? `${t['addr:housenumber']} ${t['addr:street']}` : null,
      phone: t.phone || t['contact:phone'] || null,
      website: t.website || t['contact:website'] || null,
      logo: null,
      hours: null,
      opening_hours_raw: t.opening_hours || null,
      photos: [],
      amenities: [],
      tags: [],
      description: null,
      history: null,
      menu_url: null,
      reservation_url: null,
      status: 'unverified',
      source: 'osm',
      osm_type: t.amenity || t.shop || t.leisure || t.tourism || t.office || null,
    })
  }
  return { listings: out, skipped }
}

// ──────────────────────────────────────────────────────────────────────────
// Layer 2 — base listings from an EXTERNAL base: Overture Places
//
// ⭐ THE SECOND PRODUCER. This is the open work the guard below used to name and
// have nowhere to send you: the guard was generic (it reads `meta.baseSource`
// out of the DATA) but its remedy never was, so a town with a non-OSM base was
// protected from the destructive re-bake and then stranded.
//
// ⛔ IT IS A PRODUCER, NOT A PIPELINE. It emits the SAME record shape as
// `buildBaseListings` and hands it to the SAME `applyListingOverrides`, so
// anchor re-resolution, `add_dropped`, display-id assignment and the orphan
// invariant are all INHERITED rather than reimplemented. A second merge path is
// how those protections quietly stop applying to the towns that need them most.
// ──────────────────────────────────────────────────────────────────────────

/**
 * ⭐⭐ MAP OVERTURE'S TAXONOMY **ROOT**, NOT ITS LEAVES.
 *
 * Overture Places carries on the order of two thousand leaf categories. An
 * enumerated leaf table would be an instance patch wearing a method's clothes —
 * correct for the town you built it on and silently thin everywhere else
 * (`CLAUDE.md` Layer 0 q1). But every record also carries
 * `taxonomy.hierarchy`, a root-to-leaf path, and ⭐ THE ROOT SET IS CLOSED AND
 * SMALL: measured 2026-09-20 over a whole release file, **14 roots and no
 * others**, and the first town measured used exactly the same 14. Level 2 is
 * likewise closed per root. So the kit maps a closed vocabulary of ~14×N, and a
 * town nobody has looked at classifies on the same table.
 *   ▶ re-derive, never quote — `scratch/overture-taxonomy-census.mjs`
 *
 * ⛔ The VALUES are `[category, subcategory]` in the installation's OWN
 * vocabulary (`src/tokens/categories.js`) — the same pairs `classifyPoi`
 * returns. NOT a new taxonomy, and not an extension of that one.
 *
 * ⛔ A `null` SUBCATEGORY IS THE HONEST ANSWER where Overture's second level
 * does not resolve to one of ours; `useListings.js:89` already tolerates it.
 * Inventing a sub-bucket to fill the column would be a confident wrong answer
 * about a real business, which is worse than an empty field.
 */
const OVERTURE_ROOTS = {
  food_and_drink: {
    default: ['dining', null],
    l2: {
      restaurant: ['dining', 'restaurants'],
      casual_eatery: ['dining', 'restaurants'],
      alcoholic_beverage_venue: ['dining', 'bars'],
      non_alcoholic_beverage_venue: ['dining', 'cafes'],
    },
  },
  shopping: { default: ['shopping', 'retail'], l2: { market: ['shopping', 'grocery'], food_and_beverage_retail: ['shopping', 'grocery'] } },
  services_and_business: { default: ['services', null], l2: {} },
  lifestyle_services: { default: ['services', null], l2: { beauty_service: ['services', 'beauty'], fitness_or_wellness_service: ['services', 'fitness'] } },
  health_care: { default: ['services', 'health'], l2: {} },
  education: { default: ['community', 'schools'], l2: {} },
  community_and_government: { default: ['community', 'organizations'], l2: {} },
  cultural_and_historic: {
    default: ['historic', 'landmarks'],
    l2: {
      place_of_worship: ['community', 'churches'],
      religious_organization: ['community', 'churches'],
      historic_site: ['historic', 'landmarks'],
      memorial_site: ['historic', 'markers'],
      cultural_center: ['arts', 'venues'],
    },
  },
  arts_and_entertainment: { default: ['arts', 'venues'], l2: { museum: ['arts', 'galleries'], art_gallery: ['arts', 'galleries'] } },
  sports_and_recreation: { default: ['parks', 'recreation'], l2: { park: ['parks', 'parks'], garden: ['parks', 'gardens'] } },
  lodging: { default: ['hospitality', 'hotels'], l2: { bed_and_breakfast: ['hospitality', 'bed-and-breakfast'] } },
  travel_and_transportation: { default: ['services', null], l2: { parking: ['services', 'parking'], fueling_station: ['services', 'automotive'], vehicle_service: ['services', 'automotive'] } },
  geographic_entities: { default: ['parks', null], l2: { water_feature: ['parks', null], land_feature: ['parks', null] } },
}

/**
 * ⛔ Returns null when the kit cannot classify this record — it does NOT guess.
 * A null category flows into the UNRESOLVED census the roster bake already
 * prints, which is the surface for "we do not know" and is deliberately NOT a
 * category. ⛔ Never reintroduce a `|| 'residential'`-shaped default here; that
 * is the exact fallback the unclassified census was built to expose.
 */
function classifyOverturePlace(place) {
  const h = place.hierarchy || []
  const root = h[0]
  if (!root) return null                       // Overture itself has no category for it
  const entry = OVERTURE_ROOTS[root]
  if (!entry) return { unknownRoot: root }     // a root the kit has never seen — LOUD, not guessed
  const l2 = h[1] && entry.l2[h[1]]
  return { cls: l2 || entry.default }
}

/**
 * Read the acquired artifact. ⛔ Declared-but-missing THROWS: a town that says
 * its base is Overture and has no Overture file is a broken setup, and
 * proceeding on the OSM base would silently produce a different map than the one
 * the operator declared.
 */
function loadOverturePlaces(scene) {
  const p = join(mapDir(scene), 'raw', 'overture-places.json')
  if (!existsSync(p)) throw new Error(
    `scene "${scene}" declares meta.baseSource "overture" but has no raw/overture-places.json.\n` +
    `   ▶ node cartograph/fetch-overture-places.js --scene=${scene}\n` +
    `   ⛔ Not falling back to the OSM base: you would get a different map than the one you declared.`)
  return JSON.parse(readFileSync(p, 'utf8'))
}

function buildBaseListingsFromOverture(artifact, buildingGrid) {
  const out = []
  let skipped = 0, closed = 0, unclassified = 0

  // ⛔⛔ AN ARTIFACT WITH NO TAXONOMY AT ALL IS A BROKEN ARTIFACT, NOT A TOWN
  // WITH NO CATEGORIES — and the two are indistinguishable downstream, which is
  // exactly why this is checked here and loudly. An early cut of the fetcher did
  // not request Overture's `taxonomy` column; the bake then produced a full,
  // plausible-looking set of listings in which EVERY SINGLE ONE was
  // uncategorised, and the only reason it was caught is that the census prints
  // the number. A thin town and a stale artifact must never look alike.
  const places = artifact.places || []
  if (places.length && !places.some(p => (p.hierarchy || []).length)) throw new Error(
    `raw/overture-places.json has ${places.length} places and NOT ONE carries \`hierarchy\`.\n` +
    `   That is a STALE ARTIFACT, not a town without categories — it was fetched before the\n` +
    `   taxonomy field was requested, so every listing would be emitted with no category.\n` +
    `   ▶ re-acquire: node cartograph/fetch-overture-places.js --scene=<scene>`)
  const gate = createVocabularyGate('overture-taxonomy',
    'Add the root to OVERTURE_ROOTS in cartograph/bake-content.js, mapping it to a [category, subcategory] ' +
    'pair from src/tokens/categories.js. ⛔ Do not map it to a nearby-looking category to clear the warning — ' +
    'an unmapped root emits a null category, which the UNRESOLVED census already reports honestly.',
    { noun: 'place', classNoun: 'taxonomy root', unit: 'records', weighted: false,
      body: ['   Overture classified these, and the kit has no mapping for the root it used.',
             '   ⛔ They are emitted with NO CATEGORY rather than a guessed one. Most records first:'] })

  for (const place of artifact.places || []) {
    // ⛔ A permanently closed business rendered as a place card is a wrong map,
    // not a thin one. Overture says so explicitly; dropping it is not a guess.
    if (place.operating_status === 'permanently_closed') { closed++; continue }
    const building_id = joinPointToBuilding(place.x, place.z, buildingGrid, 25)
    if (!building_id) { skipped++; continue }  // outside the baked set — the orphan invariant, inherited

    const verdict = classifyOverturePlace(place)
    let category = null, subcategory = null
    if (verdict?.unknownRoot) { gate.record(verdict.unknownRoot, null, { example: place.name }); unclassified++ }
    else if (verdict?.cls) { [category, subcategory] = verdict.cls }
    else unclassified++

    out.push({
      _key: `ovt-${place.id}`,           // GERS id — stable across Overture releases
      id: null,
      building_id,
      name: place.name,
      category, subcategory,
      address: place.address || null,
      phone: place.phone || null,
      website: place.website || null,
      logo: null,
      hours: null,
      opening_hours_raw: null,           // ⛔ Overture carries no opening hours. Absent, never zero.
      photos: [],
      amenities: [],
      tags: [],
      description: null,
      history: null,
      menu_url: null,
      reservation_url: null,
      status: 'unverified',
      source: 'overture',
      osm_type: null,
      overture_category: place.category || null,
      overture_confidence: place.confidence ?? null,
    })
  }
  return { listings: out, skipped, closed, unclassified, gate }
}

// ──────────────────────────────────────────────────────────────────────────
// Overrides — apply patches (per stable key / name) + adds (research records
// with anchor re-resolution so hand-added listings inherit slab membership).
// ──────────────────────────────────────────────────────────────────────────

const normName = s => (s || '').toLowerCase().replace(/['’.]/g, '').replace(/&/g, 'and').replace(/\s+/g, ' ').trim()

function applyListingOverrides(base, overrides, ctx) {
  const { buildingGrid, bakedIds, parcels, parcelByAddr } = ctx
  const report = { patched: 0, added: 0, add_reanchored: 0, add_dropped: [], base_superseded: 0 }
  const patches = overrides.patches || {}
  // index base by stable key + by (building_id|normName) for name-match patching
  const byKey = new Map(base.map(l => [l._key, l]))
  const byBidName = new Map(base.map(l => [`${l.building_id}|${normName(l.name)}`, l]))

  // 1) patches
  for (const [key, patch] of Object.entries(patches)) {
    let target = byKey.get(key)
    if (!target && patch._match_name) {
      // name-match fallback (osm keys can drift): match on normName
      target = base.find(l => normName(l.name) === normName(patch._match_name))
    }
    if (target) { Object.assign(target, stripMeta(patch)); target.enriched = true; report.patched++ }
  }

  // 2) adds (research). Re-resolve building_id from anchor every run.
  const result = [...base]
  const consumed = new Set()
  for (const add of (overrides.adds || [])) {
    const rec = stripMeta(add)
    // resolve building_id: keep if still in baked set, else re-anchor
    let bid = rec.building_id && bakedIds.has(rec.building_id) ? rec.building_id : null
    if (!bid) {
      // (a) by anchor address → parcel → nearest baked building
      const na = normAddress(add.anchor && add.anchor.address ? add.anchor.address : rec.address)
      const par = na ? parcelByAddr.get(na) : null
      if (par) bid = joinPointToBuilding(par.cx, par.cz, buildingGrid, 60)
      // (b) by explicit anchor x/z
      if (!bid && add.anchor && Number.isFinite(add.anchor.x) && Number.isFinite(add.anchor.z))
        bid = joinPointToBuilding(add.anchor.x, add.anchor.z, buildingGrid, 60)
      if (bid) report.add_reanchored++
    }
    if (!bid) { report.add_dropped.push({ id: rec.id, name: rec.name, reason: 'anchor outside baked set' }); continue }
    rec.building_id = bid
    rec.enriched = rec.enriched ?? true
    // supersede a duplicate base OSM listing on the same building (hand-curated wins)
    const dupKey = `${bid}|${normName(rec.name)}`
    const dup = byBidName.get(dupKey)
    if (dup && !consumed.has(dup._key)) { consumed.add(dup._key); report.base_superseded++ }
    result.push(rec)
    report.added++
  }
  const merged = result.filter(l => !(l.source === 'osm' && consumed.has(l._key)))
  return { listings: merged, report }
}

/**
 * ⛔⛔ ANY `_`-PREFIXED KEY IS META AND NEVER REACHES THE SLAB. This deleted a hardcoded
 * list of four, so every new meta field had to remember to edit this function — and the
 * one that forgets ships into `listings.json`, into the bundle, and to a visitor.
 *
 * ⭐ THE UNDERSCORE IS ALREADY THE CONVENTION HERE (`_match_name`, `_key`,
 * `_stale_building_id`, `_comment`), so honour the convention instead of listing its
 * members — the same "read the rule, don't restate it" the checks use.
 *
 * ⭐ AND IT IS WHAT MAKES RESEARCH AUDITABLE. An enriched listing must be able to say
 * where its hours came from and when they were read, without that provenance riding into
 * the slab: `_source` and `_fetched` live in `listings.overrides.json` forever, are
 * reviewable in a diff, and are stripped here. ⛔ A fact with no `_source` is not a fact.
 */
function stripMeta(o) {
  const c = {}
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith('_') || k === 'anchor') continue
    c[k] = v
  }
  return c
}

// Deterministic display-id assignment. Override adds keep their pinned id;
// base listings get the next free hpdm-lst-NNNN in a stable sort — idempotent
// on unchanged input, and referenced ids (menus/photos) never reassigned.
function assignDisplayIds(listings, prefix) {
  const pinned = new Set(listings.filter(l => l.id).map(l => l.id))
  const unassigned = listings.filter(l => !l.id)
    .sort((a, b) => (a._key || a.name || '').localeCompare(b._key || b.name || ''))
  let n = 1
  for (const l of unassigned) {
    let id
    do { id = `${prefix}-lst-${String(n).padStart(4, '0')}`; n++ } while (pinned.has(id))
    pinned.add(id); l.id = id
  }
  // drop internal _key from output
  for (const l of listings) delete l._key
  return listings
}

// ──────────────────────────────────────────────────────────────────────────
// Layer 1 — roster (one record per baked building)
// ──────────────────────────────────────────────────────────────────────────

function buildRoster(scene, bakedBuildings, buildingGeom, parcelGrid, luMap, nrIndex, listings, rosterOverrides, osmProminence) {
  // group listings by building
  const listingsByBuilding = new Map()
  for (const l of listings) {
    if (!l.building_id) continue
    let a = listingsByBuilding.get(l.building_id); if (!a) { a = []; listingsByBuilding.set(l.building_id, a) }
    a.push(l)
  }
  const rosterPatches = (rosterOverrides && rosterOverrides.patches) || {}
  const out = []
  const bundles = new Map()   // id → the prominence signal bundle (see prominence.mjs)
  const stat = { parcel_matched: 0, nr_attributed: 0, historic_flagged: 0, in_district: 0, with_listings: 0 }

  for (const [id, meta] of bakedBuildings) {
    const geom = buildingGeom.get(id)
    const par = geom ? joinParcelToBuilding(geom, parcelGrid) : null
    if (par) stat.parcel_matched++

    let use = classifyUse(par, luMap)
    const hs = addrHouseStreet(par && par.address)
    const nr = hs ? nrIndex.get(`${hs.house}|${hs.street}`) : null
    if (nr) stat.nr_attributed++

    const jurisdiction = par ? par.jurisdiction : null
    const municipality = par ? par.municipality : null
    const assessorHistoric = !!(par && par.historic_district && (par.historic_district.national || par.historic_district.certified_local))
    // District membership: designated signal + not Richmond Heights (county south).
    const districtEligible = municipality !== 'RICHMOND HEIGHTS'
    const inDistrict = districtEligible && (assessorHistoric || !!nr || (hs && inDistrictStreet(hs.street)))
    if (assessorHistoric || nr) stat.historic_flagged++
    if (inDistrict) stat.in_district++

    const hostListings = listingsByBuilding.get(id) || []
    if (hostListings.length) stat.with_listings++
    const primary = hostListings.find(l => l.source === 'research') || hostListings[0] || null
    use = refineUseFromListing(use, primary)

    // category/subcategory: inherit hosted primary listing, else zoning/use
    const cat = primary
      ? { category: primary.category, subcategory: primary.subcategory }
      : rosterCategoryFromZoning(par && par.zoning, par && par.zoning_code_format, use.use, use.use_subtype)

    // ⭐ Stories: read what the baker built, never re-derive it.
    //
    // This used to compute `max(1, round((centroidY − baseY)/3.5))` under a
    // comment claiming "roof apex − base". It is neither: `centroidY` is the
    // mean TERRAIN elevation under the footprint and `baseY` is the WALL TOP.
    // The subtraction is inverted and the operands are unrelated, so on a
    // scene with no terrain it evaluates to max(1, −2) — pinning all 1,640
    // Księży Młyn buildings to a single storey while their own OSM carried
    // 4,361 `building:levels` (`INTAKE-CATALOGUE §5.2`). On a scene WITH
    // terrain it would have produced noise, which is worse than the floor.
    //
    // The baker now records the storey count it actually extruded, so the
    // roster echoes the geometry instead of trying to invert it.
    const stories = meta.stories ?? null

    const contributing = nr ? (nr.contrib === 'contributing') : (inDistrict ? null : null)
    const style = nr ? (nr.style || null) : null
    const year_built = (par && par.year_built) || (nr && nr.year) || null
    const period = year_built ? `${Math.floor(year_built / 10) * 10}s` : null

    const architecture = {}
    if (inDistrict) architecture.district = 'Hi-Pointe–DeMun Historic District'
    if (contributing != null) architecture.contributing = contributing
    if (nr) { architecture.nps_listed = true; architecture.nps_ref = '05000370' }
    if (style) architecture.style = style
    if (year_built) architecture.year_built = year_built

    const historic_status = contributing === true ? 'contributing'
      : inDistrict ? 'in historic district' : null

    const rec = {
      id,
      name: primary ? primary.name : null,
      address: par ? par.address : null,
      municipality,
      jurisdiction,
      all_names: hostListings.length ? [...new Set(hostListings.map(l => l.name))] : (primary ? [primary.name] : []),
      listing_ids: hostListings.map(l => l.id),
      historic_district: inDistrict ? 'Hi-Pointe–DeMun Historic District' : null,
      contributing,
      style,
      architect: null,
      period,
      year_built,
      building_type: par ? (luMap.get(String(par.land_use_code).replace(/\D/g, '')) || {}).desc || null : null,
      building_sqft: par ? par.building_sqft : null,
      units: par ? par.units : null,
      zoning: par ? par.zoning : null,
      appraised_value: par ? par.appraised_value : null,
      vacant: par ? par.vacant : false,
      stories,
      wall_material: meta.wall_material,
      roof_material: meta.roof_material,
      category: cat.category,
      subcategory: cat.subcategory,
      mixed_use: use.use === 'residential' && hostListings.some(l => ['dining', 'shopping', 'services', 'arts'].includes(l.category)),
      use: use.use,
      use_subtype: use.use_subtype,
      use_confidence: use.use_confidence,
      use_source: par ? 'land_use_code' : (primary ? 'osm' : 'none'),
      in_historic_district: inDistrict,
      architecture: Object.keys(architecture).length ? architecture : null,
      historic_status,
    }
    // ⭐ HAND-PROMOTION, and it is a FIELD ON THE RECORD rather than a corner of
    // `prominence`, precisely so the town's own `roster.overrides.json` can patch it
    // without clobbering the score and its breakdown. Set it and the building sorts
    // above every scored one (`prominence.mjs`, rankRoster). `{ by: 'resident' }` is
    // the seam `§4.3` asks for and it needs no change here — ⛔ that path is not
    // built in this brief.
    rec.promoted = null

    if (rosterPatches[id]) Object.assign(rec, rosterPatches[id])

    const op = osmProminence.get(id) || { tags: {}, poi_count: 0 }
    bundles.set(id, {
      tags: op.tags,
      poi_count: op.poi_count,
      footprint_area: geom ? ringArea(geom.ring) : null,
      stories,
      appraised_value: par ? par.appraised_value : null,
      building_sqft: par ? par.building_sqft : null,
      units: par ? par.units : null,
      vacant: rec.vacant,
    })
    out.push(rec)
  }

  // ⛔ RANK AFTER THE OVERRIDES, never before — a promotion patched in above has to
  // be visible to the sort, or hand-promotion is a field nobody reads.
  const { ctx } = rankRoster(out, bundles)
  return { roster: out, stat, prominenceCtx: ctx }
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

export function bakeContent({ scene, force = false, dryRun = false } = {}) {
  if (!scene) throw new Error('bakeContent: scene is required')
  if (scene === 'lafayette-square' && !force) {
    console.log('[bake-content] LS content is hand-curated (src/data/buildings.json) — skipping. Use --force to override.')
    return { skipped: true }
  }
  const t0 = Date.now()
  console.log(`[bake-content] scene=${scene}${dryRun ? ' (dry-run)' : ''}`)

  const bakedBuildings = loadBakedBuildings(scene)
  const bakedIds = new Set(bakedBuildings.keys())
  const buildingGeom = loadBuildingGeom(scene, bakedIds)
  const { parcels, absentByField, declared: parcelsDeclared } = loadParcels(scene)
  const luMap = loadLandUseCodes(scene)
  const nrIndex = buildNrIndex(loadNrInventory(scene))
  const { pois, nodeTagsPresent } = loadOsmPois(scene)
  console.log(`  loaded: baked=${bakedIds.size} geom=${buildingGeom.size} parcels=${parcels.length} lu=${luMap.size} nr=${nrIndex.size} pois=${pois.length}`)

  // frame-alignment sanity: how many building centroids fall inside a parcel?
  const parcelGrid = buildGrid(parcels)
  const buildingGrid = buildGrid([...buildingGeom.values()])
  let contained = 0
  for (const g of buildingGeom.values()) if (joinParcelToBuilding(g, parcelGrid)) contained++
  const alignPct = Math.round((contained / Math.max(1, buildingGeom.size)) * 100)
  console.log(`  frame-alignment: ${contained}/${buildingGeom.size} buildings matched a parcel (${alignPct}%)`)
  // ⛔⛔ PARCELS LOADED AND NOT ONE BUILDING MATCHED IS A FAILURE, NOT A WARNING.
  // It used to warn-and-continue, which is the silent-substitution class in the one
  // place it must never happen: the pour proceeds, every roster record gets a null
  // address, and the Society Pages open on a town that looks surveyed and is not.
  // ⭐ Zero-with-zero-parcels is a DIFFERENT state and stays quiet — a town that
  // declared it has no assessor is an honest zero, not a broken join.
  if (parcels.length && contained === 0) {
    throw new Error(`frame-alignment: ${parcels.length} parcels loaded and NOT ONE of ${buildingGeom.size} buildings fell inside any of them.\n` +
      `  That is a frame disagreement, not a sparse town — the parcels and the buildings are in different coordinate\n` +
      `  systems, or the parcels were fetched over a different envelope. Re-run:\n` +
      `    CARTOGRAPH_SCENE=${scene} node cartograph/reproject-raw.js\n` +
      `  Refusing to bake a roster in which every address would be null.`)
  }
  if (alignPct < 40 && parcels.length) console.warn(`  ⚠️ LOW parcel-match rate — parcels may be in a stale frame (reproject?)`)
  if (!parcels.length && parcelsDeclared) console.log(`  (no parcels declared for this town — addresses will come from OSM addr:* only)`)

  // parcel-by-normalized-address index (for override anchor re-resolution)
  const parcelByAddr = new Map()
  for (const par of parcels) { const na = normAddress(par.address); if (na && !parcelByAddr.has(na)) parcelByAddr.set(na, par) }

  // ── Layer 2 — base listings. TWO PRODUCERS, SELECTED BY THE DATA. ─────────
  //
  // ⛔ THE DECLARATION LIVES IN THE DATA, NOT IN THIS FILE, and that is the
  // whole design: `meta.baseSource` in the town's own listings.overrides.json.
  // The next town with a non-OSM base is handled without anyone editing here,
  // and no scene name appears in this block.
  //
  // ⭐ WHY THIS USED TO BE A GUARD WITH NOWHERE TO GO. Deriving the base from
  // OSM on a town whose base came from somewhere else yields ~0 joins, so the
  // bake would write out only the surviving hand-authored adds and DESTROY the
  // generated base. That is not hypothetical — it took one town's listings from
  // 84 to 5 on 2026-07-20. The guard that stopped it was correct and generic;
  // what did not exist was anywhere to send a protected town. Now there is.
  // (`checks/claims-an-external-base-survives-a-bake.mjs` pins that regression.)
  let skipListings = false
  const listingOverrides = loadJsonOr(join(contentDir(scene), 'listings.overrides.json'), { adds: [], patches: {} })
  const declaredBase = listingOverrides?.meta?.baseSource || 'osm'

  let baseListings, producer, producerReason
  if (declaredBase === 'osm') {
    producer = 'osm'
    producerReason = listingOverrides?.meta?.baseSource
      ? 'declared meta.baseSource: "osm"'
      : 'no meta.baseSource declared — the default'
    const r = buildBaseListings(pois, buildingGrid)
    baseListings = r.listings
    console.log(`  base listings: ${baseListings.length} · producer=osm (${producerReason})`)
    console.log(`    ${r.skipped} POIs outside the baked set → correctly absent`)

  } else if (declaredBase === 'overture' && !force) {
    producer = 'overture'
    producerReason = 'declared meta.baseSource: "overture"'
    const artifact = loadOverturePlaces(scene)
    const r = buildBaseListingsFromOverture(artifact, buildingGrid)
    baseListings = r.listings
    console.log(`  base listings: ${baseListings.length} · producer=overture (${producerReason})`)
    console.log(`    release ${artifact.meta?.release ?? '(unstated)'} · ${artifact.places?.length ?? 0} acquired` +
                ` · ${r.skipped} outside the baked set → correctly absent` +
                ` · ${r.closed} permanently closed → dropped` +
                ` · ${r.unclassified} with no category`)
    const report = r.gate.report(scene)
    if (report) console.log(report)

  } else if (declaredBase !== 'osm' && force) {
    // ⛔ THE DESTRUCTIVE PATH, AND IT STAYS REACHABLE BUT LOUD. `--force` is the
    // operator saying "regenerate from OSM anyway"; it is the only way to leave
    // an external base, and it must never happen by accident.
    console.warn(`[bake-content] ⛔ --force ON A SCENE WITH AN EXTERNAL BASE ('${declaredBase}').`)
    console.warn(`               Regenerating the base from OSM. The external base WILL BE LOST from`)
    console.warn(`               content/listings.json. Re-acquire it and drop --force to get it back.`)
    producer = 'osm'
    producerReason = `⛔ FORCED off the declared '${declaredBase}' base`
    const r = buildBaseListings(pois, buildingGrid)
    baseListings = r.listings
    console.log(`  base listings: ${baseListings.length} · producer=osm (${producerReason})`)

  } else {
    // ⛔⛔ A DECLARED BASE WITH NO PRODUCER FAILS LOUD — it does not skip, and it
    // does not quietly fall through to OSM. This is the slot the old guard sat
    // in, and a silent skip here is precisely the failure mode that made "an
    // external base is supported" read as true for months while nothing could
    // produce one. An unrecognised base is a QUESTION, and a question is never
    // answered with a plausible-looking default.
    throw new Error(
      `scene "${scene}" declares meta.baseSource "${declaredBase}" and this step has no producer for it.\n` +
      `   Known producers: 'osm' (raw/osm.json) · 'overture' (raw/overture-places.json).\n` +
      `   ⛔ Refusing to fall back to the OSM base: the OSM join yields ~0 on a town whose base is\n` +
      `     external, so the write would keep only hand-authored adds and DESTROY the rest.\n` +
      `   ▶ Add a producer, fix the spelling, or --force to deliberately regenerate from OSM and lose it.`)
  }
  const rosterOverrides = loadJsonOr(join(contentDir(scene), 'roster.overrides.json'), { patches: {} })
  const { listings: merged, report } = applyListingOverrides(baseListings, listingOverrides,
    { buildingGrid, bakedIds, parcels, parcelByAddr })
  const prefix = scene.split('-')[0] === 'hipointe' ? 'hpdm' : scene.slice(0, 4)
  const listings = assignDisplayIds(merged, prefix)
  console.log(`  overrides: +${report.added} adds (${report.add_reanchored} re-anchored, ${report.add_dropped.length} dropped), ${report.patched} patches, ${report.base_superseded} base superseded`)
  if (report.add_dropped.length) for (const d of report.add_dropped) console.log(`    ⚠️ dropped add: ${d.name} (${d.id}) — ${d.reason} → check the Extent`)

  // Layer 1 — roster
  const osmProm = gatherOsmProminence(pois, buildingGrid, buildingGeom)
  const { roster, stat, prominenceCtx } = buildRoster(scene, bakedBuildings, buildingGeom, parcelGrid, luMap, nrIndex, listings, rosterOverrides, osmProm.byBuilding)
  console.log(`  roster: ${roster.length} buildings · parcel-matched ${stat.parcel_matched} · nr ${stat.nr_attributed} · in-district ${stat.in_district} · with-listings ${stat.with_listings}`)

  // ── ⭐ THE PROMINENCE CENSUS — `§4.3`'s work queue, and the operator's dial. ──
  //
  // ⛔ THIS IS A SORT, NOT A FILTER. Every one of the buildings above carries a rank
  // in 1..N and nothing is hidden; the top-10 below is a WINDOW onto the order, not a
  // cut in it. ⭐ The census's job is to say how much evidence the order rests
  // on, because a ranking always produces a plausible ordered list and therefore
  // cannot fail visibly (`BRIEF-roster-prominence-C §7`).
  {
    const ranked = [...roster].sort((a, b) => a.prominence.rank - b.prominence.rank)
    // ⛔ "HAS A SCORE" IS NOT A USEFUL NUMBER and the first version of this census
    // printed it: footprint area is a percentile, so all but the smallest buildings
    // score above zero and the line read 3,668/3,678 — technically true, and it told
    // the operator nothing. ⭐ What they need is how far down the list the order rests
    // on somebody having NOTICED the building, versus on its size alone.
    const SIZE_ONLY = new Set(['footprint_area', 'stories'])
    const hasEvidence = b => Object.keys(b.prominence.signals).some(k => !SIZE_ONLY.has(k))
    const evidence = ranked.filter(hasEvidence).length
    const promoted = ranked.filter(b => b.promoted).length
    const wells = Object.entries(prominenceCtx.wells).filter(([, v]) => !v).map(([k]) => k)
    console.log(`  prominence: ${evidence}/${roster.length} buildings are NOTICED by some source · ${promoted} hand-promoted`)
    if (wells.length) {
      // ⛔ A well no building in this town supplies is DROPPED for all of them, which
      // leaves the sort unchanged — but the operator is told, because a rank computed
      // on fewer signals is a weaker guess and only they can decide if that is enough.
      console.log(`    ⚠️ NO WELL in this town for: ${wells.join(', ')} — dropped for every building (rank-neutral), not zero-filled`)
    }
    if (osmProm.oversized) console.log(`    ${osmProm.oversized} OSM feature(s) larger than their nearest building → not credited to it`)

    // ⛔⛔ THE FETCH VINTAGE, AND IT IS THE REASON TWO TOWNS' NUMBERS MAY NOT BE
    // COMPARED. A town fetched before the node-tag intake landed has no `pois` array,
    // so every business mapped as an OSM NODE is invisible to this score — and the
    // resulting "N buildings are noticed" reads as a fact about the town when it is a
    // fact about the file. ⭐ On LS, only 38 of its 63 hand-curated landmark buildings
    // carry ANY named OSM feature, and its fetch is one of these. ⛔ The magnitude a
    // re-fetch would recover is NOT established — nobody has re-fetched and re-scored.
    if (!nodeTagsPresent) {
      console.log(`    ⛔ THIS TOWN'S raw/osm.json PREDATES THE NODE-TAG INTAKE — it has no 'pois' array.`)
      console.log(`       Every business mapped as an OSM node is invisible to the rank above, so the`)
      console.log(`       "noticed" count is a FLOOR SET BY THE FETCH, not a fact about this town.`)
      console.log(`       ⛔ Do not compare it against a town fetched after 2026-09-20. ▶ Re-fetch to lift it.`)
    }

    // ⛔⛔ THE SCORE'S SIGNAL WELL IS OSM, AND THE LISTINGS BASE MAY NOT BE.
    //
    // `gatherOsmProminence` reads `raw/osm.json` and nothing else. A town declares an
    // external base PRECISELY BECAUSE ITS OSM IS THIN — so on exactly that town the
    // rank goes on being computed from the thin well, produces a perfectly plausible
    // ordered list, and nothing says so. ⭐ That is `CLAUDE.md` Layer 0's signature
    // shape — blind worst where the operator most needs it — and a ranking cannot fail
    // visibly, so silence here is the defect.
    //
    // ⛔ THE FIX IS A SECOND PRODUCER, NOT A WEIGHT. Huron's Overture artifact carries
    // 373 websites / 414 phones / 340 socials against its OSM's 37 / 21 / 18, plus a
    // per-record `confidence` OSM has no equivalent of. ⛔ How far the rank would MOVE
    // is NOT established — nobody has scored it both ways. Until someone does, this
    // prints, so the gap is a known one rather than a discovered one.
    if (producer !== 'osm') {
      console.log(`    ⛔ THIS TOWN'S LISTINGS BASE IS '${producer}', BUT THE PROMINENCE SCORE IS COMPUTED FROM OSM.`)
      console.log(`       You declared an external base because the OSM well was thin — and the rank above is`)
      console.log(`       read out of that same thin well. Treat this order as a FLOOR, not a verdict.`)
      console.log(`       ▶ The missing piece is an external-base signal producer (BRIEF C §6 / brief B), unbuilt.`)
    }
    console.log(`    top 10 by rank:`)
    for (const b of ranked.slice(0, 10)) {
      const sig = Object.entries(b.prominence.signals).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(' · ')
      // ⛔ `rec.name` is the hosted LISTING's name and is null for anything `classifyPoi`
      // does not call a business — which includes the wikidata-bearing landmarks at the very
      // top of this list, so the census printed them as bare ids. The OSM name is read for
      // the LINE ONLY; writing it into `rec.name` would quietly redefine what that field means.
      const osmName = (osmProm.byBuilding.get(b.id) || {}).tags?.name
      console.log(`      ${String(b.prominence.rank).padStart(3)}. ${String(b.prominence.score).padStart(6)}  ${(b.name || osmName || b.address || b.id)}`)
      console.log(`           ${sig || '(no signal — ranked by tie-break only)'}`)
    }
    // ⭐⭐ WHERE THE EVIDENCE RUNS OUT — the one number that says how far this order
    // can be trusted. Below it the buildings are sorted by FOOTPRINT AREA and nothing
    // else, which is a real ordering but not a prominence one. ⛔ It is not a cut:
    // those buildings keep their ranks and the operator can work past it. It is the
    // honest statement that the guess has stopped being a guess about prominence.
    let lastEvidence = 0
    for (const b of ranked) if (hasEvidence(b)) lastEvidence = b.prominence.rank
    console.log(`    evidence runs out at rank ${lastEvidence} of ${roster.length}` +
      ` — below that the order is footprint area alone, and it is still reachable`)
  }

  // ⛔⛔ THE UNCLASSIFIED CENSUS — the number the old `|| 'residential'` existed to hide.
  // Every one of these was previously emitted as a confident "residential" building, so
  // this line going UP is not a regression: it is the first time the pour has been able
  // to say how much of a town it does not understand. ⭐ It is the operator's decision
  // whether that share is acceptable, and they cannot make it without the number.
  const unclassified = roster.filter(b => !b.category).length
  const noAddress = roster.filter(b => !b.address).length
  if (unclassified || noAddress) {
    const pct = (n) => Math.round((n / Math.max(1, roster.length)) * 100)
    console.log(`  ⚠️ UNRESOLVED: ${unclassified} building(s) have NO CATEGORY (${pct(unclassified)}%) · ${noAddress} have NO ADDRESS (${pct(noAddress)}%)`)
    if (noAddress > roster.length * 0.5) {
      console.log(`     ⛔ More than half this town has no address. The Society Pages list bare buildings BY address,`)
      console.log(`        so most of this roster cannot appear there at all. That is an intake gap — check sources.json.`)
    }
  }

  // orphan invariant — every listing building_id ∈ baked set
  const orphans = listings.filter(l => l.building_id && !bakedIds.has(l.building_id))
  console.log(`  ORPHAN CHECK: ${orphans.length} listing building_ids outside the baked set${orphans.length ? ' ✗' : ' ✓ (membership == slab)'}`)
  if (orphans.length) for (const o of orphans.slice(0, 10)) console.log(`    ✗ ${o.name} → ${o.building_id}`)

  if (dryRun) {
    console.log(`[bake-content] dry-run done in ${Date.now() - t0}ms — nothing written`)
    return { roster, listings, orphans: orphans.length, report, stat }
  }

  // ── write ──
  const cdir = contentDir(scene)
  mkdirSync(cdir, { recursive: true })
  const now = '2026-07-07'
  const rosterOut = {
    meta: { scene, schema: 'NEIGHBORHOOD-INPUTS §5.1.1', layer: 'Layer 1 — building ledger (one record per slab building)',
      generated: now, generator: 'bake-content.js', visible_buildings: roster.length,
      parcel_matched: stat.parcel_matched, nr_attributed: stat.nr_attributed, in_historic_district: stat.in_district,
      buildings_with_listings: stat.with_listings, join_key: 'id == slab building id (msbf-* on a US pour, osm-* on an OSM pour, the project id on a curated one)',
      prominence: { scorer: 'prominence.mjs', rank: '1..N over EVERY building — a sort, never a filter',
        promoted_wins: 'records with .promoted set sort above every scored building',
        wells_absent: Object.entries(prominenceCtx.wells).filter(([, v]) => !v).map(([k]) => k) } },
    buildings: roster,
  }
  const listingsOut = {
    meta: { scene, schema: 'NEIGHBORHOOD-INPUTS §5.1.1', layer: 'Layer 2 — listings (business POIs, building_id → slab id, 0..N per building)',
      generated: now, generator: 'bake-content.js', count: listings.length,
      enriched: listings.filter(l => l.enriched).length,
      note: 'BASE = OSM-POI spatial join onto the baked set; hand-authoring lives in listings.overrides.json (adds + patches) and wins. Every building_id ∈ baked set by construction.' },
    listings,
  }
  // ⛔ Validated BEFORE anything is written: a scene with a dead event reference
  // must not leave a half-updated content dir behind.
  const ev = validateEvents(scene, listings)
  if (ev.present) console.log(`  events.json: ${ev.count} authored (${ev.town} town-wide, ${ev.linked} pointing at a place) — every reference resolves ✓`)

  writeIfChanged(join(cdir, 'roster.json'), JSON.stringify(rosterOut, null, 1) + '\n')
  if (!skipListings) writeIfChanged(join(cdir, 'listings.json'), JSON.stringify(listingsOut, null, 1) + '\n')
  // profile.json is fully authored (Layer 0) — leave it in place; the join
  // does not regenerate it. (It rides the instance/content payload as-is.)
  console.log(`[bake-content] wrote roster.json (${roster.length})${skipListings ? ' — listings.json PRESERVED (external base)' : ` + listings.json (${listings.length})`} in ${Date.now() - t0}ms`)
  return { roster, listings, orphans: orphans.length, report, stat }
}

// ──────────────────────────────────────────────────────────────────────────
// ⭐ THE TOWN CALENDAR — `content/events.json`, fully AUTHORED (Layer 0), and this
// step VALIDATES it rather than producing it. Ruled 2026-09-22 (Jacob): it lives
// beside listings.json, where a poured town's content already lives, and each
// event says for itself what it links to.
//
// ⭐ TWO KINDS, distinguished by what the event is ABOUT, never by where it points:
//   · `listing_id` — the event is ABOUT that place; it replaces that place's
//     open-now ticker entry. This is the guardian channel's existing shape.
//   · no `listing_id` — a TOWN event. It keys by its own `id` and stands beside
//     the places. ⛔ `id` is therefore REQUIRED and UNIQUE: without one every town
//     event collides on a single undefined key and they overwrite each other
//     (measured 2026-09-22 — three in, one out, survivor arbitrary).
//   · `links_to` — OPTIONAL, and it is where the event SENDS you: the sponsor, the
//     venue, whoever the operator chose. ⛔ Never the key. Two festivals sponsored
//     by one marina are still two festivals.
//
// ⛔⛔ EVERY REFERENCE MUST RESOLVE, AND THIS IS THE WHOLE POINT OF VALIDATING HERE.
// A `links_to` pointing at a listing that no longer exists is a ticker headline
// that clicks through to nothing — a plausible-looking success, and invisible until
// someone taps it. The bake refuses the scene instead. ⭐ And because listing ids
// are re-derived every pour, this is exactly the reference that rots on its own.
// ──────────────────────────────────────────────────────────────────────────
function validateEvents(scene, listings) {
  const p = join(contentDir(scene), 'events.json')
  if (!existsSync(p)) return { count: 0, present: false }
  const raw = JSON.parse(readFileSync(p, 'utf8'))
  const events = Array.isArray(raw) ? raw : (raw.events || [])
  const ids = new Set(listings.map(l => l.id))
  const seen = new Set()
  const errs = []
  const where = (e, i) => `events[${i}]${e.title ? ` "${e.title}"` : ''}`

  events.forEach((e, i) => {
    if (!e.title) errs.push(`${where(e, i)}: no \`title\``)
    if (!e.start_date) errs.push(`${where(e, i)}: no \`start_date\``)
    if (e.end_date && e.start_date && e.end_date < e.start_date) {
      errs.push(`${where(e, i)}: \`end_date\` ${e.end_date} is before \`start_date\` ${e.start_date}`)
    }
    if (!e.listing_id) {
      if (!e.id) errs.push(`${where(e, i)}: a TOWN event (no \`listing_id\`) needs a unique \`id\` — without one it collides with every other town event`)
      else if (seen.has(e.id)) errs.push(`${where(e, i)}: duplicate \`id\` "${e.id}" — the later event silently replaces the earlier`)
      else seen.add(e.id)
    }
    for (const field of ['listing_id', 'links_to']) {
      if (e[field] && !ids.has(e[field])) {
        errs.push(`${where(e, i)}: \`${field}\` "${e[field]}" resolves to no listing in this scene — the headline would click through to nothing`)
      }
    }
  })

  if (errs.length) {
    throw new Error(
      `content/events.json is invalid for scene "${scene}" — ${errs.length} problem(s):\n` +
      errs.map(m => `   ⛔ ${m}`).join('\n') +
      `\n   ▶ An event that references a missing listing is a dead link in the ticker, and\n` +
      `     listing ids are re-derived on every pour, so this is the reference that rots.`)
  }
  const town = events.filter(e => !e.listing_id).length
  return { count: events.length, town, linked: events.filter(e => e.links_to).length, present: true }
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const get = (flag) => {
    const eq = args.find(a => a.startsWith(`${flag}=`))
    if (eq) return eq.slice(flag.length + 1)
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : null
  }
  // ⛔ Was: `get('--scene') || get('--look')` — the look silently standing in for
  // the scene, and the CARTOGRAPH_SCENE channel not read at all. One resolver now.
  const scene = requireExplicitMap('bake-content')
  const force = args.includes('--force')
  const dryRun = args.includes('--dry-run')
  try { bakeContent({ scene, force, dryRun }) }
  catch (e) { console.error(`[bake-content] ERROR: ${e.message}`); process.exit(1) }
}
