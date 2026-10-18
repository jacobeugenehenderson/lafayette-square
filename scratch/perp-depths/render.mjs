// render.mjs <scene> <x,z;x,z…> [--out=dir] — PROXY renders of Section's FILL at the given sites, BEFORE (the painter at
// 20d3529f: the perpendicular corner re-filled by a sector) beside AFTER (this tree's painter: landings as depths on the one
// inset), and the same corners drawn diagonal for reference. Read-only on the town; through the shared feed, authoring loaded.
// ⛔ A PROXY for the probe's numbers and for Jacob's look call (radial vs parallel landings) — never the operator's eye-gate:
//   every PNG says PROXY on it.
import sharp from 'sharp'
import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { feed } from '../_proto-feed.mjs'
const H0 = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(H0, '../..')
const args = process.argv.slice(2), [scene = 'huron', sites = ''] = args.filter(a => !a.startsWith('--'))
const OUT = resolve(ROOT, (args.find(a => a.startsWith('--out=')) || '--out=scratch/perp-depths-out').slice(6))
const HALF = +(process.env.HALF || 10), PPM = +(process.env.PPM || 40)
// BEFORE: the base painter, its relative imports pointed back at this tree's src/lib (nothing else differs from the base)
const lib = resolve(ROOT, 'src/lib'), base = execSync('git show 20d3529f:src/lib/tileGround.js', { cwd: ROOT, maxBuffer: 1 << 26 }).toString()
  .replace(/from '(\.\.?\/[^']+)'/g, (_, p) => `from '${pathToFileURL(resolve(lib, p)).href}'`)
writeFileSync(`${OUT}/tileGround.base.mjs`, base)
const painters = { before: (await import(pathToFileURL(`${OUT}/tileGround.base.mjs`).href)).buildTileGround, after: (await import('../../src/lib/tileGround.js')).buildTileGround }
const f = feed(scene), norm = f.ribbons.curbCutNorm
const at = sites.split(';').filter(Boolean).map(s => s.split(',').map(Number))
const build = (fn, nm) => { const prev = console.log; console.log = () => {}
  try { return fn({ ...f.ribbons, curbCutNorm: nm }, { grout: 'proto', smooth: 0, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth, blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse,
    cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides, cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale, protoProducer: true }) } finally { console.log = prev } }
for (const [tag, fn, nm] of [['before', painters.before, norm], ['after', painters.after, norm], ['diagonal', painters.after, { ...norm, style: 'diagonal' }]]) {
  const R = build(fn, nm)
  // asphalt first, so a ped layer is never hidden under it in the proxy
  const layers = [['asphalt', R.asphalt, '#3b3b3b'], ['lu', Object.values(R.luByClass || {}).flat(), '#d9cfb8'], ['lawn', Object.values(R.treelawnByLu || {}).flat(), '#6fa35a'],
    ['walk', R.sidewalk, '#c9c9c4'], ['curb', R.curb, '#8a8a85'], ['cut', R.curbCut, '#e2a514']]
  for (const [ci, [cx, cz]] of at.entries()) {
    const P = ([x, z]) => `${((x - cx + HALF) * PPM).toFixed(1)},${((z - cz + HALF) * PPM).toFixed(1)}`
    const vis = (rr) => rr.some(([x, z]) => Math.abs(x - cx) < HALF * 3 && Math.abs(z - cz) < HALF * 3)
    const path = (rs) => (rs || []).filter(vis).map(rr => 'M' + rr.map(P).join('L') + 'Z').join(' ')
    const W = 2 * HALF * PPM, label = `PROXY — ${scene} (${cx}, ${cz}) — ${tag === 'before' ? 'BEFORE: sector re-fill (20d3529f)' : tag === 'after' ? 'AFTER: landings as depths' : 'DIAGONAL, for reference'} — not the operator's eye-gate`
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}"><rect width="100%" height="100%" fill="#222"/>` +
      layers.map(([, rs, c]) => `<path d="${path(rs)}" fill="${c}" fill-rule="nonzero" stroke="none"/>`).join('') +
      `<rect x="0" y="0" width="${W}" height="22" fill="#000" opacity="0.7"/><text x="6" y="15" font-family="Helvetica" font-size="12" fill="#fff">${label}</text>` +
      `<line x1="${W - 6 - PPM * 2}" y1="${W - 10}" x2="${W - 6}" y2="${W - 10}" stroke="#fff" stroke-width="2"/><text x="${W - 6 - PPM * 2}" y="${W - 14}" font-family="Helvetica" font-size="11" fill="#fff">2 m</text></svg>`
    const out = `${OUT}/${scene}-${ci}-${tag}.png`; await sharp(Buffer.from(svg)).png().toFile(out); console.log(`${out}`)
  }
}
