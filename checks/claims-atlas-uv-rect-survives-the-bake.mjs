/**
 * A UV RECTANGLE MUST SURVIVE THE ATLAS BAKE UNMOVED.
 *
 * `bake-look#transformUVs` packs a GLB's UVs into its atlas tile with `× scale + offset`
 * — a linear map. In front of it sits a `frac()` wrap that exists for BARK, which tiles
 * up the trunk and cannot tile inside an atlas. `frac()` is not linear: `frac(1.0) === 0`.
 *
 * ⛔ THE DEFECT THIS EXISTS FOR (Jacob's eye, 2026-08-26). A composed leaf canopy is ONE
 * CELL of one pack — a rectangle inside [0,1], not a repeat. `oak_white`'s leaf UVs are
 * exactly 0.5 or exactly 1.0; the wrap sent all 221,668 of the 1.0s to 0 and slid the
 * canopy one cell sideways in a four-cell MIXED-SEASON pack. The Salon rewrites through
 * the same helper and the Grove renders the published bytes raw, so the two surfaces
 * painted one tree from two different cells — green in one, red in the other.
 *
 * ⭐ WHY THIS IS THE CHECK AND NOT A THRESHOLD. It needs no species list, no pack, no
 * operator who has already looked at the tree: it asserts a rectangle in equals the same
 * rectangle out, for every baked primitive in every look. A town nobody has opened gets
 * it free, and it fails LOUDLY naming the species, the material and both rectangles.
 *
 *   node scratch/claims-atlas-uv-rect-survives-the-bake.mjs [look ...]
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const BAKED = path.join(ROOT, 'public/baked')
const PUB = path.join(ROOT, 'public/trees')
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const EPS = 1e-4

function prims(doc) {
  const out = []
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const a = prim.getAttribute('TEXCOORD_0'); if (!a) continue
    const uvs = a.getArray()
    let mu = Infinity, Mu = -Infinity, mv = Infinity, Mv = -Infinity
    for (let i = 0; i < uvs.length; i += 2) {
      const u = uvs[i], v = uvs[i + 1]
      if (u < mu) mu = u; if (u > Mu) Mu = u; if (v < mv) mv = v; if (v > Mv) Mv = v
    }
    out.push({ mesh: mesh.getName(), mat: prim.getMaterial()?.getName(),
               extras: prim.getExtras() || {}, n: uvs.length / 2, mu, Mu, mv, Mv })
  }
  return out
}

const looks = process.argv.slice(2).length ? process.argv.slice(2)
  : (existsSync(BAKED) ? readdirSync(BAKED).filter(d => statSync(path.join(BAKED, d)).isDirectory()) : [])

let checked = 0, fail = 0, skipped = 0
for (const look of looks) {
  const manifestPath = path.join(BAKED, look, 'trees-atlas.json')
  const treesDir = path.join(BAKED, look, 'trees')
  if (!existsSync(manifestPath) || !existsSync(treesDir)) continue
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const tileOf = new Map()
  for (const t of (manifest.tiles || [])) tileOf.set(`${t.classification}|${t.tileIndex}`, t.uvTransform)

  for (const sp of readdirSync(treesDir).sort()) {
    const dir = path.join(treesDir, sp)
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue
    for (const f of readdirSync(dir).filter(f => f.endsWith('.glb')).sort()) {
      const bakedFile = path.join(dir, f)
      const srcFile = path.join(PUB, sp, f)
      if (!existsSync(srcFile)) { skipped++; continue }
      let b, s
      try { b = prims(await io.read(bakedFile)); s = prims(await io.read(srcFile)) }
      catch (err) { console.log(`  ! ${look}/${sp}/${f}: ${err.message}`); skipped++; continue }
      if (b.length !== s.length) {
        console.log(`⛔ ${look}/${sp}/${f}: ${s.length} published prims vs ${b.length} baked — cannot pair`)
        fail++; continue
      }
      for (let i = 0; i < b.length; i++) {
        const bp = b[i], sp2 = s[i]
        if (bp.n !== sp2.n) {
          console.log(`⛔ ${look}/${sp}/${f} prim ${i}: ${sp2.n} verts published vs ${bp.n} baked — cannot pair`)
          fail++; continue
        }
        const t = tileOf.get(`${bp.extras.atlasKind}|${bp.extras.atlasTileIndex}`)
        if (!t) { skipped++; continue }
        // Only a RECTANGLE makes a claim here. A UV set that leaves [0,1] on an axis is
        // asking to tile, and tiling inside an atlas is the deferred Phase B.2 question.
        const rectU = sp2.mu >= -EPS && sp2.Mu <= 1 + EPS
        const rectV = sp2.mv >= -EPS && sp2.Mv <= 1 + EPS
        if (!rectU && !rectV) { skipped++; continue }
        checked++
        const bad = []
        if (rectU) {
          const eu0 = sp2.mu * t.scaleU + t.offsetU, eu1 = sp2.Mu * t.scaleU + t.offsetU
          if (Math.abs(bp.mu - eu0) > EPS || Math.abs(bp.Mu - eu1) > EPS)
            bad.push(`U expected [${eu0.toFixed(6)}, ${eu1.toFixed(6)}] got [${bp.mu.toFixed(6)}, ${bp.Mu.toFixed(6)}]`)
        }
        if (rectV) {
          const ev0 = sp2.mv * t.scaleV + t.offsetV, ev1 = sp2.Mv * t.scaleV + t.offsetV
          if (Math.abs(bp.mv - ev0) > EPS || Math.abs(bp.Mv - ev1) > EPS)
            bad.push(`V expected [${ev0.toFixed(6)}, ${ev1.toFixed(6)}] got [${bp.mv.toFixed(6)}, ${bp.Mv.toFixed(6)}]`)
        }
        if (bad.length) {
          fail++
          console.log(`⛔ ${look}/${sp}/${f} — ${bp.mesh}/${sp2.mat} (${bp.extras.atlasKind})`)
          console.log(`   published rect U[${sp2.mu.toFixed(4)}, ${sp2.Mu.toFixed(4)}] V[${sp2.mv.toFixed(4)}, ${sp2.Mv.toFixed(4)}]`)
          for (const m of bad) console.log(`   ${m}`)
        }
      }
    }
  }
}

console.log(`\nrectangles checked: ${checked}   moved by the bake: ${fail}   unpairable/tiling/skipped: ${skipped}`)
if (fail) {
  console.log(`\n⛔ FAIL — a UV rectangle moved between the published GLB and the baked one.`)
  console.log(`   A linear pack-into-tile cannot do that. Something non-linear ran in front of it`)
  console.log(`   (see bake-look#transformUVs), and the two surfaces are now painting different`)
  console.log(`   parts of the atlas for the same tree.`)
  process.exit(1)
}
console.log('✅ PASS — every UV rectangle survived the bake unmoved.')
