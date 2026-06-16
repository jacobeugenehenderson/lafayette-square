// READ-ONLY — validate the inner-edge offset (the divided-corridor design step 1).
// Offset each divided chain TOWARD its mate by surveyHW/2 → the inner asphalt edge.
// Check: (a) no self-intersection (the offset-at-bends risk), (b) the gap between the
// two inner edges ≈ chainGap − surveyHW (the median width). Render per road.
import { readFileSync } from 'fs'
import sharp from 'sharp'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const survey = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/raw/survey.json', import.meta.url))).streets

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const cross = (a, b) => a[0] * b[1] - a[1] * b[0]
function segInt(p1, p2, p3, p4) {
  const d1 = sub(p2, p1), d2 = sub(p4, p3), den = cross(d1, d2)
  if (Math.abs(den) < 1e-12) return false
  const t = cross(sub(p3, p1), d2) / den, u = cross(sub(p3, p1), d1) / den
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6
}
function selfInt(poly) {
  let n = 0
  for (let i = 0; i < poly.length - 1; i++) for (let j = i + 2; j < poly.length - 1; j++) {
    if (i === 0 && j === poly.length - 2) continue
    if (segInt(poly[i], poly[i + 1], poly[j], poly[j + 1])) n++
  }
  return n
}
function closestPt(p, poly) {
  let best = poly[0], bd = Infinity
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0
    const q = [a[0] + dx * t, a[1] + dz * t], d = Math.hypot(p[0] - q[0], p[1] - q[1])
    if (d < bd) { bd = d; best = q }
  }
  return best
}
// offset `poly` toward `mate` by d (per-vertex normal pointing at the mate)
function offsetTowardMate(poly, mate, d) {
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], prev = poly[Math.max(0, i - 1)], next = poly[Math.min(poly.length - 1, i + 1)]
    let tx = next[0] - prev[0], tz = next[1] - prev[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl
    const px = -tz, pz = tx
    const cp = closestPt(p, mate), toMate = [cp[0] - p[0], cp[1] - p[1]]
    const sign = (px * toMate[0] + pz * toMate[1] > 0) ? 1 : -1
    out.push([p[0] + sign * px * d, p[1] + sign * pz * d])
  }
  return out
}
function arcLen(poly) { let L = 0; for (let i = 1; i < poly.length; i++) L += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]); return L }

// pair up divided chains by pairId
const byId = {}; for (const s of r.streets) byId[s.skelId] = s
const seen = new Set(), pairs = []
for (const s of r.streets) {
  if (s.phase?.kind !== 'divided' || !s.pairId) continue
  const k = [s.skelId, s.pairId].sort().join('|'); if (seen.has(k)) continue; seen.add(k)
  const m = byId[s.pairId]; if (m) pairs.push([s, m])
}
console.log(`${pairs.length} divided pairs`)
let totalSelf = 0
const byName = {}
for (const [A, B] of pairs) {
  const a = A.points, b = B.points
  const surveyHW = survey[A.name]?.pavementHalfWidth || survey[B.name]?.pavementHalfWidth || 0
  const half = surveyHW / 2
  const innerA = offsetTowardMate(a, b, half)
  const innerB = offsetTowardMate(b, a, half)
  const si = selfInt(innerA) + selfInt(innerB)
  totalSelf += si
  // median width estimate at the midpoint = gap between inner edges at mid
  const midA = innerA[Math.floor(innerA.length / 2)]
  const cpB = closestPt(midA, innerB)
  const medW = Math.hypot(midA[0] - cpB[0], midA[1] - cpB[1])
  const gap = A.phase?.chainGap ?? 0
  ;(byName[A.name] = byName[A.name] || []).push({ A, B, a, b, innerA, innerB, surveyHW, half, si, medW, gap })
  if (si) console.log(`  ⚠️ ${A.name} (${A.skelId}): innerEdge SELF-INT ${si}`)
}
console.log(`\ntotal inner-edge self-intersections: ${totalSelf} ${totalSelf === 0 ? '✅ (offset is clean — proceed to the ring)' : '❌ (need a clamp / Clipper one-sided offset)'}`)
console.log('\nmedian width (inner-edge gap at mid) vs chainGap − surveyHW:')
for (const [nm, list] of Object.entries(byName)) {
  if (!['Lafayette Avenue', 'South Jefferson Avenue', 'Park Avenue', 'Chouteau Avenue', 'Geyer Avenue'].includes(nm)) continue
  console.log(`  ${nm.padEnd(22)} surveyHW=${list[0].surveyHW.toFixed(1)}  medW(mid)=${list.map(x => x.medW.toFixed(1)).join(',')}m  (gap−sHW=${list.map(x => (x.gap - x.surveyHW).toFixed(1)).join(',')})`)
}
// render the 5 roads: chains (navy) + inner edges (orange)
async function render(nm, list, tag) {
  const all = list.flatMap(x => [...x.a, ...x.b, ...x.innerA, ...x.innerB])
  const xs = all.map(p => p[0]), ys = all.map(p => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const W = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.1 + 5, ppx = 1100, sc = ppx / W
  const X = x => ((x - (cx - W / 2)) * sc).toFixed(1), Y = y => ((y - (cy - W / 2)) * sc).toFixed(1)
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${ppx}" height="${ppx}" style="background:#16243a">`
  const line = (poly, c, w) => { s += `<path d="${poly.map((p, i) => (i ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ')}" fill="none" stroke="${c}" stroke-width="${w}"/>` }
  for (const x of list) { line(x.a, '#0a1a4a', 2); line(x.b, '#0a1a4a', 2); line(x.innerA, '#f80', 2); line(x.innerB, '#f80', 2) }
  s += '</svg>'
  await sharp(Buffer.from(s)).png().toFile(new URL(`./corridor-inner-${tag}.png`, import.meta.url).pathname)
  console.log('wrote corridor-inner-' + tag + '.png')
}
await render('Lafayette Avenue', byName['Lafayette Avenue'] || [], 'lafayette')
await render('South Jefferson Avenue', byName['South Jefferson Avenue'] || [], 'sjefferson')
await render('Park Avenue', byName['Park Avenue'] || [], 'park')
