/**
 * lamp-spacing.mjs — how far apart a town's street lamps stand, MEASURED from
 * surveyed lamps (OSM `highway=street_lamp`), never picked.
 *
 * ⭐ Jacob, 2026-09-21: *"This is a heuristic concern; we need to avail ourselves
 * to the data and think it through."* So the derived-lamp spacing is:
 *   1. the town's OWN median, when its surveyed lamps give ≥ MIN_GAPS same-side
 *      gaps on that road group, else
 *   2. the POOLED prior (`lamp-spacing-prior.json`): one vote per town, the median
 *      of town medians, over every scene on disk plus the fetched sample towns.
 * The prior is WRITTEN BY THIS FILE (`--write-prior`), never typed, and carries its
 * towns and OSM timestamps so it can be re-derived. ROADMAP H-17.
 *
 *   node cartograph/lamp-spacing.mjs <sceneDir>        # one town's measurement
 *   node cartograph/lamp-spacing.mjs --write-prior     # re-derive the pooled prior
 */
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const PRIOR_PATH = join(ROOT, 'cartograph', 'lamp-spacing-prior.json')
const SAMPLE_DIR = join(ROOT, 'scratch', 'lamp-sample')

/** A town's median needs this many same-side gaps before it outranks the pooled prior (a sample size, not a distance). */
export const MIN_GAPS = 10
/** A lamp further than this from every carriageway is off-street (park, campus, path), not a street lamp. */
const ROAD_ASSIGN_M = 25

/** Road groups that get derived lamps. The group, not the raw class, carries a spacing. */
const GROUP_OF = {
  residential: 'ordinary', unclassified: 'ordinary', living_street: 'ordinary',
  tertiary: 'ordinary', secondary: 'ordinary', primary: 'ordinary',
  trunk: 'trunk', motorway: 'motorway',
}
export const groupOf = (highway) => GROUP_OF[String(highway || '').replace(/_link$/, '')] ?? null
const CARRIAGE = new Set([...Object.keys(GROUP_OF), 'service'])
const isCarriage = (h) => CARRIAGE.has(String(h || '').replace(/_link$/, ''))

const read = (p) => JSON.parse(readFileSync(p, 'utf-8'))
const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length & 1 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** Project lon/lat through a scene's geography.json (the frame every bake uses). */
export function projector(sceneDir) {
  const g = read(join(sceneDir, 'geography.json'))
  return (lon, lat) => [(lon - g.lon) * g.lonToMeters, (g.lat - lat) * g.latToMeters]
}

/**
 * Every SURVEYED street lamp a scene holds, from both OSM wells:
 * `raw/osm.json#pois` (what fetch.js writes for every town) and
 * `raw/osm_street_lamps.json` (an Overpass export; LS and HiPointe carry one).
 * Deduped by OSM id — the two wells can hold the same node.
 */
export function readSurveyedLamps(sceneDir) {
  const toXZ = projector(sceneDir)
  const out = [], seen = new Set()
  const add = (id, lon, lat, well, tags) => {
    if (typeof lon !== 'number' || typeof lat !== 'number') return
    if (id != null) { if (seen.has(id)) return; seen.add(id) }
    const [x, z] = toXZ(lon, lat)
    out.push({ id, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, well, tags: tags || {} })
  }
  const osmP = join(sceneDir, 'raw', 'osm.json')
  if (existsSync(osmP)) {
    for (const p of read(osmP).pois || []) {
      if (p?.tags?.highway !== 'street_lamp') continue
      const c = p.coords?.[0] || p
      add(p.osmId ?? null, c.lon, c.lat, 'osm.json#pois', p.tags)
    }
  }
  const expP = join(sceneDir, 'raw', 'osm_street_lamps.json')
  if (existsSync(expP)) {
    const r = read(expP)
    for (const e of (r.elements || r)) if (e?.tags?.highway === 'street_lamp') add(e.id ?? null, e.lon, e.lat, 'osm_street_lamps.json', e.tags)
  }
  return out
}

/**
 * Same-side spacing along each carriageway, per road group, for one scene.
 * Each lamp is assigned to the nearest CARRIAGEWAY (not the nearest way — OSM
 * sidewalks are separate footways in some towns and would swallow every lamp).
 */
