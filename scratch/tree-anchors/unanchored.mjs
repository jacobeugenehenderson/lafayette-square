// unanchored.mjs — HOW MANY PLACED TREES REACH treeGroundRaw WITHOUT A BAKED groundRaw (Boz, 2026-10-29), per town on a slab.
// The player's own join (InstancedTrees.jsx: placementKey over the placements, the terrain identity, the length; all-or-nothing):
// a town whose anchors fail any gate seats EVERY tree on the field (elevation.js#treeGroundRaw's getElevationRaw fallback).
// Read-only. ▶ node scratch/tree-anchors/unanchored.mjs [--slab=<dir holding <town>/>]
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { terrainIdentity } from '../../src/lib/terrainCommon.js'
const slab = process.argv.find(a => a.startsWith('--slab='))?.slice(7) ?? 'public/baked'
for (const t of readdirSync(slab).sort()) {
  const p = (f) => join(slab, t, f)
  if (!existsSync(p('trees.json'))) { console.log(`${t.padEnd(18)} no trees.json`); continue }
  const inst = JSON.parse(readFileSync(p('trees.json'), 'utf8')).instances || []
  const doc = existsSync(p('tree-anchors.json')) ? JSON.parse(readFileSync(p('tree-anchors.json'), 'utf8')) : null
  let why = null
  if (!Array.isArray(doc?.anchors)) why = 'no tree-anchors.json'
  else {
    if (doc.placementKey) { let h = 2166136261 >>> 0
      for (const x of inst) { const k = `${x.x.toFixed(3)},${x.z.toFixed(3)}`; for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 } }
      if (h.toString(16).padStart(8, '0') !== doc.placementKey) why = 'placementKey differs' }
    if (!why && doc.terrain && existsSync(p('terrain.json'))) {
      const tj = JSON.parse(readFileSync(p('terrain.json'), 'utf8')), b = readFileSync(p('terrain.bin'))
      const live = terrainIdentity({ ...tj, data: new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) })
      if (doc.terrain.key !== live) why = `terrain ${doc.terrain.key} ≠ ${live}` }
    if (!why && doc.anchors.length !== inst.length) why = `length ${doc.anchors.length} ≠ ${inst.length}`
  }
  const lacking = why ? inst.length : inst.filter((_, i) => typeof doc.anchors[i] !== 'number').length
  console.log(`${t.padEnd(18)} ${inst.length} placed · ${lacking} without groundRaw${why ? ` (${why})` : ''}`)
}
