/**
 * split-group-shots.js — detect and split published variants that contain
 * multiple discrete tree specimens, so the runtime ships single-tree GLBs.
 *
 * Why: many vendor packs are "kit"-style multi-tree scenes baked into one
 * GLB (e.g., 4 cedars in a row). Instancing such a variant 100 times in
 * the park renders 400 trees, not 100, wasting GPU. Splitting at publish
 * time costs operator nothing and the runtime is correct by construction.
 *
 * Strategy (kit-style, non-overlapping trees):
 *   1. Walk variant LOD0, gather positions in the bottom 5% slab.
 *   2. Bin into a 1m XZ grid; flood-fill connected occupied cells →
 *      clusters. Each cluster ≈ one trunk.
 *   3. For clusters with sufficient density + sufficient mutual
 *      separation, declare the variant a group shot.
 *   4. For each cluster, isolate triangles whose centroid lies inside
 *      that cluster's XZ region (bbox + canopy buffer).
 *   5. Emit per-cluster LOD0 / LOD1 / LOD2 GLBs.
 *   6. Replace the original variant entry in the manifest with N new
 *      variants. Move the original LOD files to *.bak so the operation
 *      is reversible.
 *
 * Operator overrides on the original variant are dropped — splitting
 * produces fundamentally different variants, and inheriting overrides
 * silently would be misleading.
 *
 * Usage:
 *   node arborist/split-group-shots.js                # all species
 *   node arborist/split-group-shots.js --only acer_saccharum
 *   node arborist/split-group-shots.js --dry          # detect, no writes
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { cloneDocument, prune } from '@gltf-transform/functions'
import { rebuildIndex } from './build-index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const TREES_DIR = path.join(REPO_ROOT, 'public', 'trees')

// Detection thresholds — tuned to err toward "this is one tree."
// False positives are expensive (we'd split a single tree into chunks),
// false negatives are cheap (operator can manually exclude a group shot).
const SLAB_FRACTION    = 0.05   // bottom 5% of vertical extent = "trunk slab"
const SLAB_MIN_M       = 0.05   // floor on the slab thickness
const GRID_M           = 0.5    // XZ bin size for occupancy grid (finer = better isolates close pairs)
const MIN_PEAK_CELL_VTX  = 10   // single cell at the peak must hit at least this
const MIN_REGION_VTX     = 30   // sum across the peak + 8 neighbors must hit this
const MIN_SEPARATION_M = 2.0    // clusters closer than this fold together
const MAX_CLUSTERS     = 16     // sanity ceiling — bail if more, suspect false positives
const MIN_TOTAL_SPAN_M = 4.0    // overall trunk-slab XZ span must exceed this for a group shot
const MAX_CANOPY_RADIUS_M = 10  // Voronoi-assigned triangles farther than
                                 // this from their cluster center are
                                 // floating fragments — drop.

function parseArgs() {
  const args = {}
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = process.argv[i + 1]
      if (next && !next.startsWith('--')) { args[key] = next; i++ }
      else args[key] = true
    }
  }
  return args
}

function transformVec(matrixElems, x, y, z) {
  const e = matrixElems
  return [
    e[0]*x + e[4]*y + e[8] *z + e[12],
    e[1]*x + e[5]*y + e[9] *z + e[13],
    e[2]*x + e[6]*y + e[10]*z + e[14],
  ]
}

// Walk the doc's nodes, yielding (nodePtr, matrixWorldElements) for each
// mesh-bearing node. We need world-space positions so triangles in nested
// transforms get sorted into the right cluster.
function* meshNodes(doc) {
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    yield { node, mesh, matrix: getNodeWorldMatrixElements(node) }
  }
}
function getNodeWorldMatrixElements(node) {
  // Compose ancestor chain: world = parent * ... * local
  const chain = []
  let n = node
  while (n && typeof n.getMatrix === 'function') {
    chain.unshift(n.getMatrix())
    n = n.getParentNode ? n.getParentNode() : null
  }
  // Multiply 4x4s left → right.
  let acc = identity4()
  for (const m of chain) acc = multiply4(acc, m)
  return acc
}
function identity4() {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
}
function multiply4(a, b) {
  const out = new Array(16)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    let s = 0
    for (let k = 0; k < 4; k++) s += a[r*4+k] * b[k*4+c]
    out[r*4+c] = s
  }
  return out
}

// gltf-transform Accessor.getElement(i, target) populates target with the
// vertex's components. (Three.js's getX/Y/Z aren't on gltf-transform.)
const _v3 = [0, 0, 0]
function vexY(matrix, pos, i) {
  pos.getElement(i, _v3)
  return matrix[1]*_v3[0] + matrix[5]*_v3[1] + matrix[9]*_v3[2] + matrix[13]
}
function vexXZ(matrix, pos, i) {
  pos.getElement(i, _v3)
  return [
    matrix[0]*_v3[0] + matrix[4]*_v3[1] + matrix[8] *_v3[2] + matrix[12],
    matrix[2]*_v3[0] + matrix[6]*_v3[1] + matrix[10]*_v3[2] + matrix[14],
  ]
}

// Detect trunk clusters by flood-fill on a coarse XZ occupancy grid of
// trunk-slab vertices. Returns clusters = [{ centerX, centerZ, minX, maxX,
// minZ, maxZ, count }].
function detectClusters(doc) {
  // 1. Determine vertical extent.
  let minY = Infinity, maxY = -Infinity
  for (const { mesh, matrix } of meshNodes(doc)) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      if (!pos) continue
      for (let i = 0; i < pos.getCount(); i++) {
        const wy = vexY(matrix, pos, i)
        if (wy < minY) minY = wy
        if (wy > maxY) maxY = wy
      }
    }
  }
  if (!isFinite(minY)) return { clusters: [], total: 0 }
  const slabHi = minY + Math.max(SLAB_FRACTION * (maxY - minY), SLAB_MIN_M)

  // 2. Bin slab vertices into a coarse grid.
  const cellsByKey = new Map() // "ix,iz" -> { count, sumX, sumZ, ix, iz }
  for (const { mesh, matrix } of meshNodes(doc)) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      if (!pos) continue
      for (let i = 0; i < pos.getCount(); i++) {
        const wy = vexY(matrix, pos, i)
        if (wy > slabHi) continue
        const [wx, wz] = vexXZ(matrix, pos, i)
        const ix = Math.floor(wx / GRID_M)
        const iz = Math.floor(wz / GRID_M)
        const key = `${ix},${iz}`
        let cell = cellsByKey.get(key)
        if (!cell) { cell = { count: 0, sumX: 0, sumZ: 0, ix, iz }; cellsByKey.set(key, cell) }
        cell.count++; cell.sumX += wx; cell.sumZ += wz
      }
    }
  }
  if (cellsByKey.size === 0) return { clusters: [], total: 0 }

  // 3. Density-peak detection. A cell is a peak if its vertex count is
  //    ≥ all 8 neighbors AND meets the trunk threshold. This isolates
  //    close trunks (which flood-fill would merge into one cluster).
  //    Each peak becomes a cluster center; we then aggregate the local
  //    region around it for bbox + count.
  const peaks = []
  for (const cell of cellsByKey.values()) {
    if (cell.count < MIN_PEAK_CELL_VTX) continue
    let isPeak = true
    let regionSum = cell.count
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const n = cellsByKey.get(`${cell.ix+dx},${cell.iz+dz}`)
      if (!n) continue
      if (n.count > cell.count) { isPeak = false; break }
      regionSum += n.count
    }
    if (!isPeak) continue
    if (regionSum < MIN_REGION_VTX) continue
    peaks.push(cell)
  }
  // For each peak, accumulate the local region (peak + immediate 8 neighbors)
  // for centroid + bbox. Counts in shared cells count once per peak.
  const clusters = []
  for (const peak of peaks) {
    let count = 0, sumX = 0, sumZ = 0
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const [dx, dz] of [[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const n = cellsByKey.get(`${peak.ix+dx},${peak.iz+dz}`)
      if (!n) continue
      count += n.count; sumX += n.sumX; sumZ += n.sumZ
      const cx = n.sumX / n.count, cz = n.sumZ / n.count
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx
      if (cz < minZ) minZ = cz; if (cz > maxZ) maxZ = cz
    }
    clusters.push({
      centerX: sumX / count, centerZ: sumZ / count,
      minX, maxX, minZ, maxZ, count,
    })
  }
  // 4. Merge clusters whose centers are closer than MIN_SEPARATION_M.
  let merged = true
  while (merged) {
    merged = false
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const dx = clusters[i].centerX - clusters[j].centerX
        const dz = clusters[i].centerZ - clusters[j].centerZ
        if (Math.hypot(dx, dz) < MIN_SEPARATION_M) {
          const a = clusters[i], b = clusters[j]
          const total = a.count + b.count
          clusters[i] = {
            centerX: (a.centerX * a.count + b.centerX * b.count) / total,
            centerZ: (a.centerZ * a.count + b.centerZ * b.count) / total,
            minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX),
            minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ),
            count: total,
          }
          clusters.splice(j, 1)
          merged = true
          break outer
        }
      }
    }
  }
  // Confidence pass: a real trunk has vertices spanning UP from the slab.
  // A "fake" cluster (low branch tip touching ground) has vertices only
  // in a narrow Y band. For each cluster, sample all geometry within its
  // XZ bbox+buffer and require Y extent > a fraction of the tree height.
  const totalHeight = maxY - minY
  const minTrunkExtent = Math.max(2.0, totalHeight * 0.3)
  const validated = []
  for (const c of clusters) {
    const minXR = c.minX - 0.5, maxXR = c.maxX + 0.5
    const minZR = c.minZ - 0.5, maxZR = c.maxZ + 0.5
    let cMinY = Infinity, cMaxY = -Infinity
    for (const { mesh, matrix } of meshNodes(doc)) {
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION')
        if (!pos) continue
        for (let i = 0; i < pos.getCount(); i++) {
          const [wx, wz] = vexXZ(matrix, pos, i)
          if (wx < minXR || wx > maxXR || wz < minZR || wz > maxZR) continue
          const wy = vexY(matrix, pos, i)
          if (wy < cMinY) cMinY = wy
          if (wy > cMaxY) cMaxY = wy
        }
      }
    }
    if (cMaxY - cMinY >= minTrunkExtent) validated.push(c)
  }

  // Sanity: if too many clusters survived, the heuristic is misfiring on
  // a noisy mesh — bail rather than create dozens of bad sub-variants.
  if (validated.length > MAX_CLUSTERS) return { clusters: [], total: cellsByKey.size, bailout: 'too-many-clusters' }
  // Or if all clusters are within a tight overall span, it's a single
  // wide tree, not multiple specimens.
  if (validated.length >= 2) {
    const allMinX = Math.min(...validated.map(c => c.minX))
    const allMaxX = Math.max(...validated.map(c => c.maxX))
    const allMinZ = Math.min(...validated.map(c => c.minZ))
    const allMaxZ = Math.max(...validated.map(c => c.maxZ))
    const span = Math.max(allMaxX - allMinX, allMaxZ - allMinZ)
    if (span < MIN_TOTAL_SPAN_M) return { clusters: [validated[0]], total: cellsByKey.size, bailout: 'tight-span' }
  }
  return { clusters: validated, total: cellsByKey.size }
}

// Voronoi assignment: keep triangles whose centroid is closest to
// `targetCluster` among all `allClusters`. Smoother than bbox cropping
// — boundaries between clusters fall at the half-distance line, and
// every triangle goes to exactly one cluster (no blanks unless the
// target had no nearest triangles, which is rare).
async function cropToCluster(doc, targetCluster, allClusters) {
  const cropped = cloneDocument(doc)
  let kept = 0
  for (const { mesh, matrix } of meshNodes(cropped)) {
    const toDispose = []
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      const indices = prim.getIndices()
      if (!pos || !indices) { toDispose.push(prim); continue }
      const idx = indices.getArray()
      const newIdx = []
      const posArr = pos.getArray()
      const isFinitePos = (vi) =>
        Number.isFinite(posArr[vi * 3]) &&
        Number.isFinite(posArr[vi * 3 + 1]) &&
        Number.isFinite(posArr[vi * 3 + 2])
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i], b = idx[i+1], c = idx[i+2]
        // Drop triangles referencing NaN vertices outright — vendor
        // packs occasionally ship them.
        if (!isFinitePos(a) || !isFinitePos(b) || !isFinitePos(c)) continue
        const [ax, az] = vexXZ(matrix, pos, a)
        const [bx, bz] = vexXZ(matrix, pos, b)
        const [cx, cz] = vexXZ(matrix, pos, c)
        const tx = (ax + bx + cx) / 3
        const tz = (az + bz + cz) / 3
        let nearestI = 0
        let nearestD = Infinity
        for (let k = 0; k < allClusters.length; k++) {
          const dx = tx - allClusters[k].centerX
          const dz = tz - allClusters[k].centerZ
          const d = dx * dx + dz * dz
          if (d < nearestD) { nearestD = d; nearestI = k }
        }
        if (allClusters[nearestI] === targetCluster &&
            nearestD < MAX_CANOPY_RADIUS_M * MAX_CANOPY_RADIUS_M) {
          newIdx.push(a, b, c); kept++
        }
      }
      if (newIdx.length === 0) {
        toDispose.push(prim)
        continue
      }
      // Compact: keep only the vertices the new index buffer actually
      // references, slice every attribute, rewrite indices to the new
      // numbering. This drops unused-NaN vertices that would otherwise
      // poison Three.js's bbox computation at runtime.
      compactPrimitive(prim, newIdx)
    }
    for (const p of toDispose) {
      mesh.removePrimitive(p)
      p.dispose()
    }
  }
  if (kept === 0) return null
  await cropped.transform(prune())
  return cropped
}

// Compact a primitive to only the vertices its (new) index buffer uses.
// Slices every attribute (POSITION, NORMAL, TEXCOORD_*, COLOR_*, …) and
// rewrites the index buffer with consecutive [0..n) indices.
function compactPrimitive(prim, newIdx) {
  const used = new Set(newIdx)
  const usedSorted = [...used].sort((a, b) => a - b)
  const remap = new Map()
  usedSorted.forEach((old, n) => remap.set(old, n))
  // Rewrite each attribute to keep only used vertices.
  for (const sem of prim.listSemantics()) {
    const attr = prim.getAttribute(sem)
    if (!attr) continue
    const elem = attr.getElementSize()
    const arr = attr.getArray()
    const Cls = arr.constructor
    const newArr = new Cls(usedSorted.length * elem)
    for (let n = 0; n < usedSorted.length; n++) {
      const old = usedSorted[n]
      for (let c = 0; c < elem; c++) newArr[n * elem + c] = arr[old * elem + c]
    }
    attr.setArray(newArr)
  }
  // Remap indices.
  const remapped = new Array(newIdx.length)
  for (let i = 0; i < newIdx.length; i++) remapped[i] = remap.get(newIdx[i])
  const max = usedSorted.length
  const idxArr = max < 65536 ? new Uint16Array(remapped) : new Uint32Array(remapped)
  prim.getIndices().setArray(idxArr)
}

async function processVariant(io, manifest, variantEntry, speciesDir, args) {
  const lod0Path = path.join(TREES_DIR, manifest.species, variantEntry.skeletons.lod0)
  let lod0
  try {
    lod0 = await io.read(lod0Path)
  } catch (e) {
    return { changed: false, clusters: 0, missing: true, error: e.code || e.message }
  }
  const { clusters, bailout } = detectClusters(lod0)
  if (bailout) return { changed: false, clusters: clusters.length, bailout }
  if (clusters.length < 2) return { changed: false, clusters: clusters.length }
  // Detection-only: report and return without touching disk.
  if (args.dry) return { changed: false, clusters: clusters.length, dryClusters: clusters }

  // Re-id new variants: append after the highest existing id.
  const maxId = Math.max(0, ...manifest.variants.map(v => v.id))
  const newEntries = []
  for (let i = 0; i < clusters.length; i++) {
    const target = clusters[i]
    const newId = maxId + i + 1
    // Voronoi-partition each LOD: each triangle goes to its nearest
    // cluster center across all clusters.
    const skeletons = {}
    for (const lodKey of ['lod0', 'lod1', 'lod2']) {
      const sourcePath = path.join(TREES_DIR, manifest.species, variantEntry.skeletons[lodKey])
      const lodDoc = await io.read(sourcePath)
      const cropped = await cropToCluster(lodDoc, target, clusters)
      if (!cropped) continue
      const newFile = `skeleton-${newId}-${lodKey}.glb`
      await io.write(path.join(speciesDir, newFile), cropped)
      skeletons[lodKey] = newFile
    }
    if (!skeletons.lod0) continue   // emit failed — skip this cluster
    newEntries.push({
      id: newId,
      sourceName: `${variantEntry.sourceName} cluster ${i + 1}`,
      sourceFile: variantEntry.sourceFile,
      skeletons,
      quality: variantEntry.quality ?? 4,
      category: variantEntry.category ?? manifest.category,
      styles: variantEntry.styles ?? manifest.defaultStyles ?? ['realistic'],
      // Inherit scale from the parent variant: split geometry shares the
      // same vendor unit system, so the same scale factor applies. If we
      // reset to 1 the tree renders at vendor units — usually wildly
      // wrong (e.g. 300m tall) and the runtime OOMs.
      approxHeightM: variantEntry.approxHeightM ?? null,
      normalizeScale: variantEntry.normalizeScale ?? 1,
      splitFromVariantId: variantEntry.id,
      splitClusterIndex: i,
    })
  }
  if (newEntries.length === 0) return { changed: false, clusters: clusters.length }

  // Move original LOD files to .bak so the split is reversible.
  for (const lodKey of ['lod0', 'lod1', 'lod2']) {
    const file = variantEntry.skeletons[lodKey]
    if (!file) continue
    const orig = path.join(speciesDir, file)
    try { await fs.rename(orig, orig + '.bak') } catch {}
  }
  return { changed: true, clusters: clusters.length, newEntries }
}

async function processSpecies(io, speciesId, args) {
  const speciesDir = path.join(TREES_DIR, speciesId)
  const manifestPath = path.join(speciesDir, 'manifest.json')
  let manifest
  try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) } catch { return null }
  const updated = [...manifest.variants]
  const reports = []
  for (const v of manifest.variants) {
    if (!v.skeletons?.lod0) continue
    const r = await processVariant(io, manifest, v, speciesDir, args)
    if (!r) continue
    reports.push({ variantId: v.id, ...r })
    if (r.changed && !args.dry) {
      // Replace entry: keep the original (excluded), append new entries.
      const idx = updated.findIndex(x => x.id === v.id)
      if (idx >= 0) {
        updated[idx] = { ...updated[idx], excluded: true, splitInto: r.newEntries.map(e => e.id) }
      }
      updated.push(...r.newEntries)
    }
  }
  if (!args.dry) {
    manifest.variants = updated
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  }
  return { speciesId, reports }
}

async function main() {
  const args = parseArgs()
  const onlySet = args.only ? new Set(args.only.split(',')) : null
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

  const dirs = (await fs.readdir(TREES_DIR, { withFileTypes: true }))
    .filter(e => e.isDirectory()).map(e => e.name).sort()

  const summary = []
  for (const dir of dirs) {
    if (onlySet && !onlySet.has(dir)) continue
    process.stdout.write(`[split] ${dir}... `)
    let result
    try { result = await processSpecies(io, dir, args) }
    catch (e) { console.log(`ERROR ${e.message}`); continue }
    if (!result) { console.log('no manifest'); continue }
    const flagged = result.reports.filter(r => r.clusters >= 2 && !r.bailout)
    const missing = result.reports.filter(r => r.missing).length
    const bailouts = result.reports.filter(r => r.bailout)
    if (flagged.length === 0 && missing === 0 && bailouts.length === 0) { console.log('clean'); continue }
    if (flagged.length === 0) {
      const parts = []
      if (missing) parts.push(`${missing} missing`)
      if (bailouts.length) parts.push(`${bailouts.length} bailed (${bailouts.map(b => b.bailout).join(', ')})`)
      console.log(parts.join(', '))
      continue
    }
    const newCount = flagged.reduce((n, r) => n + (r.newEntries?.length || 0), 0)
    console.log(`${flagged.length} group-shot variant(s) [${flagged.map(f => f.clusters).join(', ')} clusters]${args.dry ? ' (dry run)' : `, split into ${newCount} new`}`)
    summary.push({ species: dir, flagged: flagged.length, splitInto: newCount, clusters: flagged.map(f => f.clusters) })
  }

  if (!args.dry) {
    const idx = await rebuildIndex()
    console.log(`\n[split] rebuilt index.json (${idx.speciesCount} species, ${idx.variantCount} variants)`)
  }
  console.log(`\n[split] summary:`)
  for (const s of summary) console.log(`  ${s.species}: ${s.flagged} → ${s.splitInto}`)
  console.log(`[split] ${summary.length} species had group shots`)
}

main().catch((e) => {
  console.error('[split] fatal:', e)
  process.exit(1)
})
