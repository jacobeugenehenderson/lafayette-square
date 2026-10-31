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
 *   · a town that declares its base `hand-curated` (meta.baseSource in its own listings.overrides.json — LS today)
 *     keeps its LISTINGS by hand (Layer 2), and still gets its ROSTER (Layer 1): the step reads its own
 *     content/listings.json as the base and writes roster.json only; listings.json and the id registry are untouched.
 *   · EXTERNAL BASE — a scene whose listings base did NOT come from OSM POIs
 *     declares `meta.baseSource` in listings.overrides.json (Łódź: "overture").
 *     This step can only derive an OSM base, so for those scenes it writes
 *     roster/profile but PRESERVES listings.json. Without this, baking Łódź
 *     after an Extent edit took listings.json from 84 records to 5 (2026-07-20)
 *     — the OSM join yields ~0 there, so only the surviving adds got written.
 *     Declared in DATA, not by scene name, so the next non-OSM town is covered.
 *
 *   node cartograph/bake-content.js --scene=hipointedemun
 *   node cartograph/bake-content.js --scene=hipointedemun --dry-run   (stats, no write)
 */

import { LAND_USE_READERS, STATES } from './states/index.mjs'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeIfChanged } from './io.js'
import { splitBoundary, discOf } from './boundaryRecords.mjs'
import { projectorOf } from '../src/lib/townPlace.js'
import { requireExplicitMap } from './scene.js'
import { readSources, readHistorySources, undeclaredMessage, PARCEL_FIELDS, WITHHELD_PARCEL_FIELDS } from './sources.js'
import { classifyUseFromText } from './parcel-landuse.mjs'
import { classifyZoning } from '../src/tokens/categories.js'
import { createVocabularyGate } from './osm-vocabulary.mjs'
import { rankRoster } from './prominence.mjs'
import { buildingIdOf } from './membership.mjs'
import { addressKey, addressParts, streetKey } from '../src/lib/addressKey.js'
import { normName, onePlacePerIdentity, addressNamed, refusePlaces, survivorOf, absorbedResearch } from './listing-places.js'
import { registryPath as listingIdPath, loadRegistry as loadListingIds, serializeRegistry as serializeListingIds, assignListingIds, idsThatWouldMove, guardSeal, seedPrefix, sealedPrefixes } from './listing-identity.js'

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
    const id = buildingIdOf(b)
    if (!id) continue
    if (!bakedIds.has(id)) continue
    const ring = (b.ring || []).map(p => [Array.isArray(p) ? p[0] : p.x, Array.isArray(p) ? p[1] : p.z])
    if (ring.length < 3) continue
    const [cx, cz] = ringCentroid(ring)
    // ⭐ `rings` = what a point may be CONTAINED in: the drawn footprint plus any OSM twin's
    // footprint the union merged into it (building-union.mjs). `ring` stays the drawn one.
    const rings = [ring, ...(b.joinRings || []).map(r => r.map(p => [Array.isArray(p) ? p[0] : p.x, Array.isArray(p) ? p[1] : p.z]))]
    out.set(id, { id, ring, rings, cx, cz })
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

