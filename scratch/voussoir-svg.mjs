// SVG snapshot of a window: chains (grey), tile rings (thin blue), iA/block
// (green), asphalt boundary (red), medians (orange), merge (purple), marks
// (magenta). AXES: +x=WEST +z=NORTH (reference_ls_local_frame_axes) → render
// sx = -x, sy = -z so north is up, east is right.
import { build, R, marks } from './voussoir-setup.mjs'
import fs from 'fs'
const [cx, cz, rad] = (process.argv[2] || '58.7,-234,45').split(',').map(Number)
const out = process.argv[3] || 'scratch/voussoir-view.svg'
const g = build()
const art = g._shapeArtifact
const W = 900
const sc = W / (2 * rad)
const X = (p) => (-(p[0]) - -(cx)) * sc + W / 2
const Y = (p) => (-(p[1]) - -(cz)) * sc + W / 2
const inWin = (p) => Math.abs(p[0] - cx) < rad * 1.4 && Math.abs(p[1] - cz) < rad * 1.4
const path = (pts, close) => 'M' + pts.map(p => X(p).toFixed(1) + ',' + Y(p).toFixed(1)).join('L') + (close ? 'Z' : '')
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}"><rect width="${W}" height="${W}" fill="#111"/>`
// asphalt fill (dark) for orientation
for (const r of g.asphalt) if (r.some(inWin)) svg += `<path d="${path(r, 1)}" fill="#333" fill-rule="evenodd" stroke="none"/>`
// medians
for (const m of (R.medians || [])) {
  if (!m.ring?.some(inWin)) continue
  svg += `<path d="${path(m.ring, 1)}" fill="${m.kind === 'median' ? 'rgba(255,140,0,0.35)' : 'rgba(160,60,200,0.35)'}" stroke="${m.kind === 'median' ? 'orange' : 'purple'}" stroke-width="1"/>`
}
// tiles
for (const st of art) if (st.ring.some(inWin)) svg += `<path d="${path(st.ring, 1)}" fill="none" stroke="#28f" stroke-width="0.7" opacity="0.7"/>`
// iA
for (const st of art) for (const ia of (st.iA || [])) if (ia.some(inWin)) svg += `<path d="${path(ia, 1)}" fill="none" stroke="#2f4" stroke-width="1.4"/>`
// asphalt boundary
for (const r of g.asphalt) if (r.some(inWin)) svg += `<path d="${path(r, 1)}" fill="none" stroke="#f33" stroke-width="0.8" opacity="0.9"/>`
// chains
for (const s of R.streets) {
  if (!s.points?.some(inWin)) continue
  svg += `<path d="${path(s.points, 0)}" fill="none" stroke="#aaa" stroke-width="0.6" stroke-dasharray="3,2"/>`
  for (const p of s.points) if (inWin(p)) svg += `<circle cx="${X(p)}" cy="${Y(p)}" r="1.6" fill="#aaa"/>`
}
// marks
marks.forEach((stk, i) => {
  if (!stk.some(q => inWin([q.x, q.z]))) return
  svg += `<path d="${path(stk.map(q => [q.x, q.z]), 0)}" fill="none" stroke="magenta" stroke-width="1.6"/>`
  svg += `<text x="${X([stk[0].x, stk[0].z])}" y="${Y([stk[0].x, stk[0].z]) - 4}" fill="magenta" font-size="11">#${i}</text>`
})
svg += `<text x="8" y="16" fill="#888" font-size="11">center ${cx},${cz} r=${rad} — N up, E right (axes flipped)</text></svg>`
fs.writeFileSync(out, svg)
console.log('wrote', out)
