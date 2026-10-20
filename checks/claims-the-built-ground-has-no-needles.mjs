#!/usr/bin/env node
// claims-the-built-ground-has-no-needles.mjs — A CURB, A WALK OR A LAWN NEVER COMES TO A SHARP POINT.
//
// Jacob, 2026-10-17: "It's meant to be a real street; curbs and other built features don't come to sharp points." `RIBBONS
// §1`: "even the nose rounds with the same cap/fillet strategy as every other tile end". A NEEDLE is a convex point of a
// built polygon whose interior angle is ACUTE (< 90°) at the scale of the town's own narrowest built element, its authored
// curb width τ: the angle at the vertex between the boundary points τ back and τ forward along the ring. So the measure is
// read off the DRAWN geometry by dimension, never off a stamped radius:
//   · a sharp wedge of angle α reads α at any scale (a needle);
//   · a square end (two 90° corners) wider than τ reads 90° (not acute; a blunt end is not a point);
//   · a rounded tip reads acute only when its radius is under about 0.64 τ, i.e. rounded by less than the curb is wide.
// Every acute point is one of three, and each is reported apart, because each is a different defect:
//   · NEEDLE — the solid has width there (≥ two grid steps between the τ points, lattice.js): a built point;
//   · SPIKE — no width (the boundary goes out and comes back along itself): a zero-area slit in the polygon;
//   · SLIVER — the whole ring is smaller than τ²: a crumb, not a feature with a tip.
// And a band's acute point on ANOTHER band's boundary is a SEAM between two materials (reported, not a needle): the
// ground is continuous there. `③ ped` (curb ∪ walk ∪ lawn) is the built ped ground's own outline.
// Polygons: ② (the block, `iA`) and the bands ③ strikes from it per tile (`sectionPassProtoTile`: walk, lawn, curb), each
// layer united per tile so a seam between two of its own pieces is not a point. ⛔ The rim is an EDGE OF THE DRAWING, not
// a feature: a point whose τ-walk touches the boundary ring is not counted. A town with authored R = 0 or `corner: false`
// is built a second time with those removed; a needle that goes away is the OPERATOR'S (Layer 0 q3) and is reported in
// its own column, never as a defect.
//   node checks/claims-the-built-ground-has-no-needles.mjs [--scene=<town> …] [--show=N]   (NEEDLE_OUT=<file>: every site as JSON)
import clipperLib from 'clipper-lib'
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'
import { sectionPassProtoTile } from '../src/lib/tileGround.js'
import { CLIP_SCALE, LATTICE_M } from '../src/lib/lattice.js'

const SHOW = +(process.argv.find(a => a.startsWith('--show='))?.split('=')[1] || 5)
const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
const union = (rings) => { if (!rings.length) return []; const c = new Clipper(), out = []
  c.AddPaths(rings.filter(r => r?.length >= 3).map(r => r.map(([x, z]) => ({ X: Math.round(x * CLIP_SCALE), Y: Math.round(z * CLIP_SCALE) }))), PolyType.ptSubject, true)
  c.Execute(ClipType.ctUnion, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return out.map(p => p.map(q => [q.X / CLIP_SCALE, q.Y / CLIP_SCALE])) }
const sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
const inRings = (p, rings) => { let c = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) c = !c } return c }

