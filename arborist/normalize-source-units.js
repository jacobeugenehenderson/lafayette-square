/**
 * normalize-source-units.js — one-shot rescale of a species' GLBs whose
 * vendor source was authored in cm (or otherwise huge raw units) without a
 * compensating node-level scale.
 *
 * Symptom: local POSITION bounds in the kilo range; manifest.normalizeScale
 * comes out absurdly tiny (e.g. 0.007). Mathematically the world height is
 * correct, but at that ratio three.js's frustum culling, bounding-sphere
 * math, and downstream centroid helpers (computeDominantTrunk) operate on
 * raw local-space numbers and behave unreliably — variants render either
 * not at all or at a huge offset.
 *
 * Fix: pre-multiply a constant into vertex POSITION arrays so local bounds
 * collapse to a normal range, then divide the manifest's approxHeightM and
 * multiply normalizeScale by the same factor. Net world-space size is
 * unchanged; runtime behaves like every other species.
 *
 * Usage: node arborist/normalize-source-units.js --species <id> --factor 0.01
 *
 * Idempotency: the script tags manifest.json with `unitNormalizationApplied`
 * so repeat invocations are safe (it'll skip).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const TREES_DIR = path.join(REPO_ROOT, 'public/trees')
const LODS = ['lod0', 'lod1', 'lod2']

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

async function rescaleGLB(file, factor) {
  const doc = await io.read(file)
  let primCount = 0, vertCount = 0
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      if (!pos) continue
      const arr = pos.getArray()
      const writable = arr instanceof Float32Array ? arr : new Float32Array(arr)
      for (let i = 0; i < writable.length; i++) writable[i] *= factor
      // setArray re-derives min/max internally on serialize; no manual
      // setMin/setMax needed (and the API doesn't expose them).
      pos.setArray(writable)
      primCount++
      vertCount += writable.length / 3
    }
  }
  await io.write(file, doc)
  return { primCount, vertCount }
}

async function main() {
  const args = process.argv.slice(2)
  const speciesIdx = args.indexOf('--species')
  const factorIdx = args.indexOf('--factor')
  if (speciesIdx === -1 || factorIdx === -1) {
    console.error('Usage: node arborist/normalize-source-units.js --species <id> --factor <number>')
    process.exit(2)
  }
  const speciesId = args[speciesIdx + 1]
  const factor = Number(args[factorIdx + 1])
  if (!speciesId || !Number.isFinite(factor) || factor <= 0) {
    console.error('Bad args. species + positive factor required.')
    process.exit(2)
  }

  const dir = path.join(TREES_DIR, speciesId)
  const manifestPath = path.join(dir, 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))

  if (manifest.unitNormalizationApplied) {
    console.error(`already normalized (unitNormalizationApplied=${manifest.unitNormalizationApplied}). Aborting.`)
    process.exit(1)
  }

  console.log(`Rescaling ${speciesId} by factor ${factor}`)
  for (const v of manifest.variants) {
    for (const lod of LODS) {
      const f = path.join(dir, `skeleton-${v.id}-${lod}.glb`)
      try {
        const r = await rescaleGLB(f, factor)
        console.log(`  v${v.id} ${lod}: ${r.primCount} prims / ${r.vertCount} verts`)
      } catch (err) {
        console.log(`  v${v.id} ${lod}: ERROR ${err.message}`)
      }
    }
    // Update per-variant manifest fields. approxHeightM was raw-units-as-meters;
    // shrink by factor. normalizeScale was target/approxHeight; grow by
    // 1/factor so target × factor / (approxHeight × factor) = target / approxHeight.
    if (typeof v.approxHeightM === 'number') v.approxHeightM = +(v.approxHeightM * factor).toFixed(4)
    if (typeof v.normalizeScale === 'number') v.normalizeScale = +(v.normalizeScale / factor).toFixed(6)
  }
  manifest.unitNormalizationApplied = factor
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`Wrote manifest with unitNormalizationApplied=${factor}`)
}

main().catch(err => { console.error(err); process.exit(1) })
