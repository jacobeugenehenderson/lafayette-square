// mint Huron on a given coast (the one-line check's inputs) and ask, at each listed bend, whether every outline point of the bend
// that the ink rings carry is also a vertex of some ink cell (PTown's refusal: the block held A, no cell did)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const W = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/ferrule'
const [cleanDir, ...pts] = process.argv.slice(2)
const { ribbonsPathOf } = await import(W + '/cartograph/scene.js'), { mintInputs } = await import(W + '/cartograph/mintInputs.mjs'), { localBB, projectorOf, geographyFor } = await import(W + '/cartograph/geography.mjs'), BR = await import(W + '/cartograph/boundaryRecords.mjs')
const tg = await import(W + '/src/lib/tileGround.js')
const D = join(W, 'cartograph/data/huron'), rd = (f) => JSON.parse(readFileSync(join(D, f), 'utf8'))
const osm = rd('raw/osm.json'), bb = localBB(osm, projectorOf(geographyFor('huron'))), { disc: hd } = BR.splitBoundary(rd('neighborhood_boundary.json'), 'huron')
const q = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f() } finally { console.log = l; console.warn = w } }
const MI = q(() => mintInputs({ ribbonStreets: JSON.parse(readFileSync(ribbonsPathOf('huron'), 'utf8')).streets, skeletonStreets: rd('clean/skeleton.json').streets || [], osm, bb, disc: hd, discAt: BR.discOf(hd, 'huron'), cleanDir, who: 'zob-pinch' }))
let MP; try { MP = q(() => tg.mintProtopolygon({ streets: MI.streets, gradeSep: MI.gradeSep, boundary: MI.boundary, coast: MI.coast, coastArcs: MI.coastArcs, bb: MI.bb })) } catch (e) { console.log('MINT REFUSED:', e.message.slice(0, 300)); process.exit(0) }
const K = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000)
const inCell = new Set(MP.inkCells.flatMap(c => c.rings.flatMap(r => r.map(K)))), inInk = new Set(MP.rings.flatMap(r => r.map(K)))
console.log('mint OK:', MP.inkCells.length, 'ink cells')
const inPaint = new Set((MP.paint || []).filter(Boolean).flatMap(f => [f.outer, ...(f.holes || [])].flatMap(r => r.map(K)))), inBlock = new Set(MP.blocks.flatMap((b, k) => [b, ...(MP.blockHoles[k] || [])]).flatMap(r => r.map(K))), inWater = new Set((MP.waterRings || []).flatMap(r => r.map(K)))
const off = (p) => { for (const r of MP.rings) { const k = r.findIndex(q => K(q) === K(p)); if (k < 0) continue; const a = r[(k - 1 + r.length) % r.length], c = r[(k + 1) % r.length], dx = c[0] - a[0], dz = c[1] - a[1]; return (Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / Math.hypot(dx, dz) * 1000).toFixed(3) + " mm off its chord, legs " + Math.hypot(p[0]-a[0],p[1]-a[1]).toFixed(3) + "/" + Math.hypot(c[0]-p[0],c[1]-p[1]).toFixed(3) } }
for (const s of pts) { const o = s.split(",").map(Number); const bl = MP.blocks.flatMap((b, k) => [b, ...(MP.blockHoles[k] || [])]).flatMap(r => r.filter(p => Math.hypot(p[0] - o[0], p[1] - o[1]) < 0.02)); console.log(`  blocks within 20 mm of (${o}): ${bl.map(p => `(${p.map(v => (+v).toFixed(4))}) ${inCell.has(K(p)) ? "cell" : "NO cell"}/${inPaint.has(K(p)) ? "paint" : "NO paint"}/${inInk.has(K(p)) ? "ink ring" : "NO ink ring"}`).join(" · ") || "none"}`)
  const near = MP.rings.flatMap(r => r.filter(p => Math.hypot(p[0] - o[0], p[1] - o[1]) < 0.012))
  console.log(`(${o.join(', ')}): ink-ring vertices within 12 mm: ${near.map(p => `(${p.map(v => (+v).toFixed(4)).join(',')}) ${inCell.has(K(p)) ? "cell" : "NO cell"} · ${inPaint.has(K(p)) ? "paint" : "NO paint"} · ${inBlock.has(K(p)) ? "block" : "no block"} · ${inWater.has(K(p)) ? "water" : "no water"} · ${off(p)}`).join(' · ') || 'none'}`) }
