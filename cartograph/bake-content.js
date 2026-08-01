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

function sceneDir(scene) { return join(ROOT, 'cartograph', 'data', scene) }
function contentDir(scene) { return join(sceneDir(scene), 'content') }

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
  const p = join(sceneDir(scene), 'clean', 'map.json')
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

// City + county assessor parcels — merged. Both are pre-projected to the local
// frame (centroid:[x,z], rings:[[[x,z]]]). jurisdiction distinguishes them.
function loadParcels(scene) {
  const out = []
  for (const [file, jur] of [['stl_parcels.json', 'city'], ['stlco_parcels.json', 'county']]) {
    const p = join(sceneDir(scene), 'raw', file)
    if (!existsSync(p)) { console.warn(`  [parcels] missing ${file} — skipping ${jur}`); continue }
    const j = JSON.parse(readFileSync(p, 'utf8'))
    for (const par of (j.parcels || [])) {
      if (!par.centroid) continue
      out.push({
        handle: par.handle,
        address: par.address ? par.address.replace(/\s+/g, ' ').trim() : null,
        year_built: par.year_built || null,
        building_sqft: par.building_sqft || null,
        appraised_value: par.appraised_value || null,
        land_use_code: par.land_use_code != null ? String(par.land_use_code).trim() : null,
        zoning: par.zoning ? par.zoning.trim() : null,
        units: par.units ?? null,
        num_buildings: par.num_buildings ?? null,
        vacant: !!par.vacant,
        historic_district: par.historic_district || { national: false, local: false, certified_local: false },
        municipality: par.municipality || (jur === 'city' ? 'St. Louis' : null),
        jurisdiction: par.jurisdiction || jur,
        cx: par.centroid[0], cz: par.centroid[1],
        rings: par.rings || [],
      })
    }
  }
  return out
}

// County land-use code table: CODE,LAND_USE_DESCRIPTION,LUCODE,OBJECTID
function loadLandUseCodes(scene) {
  const p = join(contentDir(scene), 'county-land-use-codes.csv')
  const map = new Map()
  if (!existsSync(p)) { console.warn('  [landuse] county-land-use-codes.csv missing'); return map }
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

// Named OSM POIs from raw/osm.json (.ground.<class>[]). Each feature:
// { osmId, tags, isClosed, coords:[{lon,lat,x,z}] }. We keep name-bearing
// features and compute an x/z anchor from their coords.
function loadOsmPois(scene) {
  const p = join(sceneDir(scene), 'raw', 'osm.json')
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
// this site (`BOZ.md §3`, one home per fact).
function classifyUse(parcel, luMap) {
  const code = parcel && parcel.land_use_code
  if (!code) return { use: 'unknown', use_subtype: null, use_confidence: 'low' }
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
  // fall back to bucket text
  const bucket = (luMap.get(c) || {}).bucket || ''
  if (/single/i.test(bucket)) return { use: 'residential', use_subtype: 'single_family', use_confidence: 'medium' }
  if (/multi|duplex/i.test(bucket)) return { use: 'residential', use_subtype: 'multi_family', use_confidence: 'medium' }
  if (/commercial/i.test(bucket)) return { use: 'commercial', use_subtype: null, use_confidence: 'medium' }
  if (/industrial|utility/i.test(bucket)) return { use: 'industrial', use_subtype: null, use_confidence: 'medium' }
  if (/vacant/i.test(bucket)) return { use: 'vacant', use_subtype: null, use_confidence: 'medium' }
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

// Roster category/subcategory (§useListings ZONING_CAT/SUB) — the bare-building
// default from the assessor zoning letter; overridden by a hosted listing.
const ZONING_CAT = { A: 'residential', B: 'residential', C: 'residential', D: 'commercial', E: 'residential', F: 'commercial', G: 'commercial', H: 'residential', J: 'industrial' }
const ZONING_SUB = { A: 'houses', B: 'townhouses', C: 'lofts', D: 'storefronts', E: 'houses', F: 'storefronts', G: 'retail', H: 'houses', J: 'warehouses' }
function rosterCategoryFromZoning(zoning, use, use_subtype) {
  const z = (zoning || '').replace(/[^A-Z]/gi, '').charAt(0).toUpperCase()
  if (ZONING_CAT[z]) return { category: ZONING_CAT[z], subcategory: ZONING_SUB[z] }
  // county parcels carry zoning "Municipal" → fall back to use
  if (use === 'residential') return { category: 'residential', subcategory: use_subtype === 'single_family' ? 'houses' : use_subtype === 'multi_family' ? 'lofts' : 'houses' }
  if (use === 'commercial') return { category: 'commercial', subcategory: 'storefronts' }
  if (use === 'industrial') return { category: 'industrial', subcategory: 'warehouses' }
  if (use === 'institutional') return { category: 'community', subcategory: 'organizations' }
  if (use === 'vacant') return { category: 'residential', subcategory: 'unnamed' }
  return { category: 'residential', subcategory: 'unnamed' }
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
      : rosterCategoryFromZoning(par && par.zoning, use.use, use.use_subtype)

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
  const parcels = loadParcels(scene)
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
  if (alignPct < 40) console.warn(`  ⚠️ LOW parcel-match rate — parcels may be in a stale frame (reproject?)`)

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
    console.log(`               Merge tool for this scene: scratch/merge-lodz-listings.mjs. Use --force to override.`)
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
  const scene = get('--scene') || get('--look')
  const force = args.includes('--force')
  const dryRun = args.includes('--dry-run')
  if (!scene) { console.error('usage: node cartograph/bake-content.js --scene <scene> [--dry-run] [--force]'); process.exit(1) }
  try { bakeContent({ scene, force, dryRun }) }
  catch (e) { console.error(`[bake-content] ERROR: ${e.message}`); process.exit(1) }
}
