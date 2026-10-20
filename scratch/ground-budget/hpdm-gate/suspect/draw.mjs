// draw.mjs — three pictures of the "band copy outside its own class's piece" residue (Screed, 2026-10-18), beside index.html.
// Tiles 182 and 173: the copies the FIRST instrument flagged (a piece's bbox taken from rings[0], which is not its outer in
// 18–25 pieces per class) against the pieces, the pieces whose rings[0] is not the largest ring outlined. Tile 67: the
// corrected residue (a sidewalk copy of dac3525d's mesh inside an fdcf0bfc lawn piece) against the pieces and the unpadded
// ② arcs (iaJunction 'bend'/null). x right, z down (the data's own axes; no north asserted).
//   node scratch/ground-budget/hpdm-gate/suspect/draw.mjs
import { readFileSync, writeFileSync } from 'fs'
const H = new URL('.', import.meta.url).pathname, G = H + '../'
const dump = JSON.parse(readFileSync(G + 'bands-blend.json', 'utf8')), sh = JSON.parse(readFileSync(G + 'slab-bb-base/shape.json', 'utf8'))
const r0 = JSON.parse(readFileSync(H + 'points-rings0.json', 'utf8')), fx = JSON.parse(readFileSync(H + 'points-fixed.json', 'utf8'))
const A = (r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return Math.abs(s / 2) }
const FILL = { curb: '#9aa3ad', walk: '#e6d8b8', lawn: '#9fcf8f' }, DOT = { curb: '#3b4a5a', walk: '#c0392b', lawn: '#1f6f2a' }
function svg(ti, pts, opts) {
  const t = sh.tiles[ti], bp = Object.values(dump.bandPieces).find(x => x && x.tile === ti)
  let a = [1e9, 1e9, -1e9, -1e9]; for (const q of bp.pieces) for (const r of q.rings) for (const [x, z] of r) a = [Math.min(a[0], x), Math.min(a[1], z), Math.max(a[2], x), Math.max(a[3], z)]
  const pad = 5, W = a[2] - a[0] + 2 * pad, Hh = a[3] - a[1] + 2 * pad, sw = Math.max(W, Hh) / 900
  const path = (rings) => rings.map(r => 'M' + r.map(([x, z]) => `${(x - a[0] + pad).toFixed(2)},${(z - a[1] + pad).toFixed(2)}`).join('L') + 'Z').join('')
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(1)} ${Hh.toFixed(1)}" width="900" style="background:#fff">`
  o += `<path d="${path([t.ring])}" fill="none" stroke="#bbb" stroke-width="${sw}"/>`
  for (const q of bp.pieces) o += `<path d="${path(q.rings)}" fill="${FILL[q.cls]}" fill-rule="evenodd" stroke="#666" stroke-width="${sw * 0.4}"/>`
  if (opts.outlineBad) for (const q of bp.pieces) { const s = q.rings.map(A); if (s.indexOf(Math.max(...s)) !== 0) o += `<path d="${path(q.rings)}" fill="none" stroke="#7b2cbf" stroke-width="${sw * 2}"/>` }
  if (opts.arcs) (t.iaFull || []).forEach((ring, ri) => { const Ar = t.iaArc?.[ri] || [], J = t.iaJunction?.[ri] || []
    for (let i = 0; i < ring.length; i++) { const j = (i + 1) % ring.length; if (Ar[i] == null || Ar[j] !== Ar[i] || !(J[i] === 'bend' || J[i] == null)) continue
      o += `<path d="${path([[ring[i], ring[j]]]).slice(0, -1)}" stroke="#0077b6" stroke-width="${sw * 3}" fill="none"/>` } })
  for (const [x, z, cls] of pts) o += `<circle cx="${(x - a[0] + pad).toFixed(2)}" cy="${(z - a[1] + pad).toFixed(2)}" r="${sw * 1.6}" fill="${DOT[cls]}"/>`
  return o + '</svg>'
}
const pics = [
  { f: 'tile-182.svg', ti: 182, pts: r0[182] || [], opts: { outlineBad: true }, cap: `Tile 182: the ${(r0[182] || []).length} copies the first instrument flagged; corrected, ${(fx[182] || []).length}. Purple outlines: pieces whose rings[0] is not their largest ring.` },
  { f: 'tile-173.svg', ti: 173, pts: r0[173] || [], opts: { outlineBad: true }, cap: `Tile 173: the ${(r0[173] || []).length} copies the first instrument flagged; corrected, ${(fx[173] || []).length}. Purple outlines as above.` },
  { f: 'tile-67.svg', ti: 67, pts: fx[67] || [], opts: { arcs: true }, cap: `Tile 67, the corrected residue's largest: ${(fx[67] || []).length} copies (red: a sidewalk copy of dac3525d's mesh inside an fdcf0bfc lawn piece). Blue: unpadded ② arcs.` },
]
for (const p of pics) writeFileSync(H + p.f, svg(p.ti, p.pts, p.opts))
writeFileSync(H + 'index.html', `<!doctype html><meta charset="utf-8"><title>Band copies outside pieces</title><style>body{font:14px system-ui;margin:16px;max-width:940px}img{max-width:100%;border:1px solid #ddd}</style>
<h1>Band copies outside their own class's piece: HPDM</h1><p>slab-bb-base (dac3525d mesh) against bands-blend.json (fdcf0bfc pieces). Fills: curb grey, walk sand, lawn green. Dots: the flagged copies, coloured by their mesh class (walk red, lawn dark green, curb slate).</p>
${pics.map(p => `<h2>${p.f.replace('.svg', '')}</h2><p>${p.cap}</p><img src="${p.f}">`).join('\n')}`)
console.log(pics.map(p => `${p.f}: ${p.pts.length} dots`).join(' · '))
