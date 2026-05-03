/**
 * publish-glb.js — multi-variant GLB → per-variant + 3-LOD published assets.
 *
 * Vendor packs (e.g. bomi1337's Forest Pack) ship one GLB per species, with
 * each variant as a separate top-level node sharing materials. This script:
 *   1. Loads the source GLB
 *   2. For each variant node, clones the Document and prunes unrelated nodes
 *   3. Emits 3 LOD tiers per variant (lod0/lod1/lod2) — geometry decimation +
 *      texture down-rez
 *   4. Writes manifest.json carrying the LOD URLs
 *
 * The output schema matches the LiDAR bake's manifest so the runtime
 * (InstancedTrees) is source-agnostic.
 *
 * Usage:
 *   node arborist/publish-glb.js \
 *     --source botanica/trees/forest-pack/maple-trees-pack/Maple-Trees__GLB.zip \
 *     --species red_maple \
 *     --label "Red Maple" \
 *     --scientific "Acer rubrum"
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawn } from 'node:child_process'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { cloneDocument, dedup, prune, weld, simplify, textureCompress } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import { rebuildIndex } from './build-index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

// LOD presets. ratio = fraction of triangles to keep (1.0 = full).
// textureSize = max dimension for any texture (down-rez via sharp).
const LODS = [
  { id: 'lod0', ratio: 0.85, textureSize: 2048, error: 0.0005 },
  { id: 'lod1', ratio: 0.40, textureSize: 1024, error: 0.0020 },
  { id: 'lod2', ratio: 0.10, textureSize: 512,  error: 0.0080 },
]

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

async function extractZip(srcPath, dst) {
  execFileSync('unzip', ['-o', '-q', srcPath, '-d', dst])
}
async function extractRar(srcPath, dst) {
  const { createExtractorFromFile } = await import('node-unrar-js')
  const ex = await createExtractorFromFile({ filepath: srcPath, targetPath: dst })
  Array.from(ex.getFileList().fileHeaders) // required init step
  Array.from(ex.extract().files)            // drain iterator → triggers writes
}
async function findFiles(dir, exts) {
  const out = []
  const stack = [dir]
  while (stack.length) {
    const d = stack.pop()
    const entries = await fs.readdir(d, { withFileTypes: true })
    for (const e of entries) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) stack.push(full)
      else if (exts.some(x => e.name.toLowerCase().endsWith(x))) out.push(full)
    }
  }
  return out
}

// Accepts:
//   - direct .glb           → return as-is
//   - .fbx                  → convert to .glb (textures looked for next to it)
//   - .zip / .rar           → extract, recurse on contents
//   - directory             → extract every .zip/.rar inside, then find .glb or .fbx
async function resolveSourceGlb(srcPath) {
  const lower = srcPath.toLowerCase()
  const stat = await fs.stat(srcPath)

  if (stat.isFile() && lower.endsWith('.glb')) return srcPath

  // Stage everything in one temp dir so FBX + sibling textures land
  // alongside each other for fbx2gltf to resolve external references.
  const tmpDir = path.join('/tmp', `arborist-glb-${Date.now()}-${Math.random().toString(36).slice(2,8)}`)
  await fs.mkdir(tmpDir, { recursive: true })

  if (stat.isDirectory()) {
    // Extract every archive in the folder, then handle results uniformly.
    const archives = (await fs.readdir(srcPath))
      .filter(n => /\.(zip|rar)$/i.test(n))
      .map(n => path.join(srcPath, n))
    for (const a of archives) {
      console.log(`[publish-glb] extract ${path.basename(a)}`)
      if (a.toLowerCase().endsWith('.zip')) await extractZip(a, tmpDir)
      else                                  await extractRar(a, tmpDir)
    }
    // Also copy any bare .glb / .fbx that sit directly in the folder.
    for (const n of await fs.readdir(srcPath)) {
      if (/\.(glb|fbx)$/i.test(n)) {
        await fs.copyFile(path.join(srcPath, n), path.join(tmpDir, n))
      }
    }
  } else if (lower.endsWith('.zip')) {
    await extractZip(srcPath, tmpDir)
  } else if (lower.endsWith('.rar')) {
    await extractRar(srcPath, tmpDir)
  } else if (lower.endsWith('.fbx')) {
    await fs.copyFile(srcPath, path.join(tmpDir, path.basename(srcPath)))
  } else {
    throw new Error(`Unsupported source format: ${srcPath}`)
  }

  // Prefer GLB if the pack ships one; otherwise fall back to FBX → convert.
  const glbs = await findFiles(tmpDir, ['.glb'])
  if (glbs.length) return glbs[0]

  const fbxs = await findFiles(tmpDir, ['.fbx'])
  if (!fbxs.length) throw new Error(`No .glb or .fbx inside ${srcPath}`)

  const fbx = fbxs[0]
  // 3ds Max FBX exports embed material names with _Diffuse / _Specular
  // suffixes that the FBX SDK then looks for as filenames — but vendors
  // ship the files without those suffixes (e.g. SugarMapleLeaves_1.png
  // rather than SugarMapleLeaves_1_Diffuse.png). Pre-stage aliased copies
  // next to the FBX so fbx2gltf resolves them.
  const fbxDir = path.dirname(fbx)
  await prepareTexturesForFbx(tmpDir, fbxDir)
  // Invoke the binary directly with cwd = fbxDir so the FBX SDK's
  // texture-search fallback (which uses cwd, NOT the FBX file's dir)
  // can find our staged + aliased PNGs. The npm wrapper doesn't let us
  // set cwd.
  const { default: os } = await import('node:os')
  const tool = path.join(REPO_ROOT, 'node_modules/fbx2gltf/bin', os.type(), 'FBX2glTF')
  const out = path.join(fbxDir, 'converted.glb')
  console.log(`[publish-glb] FBX → GLB: ${path.basename(fbx)}`)
  await execAsyncWithCwd(tool, [
    '--pbr-metallic-roughness',
    '--binary',
    '-i', fbx,
    '-o', out.replace(/\.glb$/, ''),
  ], fbxDir)
  // fbx2gltf preserves material names but loses texture bindings when the
  // FBX has Windows-only embedded paths (3ds Max exports). Rebind here by
  // matching material names to texture files in the staging dir.
  await rebindTexturesByMaterialName(out, fbxDir)
  return out
}

// After fbx2gltf produces a (often textureless) GLB, walk each material and
// attach textures from the staging dir by:
//   1. Stripping vendor-specific material-name suffixes (_Mat, _Mat_2Sided,
//      _Material, _Mtl, _2Sided) to get a "stem" prefix.
//   2. Scanning all textures in the dir, classifying each by suffix into
//      baseColor / normal / alpha, keying by the stripped texture stem.
//   3. For each material, looking up by progressively-shorter prefix until
//      a match is found.
//   4. Compositing diffuse + alpha → RGBA when alpha is a separate file
//      (so leaf cards render correctly with alphaMode MASK).
//
// Suffix conventions we accept:
//   base color: _Diffuse / _Color / _Albedo / _Base / (no suffix)
//   normal:     _Normal / _NRM / _bump / _BumpMap
//   alpha:      _Alpha / _Opacity / _Mask / _Op
async function rebindTexturesByMaterialName(glbPath, textureDir) {
  const sharp = (await import('sharp')).default
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const doc = await io.read(glbPath)

  // Classify every texture in the dir by suffix → stem → role.
  const textures = { base: new Map(), normal: new Map(), alpha: new Map() }
  for (const f of await fs.readdir(textureDir)) {
    if (!/\.(png|jpe?g|tga)$/i.test(f)) continue
    const ext = f.slice(f.lastIndexOf('.'))
    const stemRaw = f.slice(0, -ext.length)
    const stem = stemRaw.toLowerCase()
    const full = path.join(textureDir, f)
    let role = null, baseStem = stem

    // Order matters: longest suffix wins. _Normal_Alpha must classify as
    // alpha (it's the alpha mask of the normal — typically discarded), not
    // normal. We check alpha first because some files contain _Normal_Alpha.
    const tryStrip = (suffix, key) => {
      const re = new RegExp(`_(?:${suffix})$`, 'i')
      if (re.test(stem)) { role = key; baseStem = stem.replace(re, ''); return true }
      return false
    }
    if (tryStrip('alpha|opacity|mask|op', 'alpha')) {}
    else if (tryStrip('normal_alpha|normal|nrm|bump|bumpmap', 'normal')) {
      // Strip another _Mat_2Sided / _Mat / _2Sided so the *normal* base stem
      // matches the diffuse's base stem (vendors often append _Mat_2Sided
      // before _bump but not before nothing).
      baseStem = baseStem.replace(/_(?:mat_2sided|2sided|mat|material|mtl)$/i, '')
    }
    else if (tryStrip('diffuse|color|albedo|base', 'base')) {}
    else { role = 'base' /* no suffix → assume base color */ }

    if (!textures[role].has(baseStem)) textures[role].set(baseStem, full)
  }

  // Generate progressive prefix candidates from a material name.
  // "Branches_04_Mat_2Sided" → ["branches_04_mat_2sided", "branches_04_mat", "branches_04"]
  const candidatesFor = (matName) => {
    const list = [matName.toLowerCase()]
    let cur = matName
    while (true) {
      const next = cur.replace(/_(?:mat_2sided|2sided|mat|material|mtl|fall|autumn|automn|spring|summer|winter)$/i, '')
      if (next === cur) break
      cur = next
      list.push(cur.toLowerCase())
    }
    return list
  }

  let bound = 0
  for (const material of doc.getRoot().listMaterials()) {
    const name = material.getName()
    if (!name) continue
    const candidates = candidatesFor(name)
    const lookup = (map) => { for (const c of candidates) if (map.has(c)) return map.get(c); return null }
    const baseColorPath = lookup(textures.base)
    const normalPath    = lookup(textures.normal)
    const alphaPath     = lookup(textures.alpha)

    if (!baseColorPath) continue

    // Composite diffuse + alpha → RGBA when alpha is a separate file.
    let baseColorBuffer
    if (alphaPath) {
      try {
        const diffuse = sharp(baseColorPath).ensureAlpha()
        const alpha = await sharp(alphaPath).greyscale().raw().toBuffer({ resolveWithObject: true })
        const meta = await diffuse.metadata()
        const alphaMatch = await sharp(alphaPath)
          .resize(meta.width, meta.height, { fit: 'fill' })
          .greyscale()
          .raw()
          .toBuffer()
        const rgb = await sharp(baseColorPath)
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true })
        // Build RGBA buffer interleaved.
        const out = Buffer.alloc(rgb.info.width * rgb.info.height * 4)
        for (let i = 0, j = 0, k = 0; i < rgb.info.width * rgb.info.height; i++, j += 3, k += 4) {
          out[k]     = rgb.data[j]
          out[k + 1] = rgb.data[j + 1]
          out[k + 2] = rgb.data[j + 2]
          out[k + 3] = alphaMatch[i]
        }
        baseColorBuffer = await sharp(out, { raw: { width: rgb.info.width, height: rgb.info.height, channels: 4 } })
          .png()
          .toBuffer()
        material.setAlphaMode('MASK')
        material.setAlphaCutoff(0.5)
        material.setDoubleSided(true)
      } catch (err) {
        console.warn(`  alpha composite failed for ${name}: ${err.message}`)
        baseColorBuffer = await fs.readFile(baseColorPath)
      }
    } else {
      baseColorBuffer = await fs.readFile(baseColorPath)
    }

    const baseTex = doc.createTexture(`${name}_BaseColor`)
    baseTex.setImage(baseColorBuffer)
    baseTex.setMimeType('image/png')
    material.setBaseColorTexture(baseTex)

    if (normalPath) {
      const normalBuffer = await fs.readFile(normalPath)
      const normalTex = doc.createTexture(`${name}_Normal`)
      normalTex.setImage(normalBuffer)
      normalTex.setMimeType('image/png')
      material.setNormalTexture(normalTex)
    }
    bound++
  }

  console.log(`[publish-glb] rebound textures on ${bound}/${doc.getRoot().listMaterials().length} materials`)
  await io.write(glbPath, doc)
}

