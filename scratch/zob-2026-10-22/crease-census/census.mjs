// THE CENSUS: of cutCreases' T-join inserts (the vertex-in-band branch), how many lie in the band but OUTSIDE the target
// edge's half-open unit square — i.e. where nodeCrossings' square pixel (latticeNode.js#nodeCrossings `enters`) would NOT
// route that edge through the vertex. 0 everywhere ⇒ the square serves both callers.
// ⛔ The square test is written HERE, not imported from latticeNode.js (a census must not share the rule it measures):
// doubled units, integer ends are even, the pixel is [2X−1, 2X+1) on each axis, the edge enters it when its box meets the
// pixel and the four corners do not all lie strictly on one side of its line.
export function entersPixel(a, b, q) {
  const ax = 2 * a[0], ay = 2 * a[1], bx = 2 * b[0], by = 2 * b[1], x0 = 2 * q[0] - 1, x1 = 2 * q[0] + 1, y0 = 2 * q[1] - 1, y1 = 2 * q[1] + 1
  if (Math.max(ax, bx) < x0 || Math.min(ax, bx) >= x1 || Math.max(ay, by) < y0 || Math.min(ay, by) >= y1) return false
  const dx = bx - ax, dy = by - ay, f = (x, y) => dx * (y - ay) - dy * (x - ax), v = [f(x0, y0), f(x1, y0), f(x0, y1), f(x1, y1)]
  return Math.min(...v) <= 0 && Math.max(...v) >= 0
}
// one tally per run; an insert counts once per (round, ring, edge, point), and only when `put` would take it (not already on
// the ring). Distances are in lattice steps (the cut's own integer units).
export function startCensus() {
  const T = { tjoin: 0, square: 0, bandOnly: 0, maxBandOnly: 0, byRound: {}, first: [], done: null }, seen = new Set()
  globalThis.__creaseObs = ({ round, ri, i, q, e0, e1, cr, L2, had }) => {
    if (had) return
    const key = `${round}|${ri}|${i}|${q[0]},${q[1]}`; if (seen.has(key)) return; seen.add(key)
    const r = (T.byRound[round] ||= { tjoin: 0, bandOnly: 0 }); T.tjoin++; r.tjoin++
    if (entersPixel(e0, e1, q)) { T.square++; return }
    const d = Math.abs(cr) / Math.sqrt(L2); T.bandOnly++; r.bandOnly++; T.maxBandOnly = Math.max(T.maxBandOnly, d)
    if (T.first.length < 5) T.first.push({ q, d: +d.toFixed(3) })
  }
  globalThis.__creaseDone = (x) => { T.done = x; T.onDone?.(T) }
  return T
}
export const line = (name, T) => `${name}: cutCreases ${T.done ? `settled in ${T.done.rounds} round(s), ${T.done.inserted} point(s) inserted` : 'NOT REACHED'}`
  + ` · T-join inserts ${T.tjoin} · in the square ${T.square} · in the band only ${T.bandOnly}`
  + (T.bandOnly ? ` (max ${T.maxBandOnly.toFixed(3)} step off the edge; by round ${Object.entries(T.byRound).map(([k, v]) => `${k}:${v.bandOnly}/${v.tjoin}`).join(' ')}; first ${T.first.map(f => `(${f.q.map(v => v / 1000).join(', ')}) ${f.d}`).join(' · ')})` : '')
