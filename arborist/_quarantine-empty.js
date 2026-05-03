/**
 * Walk every variant's LOD0 GLB; if it has no meshes (degenerate from
 * earlier split bugs / interrupted runs), mark the variant excluded
 * so neither the Arborist UI nor the runtime tries to load it.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { rebuildIndex } from './build-index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TREES_DIR = path.resolve(__dirname, '..', 'public', 'trees')

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const dirs = (await fs.readdir(TREES_DIR, { withFileTypes: true }))
  .filter(e => e.isDirectory()).map(e => e.name)

let touched = 0, marked = 0
for (const d of dirs) {
  const mp = path.join(TREES_DIR, d, 'manifest.json')
  let m
  try { m = JSON.parse(await fs.readFile(mp, 'utf8')) } catch { continue }
  let dirty = false
  for (const v of m.variants ?? []) {
    if (v.excluded === true) continue
    const lod0 = v.skeletons?.lod0
    if (!lod0) continue
    const p = path.join(TREES_DIR, d, lod0)
    let ok = false
    try {
      const doc = await io.read(p)
      ok = doc.getRoot().listMeshes().length > 0
    } catch {}
    if (!ok) {
      v.excluded = true
      v.excludedReason = 'empty-or-unreadable'
      marked++; dirty = true
    }
  }
  if (dirty) {
    await fs.writeFile(mp, JSON.stringify(m, null, 2))
    touched++
  }
}
console.log(`[quarantine] ${marked} variants marked excluded across ${touched} manifests`)

const idx = await rebuildIndex()
console.log(`[quarantine] rebuilt index.json (${idx.variantCount} live variants)`)