function execAsyncWithCwd(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd })
    let stderr = ''
    child.stderr.on('data', d => stderr += d)
    child.stdout.on('data', () => {}) // drain
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`FBX2glTF failed (code ${code}): ${stderr.slice(-500)}`))
    })
  })
}

// Walk every PNG/JPG under the staging tree, copy it next to the FBX, and
// create aliased copies for the common 3ds Max suffix conventions FBX2glTF
// expects (texture-slot suffixes: _Diffuse, _Specular).
async function prepareTexturesForFbx(stagingRoot, fbxDir) {
  const allImages = await findFiles(stagingRoot, ['.png', '.jpg', '.jpeg', '.tga'])
  const known = new Set()
  // Collect basenames already present (don't double-copy).
  try {
    for (const n of await fs.readdir(fbxDir)) known.add(n)
  } catch {}

  for (const src of allImages) {
    const base = path.basename(src)
    const ext = path.extname(base)
    const stem = base.slice(0, -ext.length)
    // Flatten into fbxDir.
    if (path.dirname(src) !== fbxDir) {
      const dst = path.join(fbxDir, base)
      if (!known.has(base)) {
        try { await fs.copyFile(src, dst); known.add(base) } catch {}
      }
    }
    // Alias rules:
    //   foo.png        → also foo_Diffuse.png
    //   foo_Spec.png   → also foo_Specular.png
    //   (Normal/Alpha already match the canonical names)
    const aliases = []
    if (!/_(Diffuse|Specular|Normal|Alpha|Roughness|Metallic|Spec)$/i.test(stem)) {
      aliases.push(`${stem}_Diffuse${ext}`)
    }
    if (/_Spec$/i.test(stem)) {
      aliases.push(`${stem.slice(0, -5)}_Specular${ext}`)
    }
    for (const alias of aliases) {
      if (known.has(alias)) continue
      try { await fs.copyFile(src, path.join(fbxDir, alias)); known.add(alias) } catch {}
    }
  }
}

