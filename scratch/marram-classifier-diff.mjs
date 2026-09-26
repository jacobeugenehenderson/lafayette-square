// marram-classifier-diff.mjs — WHAT WOULD CHANGE if the wood/leaf classifier read
// `Cap_*` materials as WOOD and `*needle*` materials as LEAF?
// ▶ node scratch/marram-classifier-diff.mjs
// Classifies every primitive of every public/trees/*/skeleton-*-lod0.glb with the CURRENT
// atlas-kind-classifier, then with the two proposed name rules applied only where the
// current answer is AMBIGUOUS (the proposal's whole scope), and lists every primitive whose
// class would change — flagged when its species is a PUBLISHED variant. Writes nothing.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { classifyPrim, buildMeshAncestorNames } from '../arborist/atlas-kind-classifier.js'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const published = new Set(JSON.parse(readFileSync('public/trees/index.json', 'utf8')).variants.map(v => v.species))
const proposed = (c) => {
  if (c.cls !== 'AMBIGUOUS') return c.cls
  const n = c.matName.toLowerCase()
  if (/(^|_)caps?(_|$)/.test(n)) return 'WOOD'
  if (/needle/.test(n)) return 'LEAF'
  return 'AMBIGUOUS'
}
let files = 0, prims = 0
const changes = []
for (const dir of readdirSync('public/trees', { withFileTypes: true })) {
  if (!dir.isDirectory() || dir.name.startsWith('_')) continue
  for (const f of readdirSync(path.join('public/trees', dir.name)).filter(f => /^skeleton-\d+-lod0\.glb$/.test(f))) {
    const p = path.join('public/trees', dir.name, f)
    const doc = await io.read(p); files++
    const anc = buildMeshAncestorNames(doc)
    for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
      prims++
      const c = classifyPrim(prim, anc.get(mesh) || [])
      const after = proposed(c)
      if (after !== c.cls) changes.push({ species: dir.name, f, mat: c.matName, before: c.cls, after, pub: published.has(dir.name) })
    }
  }
}
console.log(`${files} GLBs · ${prims} primitives · ${changes.length} would change class`)
const pub = changes.filter(c => c.pub)
console.log(`  in PUBLISHED species: ${pub.length}`)
for (const c of pub) console.log(`    ⚠️ ${c.species}/${c.f}  ${c.mat}  ${c.before} → ${c.after}`)
const by = {}; for (const c of changes.filter(c => !c.pub)) by[c.species] = (by[c.species] || 0) + 1
console.log('  unpublished species affected:', Object.entries(by).map(([k, v]) => `${k}(${v})`).join(' '))
