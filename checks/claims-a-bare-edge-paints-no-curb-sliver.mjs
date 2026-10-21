#!/usr/bin/env node
// CLAIM — A BARE EDGE PAINTS NO CURB. An edge whose curb depth is 0 (a highway's, a shore's, a verge's) contributes no curb
// band: the curb level along it IS the block's own line (`iA`), never an offset re-minted off it (Boz's ruling, 2026-10-21).
// So the curb the painter strikes (`sectionPassProtoTile` → `band(curbOuter, pedOuter)`) has no ring thinner than one lattice
// step (mean width 2·area/perimeter, the flatten's own measure, `splitAtPinches`) that touches a bare edge: such a ring is the
// depth line cutting a corner off iA, not a curb. ⭐ LS tile 47, #39's finger: motorway-27's 1 mm ② edge at
// (67.738→67.739, 381.187) — the offset's grid merge (`offsetRingByRects#mergeGrid`) took its two ends for one point rounded
// twice, the depth line cut the corner, and a 3-vertex curb needle 13 cm long stood a 4 mm bare step at the riser.
// Runs the REAL painter on every frozen tile, WITH the look's authoring (Layer 0 q3): reads `shape.json`, never a copy.
// Every sub-lattice curb ring is counted; the ones touching a bare edge (a vertex ON a bare edge, exactly or within one
// rounding of it) are the claim's, the rest are named beside it.
// ⛔ RED WHERE TRUE, BY RULING (Boz, 2026-10-21): a served shape frozen before bc6bdf4f is named (at landing: HPDM 1, Huron 2,
// PTown 3, JH 3, LS 1); each town clears when it re-bakes, or names a second defect — never excused here.
//   node checks/claims-a-bare-edge-paints-no-curb-sliver.mjs [look…] [--shape=path] [--selftest]
// ⭐ MUTATION TEST (`--selftest`): the grid merge told to merge two unmoved ring vertices again (the guard removed, in a
//   mutated copy of tileGround.js) → the needle is back → RED.
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ROOT, scenes } from './_scenes.mjs'
import { resolveCurbWidth } from '../src/cartograph/streetProfiles.js'
import { LATTICE_M } from '../src/lib/lattice.js'

const SELF = process.argv.includes('--selftest')
const shapeOverride = process.argv.find(a => a.startsWith('--shape='))?.slice('--shape='.length)
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return Math.abs(a / 2) }
const perim = (r) => r.reduce((s, p, i) => s + Math.hypot(r[(i + 1) % r.length][0] - p[0], r[(i + 1) % r.length][1] - p[1]), 0)
const segD = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
const ROUNDING = Math.SQRT1_2 * LATTICE_M

const loadTG = async (tgUrl) => import(tgUrl)
const TGF = join(ROOT, 'src/lib/tileGround.js')
const ANCHOR = ' && !(isUnmoved(R0[j]) && isUnmoved(kR[L - 1]))'
const CLIP = pathToFileURL(join(ROOT, 'node_modules/clipper-lib/clipper.js')).href
const RE_PKG = /from 'clipper-lib'/g
const RE_LIB = /from '\.\/([^']+)'/g
const RE_SRC = /from '\.\.\/([^']+)'/g
const toLib = (_, m) => `from '${pathToFileURL(join(ROOT, 'src/lib', m)).href}'`
const toSrc = (_, m) => `from '${pathToFileURL(join(ROOT, 'src', m)).href}'`
const mutantTG = () => { const tgSrc = readFileSync(TGF, 'utf8')
  if (tgSrc.split(ANCHOR).length !== 2) throw new Error('selftest: offsetRingByRects#mergeGrid no longer guards unmoved vertices as read — re-aim the mutation')
  const tgPath = join(mkdtempSync(join(tmpdir(), 'bare-curb-')), 'tileGround.js')
  writeFileSync(tgPath, tgSrc.replace(ANCHOR, '').replace(RE_PKG, `from '${CLIP}'`).replace(RE_LIB, toLib).replace(RE_SRC, toSrc))
  return pathToFileURL(tgPath).href }