// ── Variant detection (the "machete" cleanup) ─────────────────────────────
// Vendor packs split scenes three ways:
//   1. Per-variant: top-level nodes named "Maple-Tree_01", "_02"… numeric suffix.
//   2. Forest scene: multiple trees, each a distinct subtree, positioned at
//      different XZ translations (e.g. cedar's CyprusCedar_Small/Mid/High).
//   3. Per-shading-group / single tree: nodes like "BranchesSG", "LeavesSG"
//      all centered at the same XZ position — parts of one tree.
// We detect by checking, at the deepest level where >1 mesh-bearing child
// exists, whether (a) names share a numeric-suffix pattern OR (b) their
// XZ translations are separated by ≥ 2m. Either signal → split per child.

function nodeContainsMesh(node) {
  if (node.getMesh && node.getMesh()) return true
  for (const c of node.listChildren()) if (nodeContainsMesh(c)) return true
  return false
}

function namesSuggestVariants(names) {
  const prefixes = new Map()
  for (const name of names) {
    const prefix = (name || '').replace(/[_-]?\d+$/, '')
    prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1)
  }
  for (const count of prefixes.values()) if (count >= 2) return true
  return false
}

function dist2D(a, b) { return Math.hypot(a[0]-b[0], a[1]-b[1]) }

