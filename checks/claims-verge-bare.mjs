#!/usr/bin/env node
// CLAIM — A VERGE IS BARE GRASS, AND A BLOCK'S HIGHWAY EDGE IS BARE (H-3 check 6, `r-highway-verge`).
//
// Land bounded entirely by highway is VERGE: grass, no curb, no sidewalk, no land-use choice. A block that
// is only partly bounded by highway keeps its town frontage and is BARE on its highway edge. Classified at
// the mint (derive.js, frozen per block as `blockClass`) and painted by `sectionPassProtoTile`.
// The fill is not frozen (`SECTION §4`), so this check runs the REAL painter on every frozen tile — it
// reads `shape.json`, never a copy of the painter's rules.
// ASSERTS, per frozen tile:
//   · a VERGE tile paints 0 curb, 0 sidewalk, 0 treelawn, and its land use is `verge`;
//   · on every other tile, just inside each highway-owned contour edge (half a curb width in) there is no
//     curb, sidewalk or treelawn — the land use reaches H's edge. ⚠️ A sample within the tile's widest TOWN
//     band (curb + treelawn + sidewalk, resolved WITH the look's authoring) of a town-owned edge is not
//     judged: at a sharp town↔highway corner the town's sidewalk runs up to H by design, and that ped is the
//     town edge's, not the highway's.
// A frozen shape with highways but no `hwy` stamp predates H-3 and is NOT CHECKED, loudly.
//
//   node checks/claims-verge-bare.mjs [look…] [--shape=path]
//
// MUTATION (must go red): make `isHighwayRun` return false in tileGround.js (ped paints on highway edges).
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { sectionPassProtoTile, resolvePedDepths } from '../src/lib/tileGround.js'

const shapeOverride = process.argv.find(a => a.startsWith('--shape='))?.slice('--shape='.length)
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return Math.abs(a / 2) }
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
  if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const inAny = (x, z, rings) => rings.some(r => r?.length >= 3 && pip(x, z, r))
let red = false
for (const look of (shapeOverride ? named : scenes('public/baked/<scene>/shape.json'))) {
  const p = shapeOverride || join(ROOT, 'public/baked', look, 'shape.json')
  if (!existsSync(p)) { console.log(`── ${look}   ⛔ NOT CHECKED — no ${p}`); red = true; continue }
  const shape = JSON.parse(readFileSync(p, 'utf8')), tiles = shape.tiles || []
  const stamped = tiles.some(t => (t.runs || []).some(r => r.hwy))
  if (!(shape.highway || []).length) { console.log(`── ${look}   no highway in this town`); continue }
  if (!stamped) { console.log(`── ${look}   ⛔ NOT CHECKED — highways but no \`hwy\` stamp: frozen before H-3. Re-bake.`); red = true; continue }
  const cw = 6 * 0.0254
  const lookEntry = JSON.parse(readFileSync(join(ROOT, 'public/looks/index.json'), 'utf8')).looks.find(l => l.id === look)
  const designP = join(ROOT, 'public/looks', look, 'design.json')
  const blockCustoms = existsSync(designP) ? (JSON.parse(readFileSync(designP, 'utf8')).blockCustoms || null) : null
  if (!lookEntry) console.log(`   ⚠️ ${look} is not in public/looks/index.json — judged without authoring`)
  const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0; return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) }
  const o = console.log, w = console.warn; console.log = console.warn = () => {}
  let verge = 0, vergeBad = [], edges = 0, edgeBad = []
  try {
    for (const [ti, t] of tiles.entries()) {
      const out = sectionPassProtoTile(t, cw, { outer: 'LU', inner: 'SW' }, null)
      const bands = [...(out.curb || []), ...(out.Wacc || []), ...Object.values(out.tlByLu || {}).flat()]
      if (t.blockClass === 'verge') {
        verge++
        const a = bands.reduce((s, r) => s + area(r), 0)
        if (a > 1e-3 || t.lu !== 'verge') vergeBad.push(`tile ${ti} (lu ${t.lu}, ${a.toFixed(2)} m² of curb/ped)`)
        continue
      }
      const runs = t.runs || []
      let WB = 0
      for (const r of runs) if (!r.hwy && !String(r.skelId).startsWith('__')) {
        const d = resolvePedDepths(r.baseMeasure, r.side, blockCustoms?.[r.skelId]?.[r.side]?.[r.segOrd] || null)
        WB = Math.max(WB, cw + (d.tl || 0) + (d.sw || 0))
      }
      const townEdges = []
      ;(t.iaFull || []).forEach((ring, ri) => ring.forEach((a, i) => { const r = t.iaStamp?.[ri]?.[i]
        if (r != null && runs[r] && !runs[r].hwy && !String(runs[r].skelId).startsWith('__')) townEdges.push([a, ring[(i + 1) % ring.length]]) }))
      ;(t.iaFull || []).forEach((ring, ri) => ring.forEach((a, i) => {
        const r = t.iaStamp?.[ri]?.[i]; if (r == null || !runs[r]?.hwy) return
        const b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) return
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L
        // the inward side is the one inside the tile's own contour
        const s = inAny(mx + nx * cw / 2, mz + nz * cw / 2, t.iaFull.filter(q => q?.length >= 3)) ? 1 : -1
        const x = mx + s * nx * cw / 2, z = mz + s * nz * cw / 2
        if (townEdges.some(([p0, p1]) => segD(x, z, p0, p1) < WB)) return   // inside a town edge's own band reach
        edges++
        if (inAny(x, z, bands)) edgeBad.push(`tile ${ti} @(${mx.toFixed(1)}, ${mz.toFixed(1)}) ${runs[r].skelId}`)
      }))
    }
  } finally { console.log = o; console.warn = w }
  const bad = vergeBad.length + edgeBad.length
  console.log(`── ${look} ── ${verge} verge tile(s)${vergeBad.length ? ` · ⛔ ${vergeBad.length} carry curb/ped or another land use` : ' bare, land use verge'} · ${edges} highway-owned edge(s) on other tiles${edgeBad.length ? ` · ⛔ ${edgeBad.length} have curb/ped against H` : ' bare'} ${bad ? '⛔' : '✅'}`)
  for (const b of [...vergeBad, ...edgeBad].slice(0, 8)) console.log(`   ⛔ ${b}`)
  if (bad) red = true
}
console.log(red ? '\n⛔ A verge or a highway edge carries curb or ped — or a shape could not be judged.' : '\n✅ Every verge is bare grass, and every highway edge is bare.')
process.exit(red ? 1 : 0)
