// Street furniture ingest — BRIEF-street-furniture §The work step 1.
//
//   node street-furniture/ingest.mjs <pack-dir> [--only=<id,...>]
//
// Reads the pack's obj.zip (OBJ + MTL, flat Kd colours, no textures) and Icons.zip, and writes into
// street-furniture/out/ (gitignored there: the pack's derivatives are not committed until served, per
// the licence ruling):
//   <id>.lod0.glb, <id>.r0.5.glb, <id>.r0.25.glb · icons/<id>.png · catalog.json (what was MEASURED)
// What is AUTHORED lives in street-furniture/tags.json, and src/street-furniture/contract.js decides
// whether an asset is ready.
//
// ⭐ Each material is split into its PIECES (connected by shared position); each vertex carries its piece index (_PIECE), named
//    `<SGn>#<k>`, numbered in a fixed order (by centroid), so the same file always gives the same names.
//    Lit parts are tagged by piece, because one material can cover several parts (the pack's SG3 is the
//    amber lens AND the walk heads AND the push button on some models).
// ⛔ The unit is read from the OBJ header; a file that doesn't state one is refused.
import { execFileSync } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, copyFileSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import { Document, NodeIO } from '@gltf-transform/core'
import { weld, dedup, prune, simplify } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'out')
const [packDir, ...flags] = process.argv.slice(2)
if (!packDir) throw new Error('usage: ingest.mjs <pack-dir> [--only=a,b]')
const only = flags.find(f => f.startsWith('--only='))?.slice(7).split(',')

const UNIT_TO_M = { centimeters: 0.01, millimeters: 0.001, meters: 1, inches: 0.0254, feet: 0.3048 }
// Decimations offered for the triangle budget. Jacob picks one per asset; these are choices, not a budget.
const LOD_RATIOS = [0.5, 0.25]

mkdirSync(join(OUT, 'icons'), { recursive: true })
writeFileSync(join(OUT, '.gitignore'), '*\n')
const SRC = join(OUT, '_src')
for (const z of ['obj.zip', 'Icons.zip']) {
  const zip = join(packDir, z)
  if (!existsSync(zip)) throw new Error(`${zip} not found`)
  execFileSync('unzip', ['-q', '-o', zip, '-d', SRC])
}
const objDir = join(SRC, 'obj')
const normId = s => s.replace(/\s+/g, '')

function parseMtl(path) {
  const mats = {}
  let cur = null
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const [k, ...r] = line.trim().split(/\s+/)
    if (k === 'newmtl') mats[cur = r.join(' ')] = {}
    else if (k === 'Kd' && cur) mats[cur].kd = r.map(Number)
  }
  return mats
}

function parseObj(path) {
  const text = readFileSync(path, 'utf8')
  const unitM = text.slice(0, 400).match(/uses (\w+) as units/)
  if (!unitM || !(unitM[1] in UNIT_TO_M)) throw new Error(`${basename(path)}: no recognised unit in the header — refusing to guess`)
  const v = [], vn = [], groups = new Map()
  let mtllib = null, mat = null
  for (const line of text.split('\n')) {
    const sp = line.indexOf(' ')
    const k = line.slice(0, sp), r = line.slice(sp + 1).trim()
    if (k === 'v') v.push(r.split(/\s+/).map(Number))
    else if (k === 'vn') vn.push(r.split(/\s+/).map(Number))
    else if (k === 'usemtl') { mat = r; if (!groups.has(mat)) groups.set(mat, []) }
    else if (k === 'mtllib') mtllib = r
    else if (k === 'f') {
      if (mat === null) throw new Error(`${basename(path)}: a face before any usemtl`)
      const corners = r.split(/\s+/).map(c => { const [a, , n] = c.split('/'); return [+a - 1, n ? +n - 1 : -1] })
      for (let i = 1; i + 1 < corners.length; i++) groups.get(mat).push(corners[0], corners[i], corners[i + 1])
    }
  }
  return { unit: unitM[1], scale: UNIT_TO_M[unitM[1]], v, vn, groups, mtllib }
}

// Split one material's triangles into pieces connected by shared (quantised) position, in a fixed order.
function splitPieces(corners, v) {
  const key = i => v[i].map(c => Math.round(c * 100)).join(',')
  const parent = new Map()
  const find = a => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a) } return a }
  for (let t = 0; t < corners.length; t += 3) {
    const ks = [0, 1, 2].map(j => key(corners[t + j][0]))
    for (const k of ks) if (!parent.has(k)) parent.set(k, k)
    parent.set(find(ks[1]), find(ks[0])); parent.set(find(ks[2]), find(ks[0]))
  }
  const byRoot = new Map()
  for (let t = 0; t < corners.length; t += 3) {
    const r = find(key(corners[t][0]))
    if (!byRoot.has(r)) byRoot.set(r, [])
    byRoot.get(r).push(corners[t], corners[t + 1], corners[t + 2])
  }
  const centroid = cs => [0, 1, 2].map(a => cs.reduce((s, [vi]) => s + v[vi][a], 0) / cs.length)
  return [...byRoot.values()]
    .map(cs => ({ cs, c: centroid(cs).map(x => Math.round(x)) }))
    .sort((a, b) => a.c[1] - b.c[1] || a.c[0] - b.c[0] || a.c[2] - b.c[2] || a.cs.length - b.cs.length)
    .map(p => p.cs)
}

