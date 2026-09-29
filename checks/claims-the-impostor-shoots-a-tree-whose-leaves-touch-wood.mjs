// claims-the-impostor-shoots-a-tree-whose-leaves-touch-wood.mjs
//   DO THE LEAVES IN THE TREE THE IMPOSTOR PHOTOGRAPHS HANG ON WOOD?
//
// Every tree on the map is an impostor, and an impostor is a photograph of one baked GLB.
// Two parts, each read off the source:
//   ① WHICH GLB: the Grove capture pool's LOD is read out of `Grove.jsx`, never restated here.
//   ② WHAT IT HOLDS: in every baked town, for every species GLB at that LOD, each leaf
//      (a connected component of an `atlasKind: 'leaf'` primitive) is attached at its vertex
//      nearest the wood; the distance from there to the nearest bark sample is its GAP.
//      A species FAILS when more than MAX_FLOATING of its leaves have a gap over FLOAT_M.
//
// Why: lod1 crushes the bark and keeps the leaf cards, so a card shot from lod1 showed leaves
// hanging in air (oak_white, 2026-09-28: median gap 0.07 m at lod0, 0.61 m at lod1). A leaf pack
// whose picture drops the stalk the vendor card carried (a compound leaf re-skinned as a simple
// one) fails here too, at any LOD — that is the same thing on screen, and it is a real finding.
//
// ▶ MUTATION-TEST IT: in Grove.jsx's capture pool, `bakedGlbRel(t.species, t.variantId, 'lod0')`
//   → `'lod1'`  ⇒ ② goes RED on the species with crushed bark. Put it back.
//
//   node checks/claims-the-impostor-shoots-a-tree-whose-leaves-touch-wood.mjs [scene…]
// Read-only. Exit 1 = leaves float in a shipped capture source; exit 2 = could not check.
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { ROOT, scenes } from './_scenes.mjs'

const FLOAT_M = 0.25        // a leaf more than this from any wood reads as floating
const MAX_FLOATING = 0.10   // share of a species' leaves allowed over FLOAT_M
const CELL = FLOAT_M        // grid cell = threshold, so a 3×3×3 search is exact up to FLOAT_M

// ① — read the LOD out of the capture pool.
const grove = readFileSync(join(ROOT, 'src/arborist/Grove.jsx'), 'utf8')
const m = grove.match(/const glbUrl = slabUrl\(activeLookId, bakedGlbRel\(t\.species, t\.variantId, '([a-z0-9]+)'\)\)/)
if (!m) { console.error('⛔ NOT CHECKED — cannot find the capture pool\'s bakedGlbRel(…) LOD in Grove.jsx. The pin drifted; re-pin it.'); process.exit(2) }
const LOD = m[1]
console.log(`① the capture pool shoots ${LOD}`)

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