// the needles of one layer's united rings: [{ at, angleDeg }]
function needles(rings, tau, onRim) {
  const out = []
  for (const r of rings) { const n = r.length; if (n < 3) continue
    const area = Math.abs(r.reduce((t, p, i) => t + p[0] * r[(i + 1) % n][1] - r[(i + 1) % n][0] * p[1], 0) / 2)
    if (area < tau * tau) { if (!r.every(p => onRim(p, p))) out.push({ at: r[0], angleDeg: 0, kind: 'sliver', _r: r }); continue }   // a crumb: one site per ring
    const len = r.map((p, i) => Math.hypot(r[(i + 1) % n][0] - p[0], r[(i + 1) % n][1] - p[1]))
    // which side is solid: the left of this ring's longest edge, probed 1 mm off its midpoint against the whole layer
    let k = 0; for (let i = 1; i < n; i++) if (len[i] > len[k]) k = i
    const a = r[k], b = r[(k + 1) % n], ux = (b[0] - a[0]) / len[k], uz = (b[1] - a[1]) / len[k]
    const left = inRings([(a[0] + b[0]) / 2 - uz * 1e-3, (a[1] + b[1]) / 2 + ux * 1e-3], rings) ? 1 : -1
    const walk = (i, dir) => { let d = 0, j = i, rim = false   // the point τ along the ring from vertex i, and whether the walk met the rim
      for (let s = 0; s < n; s++) { const e = dir > 0 ? j : (j - 1 + n) % n, P = r[j], Q = r[dir > 0 ? (j + 1) % n : (j - 1 + n) % n]
        if (onRim(P, Q)) rim = true
        if (d + len[e] >= tau) { const t = (tau - d) / len[e]; return { p: [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t], rim } }
        d += len[e]; j = dir > 0 ? (j + 1) % n : (j - 1 + n) % n }
      return { p: r[j], rim } }
    const hits = []
    for (let i = 0; i < n; i++) { const V = r[i], B = walk(i, -1), F = walk(i, +1)
      if (B.rim || F.rim) continue
      const u = [B.p[0] - V[0], B.p[1] - V[1]], w = [F.p[0] - V[0], F.p[1] - V[1]]
      const cross = (V[0] - B.p[0]) * (F.p[1] - V[1]) - (V[1] - B.p[1]) * (F.p[0] - V[0])
      if (!(cross * left > 0)) continue                                       // not convex toward the solid
      const ang = Math.acos(Math.max(-1, Math.min(1, (u[0] * w[0] + u[1] * w[1]) / ((Math.hypot(...u) || 1) * (Math.hypot(...w) || 1))))) * 180 / Math.PI
      if (ang < 90) hits.push({ i, at: V, angleDeg: ang, kind: Math.hypot(F.p[0] - B.p[0], F.p[1] - B.p[1]) < 2 * LATTICE_M ? 'spike' : 'needle' }) }
    // a needle spans a run of neighbouring vertices: one site per run (within τ along the ring), at its sharpest vertex
    hits.sort((x, y) => x.i - y.i)
    for (const h of hits) { const last = out.length && out[out.length - 1]
      if (last && last._r === r && Math.hypot(h.at[0] - last.at[0], h.at[1] - last.at[1]) <= tau) { if (h.angleDeg < last.angleDeg) Object.assign(last, { at: h.at, angleDeg: h.angleDeg, kind: h.kind }); continue }
      out.push({ ...h, _r: r }) } }
  return out.map(({ at, angleDeg, kind }) => ({ at, angleDeg, kind }))
}

