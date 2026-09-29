// claims-bark-uvs-name-their-tile.mjs — DOES EVERY BAKED BARK UV NAME A TILE ITS ATLAS HOLDS?
//
// The trunk shows the bark photo, wrapped per fragment inside its atlas tile (src/lib/barkUV.js is
// the contract; bake-look#encodeBarkUVs writes it; treeAtlasMaterial#barkWrapSample reads it).
// A bark UV that names no tile paints MAGENTA; one that names the wrong tile paints another bark.
// For every Look, for every baked GLB, every `atlasKind: 'bark'` primitive must:
//   · have u ≥ STRIDE (it was encoded — a pre-2026-09-28 bake was folded per vertex instead);
//   · name a tile index that `trees-atlas.json#atlas.barkTileRects` holds.
// Reads the contract and the table; restates neither.
//
// ▶ MUTATION-TEST IT: in bake-look's rewrite loop, send bark through `transformUVs` instead of
//   `encodeBarkUVs`, re-bake a Look ⇒ that Look goes RED. (A Look baked before the change is RED
//   already — that is the same test, run by history.)
//
//   node checks/claims-bark-uvs-name-their-tile.mjs [scene…]
// Read-only. Exit 1 = a Look ships bark the shader cannot draw; exit 2 = could not check.
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { ROOT, scenes } from './_scenes.mjs'
import { BARK_UV_STRIDE, BARK_TILE_MAX } from '../src/lib/barkUV.js'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
let red = 0, checked = 0
for (const scene of scenes('public/baked/<scene>/trees-atlas.json')) {
  const man = JSON.parse(readFileSync(join(ROOT, 'public/baked', scene, 'trees-atlas.json'), 'utf8'))
  const rects = man.atlas?.barkTileRects
  const dir = join(ROOT, 'public/baked', scene, 'trees')
  if (!existsSync(dir)) { console.log(`   · ${scene}: NOT CHECKED — no baked trees/`); continue }
  if (!Array.isArray(rects)) { red++; console.log(`   ⛔ ${scene}: atlas has no barkTileRects — baked before the bark contract. ▶ Grove → Bake → Slab`); continue }
  if (rects.length > BARK_TILE_MAX) { red++; console.log(`   ⛔ ${scene}: ${rects.length} bark tiles > shader table ${BARK_TILE_MAX}`); continue }
  let prims = 0, bad = []
  for (const sp of readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()) {
    for (const f of readdirSync(join(dir, sp)).filter(f => /^skeleton-.*\.glb$/.test(f))) {
      const doc = await io.read(join(dir, sp, f))
      for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
        if (p.getExtras()?.atlasKind !== 'bark') continue
        const uv = p.getAttribute('TEXCOORD_0')?.getArray(); if (!uv) continue
        prims++
        let why = null
        for (let i = 0; i < uv.length && !why; i += 2) {
          if (uv[i] < BARK_UV_STRIDE) why = `u ${uv[i].toFixed(3)} < ${BARK_UV_STRIDE} (not encoded)`
          else if (!rects[Math.floor(uv[i] / BARK_UV_STRIDE) - 1]) why = `names tile ${Math.floor(uv[i] / BARK_UV_STRIDE) - 1}, table holds ${rects.length}`
        }
        if (why) bad.push(`${sp}/${f}: ${why}`)
      }
    }
  }
  checked++
  if (bad.length) { red++; console.log(`   ⛔ ${scene}: ${bad.length}/${prims} bark primitives the shader cannot draw — e.g. ${bad[0]}. ▶ Grove → Bake → Slab`) }
  else console.log(`   ✅ ${scene}: ${prims} bark primitives, every one names a tile in its ${rects.length}-tile table`)
}
if (!checked && !red) { console.error('⛔ NOT CHECKED — no Look was measurable.'); process.exit(2) }
console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ PASS')
process.exit(red ? 1 : 0)
