// FROZEN — offsetRingByRects' band clips as they were built at c138cc2c, before shared joins (BRIEF-the-ink-meets-inside-the-
// ink §5d). The MUTANT for checks/claims-no-band-union-reversal.mjs: each band's rect from its own corners, each vertex's join
// piece from its own copy of them (a miter where a cone test allowed it, with no extent; else the bevel), every piece rounded
// on its own. Unlabelled (rings only). ⛔ Never imported by src/. Returns the clips; the check unites and subtracts them with
// the live booleans, so only the construction differs.
import clipperLib from 'clipper-lib'
import { CLIP_SCALE as SCALE } from '../../src/lib/lattice.js'
const toClipper = (p) => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })
const signedArea = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i][0] * r[j][1] - r[j][0] * r[i][1] } return a / 2 }
export function bandClipsFrozen(ring, depthAt, outward = false, idMap = null) {
  const n = ring.length, ccw = (signedArea(ring) > 0) !== outward, seg = []
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n]
    let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L
    const nx = ccw ? -dy : dy, ny = ccw ? dx : -dx, raw = depthAt(i)
    const dS = Math.max(0, (Array.isArray(raw) ? raw[0] : raw) || 0), dE = Math.max(0, (Array.isArray(raw) ? raw[1] : raw) || 0)
    const P = [a[0] + nx * dS, a[1] + ny * dS], Q = [b[0] + nx * dE, b[1] + ny * dE]
    let ex = Q[0] - P[0], ey = Q[1] - P[1]; const eL = Math.hypot(ex, ey) || 1
    seg.push({ a, b, e: [dx, dy], dir: [ex / eL, ey / eL], nrm: [nx, ny], P, Q, dS, dE })
  }
  const clips = []
  const addClip = (poly) => { if (poly.length < 3 || !(Math.abs(signedArea(poly)) > 1e-12)) return
    clips.push(clipperLib.Clipper.Orientation(poly.map(toClipper)) === true ? poly : [...poly].reverse()) }
  for (let i = 0; i < n; i++) {
    const S = seg[i]
    if (S.dS > 0 || S.dE > 0) addClip([S.a, S.b, S.Q, S.P])
    const A = seg[(i - 1 + n) % n], v = ring[i], ia = (i - 1 + n) % n
    const turn = A.e[0] * S.e[1] - A.e[1] * S.e[0]
    if (!(A.dE > 0 || S.dS > 0)) continue
    if (!(Math.abs(turn) > 1e-12)) continue
    const det = A.dir[0] * S.dir[1] - A.dir[1] * S.dir[0]
    let X = null
    if (Math.abs(det) > 1e-12) {
      const t = ((S.P[0] - A.Q[0]) * A.dir[1] - (S.P[1] - A.Q[1]) * A.dir[0]) / det
      const Xc = [S.P[0] + S.dir[0] * t, S.P[1] + S.dir[1] * t], u = [Xc[0] - v[0], Xc[1] - v[1]]
      const c = A.nrm[0] * S.nrm[1] - A.nrm[1] * S.nrm[0]
      const inCone = (A.nrm[0] * u[1] - A.nrm[1] * u[0]) * c >= 0 && (u[0] * S.nrm[1] - u[1] * S.nrm[0]) * c >= 0 &&
        u[0] * (A.nrm[0] + S.nrm[0]) + u[1] * (A.nrm[1] + S.nrm[1]) > 0
      const hwyJoin = idMap?.hwy && (idMap.hwy[ia] || idMap.hwy[i])
      if (inCone || (hwyJoin && u[0] * (A.nrm[0] + S.nrm[0]) + u[1] * (A.nrm[1] + S.nrm[1]) > 0)) X = Xc
    }
    if (X) addClip([v, A.Q, X, S.P])
    else addClip([v, A.Q, S.P])
  }
  return clips
}
