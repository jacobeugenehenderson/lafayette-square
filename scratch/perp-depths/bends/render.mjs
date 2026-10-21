// render.mjs <scene> <x,z;…> [--out=dir] — PROXY of the drawn-walk corner reading at arcs where the two disagree: TODAY (the
// corner test calls the arc a junction: a perpendicular corner) beside the DRAWN-WALK reading (no walk reaches the road, so it
// is not a corner: the ordinary band bent through the arc — this tree's painter; TODAY is the same painter with that pass off,
// tg.today.mjs). The norm is the one the
// pour would freeze now. ⛔ Not built; for Jacob's eye.
import sharp from 'sharp'
import { writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { feed } from '../../_proto-feed.mjs'
import { resolveCurbCutNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { readSources } from '../../../cartograph/sources.js'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const args = process.argv.slice(2), [scene, sites = ''] = args.filter(a => !a.startsWith('--'))
const OUT = resolve(ROOT, (args.find(a => a.startsWith('--out=')) || '--out=scratch/perp-depths-out').slice(6))
const HALF = +(process.env.HALF || 12), PPM = +(process.env.PPM || 34)
const at = sites.split(';').filter(Boolean).map(s => s.split(',').map(Number))
const f = feed(scene), src = readSources(scene), nm = resolveCurbCutNorm(scene, src.declared ? src.state : null)
// TODAY: a painter copy with the not-corner pass off
const today = (await import(process.env.TODAY || './tg.today.mjs')).buildTileGround, walks = (await import('../../../src/lib/tileGround.js')).buildTileGround
const build = (fn) => { const pl = console.log, pw = console.warn; console.log = () => {}; if (process.env.WARNS !== '1') console.warn = () => {}
  try { return fn({ ...f.ribbons, curbCutNorm: nm }, { smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth, blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides, cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1 }) }
  finally { console.log = pl; console.warn = pw } }
const census = (R) => { const C = { refused: 0, refusedM2: 0, refusedPerp: 0, refusedPerpM2: 0 }; for (const t of R.protoBandPieces || []) for (const k of Object.keys(C)) C[k] += t.census?.[k] || 0
  return `refused ${C.refused} (${C.refusedM2.toFixed(3)} m²) · refusedPerp ${C.refusedPerp} (${C.refusedPerpM2.toFixed(3)} m²)` }
// WIDE=<half-width m>: site 0 again, wide, as <scene>-wide-<tag>.png (same pour, no extra build)
const views = (at) => [...at.map(([cx, cz], i) => [i, cx, cz, HALF, PPM]), ...(process.env.WIDE && at.length ? [['wide', at[0][0], at[0][1], +process.env.WIDE, 800 / +process.env.WIDE]] : [])]
const BAR = (H) => (H >= 50 ? 20 : 2)
const A = build(today), B = build(walks)
console.log(`${scene} today: ${census(A)}`); console.log(`${scene} walks: ${census(B)}`)
for (const [i, cx, cz, HALF, PPM] of views(at)) for (const [tag, R, what] of [['today', A, 'TODAY: the corner test says junction'], ['walks', B, 'DRAWN WALK: no walk reaches the road — the band bent through, not a corner']]) {
  const P = ([x, z]) => `${((x - cx + HALF) * PPM).toFixed(1)},${((z - cz + HALF) * PPM).toFixed(1)}`
  const vis = (rr) => rr.some(([x, z]) => Math.abs(x - cx) < HALF * 3 && Math.abs(z - cz) < HALF * 3)
  const path = (rs) => (rs || []).filter(vis).map(rr => 'M' + rr.map(P).join('L') + 'Z').join(' ')
  const L = [['asphalt', R.asphalt, '#3b3b3b'], ['lu', Object.values(R.luByClass || {}).flat(), '#d9cfb8'], ['lawn', Object.values(R.treelawnByLu || {}).flat(), '#6fa35a'], ['walk', R.sidewalk, '#c9c9c4'], ['curb', R.curb, '#8a8a85'], ['cut', R.curbCut, '#e2a514']]
  const W = 2 * HALF * PPM, t = `PROXY — ${scene} (${cx}, ${cz}) — ${what} — not the operator's eye-gate`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}"><rect width="100%" height="100%" fill="#222"/>` + L.map(([, rs, c]) => `<path d="${path(rs)}" fill="${c}" fill-rule="nonzero" stroke="none"/>`).join('') +
    `<circle cx="${W / 2}" cy="${W / 2}" r="5" fill="none" stroke="#f0f" stroke-width="2"/>` +
    `<rect x="0" y="0" width="${W}" height="22" fill="#000" opacity="0.7"/><text x="6" y="15" font-family="Helvetica" font-size="11" fill="#fff">${t}</text>` +
    `<line x1="${W - 6 - PPM * BAR(HALF)}" y1="${W - 10}" x2="${W - 6}" y2="${W - 10}" stroke="#fff" stroke-width="2"/><text x="${W - 6 - PPM * BAR(HALF)}" y="${W - 14}" font-family="Helvetica" font-size="11" fill="#fff">${BAR(HALF)} m</text></svg>`
  await sharp(Buffer.from(svg)).png().toFile(`${OUT}/${scene}-${i}-${tag}.png`) }
console.log(`${scene}: not-corner arcs ${B.curbCutTally?.notCorner ?? '?'} (today ${A.curbCutTally?.notCorner ?? 0})`)
