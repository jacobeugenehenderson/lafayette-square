// make-line-cont.mjs <lineHeight.mjs> — COUNTERFACTUAL copy (probe only, never shipped) of lineHeight with a CONTINUOUS lookup.
// The nearest-segment projection jumps where a point crosses the chain's medial axis on the INSIDE of a bend: there the point's
// foot lies inside BOTH segments that meet at the vertex V, and which one is nearer flips. In that wedge the height is
// interpolated between the two feet, h = (1 − t)·h_in + t·h_out, t = a / (a + b), a = (P − V)·d_out ≥ 0 and b = −(P − V)·d_in ≥ 0
// (d_in, d_out the two segments' directions through V). On the wedge's edges one foot reaches V exactly (a = 0 or b = 0), which
// is where the other answer takes over alone — so the lookup is continuous, with no constant. Off the wedge, and everywhere ON
// the chain (a point of a segment never has an interior foot on the next one for a turn under 90°), it is the nearest segment's
// answer, unchanged.
import { readFileSync, writeFileSync } from 'fs'
let s = readFileSync(process.argv[2], 'utf8')
const a = `    return out
  }
  return { heightAt,`
if (s.split(a).length !== 2) throw new Error('make-line-cont: anchor not found once')
s = s.replace(`      if (d < best) { best = d; out = h[a] + u * (h[b] - h[a]) }
    }
    return out`, `      if (d < best) { best = d; out = h[a] + u * (h[b] - h[a]); bk = i; bu = u }
    }
    // ⭐ THE WEDGE at the nearest segment's ends: an interior foot on the neighbour too ⇒ interpolate between the two feet
    const foot = (i) => { const a = c.ids[i], b = c.ids[i + 1], dx = X[b] - X[a], dz = Z[b] - Z[a], L2 = dx * dx + dz * dz
      const u = L2 > 0 ? ((p[0] - X[a]) * dx + (p[1] - Z[a]) * dz) / L2 : -1; return { u, h: h[a] + Math.max(0, Math.min(1, u)) * (h[b] - h[a]), dx, dz, L: Math.sqrt(L2) } }
    for (const [i, j] of [[bk, bk + 1], [bk - 1, bk]]) { if (out == null || i < 0 || j + 1 >= c.ids.length) continue
      const A = foot(i), B = foot(j); if (!(A.u > 0 && A.u < 1 && B.u > 0 && B.u < 1) || !(A.L > 0 && B.L > 0)) continue
      const V = c.ids[j], vx = p[0] - X[V], vz = p[1] - Z[V], bb = -(vx * A.dx + vz * A.dz) / A.L, aa = (vx * B.dx + vz * B.dz) / B.L
      if (!(aa >= 0 && bb >= 0) || !(aa + bb > 0)) continue
      const t = aa / (aa + bb); out = (1 - t) * A.h + t * B.h; WEDGE.n++; break }
    return out`)
if (!s.includes('WEDGE.n++')) throw new Error('make-line-cont: the projection anchor did not take')
s = s.replace('    let best = Infinity, out = null\n', '    let best = Infinity, out = null, bk = -1, bu = 0\n')
s = s.replace('  function heightAt(skelId, p) {', '  const WEDGE = { n: 0 }\n  function heightAt(skelId, p) {')
s = s.replace(a, `    return out
  }
  return { wedge: WEDGE, heightAt,`)
writeFileSync(new URL('lineHeight.cf-cont.mjs', import.meta.url), s)
console.log('make-line-cont: lineHeight.cf-cont.mjs')
