// make-noarc.mjs <groundDeformer.mjs> — COUNTERFACTUAL copies (probe only, never shipped) of ONE continuity rule for H② at
// every owner change on ②: a CORNER SPAN between two tangent points, H② linear in arclength across it from the first owner's
// own height at its tangent point to the second's at its. An arc's span is the arc (today's blend, untouched). A change with
// NO arc gets a span of half-length h on each leg, h derived, never a constant, and held to half its leg (the ease's own
// topological bound — legBack/2, legFwd/2), so two spans never overlap:
//   groundDeformer.cf-noarc-band.mjs   h = the ped band's depth behind ② on that leg (the ray's back, as the absorption reads it)
//   groundDeformer.cf-noarc-road.mjs   h = the road's half-width there (the ② vertex's distance to its tile's ①)
import { readFileSync, writeFileSync } from 'fs'
const src = readFileSync(process.argv[2], 'utf8')
const make = (name, depth) => { let s = src
  const edits = [
    ['rings.push({ ring, Hat, stamp, arc, t: ti, k: ri })', 'rings.push({ ring, Hat, stamp, arc, t: ti, k: ri, own: (i) => ownerOf(i)?.skelId ?? null, isArcEdge })'],
    ['  // ── THE ABSORPTION, ALONG ② (continuity along the street) ──', `  const NOARC = { changes: 0, spans: 0, zero: 0 }
  for (const rec of T) for (const R of rec.rings) { const ring = R.ring, n = ring.length, H0 = R.Hat
    const len = (i) => Math.hypot(ring[(i + 1) % n][0] - ring[i][0], ring[(i + 1) % n][1] - ring[i][1]), cum = new Float64Array(n + 1)
    for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + len(i); const total = cum[n]
    // a boundary of a leg: an owner change, or an arc's tangent point
    const isB = (i) => { const a = (i + n - 1) % n; return R.isArcEdge(a) !== R.isArcEdge(i) || (!R.isArcEdge(a) && !R.isArcEdge(i) && R.own(a) !== R.own(i)) }
    const B = []; for (let i = 0; i < n; i++) if (isB(i)) B.push(i)
    const at = (pos) => { pos = ((pos % total) + total) % total; let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cum[m] <= pos) lo = m; else hi = m - 1 } const L = len(lo); return { i: lo, u: L > 0 ? (pos - cum[lo]) / L : 0 } }
    const spans = []
    B.forEach((i, bi) => { const a = (i + n - 1) % n; if (R.isArcEdge(a) || R.isArcEdge(i) || R.own(a) === R.own(i)) return
      NOARC.changes++
      const prev = B[(bi + B.length - 1) % B.length], next = B[(bi + 1) % B.length], sV = cum[i]
      const legBack = ((sV - cum[prev]) % total + total) % total || total, legFwd = ((cum[next] - sV) % total + total) % total || total
      const V = ring[i], into = (k) => { const p = ring[k], q = ring[(k + 1) % n], L = len(k) || 1, nx = -(q[1] - p[1]) / L, nz = (q[0] - p[0]) / L, mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2
        return pipRings(mx + nx * 0.01, mz + nz * 0.01, rec.iA) ? [nx, nz] : [-nx, -nz] }
      const h = (k, side) => { ${depth} }
      const hb = Math.min(h(a, -1), legBack / 2), hf = Math.min(h(i, 1), legFwd / 2)
      if (!(hb + hf > 0)) { NOARC.zero++; return }
      const pa = at(sV - hb), pb = at(sV + hf)
      spans.push({ s0: sV - hb, L: hb + hf, ha: H0(pa.i, pa.u), hb: H0(pb.i, pb.u) }); NOARC.spans++ })
    if (!spans.length) continue
    R.Hat = (i, u) => { const pos = cum[i] + u * len(i)
      for (const sp of spans) { const d = ((pos - sp.s0) % total + total) % total; if (d <= sp.L) return sp.ha + (sp.hb - sp.ha) * d / sp.L }
      return H0(i, u) } }
  stats.noarc = NOARC
  // ── THE ABSORPTION, ALONG ② (continuity along the street) ──`]]
  for (const [a, b] of edits) { const k = s.split(a).length - 1; if (k !== 1) throw new Error(`make-noarc ${name}: anchor found ${k}× — ${a.slice(0, 80)}`); s = s.replace(a, b) }
  writeFileSync(new URL(`groundDeformer.cf-noarc-${name}.mjs`, import.meta.url), s.replace("'../src/lib/lattice.js'", "'../../../src/lib/lattice.js'")) }
// the band's depth behind ② on leg k, from the leg's point nearest V: the ray into the block, as the absorption casts it
make('band', `const p = side < 0 ? ring[i] : ring[i], q = side < 0 ? ring[k] : ring[(k + 1) % n], L = len(k) || 1, f = Math.min(0.5, 1e-3 / L), x = p[0] + (q[0] - p[0]) * f, z = p[1] + (q[1] - p[1]) * f, [ux, uz] = into(k)
        return pedOf(bandsAlong(x - uz * SIDESTEP, z + ux * SIDESTEP, ux, uz, CAP)).back`)
make('road', `const o = nearestOwned(rec.one, V[0], V[1], rec.diag); return o ? o.d : 0`)
console.log('make-noarc: groundDeformer.cf-noarc-band.mjs · groundDeformer.cf-noarc-road.mjs')
