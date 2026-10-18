// search-p.mjs — the smallest input with P's shape (HPDM 2026-10-18): a stripe edge and an asphalt edge on one line whose
// ends differ by millimetres, both refined. Searches for one where the WELDED detector (groundConformity.base.js, pre-(b))
// reports a T-junction and the exact one does not. Read-only.
import * as B from './groundConformity.base.js'
import * as N from '/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/hpdm-gate/cartograph/groundConformity.js'
const r3 = (v) => Math.round(v * 1000) / 1000
let found = 0
for (let L = 20; L <= 80 && found < 3; L += 3.7) for (let dEnd = 0.003; dEnd < 0.08 && found < 3; dEnd += 0.0013) for (const dStart of [0]) for (const me of [L / 17, L / 33, L / 9]) {
  const S = [{ outer: [[0, 0], [r3(L + dEnd), 0], [r3(L + dEnd), 0.2], [0, 0.2]] }]
  const A = [{ outer: [[r3(dStart), 0], [r3(dStart), -6], [r3(L), -6], [r3(L), 0]] }]
  const out = B.conformAndRefine([{ polys: S, refine: { mode: 'uniform', maxEdge: me } }, { polys: A, refine: { mode: 'uniform', maxEdge: me } }])
  const g = out.map((o, i) => ({ id: ['stripe', 'asphalt'][i], ...o }))
  const w = B.findTJunctions(g).total, x = N.findTJunctions(g).total
  if (w > 0 && x === 0) { found++; console.log(JSON.stringify({ L, dEnd, dStart, maxEdge: me, welded: w, exact: x, tris: out.reduce((n, o) => n + o.indices.length / 3, 0), S, A })) }
}
console.log('found', found)
