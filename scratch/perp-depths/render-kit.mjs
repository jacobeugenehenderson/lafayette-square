// render-kit.mjs <scene> [--out=dir] [--red=x,z] — PROXY renders of a town poured before the kit rung became perpendicular:
// BEFORE = its frozen norm (the kit's old 'none'), AFTER = the norm the pour would freeze now (`curb-cut-norm.mjs`, the way
// derive.js resolves it). Sites are picked from the pour, never by hand: the both-lawn and the concrete corner nearest the
// town's middle, the corner whose two landings are furthest off square, and (--red) a site the landing check marks red.
// Read-only; through the shared feed, authoring loaded. ⛔ A PROXY for Jacob's look call — never the operator's eye-gate.
import sharp from 'sharp'
import { writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { feed } from '../_proto-feed.mjs'
import { resolveCurbCutNorm } from '../../cartograph/curb-cut-norm.mjs'
import { readSources } from '../../cartograph/sources.js'
const { buildTileGround } = await import('../../src/lib/tileGround.js')
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2), [scene] = args.filter(a => !a.startsWith('--'))
const OUT = resolve(ROOT, (args.find(a => a.startsWith('--out=')) || '--out=scratch/perp-depths-out').slice(6))
const red = (args.find(a => a.startsWith('--red=')) || '').slice(6)
const HALF = +(process.env.HALF || 10), PPM = +(process.env.PPM || 40)
const f = feed(scene), src = readSources(scene), live = resolveCurbCutNorm(scene, src.declared ? src.state : null)
const build = (nm) => { const pl = console.log, pw = console.warn; console.log = () => {}; console.warn = () => {}
  try { return buildTileGround({ ...f.ribbons, curbCutNorm: nm }, { grout: 'proto', smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth, blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse,
    cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides, cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1, protoProducer: true }) } finally { console.log = pl; console.warn = pw } }
const A = build(live), B = build(f.ribbons.curbCutNorm)
// the sites: from the AFTER pour's own corner records and cut records
const corners = (A.curbCutCorners || []).filter(c => c.wedge), mid = corners.reduce((m, c) => [m[0] + c.at[0] / corners.length, m[1] + c.at[1] / corners.length], [0, 0])
const nearest = (cs) => cs.slice().sort((a, b) => Math.hypot(a.at[0] - mid[0], a.at[1] - mid[1]) - Math.hypot(b.at[0] - mid[0], b.at[1] - mid[1]))[0]
const ang = (u, v) => Math.acos(Math.min(1, Math.abs(u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v)))) * 180 / Math.PI
const recs = (A.curbCutRecs || []).filter(r => r.along), byArc = new Map()
for (const r of recs) { const k = `${r.tile}|${r.si}|${r.arc}`; byArc.set(k, [...(byArc.get(k) || []), r]) }
const obl = [...byArc.values()].filter(v => v.length === 2).map(v => ({ at: v[0].at, off: 90 - ang(v[0].along, v[1].along) })).sort((a, b) => b.off - a.off)[0]
const sites = [['both legs with lawn, nearest the middle', nearest(corners.filter(c => c.wedge === 'lawn'))?.at],
  ['a concrete corner (a leg with no lawn), nearest the middle', nearest(corners.filter(c => c.wedge === 'concrete'))?.at],
  [`the corner furthest off square (${obl ? obl.off.toFixed(0) : '—'}°)`, obl?.at],
  ...(red ? [['a site the landing check marks red, cause not established', red.split(',').map(Number)]] : [])].filter(([, at]) => at)
const layers = (R) => [['asphalt', R.asphalt, '#3b3b3b'], ['lu', Object.values(R.luByClass || {}).flat(), '#d9cfb8'], ['lawn', Object.values(R.treelawnByLu || {}).flat(), '#6fa35a'],
  ['walk', R.sidewalk, '#c9c9c4'], ['curb', R.curb, '#8a8a85'], ['cut', R.curbCut, '#e2a514']]
const rung = (n) => `${n.style} from ${n.source}${n.passed?.length ? ` (${n.passed.join(' · ')})` : ''}`
const html = []
for (const [i, [what, [cx, cz]]] of sites.entries()) {
  const figs = []
  for (const [tag, R, label] of [['before', B, `BEFORE: frozen norm, ${rung(f.ribbons.curbCutNorm)}`], ['after', A, `AFTER: ${live.style} from ${live.source}`]]) {
    const P = ([x, z]) => `${((x - cx + HALF) * PPM).toFixed(1)},${((z - cz + HALF) * PPM).toFixed(1)}`
    const vis = (rr) => rr.some(([x, z]) => Math.abs(x - cx) < HALF * 3 && Math.abs(z - cz) < HALF * 3)
    const path = (rs) => (rs || []).filter(vis).map(rr => 'M' + rr.map(P).join('L') + 'Z').join(' ')
    const W = 2 * HALF * PPM, t = `PROXY — ${scene} (${cx.toFixed(1)}, ${cz.toFixed(1)}) — ${label} — not the operator's eye-gate`
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}"><rect width="100%" height="100%" fill="#222"/>` +
      layers(R).map(([, rs, c]) => `<path d="${path(rs)}" fill="${c}" fill-rule="nonzero" stroke="none"/>`).join('') +
      `<rect x="0" y="0" width="${W}" height="22" fill="#000" opacity="0.7"/><text x="6" y="15" font-family="Helvetica" font-size="11" fill="#fff">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>` +
      `<line x1="${W - 6 - PPM * 2}" y1="${W - 10}" x2="${W - 6}" y2="${W - 10}" stroke="#fff" stroke-width="2"/><text x="${W - 6 - PPM * 2}" y="${W - 14}" font-family="Helvetica" font-size="11" fill="#fff">2 m</text></svg>`
    const file = `${scene}-${i}-${tag}.png`; await sharp(Buffer.from(svg)).png().toFile(`${OUT}/${file}`); console.log(`${OUT}/${file}`)
    figs.push(`<figure><img src="${file}" alt="${scene} site ${i} ${tag}"><figcaption>${tag === 'before' ? 'today: no curb cuts (the old kit default)' : 'the kit default: perpendicular'}</figcaption></figure>`)
  }
  html.push(`  <section><h2>${scene} ${i} · ${what} (${cx.toFixed(1)}, ${cz.toFixed(1)})</h2><div class="row">\n    ${figs.join('\n    ')}</div></section>`)
}
writeFileSync(`${OUT}/${scene}.sections.html`, html.join('\n') + '\n')
console.log(`norm now: ${rung(live)}${live.width ? `, ${+live.width.toFixed(4)} m wide, warning ${+live.warningDepth.toFixed(4)} m` : ''}`)
