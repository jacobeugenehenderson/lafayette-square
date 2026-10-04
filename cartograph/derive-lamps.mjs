/**
 * derive-lamps.mjs — the INVENTED lamp well: street lamps placed along a town's
 * streets where no survey recorded any. Writes `clean/derived_lamps.json`.
 *
 * ⭐ REAL WHERE REAL, DERIVED WHERE NECESSARY (Jacob, 2026-09-21) — the tree
 * pattern, copied: this well is `source: 'derived'`, bake-lamps unions it with the
 * surveyed wells, a surveyed lamp wins any overlap, an invented lamp on illegal
 * ground is DROPPED (a surveyed one is nudged), and invented lamps dissolve toward
 * the rim. ROADMAP H-17 · docs/briefs/BRIEF-street-lamps-derived.md.
 *
 * WHERE, and why none of it is a constant:
 *   · WHICH STREETS — the street's own road class (`lamp-spacing.mjs#groupOf`) and its
 *     OSM `lit` tag: `lit=no` never, `lit=yes` always, else the lit road groups.
 *   · HOW FAR APART — `spacingForScene`: the town's own surveyed median when it has
 *     one, else the pooled prior measured across every town on disk.
 *   · WHICH SIDE — one side per street, the side with more curb frontage (measured
 *     off the frozen shape; a tie breaks by a hash of the street id, so it is stable).
 *   · HOW FAR BACK — read off the PAINTED ground, not a width: walk inward from the
 *     curb arc and stand the lamp mid-treelawn; no treelawn → the first sidewalk
 *     sample behind the curb; no pedestrian realm → the first land-use sample.
 *     The same `makeZoneTester` surfaces the tree fill and the Design view use.
 *   · WHOSE CURB — the frozen `shape.json` tiles' `runs`, each arc already naming its
 *     `skelId` and `side`. ⛔ Never a nearest-chain query (`A15`).
 *
 *   node cartograph/derive-lamps.mjs --scene=<scene> [--out=<path>]
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeZoneTester } from './forbidden-surface.mjs'
import { requireExplicitMap } from './scene.js'
import { spacingForScene, groupOf } from './lamp-spacing.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(readFileSync(p, 'utf-8'))

/** Ray-march resolution off the curb (a sampling step, not a placement distance). */
const STEP = 0.2
/** Search bound for the ray; a ray that finds no legal ground inside it is DROPPED and counted. */
const RAY_MAX = 25
/** The ground a derived lamp may stand on. Everything else — asphalt, curb, a building, water, a lot — is illegal. */
export const DERIVED_LEGAL = new Set(['treelawn', 'sidewalk', 'lu'])

function hash01(s) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h / 4294967296
}
function pointInRing(x, z, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}
const toXZ = (r) => r.map(q => Array.isArray(q) ? q : [q.x, q.z])
function distToRing(x, z, r) {
  let m = Infinity
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz
    const t = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)) : 0
    m = Math.min(m, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz))
  }
  return m
}
const polyLen = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L }
/** Point + unit tangent at arc length s along a polyline. */
function at(p, s) {
  for (let i = 1; i < p.length; i++) {
    const dx = p[i][0] - p[i - 1][0], dz = p[i][1] - p[i - 1][1], L = Math.hypot(dx, dz)
    if (!L) continue
    if (s <= L || i === p.length - 1) { const t = Math.min(1, s / L); return { x: p[i - 1][0] + t * dx, z: p[i - 1][1] + t * dz, tx: dx / L, tz: dz / L } }
    s -= L
  }
  return null
}

/**
 * Stand a lamp behind the curb at a point on a curb arc, reading the painted zones inward.
 * @returns {{ x, z, zone } | { drop: string }}
 */