function measure(f, tau, opts = {}) {
  const warn = console.warn; console.warn = () => {}
  let R; try { R = buildProto({ ...f, ...opts }, { quiet: true }) } finally { console.warn = warn }
  const ring = f.ribbons?.protopolygon?.boundaryRing
  const onRim = (a, b) => ring.some((_, k) => sd(a, ring[k], ring[(k + 1) % ring.length]) <= 1e-3) && ring.some((_, k) => sd(b, ring[k], ring[(k + 1) % ring.length]) <= 1e-3)
  const sites = []
  for (const st of R.protoShapeTiles) {
    const out = sectionPassProtoTile(st, tau, { outer: 'LU', inner: 'SW' }, f.blockCustoms)
    const layers = { '② block': st.iA || [], '③ walk': out.Wacc || [], '③ lawn': Object.values(out.tlByLu || {}).flat(), '③ curb': out.curb || [] }
    layers['③ ped'] = [...layers['③ walk'], ...layers['③ lawn'], ...layers['③ curb']]
    const U = Object.fromEntries(Object.entries(layers).map(([l, r]) => [l, union(r)]))
    // ⭐ a point of one band that lies on another band's boundary is a SEAM between two materials, not a point of the ground:
    // the ground is continuous across it (the ③ ped layer, all bands united, is the built ground's own outline)
    const bands = ['③ walk', '③ lawn', '③ curb'], onOther = (layer, p) => bands.some(o => o !== layer && U[o].some(r => r.some((a, k) => sd(p, a, r[(k + 1) % r.length]) <= LATTICE_M)))
    for (const [layer, rings] of Object.entries(U)) for (const s of needles(rings, tau, onRim)) sites.push({ layer, ...s, ...(bands.includes(layer) && s.kind === 'needle' && onOther(layer, s.at) ? { kind: 'seam' } : {}) })
  }
  // ⭐ which acute points sit at a NAMED CORNER PAIR the ease reported (`protoEasePairs`: two corners squeezed on one short
  // leg) or at a NOSE (`protoNoses`: a pair cut back to the minimum curbed width and capped, or not cut and why) — within τ
  // of the segment between the pair's two corners. Read off the producer's own disclosure, never re-derived here.
  const pairs = [...(R.protoEasePairs?.at || []).map(p => ({ ...p, kind: 'squeezed' })), ...(R.protoNoses?.at || [])]
  for (const s of sites) { const p = pairs.find(p => sd(s.at, p.a, p.b) <= tau); if (p) { s.pair = p.kind; s.pairAt = { a: p.a, b: p.b, leg: p.leg, ...(p.turnDeg != null ? { turnDeg: p.turnDeg } : {}) } } }
  return Object.assign(sites, { noses: R.protoNoses, pairs: R.protoEasePairs?.count ?? null })
}