function triCount(doc) {
  let n = 0
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3
  return n
}

function buildDoc(id, o, mtl) {
  const doc = new Document()
  const buf = doc.createBuffer()
  const scene = doc.createScene()
  const mesh = doc.createMesh(id)
  const pieces = []
  for (const [matName, corners] of o.groups) {
    if (!corners.length) continue
    const kd = mtl[matName]?.kd
    if (!kd) throw new Error(`${id}: material ${matName} has no Kd in its .mtl`)
    const sg = matName.match(/(SG\d*)$/)?.[1]
    if (!sg) throw new Error(`${id}: material ${matName} has no SGn suffix to name its pieces by`)
    const material = doc.createMaterial(sg).setBaseColorFactor([...kd, 1]).setRoughnessFactor(0.7).setMetallicFactor(0)
    const split = splitPieces(corners, o.v)
    const n = split.reduce((s, cs) => s + cs.length, 0)
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), pid = new Float32Array(n)
    let i = 0
    split.forEach((cs, k) => {
      for (const [vi, ni] of cs) {
        const p = o.v[vi]; pos.set([p[0] * o.scale, p[1] * o.scale, p[2] * o.scale], i * 3)
        if (ni >= 0) nor.set(o.vn[ni], i * 3)
        pid[i++] = pieces.length
      }
      pieces.push({ index: pieces.length, name: `${sg}#${k}`, material: sg, kd, tris: cs.length / 3 })
    })
    // One primitive per material, each vertex carrying its piece's index (_PIECE): simplify works across
    // the whole material, and a piece never shares a vertex with another, so the index survives decimation.
    const prim = doc.createPrimitive().setMaterial(material)
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buf))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nor).setBuffer(buf))
      .setAttribute('_PIECE', doc.createAccessor().setType('SCALAR').setArray(pid).setBuffer(buf))
    mesh.addPrimitive(prim)
  }
  scene.addChild(doc.createNode(id).setMesh(mesh))
  return { doc, pieces }
}

function bbox(o) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (const p of o.v) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i] * o.scale); hi[i] = Math.max(hi[i], p[i] * o.scale) }
  return { min: lo.map(x => +x.toFixed(3)), max: hi.map(x => +x.toFixed(3)) }
}

await MeshoptSimplifier.ready
const io = new NodeIO()
const prev = existsSync(join(OUT, 'catalog.json')) ? JSON.parse(readFileSync(join(OUT, 'catalog.json'), 'utf8')).assets : []
const catalog = new Map(prev.map(a => [a.id, a]))
for (const f of readdirSync(objDir).filter(f => f.endsWith('.obj')).sort()) {
  const id = normId(basename(f, '.obj'))
  if (only && !only.includes(id)) continue
  const o = parseObj(join(objDir, f))
  const mtlPath = join(objDir, o.mtllib ?? '')
  if (!o.mtllib || !existsSync(mtlPath)) throw new Error(`${id}: mtllib ${o.mtllib} not found`)
  const { doc, pieces } = buildDoc(id, o, parseMtl(mtlPath))
  await doc.transform(weld(), dedup(), prune())
  await io.write(join(OUT, `${id}.lod0.glb`), doc)
  const lods = [{ key: 'lod0', tris: triCount(doc) }]
  for (const ratio of LOD_RATIOS) {
    const d = await io.read(join(OUT, `${id}.lod0.glb`))
    await d.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.001 }), prune())
    await io.write(join(OUT, `${id}.r${ratio}.glb`), d)
    lods.push({ key: `r${ratio}`, tris: triCount(d) })
  }
  const icon = readdirSync(join(SRC, 'Icons')).find(n => normId(basename(n, '.png')) === id)
  if (!icon) throw new Error(`${id}: no icon in Icons.zip`)
  copyFileSync(join(SRC, 'Icons', icon), join(OUT, 'icons', `${id}.png`))
  catalog.set(id, { id, family: id.replace(/_\d+$/, ''), source: `obj.zip:obj/${f}`, unit: o.unit, bbox: bbox(o), lods, pieces })
  console.log(`${id.padEnd(20)} ${lods.map(l => `${l.key} ${l.tris}`).join(' · ')} · ${pieces.length} pieces`)
}
const assets = [...catalog.values()].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
writeFileSync(join(OUT, 'catalog.json'), JSON.stringify({ generatedBy: 'street-furniture/ingest.mjs', assets }, null, 1))
rmSync(SRC, { recursive: true, force: true })
console.log(`\n${assets.length} assets in ${join(OUT, 'catalog.json')}`)