function standBehindCurb(zoneOf, ring, pt) {
  let nx = -pt.tz, nz = pt.tx
  if (!pointInRing(pt.x + nx, pt.z + nz, ring)) { nx = -nx; nz = -nz }   // inward = into this tile
  const runs = []   // contiguous zone intervals along the ray
  for (let d = 0; d <= RAY_MAX; d += STEP) {
    const zone = zoneOf(pt.x + nx * d, pt.z + nz * d)
    const last = runs.at(-1)
    if (last && last.zone === zone) last.b = d
    else runs.push({ zone, a: d, b: d })
    // Past the pedestrian realm into the lot or a building: nothing further in is street furniture.
    if (runs.some(r => DERIVED_LEGAL.has(r.zone)) && !DERIVED_LEGAL.has(zone) && zone !== 'curb') break
  }
  const first = (z) => runs.find(r => r.zone === z)
  const tl = first('treelawn'), sw = first('sidewalk'), lu = first('lu')
  const band = tl || sw || lu
  if (!band) return { drop: `no legal ground within ${RAY_MAX} m (${runs.map(r => r.zone).join('→')})` }
  // Mid-treelawn; else the first sample behind the curb. ⭐ The zone is re-read at the ROUNDED point we
  // emit — a first-sample pick sits on the band's edge, and rounding alone tipped 3 Provincetown lamps
  // into the road. Step inward through the band until the emitted point itself reads legal.
  const start = tl ? (tl.a + tl.b) / 2 : band.a
  for (let d = start; d <= band.b + 1e-9; d += STEP) {
    const x = +(pt.x + nx * d).toFixed(2), z = +(pt.z + nz * d).toFixed(2)
    const zone = zoneOf(x, z)
    if (DERIVED_LEGAL.has(zone)) return { x, z, zone }
  }
  return { drop: `the ${band.zone} band has no legal point once rounded` }
}

