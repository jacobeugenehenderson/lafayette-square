/**
 * backfill-wood-coverage.js — stamp `woodCoverage` into every chassis meta.json,
 * non-destructively (reads the GLBs, writes only the .meta.json sidecars; never
 * touches geometry).
 *
 * WHY: some vendor variants are modeled LEAVES-FIRST — the wood is a throwaway
 * stub (~100-300 tris) that stops partway up, meant to hide under a dense canopy.
 * Strip the leaves for a chassis silhouette and you get "loose branches" (Jacob,
 * 2026-07-10, Black Gum case study). The extractor is faithful — it keeps whole
 * vendor prims — so the fix isn't a better carve (there are no branch tips to
 * follow; the source never modeled them). The fix is to DETECT + set them aside.
 *
 * The discriminator is wood-height COVERAGE, not poly count (thin conifers have
 * few wood tris but their spire reaches the crown → coverage ~0.95, correctly
 * kept). coverage = (Y-span of the WOOD prims) / (Y-span of the whole chassis).
 * Stub wood reads < ~0.65; real wood reads ≥ ~0.85.
 *
 * survey-deleaf.js stamps this at extraction going forward; this backfill covers
 * the library that already exists (incl. orphan variants whose vendor source is
 * gone). Idempotent — re-run any time.
 *
 * Run:  node arborist/backfill-wood-coverage.js
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { readdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CHASSIS_DIR = path.join(__dirname, '..', 'public/trees/_chassis')
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

// Wood = prims stamped atlasKind='bark' (survey-deleaf's WOOD class). Returns
// null when a chassis has no distinct wood prim (e.g. a single merged mesh),
// so the caller doesn't flag what it can't measure.
export async function computeWoodCoverageFromDoc(doc) {
  const el = []
  let wYmin = Infinity, wYmax = -Infinity, aYmin = Infinity, aYmax = -Infinity, hasWood = false
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const isWood = (prim.getExtras() || {}).atlasKind === 'bark'
      const pos = prim.getAttribute('POSITION')
      if (!pos) continue
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, el)
        if (el[1] < aYmin) aYmin = el[1]
        if (el[1] > aYmax) aYmax = el[1]
        if (isWood) {
          if (el[1] < wYmin) wYmin = el[1]
          if (el[1] > wYmax) wYmax = el[1]
          hasWood = true
        }
      }
    }
  }
  const totH = aYmax - aYmin
  if (!hasWood || totH <= 0) return null
  return Math.round(((wYmax - wYmin) / totH) * 100) / 100
}

async function main() {
  const files = (await readdir(CHASSIS_DIR)).filter(f => f.endsWith('.glb'))
  let stamped = 0, skipped = 0, flagged = 0
  const FLOOR = 0.65
  for (const f of files) {
    const stem = f.replace(/\.glb$/, '')
    const metaPath = path.join(CHASSIS_DIR, `${stem}.meta.json`)
    let meta
    try { meta = JSON.parse(await readFile(metaPath, 'utf8')) } catch { skipped++; continue }
    const doc = await io.read(path.join(CHASSIS_DIR, f))
    const cov = await computeWoodCoverageFromDoc(doc)
    meta.woodCoverage = cov
    await writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n')
    stamped++
    if (cov != null && cov < FLOOR) { flagged++; console.log(`  stub-wood ${cov.toFixed(2)}  ${stem}`) }
  }
  console.log(`\n[wood-coverage] stamped ${stamped} · skipped ${skipped} (no meta) · below ${FLOOR}: ${flagged}`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