// ⭐ THE TOWN'S HISTORY WELLS (sources.json `history`, cartograph/sources.js#readHistorySources): facts about a BUILDING.
// `nr-inventory` rows join by address (buildNrIndex), each stamped with its well so the record can name its nomination;
// `mhc-gdb` records join per building by geometry and address (joinHistory). ⛔ A declared well whose file is missing
// THROWS — never a town that reads as having no history. Undeclared is said once, loudly, and reads nothing.
function loadHistoryWells(scene) {
  const h = readHistorySources(scene)
  const out = { state: h.state, nr: [], records: [], wells: h.wells, vocabulary: null }
  if (h.state === 'undeclared') { console.log(`  [history] UNDECLARED — no \`history\` in sources.json; no building carries register facts until one is declared (or history: [] with a reason)`); return out }
  if (h.state === 'none') { console.log(`  [history] declared none: ${h.absentReason}`); return out }
  for (const w of h.wells) {
    if (!existsSync(w.path)) throw new Error(`[history] ${scene} declares well "${w.id}" (${w.reader}) and ${w.path} is not on disk — fetch it (cartograph/fetch-history.mjs) or remove the declaration`)
    const raw = JSON.parse(readFileSync(w.path, 'utf8'))
    const excluded = new Set(w.exclude || [])
    if (w.reader === 'nr-inventory') {
      for (const r of raw) out.nr.push({ ...r, _well: w })
      console.log(`  [history] ${w.id}: ${raw.length} NR inventory rows (${w.registry})`)
    } else if (w.reader === 'mhc-gdb' || w.reader === 'nomination-extract') {
      const recs = raw.records || []
      let n = 0
      for (const r of recs) { if (excluded.has(r.id)) continue; out.records.push({ ...r, _well: w }); n++ }
      console.log(`  [history] ${w.id}: ${n} records (${w.registry}${raw.meta?.fetched ? `, fetched ${raw.meta.fetched}` : ''})${excluded.size ? ` · ${recs.length - n} withheld by \`exclude\`` : ''}`)
    } else throw new Error(`[history] well "${w.id}" has reader ${w.reader}, which bake-content does not join`)
  }
  // ⭐ How the records READ (designation codes, which types name a footprint, placeholder styles) is the town's STATE's
  // vocabulary (cartograph/states/<st>.mjs `history_vocabulary`). ⛔ Records with none to read them by are refused by name.
  if (out.records.length) {
    const st = readSources(scene).state
    const voc = st && STATES[st] && STATES[st].history_vocabulary
    if (!voc) throw new Error(`[history] ${scene} declares history records (${h.wells.filter(w => w.reader !== 'nr-inventory').map(w => w.id).join(', ')}) but its state ${st ? `"${st}"` : '(none declared)'} has no \`history_vocabulary\` in cartograph/states/ — write one (designations, listed, names_footprint, style_placeholders)`)
    for (const k of ['designations', 'listed', 'names_footprint', 'style_placeholders']) if (!voc[k]) throw new Error(`[history] state ${st}'s history_vocabulary has no \`${k}\``)
    out.vocabulary = voc
  }
  return out
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
  if (LAND_USE_READERS[fmt]) {
    // ⭐ Text, or a state's vocabulary (cartograph/states/index.mjs#LAND_USE_READERS) — read as LAND use, then mapped
    // to a BUILDING use once (`buildingUseOf`). 'self-describing' is the kit's text reader, keyed to no state.
    return buildingUseOf(LAND_USE_READERS[fmt](String(code)))
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
  return buildingUseOf(classifyUseFromText((luMap.get(c) || {}).bucket || ''))
}

// `classifyUseFromText` lives in parcel-landuse.mjs — derive.js reads the same vocabulary, as LAND use.
// ⭐ A BUILDING on farmland is a farmstead — a dwelling and its barns — so its building use is
// `residential`, subtype `farm`. The ground under it stays `agricultural` (derive.js). One mapping,
// here, rather than the land reader answering the building question for everyone.
function buildingUseOf(u) {
  return u.use === 'agricultural' ? { use: 'residential', use_subtype: 'farm', use_confidence: u.use_confidence } : u
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

// One canonical address form, shared with the player and the buildings bake (src/lib/addressKey.js).
function buildNrIndex(nr) {
  const idx = new Map()
  for (const r of nr) {
    if (!r.housenum || !r.street) continue
    const street = streetKey(r.street)
    idx.set(`${String(r.housenum).trim()}|${street}`, r)
  }
  return idx
}

// ──────────────────────────────────────────────────────────────────────────
// A PARCEL WELL'S OWN historic-district column — the building's assessor record, read as it stands (a name where the
// column holds one, else membership with no name). ⛔ Nothing is DERIVED here (Boz, 2026-10-26, on Jacob's 2026-10-21
// ruling: "historic is a building's property"; membership is Extent's): the declared-district path — a town's
// `historicDistricts` name, its nomination streets, its excluded municipalities, an NR-inventory match read as
// membership — was removed with the MHC well. `false` only where the well carries the column; else null.
// ──────────────────────────────────────────────────────────────────────────

function parcelDistrict(par) {
  const hd = par ? par.historic_district : null
  if (hd && hd.name) return { in: true, name: hd.name }
  if (hd && (hd.national || hd.local || hd.certified_local)) return { in: true, name: null }
  return { in: hd ? false : null, name: null }
}

// ──────────────────────────────────────────────────────────────────────────
// THE HISTORY JOIN — one record (an MHC point; a nomination row) → one baked building, by TWO witnesses:
//   geometry — the record's point inside the building's footprint (rings + joinRings, as joinPointToBuilding);
//   address  — the record's house-numbered address → the parcel at that address → the building on that parcel.
// Both agree → joined. One alone → joined, `confidence` says which. ⛔ Disagree → NOT joined, reported by name in
// `conflicts`; an address whose parcel holds several buildings and no point to choose → `ambiguous`. Never picked silently.
// Demolished records join nothing and are counted.
// ──────────────────────────────────────────────────────────────────────────

function joinHistory(records, buildingGrid, parcelByAddr, buildingsByHandle) {
  const byBuilding = new Map()
  const rep = { records: records.length, both: 0, point: 0, address: 0, demolished: 0, unjoined: 0, conflicts: [], ambiguous: [], no_point: 0, point_lent: 0 }
  // ⭐ A LOCATED record lends its point to an unlocated one at the same address (a nomination row names an address,
  // the state inventory places that address): exactly one located, standing record there, or none is lent.
  const located = new Map()
  for (const r of records) {
    if (r.demolished || !Number.isFinite(r.x) || !Number.isFinite(r.z) || !addressParts(r.address).house) continue
    const k = addressKey(r.address); let a = located.get(k); if (!a) located.set(k, a = []); a.push(r)
  }
  for (let r of records) {
    if (r.demolished) { rep.demolished++; continue }
    let geo = null
    let px = r.x, pz = r.z
    if (!(Number.isFinite(px) && Number.isFinite(pz)) && addressParts(r.address).house) {
      const lend = located.get(addressKey(r.address)) || []
      if (lend.length === 1) { px = lend[0].x; pz = lend[0].z; r = { ...r, point_via: lend[0].id }; rep.point_lent++ }
    }
    if (Number.isFinite(px) && Number.isFinite(pz)) {
      for (const b of gridNear(buildingGrid, px, pz, 1)) if ((b.rings || [b.ring]).some(g => pointInPolygon(px, pz, g))) { geo = b.id; break }
    } else rep.no_point++
    let adr = null, adrMany = null
    const hs = addressParts(r.address)
    if (hs.house) {
      const par = parcelByAddr.get(addressKey(r.address))
      const on = par ? (buildingsByHandle.get(par.handle) || []) : []
      if (on.length === 1) adr = on[0]
      else if (on.length > 1) adrMany = on
    }
    const label = `${r.id} ${r.historic_name || r.common_name || ''} (${r.address || 'no address'})`.replace(/\s+/g, ' ')
    let id = null, confidence = null
    if (geo && adr) { if (geo === adr) { id = geo; confidence = 'point+address'; rep.both++ } else rep.conflicts.push(`${label}: point in ${geo}, address on ${adr}`) }
    else if (geo && adrMany) { if (adrMany.includes(geo)) { id = geo; confidence = 'point+address'; rep.both++ } else rep.conflicts.push(`${label}: point in ${geo}, address on ${adrMany.join('/')}`) }
    else if (geo) { id = geo; confidence = 'point'; rep.point++ }
    else if (adr) { id = adr; confidence = 'address'; rep.address++ }
    else if (adrMany) rep.ambiguous.push(`${label}: its parcel holds ${adrMany.length} buildings (${adrMany.join(', ')}) and its point is in none`)
    else rep.unjoined++
    if (!id) continue
    let a = byBuilding.get(id); if (!a) byBuilding.set(id, a = [])
    a.push({ ...r, confidence })
  }
  return { byBuilding, report: rep }
}

const semi = (v) => (v || '').split(';').map(x => x.trim()).filter(Boolean)
const yearOf = (v) => (/^\d{4}$/.test(String(v || '').trim()) ? Number(v) : null)

/** The facts a building's joined history records give it — every one stamped with its record. ⛔ Only a record that
 *  NAMES the footprint (a Building; a Structure such as a lighthouse, a wharf, the Monument) gives it facts — a statue or
 *  a burial ground on the same lot does not. ⛔ Several records of ONE well naming one footprint (a merged footprint over
 *  two houses, a stacked condominium): which the building is cannot be told, so that well writes nothing for it, reported.
 *  ⭐ Records of DIFFERENT wells naming one footprint corroborate: each fact is taken from the first well, in the town's
 *  declared order, that gives it, and a later well that disagrees is reported by name (never picked silently). Designation
 *  codes read through the state's vocabulary; a code it does not establish is reported, never expanded by guess. */
function historyFacts(recs, unknownCodes, wellOrder, voc, untyped) {
  const NAMES = new Set(voc.names_footprint), PLACEHOLDER = new Set(voc.style_placeholders.map(x => x.toLowerCase()))
  const LISTED = new Set(voc.listed)
  for (const r of recs) if (!r.type) untyped.add(r.id)
  const names = (r) => !!r.type && NAMES.has(r.type)
  const byWell = new Map()
  for (const r of recs) { let a = byWell.get(r._well.id); if (!a) byWell.set(r._well.id, a = []); a.push(r) }
  const wells = [...byWell.keys()].sort((x, y) => wellOrder.indexOf(x) - wellOrder.indexOf(y))
  const facts = {}, conflicts = [], silenced = new Set()
  for (const w of wells) {
    const named = byWell.get(w).filter(names)
    if (named.length > 1) conflicts.push(`${w}: ${named.length} records name this one footprint (${named.map(r => r.id).join(', ')})`)
  }
  // ⛔ One well seeing several buildings in this footprint makes the footprint itself ambiguous, so NO well names it.
  if (conflicts.length) { for (const w of wells) silenced.add(w); conflicts.push('the footprint holds several recorded buildings — no well\'s facts or dated entries written for it') }
  const PICK = [['historic_name', r => r.historic_name], ['year', r => yearOf(r.constructed)],
    ['style', r => semi(r.style).filter(x => !PLACEHOLDER.has(x.toLowerCase())).join(', ') || null], ['architect', r => semi(r.maker).join('; ') || null]]
  for (const [k, pick] of PICK) {
    for (const w of wells) {
      if (silenced.has(w)) continue
      const r = byWell.get(w).find(names)
      const v = r ? pick(r) : null
      if (v == null) continue
      if (!(k in facts)) facts[k] = v
      else if (String(facts[k]) !== String(v)) conflicts.push(`${k}: ${facts[k]} (kept, the first declared well) | ${v} (${w} ${r.id})`)
    }
  }
  const src = (r, extra = '') => `${r._well.registry} ${r.id}${extra}`
  facts.records = recs.map(r => ({ id: r.id, registry: r._well.registry, type: r.type, confidence: r.confidence }))
  const history = []
  for (const r of recs) {
    if (silenced.has(r._well.id) && names(r)) continue
    const subject = names(r) ? '' : `${r.historic_name || r.common_name || r.type || r.id}: `
    // ⭐ A record that carries its own dated events (a nomination's rows) speaks for itself, page by page.
    if (Array.isArray(r.events)) {
      for (const e of r.events) if (Number.isFinite(e.year)) history.push({ year: e.year, event: `${subject}${e.event}`, source: src(r, e.source_page ? ` p.${e.source_page}` : '') })
      continue
    }
    const codes = (r.designation || '').split(/\s+/).filter(Boolean), dates = semi(r.designation_dates)
    if (yearOf(r.constructed)) history.push({ year: yearOf(r.constructed), event: subject ? `${subject}made (the inventory's date).` : 'Built (the inventory\'s construction date).', source: src(r) })
    if (codes.length && codes.length !== dates.length) { unknownCodes.add(`${r.id}: ${codes.length} designation codes, ${dates.length} dates — none written`); continue }
    codes.forEach((c, i) => {
      const y = Number((dates[i].match(/(\d{4})$/) || [])[1])
      if (!voc.designations[c]) { unknownCodes.add(c); return }
      if (y) history.push({ year: y, event: `${subject}${voc.designations[c]}.`, source: src(r) })
    })
  }
  // the inventory's bare "Built" line gives way to another record's own account of the same year
  const GENERIC = 'Built (the inventory\'s construction date).'
  const told = new Set(history.filter(h => h.event !== GENERIC).map(h => h.year))
  facts.history = history.filter(h => h.event !== GENERIC || !told.has(h.year)).sort((a, b) => a.year - b.year)
  facts.designations = [...new Set(recs.flatMap(r => (r.designation || '').split(/\s+/).filter(Boolean)))]
  facts.listed = recs.some(r => names(r) && (r.designation || '').split(/\s+/).some(c => LISTED.has(c)))
  return { facts, conflicts }
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
    if ((b.rings || [b.ring]).some(r => pointInPolygon(x, z, r))) return b.id
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
 * Every second level Overture uses for a town's places maps to a type of ours
 * (Jacob, 2026-09-29: "Add the sections" — a place with no type fell out of the
 * Society pages). ⛔ A `null` subcategory is still the answer for a level-2 the
 * kit has never seen, never a nearby-looking guess; add the pair here instead.
 * `useListings.js:89` tolerates it.
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
  services_and_business: {
    default: ['services', null],
    l2: {
      financial_service: ['services', 'financial'],
      legal_service: ['services', 'legal'],
      real_estate_service: ['services', 'real-estate'],
      home_service: ['services', 'home'],
      building_or_construction_service: ['services', 'home'],
      b2b_service: ['services', 'industrial'],
      printing_service: ['services', 'advertising'],
      design_service: ['services', 'architecture'],
      event_or_party_service: ['services', 'events'],
      professional_service: ['services', 'professional'],
      corporate_or_business_office: ['services', 'professional'],
      technical_service: ['services', 'professional'],
      family_service: ['services', 'professional'],
      rental_service: ['services', 'professional'],
      housing_or_property_service: ['services', 'health'],
      agricultural_service: ['shopping', 'local-makers'],
      shipping_or_delivery_service: ['community', 'organizations'],
    },
  },
  lifestyle_services: {
    default: ['services', null],
    l2: {
      beauty_service: ['services', 'beauty'],
      personal_or_beauty_service: ['services', 'beauty'],
      fitness_or_wellness_service: ['services', 'fitness'],
      wellness_service: ['services', 'health'],
      animal_or_pet_service: ['services', 'pets'],
      food_service: ['dining', 'restaurants'],
    },
  },
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
  arts_and_entertainment: { default: ['arts', 'venues'], l2: { museum: ['arts', 'museum'], art_gallery: ['arts', 'galleries'], movie_theater: ['arts', 'cinema'] } },
  sports_and_recreation: { default: ['parks', 'recreation'], l2: { park: ['parks', 'parks'], garden: ['parks', 'gardens'] } },
  lodging: { default: ['hospitality', 'hotels'], l2: { bed_and_breakfast: ['hospitality', 'bed-and-breakfast'] } },
  travel_and_transportation: { default: ['services', 'transport'], l2: { parking: ['services', 'parking'], fueling_station: ['services', 'automotive'], vehicle_service: ['services', 'automotive'], travel_service: ['services', 'transport'], air_transport_facility_or_service: ['services', 'transport'] } },
  geographic_entities: { default: ['parks', 'parks'], l2: { water_feature: ['parks', 'parks'], land_feature: ['parks', 'parks'], built_feature: ['parks', 'recreation'] } },
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


export function applyListingOverrides(base, overrides, ctx) {
  const { buildingGrid, bakedIds, parcels, parcelByAddr } = ctx
  const report = { patched: 0, added: 0, add_reanchored: 0, add_dropped: [], patch_unresolved: [], match_name_ambiguous: [], absorbed_conflicts: [] }
  const patches = overrides.patches || {}
  // index base by stable key (a name-matched patch is resolved by name, below)
  const byKey = new Map(base.map(l => [l._key, l]))
  // ⭐ a patch keyed to a listing an authored merge absorbs is that place's research: it reaches the SURVIVOR (after the adds,
  // which a survivor may be), field by field (listing-places.js#absorbedResearch). Applied to the absorbed listing, it left
  // with it, silently
  const survive = survivorOf(overrides.places), absorbedPatches = []

  // 1) patches
  for (const [key, patch] of Object.entries(patches)) {
    if (survive.ref(key) !== key) { absorbedPatches.push([key, survive.ref(key), patch]); continue }
    let target = byKey.get(key)
    if (!target && patch._match_name) {
      // name-match fallback (osm keys can drift): match on normName. ⛔ A name that reaches more than one listing (a chain's two
      // counters) names no ONE place: refused by name, never the first one found (listing-places.js, one place per identity)
      const hits = base.filter(l => normName(l.name) === normName(patch._match_name))
      if (hits.length > 1) { report.match_name_ambiguous.push(`${key} (_match_name "${patch._match_name}") reaches ${hits.length} listings: ${hits.map(l => `${l._key} on ${l.building_id}${l.address ? ` at ${l.address}` : ''}`).join(' · ')}`); continue }
      target = hits[0]
    }
    if (target) { Object.assign(target, stripMeta(patch)); target.enriched = true; report.patched++ }
    // ⛔ A patch whose key reaches no listing is authoring that does nothing — said by name, every bake.
    else report.patch_unresolved.push(`${key}${patch._match_name ? ` (${patch._match_name})` : ''}`)
  }

  // 2) adds (research). Re-resolve building_id from anchor every run.
  const result = [...base]
  for (const add of (overrides.adds || [])) {
    const rec = stripMeta(add)
    // ⭐ An add with no authored id carries its own source key, and the town's id registry mints its permanent id
    // (listing-identity.js). stripMeta drops `_`-keys, so the key is put back here — never invented.
    if (!rec.id && add._key) rec._key = add._key
    // resolve building_id: keep if still in baked set, else re-anchor
    let bid = rec.building_id && bakedIds.has(rec.building_id) ? rec.building_id : null
    if (!bid) {
      // (a) by anchor address → parcel → nearest baked building
      const na = addressKey(add.anchor && add.anchor.address ? add.anchor.address : rec.address)
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
    result.push(rec)
    report.added++
  }
  // 3) an absorbed listing's research reaches its survivor: the same → nothing · the survivor empty → filled · different → refused
  for (const [key, kept, patch] of absorbedPatches) {
    const s = result.find(l => l._key === kept || l.id === kept)
    if (!s) { report.patch_unresolved.push(`${key} (absorbed into "${kept}", which reaches no listing)`); continue }
    const { fill, conflicts } = absorbedResearch(stripMeta(patch), s)
    if (Object.keys(fill).length) { Object.assign(s, fill); s.enriched = true; report.patched++ }
    for (const f of conflicts) report.absorbed_conflicts.push(`"${key}" absorbed into "${kept}" (${s.name}): its research's ${f} ${JSON.stringify(patch[f]).slice(0, 80)} differs from the survivor's ${JSON.stringify(s[f]).slice(0, 80)} — delete the one not wanted from the absorbed patch`)
  }
  // ⭐ An add beside its base twin is ONE place, decided by the operator (listing-places.js, places.merge), never superseded here
  return { listings: result, report }
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

// ──────────────────────────────────────────────────────────────────────────
// Layer 1 — roster (one record per baked building)
// ──────────────────────────────────────────────────────────────────────────

function buildRoster(scene, bakedBuildings, buildingGeom, parcelOf, luMap, nrIndex, historyByBuilding, wellOrder, historyVoc, listings, rosterOverrides, osmProminence) {
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
  const stat = { parcel_matched: 0, nr_attributed: 0, historic_flagged: 0, in_district: 0, with_listings: 0, history_joined: 0, history_conflicts: [] }
  const unknownCodes = new Set(), untyped = new Set()

  for (const [id, meta] of bakedBuildings) {
    const geom = buildingGeom.get(id)
    const par = parcelOf.get(id) || null
    if (par) stat.parcel_matched++

    let use = classifyUse(par, luMap)
    const hs = addressParts(par && par.address)
    const nr = hs.house ? nrIndex.get(`${hs.house}|${hs.street}`) : null
    if (nr) stat.nr_attributed++

    const jurisdiction = par ? par.jurisdiction : null
    const municipality = par ? par.municipality : null
    const hd = par && par.historic_district
    const dist = parcelDistrict(par)
    const inDistrict = dist.in
    if (inDistrict) stat.in_district++
    // ⭐ The building's own register records (the state inventory; a nomination's rows), joined in joinHistory.
    const hrecs = historyByBuilding.get(id) || []
    const hist = hrecs.length ? historyFacts(hrecs, unknownCodes, wellOrder, historyVoc, untyped) : null
    if (hist) { stat.history_joined++; if (hist.conflicts.length) stat.history_conflicts.push(`${id} (${hrecs.map(r => r.id).join(', ')}): ${hist.conflicts.join(' · ')}`) }
    if ((hd && (hd.national || hd.local || hd.certified_local)) || nr || hist?.facts.listed) stat.historic_flagged++

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

    const contributing = nr ? (nr.contrib === 'contributing') : null
    const style = nr ? (nr.style || null) : (hist?.facts.style || null)
    // ⛔ THE RECORD READS THE PARCEL THROUGH `served`, which has no withheld field (`WITHHELD_PARCEL_FIELDS`, sources.js):
    // a parcel well's owner, value, size and dates never reach a served file. The rank (`bundles`) still reads `par`.
    const served = par && Object.fromEntries(Object.entries(par).filter(([k]) => !WITHHELD_PARCEL_FIELDS.includes(k)))
    const year_built = (served && served.year_built) || (nr && nr.year) || hist?.facts.year || null
    const year_built_source = (served && served.year_built) ? 'parcel' : (nr && nr.year) ? nr._well.registry : hist?.facts.year ? (r => `${r._well.registry} ${r.id}`)(hrecs.find(r => yearOf(r.constructed) === hist.facts.year)) : null
    const period = year_built ? `${Math.floor(year_built / 10) * 10}s` : null

    const architecture = {}
    if (dist.name) architecture.district = dist.name
    if (contributing != null) architecture.contributing = contributing
    if (nr) { architecture.nps_listed = true; if (nr._well.nps_ref) architecture.nps_ref = nr._well.nps_ref }
    if (style) architecture.style = style
    if (year_built) architecture.year_built = year_built
    if (hist) {
      if (hist.facts.historic_name) architecture.historic_name = hist.facts.historic_name
      if (hist.facts.architect) architecture.architect = hist.facts.architect
      if (hist.facts.listed) architecture.nps_listed = true
      architecture.designations = hist.facts.designations
      architecture.register_records = hist.facts.records
    }

    const historic_status = contributing === true ? 'contributing'
      : hist?.facts.listed ? 'National Register'
      : inDistrict ? 'in historic district' : null

    const rec = {
      id,
      name: primary ? primary.name : null,
      address: par ? par.address : null,
      municipality,
      jurisdiction,
      all_names: hostListings.length ? [...new Set(hostListings.map(l => l.name))] : (primary ? [primary.name] : []),
      listing_ids: hostListings.map(l => l.id),
      historic_district: dist.name,
      contributing,
      style,
      architect: hist?.facts.architect || null,
      period,
      year_built,
      year_built_source,
      building_type: par ? (luMap.get(String(par.land_use_code).replace(/\D/g, '')) || {}).desc || null : null,
      building_sqft: served ? served.building_sqft ?? null : null,
      units: served ? served.units ?? null : null,
      zoning: par ? par.zoning : null,
      appraised_value: served ? served.appraised_value ?? null : null,
      // ⛔ No parcel, no well spoke: `false` asserted "not vacant" about every unmatched building. null, as loadParcels keeps it.
      vacant: par ? par.vacant : null,
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
      // ⭐ The building's own dated history, each entry naming its record (the card shows it beside a listing's).
      history: hist && hist.facts.history.length ? hist.facts.history : null,
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
  stat.unknown_codes = [...unknownCodes]
  stat.untyped_records = [...untyped]
  return { roster: out, stat, prominenceCtx: ctx }
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

export function bakeContent({ scene, force = false, dryRun = false } = {}) {
  if (!scene) throw new Error('bakeContent: scene is required')
  // ⭐ THE BASE IS THE TOWN'S DECLARATION (meta.baseSource in its own listings.overrides.json). ⛔ It was a test of the
  // town's NAME (LS), the kit deciding a town's content by who it is (G4, 2026-10-07). `meta.baseSource` is a LISTINGS
  // field: a town whose listings are curated by hand still gets its roster (below, the `hand-curated` producer).
  const listingOverrides = loadJsonOr(join(contentDir(scene), 'listings.overrides.json'), { adds: [], patches: {} })
  const declaredBase = listingOverrides?.meta?.baseSource || 'osm'
  const t0 = Date.now()
  console.log(`[bake-content] scene=${scene}${dryRun ? ' (dry-run)' : ''}`)

  const bakedBuildings = loadBakedBuildings(scene)
  const bakedIds = new Set(bakedBuildings.keys())
  const buildingGeom = loadBuildingGeom(scene, bakedIds)
  const { parcels, absentByField, declared: parcelsDeclared } = loadParcels(scene)
  const luMap = loadLandUseCodes(scene)
  const historyWells = loadHistoryWells(scene)
  const nrIndex = buildNrIndex(historyWells.nr)
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
  for (const par of parcels) { const na = addressKey(par.address); if (na && !parcelByAddr.has(na)) parcelByAddr.set(na, par) }
  // building → its parcel, once (the roster and the history join read the same answer)
  const parcelOf = new Map(), buildingsByHandle = new Map()
  for (const [id, g] of buildingGeom) {
    const par = joinParcelToBuilding(g, parcelGrid)
    if (!par) continue
    parcelOf.set(id, par)
    if (par.handle != null) { let a = buildingsByHandle.get(par.handle); if (!a) buildingsByHandle.set(par.handle, a = []); a.push(id) }
  }
  // ⭐ THE HISTORY JOIN (state inventory, nomination rows) — per building, two witnesses, conflicts by name.
  const hj = joinHistory(historyWells.records, buildingGrid, parcelByAddr, buildingsByHandle)
  if (historyWells.records.length) {
    const r = hj.report
    console.log(`  history join: ${r.records} records → ${hj.byBuilding.size} buildings · point+address ${r.both} · point only ${r.point} · address only ${r.address} · demolished ${r.demolished} · unjoined ${r.unjoined} · conflicts ${r.conflicts.length} · ambiguous ${r.ambiguous.length}${r.point_lent ? ` · ${r.point_lent} placed by another well's point at the same address` : ''}`)
    // every one is in roster.json meta.history.join; the first few print
    for (const c of r.conflicts.slice(0, 10)) console.log(`    ⚠️ join conflict: ${c}`)
    for (const c of r.ambiguous.slice(0, 5)) console.log(`    ⚠️ ambiguous: ${c}`)
  }

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

  } else if (declaredBase === 'hand-curated' && !force) {
    // ⭐ LAYER 2 IS KEPT BY HAND, LAYER 1 IS STILL BAKED (Boz, 2026-10-21: a hand-curated town is published with no
    // buildings otherwise). The base IS the served file: no overrides are laid over it and no ids assigned, because the
    // bake does not write it, so the roster joins exactly the listings a visitor sees. ⛔ No file is a refusal, never [].
    producer = 'hand-curated'
    producerReason = 'declared meta.baseSource: "hand-curated"'
    const p = join(contentDir(scene), 'listings.json')
    if (!existsSync(p)) throw new Error(`scene "${scene}" declares meta.baseSource "hand-curated" and has no ${p} — the hand-kept listings ARE its base. Refusing to bake a roster against none.`)
    baseListings = JSON.parse(readFileSync(p, 'utf8')).listings
    if (!Array.isArray(baseListings)) throw new Error(`${p} has no listings array — refusing to bake a roster against it`)
    // ⛔ An add or patch beside a hand-kept file reaches no served listing (this bake never writes it): refused, never ignored
    const authored = (listingOverrides.adds || []).length + Object.keys(listingOverrides.patches || {}).length
    if (authored) throw new Error(`scene "${scene}" keeps its listings by hand (meta.baseSource "hand-curated") yet listings.overrides.json carries ${authored} add(s)/patch(es), which no bake will lay over the hand-kept listings.json. Edit listings.json itself, or declare a producer.`)
    skipListings = true
    console.log(`  base listings: ${baseListings.length} · producer=hand-curated (${producerReason}) — listings.json is read, never written`)

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
      `   Known producers: 'osm' (raw/osm.json) · 'overture' (raw/overture-places.json) · 'hand-curated' (content/listings.json, read, never written).\n` +
      `   ⛔ Refusing to fall back to the OSM base: the OSM join yields ~0 on a town whose base is\n` +
      `     external, so the write would keep only hand-authored adds and DESTROY the rest.\n` +
      `   ▶ Add a producer, fix the spelling, or --force to deliberately regenerate from OSM and lose it.`)
  }
  const rosterOverrides = loadJsonOr(join(contentDir(scene), 'roster.overrides.json'), { patches: {} })
  let listings, report = null, listingIds, idPath
  // ⭐ ONE PLACE PER (identity, building), and never an address as a name (listing-places.js), judged on what a visitor would
  // be served, whichever producer made it. A dry run writes nothing, so it prints the refusal and goes on measuring
  const judgePlaces = (r, opts) => { try { refusePlaces(scene, r, addressNamed(r.listings), opts) } catch (e) { if (!dryRun) throw e; console.warn(`  ⚠️ dry run, nothing written: ${e.message}`) } }
  if (skipListings) { listings = baseListings; judgePlaces(onePlacePerIdentity(baseListings, { parcelOf }), { handCurated: true }) }
  else {
    const { listings: overridden, report: r } = applyListingOverrides(baseListings, listingOverrides,
      { buildingGrid, bakedIds, parcels, parcelByAddr })
    report = r
    const places = onePlacePerIdentity(overridden, { places: listingOverrides.places, parcelOf })
    places.refusals.push(...r.match_name_ambiguous.map(x => `patch ${x}`), ...r.absorbed_conflicts.map(x => `merge ${x}`))
    judgePlaces(places)
    const merged = places.listings
    // ⭐ PERMANENT LISTING IDS — sealed by the scene's registry (`listing-identity.js`, ROADMAP H-29).
    // The prefix is sealed WITH the registry and read back from it; the scene's name seeds it only on
    // the first seal, so renaming a town never renames its listings.
    idPath = listingIdPath(contentDir(scene))
    const { registry, report: idReport } = assignListingIds(merged, loadListingIds(idPath), { sealPrefix: seedPrefix(scene), scene, sealedBy: sealedPrefixes(dirname(mapDir(scene)), scene), reserved: places.absorbed.map(x => x.absorbed.id).filter(Boolean) })
    if (idReport.sealed) {
      // The first sealed bake numbers positionally; that carries today's ids over only if the input
      // is unchanged since the last bake. Prove it against the file on disk before sealing.
      const onDisk = loadJsonOr(join(contentDir(scene), 'listings.json'), { listings: [] }).listings
      const warning = guardSeal(idsThatWouldMove(merged, onDisk), { dryRun })   // a real bake throws inside
      if (warning) console.warn(`  ⚠️ ${warning}`)
  }
  // The source key stays on the record: it is the listing's identity outside this repo too.
  for (const l of merged) { l.source_key = l._key ?? null; delete l._key }
  listings = merged; listingIds = registry
  console.log(`  listing ids: ${idReport.sealed ? `SEALED ${idReport.minted} into ${idPath.split('/').slice(-3).join('/')}` : `${idReport.reused} kept · ${idReport.minted} new (high water ${listingIds.meta.highWater})`}`)
  console.log(`  overrides: +${report.added} adds (${report.add_reanchored} re-anchored, ${report.add_dropped.length} dropped), ${report.patched} patches`)
  if (report.add_dropped.length) for (const d of report.add_dropped) console.log(`    ⚠️ dropped add: ${d.name} (${d.id}) — ${d.reason} → check the Extent`)
  if (report.patch_unresolved.length) console.log(`    ⚠️ ${report.patch_unresolved.length} patch key(s) reach no listing (the patch does nothing): ${report.patch_unresolved.join(' · ')}`)
  }

  // Layer 1 — roster
  const osmProm = gatherOsmProminence(pois, buildingGrid, buildingGeom)
  const { roster, stat, prominenceCtx } = buildRoster(scene, bakedBuildings, buildingGeom, parcelOf, luMap, nrIndex, hj.byBuilding, historyWells.wells.map(w => w.id), historyWells.vocabulary, listings, rosterOverrides, osmProm.byBuilding)
  console.log(`  roster: ${roster.length} buildings · parcel-matched ${stat.parcel_matched} · nr ${stat.nr_attributed} · history ${stat.history_joined} · parcel-well district ${stat.in_district} · with-listings ${stat.with_listings}`)
  if (stat.history_conflicts.length) {
    console.log(`    ⚠️ ${stat.history_conflicts.length} building(s) with a reported fact conflict — several records of one well write nothing; across wells the first declared well's fact is kept (all in roster.json meta.history.fact_conflicts); first 10:`)
    for (const c of stat.history_conflicts.slice(0, 10)) console.log(`      ${c}`)
  }
  if (stat.untyped_records.length) console.log(`    ⚠️ ${stat.untyped_records.length} history record(s) carry no type, so name no footprint: ${stat.untyped_records.join(', ')}`)
  if (stat.unknown_codes.length) console.log(`    ⚠️ designation codes the state vocabulary does not establish (written as codes only, no history entry): ${stat.unknown_codes.join(', ')}`)

  // ── ⭐ THE RANK REACHES THE LISTING. ————————————————————————————
  //
  // ⛔ `prominence` was computed on every building, printed in the census every run,
  // and READ BY NOTHING. The Society Pages had no ordering at all — no `.sort()` in
  // `SidePanel`, `useListings` or `useLandmarkFilter` — so 285 listings rendered in
  // Overture's file order, with a car wash and a remodeling contractor above the
  // town's best-documented restaurant. A scorer that runs, reports and reaches no
  // surface is the doc/code smell in its purest form: the capability shipped and
  // nobody knew.
  //
  // ⚠️ Stamped HERE rather than joined at runtime, because a runtime join needs the
  // ROSTER loaded and altadena's is deliberately not wired — the join would return
  // nothing and the order would silently degrade on exactly the town that cannot say so.
  //
  // ⛔ A LISTING WHOSE BUILDING HAS NO RANK GETS `null`, NEVER 0. Zero is a rank, and
  // the best one; an absent rank must sort LAST and the consumer must see that it is
  // absent rather than infer it from a number.
  {
    const rankOf = new Map(roster.map(b => [b.id, b.prominence?.rank ?? null]))
    let stamped = 0, unranked = 0
    for (const l of listings) {
      const r = l.building_id ? rankOf.get(l.building_id) : undefined
      l.prominence_rank = (r === undefined || r === null) ? null : r
      if (l.prominence_rank === null) unranked++; else stamped++
    }
    console.log(`  prominence → listings: ${stamped} stamped${unranked ? ` · ⚠️ ${unranked} with no ranked building (sort LAST, explicitly null)` : ''}`)
  }

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
  // ⛔ THE BREAKDOWN WITHHOLDS WHAT THE RECORD WITHHOLDS (Boz, 2026-10-21, interim): `prominence.signals` carries a
  // per-building percentile of each value field the rank read, and `unknown` names the ones it could not. Both lose
  // every WITHHELD_PARCEL_FIELDS key here, at the write; `score` and `rank` are unchanged, so the order does not move and
  // the score is the sum of the signals it no longer shows. Whether the score may embed them at all is Jacob's ruling.
  for (const b of roster) if (b.prominence) {
    for (const f of WITHHELD_PARCEL_FIELDS) delete b.prominence.signals[f]
    b.prominence.unknown = b.prominence.unknown.filter(f => !WITHHELD_PARCEL_FIELDS.includes(f))
  }
  const cdir = contentDir(scene)
  mkdirSync(cdir, { recursive: true })
  const now = '2026-07-07'
  const rosterOut = {
    meta: { scene, schema: 'NEIGHBORHOOD-INPUTS §5.1.1', layer: 'Layer 1 — building ledger (one record per slab building)',
      generated: now, generator: 'bake-content.js', visible_buildings: roster.length,
      parcel_matched: stat.parcel_matched, nr_attributed: stat.nr_attributed, in_historic_district: stat.in_district,
      history: { wells: historyWells.wells.map(w => ({ id: w.id, reader: w.reader, registry: w.registry })), joined_buildings: stat.history_joined,
        join: historyWells.records.length ? { ...hj.report, join_conflicts: hj.report.conflicts, conflicts: undefined } : null,
        fact_conflicts: stat.history_conflicts, unknown_codes: stat.unknown_codes, untyped_records: stat.untyped_records },
      buildings_with_listings: stat.with_listings,
      withheld: { fields: WITHHELD_PARCEL_FIELDS, why: 'a parcel well\'s privacy and redistribution terms (cartograph/sources.js WITHHELD_PARCEL_FIELDS)' },
      join_key: 'id == slab building id (msbf-* on a US pour, osm-* on an OSM pour, the project id on a curated one)',
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
  const ev = validateEvents(scene, listings, roster)
  if (ev.present) console.log(`  events.json: ${ev.count} authored (venues: ${Object.entries(ev.venues).map(([k, n]) => `${n} ${k}`).join(', ')}) — every reference resolves ✓`)

  writeIfChanged(join(cdir, 'roster.json'), JSON.stringify(rosterOut, null, 1) + '\n')
  if (!skipListings) {
    writeIfChanged(join(cdir, 'listings.json'), JSON.stringify(listingsOut, null, 1) + '\n')
    writeIfChanged(idPath, serializeListingIds(listingIds))
  }
  // profile.json is fully authored (Layer 0) — leave it in place; the join
  // does not regenerate it. (It rides the instance/content payload as-is.)
  console.log(`[bake-content] wrote roster.json (${roster.length})${skipListings ? ' — listings.json PRESERVED (hand-curated)' : ` + listings.json (${listings.length})`} in ${Date.now() - t0}ms`)
  return { roster, listings, orphans: orphans.length, report, stat }
}

// ──────────────────────────────────────────────────────────────────────────
// ⭐ THE TOWN CALENDAR — `content/events.json`, fully AUTHORED (Layer 0): OPERATOR content, and this step VALIDATES it
// rather than producing it. It lives beside listings.json (Jacob, 2026-09-22).
//
// ⭐ AN EVENT NAMES A HOST AND A VENUE (r-an-event-has-a-host-and-a-venue-and-opens-at-the-venue; Jacob, 2026-10-31):
//   · `listing_id` — the place's OWN event, shown in place of its hours; its venue IS that listing (implicit).
//   · `host` (optional) — who puts it on: { listing: id } (must resolve) | { name: text } (shown, opens nothing).
//   · `venue` — where it happens, and EVERY HAPPENING HAS ONE: one switch, one case per form —
//       { listing: id } · { building: buildingId } (a building that is not a listing, e.g. a home; a home named only by
//       its resident is the guardian path's rule, not this file's) · { name, point: { lat, lon } } (a spot; INSIDE the
//       town's radius: the disc of neighborhood_boundary.json, Jacob: "Only inside the radius") · { scene: true } (a show
//       over the whole town; operator content only, which this file is).
//   · a town event (no `listing_id`) keys by its own `id`, REQUIRED; every `id` is UNIQUE across all rows.
//   · `links_to` is RETIRED (it conflated sponsor and venue): refused by name, sorted into host or venue by a human.
// ⛔⛔ EVERY REFERENCE MUST RESOLVE, OR THE SCENE REFUSES: a venue that resolves to nothing is a ticker headline that
// flies to nowhere, a plausible success invisible until tapped. Listing ids are re-derived every pour: this is the
// reference that rots. ▶ node checks/claims-an-event-names-its-venue.mjs
// ──────────────────────────────────────────────────────────────────────────
const VENUE_FORMS = ['listing', 'building', 'name', 'scene']   // `name` is the spot form: { name, point }
const HOST_FORMS = ['listing', 'name']
const formOf = (o, forms) => forms.filter(k => o && typeof o === 'object' && k in o)
export function townRadius(scene) {   // (lat, lon) → inside the town's radius? The disc record, in the scene's own frame.
  const nb = JSON.parse(readFileSync(join(mapDir(scene), 'neighborhood_boundary.json'), 'utf8'))
  const disc = discOf(splitBoundary(nb, `${scene}/neighborhood_boundary.json`).disc, `events:${scene}`)
  const toLocal = projectorOf(JSON.parse(readFileSync(join(mapDir(scene), 'geography.json'), 'utf8')))
  return (lat, lon) => { const [x, z] = toLocal(lon, lat); return disc.inDisc(x, z) }
}
export function validateEvents(scene, listings, roster) {
  const p = join(contentDir(scene), 'events.json')
  if (!existsSync(p)) return { count: 0, present: false }
  const raw = JSON.parse(readFileSync(p, 'utf8'))
  const events = Array.isArray(raw) ? raw : (raw.events || [])
  const { errs, venues } = eventProblems(events, { listings, roster, inRadius: () => townRadius(scene) })
  if (errs.length) {
    throw new Error(
      `content/events.json is invalid for scene "${scene}" — ${errs.length} problem(s):\n` +
      errs.map(m => `   ⛔ ${m}`).join('\n') +
      `\n   ▶ An event whose venue resolves to nothing is a headline that flies nowhere, and listing ids are\n` +
      `     re-derived on every pour, so this is the reference that rots.`)
  }
  return { count: events.length, venues, present: true }
}
/** The rules, pure: every problem with a calendar's rows, by name. `inRadius()` gives (lat, lon) → inside the town's
 *  radius, asked only when a spot venue needs it. */
export function eventProblems(events, { listings, roster, inRadius: radiusOf }) {
  const listingIds = new Set(listings.map(l => l.id)), buildings = new Map(roster.map(b => [b.id, b]))
  let inRadius = null
  const seen = new Set(), errs = [], venues = { listing: 0, building: 0, name: 0, scene: 0 }
  const where = (e, i) => `events[${i}]${e.title ? ` "${e.title}"` : ''}`
  const VENUE = {
    listing: (v) => (listingIds.has(v.listing) ? null : `venue.listing "${v.listing}" resolves to no listing in this scene`),
    building: (v) => {
      const b = buildings.get(v.building)
      if (!b) return `venue.building "${v.building}" resolves to no building in this scene`
      // the Ward draws a building's card from its name or its address; with neither it draws none (Ward, 2026-10-31)
      if (!b.name && !b.address) return `venue.building "${v.building}" has no name and no address in the roster, so no card can be drawn for it`
      return null
    },
    name: (v) => {
      if (Object.keys(v).sort().join() !== 'name,point') return 'a spot venue is exactly { name, point }'
      if (typeof v.name !== 'string' || !v.name.trim()) return 'venue.name is empty'
      const pt = v.point
      if (!pt || Object.keys(pt).sort().join() !== 'lat,lon' || !(Math.abs(pt.lat) <= 90) || !(Math.abs(pt.lon) <= 180)) return `venue.point ${JSON.stringify(pt)} is not { lat, lon } in range`
      if (!(inRadius ??= radiusOf())(pt.lat, pt.lon)) return `venue.point ${JSON.stringify(pt)} lies outside the town's radius (Jacob: "Only inside the radius"); the map could not fly to it`
      return null
    },
    scene: (v) => (v.scene === true ? null : 'venue.scene is `true` or absent'),
  }

  events.forEach((e, i) => {
    const err = (m) => errs.push(`${where(e, i)}: ${m}`)
    if (!e.title) err('no `title`')
    if (!e.start_date) err('no `start_date`')
    if (e.end_date && e.start_date && e.end_date < e.start_date) err(`\`end_date\` ${e.end_date} is before \`start_date\` ${e.start_date}`)
    if ('links_to' in e) err('`links_to` is retired: it conflated sponsor and venue; sort it into `host` or `venue`')
    if (e.id) { if (seen.has(e.id)) err(`duplicate \`id\` "${e.id}": the later event silently replaces the earlier`); else seen.add(e.id) }
    if (e.listing_id) {
      if (!listingIds.has(e.listing_id)) err(`\`listing_id\` "${e.listing_id}" resolves to no listing in this scene`)
      if (e.venue && !(formOf(e.venue, VENUE_FORMS).join() === 'listing' && e.venue.listing === e.listing_id)) err('a place\'s own event (listing_id) happens at the place: write `host` + `venue` instead of naming another venue')
      venues.listing++
    } else {
      if (!e.id) err('a TOWN event (no `listing_id`) needs a unique `id`')
      if (!e.venue) err('no `venue`: every happening has one (a listing, a building, a { name, point } spot, or the scene)')
    }
    if (e.venue && !e.listing_id) {
      const f = formOf(e.venue, VENUE_FORMS)
      if (f.length !== 1 || (f[0] !== 'name' && Object.keys(e.venue).length !== 1)) err(`venue ${JSON.stringify(e.venue)} is not exactly one of ${VENUE_FORMS.map(k => k === 'name' ? '{ name, point }' : `{ ${k} }`).join(' | ')}`)
      else { const m = VENUE[f[0]](e.venue); if (m) err(m); else venues[f[0]]++ }
    }
    if (e.host !== undefined) {
      const f = formOf(e.host, HOST_FORMS)
      if (f.length !== 1 || Object.keys(e.host).length !== 1) err(`host ${JSON.stringify(e.host)} is not exactly one of { listing } | { name }`)
      else if (f[0] === 'listing' && !listingIds.has(e.host.listing)) err(`host.listing "${e.host.listing}" resolves to no listing in this scene`)
      else if (f[0] === 'name' && !(typeof e.host.name === 'string' && e.host.name.trim())) err('host.name is empty')
    }
  })

  return { errs, venues }
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
