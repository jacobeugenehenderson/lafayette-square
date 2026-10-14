// slv.mjs — scratch measurement for Boz (2026-10-14): where do the sub-lattice treelawn rings come from?
// Called from a scratch copy of tileGround.js `sectionPassProtoTile` (just before its return) with the tile's treelawn
// rings and the constructions that drew them; a ring is SUB-LATTICE when its mean width 2|A|/P < LATTICE_M.
// For each: is it inside / on an R.perp sector, and which constructions run ALONG it (≥ half its sample points within
// one lattice step of that construction's edges)? Written to $SLV_OUT on exit.
import { writeFileSync } from 'fs'
import { LATTICE_M } from '../../../src/lib/lattice.js'
const out = { tiles: 0, tlRings: 0, rings: {}, slivers: [], classes: {}, stages: [], rekey: { calls: 0, outRings: 0, ownSub: 0, outSub: 0, items: [] } }
const area = (r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return s / 2 }
const per = (r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += Math.hypot(r[i][0] - r[j][0], r[i][1] - r[j][1]); return s }
const sd = (px, py, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L2)) : 0; return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy) }
const pip = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
const samples = (r) => { const P = []; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[j], b = r[i], n = Math.max(1, Math.min(20, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.05)))
  for (let k = 0; k < n; k++) P.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]) } return P }
const near = (P, rings) => { let hit = 0, dmin = Infinity
  for (const p of P) { let d = Infinity; for (const r of rings || []) { if (!r || r.length < 2) continue; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const v = sd(p[0], p[1], r[j], r[i]); if (v < d) d = v } } if (d <= LATTICE_M) hit++; if (d < dmin) dmin = d }
  return { frac: P.length ? hit / P.length : 0, dmin } }
export function slvTile(st, tlByKey, cons, depths) {
  out.tiles++
  let C = null
  for (const [lk, rings] of Object.entries(tlByKey)) for (const r of rings || []) {
    const layer = lk.includes('|') ? lk.split('|')[0] : 'treelawn', lu = lk.includes('|') ? lk.split('|')[1] : lk
    if (!r || r.length < 3) continue; out.rings[layer] = (out.rings[layer] || 0) + 1; if (layer === 'treelawn') out.tlRings++
    const A = area(r), P = per(r), w = P ? 2 * Math.abs(A) / P : 0
    if (!(w < LATTICE_M)) continue
    C = C || cons()
    const S = samples(r), ctr = S.reduce((t, p) => [t[0] + p[0] / S.length, t[1] + p[1] / S.length], [0, 0])
    const along = {}
    for (const [k, rs] of Object.entries(C)) { const n = near(S, rs); if (n.frac >= 0.5) along[k] = +n.frac.toFixed(2) }
    const sec = near(S, C.sectors), inSector = C.sectors.some(s => pip(ctr[0], ctr[1], s)) || sec.frac >= 0.5
    const dp = depths ? depths() : null
    if (process.env.SLV_AT && Math.hypot(ctr[0] - +process.env.SLV_AT.split(',')[0], ctr[1] - +process.env.SLV_AT.split(',')[1]) < 1) {
      const win = (rs) => (rs || []).flatMap(q => q.flatMap((v, i) => { const w = q[(i + 1) % q.length]; return S.some(p => sd(p[0], p[1], v, w) < 0.05) ? [[v, w]] : [] }))
      writeFileSync(process.env.SLV_AT_OUT, JSON.stringify({ ring: r, luIn: win(C.luIn), walkTo: win(C.walkTo), Wp: win(C.Wp), dring: dp.dump().filter(e => S.some(p => sd(p[0], p[1], e.a, e.b) < dp.WB + 0.5)) })) }
    const mech = dp ? classify(S, along, dp.dump()) : { cls: 'no-depths' }
    const ck = `${layer}:${mech.cls}`; out.classes[ck] = (out.classes[ck] || 0) + 1
    out.slivers.push({ layer, mech, depth: dp && { WB: dp.WB, cw: dp.cw, capped: dp.capped, nearTo: dp.nearTo.length, nearToMax: dp.nearTo.reduce((m, x) => Math.max(m, Math.abs(x)), 0), nearFrom: dp.nearFrom.length, nearFromMax: dp.nearFrom.reduce((m, x) => Math.max(m, Math.abs(x)), 0) }, tile: st.key ?? st.id ?? null, lu, at: ctr.map(v => +v.toFixed(3)), n: r.length, m2: +Math.abs(A).toFixed(9), len: +(P / 2).toFixed(3), widthMm: +(w * 1000).toFixed(4), hole: A < 0, inSector, perp: C.sectors.length, along })
  }
}
process.on('exit', () => { if (process.env.SLV_OUT) writeFileSync(process.env.SLV_OUT, JSON.stringify(out)) })

