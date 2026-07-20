#!/usr/bin/env node
/**
 * join-citymodel-to-osm.mjs — MARRY the acquired city LOD2 meshes to our own
 * building identity, so the imported geometry is DYNAMIC rather than scenery.
 *
 * The vendor meshes carry the city's own numbering ("ID 0"…), not `osm-<id>`.
 * Everything that makes a building alive in this product — click → place card,
 * neon colour, hover, listing joins — keys off `osm-<id>`. So each LOD2 solid
 * has to be matched to the OSM footprint it stands on.
 *
 * METHOD: point-in-polygon of the LOD2 solid's base centroid against the baked
 * footprints in `buildings.json`/`.bin` (the same index SlabBuildings publishes,
 * so the numeric ids line up with `aBuildingId`). Centroid-in-footprint is the
 * join we already use for the Overture content layer — same technique, and it
 * fails the same way, so failures are legible.
 *
 * Robustness: a bbox centre can fall OUTSIDE an L-shaped or courtyard building,
 * so a miss retries against sampled base vertices before giving up. Unmatched
 * meshes are reported, NOT silently dropped — an unmatched solid still renders,
 * it just isn't clickable, and we want to see how many those are.
 *
 * Output: `<tile>.ids.json` — { meshName: "osm-<id>" | null }, keyed by NAME not
 * traversal order, so the runtime can't drift out of sync with this script.
 *
 *   node scratch/join-citymodel-to-osm.mjs
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

const BAKED = 'public/baked/ksi-y-m-yn'
const CM = `${BAKED}/citymodel`

// ── 1. the baked footprints (identical parse to SlabBuildings) ──────────────
const manifest = JSON.parse(readFileSync(`${BAKED}/buildings.json`, 'utf8'))
const binBuf = readFileSync(`${BAKED}/${manifest.bin}`)
const bin = binBuf.buffer.slice(binBuf.byteOffset, binBuf.byteOffset + binBuf.byteLength)
const fpView = new Float32Array(bin, manifest.footprintByteOffset, manifest.footprintPointCount * 2)

const buildings = manifest.buildings.map((b, num) => {
  const [s, c] = b.footprintRange
  const ring = new Array(c)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < c; i++) {
    const x = fpView[(s + i) * 2], z = fpView[(s + i) * 2 + 1]
    ring[i] = [x, z]
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }
  return { num, id: b.id, ring, minX, maxX, minZ, maxZ }
})
console.log(`  baked footprints: ${buildings.length}`)

// Uniform grid so we don't do 1066 × 1819 polygon tests per tile.
const CELL = 50
const grid = new Map()
const key = (gx, gz) => `${gx},${gz}`
for (const b of buildings) {
  for (let gx = Math.floor(b.minX / CELL); gx <= Math.floor(b.maxX / CELL); gx++)
    for (let gz = Math.floor(b.minZ / CELL); gz <= Math.floor(b.maxZ / CELL); gz++) {
      const k = key(gx, gz)
      if (!grid.has(k)) grid.set(k, [])
      grid.get(k).push(b)
    }
}

function inRing(x, z, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}
function hit(x, z) {
  const cands = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)))
  if (!cands) return null
  for (const b of cands) {
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue
    if (inRing(x, z, b.ring)) return b
  }
  return null
}

// Point-in-polygon alone loses CONCAVE buildings: an L-shape or a courtyard block
// puts its own centroid outside itself. Measured on tile O53 that was 76 solids
// (7.1%) silently unmatched — including osm-186401321, which carries a shipped
// place card (Jadłodajnia Babci Helci). So when the point test fails, fall back to
// "which baked footprint does this solid most OVERLAP", which is concavity-proof.
// Threshold keeps a shed that merely abuts a building from stealing its identity.
const OVERLAP_MIN = 0.35
function bestOverlap(x0, z0, x1, z1) {
  const a = (x1 - x0) * (z1 - z0)
  if (a <= 0) return null
  let best = 0, hitB = null
  for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
    for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
      for (const b of grid.get(key(gx, gz)) || []) {
        const ix = Math.min(x1, b.maxX) - Math.max(x0, b.minX)
        const iz = Math.min(z1, b.maxZ) - Math.max(z0, b.minZ)
        if (ix <= 0 || iz <= 0) continue
        const v = (ix * iz) / a
        if (v > best) { best = v; hitB = b }
      }
    }
  return best >= OVERLAP_MIN ? hitB : null
}

// ── 2. each tile ────────────────────────────────────────────────────────────
const cmManifest = JSON.parse(readFileSync(`${CM}/citymodel.json`, 'utf8'))
const loader = new GLTFLoader()
let grand = { total: 0, matched: 0 }

for (const tile of cmManifest.tiles) {
  const path = join(CM, tile.asset)
  if (!existsSync(path)) { console.log(`  [${tile.id}] asset missing — skip`); continue }
  const b = readFileSync(path)
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
  const O = tile.origin || { x: 0, z: 0 }

  await new Promise((resolve, reject) => {
    loader.parse(ab, '', (gltf) => {
      gltf.scene.updateMatrixWorld(true)
      const out = {}
      let total = 0, matched = 0, viaVertex = 0, viaOverlap = 0
      const unmatchedSample = []
      gltf.scene.traverse((o) => {
        if (!o.isMesh || !o.geometry) return
        total++
        const g = o.geometry.clone()
        g.applyMatrix4(o.matrixWorld)
        g.computeBoundingBox()
        const bb = g.boundingBox
        const cx = (bb.min.x + bb.max.x) / 2 + O.x
        const cz = (bb.min.z + bb.max.z) / 2 + O.z
        let m = hit(cx, cz)
        if (!m) {
          // Centroid fell outside (L-shape / courtyard) — try base vertices.
          const pos = g.attributes.position
          const baseY = bb.min.y + 0.5
          for (let i = 0; i < pos.count && !m; i++) {
            if (pos.getY(i) > baseY) continue
            m = hit(pos.getX(i) + O.x, pos.getZ(i) + O.z)
          }
          if (m) viaVertex++
        }
        if (!m) {
          m = bestOverlap(bb.min.x + O.x, bb.min.z + O.z, bb.max.x + O.x, bb.max.z + O.z)
          if (m) viaOverlap++
        }
        const name = o.name || `mesh_${total - 1}`
        out[name] = m ? m.id : null
        if (m) matched++
        else if (unmatchedSample.length < 5) unmatchedSample.push({ name, x: Math.round(cx), z: Math.round(cz) })
      })
      writeFileSync(join(CM, `${tile.id}_buildings.ids.json`), JSON.stringify({
        _doc: 'LOD2 mesh name → our osm-<id>. Built by scratch/join-citymodel-to-osm.mjs (centroid-in-footprint). null = no OSM footprint under it: renders, but not clickable.',
        tile: tile.id, total, matched, unmatched: total - matched, matchedViaVertexFallback: viaVertex, matchedViaOverlapFallback: viaOverlap,
        ids: out,
      }, null, 1))
      const pct = (100 * matched / total).toFixed(1)
      console.log(`  [${tile.id}] ${matched}/${total} matched (${pct}%)  [+${viaVertex} vertex, +${viaOverlap} overlap]`)
      if (unmatchedSample.length) console.log(`        unmatched e.g. ${unmatchedSample.map(u => `${u.name}@${u.x},${u.z}`).join('  ')}`)
      grand.total += total; grand.matched += matched
      resolve()
    }, reject)
  })
}
console.log(`\n  TOTAL: ${grand.matched}/${grand.total} LOD2 solids carry an osm id (${(100 * grand.matched / grand.total).toFixed(1)}%)`)
