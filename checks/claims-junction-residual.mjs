#!/usr/bin/env node
// CLAIM — THE JUNCTION RESIDUAL IS WHAT THE RAW INTAKE SAYS IT IS (H-3 check 7, ruling g).
//
// A ① block with an at-grade ramp end on its ring (the mint's `gradeEnd` stamp), a highway run, and ZERO RAW
// footprint centroids inside is a JUNCTION RESIDUAL — the channelised concrete a ramp terminal sits in. The
// class is decided at the mint (derive.js → `classifyHighwayBlocks`) and frozen per block.
// ASSERTS
//   · re-running the REAL classifier (imported, never copied) on the frozen ① + the RAW `raw/msbf.json` +
//     the skeleton's grade facts gives EXACTLY the frozen `blockClass` — so the pour read the raw intake,
//     never the member/shown set, and nothing drifted since;
//   · every block with a `gradeEnd` on its ring is `jr` or `block`, never missing (a verge is judged by
//     check 6);
//   · each JR tile in the frozen shape has land use `verge`, and its frontage is CONCRETE: painted as a JR it
//     carries no less sidewalk and no more treelawn than the same tile painted as a block.
// The count of JRs "reaching into the junction box" is NOT a gate (brief) — not computed here.
// ⛔ No building layer ⇒ the classifier REFUSES the JR test by name; a frozen JR then fails to re-derive.
//
//   node checks/claims-junction-residual.mjs [scene…] [--ribbons=… --skeleton=… --msbf=… --shape=… --strip-gradeend]
//
// MUTATIONS (each must go red): --msbf=<a copy with a building moved into a JR> · --msbf=/nonexistent
// (drop the building layer) · --strip-gradeend (the stamp removed).
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { classifyHighwayBlocks, sectionPassProtoTile } from '../src/lib/tileGround.js'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const strip = process.argv.includes('--strip-gradeend')
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const DEFAULT_MAP = readFileSync(join(ROOT, 'cartograph/scene.js'), 'utf8').match(/export const DEFAULT_MAP = '([^']+)'/)?.[1]
const ribbonsOf = (s) => s === DEFAULT_MAP ? join(ROOT, 'src/data/ribbons.json') : join(ROOT, 'cartograph/data', s, 'clean/ribbons.json')
const HWY = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link'])
const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return Math.abs(a / 2) }
let red = false
for (const scene of (arg('ribbons') ? named : scenes('cartograph/data/<scene>/raw/osm.json'))) {
  const ribP = arg('ribbons') || ribbonsOf(scene), skP = arg('skeleton') || join(ROOT, 'cartograph/data', scene, 'clean/skeleton.json')
  const msbfP = arg('msbf') || join(ROOT, 'cartograph/data', scene, 'raw/msbf.json')
  if (!existsSync(ribP) || !existsSync(skP)) { console.log(`── ${scene}   ⛔ NOT CHECKED — missing ribbons or skeleton`); red = true; continue }
  const rib = readJson(ribP), P = rib.protopolygon
  if (!P?.blocks?.length) { console.log(`── ${scene}   ⛔ NOT CHECKED — no frozen ① blocks`); red = true; continue }
  if (!P.blockClass) { console.log(`── ${scene}   ⛔ NOT CHECKED — ① carries no blockClass: poured before H-3 step 4. Re-pour.`); red = true; continue }
  const owners = strip ? P.owners.map(o => { const { gradeEnd, ...rest } = o; return rest }) : P.owners
  const hwy = new Set(rib.streets.filter(s => s.gradeSeparated && HWY.has(s.highway)).map(s => s.skelId))
  const offGrade = new Set(readJson(skP).streets.filter(s => s.bridge || s.tunnel || (s.layer | 0) !== 0).map(s => s.id))
  // ⛔ the RAW intake, never the shown set
  const centroids = existsSync(msbfP) ? (readJson(msbfP).buildings || []).filter(b => b.coords?.length >= 3)
    .map(b => { let x = 0, z = 0; for (const c of b.coords) { x += c.x; z += c.z } return [x / b.coords.length, z / b.coords.length] }) : null
  const o = console.log, w = console.warn; console.log = console.warn = () => {}
  let C; try { C = classifyHighwayBlocks({ ...P, owners }, { hwy, offGrade, centroids }) } finally { console.log = o; console.warn = w }
  const bad = []
  const diff = C.cls.map((c, k) => c !== P.blockClass[k] ? `block ${k}: frozen ${P.blockClass[k]}, raw intake says ${c}` : null).filter(Boolean)
  bad.push(...diff)
  if (!centroids) bad.push(`no building layer (${msbfP}) — the JR test is refused${C.jrRefused.length ? ` for ${C.jrRefused.length} ramp-end block(s)` : ''}`)
  P.blocks.forEach((_, k) => { const L = [...(P.blockLabels[k] || []), ...((P.blockHoleLabels?.[k] || []).flat())]
    if (L.some(l => owners[l]?.gradeEnd) && L.some(l => hwy.has(owners[l]?.skelId)) && !['jr', 'block', 'verge'].includes(P.blockClass[k])) bad.push(`block ${k}: a ramp-end block with no class`) })
  // the frozen JR tiles: land use verge, concrete frontage
  const shapeP = arg('shape') || join(ROOT, 'public/baked', scene, 'shape.json')
  let jrTiles = 0
  if (existsSync(shapeP)) {
    const cw = 6 * 0.0254
    for (const [ti, t] of (readJson(shapeP).tiles || []).entries()) {
      if (t.blockClass !== 'jr') continue
      jrTiles++
      if (t.lu !== 'verge') bad.push(`JR tile ${ti}: land use ${t.lu}, not verge`)
      const paint = (tile) => { const q = console.log, r = console.warn; console.log = console.warn = () => {}
        try { const out = sectionPassProtoTile(tile, cw, { outer: 'LU', inner: 'SW' }, null)
          return { sw: (out.Wacc || []).reduce((s, g) => s + area(g), 0), tl: Object.values(out.tlByLu || {}).flat().reduce((s, g) => s + area(g), 0) } }
        finally { console.log = q; console.warn = r } }
      const asJr = paint(t), { blockClass, ...plain } = t, asBlock = paint(plain)
      if (asJr.sw + 1e-6 < asBlock.sw || asJr.tl > asBlock.tl + 1e-6) bad.push(`JR tile ${ti}: frontage not concrete (sidewalk ${asJr.sw.toFixed(1)} vs ${asBlock.sw.toFixed(1)} m², treelawn ${asJr.tl.toFixed(1)} vs ${asBlock.tl.toFixed(1)} m²)`)
    }
  }
  console.log(`── ${scene} ── frozen: ${P.blockClass.filter(c => c === 'jr').length} JR · ${P.blockClass.filter(c => c === 'verge').length} verge · raw re-derivation ${diff.length ? `⛔ disagrees on ${diff.length}` : 'agrees'} · ${jrTiles} JR tile(s) in ${existsSync(shapeP) ? 'the shape' : '(no shape)'} ${bad.length ? '⛔' : '✅'}`)
  for (const b of bad.slice(0, 8)) console.log(`   ⛔ ${b}`)
  if (bad.length) red = true
}
console.log(red ? '\n⛔ A junction residual is not what the raw intake says — or a scene could not be judged.' : '\n✅ Every junction residual is what the raw intake says it is.')
process.exit(red ? 1 : 0)
