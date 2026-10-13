// Read-only: where did each coast.json island go in the pour's ①? (Tern) node scratch/coast/island-fate.mjs <scene>
import fs from 'fs'
import { join } from 'path'
const scene = process.argv[2], rd = f => JSON.parse(fs.readFileSync(join('cartograph/data', scene, f), 'utf8'))
const P = rd('clean/map.json').layers.ribbons.protopolygon, K = rd('clean/coast.json')
const area = r => Math.abs(r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2)
const inR = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
// an interior point: scan a horizontal line through the ring's mid-height, take the midpoint of its widest inside run
const interior = (r) => { let z0 = Infinity, z1 = -Infinity; for (const p of r) { z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]) }
  let best = null
  for (const f of [0.5, 0.37, 0.63, 0.25, 0.75]) { const z = z0 + (z1 - z0) * f, xs = []
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z)) xs.push(xi + (z - zi) * (xj - xi) / (zj - zi)) }
    xs.sort((a, b) => a - b); for (let k = 0; k + 1 < xs.length; k += 2) if (!best || xs[k + 1] - xs[k] > best.w) best = { w: xs[k + 1] - xs[k], p: [(xs[k] + xs[k + 1]) / 2, z] } }
  return best?.p }
const isW = (li) => P.owners[li]?.skelId === '__water__'
const blockOf = (x, z) => { const hits = []; P.blocks.forEach((b, k) => { if (inR(x, z, b) && !(P.blockHoles?.[k] || []).some(h => inR(x, z, h))) hits.push(k) }); return hits }
const holes = K.water.flatMap(w => w.holes)
const fate = { shoreOnly: 0, merged: 0, streetInk: 0, none: 0, many: 0 }, perBlock = new Map(), odd = []
holes.forEach((h, n) => {
  const p = interior(h); if (!p) { odd.push({ n, why: 'no interior point', m2: area(h) }); return }
  const B = blockOf(...p)
  if (!B.length) { fate.none++; odd.push({ n, why: 'in NO block', m2: +area(h).toFixed(1), at: p.map(Math.round), pts: h.length }); return }
  if (B.length > 1) fate.many++
  const k = B[0]; (perBlock.get(k) || perBlock.set(k, []).get(k)).push(n)
})
for (const [k, ns] of perBlock) {
  const L = P.blockLabels[k] || [], ownersOf = [...new Set(L.map(li => P.owners[li]?.skelId))]
  const onlyW = L.every(isW) && !(P.blockHoles?.[k] || []).length
  if (ns.length > 1) { fate.merged += ns.length; odd.push({ why: `${ns.length} islands in ONE block`, block: k, m2: +area(P.blocks[k]).toFixed(1), owners: ownersOf.slice(0, 4) }) }
  else if (onlyW) fate.shoreOnly++
  else { fate.streetInk++; odd.push({ n: ns[0], why: 'its block carries non-shore edges', block: k, m2: +area(P.blocks[k]).toFixed(1), owners: ownersOf.slice(0, 4), isleM2: +area(holes[ns[0]]).toFixed(1) }) }
}
console.log(`${scene}: ${holes.length} islands → shore-only block ${fate.shoreOnly} · in a block with other edges ${fate.streetInk} · sharing a block ${fate.merged} · in NO block ${fate.none} · point in >1 block ${fate.many}`)
for (const o of odd) console.log('  ', JSON.stringify(o))
// the tiny shore-only blocks
const tiny = []; P.blocks.forEach((b, k) => { const L = P.blockLabels[k] || []; const a = area(b); if (L.length && L.every(isW) && a < 2) tiny.push({ block: k, m2: +a.toFixed(2), verts: b.length, at: b[0].map(Math.round), inIsland: holes.findIndex(h => inR(b[0][0], b[0][1], h)) }) })
console.log(`  shore-only blocks under 2 m²: ${tiny.length}`); for (const t of tiny) console.log('    ', JSON.stringify(t))