export function measureLampSpacing(sceneDir) {
  const toXZ = projector(sceneDir)
  const lamps = readSurveyedLamps(sceneDir)
  const osmP = join(sceneDir, 'raw', 'osm.json')
  const ways = !existsSync(osmP) ? [] : (read(osmP).ground?.highway || [])
    .filter(w => isCarriage(w.tags?.highway) && w.coords?.length > 1)
    .map(w => {
      const pts = w.coords.map(c => toXZ(c.lon, c.lat)), cum = [0]
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
      return { group: groupOf(w.tags.highway), pts, cum, hits: [] }
    })
  let offStreet = 0
  for (const l of lamps) {
    let best = null
    for (const w of ways) for (let i = 1; i < w.pts.length; i++) {
      const [ax, az] = w.pts[i - 1], [bx, bz] = w.pts[i], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz
      if (!L2) continue
      const t = Math.max(0, Math.min(1, ((l.x - ax) * dx + (l.z - az) * dz) / L2))
      const d = Math.hypot(l.x - ax - t * dx, l.z - az - t * dz)
      if (!best || d < best.d) best = { w, d, s: w.cum[i - 1] + t * Math.sqrt(L2), side: Math.sign(dx * (l.z - az) - dz * (l.x - ax)) }
    }
    if (!best || best.d > ROAD_ASSIGN_M) { offStreet++; continue }
    best.w.hits.push(best)
  }
  const groups = {}
  for (const w of ways) {
    if (!w.group || w.hits.length < 2) continue
    const gaps = (groups[w.group] ||= [])
    for (const side of [-1, 1]) {
      const ss = w.hits.filter(h => h.side === side).sort((a, b) => a.s - b.s)
      for (let i = 1; i < ss.length; i++) gaps.push(ss[i].s - ss[i - 1].s)
    }
  }
  const byGroup = {}
  for (const [g, gaps] of Object.entries(groups)) byGroup[g] = { p50: median(gaps), n: gaps.length }
  return { lamps: lamps.length, offStreet, ids: lamps.map(l => l.id).filter(id => id != null), byGroup }
}

/**
 * The spacing a scene's derived lamps use, per group, with where it came from.
 * @returns {{ [group]: { spacing: number, from: 'town'|'pooled', n: number } }}
 */
export function spacingForScene(sceneDir) {
  if (!existsSync(PRIOR_PATH)) throw new Error(`[lamp-spacing] no ${PRIOR_PATH} — run: node cartograph/lamp-spacing.mjs --write-prior`)
  const prior = read(PRIOR_PATH)
  const own = measureLampSpacing(sceneDir).byGroup
  const out = {}
  for (const [g, p] of Object.entries(prior.groups)) {
    const o = own[g]
    out[g] = o && o.n >= MIN_GAPS
      ? { spacing: +o.p50.toFixed(1), from: 'town', n: o.n }
      : { spacing: p.spacing, from: 'pooled', n: p.towns.length }
  }
  return out
}

/** Pool every scene on disk + the sample towns: one vote per town. */
function writePrior() {
  const dirs = []
  for (const R of [join(ROOT, 'cartograph', 'data'), SAMPLE_DIR]) {
    if (!existsSync(R)) continue
    for (const s of readdirSync(R)) if (existsSync(join(R, s, 'geography.json')) && existsSync(join(R, s, 'raw', 'osm.json'))) dirs.push(join(R, s))
  }
  const towns = dirs.map(d => ({ town: basename(d), dir: d, ...measureLampSpacing(d) }))
  // One vote per PLACE, not per scene: two scenes sharing most of their surveyed lamps
  // (an extent and its staging copy) are the same town measured twice. Keep the fuller one.
  const dup = new Set()
  for (const a of towns) for (const b of towns) {
    if (a === b || dup.has(a.town) || dup.has(b.town) || !a.ids.length || !b.ids.length) continue
    const [small, big] = a.ids.length <= b.ids.length ? [a, b] : [b, a]
    const bs = new Set(big.ids)
    if (small.ids.filter(id => bs.has(id)).length > small.ids.length / 2) dup.add(small.town)
  }
  const groups = {}
  for (const g of new Set(Object.values(GROUP_OF))) {
    const votes = towns.filter(t => !dup.has(t.town) && t.byGroup[g]?.n >= MIN_GAPS)
      .map(t => ({ town: t.town, p50: +t.byGroup[g].p50.toFixed(1), n: t.byGroup[g].n }))
    if (!votes.length) throw new Error(`[lamp-spacing] no town has ≥${MIN_GAPS} same-side gaps on '${g}' roads — cannot derive a prior for it`)
    groups[g] = { spacing: +median(votes.map(v => v.p50)).toFixed(1), towns: votes }
  }
  const osmBase = Object.fromEntries(dirs.map(d => {
    try { return [basename(d), read(join(d, 'raw', 'osm.json')).osm3s?.timestamp_osm_base ?? null] } catch { return [basename(d), null] }
  }))
  const out = {
    _comment: 'GENERATED by `node cartograph/lamp-spacing.mjs --write-prior` — do not hand-edit. Median of per-town median same-side spacing, one vote per town. Sample towns are fetched by scratch/lamp-sample/fetch.mjs. ROADMAP H-17.',
    generated: new Date().toISOString().slice(0, 10),
    minGaps: MIN_GAPS,
    excludedAsDuplicate: [...dup],
    osmBase,
    groups,
  }
  writeFileSync(PRIOR_PATH, JSON.stringify(out, null, 2) + '\n')
  for (const [g, v] of Object.entries(groups)) console.log(`${g.padEnd(9)} ${String(v.spacing).padStart(6)} m   from ${v.towns.length} towns: ${v.towns.map(t => `${t.town} ${t.p50}`).join(' · ')}`)
  console.log(`duplicates excluded: ${[...dup].join(', ') || 'none'}  → ${PRIOR_PATH}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--write-prior')) writePrior()
  else {
    const d = process.argv[2]
    if (!d) { console.error('usage: node cartograph/lamp-spacing.mjs <sceneDir> | --write-prior'); process.exit(1) }
    console.log(JSON.stringify(measureLampSpacing(d).byGroup, null, 2))
  }
}
