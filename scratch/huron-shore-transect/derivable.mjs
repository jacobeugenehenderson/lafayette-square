// CAN A REVETMENT BE BUILT WITH NO AUTHORED NUMBER AT ALL?
// Walk the slab's own shoreline arc and ask, per vertex, whether each thing the
// geometry needs is already readable from data we ship.
import fs from 'fs'
import { baked, ROOT, M_TO_FT } from './common.mjs'
const gj = JSON.parse(fs.readFileSync(`${ROOT}/public/baked/huron/ground.json`, 'utf8'))
const bin = fs.readFileSync(`${ROOT}/public/baked/huron/ground.bin`)
const w = gj.groups.find(g => g.id === 'water:lake')
const WY = new Float32Array(bin.buffer, bin.byteOffset + w.vertexByteOffset, 3)[1]
const shape = JSON.parse(fs.readFileSync(`${ROOT}/public/baked/huron/shape.json`, 'utf8'))

const seen = new Set(); const arcs = []
for (const t of shape.tiles) for (const r of (t.runs || [])) if (r.skelId === '__water__') {
  const k = `${r.poly.length}:${r.poly[0][0].toFixed(2)},${r.poly[0][1].toFixed(2)}`
  if (!seen.has(k)) { seen.add(k); arcs.push(r.poly) }
}
const terr = (x, z) => { const v = baked.get(x, z); return Number.isFinite(v) ? v - baked.meta.baseElev : NaN }

const H = [], SLOPE = [], WIDTH = []
for (const poly of arcs) {
  for (let i = 1; i < poly.length - 1; i++) {
    const [x, z] = poly[i]
    const h = terr(x, z) - WY
    if (!Number.isFinite(h)) continue
    H.push(h)
    // the bank's OWN slope, just landward: normal from the local tangent, both
    // ways, keep whichever rises (the arc's `side` stamp names it, but measure).
    const tx = poly[i+1][0] - poly[i-1][0], tz = poly[i+1][1] - poly[i-1][1]
    const L = Math.hypot(tx, tz); if (!L) continue
    const nx = -tz / L, nz = tx / L
    let best = -Infinity
    for (const s of [1, -1]) {
      const a = terr(x + nx * s * 2, z + nz * s * 2), b = terr(x + nx * s * 10, z + nz * s * 10)
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue
      const rise = Math.max(a, b) - h
      if (rise > best) best = rise
    }
    if (best > -Infinity) SLOPE.push(best / 10)          // rise per metre over the first 10 m inland
    WIDTH.push(h / Math.tan(35 * Math.PI / 180))          // stone footprint at riprap's angle of repose
  }
}
const q = (a, p) => { const s = a.slice().sort((m, n) => m - n); return s[Math.floor(s.length * p)] }
const line = (n, a, u = 'm') => console.log(`  ${n.padEnd(34)} p10 ${q(a,.1).toFixed(2)}   median ${q(a,.5).toFixed(2)}   p90 ${q(a,.9).toFixed(2)}   max ${q(a,.999).toFixed(2)} ${u}`)
console.log(`${arcs.length} arcs, ${H.length} usable shoreline vertices, water plane Y = ${WY.toFixed(4)}\n`)
console.log('① CREST HEIGHT — terrain at the arc minus the water plane:')
line('wall height', H)
console.log('\n② SLOPE — is the bank ALREADY at stone\'s angle of repose, or gentler?')
line('the bank\'s own rise:run, first 10 m inland', SLOPE, '(rise per m)')
const repose = Math.tan(35 * Math.PI / 180)
console.log(`   riprap angle of repose (35°) = ${repose.toFixed(2)} rise per m`)
console.log(`   shoreline vertices whose own bank is ALREADY steeper than repose: ${(100*SLOPE.filter(v=>v>repose).length/SLOPE.length).toFixed(1)}%`)
console.log('\n③ FOOTPRINT — how far waterward the stone reaches at repose:')
line('stone extends into the lake', WIDTH)
console.log(`\n④ SEED — position-derived, no constant. ⑤ STONE SIZE — scales with ①.`)
