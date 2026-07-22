import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import clipperLib from 'clipper-lib'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rd = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'))
const ribbons = rd('cartograph/data/hipointe-demun/clean/ribbons.json')

const SCALE = 100
const toC = p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })
const fromC = p => [p.X / SCALE, p.Y / SCALE]
function strokeOpen(poly, delta) {
  const { ClipperOffset, JoinType, EndType } = clipperLib
  const co = new ClipperOffset(2, 0.05 * SCALE)
  co.AddPath(poly.map(toC), JoinType.jtSquare, EndType.etOpenButt)
  const out = []; co.Execute(out, delta * SCALE)
  return out.map(p => p.map(fromC))
}
function unionRings(rings) {
  const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
  const c = new Clipper()
  for (const r of rings) if (r && r.length >= 3) c.AddPath(r.map(toC), PolyType.ptSubject, true)
  const out = []; c.Execute(ClipType.ctUnion, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out.map(p => p.map(fromC))
}
const chain = id => ribbons.streets.find(s => (s.skelId || s.id) === id)
const hw = s => s.measure?.left?.pavementHW || 4

const clayton = chain('clayton-road-0')
const A = chain('de-mun-avenue-2')  // carriageway-A, tip at END
const B = chain('de-mun-avenue-3')  // carriageway-B, tip at START
const node = [-4.4, 931.3]
const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

// --- virtual straighten: replace the terminal kink with a straight extension of
// the body's prevailing direction, run until it crosses Clayton's centerline. ---
function claytonYatX(x) {  // Clayton centerline z at a given x (linear near node)
  const P = clayton.points
  for (let i = 0; i < P.length - 1; i++) {
    const [x0, z0] = P[i], [x1, z1] = P[i + 1]
    if ((x - x0) * (x - x1) <= 0 && Math.abs(x1 - x0) > 1e-6) return z0 + (z1 - z0) * (x - x0) / (x1 - x0)
  }
  return node[1]
}
// prevailing dir = unit tangent from a body vertex ~35m back to the last vertex
// whose incoming heading is still within KINK_TOL of the body trend.
function straightenTip(st, tipAtStart) {
  const P = st.points.map(p => [...p])
  const tip = tipAtStart ? 0 : P.length - 1
  const step = tipAtStart ? 1 : -1
  // body heading reference: chord across ~20-40m of body, past the kink zone
  const bodyFar = P[tip + step * Math.min(4, P.length - 1)]  // ~a few verts in
  // find last non-kinked vertex: walk from tip inward until heading stabilizes
  // simpler & robust: use the vertex ~1 past the visibly kinked short segments.
  // Detect kink verts = those within 20m of node. Anchor = first vertex >20m out.
  let ai = tip
  while (len(P[ai], node) < 20 && ai + step >= 0 && ai + step < P.length) ai += step
  const anchor = P[ai]
  const ref = P[ai + step * Math.min(3, Math.abs((tipAtStart ? P.length - 1 : 0) - ai))] || bodyFar
  let dir = [anchor[0] - ref[0], anchor[1] - ref[1]]
  const dl = Math.hypot(dir[0], dir[1]); dir = [dir[0] / dl, dir[1] / dl]
  // extend from anchor along dir until we cross Clayton centerline (+2m past)
  let t = 0, hitX = anchor[0], hitZ = anchor[1]
  for (let s = 0.5; s < 120; s += 0.5) {
    const x = anchor[0] + dir[0] * s, z = anchor[1] + dir[1] * s
    if ((z - claytonYatX(x)) * (anchor[1] - claytonYatX(anchor[0])) <= 0) { hitX = x; hitZ = z; t = s; break }
    hitX = x; hitZ = z; t = s
  }
  // rebuild: [extended tip, anchor, ...rest of body]
  const rest = tipAtStart ? P.slice(ai) : P.slice(0, ai + 1)
  const newTip = [hitX + dir[0] * 2, hitZ + dir[1] * 2]
  return tipAtStart ? [newTip, ...rest] : [...rest, newTip]
}

const Acorr = straightenTip(A, false)
const Bcorr = straightenTip(B, true)
console.log('A tip: as-is', A.points[A.points.length - 1], '-> corrected', Acorr[Acorr.length - 1])
console.log('B tip: as-is', B.points[0], '-> corrected', Bcorr[0])
console.log('corrected tip separation along Clayton:', len(Acorr[Acorr.length - 1], Bcorr[0]).toFixed(1), 'm')

function asphalt(useCorr) {
  const rings = []
  rings.push(...strokeOpen(clayton.points, hw(clayton)))
  rings.push(...strokeOpen(useCorr ? Acorr : A.points, hw(A)))
  rings.push(...strokeOpen(useCorr ? Bcorr : B.points, hw(B)))
  return unionRings(rings)
}

// --- render both panels ---
const VX = [-45, 45], VZ = [905, 960]
function panel(rings, centerlines, title) {
  const px = 700, w = VX[1] - VX[0], h = VZ[1] - VZ[0], sc = px / w, H = h * sc
  const X = x => ((x - VX[0]) * sc).toFixed(1), Y = z => ((z - VZ[0]) * sc).toFixed(1)
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${(H + 24).toFixed(0)}" style="background:#161616">`
  s += `<text x="8" y="16" fill="#ddd" font-family="monospace" font-size="13">${title}</text>`
  s += `<g transform="translate(0,24)">`
  let dd = ''
  for (const r of rings) { if (r.length < 3) continue; dd += r.map((p, i) => (i ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ') + ' Z ' }
  s += `<path d="${dd}" fill="#4a4a4a" fill-rule="evenodd" stroke="#000" stroke-width="0.5"/>`  // asphalt; median = the hole
  for (const cl of centerlines) s += `<polyline points="${cl.map(p => X(p[0]) + ',' + Y(p[1])).join(' ')}" fill="none" stroke="#e0b030" stroke-width="1.2" stroke-dasharray="4 3"/>`
  // node marker
  s += `<circle cx="${X(node[0])}" cy="${Y(node[1])}" r="3" fill="#ff4040"/>`
  return s + '</g></svg>'
}
const svgBase = panel(asphalt(false), [clayton.points, A.points, B.points], 'BASELINE  (carriageways as-surveyed — median pinches to the shared node)')
const svgCorr = panel(asphalt(true), [clayton.points, Acorr, Bcorr], 'CORRECTED (tips virtually extended straight — median opens at Clayton)')
writeFileSync(path.join(ROOT, 'scratch/hpdm-prevailing-baseline.svg'), svgBase)
writeFileSync(path.join(ROOT, 'scratch/hpdm-prevailing-corrected.svg'), svgCorr)
await sharp(Buffer.from(svgBase)).png().toFile(path.join(ROOT, 'scratch/hpdm-prevailing-baseline.png'))
await sharp(Buffer.from(svgCorr)).png().toFile(path.join(ROOT, 'scratch/hpdm-prevailing-corrected.png'))
console.log('wrote hpdm-prevailing-baseline.png / hpdm-prevailing-corrected.png')