function worldPositions(prim, node) {
  const p = prim.getAttribute('POSITION').getArray()
  const mtx = node.getWorldMatrix()
  const out = new Float32Array(p.length)
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2]
    out[i]     = mtx[0] * x + mtx[4] * y + mtx[8] * z + mtx[12]
    out[i + 1] = mtx[1] * x + mtx[5] * y + mtx[9] * z + mtx[13]
    out[i + 2] = mtx[2] * x + mtx[6] * y + mtx[10] * z + mtx[14]
  }
  return out
}
const key = (x, y, z) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`

async function measure(file) {
  const doc = await io.read(file)
  const bark = new Map() // cell → flat [x,y,z,…]
  const push = (x, y, z) => { const k = key(x, y, z); let a = bark.get(k); if (!a) bark.set(k, a = []); a.push(x, y, z) }
  const leaves = []
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue
    for (const prim of mesh.listPrimitives()) {
      const kind = prim.getExtras()?.atlasKind
      const idx = prim.getIndices()?.getArray()
      if (!idx) continue
      const P = worldPositions(prim, node)
      if (kind === 'bark') {
        // vertices + triangle centroids + edge midpoints: a long crushed triangle still has wood
        for (let v = 0; v < P.length; v += 3) push(P[v], P[v + 1], P[v + 2])
        for (let t = 0; t + 2 < idx.length; t += 3) {
          const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3
          push((P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3)
          for (const [i, j] of [[a, b], [b, c], [c, a]]) push((P[i] + P[j]) / 2, (P[i + 1] + P[j + 1]) / 2, (P[i + 2] + P[j + 2]) / 2)
        }
      } else if (kind === 'leaf') leaves.push({ P, idx })
    }
  }
  if (!bark.size || !leaves.length) return { none: !bark.size ? 'no bark primitive' : 'no leaf primitive' }
  const nearest = (x, y, z) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), cz = Math.floor(z / CELL)
    let best = Infinity
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const a = bark.get(`${cx + i},${cy + j},${cz + k}`); if (!a) continue
      for (let n = 0; n < a.length; n += 3) {
        const d = (a[n] - x) ** 2 + (a[n + 1] - y) ** 2 + (a[n + 2] - z) ** 2
        if (d < best) best = d
      }
    }
    return Math.sqrt(best) // Infinity ⇒ further than one cell: floating
  }
  const gaps = []
  for (const { P, idx } of leaves) {
    const vc = P.length / 3
    const par = new Int32Array(vc); for (let i = 0; i < vc; i++) par[i] = i
    const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x] } return x }
    for (let t = 0; t + 2 < idx.length; t += 3) {
      for (const [a, b] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]]]) { const ra = find(a), rb = find(b); if (ra !== rb) par[ra] = rb }
    }
    const gap = new Map()
    for (let v = 0; v < vc; v++) {
      const r = find(v), g = gap.get(r) ?? Infinity
      if (g === 0) continue
      const d = nearest(P[v * 3], P[v * 3 + 1], P[v * 3 + 2])
      if (d < g) gap.set(r, d)
    }
    for (const g of gap.values()) gaps.push(g)
  }
  gaps.sort((a, b) => a - b)
  const floating = gaps.filter(g => g > FLOAT_M).length / gaps.length
  return { leaves: gaps.length, p50: gaps[gaps.length >> 1], floating }
}

let red = 0, measured = 0
console.log(`② every leaf within ${FLOAT_M} m of wood (≤ ${MAX_FLOATING * 100}% may exceed it)`)
for (const scene of scenes('public/baked/<scene>/trees-atlas.json')) {
  const dir = join(ROOT, 'public/baked', scene, 'trees')
  if (!existsSync(dir)) { console.log(`   · ${scene}: NOT CHECKED — no baked trees/`); continue }
  // A species directory is one that holds skeleton GLBs; the capture page folders beside them are not.
  const species = readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && readdirSync(join(dir, d.name)).some(f => /^skeleton-.*\.glb$/.test(f)))
    .map(d => d.name).sort()
  for (const sp of species) {
    const files = readdirSync(join(dir, sp)).filter(f => f.endsWith(`-${LOD}.glb`))
    if (!files.length) { red++; console.log(`   ⛔ ${scene}/${sp}: no ${LOD} GLB — the capture pool has nothing to shoot`); continue }
    for (const f of files) {
      const r = await measure(join(dir, sp, f))
      const tag = `${scene}/${sp}/${f}`
      if (r.none) { console.log(`   · ${tag}: ${r.none} — nothing to measure`); continue }
      measured++
      const line = `${tag}: ${r.leaves} leaves · median gap ${Number.isFinite(r.p50) ? r.p50.toFixed(3) + ' m' : `> ${FLOAT_M} m`} · ${(r.floating * 100).toFixed(1)}% over ${FLOAT_M} m`
      if (r.floating > MAX_FLOATING) { red++; console.log(`   ⛔ ${line}`) } else console.log(`   ✅ ${line}`)
    }
  }
}
if (!measured) { console.error('⛔ NOT CHECKED — no GLB was measurable.'); process.exit(2) }
console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ PASS')
process.exit(red ? 1 : 0)
