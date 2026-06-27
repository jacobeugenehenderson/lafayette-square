/**
 * buildStairGeometry — turn a 2-point `steps` polyline into a real staircase
 * (treads + risers) descending from the "up" end to the "down" end.
 *
 * Pure: returns flat { positions, indices } arrays in WORLD x/z with a LOCAL Y
 * profile (top tread at y=0, descending −riser per step). The caller rides it
 * onto terrain RIGIDLY (a staircase IS a grade transition — it must not drape
 * per-vertex like flat ground). Reusable by the runtime now and the bake later
 * (Phase 5). The descent direction is decided by the caller (toward water /
 * lower terrain) and passed as `descendToB`.
 *
 * Step count: when a MEASURED `drop` is given (from the 3DEP micro-elevation
 * probe), N = round(drop / riser) so risers stay ~standard and the flight
 * matches the real grade; otherwise N = round(runLength / tread) (the
 * fallback fixed profile). Each step = a horizontal tread quad + a vertical
 * riser quad, spanning the path width.
 */
export function buildStairGeometry(points, { width = 1.5, riser = 0.15, tread = 0.3, descendToB = true, drop = null } = {}) {
  if (!points || points.length < 2) return null
  const a = points[0], b = points[points.length - 1]
  const up = descendToB ? a : b
  const down = descendToB ? b : a
  const dx = down[0] - up[0], dz = down[1] - up[1]
  const L = Math.hypot(dx, dz)
  if (L < 1e-3) return null
  const dirX = dx / L, dirZ = dz / L
  const perpX = -dirZ, perpZ = dirX
  const hw = width / 2
  // Measured-grade flight (real drop) vs fallback fixed profile.
  const haveDrop = Number.isFinite(drop) && drop > 0.01
  const N = haveDrop ? Math.max(1, Math.round(drop / riser)) : Math.max(1, Math.round(L / tread))
  const riserH = haveDrop ? drop / N : riser
  const stepLen = L / N
  // Anchor the LOWEST tread at y=0 so the whole flight sits ON the ground
  // (rising toward the up end) and is visible. The baked ground is flat (no
  // micro-grade), so a descending flight would bury under the opaque ground;
  // anchoring at the bottom keeps it above-surface until the ground itself
  // carries the micro-relief (terrain up-sample, later).
  const totalRise = N * riserH

  const positions = [], indices = []
  // world point at along-distance s, perpendicular offset off, height y.
  const P = (s, off, y) => [up[0] + dirX * s + perpX * off, y, up[1] + dirZ * s + perpZ * off]
  const quad = (p0, p1, p2, p3) => {
    const o = positions.length / 3
    positions.push(...p0, ...p1, ...p2, ...p3)
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3)
  }

  for (let i = 0; i < N; i++) {
    const s0 = i * stepLen, s1 = (i + 1) * stepLen
    // Up end (i=0) is highest at totalRise; bottom tread (i=N-1) lands at y=0.
    const yT = totalRise - i * riserH, yB = totalRise - (i + 1) * riserH
    // Tread (horizontal, at yT), wound CCW for an up-facing normal.
    quad(P(s0, -hw, yT), P(s0, hw, yT), P(s1, hw, yT), P(s1, -hw, yT))
    // Riser (vertical, at the front edge s1, from yT down to yB).
    quad(P(s1, -hw, yT), P(s1, hw, yT), P(s1, hw, yB), P(s1, -hw, yB))
  }
  const centroid = [(up[0] + down[0]) / 2, (up[1] + down[1]) / 2]
  return { positions, indices, centroid, steps: N }
}