function nodesSpatiallySeparated(nodes, threshold = 2.0) {
  const xz = nodes.map(n => { const t = n.getTranslation(); return [t[0], t[2]] })
  for (let i = 0; i < xz.length; i++) {
    for (let j = i+1; j < xz.length; j++) {
      if (dist2D(xz[i], xz[j]) >= threshold) return true
    }
  }
  return false
}

// Walk down through single-mesh-child chains; stop at the first level where
// either (a) >1 mesh-bearing child exists with multi-tree signal, or (b) we
// hit a single node with mesh.
function findSplitLevel(node) {
  const meshChildren = node.listChildren().filter(nodeContainsMesh)
  if (meshChildren.length === 0) return { mode: 'single', node }
  if (meshChildren.length === 1) return findSplitLevel(meshChildren[0])
  const names = meshChildren.map(n => n.getName() || '')
  if (namesSuggestVariants(names) || nodesSpatiallySeparated(meshChildren)) {
    return { mode: 'multi', children: meshChildren }
  }
  return { mode: 'single', node }
}

async function listVariants(io, sourceGlbPath) {
  const doc = await io.read(sourceGlbPath)
  const scene = doc.getRoot().listScenes()[0]
  const result = findSplitLevel(scene)
  if (result.mode === 'single') {
    return { mode: 'single', variants: [{ keepNames: ['__all__'], sourceName: 'whole-scene' }] }
  }
  return {
    mode: 'nodes',
    variants: result.children.map(n => ({
      keepNames: [n.getName() || `cluster-${result.children.indexOf(n)+1}`],
      sourceName: n.getName() || `cluster-${result.children.indexOf(n)+1}`,
    })),
  }
}

