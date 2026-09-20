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
    const id = b.msbfId != null ? `msbf-${b.msbfId}` : (b.osmId != null ? `osm-${b.osmId}` : null)
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
  return out
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

function stripMeta(o) {
  const c = { ...o }
  delete c._match_name; delete c.anchor; delete c._key; delete c._stale_building_id
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

function buildRoster(scene, bakedBuildings, buildingGeom, parcelGrid, luMap, nrIndex, listings, rosterOverrides) {
  // group listings by building
  const listingsByBuilding = new Map()
  for (const l of listings) {
    if (!l.building_id) continue
    let a = listingsByBuilding.get(l.building_id); if (!a) { a = []; listingsByBuilding.set(l.building_id, a) }
    a.push(l)
  }
  const rosterPatches = (rosterOverrides && rosterOverrides.patches) || {}
  const out = []
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
    if (rosterPatches[id]) Object.assign(rec, rosterPatches[id])
    out.push(rec)
  }
  return { roster: out, stat }
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
  const pois = loadOsmPois(scene)
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

  // Layer 2 — base listings
  let skipListings = false
  const { listings: baseListings, skipped } = buildBaseListings(pois, buildingGrid)
  console.log(`  base listings (OSM): ${baseListings.length} (${skipped} POIs outside the baked set → correctly absent)`)

  // overrides
  const listingOverrides = loadJsonOr(join(contentDir(scene), 'listings.overrides.json'), { adds: [], patches: {} })

  // ⛔ EXTERNAL-BASE GUARD. This step derives the listings BASE from OSM POIs.
  // A scene whose base came from somewhere else — Łódź's came from OVERTURE
  // PLACES — cannot be regenerated here: the OSM join yields ~0, so we would
  // write out only the surviving hand-authored adds and silently destroy the
  // generated base. That is not hypothetical: baking Łódź after an Extent edit
  // took listings.json from 84 → 5 (2026-07-20).
  //
  // Same shape as the LS guard below it (LS content is hand-curated), but
  // DECLARED IN THE DATA rather than hardcoded by scene name, so the next town
  // with a non-OSM base is protected without touching this file.
  // Declare it as `meta.baseSource` in listings.overrides.json.
  const externalBase = listingOverrides?.meta?.baseSource
  if (externalBase && externalBase !== 'osm' && !force) {
    console.log(`[bake-content] listings base is EXTERNAL ('${externalBase}') — this step can only derive an OSM base,`)
    console.log(`               so regenerating would DESTROY it. Skipping listings.json; roster/profile still bake.`)
    // ⛔ THERE IS NO MERGE TOOL TO SEND YOU TO, AND SAYING SO IS THE POINT. This line used to
    //    name `scratch/merge-lodz-listings.mjs`, which was hardcoded to one scene's content dir
    //    and was deleted with that scene (2026-09-19). The guard above is generic — it reads
    //    `meta.baseSource` out of the DATA — but the remedy never was. ⭐ So this is an unbuilt
    //    thing that read as done: the next town with a non-OSM base is protected from the
    //    destructive bake and then has nowhere to go. Folding an external base in as a
    //    first-class bake-content source is OPEN WORK, not a missing file.
    console.log(`               ⛔ NO MERGE TOOL EXISTS for an external base — it is unbuilt kit work,`)
    console.log(`               not a path you are missing. Author content/listings.json directly, or`)
    console.log(`               --force to regenerate from OSM and LOSE the external base.`)
    skipListings = true
  }
  const rosterOverrides = loadJsonOr(join(contentDir(scene), 'roster.overrides.json'), { patches: {} })
  const { listings: merged, report } = applyListingOverrides(baseListings, listingOverrides,
    { buildingGrid, bakedIds, parcels, parcelByAddr })
  const prefix = scene.split('-')[0] === 'hipointe' ? 'hpdm' : scene.slice(0, 4)
  const listings = assignDisplayIds(merged, prefix)
  console.log(`  overrides: +${report.added} adds (${report.add_reanchored} re-anchored, ${report.add_dropped.length} dropped), ${report.patched} patches, ${report.base_superseded} base superseded`)
  if (report.add_dropped.length) for (const d of report.add_dropped) console.log(`    ⚠️ dropped add: ${d.name} (${d.id}) — ${d.reason} → check the Extent`)

  // Layer 1 — roster
  const { roster, stat } = buildRoster(scene, bakedBuildings, buildingGeom, parcelGrid, luMap, nrIndex, listings, rosterOverrides)
  console.log(`  roster: ${roster.length} buildings · parcel-matched ${stat.parcel_matched} · nr ${stat.nr_attributed} · in-district ${stat.in_district} · with-listings ${stat.with_listings}`)

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
      buildings_with_listings: stat.with_listings, join_key: 'id == slab building id (msbf-* on a US pour, osm-* on an OSM pour)' },
    buildings: roster,
  }
  const listingsOut = {
    meta: { scene, schema: 'NEIGHBORHOOD-INPUTS §5.1.1', layer: 'Layer 2 — listings (business POIs, building_id → slab id, 0..N per building)',
      generated: now, generator: 'bake-content.js', count: listings.length,
      enriched: listings.filter(l => l.enriched).length,
      note: 'BASE = OSM-POI spatial join onto the baked set; hand-authoring lives in listings.overrides.json (adds + patches) and wins. Every building_id ∈ baked set by construction.' },
    listings,
  }
  writeIfChanged(join(cdir, 'roster.json'), JSON.stringify(rosterOut, null, 1) + '\n')
  if (!skipListings) writeIfChanged(join(cdir, 'listings.json'), JSON.stringify(listingsOut, null, 1) + '\n')
  // profile.json is fully authored (Layer 0) — leave it in place; the join
  // does not regenerate it. (It rides the instance/content payload as-is.)
  console.log(`[bake-content] wrote roster.json (${roster.length})${skipListings ? ' — listings.json PRESERVED (external base)' : ` + listings.json (${listings.length})`} in ${Date.now() - t0}ms`)
  return { roster, listings, orphans: orphans.length, report, stat }
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