// ⭐ THE MECHANISM, per sliver: the dring edges it runs along (a sample sits at one of the pair's depths off the edge,
// within one lattice step), whether the pair's depths are EQUAL there, and how far (in metres along the ring, from the
// run's ends) the nearest edge is where they are NOT. Classes:
//   step-at-run-end      equal along the run, and they step apart on the very next dring edge — two polylines on one
//                        line ending at different joins (MEASURED: HPDM's 108 m × 0.62 mm, 2026-10-14)
//   equal-step-farther   equal along the run; the nearest step is `stepM` further on — cause not established
//   depths-differ-under  the pair's depths differ on the run itself — cause not established
//   equal-everywhere     equal on the whole ring — cause not established
//   off-every-offset     no dring edge's straight offset carries it (`offByMm` = closest miss) — a join? not measured
//   one-construction     only one of the four depth lines runs along it — cause not established
const PAIRS = [['luIn', 'walkTo'], ['pedOuter', 'walkFrom'], ['luIn', 'walkFrom'], ['pedOuter', 'walkTo']]
const dOf = (v, t) => Array.isArray(v) ? v[0] + (v[1] - v[0]) * t : v
const eq = (u, v) => JSON.stringify(u) === JSON.stringify(v)
function classify(S, along, T) {
  const pair = PAIRS.find(([x, y]) => along[x] && along[y])
  if (!pair) return { cls: 'one-construction', along: Object.keys(along) }
  const [X, Y] = pair, under = new Set(); let offBy = Infinity
  for (const e of T) { const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], L = Math.hypot(dx, dy); if (!L) continue
    for (const p of S) { const t = ((p[0] - e.a[0]) * dx + (p[1] - e.a[1]) * dy) / (L * L); if (t < 0 || t > 1) continue
      const dist = Math.abs((p[0] - e.a[0]) * dy - (p[1] - e.a[1]) * dx) / L, m = Math.min(Math.abs(dist - dOf(e.d[X], t)), Math.abs(dist - dOf(e.d[Y], t)))
      if (m < offBy) offBy = m
      if (m <= LATTICE_M) { under.add(e); break } } }
  if (!under.size) return { cls: 'off-every-offset', pair, offByMm: +(offBy * 1000).toFixed(3) }
  if ([...under].some(e => !eq(e.d[X], e.d[Y]))) return { cls: 'depths-differ-under', pair }
  const byPart = new Map(T.map(e => [`${e.part}|${e.j}`, e])), len = (e) => Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1])
  let best = null
  for (const e of under) for (const dir of [-1, 1]) { let m = 0
    for (let k = 1; k < e.n; k++) { const f = byPart.get(`${e.part}|${(e.j + dir * k + e.n * k) % e.n}`); if (!f || under.has(f)) break
      if (!eq(f.d[X], f.d[Y])) { if (!best || m < best.stepM) best = { stepM: +m.toFixed(3), edgeM: +len(f).toFixed(4), [X]: f.d[X], [Y]: f.d[Y] }; break }
      m += len(f) } }
  return best ? { cls: best.stepM === 0 ? 'step-at-run-end' : 'equal-step-farther', pair, ...best } : { cls: 'equal-everywhere', pair }
}

// the cross-tile stages, near the points named in SLV_STAGE_AT ("x,z;x,z"): every ring within 3 m, with its mean width
export function slvStage(k, stages) {
  const pts = (process.env.SLV_STAGE_AT || '').split(';').filter(Boolean).map(t => t.split(',').map(Number))
  for (const [x, z] of pts) for (const [stage, rings] of Object.entries(stages)) for (const r of rings || []) {
    if (!r || r.length < 3 || !r.some(v => Math.hypot(v[0] - x, v[1] - z) < 3)) continue
    const A = area(r), P = per(r)
    out.stages.push({ at: [x, z], k, stage, n: r.length, m2: +Math.abs(A).toFixed(9), widthMm: +(2 * Math.abs(A) / P * 1000).toFixed(4), hole: A < 0, ring: r.length <= 60 ? r : null })
  }
}

// rekeyByPiece: the band (`own`) cut by each class's evidence regions. A sub-lattice ring in the OUTPUT that was not one in
// `own` is made by the cut; for each, which input edges run along it (≥ half its samples within one lattice step).
export function slvRekey(lu, part, own, region, hasEvidence) {
  out.rekey.calls++
  const sub = (r) => { const P = per(r); return P && 2 * Math.abs(area(r)) / P < LATTICE_M }
  out.rekey.ownSub += own.filter(r => r?.length >= 3 && sub(r)).length
  for (const r of part) { if (!r || r.length < 3) continue; out.rekey.outRings++; if (!sub(r)) continue; out.rekey.outSub++
    const S = samples(r), ctr = S.reduce((t, p) => [t[0] + p[0] / S.length, t[1] + p[1] / S.length], [0, 0])
    out.rekey.items.push({ lu, hasEvidence, at: ctr.map(v => +v.toFixed(3)), m2: +Math.abs(area(r)).toFixed(9), widthMm: +(2 * Math.abs(area(r)) / per(r) * 1000).toFixed(4),
      alongBand: +near(S, own).frac.toFixed(2), alongEvidence: +near(S, region).frac.toFixed(2), evidenceGapMm: +(near(S, region).dmin * 1000).toFixed(4) }) }
}
