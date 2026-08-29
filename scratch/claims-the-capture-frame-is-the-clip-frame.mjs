/**
 * THE FRAME A BAND IS CUT IN MUST BE THE FRAME THE CAMERA CLIPS IN.
 *
 * ⛔ THE DEFECT (2026-08-28). `prepareOverheadBands` cut the three overhead bands from raw
 * `position.y` — the chassis-LOCAL frame — while `renderTreeToTexture` turns a cut into a
 * camera near/far pair as `camY − y`, i.e. it clips in WORLD space. Every roster GLB carries
 * a node scale, so the two frames differ by exactly that factor:
 *     scale ≥ 1  →  the cuts land INSIDE the crown  →  passes, always
 *     scale < 1  →  the TOP cut lands ABOVE the crown  →  the canopy band renders empty space
 * A band that renders nothing is a fully transparent PNG, which is indistinguishable from a
 * thin canopy — it shipped as a hole. Measured on lafayette-square before the fix:
 *     tilia_americana  scale 0.004  →  0% of every band contained geometry
 *     maple_silver     scale 0.707  →  2% of the canopy band   (the capture that "kept failing")
 *     birch            scale 0.828  → 12%
 *     linden_american  scale 0.782  → 27%   (the "unexplained" blank canopy of 2026-07-22)
 * and the POSTed card height was the local number too: maple_silver shipped 29.7 m for a
 * 21.0 m tree, maple_red 11.8 m for a 15.0 m one.
 *
 * ⭐ WHY THIS IS THE CHECK, not a fix for maple_silver. It asks two questions of every GLB the
 * capture would shoot, in any town, before anyone renders anything:
 *   ① do the band cuts intersect the tree they are cutting?  (the frame question)
 *   ② does the slab's stored heightM match the GLB it was captured from?  (the stale-record
 *      question — a look baked under the old code carries wrong card heights and must re-bake)
 * No thresholds tuned to LS, no species list, no operator who already knows which tree is short.
 *
 * ⚠️ PROXY, STATED NOT HIDDEN: the runtime guard measures ALPHA coverage of a render; this
 * measures VERTEX occupancy of the slab, which needs no GPU. Zero vertices ⇒ zero pixels, so
 * the hard failures below are sound; a band that is thin-but-populated may still be a bad
 * capture and this check will not say so. It is the cheap upstream sieve, not the eye.
 *
 *   node scratch/claims-the-capture-frame-is-the-clip-frame.mjs [look ...]
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'

const ROOT = path.join(import.meta.dirname, '..')
const BAKED = path.join(ROOT, 'public/baked')

// ⛔ PIN the rules the capture actually applies. If any of these move, this check is modelling
// code that no longer exists — it must say so rather than pass off a stale model.
const CAP = readFileSync(path.join(ROOT, 'src/components/captureImpostor.js'), 'utf8')
for (const [what, re] of [
  ['heightM is measured in WORLD (Box3 precise over the materialized root)',
    /const worldBox = new THREE\.Box3\(\)\.setFromObject\(root, true\)/],
  ['the canopy-base / extent scan is measured in WORLD (matrixWorld applied per vertex)',
    /function measureCanopyBaseWorld[\s\S]{0,900}applyMatrix4\(o\.matrixWorld\)/],
  ['the band cuts are branch/mid/canopy over [canopyBase, maxY], branch dipping 0.12·H',
    /key: 'branch'[\s\S]{0,80}Cb - 0\.12 \* H[\s\S]{0,200}key: 'canopy'[\s\S]{0,60}maxY/],
  ['a band cut becomes a camera near/far as camY − y',
    /near = Math\.max\(0\.01, camY - yHi\)[\s\S]{0,80}far = Math\.max\(near \+ 0\.05, camY - yLo\)/],
]) {
  if (!re.test(CAP)) {
    console.error(`⛔ PIN DRIFT — captureImpostor.js no longer says: "${what}".`)
    console.error(`   This check models a rule that has moved. Update it before trusting a pass.`)
    process.exit(2)
  }
}
const OB = readFileSync(path.join(ROOT, 'src/arborist/OverheadBaker.jsx'), 'utf8')
// The loud failure this check front-runs: one blank band refuses the whole species.
if (!/throw new Error\(`blank band\(s\)/.test(OB)) {
  console.error('⛔ PIN DRIFT — OverheadBaker.jsx no longer refuses a species on a blank band. Update this check.')
  process.exit(2)
}
const BLANK = Number((OB.match(/const BLANK_COVERAGE = ([\d.]+)/) || [])[1])
if (!Number.isFinite(BLANK)) {
  console.error('⛔ PIN DRIFT — OverheadBaker.jsx no longer declares BLANK_COVERAGE. Update this check.')
  process.exit(2)
}
// The frame-mismatch signature: a cut that barely grazes the tree. Distinct from BLANK, which
// is the render-side alpha floor — this one asks whether the SLAB intersects the geometry.
const MIN_BAND_INTERSECT = 0.15

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

// Read a GLB the way the capture sees it: every vertex pushed through its node's world matrix,
// leaf/bark split off `extras.atlasKind` (what stampTreeVertexAttrs turns into aBark).
async function readWorld(file) {
  const doc = await io.read(file)
  const ys = []
  let localMaxY = -Infinity, scale = 1
  let minY = Infinity, maxY = -Infinity, leafMinY = Infinity, sawLeaf = false
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue
    const wm = node.getWorldMatrix()
    scale = node.getScale()[1]
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'); if (!pos) continue
      const isLeaf = ((prim.getExtras() || {}).atlasKind ?? (mesh.getExtras() || {}).atlasKind) !== 'bark'
      const v = [0, 0, 0]
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v)
        if (v[1] > localMaxY) localMaxY = v[1]
        const y = wm[1] * v[0] + wm[5] * v[1] + wm[9] * v[2] + wm[13]
        ys.push(y)
        if (y < minY) minY = y
        if (y > maxY) maxY = y
        if (isLeaf) { sawLeaf = true; if (y < leafMinY) leafMinY = y }
      }
    }
  }
  if (!ys.length) return null
  return { ys, minY, maxY, leafMinY, sawLeaf, localMaxY, scale }
}

// prepareOverheadBands' cuts, over the numbers it now measures (world).
function bandCuts({ minY, maxY, leafMinY, sawLeaf }) {
  const H = Math.max(1e-3, maxY - minY)
  const frac = sawLeaf ? Math.min(0.7, Math.max(0.1, (leafMinY - minY) / H)) : 0.35
  const Cb = minY + H * frac
  const s = Math.max(1e-3, maxY - Cb)
  return {
    minY, maxY,
    cuts: [
      { key: 'branch', lo: Math.max(minY, Cb - 0.12 * H), hi: Cb + s / 3 },
      { key: 'mid', lo: Cb + s / 3, hi: Cb + (2 * s) / 3 },
      { key: 'canopy', lo: Cb + (2 * s) / 3, hi: maxY },
    ],
  }
}

const looks = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(BAKED).filter(d => existsSync(path.join(BAKED, d, 'trees-atlas.json')))

let failed = 0
console.log(`The frame a band is cut in must be the frame the camera clips in — ${looks.length} look(s)\n`)

for (const look of looks) {
  const atlasPath = path.join(BAKED, look, 'trees-atlas.json')
  const atlas = JSON.parse(readFileSync(atlasPath, 'utf8'))
  const treeDir = path.join(BAKED, look, 'trees')
  if (!existsSync(treeDir)) { console.log(`  ${look.padEnd(22)} — no baked tree GLBs`); continue }

  const bad = []
  let seen = 0
  for (const sp of readdirSync(treeDir)) {
    // The capture shoots the look's baked lod1; species outside the look shoot their runtime GLB.
    const file = [path.join(treeDir, sp, 'skeleton-1-lod1.glb'),
                  path.join(ROOT, 'public/trees', sp, 'skeleton-1-lod1.glb')].find(existsSync)
    if (!file) continue
    let w = null
    try { w = await readWorld(file) } catch (e) { bad.push([sp, `GLB unreadable — ${e.message}`]); continue }
    if (!w) { bad.push([sp, 'no vertices']); continue }
    seen++
    const { minY, maxY, cuts } = bandCuts(w)

    // ① the frame question — does each cut intersect the tree, and is it populated?
    for (const c of cuts) {
      const span = Math.max(1e-6, c.hi - c.lo)
      const intersect = Math.max(0, Math.min(c.hi, maxY) - Math.max(c.lo, minY)) / span
      let inBand = 0
      for (const y of w.ys) if (y >= c.lo && y <= c.hi) inBand++
      const share = inBand / w.ys.length
      if (intersect < MIN_BAND_INTERSECT) {
        bad.push([sp, `band "${c.key}" [${c.lo.toFixed(1)}, ${c.hi.toFixed(1)}] holds only ${(100 * intersect).toFixed(0)}% tree `
          + `(world extent ${minY.toFixed(1)}–${maxY.toFixed(1)}, node scale ${w.scale.toFixed(3)}) — the cut is outside the geometry`])
      } else if (share < BLANK) {
        bad.push([sp, `band "${c.key}" holds ${(100 * share).toFixed(2)}% of vertices (< BLANK_COVERAGE ${BLANK}) — it will bake blank`])
      }
    }

    // ② the stale-record question — the slab's stored height must be the GLB's world height.
    for (const key of ['overheadBySpecies', 'heroImpostorBySpecies']) {
      const rec = atlas[key]?.[sp]
      if (!rec || !Number.isFinite(rec.heightM)) continue
      const expect = Math.max(1, maxY)
      if (Math.abs(rec.heightM - expect) / expect > 0.02) {
        // ⛔ REPORT THE NUMBER, NAME THE DISCRIMINATOR — do not assert a cause.
        // A stored height equal to the LOCAL top is the old frame, verbatim. A stored
        // height that matches NEITHER frame was captured from a different GLB than the
        // one on disk now; that is a stale record and this check cannot say why.
        const local = Math.max(1, w.localMaxY)
        const why = Math.abs(rec.heightM - local) / local <= 0.02
          ? `= the LOCAL top (${local.toFixed(1)}) ⇒ captured in the pre-fix frame; RE-BAKE`
          : `matches NEITHER frame (local top ${local.toFixed(1)}) ⇒ stale record, baked from a different GLB; cause not established`
        bad.push([sp, `${key}.heightM = ${rec.heightM.toFixed(1)} m, GLB world height ${expect.toFixed(1)} m — ${why}`])
      }
    }
  }

  if (!bad.length) {
    console.log(`  ✅ ${look.padEnd(22)} ${seen} capturable GLBs — every band cut lands in the tree, every stored height matches`)
    continue
  }
  failed++
  console.error(`  ⛔ ${look.padEnd(22)} ${bad.length} finding(s) across ${seen} capturable GLBs —`)
  for (const [sp, why] of bad) console.error(`       ${sp.padEnd(24)} ${why}`)
  console.error(`       ▶ a pre-fix height is fixed by re-running Grove "Bake → Slab" for this look.`)
  console.error(`       ▶ a cut outside the geometry is an ASSET defect (a stray vertex above the crown,`)
  console.error(`         or a merged group-shot GLB) — profile it: node scratch/tree-y-profile.mjs <glb>`)
}

process.exit(failed ? 2 : 0)
