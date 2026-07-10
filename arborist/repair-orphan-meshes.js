/**
 * repair-orphan-meshes.js — re-attach orphaned meshes to the scene in the chassis
 * that already shipped broken (bundle-decomposition bug; see glb-scene-utils.js).
 *
 * Non-destructive: only re-parents the mesh node into the Scene; geometry, meta,
 * atlasKind, everything else is untouched. Idempotent — a clean chassis reports 0
 * fixed and is left byte-alone (we only rewrite files we actually changed).
 * survey-deleaf.js now attaches at emit, so a re-run won't reproduce the orphans;
 * this heals the 47 already on disk (incl. orphans whose vendor source is gone).
 *
 * Run:  node arborist/repair-orphan-meshes.js
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { readdir } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { attachOrphansToScene } from './glb-scene-utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CHASSIS_DIR = path.join(__dirname, '..', 'public/trees/_chassis')
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

async function main() {
  const files = (await readdir(CHASSIS_DIR)).filter(f => f.endsWith('.glb'))
  let repaired = 0
  for (const f of files) {
    const p = path.join(CHASSIS_DIR, f)
    const doc = await io.read(p)
    const n = attachOrphansToScene(doc)
    if (n > 0) { await io.write(p, doc); repaired++; console.log(`  repaired ${n} orphan node(s)  ${f.replace('.glb', '')}`) }
  }
  console.log(`\n[repair-orphans] scanned ${files.length} · repaired ${repaired}`)
}

main()