let bad = 0, towns = 0
{ // drawn cases, τ = 0.38 m: a 30° wedge · a 3 m strip squared off · a 3 m strip ended in a semicircle · a tip rounded at 0.2 τ
  const tau = 0.38, noRim = () => false, arc = (cx, cz, r, a0, a1, k) => Array.from({ length: k + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / k; return [cx + r * Math.cos(a), cz + r * Math.sin(a)] })
  const t30 = Math.tan(15 * Math.PI / 180)
  const cases = [
    ['a 30° wedge', [[0, 0], [10, -10 * t30], [10, 10 * t30]], true],
    ['a strip squared off', [[0, -1.5], [10, -1.5], [10, 1.5], [0, 1.5]], false],
    ['a strip ended in a semicircle', [[10, -1.5], [10, 1.5], ...arc(0, 0, 1.5, Math.PI / 2, 3 * Math.PI / 2, 24)], false],
    ['a 30° wedge rounded at 0.2 τ', (() => { const r = 0.2 * tau, d = r / Math.sin(15 * Math.PI / 180); return [...arc(d, 0, r, 105 * Math.PI / 180, 255 * Math.PI / 180, 12), [10, -10 * t30], [10, 10 * t30]] })(), true],
  ]
  cases.push(['a 3 m strip with a 2 m out-and-back slit', [[0, -1.5], [10, -1.5], [10, 0], [12, 0], [10, 0.0001], [10, 1.5], [0, 1.5]], 'spike'])
  cases.push(['a 2 cm triangle crumb', [[0, 0], [0.02, 0], [0.01, 0.003]], 'sliver'])
  for (const [what, ring, want] of cases) { const got = needles([ring], tau, noRim), kinds = new Set(got.map(g => g.kind))
    const ok = want === true ? kinds.has('needle') : want === false ? got.length === 0 : kinds.has(want)
    if (!ok) { console.log(`⛔ the check misjudges ${what}: ${got.length ? [...kinds].join('/') : 'nothing acute'}`); bad++ } }
  if (bad) { console.log('\n⛔ RED — the check itself is wrong'); process.exit(1) }
}
for (const scene of feedScenes()) {
  const f = feed(scene); if (!f) { bad++; continue }
  if (!f.ribbons?.protopolygon?.boundaryRing?.length) { console.log(`⛔ ${scene}: its ① carries no boundaryRing — the rim cannot be told from a point, nothing was checked`); bad++; continue }
  // τ is the town's AUTHORED curb width; with none the producer refuses, and so does this
  if (!Number.isFinite(f.curbWidth)) { console.log(`⛔ ${scene}: design.json carries no curbWidth — author curbWidth in this town's Look; nothing was checked`); bad++; continue }
  const tau = f.curbWidth, tauWhy = 'authored curb width'
  let sites
  try { sites = measure(f, tau) } catch (e) { console.log(`⛔ ${scene}: the producer refused, so nothing was checked — ${String(e.message).split('\n')[0].slice(0, 160)}`); bad++; continue }
  towns++
  // the operator's own zeros: rebuilt without them; a needle that goes away is authored
  const isZero = (v) => v === 0 || v?.radius === 0 || v?.r === 0 || v?.corner === false
  const strip = (o) => o ? Object.fromEntries(Object.entries(o).filter(([, v]) => !isZero(v))) : o
  const nZero = [f.cornerCornerRadiusOverrides, f.cornerRadiusOverrides].reduce((n, o) => n + Object.values(o || {}).filter(isZero).length, 0)
  let authored = []
  const noses = sites.noses, nPairs = sites.pairs
  if (nZero) { const free = measure(f, tau, { cornerCornerRadiusOverrides: strip(f.cornerCornerRadiusOverrides), cornerRadiusOverrides: strip(f.cornerRadiusOverrides) })
    const k = (s) => `${s.layer}|${s.at.map(c => c.toFixed(3))}`, keep = new Set(free.map(k)); authored = sites.filter(s => !keep.has(k(s))); sites = sites.filter(s => keep.has(k(s))) }
  if (process.env.NEEDLE_OUT) (globalThis.__dump ||= {})[scene] = { tau, sites, authored, noses: noses ?? null }
  const head = `${scene} (τ ${tau.toFixed(4)} m, ${tauWhy}) · authored R = 0 / corner:false in the Look: ${nZero} · acute points from authoring: ${authored.length}`
  const atPair = (layer) => { const by = {}; for (const s of sites) if (s.kind === 'needle' && s.layer === layer && s.pair) by[s.pair] = (by[s.pair] || 0) + 1; return by }
  const pairLine = `   AT A CORNER PAIR (needles within τ of a pair the producer reported): ${['② block', '③ ped'].map(l => { const b = atPair(l), t = Object.values(b).reduce((x, y) => x + y, 0); return `${l} ${t}${t ? ` (${Object.entries(b).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}` }).join(' · ')}` +
    `\n   the producer: ${nPairs ?? '?'} squeezed pair(s) · ${noses ? `nose at w ${noses.w.toFixed(3)} m: ${noses.capped} capped, ${noses.spike} spike(s) not cut, ${noses.narrow} narrower than w to the next corner` : '⛔ NO nose disclosure (protoNoses) — this producer predates the nose'}`
  if (sites.length) { bad++
    console.log(`⛔ ${head}`); console.log(pairLine)
    for (const kind of ['needle', 'spike', 'sliver', 'seam']) { const ks = sites.filter(s => s.kind === kind); if (!ks.length) continue
      const by = {}; for (const s of ks) by[s.layer] = (by[s.layer] || 0) + 1
      console.log(`   ${kind.toUpperCase()}S ${ks.length}: ${Object.entries(by).map(([l, v]) => `${l} ${v}`).join(' · ')}`)
      for (const s of ks.sort((a, b) => a.angleDeg - b.angleDeg).slice(0, SHOW)) console.log(`     ${s.layer} (${s.at.map(c => c.toFixed(2)).join(', ')}) · ${s.angleDeg.toFixed(1)}° at τ`) }
  } else { console.log(`✅ ${head} · no acute point`); console.log(pairLine) }
}
if (process.env.NEEDLE_OUT) (await import('node:fs')).writeFileSync(process.env.NEEDLE_OUT, JSON.stringify(globalThis.__dump || {}))
if (!towns) { console.log('⛔ no town was measured — nothing was checked'); bad++ }
console.log(`\n${bad ? '⛔ RED — the built ground comes to a point' : '✅ GREEN — no built feature comes to a point'}`)
process.exit(bad ? 1 : 0)