const isBareRun = (run) => !!run && (!!run.hwy || String(run.skelId) === '__water__')
// one look, judged with tileGround module TG: { onBare: [..], other: [..], tiles } or { notChecked }
function judge(TG, look) {
  const p = shapeOverride || join(ROOT, 'public/baked', look, 'shape.json')
  if (!existsSync(p)) return { notChecked: `no ${p}` }
  const designP = join(ROOT, 'public/looks', look, 'design.json')
  if (!existsSync(designP)) return { notChecked: `no ${designP}` }
  const shape = JSON.parse(readFileSync(p, 'utf8')), tiles = shape.tiles || []
  const design = JSON.parse(readFileSync(designP, 'utf8')), blockCustoms = design.blockCustoms || null
  const cornerOverrides = (design.cornerCornerRadiusOverrides && typeof design.cornerCornerRadiusOverrides === 'object') ? design.cornerCornerRadiusOverrides : null
  const cw = resolveCurbWidth(design).value
  const onBare = [], other = []
  const o = console.log, w = console.warn; console.log = console.warn = () => {}
  try {
    for (const [ti, t] of tiles.entries()) {
      const out = TG.sectionPassProtoTile(t, cw, { outer: 'LU', inner: 'SW' }, blockCustoms, cornerOverrides)
      const bare = []
      ;(t.iaFull || []).forEach((ring, ri) => ring.forEach((a, i) => { const r = t.iaStamp?.[ri]?.[i]
        if (t.blockClass === 'verge' || isBareRun((t.runs || [])[r])) bare.push([a, ring[(i + 1) % ring.length]]) }))
      for (const r of out?.curb || []) { if (!(r?.length >= 3)) continue
        const A = area(r), wMean = 2 * A / perim(r); if (!(wMean < LATTICE_M)) continue
        const site = `tile ${ti} at (${r[0].map(v => v.toFixed(3)).join(', ')}), ${r.length} vertices, mean width ${(wMean * 1000).toFixed(3)} mm, ${(perim(r) / 2).toFixed(3)} m long`
        ;(r.some(v => bare.some(([a, b]) => segD(v, a, b) <= ROUNDING)) ? onBare : other).push(site) }
    }
  } finally { console.log = o; console.warn = w }
  return { onBare, other, tiles: tiles.length }
}
const report = (look, j) => {
  if (j.notChecked) { console.log(`── ${look}   ⛔ NOT CHECKED — ${j.notChecked}`); return true }
  console.log(`── ${look} ── ${j.tiles} tile(s) · curb rings thinner than a lattice step ON a bare edge: ${j.onBare.length}${j.onBare.length ? ' ⛔' : ' ✅'} · elsewhere (named, not this claim's): ${j.other.length}`)
  for (const b of j.onBare.slice(0, 8)) console.log(`   ⛔ ${b}`)
  for (const b of j.other.slice(0, 4)) console.log(`   ·  ${b}`)
  return j.onBare.length > 0
}

const TG = await loadTG(pathToFileURL(TGF).href)
const looks = shapeOverride ? named : scenes('public/baked/<scene>/shape.json')
if (SELF) {
  const TGm = await loadTG(mutantTG())
  let ran = 0, missed = 0
  for (const look of looks) { const live = judge(TG, look), mut = judge(TGm, look)
    if (live.notChecked) { console.log(`  ⚪ ${look}: not judged — ${live.notChecked}`); continue }
    ran++; const caught = mut.onBare.length > live.onBare.length; if (!caught) missed++
    console.log(`  ${caught ? '✅' : '⛔'} ${look}: unmoved ring vertices merged again → ${mut.onBare.length} curb sliver(s) on bare edges (live ${live.onBare.length})${mut.onBare[0] ? ` — e.g. ${mut.onBare[0]}` : ''}`) }
  const ok = ran && !missed
  console.log(ok ? '\n✅ selftest: a curb sliver cut off a bare edge is RED' : '\n⛔ selftest: the instrument missed the mutant (or no town could show it)')
  process.exit(ok ? 0 : 1)
}
let red = false
for (const look of looks) if (report(look, judge(TG, look))) red = true
console.log(red ? '\n⛔ A bare edge paints a curb sliver — or a shape could not be judged.' : '\n✅ No bare edge paints a curb sliver.')
process.exit(red ? 1 : 0)