// Build a Document containing one variant.
//   variant.keepNames === ['__all__'] → keep entire scene (single mode).
//   otherwise                         → keep only nodes whose names match.
//   Removes everything else, then prunes orphaned materials / textures.
async function loadVariantDocument(io, sourceGlbPath, variant) {
  const doc = await io.read(sourceGlbPath)
  if (variant.keepNames[0] === '__all__') {
    await doc.transform(prune())
    return doc
  }
  const scene = doc.getRoot().listScenes()[0]
  // Walk recursively; for each node, if its name matches a keep-name, mark it
  // (and all ancestors) keep. Then detach all unmarked top-level chains.
  const keepSet = new Set()
  function markIfKept(node) {
    let kept = variant.keepNames.includes(node.getName())
    for (const c of node.listChildren()) {
      if (markIfKept(c)) kept = true
    }
    if (kept) keepSet.add(node)
    return kept
  }
  for (const c of scene.listChildren()) markIfKept(c)
  // Recursively remove non-kept children.
  function pruneNonKept(parent) {
    for (const c of [...parent.listChildren()]) {
      if (!keepSet.has(c)) parent.removeChild(c)
      else pruneNonKept(c)
    }
  }
  pruneNonKept(scene)
  await doc.transform(prune())
  return doc
}

// ── Cleanup transforms applied to each variant doc ────────────────────────
// Materials whose baseColorTexture couldn't be rebound get a sensible solid
// fallback color based on the material name (so trunks aren't bright white).
function colorForMaterialName(name) {
  const n = (name || '').toLowerCase()
  if (/bark|trunk|wood|stem|stump/.test(n))                  return [0.32, 0.22, 0.16, 1] // brown
  if (/needle|conifer|spruce|pine|cedar|fir/.test(n))        return [0.20, 0.36, 0.20, 1] // dark green
  if (/leaf|leaves|foliage|branches?|cap|canopy/.test(n))    return [0.28, 0.45, 0.22, 1] // leaf green
  if (/flower|bloom|petal/.test(n))                          return [0.85, 0.80, 0.85, 1] // off-white pink
  if (/fruit|berry/.test(n))                                 return [0.55, 0.20, 0.20, 1] // red-brown
  return [0.45, 0.40, 0.32, 1]                                                            // neutral mid
}
function fallbackColorsForUnboundMaterials(doc) {
  let touched = 0
  for (const material of doc.getRoot().listMaterials()) {
    if (material.getBaseColorTexture()) continue
    material.setBaseColorFactor(colorForMaterialName(material.getName()))
    touched++
  }
  return touched
}

// Vendor packs often ship helper meshes alongside the actual tree —
// preview cards, ad backdrops, ground rings, logo planes. They wreck the
// bbox and (worse) end up in the published GLB. Drop nodes whose name
// matches a known-junk pattern OR whose mesh is below a triangle floor.
const HELPER_NAME_PATTERN = /\b(plane|backdrop|background|card|preview|placeholder|helper|ground|floor|logo|watermark|ad_?card|grid|board|cyclorama|cyc|stage|signpost|ruler)\b/i
const MIN_TRIS_FOR_KEEP = 50

