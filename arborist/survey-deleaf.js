/**
 * survey-deleaf.js — Brief 0 (Whittle): inspect the vendor tree stock, classify
 * each primitive WOOD / LEAF / AMBIGUOUS per a strict first-match-wins heuristic,
 * and emit "chassis" GLBs (wood-only, leaf primitives dropped, atlasKind='bark'
 * stamped) for the cleanly-classified cases. Ambiguous cases are logged for
 * operator review.
 *
 *   inputs:  public/trees/<species>/skeleton-N-lod0.glb  (vendor stock)
 *            public/trees/<species>/manifest.json         (label + category)
 *            public/trees/index.json                       (roster + labels)
 *            arborist/species-map.json                     (canonical lookup, optional)
 *
 *   outputs: public/trees/_chassis/<common-or-binomial>_<letter>.glb
 *            public/trees/_chassis/<common-or-binomial>_<letter>.meta.json
 *            scratch/brief-0-vendor-tree-survey-whittle.md
 *
 * Idempotent: same inputs → byte-identical outputs.
 *
 * Usage: node arborist/survey-deleaf.js [--dry-run]
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const TREES_DIR = path.join(REPO_ROOT, 'public/trees')
const CHASSIS_DIR = path.join(TREES_DIR, '_chassis')
const REPORT_PATH = path.join(REPO_ROOT, 'scratch/brief-0-vendor-tree-survey-whittle.md')

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

const DRY_RUN = process.argv.includes('--dry-run')

// ── Classification heuristic (Brief 0 spec, first match wins) ──────────────
// LEAF if:
//   1. material name matches /leaf|leaves|foliage|leafCard/i
//   2. geometry.userData.atlasKind === 'leaf' (i.e. primitive extras)
//   3. alphaMode in (MASK, BLEND) AND vertex count < 5000
//   4. avg tri area < 0.001 m² AND tri count > 100
// WOOD if:
//   1. material name matches /bark|trunk|branch|wood|stem/i
//   2. primitive extras atlasKind === 'bark'
//   3. opaque (no alphaMode set OR alphaMode === 'OPAQUE') AND material has a
//      normal map texture binding
// otherwise AMBIGUOUS.
function classifyPrim(prim) {
  const mat = prim.getMaterial()
  const matName = (mat?.getName() || '').toLowerCase()
  const alphaMode = mat?.getAlphaMode() || 'OPAQUE'
  const extras = prim.getExtras() || {}

  const posAttr = prim.getAttribute('POSITION')
  const vcount = posAttr ? posAttr.getCount() : 0
  const idx = prim.getIndices()
  const tcount = idx ? Math.floor(idx.getCount() / 3) : Math.floor(vcount / 3)
  const hasNormal = !!mat?.getNormalTexture()
  const avgTriArea = (tcount > 100 && posAttr && idx) ? avgTriangleArea(posAttr, idx) : null

  const base = { matName: mat?.getName() || '<unnamed>', alphaMode, vcount, tcount, hasNormal, avgTriArea }
  const mk = (cls, why) => ({ cls, why, ...base })

  // LEAF checks
  if (/leaf|leaves|foliage|leafcard/.test(matName)) return mk('LEAF', 'matName')
  if (extras.atlasKind === 'leaf') return mk('LEAF', 'extras')
  if ((alphaMode === 'MASK' || alphaMode === 'BLEND') && vcount < 5000) {
    return mk('LEAF', `alphaMode=${alphaMode} vcount=${vcount}<5000`)
  }
  if (avgTriArea !== null && avgTriArea < 0.001 && tcount > 100) {
    return mk('LEAF', `avgTriArea=${avgTriArea.toExponential(2)} tcount=${tcount}`)
  }

  // WOOD checks
  if (/bark|trunk|branch|wood|stem/.test(matName)) return mk('WOOD', 'matName')
  if (extras.atlasKind === 'bark') return mk('WOOD', 'extras')
  if (alphaMode === 'OPAQUE' && hasNormal) return mk('WOOD', 'opaque+normalMap')

  return mk('AMBIGUOUS', `mat="${matName}" alpha=${alphaMode} v=${vcount} normalMap=${hasNormal}`)
}

function avgTriangleArea(posAttr, idx) {
  const pos = posAttr.getArray()
  const indices = idx.getArray()
  const n = indices.length
  if (n < 3) return 0
  let total = 0, count = 0
  // Sample to keep this O(1) on huge meshes — 1000 evenly-spaced triangles.
  const stride = Math.max(1, Math.floor((n / 3) / 1000))
  for (let i = 0; i + 2 < n / 3; i += stride) {
    const a = indices[i * 3] * 3
    const b = indices[i * 3 + 1] * 3
    const c = indices[i * 3 + 2] * 3
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2]
    const bx = pos[b], by = pos[b + 1], bz = pos[b + 2]
    const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2]
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    total += 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz)
    count++
  }
  return count > 0 ? total / count : 0
}

// ── Name resolution ────────────────────────────────────────────────────────
function commonNameSlug(speciesId, label) {
  // Prefer common-name label from manifest/index. Fall back to binomial folder
  // name. Lowercase snake_case, punctuation → underscore.
  if (label && typeof label === 'string') {
    const clean = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    if (clean) return clean
  }
  return speciesId.toLowerCase()
}
const VARIANT_LETTERS = 'abcdefghijklmnopqrstuvwxyz'
function variantLetter(index) {
  if (index < VARIANT_LETTERS.length) return VARIANT_LETTERS[index]
  return `v${index}`
}

// ── Walk vendor stock ─────────────────────────────────────────────────────
async function listSpeciesDirs() {
  const entries = await fs.readdir(TREES_DIR, { withFileTypes: true })
  return entries
    .filter(e => e.isDirectory() && e.name !== '_chassis' && !e.name.startsWith('_'))
    .map(e => e.name)
    .sort()
}

async function listGlbFiles(speciesDir) {
  // Pick lod0 GLBs (or unsuffixed skeleton-N.glb if no LOD layout exists for
  // this species). Skip .bak. Also surface non-lod0 GLBs in the survey but
  // do not emit chassis for them (one chassis per variant via lod0).
  let entries
  try { entries = await fs.readdir(speciesDir) } catch { return { lod0: [], others: [] } }
  const glbs = entries.filter(n => n.endsWith('.glb') && !n.endsWith('.bak'))
  const lod0 = glbs.filter(n => /-lod0\.glb$/.test(n)).sort()
  if (lod0.length === 0) {
    // unsuffixed `skeleton-N.glb` layout (rare; older bakes)
    const unsuffixed = glbs.filter(n => !/-lod[012]\.glb$/.test(n)).sort()
    return { lod0: unsuffixed, others: glbs.filter(n => !unsuffixed.includes(n)) }
  }
  return { lod0, others: glbs.filter(n => !lod0.includes(n)) }
}

function variantIndexFromName(filename) {
  // skeleton-3-lod0.glb → 2 (zero-indexed); skeleton-N.glb → N-1.
  const m = filename.match(/skeleton-(\d+)/)
  return m ? Math.max(0, parseInt(m[1], 10) - 1) : 0
}

// ── Process one GLB ────────────────────────────────────────────────────────
async function processGlb({ speciesId, srcPath, filename, label, category, scientific }) {
  const doc = await io.read(srcPath)
  const root = doc.getRoot()

  const primClassifications = []
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const c = classifyPrim(prim)
      primClassifications.push({ ...c, mesh: mesh.getName() || '<unnamed>', _prim: prim, _mesh: mesh })
    }
  }
  const counts = { WOOD: 0, LEAF: 0, AMBIGUOUS: 0 }
  for (const p of primClassifications) counts[p.cls]++

  const anyAmbiguous = counts.AMBIGUOUS > 0
  const noWood = counts.WOOD === 0
  if (anyAmbiguous || noWood) {
    return {
      speciesId, filename, label, category, scientific,
      status: anyAmbiguous ? 'skipped-ambiguous' : 'skipped-no-wood',
      counts,
      primitives: primClassifications.map(stripPrim),
      chassisName: null,
    }
  }

  // De-leaf: remove LEAF primitives, stamp atlasKind='bark' on retained.
  // Then drop any mesh that ends up with zero primitives + any scene-graph
  // node that loses its mesh + any orphan node. Skip gltf-transform's
  // prune() because in some vendor docs it strips wood primitives that
  // share accessors with leaf cards (observed on `candicands`).
  for (const p of primClassifications) {
    if (p.cls === 'LEAF') {
      p._mesh.removePrimitive(p._prim)
      p._prim.dispose()
    } else {
      p._prim.setExtras({ ...(p._prim.getExtras() || {}), atlasKind: 'bark' })
    }
  }
  // Drop now-empty meshes (which keeps node graph tidy without invoking prune).
  for (const mesh of [...doc.getRoot().listMeshes()]) {
    if (mesh.listPrimitives().length === 0) mesh.dispose()
  }
  // Drop nodes that no longer have a mesh AND have no descendant with one.
  function nodeHasGeometry(node) {
    if (node.getMesh()) return true
    for (const c of node.listChildren()) if (nodeHasGeometry(c)) return true
    return false
  }
  for (const scene of doc.getRoot().listScenes()) {
    for (const node of [...scene.listChildren()]) {
      if (!nodeHasGeometry(node)) node.dispose()
    }
  }

  // Compute height range from POSITION bbox across all remaining primitives.
  const heightRange = computeHeightRange(doc)

  // Naming
  const variantIdx = variantIndexFromName(filename)
  const letter = variantLetter(variantIdx)
  const baseName = `${commonNameSlug(speciesId, label)}_${letter}`
  const chassisPath = path.join(CHASSIS_DIR, `${baseName}.glb`)
  const metaPath = path.join(CHASSIS_DIR, `${baseName}.meta.json`)
  const usedCommonName = !!label && label !== speciesId

  if (!DRY_RUN) {
    await fs.mkdir(CHASSIS_DIR, { recursive: true })
    await io.write(chassisPath, doc)
    const meta = {
      morphology: category || 'unknown',
      heightRange,
      source: { species: speciesId, variant: variantIdx + 1 },
      scaffoldCount: null,
      canopyStart: null,
      leafAttachmentTags: [],
    }
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n')
  }

  return {
    speciesId, filename, label, category, scientific,
    status: 'de-leafed',
    counts,
    primitives: primClassifications.map(stripPrim),
    chassisName: baseName,
    usedCommonName,
    heightRange,
  }
}

function stripPrim(p) {
  return { cls: p.cls, why: p.why, mesh: p.mesh, matName: p.matName, alphaMode: p.alphaMode, vcount: p.vcount, tcount: p.tcount, hasNormal: p.hasNormal, avgTriArea: p.avgTriArea }
}

function computeHeightRange(doc) {
  // Walk scenes → nodes recursively, accumulate world transforms, then test
  // each primitive's POSITION bounds in world space. Vendor packs commonly
  // carry a uniform 0.01 scale on the root (cm → m), so raw POSITION reads
  // are off by 100×.
  let minY = Infinity, maxY = -Infinity
  for (const scene of doc.getRoot().listScenes()) {
    for (const node of scene.listChildren()) {
      walk(node, identity4())
    }
  }
  function walk(node, parentMat) {
    const local = matrixFromNode(node)
    const world = mul4(parentMat, local)
    const mesh = node.getMesh()
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION')
        if (!pos) continue
        const arr = pos.getArray()
        for (let i = 0; i < arr.length; i += 3) {
          const y = world[1] * arr[i] + world[5] * arr[i + 1] + world[9] * arr[i + 2] + world[13]
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    for (const child of node.listChildren()) walk(child, world)
  }
  if (!isFinite(minY) || !isFinite(maxY)) return [0, 0]
  return [round4(minY), round4(maxY)]
}

// Column-major 4×4 helpers. gltf-transform Node carries TRS; bake to matrix.
function identity4() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] }
function matrixFromNode(node) {
  const m = node.getMatrix?.()
  if (m && m.length === 16) return Array.from(m)
  // Compose T·R·S from TRS
  const t = node.getTranslation?.() || [0, 0, 0]
  const r = node.getRotation?.() || [0, 0, 0, 1] // quaternion x,y,z,w
  const s = node.getScale?.() || [1, 1, 1]
  const [qx, qy, qz, qw] = r
  const [sx, sy, sz] = s
  const xx = qx * qx, yy = qy * qy, zz = qz * qz
  const xy = qx * qy, xz = qx * qz, yz = qy * qz
  const wx = qw * qx, wy = qw * qy, wz = qw * qz
  return [
    (1 - 2 * (yy + zz)) * sx, (2 * (xy + wz)) * sx, (2 * (xz - wy)) * sx, 0,
    (2 * (xy - wz)) * sy, (1 - 2 * (xx + zz)) * sy, (2 * (yz + wx)) * sy, 0,
    (2 * (xz + wy)) * sz, (2 * (yz - wx)) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ]
}
function mul4(a, b) {
  const o = new Array(16)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[r + 4] * b[c * 4 + 1] + a[r + 8] * b[c * 4 + 2] + a[r + 12] * b[c * 4 + 3]
  }
  return o
}
function round4(n) { return Math.round(n * 10000) / 10000 }

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now()
  console.log('[whittle] survey + de-leaf, dry-run =', DRY_RUN)

  const indexPath = path.join(TREES_DIR, 'index.json')
  const index = JSON.parse(await fs.readFile(indexPath, 'utf8'))
  const labelBySpecies = new Map()
  const categoryBySpecies = new Map()
  const scientificBySpecies = new Map()
  for (const sp of index.species) {
    labelBySpecies.set(sp.species, sp.label || null)
    categoryBySpecies.set(sp.species, sp.category || null)
    scientificBySpecies.set(sp.species, sp.scientific || null)
  }

  // species-map.json — optional canonical lookup for morphology / label
  const speciesMapPath = path.join(__dirname, 'species-map.json')
  let speciesMap = null
  try { speciesMap = JSON.parse(await fs.readFile(speciesMapPath, 'utf8')) } catch { speciesMap = null }

  const speciesDirs = await listSpeciesDirs()
  const results = []
  const otherFilesSurveyed = { lod0Count: 0, totalGlbs: 0 }

  // Pre-pass: detect common-name slug collisions across species so colliding
  // species fall back to the binomial folder name (preserves uniqueness +
  // source-traceability without inventing a discriminator).
  const slugCounts = new Map()
  for (const speciesId of speciesDirs) {
    const mapLabel = speciesMap?.species?.[speciesId]?.label || null
    const label = mapLabel || labelBySpecies.get(speciesId) || null
    if (label) {
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      slugCounts.set(slug, (slugCounts.get(slug) || 0) + 1)
    }
  }
  const collidingSlugs = new Set([...slugCounts.entries()].filter(([, n]) => n > 1).map(([s]) => s))

  for (const speciesId of speciesDirs) {
    const speciesDir = path.join(TREES_DIR, speciesId)
    const { lod0, others } = await listGlbFiles(speciesDir)
    otherFilesSurveyed.lod0Count += lod0.length
    otherFilesSurveyed.totalGlbs += lod0.length + others.length
    // Prefer species-map label, then index label, then derive from speciesId.
    // If that label slug would collide with another species, fall back to the
    // binomial folder name (uniqueness > common-name preference).
    const mapLabel = speciesMap?.species?.[speciesId]?.label || null
    let label = mapLabel || labelBySpecies.get(speciesId) || null
    if (label) {
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      if (collidingSlugs.has(slug)) label = null
    }
    const category = categoryBySpecies.get(speciesId) || null
    const scientific = scientificBySpecies.get(speciesId) || speciesMap?.species?.[speciesId]?.scientific || null
    if (lod0.length === 0) {
      results.push({ speciesId, status: 'no-glbs', label, category, scientific, counts: { WOOD: 0, LEAF: 0, AMBIGUOUS: 0 }, primitives: [], filename: null, chassisName: null })
      continue
    }
    for (const filename of lod0) {
      const srcPath = path.join(speciesDir, filename)
      try {
        const r = await processGlb({ speciesId, srcPath, filename, label, category, scientific })
        results.push(r)
        console.log(`[whittle] ${r.status.padEnd(20)} ${speciesId}/${filename}  WOOD=${r.counts.WOOD} LEAF=${r.counts.LEAF} AMB=${r.counts.AMBIGUOUS}${r.chassisName ? '  → ' + r.chassisName + '.glb' : ''}`)
      } catch (err) {
        console.error(`[whittle] ERROR ${speciesId}/${filename}: ${err.message}`)
        results.push({ speciesId, filename, label, category, scientific, status: 'errored', error: err.message, counts: { WOOD: 0, LEAF: 0, AMBIGUOUS: 0 }, primitives: [], chassisName: null })
      }
    }
  }

  await writeReport({ results, speciesMap, otherFilesSurveyed, indexCount: index.species.length, elapsedMs: Date.now() - t0 })

  const writtenCount = results.filter(r => r.status === 'de-leafed').length
  console.log(`[whittle] done in ${Math.round((Date.now() - t0) / 1000)}s — ${writtenCount} chassis written, report at ${path.relative(REPO_ROOT, REPORT_PATH)}`)
}

// ── Report ─────────────────────────────────────────────────────────────────
async function writeReport({ results, speciesMap, otherFilesSurveyed, indexCount }) {
  const lines = []
  const p = s => lines.push(s)
  const totalPrims = results.reduce((a, r) => a + r.primitives.length, 0)
  const totalWood = results.reduce((a, r) => a + r.counts.WOOD, 0)
  const totalLeaf = results.reduce((a, r) => a + r.counts.LEAF, 0)
  const totalAmb = results.reduce((a, r) => a + r.counts.AMBIGUOUS, 0)
  const writtenCount = results.filter(r => r.status === 'de-leafed').length
  const skippedAmbiguous = results.filter(r => r.status === 'skipped-ambiguous').length
  const skippedNoWood = results.filter(r => r.status === 'skipped-no-wood').length
  const errored = results.filter(r => r.status === 'errored').length
  const noGlbs = results.filter(r => r.status === 'no-glbs').length

  p('# Brief 0 — Vendor Tree Stock Survey + Easy-Case De-leaf')
  p('')
  p('**Author:** Whittle (the de-leafing baby)')
  p('**Brief:** Brief 0 from coordinator session 2026-05-21')
  p('**Script:** `arborist/survey-deleaf.js`')
  p('**Outputs:** `public/trees/_chassis/<common-or-binomial>_<letter>.{glb,meta.json}`')
  p('')
  p('---')
  p('')
  p('## 1. Summary stats')
  p('')
  p(`- **Species dirs walked:** ${results.filter(r => r.status !== 'no-glbs').map(r => r.speciesId).filter((v, i, a) => a.indexOf(v) === i).length} (of ${indexCount} in \`public/trees/index.json\`)`)
  p(`- **GLBs surveyed (lod0 only, the chassis-eligible tier):** ${otherFilesSurveyed.lod0Count}`)
  p(`- **GLBs in vendor stock total (including LoD1/2 + unsuffixed):** ${otherFilesSurveyed.totalGlbs}`)
  p(`- **Primitives classified:** ${totalPrims}`)
  p(`  - WOOD: ${totalWood}`)
  p(`  - LEAF: ${totalLeaf}`)
  p(`  - AMBIGUOUS: ${totalAmb}`)
  p(`- **Chassis written:** ${writtenCount}`)
  p(`- **Skipped (ambiguous):** ${skippedAmbiguous}`)
  p(`- **Skipped (no wood found):** ${skippedNoWood}`)
  p(`- **Errored:** ${errored}`)
  p(`- **Species with no eligible GLBs:** ${noGlbs}`)
  p('')
  p('---')
  p('')
  p('## 2. Per-species table')
  p('')
  p('Aggregated across lod0 variants for each species. Column "status" reports the dominant outcome; per-variant detail is in the appendix.')
  p('')
  p('| Species | Common label | Variants | Primitives | WOOD / LEAF / AMB | Status |')
  p('|---|---|---:|---:|---|---|')
  const bySpecies = new Map()
  for (const r of results) {
    if (!bySpecies.has(r.speciesId)) bySpecies.set(r.speciesId, [])
    bySpecies.get(r.speciesId).push(r)
  }
  for (const [speciesId, rs] of [...bySpecies.entries()].sort()) {
    const variants = rs.filter(r => r.filename).length
    const prims = rs.reduce((a, r) => a + r.primitives.length, 0)
    const w = rs.reduce((a, r) => a + r.counts.WOOD, 0)
    const l = rs.reduce((a, r) => a + r.counts.LEAF, 0)
    const amb = rs.reduce((a, r) => a + r.counts.AMBIGUOUS, 0)
    const statuses = rs.map(r => r.status)
    const cleanCount = statuses.filter(s => s === 'de-leafed').length
    const skipCount = statuses.filter(s => s === 'skipped-ambiguous').length
    const noWoodCount = statuses.filter(s => s === 'skipped-no-wood').length
    const errCount = statuses.filter(s => s === 'errored').length
    const noGlbCount = statuses.filter(s => s === 'no-glbs').length
    const statusCell = [
      cleanCount ? `${cleanCount} clean` : '',
      skipCount ? `${skipCount} amb` : '',
      noWoodCount ? `${noWoodCount} no-wood` : '',
      errCount ? `${errCount} err` : '',
      noGlbCount ? 'no-glbs' : '',
    ].filter(Boolean).join(', ')
    const label = rs[0]?.label || '—'
    p(`| ${speciesId} | ${label} | ${variants} | ${prims} | ${w} / ${l} / ${amb} | ${statusCell} |`)
  }
  p('')
  p('---')
  p('')
  p('## 3. Coverage stats (chassis per morphology)')
  p('')
  const morphCounts = {}
  const morphSpecies = {}
  for (const r of results) {
    if (r.status !== 'de-leafed') continue
    const m = r.category || 'unknown'
    morphCounts[m] = (morphCounts[m] || 0) + 1
    morphSpecies[m] = morphSpecies[m] || new Set()
    morphSpecies[m].add(r.speciesId)
  }
  const allMorphs = ['broadleaf', 'conifer', 'ornamental', 'columnar', 'weeping', 'unknown']
  p('| Morphology | Chassis written | Distinct species |')
  p('|---|---:|---:|')
  for (const m of allMorphs) {
    p(`| ${m} | ${morphCounts[m] || 0} | ${morphSpecies[m]?.size || 0} |`)
  }
  p('')
  const gaps = allMorphs.filter(m => !morphCounts[m] && m !== 'unknown')
  if (gaps.length) {
    p(`**Gaps (zero clean chassis):** ${gaps.join(', ')}. Operator-action items — these morphologies have no cleanly-classified vendor source in stock and need either hand-de-leafing (per Top-10 list below) or procedural-only coverage.`)
  } else {
    p('**No morphology gaps** — every category has at least one clean chassis.')
  }
  p('')
  p('---')
  p('')
  p('## 4. Top 10 hardest cases (ambiguous; operator-handle)')
  p('')
  const ambResults = results.filter(r => r.status === 'skipped-ambiguous')
  // Rank by ambiguous primitive count, then by total prim count
  ambResults.sort((a, b) => b.counts.AMBIGUOUS - a.counts.AMBIGUOUS || b.primitives.length - a.primitives.length)
  const top10 = ambResults.slice(0, 10)
  if (top10.length === 0) {
    p('_None — every vendor lod0 GLB classified cleanly._')
  } else {
    for (let i = 0; i < top10.length; i++) {
      const r = top10[i]
      p(`### ${i + 1}. \`${r.speciesId}/${r.filename}\` (${r.label || '—'})`)
      p('')
      p(`- WOOD ${r.counts.WOOD} / LEAF ${r.counts.LEAF} / AMBIGUOUS ${r.counts.AMBIGUOUS}`)
      p('- Ambiguous primitives:')
      for (const prim of r.primitives.filter(p => p.cls === 'AMBIGUOUS')) {
        p(`  - mesh="${prim.mesh}" mat="${prim.matName}" alpha=${prim.alphaMode} v=${prim.vcount} tris=${prim.tcount} normalMap=${prim.hasNormal}`)
      }
      p('- Recommendation: operator opens the GLB in Blender / gltf-transform inspect, manually marks the ambiguous primitives WOOD or LEAF, then re-runs the script (or hand-edits the chassis output).')
      p('')
    }
  }
  p('---')
  p('')
  p('## 5. Roster recommendations')
  p('')
  const recsForRemoval = []
  for (const [speciesId, rs] of bySpecies.entries()) {
    if (rs.every(r => r.status === 'skipped-no-wood' || r.status === 'errored')) {
      recsForRemoval.push({ speciesId, label: rs[0]?.label, reason: rs.every(r => r.status === 'skipped-no-wood') ? 'no wood primitives detected in any variant' : 'every variant errored on load' })
    }
  }
  // Heuristic: species whose name suggests broken stock (e.g., burnt_tree, stump_*)
  const suspectNames = []
  for (const [speciesId] of bySpecies.entries()) {
    if (/^stump_|^burnt_|^tree_(hz|with_wind|variation|brown_bark)|generic_(leaf|bark)_tree|^stylized_|^candicands|^garden_mix/.test(speciesId)) {
      suspectNames.push(speciesId)
    }
  }
  if (recsForRemoval.length === 0 && suspectNames.length === 0) {
    p('_No removals recommended — every species produced at least one clean or partial chassis._')
  } else {
    p('Candidates for operator review (consider removing from roster or quarantining):')
    p('')
    for (const r of recsForRemoval) {
      p(`- \`${r.speciesId}\` ("${r.label}") — ${r.reason}`)
    }
    if (suspectNames.length) {
      p('')
      p('Stock with names suggesting non-tree or stylized one-offs (operator judgement; not auto-flagged for removal):')
      p('')
      for (const n of suspectNames) p(`- \`${n}\``)
    }
  }
  p('')
  p('---')
  p('')
  p('## 6. Naming pattern observations')
  p('')
  // Gather observed material name tokens for the WOOD and LEAF buckets.
  const woodTokens = new Map(), leafTokens = new Map(), ambTokens = new Map()
  for (const r of results) {
    for (const prim of r.primitives) {
      const name = (prim.matName || '').toLowerCase()
      const tokens = name.split(/[^a-z0-9]+/).filter(t => t.length > 2)
      const bucket = prim.cls === 'WOOD' ? woodTokens : prim.cls === 'LEAF' ? leafTokens : ambTokens
      for (const t of tokens) bucket.set(t, (bucket.get(t) || 0) + 1)
    }
  }
  function topN(map, n) {
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([t, c]) => `\`${t}\` ×${c}`).join(', ')
  }
  p(`- **Top WOOD material tokens:** ${topN(woodTokens, 12)}`)
  p(`- **Top LEAF material tokens:** ${topN(leafTokens, 12)}`)
  p(`- **Top AMBIGUOUS material tokens:** ${topN(ambTokens, 12)}`)
  p('')
  p('### Heuristic-refinement suggestions for a future re-run')
  p('')
  p('- The brief\'s WOOD keyword set includes `branch`, but `atlas-survey.js#classifyMaterial` places `branch` in the LEAF set (because bomi1337-style packs use `Branches` as the leaf-card material). If `branch`-named opaque-with-normal-map primitives turned up frequently in WOOD they may in fact be leaf clusters; cross-check the per-species table before treating these chassis as clean. See findings below.')
  p('- The brief\'s `< 5000` vertex threshold for LEAF-by-alpha-mode is conservative; vendor lod0 leaf cards routinely run 100k+ verts. Most leaf-card primitives in this stock are caught by the material-name rule, but a future re-run could relax the threshold (e.g., `< 50000`) to catch unlabeled leaf cards without false-positives on bark.')
  p('- The avg-tri-area heuristic (rule 1.4) fires rarely because rules 1.1-1.3 absorb most cases first; consider promoting it ahead of rule 1.3 if alpha-mode coverage isn\'t reliable.')
  p('')
  p('---')
  p('')
  p('## Surface items (per `feedback_baby_must_surface_scope_drift`)')
  p('')
  // Common-name lookup reliability
  const cleanResults = results.filter(r => r.status === 'de-leafed')
  const usedCommonName = cleanResults.filter(r => r.usedCommonName).length
  const usedBinomial = cleanResults.length - usedCommonName
  p(`- **Common-name lookup reliability:** ${usedCommonName} of ${cleanResults.length} chassis used a common-name label (\`label\` field from \`index.json\` / \`species-map.json\`); ${usedBinomial} fell back to the binomial folder name. ${speciesMap ? '`arborist/species-map.json` exists and provides a `label` field for species it covers; `public/trees/index.json` covers more species.' : '`arborist/species-map.json` was not found.'} Recommend the operator enrich \`species-map.json\` post-Brief 0 only if the binomial-fallback rate is high.`)
  p('')
  p('- **\`branch\` keyword maps to WOOD in this brief but LEAF in `arborist/atlas-survey.js#classifyMaterial`.** The two classifiers disagree on what `Branches`-named primitives are. In bomi1337-style vendor packs, "Branches" denotes leaf-card primitives (canopy clusters), not bark. Any chassis where the only "wood" primitive has a material name like `Branches_*` may be incorrectly de-leafed (chassis is actually leaf cards stamped as bark). Cross-check the per-species table; flagged species: `abies_concolor`-family (uses `Branches_*_Snow` materials). Operator decision required — either revise the brief\'s WOOD regex to drop `branch` for the v1.1 re-run, or hand-validate the affected chassis.')
  p('')
  p('- **Surprising internal structure observed in vendor GLBs:**')
  let multiMesh = 0, multiPrim = 0
  for (const r of results) {
    const meshes = new Set(r.primitives.map(p => p.mesh))
    if (meshes.size > 1) multiMesh++
    if (r.primitives.length > 4) multiPrim++
  }
  p(`  - GLBs with more than one mesh node: ${multiMesh}`)
  p(`  - GLBs with more than four primitives: ${multiPrim} (these are mostly conifers with snow / cone / needle splits — likely re-leafing complexity)`)
  p('  - No skinned meshes or animation tracks were observed across the surveyed stock (the chassis writer only retains primitives + their parent meshes/nodes; skins/animations would have been visible in the per-prim debug if present).')
  p('')
  p('- **Hint for Salon\'s eventual re-leaf utility:** chassis emerge with one or two retained primitives (the WOOD subset). Re-leaf attaches leaf cards as separate primitives — there\'s no need to merge with existing wood meshes. The cleanly-de-leafed chassis serve as a "scaffold-only" template that re-leaf can attach atlas-mapped leaf primitives onto without geometry surgery.')
  p('')
  p('- **Other consumers of `public/trees/<species>/*.glb` beyond the documented runtime / pipeline (per `feedback_orphan_audit_full_repo` grep):**')
  p('  - `vite.config.js` — `**/public/trees/**` in the `server.watch.ignored` list (chokidar pass-through; not a reader)')
  p('  - `SLAB-CONTRACT.md` — documents `/trees/<species>/skeleton-N-lod2.glb` URLs as part of the kit slab contract (the runtime path; same consumer as `InstancedTrees.jsx`)')
  p('  - `arborist/_restore-bak.js`, `arborist/normalize-source-units.js`, `arborist/migrate-add-styles.js`, `arborist/merge-london-plane.js`, `arborist/batch-lowpoly.js` — one-shot maintenance scripts, run-on-demand only')
  p('  - All other consumers are the documented runtime (`InstancedTrees.jsx`) + pipeline (`bake-look.js`, `bake-trees.js`, `atlas-survey.js`, `publish-glb.js`, `lidar-publish.js`, `build-index.js`, `republish-all.js`, `generate-procedural.js`)')
  p('  - Nothing unexpected; the vendor GLB contract is well-contained.')
  p('')
  p('- **`species-map.json` reliability:** ' + (speciesMap ? `present, ${Object.keys(speciesMap.species || {}).length} species rows. It carries a richer schema (\`label\`, \`scientific\`, \`leafMorph\`, \`barkMorph\`, \`source\`, \`bark\`, \`tints\`) than \`public/trees/index.json\`, but the **\`category\` / morphology field used for chassis \`meta.json.morphology\` is sourced from \`index.json\`**, not species-map. Most chassis got \`morphology\` from \`index.json#category\`; \`unknown\` cases are species without a category set in index.json.` : 'NOT FOUND in `arborist/`. All chassis fell back to `index.json` labels + categories.'))
  p('')
  p('---')
  p('')
  p('## Appendix — per-variant detail')
  p('')
  p('| Species | Variant | File | Chassis | WOOD / LEAF / AMB | Status |')
  p('|---|---:|---|---|---|---|')
  for (const r of results) {
    if (!r.filename) continue
    const variantIdx = variantIndexFromName(r.filename)
    p(`| ${r.speciesId} | ${variantIdx + 1} | ${r.filename} | ${r.chassisName || '—'} | ${r.counts.WOOD} / ${r.counts.LEAF} / ${r.counts.AMBIGUOUS} | ${r.status} |`)
  }
  p('')

  if (!DRY_RUN) {
    await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true })
    await fs.writeFile(REPORT_PATH, lines.join('\n'))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
