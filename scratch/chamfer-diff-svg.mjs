// Chamfer diff render — base iA (red) vs after iA (green) vs E3.3 cuts
// (yellow) / fills (cyan). Usage: node chamfer-diff-svg.mjs cx,cz,r out.svg
// Requires /tmp/ia-base.json (all-tile dump from the HEAD build).
import { build } from './voussoir-setup.mjs'
import fs from 'fs'
const [cx, cz, rad] = (process.argv[2] || '443,-95,25').split(',').map(Number)
const out = process.argv[3] || 'scratch/chamfer-diff.svg'
const base = JSON.parse(fs.readFileSync('/tmp/ia-base-all.json', 'utf8'))
const g = build()
const W = 900, sc = W / (2 * rad)
const X = (p) => (-(p[0]) - -(cx)) * sc + W / 2
const Y = (p) => (-(p[1]) - -(cz)) * sc + W / 2
const inWin = (p) => Math.abs(p[0] - cx) < rad * 1.6 && Math.abs(p[1] - cz) < rad * 1.6
const path = (pts, close) => 'M' + pts.map(p => X(p).toFixed(1) + ',' + Y(p).toFixed(1)).join('L') + (close ? 'Z' : '')
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}"><rect width="${W}" height="${W}" fill="#111"/>`
for (const r of (g._jCornerCuts || [])) if (r.some(inWin)) svg += `<path d="${path(r, 1)}" fill="rgba(255,255,0,0.12)" stroke="#aa0" stroke-width="1"/>`
for (const r of (g._jCornerFills || [])) if (r.some(inWin)) svg += `<path d="${path(r, 1)}" fill="rgba(0,255,255,0.15)" stroke="cyan" stroke-width="1"/>`
for (const rs of base) for (const r of rs) if (r.some(inWin)) svg += `<path d="${path(r, 1)}" fill="none" stroke="#f44" stroke-width="2.2" opacity="0.8"/>`
for (const st of g._shapeArtifact) for (const r of (st.iA || [])) if (r.some(inWin)) svg += `<path d="${path(r, 1)}" fill="none" stroke="#2f4" stroke-width="1.1"/>`
svg += `<text x="8" y="16" fill="#888" font-size="11">center ${cx},${cz} r=${rad} — red=base iA, green=after iA, yellow=cuts, cyan=fills</text></svg>`
fs.writeFileSync(out, svg)
console.log('wrote', out)
