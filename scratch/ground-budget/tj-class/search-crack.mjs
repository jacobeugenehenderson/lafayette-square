// search-crack.mjs — a TRUE crack (two unshared boundary chains, < 1 mm apart somewhere) that exact identity finds and the
// 1 mm weld does not. Random fans over a 2 m edge. Read-only.
import * as W from './groundConformity.base.js'
import * as X from '/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/hpdm-gate/cartograph/groundConformity.js'
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const fan = (chain, apex) => { const pts = [...chain, apex], idx = []; const a = chain.length
  for (let i = 0; i + 1 < chain.length; i++) idx.push(...(apex[1] > 0 ? [i, i + 1, a] : [i, a, i + 1]))
  return { positions: new Float32Array(pts.flatMap(([x, z]) => [x, 0, z])), indices: new Uint32Array(idx) } }
const r4 = (v) => Math.round(v * 1e4) / 1e4
for (let n = 0; n < 200000; n++) {
  const k1 = 1 + Math.floor(rnd() * 3), k2 = 1 + Math.floor(rnd() * 3)
  const mid = (k) => Array.from({ length: k }, () => [r4(0.1 + rnd() * 1.8), r4((rnd() - 0.5) * 0.0012)]).sort((p, q) => p[0] - q[0])
  const A = [[0, 0], ...mid(k1), [2, 0]], B = [[0, 0], ...mid(k2), [2, 0]]
  const g = [{ id: 'above', ...fan(A, [1, 1]) }, { id: 'below', ...fan(B, [1, -1]) }]
  const x = X.findTJunctions(g).total, w = W.findTJunctions(g).total
  if (x > 0 && w === 0) { console.log(JSON.stringify({ A, B, exact: x, welded: w })); break }
}
