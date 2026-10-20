// walk-width-probe.mjs — what the sidewalk default (r-sidewalk-default-rule → d-sidewalk-where-manuals-agree: 5 ft behind a
// treelawn, 6 ft curb-attached) would change against today's bare ADA_SIDEWALK 1.5, for Jacob's ruling between (Boz, 2026-10-18):
//   (a) MONO-WIDTH kept (Jacob 2026-06-10): one walk width per town, every unauthored edge — shown at 5 ft and at 6 ft;
//   (b) the width follows the gleaned treelawn Y/N (5 ft on Y, 6 ft on N) — supersedes 06-10.
// Per walk-carrying contour edge (an edge whose owner holds a walk band piece); authored walks (blockCustoms .sidewalk) untouched.
// Also R2 (an edge whose across-the-contour depth is under 3 × its walk width), split run / arc / cap, per option, and at T = 4.5.
// Treelawn (STD_TREELAWN 1.5) is not changed by any option here. Read-only; builds the producer, so run it through
// scratch/ground-budget/lattice-r1/sweep/run.sh (CHECK=scratch/sidewalk-evidence/walk-width-probe.mjs).
import { feed, buildProto, feedScenes } from '../_proto-feed.mjs'
import { resolvePedDepths } from '../../src/lib/tileGround.js'
const FT = 0.3048, BEHIND = 5 * FT, CURB_ATT = 6 * FT, NOW = 1.5
const OPTS = { 'a·5ft': () => BEHIND, 'a·6ft': () => CURB_ATT, 'b·Y5/N6': (hasTL) => hasTL ? BEHIND : CURB_ATT }
const pip = (p, r) => { let w = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) w = !w } return w }
const ray = (P, d, rings) => { let best = Infinity; for (const r of rings) for (let j = 0; j < r.length; j++) { const a = r[j], b = r[(j + 1) % r.length], ex = b[0] - a[0], ez = b[1] - a[1], den = d[0] * ez - d[1] * ex; if (Math.abs(den) < 1e-12) continue
  const t = ((a[0] - P[0]) * ez - (a[1] - P[1]) * ex) / den, u = ((a[0] - P[0]) * d[1] - (a[1] - P[1]) * d[0]) / den; if (t > 1e-6 && u >= 0 && u <= 1 && t < best) best = t } return best }
for (const scene of feedScenes()) {
  const f = feed(scene); if (!f) continue
  const warn = console.warn; console.warn = () => {}; const R = buildProto(f, { quiet: true, protoArtifact: true, protoProducer: true }); console.warn = warn
  const BC = f.blockCustoms || {}, meas = new Map((f.ribbons.streets || []).map(s => [s.skelId, s.measure]))
  const walkOwners = new Map(); for (const t of R.protoBandPieces || []) { const s = new Set(); for (const q of t.pieces) if (q.cls === 'walk') for (const o of q.owners) s.add(`${o.skelId}|${o.side}|${o.segOrd}`); walkOwners.set(t.tile, s) }
  const W = { n: 0, m: 0, auth: 0, authM: 0, Y: 0, Ym: 0, N: 0, Nm: 0 }, K = () => ({ run: [0, 0], arc: [0, 0], cap: [0, 0] })
  const D = Object.fromEntries(Object.keys(OPTS).map(k => [k, 0])), R2 = Object.fromEntries(['now·1.5', ...Object.keys(OPTS)].map(k => [k, K()])), N15 = K()
  R.protoShapeTiles.forEach((st, ti) => { const rings = st.iaFull || []; if (!rings.length) return; const own = walkOwners.get(ti) || new Set()
    rings.forEach((r, ri) => r.forEach((a, j) => { const b = r[(j + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) return
      const run = st.runs?.[st.iaStamp?.[ri]?.[j]], cap = st.iaCap?.[ri]?.[j] != null, arc = st.iaArc?.[ri]?.[j] != null
      const o = cap ? st.caps?.[st.iaCap[ri][j]] : run; if (!o?.skelId) return
      if (!own.has(`${o.skelId}|${o.side}|${o.segOrd}`)) return
      const c = BC?.[o.skelId]?.[o.side]?.[o.segOrd] || null, d = resolvePedDepths(meas.get(o.skelId), o.side, c)
      W.n++; W.m += L
      const auth = Number.isFinite(c?.sidewalk), ws = { 'now·1.5': auth ? c.sidewalk : NOW }
      if (auth) { W.auth++; W.authM += L } else if (d.hasTL) { W.Y++; W.Ym += L } else { W.N++; W.Nm += L }
      for (const [k, f] of Object.entries(OPTS)) { ws[k] = auth ? c.sidewalk : f(d.hasTL); D[k] += (ws[k] - ws['now·1.5']) * L }
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; let n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L]
      if (!(pip([m[0] + n[0] * 0.02, m[1] + n[1] * 0.02], rings[0]) && !rings.slice(1).some(h => pip([m[0] + n[0] * 0.02, m[1] + n[1] * 0.02], h)))) n = [-n[0], -n[1]]
      const wd = ray([m[0] + n[0] * 1e-4, m[1] + n[1] * 1e-4], n, rings), k = cap ? 'cap' : arc ? 'arc' : 'run'
      for (const [o, w] of Object.entries(ws)) if (wd < 3 * w) { R2[o][k][0]++; R2[o][k][1] += L }
      if (wd < 4.5) { N15[k][0]++; N15[k][1] += L } })) })
  const fk = (x) => `run ${x.run[0]} (${x.run[1].toFixed(0)} m) · arc ${x.arc[0]} (${x.arc[1].toFixed(0)} m) · cap ${x.cap[0]} (${x.cap[1].toFixed(0)} m)`
  console.log(`WW ${scene}: ${W.n} walk-carrying edges, ${W.m.toFixed(0)} m · authored walk ${W.auth} (${W.authM.toFixed(0)} m, untouched) · unauthored treelawn-Y ${W.Y} (${W.Ym.toFixed(0)} m) · treelawn-N ${W.N} (${W.Nm.toFixed(0)} m)`)
  console.log(`WW   walk area added over today's 1.5 m (m²): ${Object.entries(D).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' · ')}`)
  for (const [o, x] of Object.entries(R2)) console.log(`WW   R2 at T = 3 × the walk width, ${o}: ${fk(x)}`)
  console.log(`WW   R2 at T = 4.5 (the census's): ${fk(N15)}`)
}