// Realistic urban-tree heights (meters) per category. normalizeScale at
// publish time normalizes vendor-units → these targets so the runtime
// renders consistent sizes regardless of how the source pack authored.
const TARGET_HEIGHT = {
  broadleaf: 12,
  conifer: 18,
  ornamental: 6,
  weeping: 10,
  columnar: 12,
  unusual: 10,
}

function meshTriCount(mesh) {
  let total = 0
  for (const prim of mesh.listPrimitives()) {
    const indices = prim.getIndices()
    if (indices) total += indices.getCount() / 3
    else {
      const pos = prim.getAttribute('POSITION')
      if (pos) total += pos.getCount() / 3
    }
  }
  return total
}

function filterHelperMeshes(doc) {
  let removed = 0
  // Snapshot first; disposing while iterating breaks the list.
  const nodes = [...doc.getRoot().listNodes()]
  for (const node of nodes) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const name = `${node.getName() || ''} ${mesh.getName() || ''}`.toLowerCase()
    const tris = meshTriCount(mesh)
    if (HELPER_NAME_PATTERN.test(name) || tris < MIN_TRIS_FOR_KEEP) {
      node.dispose()
      removed++
    }
  }
  return removed
}

// Approximate height in meters from the world-space Y-extent of all mesh
// primitives. We MUST account for node transforms: vendor packs commonly
// scale the parent node (e.g. tree authored at 0.4 raw units with a 50×
// node scale, or 303 units with a 1/15 scale). Reading POSITION min/max
// in mesh-local space gives wildly wrong heights and bad normalizeScale.
function multiplyMat4(a, b) {
  const out = new Array(16)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    let s = 0
    for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c]
    out[r * 4 + c] = s
  }
  return out
}
function transformPoint(m, p) {
  return [
    m[0]  * p[0] + m[1]  * p[1] + m[2]  * p[2] + m[3],
    m[4]  * p[0] + m[5]  * p[1] + m[6]  * p[2] + m[7],
    m[8]  * p[0] + m[9]  * p[1] + m[10] * p[2] + m[11],
  ]
}
function nodeWorldMatrix(node) {
  // Walk parents until we hit Scene/null. Scene has no getMatrix.
  let m = node.getMatrix()
  let p = node.getParentNode ? node.getParentNode() : null
  while (p && typeof p.getMatrix === 'function') {
    m = multiplyMat4(p.getMatrix(), m)
    p = p.getParentNode ? p.getParentNode() : null
  }
  return m
}
function computeApproxHeight(doc) {
  let minY = Infinity, maxY = -Infinity
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const worldM = nodeWorldMatrix(node)
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      if (!pos) continue
      const localMin = pos.getMin([])
      const localMax = pos.getMax([])
      // Transform all 8 corners of the local AABB to world space.
      for (let i = 0; i < 8; i++) {
        const corner = [
          (i & 1) ? localMax[0] : localMin[0],
          (i & 2) ? localMax[1] : localMin[1],
          (i & 4) ? localMax[2] : localMin[2],
        ]
        const w = transformPoint(worldM, corner)
        if (w[1] < minY) minY = w[1]
        if (w[1] > maxY) maxY = w[1]
      }
    }
  }
  if (!isFinite(minY) || !isFinite(maxY)) return null
  return Math.round((maxY - minY) * 10) / 10
}

// Default `styles` for the manifest's set-membership gate.
// Mirror this heuristic in arborist/migrate-add-styles.js. Operator overrides
// these in the Workstage rating UI.
function inferStyles(speciesId, source) {
  const id = (speciesId || '').toLowerCase()
  if (source === 'lidar')                                          return ['pointcloud', 'realistic']
  if (/burnt|dead/.test(id))                                       return ['winter']
  if (/_winter|winter_/.test(id))                                  return ['winter', 'realistic']
  if (/stylized|bonsai|garden_mix|tree_with_wind|tree_variation|yellow_autumn|willow_stylized|candicands/.test(id))
                                                                   return ['stylized']
  if (/lowpoly|low_poly/.test(id))                                 return ['stylized', 'lowpoly']
  return ['realistic']
}

