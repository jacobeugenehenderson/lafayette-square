/**
 * ONE-TIME migration — extract hand-authoring out of the current (pre-pipeline)
 * listings.json into the committed override sidecar `listings.overrides.json`,
 * so bake-content's re-join preserves it instead of clobbering it.
 *
 * The current listings.json inlines two kinds of hand-work that a raw re-join
 * would erase:
 *   - source:"research" records  → ADDS (whole records OSM never surfaced)
 *   - enriched:true osm records   → PATCHES (prose/hours/photos on a machine base)
 *
 * After this runs, listings.json becomes a DERIVED artifact; the override file
 * is the SSOT. Reads the committed file, writes the override + an empty
 * roster.overrides scaffold. Idempotent-ish (re-running reproduces the same
 * override from the same input) — but meant to run ONCE, before the first
 * `bake-content` write.
 *
 *   node scratch/migrate-hpdm-content-overrides.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'

const SCENE = 'hipointe-demun'
const DIR = `cartograph/data/${SCENE}/content`
const cur = JSON.parse(readFileSync(`${DIR}/listings.json`, 'utf8'))

// Fields bake-content recomputes at join time — never freeze them into the
// override (building_id is re-resolved from the anchor; source/osm_type are
// join provenance).
const JOIN_OWNED = new Set(['osm_type'])

// building_id → current baked centroid, for a spatial anchor fallback.
const baked = JSON.parse(readFileSync(`public/baked/${SCENE}/buildings.json`, 'utf8'))
const bakedIds = new Set(baked.buildings.map(b => b.id))
const map = JSON.parse(readFileSync(`cartograph/data/${SCENE}/clean/map.json`, 'utf8'))
const centroidById = new Map()
for (const b of map.buildings || []) {
  if (b.msbfId == null) continue
  const ring = (b.ring || []).map(p => [p.x ?? p[0], p.z ?? p[1]])
  if (ring.length < 3) continue
  let sx = 0, sz = 0; for (const p of ring) { sx += p[0]; sz += p[1] }
  centroidById.set(`msbf-${b.msbfId}`, [sx / ring.length, sz / ring.length])
}

const adds = []
const patches = {}
const slug = s => (s || '').toLowerCase().replace(/['’.]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

let nResearch = 0, nEnriched = 0
for (const l of cur.listings) {
  const isResearch = l.source === 'research'
  const isEnriched = l.enriched === true && l.source === 'osm'
  if (!isResearch && !isEnriched) continue

  // strip join-owned fields; keep everything hand-authored
  const rec = {}
  for (const [k, v] of Object.entries(l)) if (!JOIN_OWNED.has(k)) rec[k] = v

  if (isResearch) {
    // ADD — carry a spatial anchor so building_id re-resolves every run:
    // the record's own address + the current building centroid (if still baked).
    const anchor = {}
    if (l.address) anchor.address = l.address
    const c = l.building_id && centroidById.get(l.building_id)
    if (c) { anchor.x = c[0]; anchor.z = c[1] }
    rec.anchor = anchor
    // building_id kept only as a hint; the join re-validates it against the slab
    if (l.building_id && !bakedIds.has(l.building_id)) rec._stale_building_id = l.building_id
    adds.push(rec)
    nResearch++
  } else {
    // PATCH — keyed by name-match (the current file dropped the osm element id);
    // bake-content matches this onto the freshly-joined base listing by name.
    rec._match_name = l.name
    delete rec.building_id       // re-joined
    delete rec.source
    patches[slug(l.name)] = rec
    nEnriched++
  }
}

const overrides = {
  meta: {
    scene: SCENE,
    schema: 'NEIGHBORHOOD-INPUTS §5.1.1 — override layer (the §0.0 "override wins" seam)',
    generated: '2026-07-08',
    note: 'Hand-authored SSOT that bake-content applies OVER the raw join and never clobbers. '
      + 'adds = records OSM never surfaced (each carries an anchor so building_id re-resolves against the current baked set). '
      + 'patches = enrichment on machine-found OSM listings, keyed by name-match. '
      + 'Migrated once from the pre-pipeline listings.json.',
    adds: adds.length,
    patches: Object.keys(patches).length,
  },
  adds,
  patches,
}

writeFileSync(`${DIR}/listings.overrides.json`, JSON.stringify(overrides, null, 1) + '\n')
if (!existsSync(`${DIR}/roster.overrides.json`)) {
  writeFileSync(`${DIR}/roster.overrides.json`, JSON.stringify({
    meta: { scene: SCENE, schema: 'NEIGHBORHOOD-INPUTS §5.1.1 — roster override layer',
      generated: '2026-07-08', note: 'Per-building hand corrections (keyed by slab id) applied over the raw roster join. Empty at migration; fill via place cards (§0.0).' },
    patches: {},
  }, null, 1) + '\n')
}
console.log(`migrated: ${nResearch} research→adds, ${nEnriched} enriched→patches`)
console.log(`wrote ${DIR}/listings.overrides.json (+ roster.overrides.json scaffold)`)
