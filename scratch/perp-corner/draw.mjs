// READ-ONLY PROXY RENDER (Sill, 2026-10-07): a few of a town's corners as Section paints them, to PNG — a sanity look
// before the operator's eye-gate, never a substitute for it. node scratch/perp-corner/draw.mjs <scene> [n]
import sharp from 'sharp'
import { feed, buildProto } from '../_proto-feed.mjs'
const scene = process.argv[2] || 'huron', N = +(process.argv[3] || 4), missing = process.argv.includes('--missing')
const f = feed(scene); if (process.argv.includes('--live')) delete f.ribbons.protopolygon
const R = buildProto(f, { quiet: true, protoProducer: true })
// only corners actually DRAWN (a cut strip within 5 m of the record) — the painter runs on the uncut ring, the drawing is disc-clipped
const cutPts = (R.curbCut || []).flat()
const drawn = (r) => cutPts.some(([x, z]) => Math.abs(x - r.at[0]) < 5 && Math.abs(z - r.at[1]) < 5)
const recs = (R.curbCutRecs || []).filter(r => r.style === 'perpendicular' && drawn(r))
const seen = new Set(), picks = []
for (const r of recs) { const k = `${r.tile}|${r.si}|${r.arc}`; if (seen.has(k)) continue; seen.add(k); picks.push(r); if (picks.length >= N * 7) break }
const concrete = process.argv.includes('--concrete')
const atArg = process.argv.find(a => a.startsWith('--at='))
const chosen = atArg ? atArg.slice(5).split(';').map(s2 => ({ at: s2.split(',').map(Number), tile: '', si: '', arc: '' })) : concrete ? (R.curbCutCorners || []).filter(c => c.wedge === 'concrete').filter((_, i) => i % 11 === 0).slice(0, N) : missing ? (R.curbCutCorners || []).filter(c => c.noLanding).filter((_, i) => i % 13 === 0).slice(0, N) : picks.filter((_, i) => i % 7 === 0).slice(0, N)
const layers = [
  ['lu', Object.values(R.luByClass || {}).flat(), '#d9cfb8'], ['treelawn', Object.values(R.treelawnByLu || {}).flat(), '#6fa35a'],
  ['asphalt', R.asphalt, '#3b3b3b'], ['sidewalk', R.sidewalk, '#c9c9c4'], ['curb', R.curb, '#8a8a85'],
  ['curbCut', R.curbCut, '#e2a514'], ['crosswalk', R.crosswalk, '#ffffff']]
for (const [ci, r] of chosen.entries()) {
  const [cx, cz] = r.at, H = 20, S = 20                          // a 40 m window, 20 px per metre
  const P = ([x, z]) => `${((x - cx + H) * S).toFixed(1)},${((z - cz + H) * S).toFixed(1)}`
  const path = (rs) => rs.filter(rr => rr.some(([x, z]) => Math.abs(x - cx) < H * 2 && Math.abs(z - cz) < H * 2)).map(rr => 'M' + rr.map(P).join('L') + 'Z').join(' ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${2 * H * S}" height="${2 * H * S}"><rect width="100%" height="100%" fill="#222"/>` +
    layers.map(([, rs, c]) => `<path d="${path(rs || [])}" fill="${c}" fill-rule="evenodd" stroke="none"/>`).join('') +
    `<circle cx="${H * S}" cy="${H * S}" r="5" fill="#e33"/></svg>`
  await sharp(Buffer.from(svg)).png().toFile(new URL(`./${scene}-${atArg ? 'at-' : missing ? 'miss-' : concrete ? 'conc-' : ''}${ci}.png`, import.meta.url).pathname)
  console.log(`${scene}-${atArg ? 'at-' : missing ? 'miss-' : concrete ? 'conc-' : ''}${ci}.png ${r.noLanding ?? ''}  corner ${r.tile}|${r.si}|${r.arc} at (${cx.toFixed(0)}, ${cz.toFixed(0)})`)
}
