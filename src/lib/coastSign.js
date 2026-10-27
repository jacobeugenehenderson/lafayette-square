// coastSign.js — THE SIGN IS THE ISLAND (Zob, 2026-10-26), as ONE predicate. ① subtracts the water by nonzero fill, so a coast
// ring's winding is its meaning: a ring at EVEN nesting depth (a water body's outer, or a lake on an island) must be wound
// positive, one at ODD depth (an island, a hole in the water) negative. A ring that breaks it turns land into water or water into
// land, silently. Read by coastFile.mjs#readCoast (the coast's one door, which re-exports it) and by the mint
// (tileGround.js#mintProtopolygon), which refuses a coast handed to it any other way. Pure: no import, so the browser can read it.

const area2 = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0)
const windingAt = (p, r) => { let w = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
    if (zj <= p[1]) { if (zi > p[1] && (xi - xj) * (p[1] - zj) - (p[0] - xj) * (zi - zj) > 0) w++ } else if (zi <= p[1] && (xi - xj) * (p[1] - zj) - (p[0] - xj) * (zi - zj) < 0) w-- }
  return w }

// → [{ i, depth, want: +1 | −1, got: +1 | −1 | 0, at }] for every ring that breaks the parity rule (empty when the coast is sound).
// A ring's depth is how many of the OTHER rings hold its first vertex. Rings of fewer than 3 points are skipped.
export function coastSignBreaks(rings) {
  const R = (rings || []).filter(r => Array.isArray(r) && r.length >= 3)
  const out = []
  R.forEach((r, i) => { const depth = R.reduce((d, s, j) => d + (j !== i && windingAt(r[0], s) !== 0 ? 1 : 0), 0)
    const want = depth % 2 === 0 ? 1 : -1, got = Math.sign(area2(r))
    if (got !== want) out.push({ i, depth, want, got, at: r[0] }) })
  return out
}
