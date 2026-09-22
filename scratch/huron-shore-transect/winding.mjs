// DOES THE SHORELINE ARC'S WINDING AGREE WITH WHICH SIDE IS ACTUALLY WATER?
// "The walk direction IS the wet side" is an assumption the revetment will be
// built on. Test it against huron's real arcs, PER ARC — a lake's arcs need not
// agree, so a per-town answer would hide the case that breaks.
import fs from 'fs'
import { baked, ROOT } from './common.mjs'
const gj = JSON.parse(fs.readFileSync(`${ROOT}/public/baked/huron/ground.json`, 'utf8'))
const gb = fs.readFileSync(`${ROOT}/public/baked/huron/ground.bin`)
const wg = gj.groups.find(g => g.id === 'water:lake')
const meshY = new Float32Array(gb.buffer, gb.byteOffset + wg.vertexByteOffset, 3)[1]
const EPS = Number((fs.readFileSync(`${ROOT}/cartograph/bake-ground.js`, 'utf8')
  .match(/const GROUND_Y_EPS\s*=\s*([\d.]+)/) || [])[1])
const WATER = meshY - (wg.renderOrder || 0) * EPS      // the datum the water sits on
const shape = JSON.parse(fs.readFileSync(`${ROOT}/public/baked/huron/shape.json`, 'utf8'))

const seen = new Set(); const arcs = []
for (const t of shape.tiles) for (const r of (t.runs || [])) {
  if (r.skelId !== '__water__' || !Array.isArray(r.poly) || r.poly.length < 3) continue
  const k = `${r.poly.length}:${r.poly[0][0].toFixed(2)},${r.poly[0][1].toFixed(2)}`
  if (seen.has(k)) continue
  seen.add(k); arcs.push(r)
}
const h = (x, z) => { const v = baked.get(x, z); return Number.isFinite(v) ? v - baked.meta.baseElev - WATER : NaN }

console.log(`water plane datum ${WATER.toFixed(3)} m · ${arcs.length} unique __water__ arcs\n`)
console.log('  side   pts    len m   RIGHT-of-walk   LEFT-of-walk    verdict')
let agree = 0, disagree = 0, ambiguous = 0
for (const r of arcs) {
  const P = r.poly
  let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0]-P[i-1][0], P[i][1]-P[i-1][1])
  const D = 8   // sample this far off the line, both sides
  let rSum = 0, lSum = 0, n = 0
  for (let i = 1; i < P.length - 1; i++) {
    const tx = P[i+1][0] - P[i-1][0], tz = P[i+1][1] - P[i-1][1]
    const m = Math.hypot(tx, tz); if (!m) continue
    // right of the walk direction in a +x-east / +z-south frame
    const nx = -tz / m, nz = tx / m
    const hr = h(P[i][0] + nx*D, P[i][1] + nz*D)
    const hl = h(P[i][0] - nx*D, P[i][1] - nz*D)
    if (!Number.isFinite(hr) || !Number.isFinite(hl)) continue
    rSum += hr; lSum += hl; n++
  }
  if (!n) { console.log(`  ${String(r.side).padEnd(6)} ${String(P.length).padStart(4)}  ${L.toFixed(0).padStart(6)}   (no terrain)`); continue }
  const rm = rSum/n, lm = lSum/n
  // the WET side is the lower one — it is the side at or below the water plane
  const wet = rm < lm ? 'RIGHT' : 'LEFT'
  const sep = Math.abs(rm - lm)
  const verdict = sep < 0.10 ? '⚠️ ambiguous' : (wet === 'RIGHT' ? '✅ right-of-walk is wet' : '⛔ LEFT-of-walk is wet')
  if (sep < 0.10) ambiguous++; else if (wet === 'RIGHT') agree++; else disagree++
  console.log(`  ${String(r.side).padEnd(6)} ${String(P.length).padStart(4)}  ${L.toFixed(0).padStart(6)}   ${rm.toFixed(2).padStart(9)} m  ${lm.toFixed(2).padStart(11)} m   ${verdict}`)
}
console.log(`\n  right-of-walk wet: ${agree}   LEFT-of-walk wet: ${disagree}   ambiguous: ${ambiguous}`)
console.log(disagree === 0 && ambiguous === 0
  ? '  ⇒ ✅ ONE convention holds across every arc — "the walk direction is the wet side" is safe here.'
  : '  ⛔ THE ARCS DO NOT AGREE. A per-town assumption would be wrong on some of them; the flip must be PER ARC.')
