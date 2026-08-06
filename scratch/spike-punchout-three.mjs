// spike-punchout-three.mjs — the three tests that decide the punch-out.
//
//   1. RESIDUE   — which rings still repeat a vertex, and which vertices still
//                  land on a centreline node. (Spike v1: 4 rings, 3 vertices.)
//   2. LOCALITY  — ⭐ THE ONE THAT DECIDES THE ARCHITECTURE. Change ONE street's
//                  width. How many block polygons move? If ~2, a block is an
//                  independently addressable object and block-local edit/re-freeze
//                  is real (SURVEY §4.1, D6d). If ~all, something couples them.
//   3. RENDER    — a PNG of each substrate for the eye (R4: the gate).
//
// Read-only. No pour, no bake, no artifact writes. PNGs land in scratch/.
import fs from 'fs'
import sharp from 'sharp'

const scene = 'lafayette-square'
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const design = JSON.parse(fs.readFileSync(`public/looks/${scene}/design.json`, 'utf8'))
const nb = JSON.parse(fs.readFileSync(`cartograph/data/${scene}/neighborhood_boundary.json`, 'utf8'))

const sc0 = ((nb?.streetFade?.outer ?? nb.radius) + 50) / nb.radius
const [cx, cz] = nb.center
const stencil = nb.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])

const { buildBlockGeometryV2 } = await import('../src/lib/buildBlockGeometryV2.js')
const run = (rb) => {
  const q = console.log; console.log = () => {}
  const v2 = buildBlockGeometryV2(rb, {
    stencil, blockCustoms: design.blockCustoms || null,
    curbWidth: design.curbWidth ?? 0.15, blockLandUse: design.blockLandUse,
    __debugRings: true,
  })
  console.log = q
  return v2.__blockRings || []
}

const K = (p) => p[0].toFixed(2) + ',' + p[1].toFixed(2)
const ringHash = (r) => r.map(K).join(';')
const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * r[i][1] - r[i][0] * r[j][1]); return Math.abs(a / 2) }
const centroid = (r) => { let x = 0, y = 0; for (const p of r) { x += p[0]; y += p[1] } return [x / r.length, y / r.length] }

const base = run(ribbons)
const tiles = (ribbons.tiles || []).map(t => t.ring)

// ── centreline nodes ───────────────────────────────────────────────────────
const nodeSet = new Set()
{
  const seen = new Map()
  for (const s of ribbons.streets || []) { if (s.gradeSeparated) continue
    for (const [i, p] of s.points.entries()) { const k = K(p)
      const e = seen.get(k) || { mid: 0, end: 0 }; (i > 0 && i < s.points.length - 1) ? e.mid++ : e.end++; seen.set(k, e) } }
  for (const [k, e] of seen) if (e.mid * 2 + e.end >= 3) nodeSet.add(k)
}

// ═══ 1. RESIDUE ═══
console.log('═══ 1. RESIDUE — what is still impure in the punch-out ═══')
let n = 0
for (const [i, r] of base.entries()) {
  if (!r || r.length < 3) continue
  const seen = new Set(); const dups = []
  for (const p of r) { const k = K(p); if (seen.has(k)) dups.push(k); seen.add(k) }
  const hits = r.filter(p => nodeSet.has(K(p))).map(K)
  if (dups.length || hits.length) {
    n++
    console.log(`  ring[${i}]  verts=${r.length}  area=${area(r).toFixed(0)} m²`)
    if (dups.length) console.log(`      repeated vertex ×${dups.length}: ${[...new Set(dups)].slice(0, 3).join('  ')}`)
    if (hits.length) console.log(`      ⭐ ON A CENTRELINE NODE ×${hits.length}: ${hits.join('  ')}`)
  }
}
if (!n) console.log('  ✅ none — every ring is simple and chain-free')

// ═══ 2. LOCALITY ═══
console.log('\n═══ 2. LOCALITY — change ONE street width, how many blocks move? ═══')
const target = 'carroll-street-1'
const clone = JSON.parse(JSON.stringify(ribbons))
const s = clone.streets.find(x => x.skelId === target)
const before = s.measure.left.pavementHW
s.measure.left.pavementHW = before + 1.0
console.log(`  nudged ${target}.measure.left.pavementHW ${before.toFixed(2)} → ${(before + 1).toFixed(2)} m`)

const after = run(clone)
const hb = new Map(base.map((r, i) => [ringHash(r), i]))
const ha = new Map(after.map((r, i) => [ringHash(r), i]))
let same = 0
for (const h of hb.keys()) if (ha.has(h)) same++
const movedBase = base.filter(r => !ha.has(ringHash(r)))
const movedAfter = after.filter(r => !hb.has(ringHash(r)))
console.log(`  blocks before=${base.length}  after=${after.length}  byte-identical=${same}`)
console.log(`  ⭐ blocks that MOVED: ${movedBase.length}  (${(100 * movedBase.length / base.length).toFixed(0)}% of the map)`)
if (movedBase.length) {
  console.log('     moved block centroids + areas:')
  movedBase.slice(0, 10).forEach(r => console.log(`       [${centroid(r).map(v => v.toFixed(0))}]  ${area(r).toFixed(0)} m²`))
}
console.log(movedBase.length <= 4
  ? '  ✅ BLOCK-LOCAL — a width edit touches only its own flanking blocks'
  : '  ⛔ NOT LOCAL — a single width edit perturbs the map broadly; find the coupling')

// ═══ 3. RENDER ═══
console.log('\n═══ 3. RENDER — for the eye ═══')
const xs = stencil.map(p => p[0]), ys = stencil.map(p => p[1])
const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys)
const px = 1400, scl = px / Math.max(maxx - minx, maxy - miny)
const X = (x) => ((x - minx) * scl).toFixed(1), Y = (y) => ((y - miny) * scl).toFixed(1)
const draw = async (rings, tag, title) => {
  let sv = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#161616">`
  const path = (rr, fill) => { let d = ''; for (const r of rr) { if (!r || r.length < 3) continue; d += r.map((p, i) => (i ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ') + ' Z ' } if (d) sv += `<path d="${d}" fill="${fill}" stroke="#000" stroke-width="0.6" stroke-opacity="0.6"/>` }
  path([stencil], '#3a3a3a')        // everything = road surface
  path(rings, '#6aa84f')            // blocks punched out of it
  sv += `<text x="16" y="34" fill="#ffd" font-family="monospace" font-size="22">${title}</text></svg>`
  fs.writeFileSync(`scratch/${tag}.svg`, sv)
  await sharp(Buffer.from(sv)).png().toFile(`scratch/${tag}.png`)
  console.log(`  wrote scratch/${tag}.png`)
}
await draw(base, 'spike-punchout-blocks', `PUNCH-OUT — ${base.length} blocks (stencil − stroked roads)`)
await draw(tiles, 'spike-facewalk-tiles', `FACE WALK — ${tiles.length} tiles (faces of the centreline graph)`)
console.log('\n⚠️ Substrate + a proxy render only. The operator eye on the real app is the gate (R4).')
