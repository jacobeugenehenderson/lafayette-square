/**
 * bake-labels.js — bake per-scene street labels into the slab.
 *
 * The street NAMES are imported during intake (OSM `name` tags → skeleton →
 * ribbons); this bakes them into a scene artifact so the player reads its OWN
 * labels per-look, instead of the runtime recomputing them from a static
 * (LS-only) src/data/ribbons.json import. Retires the streetLabels.js
 * "deferred-to-producer" hardwire — every town gets its names for free.
 *
 * Reads : cartograph/data/<scene>/clean/ribbons.json  (named street geometry)
 *         cartograph/data/<scene>/neighborhood_boundary.json  (the hood gate)
 * Writes: public/baked/<scene>/labels.json  → { version, count, labels: [
 *           { name, x, z, angle, widthM } ] }  — the shape SceneLabel consumes.
 *
 * Run: node cartograph/bake-labels.js --scene <id>
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeMembership } from './neighborhood-membership.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Synthetic 'motorway_link 13'-style names are skeleton positional indices, not
// walkable destinations. Doctrine: labels encourage walking.
const NO_LABEL_HIGHWAY = new Set(['motorway_link', 'trunk_link', 'motorway'])

function parseArgs() {
  const a = {}
  for (let i = 2; i < process.argv.length; i++) {
    const k = process.argv[i]
    if (!k.startsWith('--')) continue
    const eq = k.indexOf('=')
    if (eq >= 0) a[k.slice(2, eq)] = k.slice(eq + 1)             // --scene=x
    else { a[k.slice(2)] = process.argv[i + 1]; i++ }           // --scene x
  }
  return a
}

// One label per named street: the arclength midpoint of its LONGEST chain, with
// the segment's local angle normalized to [-π/2, π/2] so text reads L→R.
function computeLabels(ribbons, keepPoint) {
  const byName = new Map()
  for (const st of ribbons.streets || []) {
    if (!st.name || !st.points || st.points.length < 2) continue
    if (NO_LABEL_HIGHWAY.has(st.highway)) continue
    if (!byName.has(st.name)) byName.set(st.name, [])
    byName.get(st.name).push(st)
  }
  const labels = []
  for (const [name, chains] of byName) {
    let best = null
    for (const st of chains) {
      const pts = st.points
      const segLens = []
      let totalLen = 0
      for (let i = 0; i < pts.length - 1; i++) {
        const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
        segLens.push(L); totalLen += L
      }
      if (totalLen === 0) continue
      const halfLen = totalLen / 2
      let acc = 0, segIdx = 0
      for (; segIdx < segLens.length - 1; segIdx++) {
        if (acc + segLens[segIdx] >= halfLen) break
        acc += segLens[segIdx]
      }
      const t = segLens[segIdx] > 0 ? (halfLen - acc) / segLens[segIdx] : 0
      const ax = pts[segIdx][0], ay = pts[segIdx][1]
      const bx = pts[segIdx + 1][0], by = pts[segIdx + 1][1]
      const cx = ax + (bx - ax) * t
      const cy = ay + (by - ay) * t
      if (keepPoint && !keepPoint(cx, cy)) continue      // gate to the neighborhood
      if (best && totalLen <= best.totalLen) continue
      let angle = Math.atan2(by - ay, bx - ax)
      if (angle >  Math.PI / 2) angle -= Math.PI
      if (angle < -Math.PI / 2) angle += Math.PI
      const m = st.measure || {}
      const widthM = (m.left?.pavementHW || 0) + (m.right?.pavementHW || 0) || null
      best = { cx, cy, totalLen, angle, widthM }
    }
    if (!best) continue
    labels.push({ name, x: Math.round(best.cx * 100) / 100, z: Math.round(best.cy * 100) / 100, angle: Math.round(best.angle * 1e4) / 1e4, widthM: best.widthM })
  }
  return labels
}

function main() {
  const args = parseArgs()
  const scene = args.scene || process.env.CARTOGRAPH_SCENE || 'lafayette-square'
  const look = args.look || scene   // read from data/<scene>; write to baked/<look>
  // Poured scenes carry clean/ribbons.json; the legacy LS default scene keeps its
  // ribbons at src/data/ribbons.json (predates the per-scene convention).
  let ribbonsPath = join(ROOT, 'cartograph', 'data', scene, 'clean', 'ribbons.json')
  if (!existsSync(ribbonsPath)) ribbonsPath = join(ROOT, 'src', 'data', 'ribbons.json')
  const boundaryPath = join(ROOT, 'cartograph', 'data', scene, 'neighborhood_boundary.json')
  if (!existsSync(ribbonsPath)) { console.error(`[bake-labels] no ribbons for scene ${scene}`); process.exit(1) }
  const ribbons = JSON.parse(readFileSync(ribbonsPath, 'utf-8'))

  // Gate to the neighborhood proper (the SAME boundary trees + lamps test) —
  // replaces streetLabels.js's four hardcoded LS corridors with the generic hood.
  let keepPoint = null
  if (existsSync(boundaryPath)) {
    const m = makeMembership(boundaryPath)
    keepPoint = (x, z) => m.isInside(x, z)
  } else {
    console.warn('[bake-labels] no neighborhood_boundary.json — labelling ALL named streets (ungated)')
  }

  const labels = computeLabels(ribbons, keepPoint)
  const outDir = join(ROOT, 'public', 'baked', look)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'labels.json')
  writeFileSync(outPath, JSON.stringify({ version: 1, scene, look, count: labels.length, labels }))
  console.log(`[bake-labels] scene=${scene} look=${look}: ${labels.length} street labels → ${outPath}`)
  if (labels.length) console.log('  e.g. ' + labels.slice(0, 8).map(l => l.name).join(' · '))
}
main()
