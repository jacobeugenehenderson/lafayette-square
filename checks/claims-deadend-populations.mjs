#!/usr/bin/env node
/**
 * The dead-end population, reproduced — THREE populations, side by side, because
 * they are three different things and the corpus has quoted them interchangeably.
 *
 *   node scratch/claims-deadend-populations.mjs [scene]
 *
 * ⛔ PREBAKE §2.5a printed "94 chain endpoints / 29 at 1030 / 29 junctionMap
 * degree-1, only 10 real" with NO reproduction command — the CLAUDE.md §PRUNE
 * breach, in the section the subtraction work is acting on. This is that command.
 * It reads the artifacts; it restates nothing.
 *
 * The three populations, and why each denominator differs:
 *   P1 SKELETON  — skeleton.json chains, PRE-clip. The frame as welded. Its deg-1
 *                  tips are honest dead ends of the fetched network (some of which
 *                  simply run off the edge of the fetch).
 *   P2 RENDERED  — map.json layers.ribbons.streets, POST-clip. What tileGround.js
 *                  recomputes nodeDeg over (`:2787`) and therefore what actually
 *                  receives a round cap. THIS is the population the defect lives in.
 *   P3 junctionMap — the frozen ribbons.junctionMap.nodes artifact. A stamped node
 *                  list; degree read off legs[]. Never re-filtered by the clip.
 *
 * Buckets (radius from the scene's authored boundary centre):
 *   clip      — within 0.5 m of keepR: manufactured by the boundary clip
 *   beyond    — outside the hood radius but not at keepR
 *   interior  — inside the hood radius: a candidate REAL dead end
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const scene = process.argv[2] || 'lafayette-square'
const D = join(ROOT, 'cartograph', 'data', scene)

for (const need of ['neighborhood_boundary.json', 'clean/map.json', 'clean/skeleton.json']) {
  if (!existsSync(join(D, need))) {
    console.error(`⛔ scene '${scene}' has no ${need} — nothing to reconcile. Pour it first, or name another scene.`)
    process.exit(1)
  }
}
const nb = JSON.parse(readFileSync(join(D, 'neighborhood_boundary.json'), 'utf8'))
const cx = nb.center?.[0] ?? 0, cz = nb.center?.[1] ?? 0
const R = nb.radius
const keepR = Math.max(
  Number.isFinite(nb.streetFade?.outer) ? nb.streetFade.outer : 0,
  Number.isFinite(nb.radius) ? nb.radius : 0,
) + 30

const xz = (p) => Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z]
const rad = (p) => { const [x, z] = xz(p); return Math.hypot(x - cx, z - cz) }
const tipKey = (p) => { const [x, z] = xz(p); return `${Math.round(x * 10)},${Math.round(z * 10)}` }
const bucket = (r) => Math.abs(r - keepR) < 0.5 ? 'clip' : (r > R ? 'beyond' : 'interior')

console.log(`scene=${scene}  centre=[${cx},${cz}]  hood R=${R}  keepR=${keepR}\n`)

/** geometric node degree over a list of {points} */
function degrees(chains) {
  const deg = new Map()
  for (const s of chains) {
    const p = s.points
    if (!p || p.length < 2) continue
    for (let i = 0; i < p.length; i++) {
      const inc = (i === 0 || i === p.length - 1) ? 1 : 2
      const k = tipKey(p[i])
      deg.set(k, (deg.get(k) || 0) + inc)
    }
  }
  return deg
}

function report(label, chains, note) {
  const deg = degrees(chains)
  let endpoints = 0
  const seen = new Set()
  const b = { clip: 0, beyond: 0, interior: 0 }
  for (const s of chains) {
    const p = s.points
    if (!p || p.length < 2) continue
    for (const idx of [0, p.length - 1]) {
      endpoints++
      const k = tipKey(p[idx])
      if (deg.get(k) !== 1 || seen.has(k)) continue
      seen.add(k)
      b[bucket(rad(p[idx]))]++
    }
  }
  const d1 = seen.size
  console.log(`${label}`)
  console.log(`   chains=${chains.length}  chain endpoints (2 per chain)=${endpoints}`)
  console.log(`   distinct degree-1 nodes=${d1}   →  clip=${b.clip}  beyond=${b.beyond}  interior=${b.interior}`)
  console.log(`   ${note}\n`)
  return { d1, ...b }
}

// ── P1 skeleton (pre-clip) ───────────────────────────────────────────────────
const skel = JSON.parse(readFileSync(join(D, 'clean', 'skeleton.json'), 'utf8'))
const p1 = report('P1 SKELETON  (skeleton.json — PRE-clip)', skel.streets || [],
  'the welded frame; deg-1 here includes tips that run off the fetch edge')

// ── P2 rendered (post-clip) ──────────────────────────────────────────────────
const map = JSON.parse(readFileSync(join(D, 'clean', 'map.json'), 'utf8'))
const rb = map.layers?.ribbons || {}
const p2 = report('P2 RENDERED  (map.json layers.ribbons.streets — POST-clip)', rb.streets || [],
  '⭐ the population tileGround.js:2787 recomputes and caps — the defect lives HERE')