// Guess a category from species-map metadata + a name heuristic fallback.
function guessCategory(speciesMeta, speciesId) {
  const id = (speciesId || '').toLowerCase()
  // Shape-distinct categories take precedence over species-meta morph hints.
  if (/cupressus_sempervirens|columnar|fastigiate/.test(id))                   return 'columnar'
  if (/salix_babylonica|weeping|willow/.test(id))                              return 'weeping'
  const morph = (speciesMeta?.leafMorph || '').toLowerCase()
  if (/needle|scale/.test(morph))                                              return 'conifer'
  if (/abies|picea|pinus|pseudotsuga|tsuga|juniperus|cedar|cedrus|cupressus|callitropsis|spruce|^fir|larix|thuja|taxus|douglas|alaskan_cedar|conifer/.test(id))
                                                                               return 'conifer'
  if (/palmate|lobed|ovate|cordate|compound|pinnate/.test(morph))              return 'broadleaf'
  if (speciesMeta?.hasFlowers)                                                 return 'ornamental'
  if (/magnolia|crabapple|dogwood|cherry|redbud|serviceberry|hawthorn|witchhazel|witch_hazel/.test(id))
                                                                               return 'ornamental'
  if (/baobab|palm|dracaena|bonsai|daisy/.test(id))                            return 'unusual'
  return 'broadleaf'
}

async function emitLod(doc, lod) {
  const lodDoc = cloneDocument(doc)
  await lodDoc.transform(
    weld(),
    dedup(),
    simplify({ simplifier: MeshoptSimplifier, ratio: lod.ratio, error: lod.error }),
    textureCompress({ targetFormat: 'webp', resize: [lod.textureSize, lod.textureSize] }),
  )
  return lodDoc
}