export function deriveLamps(scene, { quiet = false } = {}) {
  const sceneDir = join(ROOT, 'cartograph', 'data', scene)
  const shapePath = join(ROOT, 'public', 'baked', scene, 'shape.json')
  const skelPath = join(sceneDir, 'clean', 'skeleton.json')
  const osmPath = join(sceneDir, 'raw', 'osm.json')
  for (const [p, why] of [[shapePath, 'bake the ground first — the curb arcs live there'], [skelPath, 'run the pipeline first — road classes live there'], [osmPath, 'fetch the town first — the lit tags live there']])
    if (!existsSync(p)) throw new Error(`[derive-lamps] ${scene}: no ${p} — ${why}. Refusing to invent lamps without it.`)
  const zoneOf = makeZoneTester({
    shapePath, mapPath: join(sceneDir, 'clean', 'map.json'), scene, quiet: true,
  }).zoneOf

  const spacing = spacingForScene(sceneDir)
  const litOf = new Map()
  for (const w of read(osmPath).ground?.highway || []) if (w.tags?.lit) litOf.set(w.osmId, w.tags.lit)
  const streets = new Map()
  for (const s of read(skelPath).streets || []) {
    const lits = (s.sources || []).map(id => litOf.get(id)).filter(Boolean)
    const lit = lits.includes('yes') ? 'yes' : (lits.length && lits.every(l => l === 'no')) ? 'no' : null
    // lit=yes on a road group we have no spacing for (a lit service road, a lit path) takes the ordinary spacing.
    const group = lit === 'no' ? null : (groupOf(s.highway) ?? (lit === 'yes' ? 'ordinary' : null))
    streets.set(s.id, { highway: s.highway, lit, group })
  }

  // One side per street: the side with more frontage on the frozen shape.
  const shape = read(shapePath)
  const frontage = new Map()
  for (const t of shape.tiles || []) for (const r of t.runs || []) {
    if (!streets.get(r.skelId)?.group || !r.poly?.length) continue
    const f = frontage.get(r.skelId) || { left: 0, right: 0 }
    f[r.side] = (f[r.side] || 0) + polyLen(r.poly)
    frontage.set(r.skelId, f)
  }
  const sideOf = new Map([...frontage].map(([id, f]) => [id, f.left === f.right ? (hash01(id) < 0.5 ? 'left' : 'right') : f.left > f.right ? 'left' : 'right']))

  const lamps = [], drops = {}, dropped = [], cell = 8, occ = new Map()
  const key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`
  const tooClose = (x, z, r) => {
    const R = Math.ceil(r / cell), gx = Math.floor(x / cell), gz = Math.floor(z / cell)
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++)
      for (const o of occ.get(`${gx + dx},${gz + dz}`) || []) if ((o[0] - x) ** 2 + (o[1] - z) ** 2 < r * r) return o
    return null
  }
  const drop = (why) => { drops[why] = (drops[why] || 0) + 1 }
  // Gather each street's chosen-side runs, each with the `iaFull` contour it is struck on
  // (so "inward" is into THAT ring), then walk the side as ONE line in `segOrd` order, carrying
  // the spacing across run boundaries. ⛔ Restarting per run put a lamp near the middle of every
  // short run — a street cut into many runs got lamps at a fraction of its spacing.
  const sideRuns = new Map(), seenArc = new Set()
  let repeatedArcs = 0
  for (const t of shape.tiles || []) {
    const contours = (t.iaFull || []).map(toXZ)
    for (const r of t.runs || []) {
      const st = streets.get(r.skelId)
      if (!st?.group || r.side !== sideOf.get(r.skelId) || !r.poly || r.poly.length < 2) continue
      // ⚠️ The SAME arc can be listed on two tiles (measured 2026-09-26: Huron's tiles 24 and 25 share one
      // `iaFull`, so every run on it appears twice; 371/2091 runs on Huron, 184/1213 on LS). One frontage, one lamp line.
      const arcKey = `${r.skelId}|${r.side}|${r.poly.map(q => q.map(v => v.toFixed(2)).join(',')).join(';')}`
      if (seenArc.has(arcKey)) { repeatedArcs++; continue }
      seenArc.add(arcKey)
      const mid = r.poly[r.poly.length >> 1]
      const ring = contours.reduce((b, c) => (!b || distToRing(mid[0], mid[1], c) < distToRing(mid[0], mid[1], b)) ? c : b, null)
      if (!ring) { drop('run on a tile with no curb contour'); continue }
      const list = sideRuns.get(r.skelId) || sideRuns.set(r.skelId, []).get(r.skelId)
      list.push({ poly: r.poly, segOrd: r.segOrd ?? 0, ring })
    }
  }
  for (const [skelId, runs] of sideRuns) {
    const st = streets.get(skelId), sp = spacing[st.group].spacing
    runs.sort((a, b) => a.segOrd - b.segOrd)
    let carry = sp / 2                       // the first lamp stands half a spacing in from the street's start
    for (const run of runs) {
      const L = polyLen(run.poly)
      let s = carry
      for (; s <= L; s += sp) {
        const pt = at(run.poly, s)
        if (!pt) continue
        const stood = standBehindCurb(zoneOf, run.ring, pt)
        if (stood.drop) { drop(stood.drop.replace(/\(.*\)/, '').trim()); dropped.push({ x: +pt.x.toFixed(1), z: +pt.z.toFixed(1), street: skelId, why: stood.drop }); continue }
        // Two streets meeting at a corner would each light it: one lamp per half-spacing.
        const clash = tooClose(stood.x, stood.z, sp / 2)
        if (clash) { drop('within half a spacing of another derived lamp'); dropped.push({ x: stood.x, z: stood.z, street: skelId, why: `near ${clash[2]}` }); continue }
        const k = key(stood.x, stood.z); (occ.get(k) || occ.set(k, []).get(k)).push([stood.x, stood.z, skelId])
        lamps.push({ x: stood.x, z: stood.z, street: skelId, group: st.group, spacing: sp, ground: stood.zone })
      }
      carry = s - L
    }
  }
  const byGroup = {}; for (const l of lamps) byGroup[l.group] = (byGroup[l.group] || 0) + 1
  const byGround = {}; for (const l of lamps) byGround[l.ground] = (byGround[l.ground] || 0) + 1
  const litStreets = [...streets.values()].filter(s => s.group).length
  if (!quiet) {
    console.log(`[derive-lamps] ${scene}: ${lamps.length} derived lamps on ${frontage.size} lit streets (of ${litStreets} eligible in the skeleton)`)
    for (const [g, s] of Object.entries(spacing)) console.log(`  ${g.padEnd(9)} ${String(s.spacing).padStart(5)} m  from ${s.from === 'town' ? `this town's own survey (n=${s.n} gaps)` : `the pooled prior (${s.n} towns)`}  → ${byGroup[g] || 0} lamps`)
    console.log(`  stood on: ${JSON.stringify(byGround)}`)
    if (Object.keys(drops).length) console.log(`  dropped: ${JSON.stringify(drops)}`)
    if (repeatedArcs) console.log(`  ⚠️ ${repeatedArcs} curb arcs are listed on more than one tile in shape.json — lit once`)
  }
  if (litStreets && !lamps.length) throw new Error(`[derive-lamps] ${scene}: ${litStreets} streets are eligible for lamps and none got one — refusing to write an empty well. Dropped: ${JSON.stringify(drops)}`)
  return {
    meta: { kind: 'derived', well: 'derived', generatedBy: 'cartograph/derive-lamps.mjs', spacing, drops, byGround },
    dropped,   // every refused candidate, with the zones its ray crossed — so a check can read WHY
    lamps,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const scene = requireExplicitMap('derive-lamps.mjs (writes data/<scene>/clean/derived_lamps.json)')
  const outArg = process.argv.slice(2).find(a => a.startsWith('--out='))
  const out = outArg ? outArg.slice(6) : join(ROOT, 'cartograph', 'data', scene, 'clean', 'derived_lamps.json')
  const well = deriveLamps(scene)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(well))
  console.log(`[derive-lamps] wrote ${out}`)
}
