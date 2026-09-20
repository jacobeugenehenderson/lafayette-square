#!/usr/bin/env node
/**
 * Cartograph — EXTEND centerlines.json with streets a grown fetch recovered.
 *
 * ⛔⛔ WHY THIS IS NOT `seed-centerlines.js --force`. `centerlines.json` IS THE OPERATOR'S
 * AUTHORING — the Surveyor's editable street geometry, which `seed-centerlines.js:21` refuses
 * to overwrite by design. Re-seeding does two damaging things at once:
 *   1. It discards hand-edited geometry. (LS: 3 of 446 streets, measured — small, still theirs.)
 *   2. ⭐ IT IMPORTS THE WORLD'S CHURN. Measured on LS's grow, 2026-09-06: of the ways present
 *      in BOTH fetches, 51 got longer and **94 got SHORTER**. A grown bbox cannot shorten a
 *      way, so that is real OSM editing since the original fetch. A re-seed silently replaces
 *      the map the operator has been authoring against with today's different world.
 * ⇒ This script ADDS ONLY. Every existing street object is copied through byte-identical.
 *
 * ⛔ NO FALLBACK: it refuses to run without an existing centerlines.json (that is
 * `seed-centerlines.js`'s job, not this one) and refuses to write if it would drop a street.
 *
 * ⭐ NEWNESS IS DECIDED BY GEOMETRY, NOT BY NAME OR BY BBOX. `seed-centerlines.js` dedups on
 * NAME (`coveredNames`), which would skip every new block of an already-known street — the
 * exact streets a grow recovers. And a bbox test would only work for a town whose old box we
 * still have. A candidate is NEW when most of its length lies away from every existing
 * centerline; that needs no memory of the previous fetch and works on town #2.
 *
 * Usage:  node cartograph/extend-centerlines.js --scene=<id> [--apply]
 *         (dry-run by default — it prints what it would add and writes nothing)
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs'
import { join } from 'path'
import { RAW_DIR, SCENE, requireExplicitMap } from './config.js'

requireExplicitMap()
const APPLY = process.argv.includes('--apply')

const OUT = join(RAW_DIR, 'centerlines.json')
const OSM = join(RAW_DIR, 'osm.json')
if (!existsSync(OUT)) { console.error(`⛔ ${SCENE}: no centerlines.json at ${OUT}. This script EXTENDS an existing set; seeding one is seed-centerlines.js's job. Refusing.`); process.exit(2) }
if (!existsSync(OSM)) { console.error(`⛔ ${SCENE}: no osm.json at ${OSM}. Run fetch.js first. Refusing.`); process.exit(2) }

const doc = JSON.parse(readFileSync(OUT, 'utf8'))
const existing = doc.streets || []
const osmHW = JSON.parse(readFileSync(OSM, 'utf8')).ground?.highway || []

// ── the seeder's own conversion, so an added street is indistinguishable from a seeded one ──
function simplify(pts, tol) {
  if (pts.length <= 2) return pts
  const a = pts[0], b = pts[pts.length - 1]
  const dx = b[0] - a[0], dz = b[1] - a[1], len2 = dx*dx + dz*dz
  let maxDist = 0, maxIdx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]
    const dist = len2 < 1e-6 ? Math.hypot(p[0]-a[0], p[1]-a[1])
      : (() => { const t = ((p[0]-a[0])*dx + (p[1]-a[1])*dz) / len2
                 return Math.hypot(p[0]-(a[0]+t*dx), p[1]-(a[1]+t*dz)) })()
    if (dist > maxDist) { maxDist = dist; maxIdx = i }
  }
  if (maxDist <= tol) return [a, b]
  return [...simplify(pts.slice(0, maxIdx + 1), tol).slice(0, -1), ...simplify(pts.slice(maxIdx), tol)]
}
const polyLength = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0]-p[i-1][0], p[i][1]-p[i-1][1]); return L }
const slug = (n) => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const mapType = (hw) => hw === 'primary' || hw === 'primary_link' ? 'primary'
  : hw === 'secondary' || hw === 'secondary_link' ? 'secondary' : hw === 'service' ? 'service' : 'residential'

const vehicular = new Set(['residential','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','unclassified'])
const PATHS = ['footway','path','cycleway','steps','pedestrian']

// ── the coverage index: every existing centerline segment, on a grid ────────────────────────
const CELL = 30, NEW_AWAY = 5, NEW_FRAC = 0.7
const grid = new Map(), gkey = (a, b) => a + ',' + b
for (const s of existing) for (let i = 1; i < (s.points || []).length; i++) {
  const a = s.points[i-1], b = s.points[i]
  const x0 = Math.min(a[0],b[0]), x1 = Math.max(a[0],b[0]), z0 = Math.min(a[1],b[1]), z1 = Math.max(a[1],b[1])
  for (let cx = Math.floor((x0-NEW_AWAY)/CELL); cx <= Math.floor((x1+NEW_AWAY)/CELL); cx++)
    for (let cz = Math.floor((z0-NEW_AWAY)/CELL); cz <= Math.floor((z1+NEW_AWAY)/CELL); cz++) {
      const k = gkey(cx,cz); let e = grid.get(k); if (!e) grid.set(k, e = []); e.push([a,b])
    }
}
const d2seg = (p, a, b) => { const ex = b[0]-a[0], ez = b[1]-a[1], L2 = ex*ex+ez*ez || 1
  let t = ((p[0]-a[0])*ex + (p[1]-a[1])*ez)/L2; t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0]-(a[0]+ex*t), p[1]-(a[1]+ez*t)) }
const covered = (p) => {
  const cx = Math.floor(p[0]/CELL), cz = Math.floor(p[1]/CELL)
  for (let ax = cx-1; ax <= cx+1; ax++) for (let az = cz-1; az <= cz+1; az++)
    for (const [a,b] of (grid.get(gkey(ax,az)) || [])) if (d2seg(p,a,b) < NEW_AWAY) return true
  return false
}
// sample the candidate every ~5 m so a long way is judged on its whole length, not its vertices
const isNew = (pts) => {
  let tot = 0, away = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i-1], b = pts[i], L = Math.hypot(b[0]-a[0], b[1]-a[1]), n = Math.max(1, Math.ceil(L/5))
    for (let k = 0; k <= n; k++) { const t = k/n; tot++; if (!covered([a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t])) away++ }
  }
  return tot ? away/tot >= NEW_FRAC : false
}

// ── id allocation continues the existing numbering; a slug NEVER collides ───────────────────
const idCounts = {}, taken = new Set(existing.map(s => s.id))
for (const s of existing) { const m = /^(.*)-(\d+)$/.exec(s.id); if (m) idCounts[m[1]] = Math.max(idCounts[m[1]] || 0, +m[2] + 1) }
const nextId = (name) => { const base = slug(name || 'unnamed'); let n = idCounts[base] || 0
  let id; do { id = `${base}-${n++}` } while (taken.has(id)); idCounts[base] = n; taken.add(id); return id }

const added = [], byType = {}
const consider = (f, tol, minLen, type) => {
  const pts = simplify(f.coords.map(c => [c.x, c.z]), tol).map(([x,z]) => [+x.toFixed(2), +z.toFixed(2)])
  if (pts.length < 2 || polyLength(pts) < minLen) return
  if (!isNew(pts)) return
  const name = f.tags?.name || ''
  added.push({ id: nextId(name || type), name, type, oneway: f.tags?.oneway === 'yes',
    deadEnd: false, loop: false, smooth: false, points: pts, source: 'osm', _original: pts.map(p => [...p]) })
  byType[type] = (byType[type] || 0) + 1
}
for (const f of osmHW) {
  const hw = f.tags?.highway
  if (!hw || !(f.coords?.length >= 2)) continue
  if (vehicular.has(hw)) consider(f, 1.5, 10, mapType(hw))
  else if (hw === 'service' && f.tags?.service === 'alley') consider(f, 1.5, 5, 'service')
  else if (PATHS.includes(hw)) {
    const fw = f.tags?.footway
    if (hw === 'footway' && ['sidewalk','crossing','traffic_island','access_aisle'].includes(fw)) continue
    consider(f, 1.0, 3, hw === 'cycleway' ? 'cycleway' : hw === 'steps' ? 'steps' : hw === 'pedestrian' ? 'pedestrian' : 'footway')
  }
}

console.log(`${SCENE}: ${existing.length} existing street(s) — every one carried through UNTOUCHED.`)
console.log(`  candidates in osm.json: ${osmHW.length} highway ways`)
console.log(`  NEW (≥${NEW_FRAC*100}% of length >${NEW_AWAY} m from every existing centerline): ${added.length}`)
for (const [t, n] of Object.entries(byType).sort((a,b) => b[1]-a[1])) console.log(`     ${t.padEnd(12)} ${n}`)
const named = added.filter(s => s.name).length
console.log(`  of those, ${named} named / ${added.length - named} unnamed`)

if (!APPLY) { console.log(`\n  DRY RUN — nothing written. Re-run with --apply to write.`); process.exit(0) }

const out = { ...doc, streets: [...existing, ...added] }
if (out.streets.length !== existing.length + added.length) { console.error('⛔ street count does not reconcile — REFUSING to write.'); process.exit(1) }
for (let i = 0; i < existing.length; i++) if (JSON.stringify(out.streets[i]) !== JSON.stringify(existing[i])) { console.error(`⛔ existing street ${existing[i].id} was mutated — REFUSING to write.`); process.exit(1) }
const bak = OUT.replace(/\.json$/, `.backup-${Date.now()}.json`)
copyFileSync(OUT, bak)
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')
console.log(`\n  ✅ wrote ${out.streets.length} streets (${existing.length} kept + ${added.length} added)`)
console.log(`     backup: ${bak}`)