async function main() {
  const args = parseArgs()
  if (!args.source || !args.species) {
    console.error('Usage: --source <glb|zip> --species <id> [--label "..."] [--scientific "..."]')
    process.exit(1)
  }

  const sourceArg = path.resolve(REPO_ROOT, args.source)
  const sourceGlb = await resolveSourceGlb(sourceArg)
  const outDir = path.join(REPO_ROOT, 'public/trees', args.species)
  await fs.mkdir(outDir, { recursive: true })

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

  // Read species-map.json for shader/morph metadata if present.
  let speciesMeta = {}
  try {
    const map = JSON.parse(await fs.readFile(path.join(__dirname, 'species-map.json'), 'utf8'))
    speciesMeta = map.species?.[args.species] || {}
  } catch {}

  console.log(`[publish-glb] source: ${sourceGlb}`)
  console.log(`[publish-glb] target: public/trees/${args.species}/`)

  // leafTypes.json holds per-leafMorph color palettes used as fallbacks if
  // species-map.json doesn't define tints for this species. (Useful for
  // Low Poly Collection species that aren't in species-map.)
  let leafTypeForSpecies = null
  try {
    const lt = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'src/data/leafTypes.json'), 'utf8'))
    if (speciesMeta.leafMorph) {
      leafTypeForSpecies = lt.types.find(t => t.id === speciesMeta.leafMorph) || null
    }
  } catch {}

  const { mode, variants } = await listVariants(io, sourceGlb)
  console.log(`[publish-glb] variant mode: ${mode} (${variants.length} ${variants.length === 1 ? 'variant' : 'variants'})`)

  const category = guessCategory(speciesMeta, args.species)
  const defaultStyles = inferStyles(args.species, 'glb')

  // Read existing manifest (if any) and capture per-variant operator
  // overrides so a republish doesn't blow them away. Rating UI writes
  // these fields; preserved here by variant id.
  const existingOverrides = new Map()
  let speciesOverrides = {}
  try {
    const prev = JSON.parse(await fs.readFile(path.join(outDir, 'manifest.json'), 'utf8'))
    for (const k of ['displayName', 'displayNotes']) {
      if (prev[k] !== undefined) speciesOverrides[k] = prev[k]
    }
    for (const v of prev.variants ?? []) {
      const ov = {}
      for (const k of ['qualityOverride', 'stylesOverride', 'scaleOverride', 'positionOverride', 'rotationOverride', 'excluded', 'operatorNotes']) {
        if (v[k] !== undefined) ov[k] = v[k]
      }
      if (Object.keys(ov).length) existingOverrides.set(v.id, ov)
    }
    if (existingOverrides.size) console.log(`[publish-glb] preserving overrides on ${existingOverrides.size} variant(s)`)
  } catch { /* no prior manifest, no overrides */ }

  const manifestVariants = []
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i]
    const variantId = i + 1
    console.log(`\n[publish-glb] variant ${variantId}/${variants.length}: ${v.sourceName}`)

    const variantDoc = await loadVariantDocument(io, sourceGlb, v)
    const helpersRemoved = filterHelperMeshes(variantDoc)
    if (helpersRemoved) console.log(`  filtered ${helpersRemoved} helper mesh node(s)`)
    const fallbackTouched = fallbackColorsForUnboundMaterials(variantDoc)
    if (fallbackTouched) console.log(`  fallback color set on ${fallbackTouched} unbound material(s)`)
    const approxHeightM = computeApproxHeight(variantDoc)
    const skeletons = {}

    for (const lod of LODS) {
      const t0 = Date.now()
      const lodDoc = await emitLod(variantDoc, lod)
      const filename = `skeleton-${variantId}-${lod.id}.glb`
      const outPath = path.join(outDir, filename)
      await io.write(outPath, lodDoc)
      const stats = await fs.stat(outPath)
      const tris = countTris(lodDoc)
      console.log(`  ${lod.id}: ${tris.toLocaleString()} tris, ${(stats.size / 1024).toFixed(0)} KB, ${Date.now() - t0}ms`)
      skeletons[lod.id] = filename
    }

    const target = TARGET_HEIGHT[category] ?? TARGET_HEIGHT.broadleaf
    const normalizeScale = (typeof approxHeightM === 'number' && approxHeightM > 0.001)
      ? +(target / approxHeightM).toFixed(6)
      : 1
    const entry = {
      id: variantId,
      sourceName: v.sourceName,
      sourceFile: path.relative(REPO_ROOT, sourceArg),
      skeletons,
      // Operator-overridable rating, fitness-for-purpose ladder:
      //   0 = Untouched (sentinel — runtime excludes until rated)
      //   1 = Trash, 2 = Fill, 3 = Mid, 4 = Hero
      // Default 0 means newly published variants need an operator pass
      // before they appear in the runtime pool — keeps junk out by default.
      quality: 0,
      category,
      styles: defaultStyles,
      approxHeightM,
      normalizeScale,
    }
    const ov = existingOverrides.get(variantId)
    if (ov) Object.assign(entry, ov)
    manifestVariants.push(entry)
  }

  const manifest = {
    species: args.species,
    label: args.label || speciesMeta.label || args.species,
    scientific: args.scientific || speciesMeta.scientific || null,
    ...speciesOverrides,
    source: 'glb',
    tier: speciesMeta.tier || 'unrated',
    leafMorph: speciesMeta.leafMorph || null,
    barkMorph: speciesMeta.barkMorph || null,
    deciduous: speciesMeta.deciduous ?? true,
    hasFlowers: speciesMeta.hasFlowers ?? false,
    tints: speciesMeta.tints || (leafTypeForSpecies ? { palette: leafTypeForSpecies.colors } : null),
    category,
    defaultStyles,
    variantMode: mode,
    variants: manifestVariants,
    bakedAt: Date.now(),
  }
  await fs.writeFile(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  )
  console.log(`\n[publish-glb] wrote manifest.json (${manifestVariants.length} variants × ${LODS.length} LODs)`)

  const idx = await rebuildIndex()
  console.log(`[publish-glb] rebuilt index.json (${idx.speciesCount} species, ${idx.variantCount} variants)`)
}

function countTris(doc) {
  let count = 0
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices()
      if (indices) count += indices.getCount() / 3
      else {
        const pos = prim.getAttribute('POSITION')
        if (pos) count += pos.getCount() / 3
      }
    }
  }
  return Math.round(count)
}

main().catch((err) => {
  console.error('[publish-glb] FAILED:', err)
  process.exit(1)
})