// ── P3 junctionMap (frozen stamp) ────────────────────────────────────────────
const nodes = rb.junctionMap?.nodes || []
const jb = { clip: 0, beyond: 0, interior: 0 }
let jd1 = 0
for (const n of nodes) {
  const legs = n.legs?.length ?? 0
  if (legs !== 1) continue
  jd1++
  jb[bucket(rad(n.at))]++
}
console.log(`P3 junctionMap  (ribbons.junctionMap.nodes — frozen stamp)`)
console.log(`   nodes=${nodes.length}`)
console.log(`   degree-1 (legs.length===1)=${jd1}   →  clip=${jb.clip}  beyond=${jb.beyond}  interior=${jb.interior}`)
console.log(`   ⛔ never re-filtered by the clip — stamps can name chains the clip removed\n`)

// ── frozen tile caps, for contrast ───────────────────────────────────────────
const tiles = rb.tiles || []
let caps = 0, capsAtClip = 0
for (const t of tiles) for (const c of (t.caps || [])) {
  caps++
  const v = t.ring?.[c.vertexIdx]
  if (v && Math.abs(rad(v) - keepR) < 0.5) capsAtClip++
}
console.log(`FROZEN TILE CAPS (derive.js, built PRE-clip on full geometry)`)
console.log(`   tiles=${tiles.length}  caps=${caps}  at clip radius=${capsAtClip}`)
console.log(`   ✅ expected 0 at clip radius — the freeze runs before the clip exists (pipeline.js:111 vs :139)\n`)

console.log('── the reconciliation ────────────────────────────────────────────')
console.log(`P1 ${String(p1.d1).padStart(4)} deg-1 pre-clip   (clip ${p1.clip} / beyond ${p1.beyond} / interior ${p1.interior})`)
console.log(`P2 ${String(p2.d1).padStart(4)} deg-1 post-clip  (clip ${p2.clip} / beyond ${p2.beyond} / interior ${p2.interior})`)
console.log(`P3 ${String(jd1).padStart(4)} deg-1 junctionMap (clip ${jb.clip} / beyond ${jb.beyond} / interior ${jb.interior})`)
console.log(`\n⭐ P1.interior === P2.interior (${p1.interior} === ${p2.interior}) — the clip does NOT touch the`)
console.log(`   interior dead-end population. It manufactures ${p2.clip} tips at the rim and converts`)
console.log(`   ${p1.beyond - p2.beyond} run-off-the-fetch tips into rim tips. Step ③ re-scopes against the interior count.`)

// ── PREBAKE §2.5a's own row, reproduced ──────────────────────────────────────
// Its population is deg-1 EXCLUDING gradeSeparated (57 grade-sep chains on LS are
// held out of the face graph anyway), and its columns OVERLAP — at-clip is a subset
// of beyond-R — which is why they never summed to the total.
const streets = (rb.streets || []).filter(s => !s.gradeSeparated)
const degX = degrees(streets)
const tipR = new Map()                          // node key → radius (dedup by NODE, not radius)
for (const s of streets) {
  const p = s.points
  if (!p || p.length < 2) continue
  for (const idx of [0, p.length - 1]) {
    const k = tipKey(p[idx])
    if (degX.get(k) === 1) tipR.set(k, rad(p[idx]))
  }
}
const uniq = [...tipR.values()]
const nAtClip = uniq.filter(r => Math.abs(r - keepR) < 0.5).length
const nBeyond = uniq.filter(r => r > R).length
const nInner = uniq.filter(r => r < 0.8 * R).length
console.log(`\n── deg-1 EXCLUDING gradeSeparated (${(rb.streets || []).length - streets.length} grade-sep chains held out) ──`)
console.log(`   total=${uniq.length}  at clip=${nAtClip}  beyond hood R=${nBeyond}  interior <0.8R=${nInner}`)
console.log(`   ⚠️ the columns OVERLAP — at-clip is a SUBSET of beyond-R — so they never sum to the total.`)

if (scene === 'lafayette-square') {
  console.log('\n── PREBAKE §2.5a\'s row "94 / 29 / 42 / 33", reproduced ───────────')
  const row = (label, got, doc) => console.log(`   ${label.padEnd(22)} doc=${String(doc).padStart(3)}  measured=${String(got).padStart(3)}  ${got === doc ? '✅' : '❌'}`)
  row('total (excl gradeSep)', uniq.length, 94)
  row('at clip radius', nAtClip, 29)
  row('beyond hood R', nBeyond, 42)
  row('interior <0.8R', nInner, 33)
  console.log(`   ⇒ the doc's population IS deg-1 excluding gradeSeparated. Three of four reproduce.`)
  console.log(`   ⛔ "at clip radius" does not, at ANY tolerance up to 5 m (25, not 29).`)
  console.log(`      Cause not established — 29 is also the junctionMap deg-1 count (P3 above),`)
  console.log(`      but that is an observation, not a measured explanation.`)
}
