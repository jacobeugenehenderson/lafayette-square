// Classify every in-hood dark side (from dark-sides.mjs --frozen output) by what lies on that side:
//  PAIR   — the first chain the side-ray meets (modal over stations) is its divided partner, nearer than this pavHW + partner pavHW + 2 m
//  ABUT   — another chain (not its pair) nearer than the two pavHWs + 2 m (pavements touch: no block can form between)
//  LOOP   — the chain is closed (ends ≤ 15 m apart) and the dark side is its inside
//  OPEN   — nothing that near; then: probe at pavHW+3 m inside a frozen tile ring?  in-tile / no-tile
//  ⚠️ thresholds are classifiers for the report only; nothing here decides ownership.
import fs from 'fs'; import path from 'path'
const DATA = '/Users/jacobhenderson/Desktop/lafayette-square.nosync', CODE = DATA + '/.claude/worktrees/census-202'
const S = path.dirname(new URL(import.meta.url).pathname)
const scene = process.argv[2]
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const r = rd(scene === 'lafayette-square' ? CODE + '/src/data/ribbons.json' : `${DATA}/cartograph/data/${scene}/clean/ribbons.json`)
const rows = rd(`${S}/${scene}.frozen.json`).filter(x => x.dark && x.Lin > 0)
const tiles = rd(`${DATA}/public/baked/${scene}/shape.json`).tiles
const hood = rd(`${DATA}/cartograph/data/${scene}/neighborhood_boundary.json`).boundary
const by = new Map(r.streets.map(s => [s.skelId || s.name, s]))
const pip = (x, z, ring) => { let o = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) o = !o } return o }
const hit = (O, D, pts) => { let best = Infinity
  for (let i = 1; i < pts.length; i++) { const A = pts[i - 1], B = pts[i], ex = B[0] - A[0], ez = B[1] - A[1], den = ex * D[1] - ez * D[0]
    if (Math.abs(den) < 1e-12) continue; const wx = A[0] - O[0], wz = A[1] - O[1], t = (ex * wz - ez * wx) / den, s = (D[0] * wz - D[1] * wx) / den
    if (t > 0.05 && s >= 0 && s <= 1 && t < best) best = t } return best }
const hw = (s, side) => Math.max(s?.measure?.left?.pavementHW || 0, s?.measure?.right?.pavementHW || 0)
const cat = new Map(), ex = new Map()
for (const row of rows) {
  const [skel, side] = row.k.split('|'), st = by.get(skel), sign = side === 'left' ? -1 : 1, me = st.measure[side].pavementHW
  const pts = st.points, closed = Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) <= 15
  let area = 0; for (let i = 0; i < pts.length; i++) { const A = pts[i], B = pts[(i + 1) % pts.length]; area += A[0] * B[1] - B[0] * A[1] }
  const tally = new Map(); let n = 0, inTile = 0
  for (let i = 1; i < pts.length; i++) { const A = pts[i - 1], B = pts[i], L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 1e-6) continue
    const nx = -(B[1] - A[1]) / L, nz = (B[0] - A[0]) / L
    for (let s = 0; s < L; s += 10) { const O = [A[0] + (B[0] - A[0]) * s / L, A[1] + (B[1] - A[1]) * s / L]; n++
      let best = [null, Infinity]
      for (const o of r.streets) { if (o === st || !o.points || o.points.length < 2) continue; const t = hit(O, [sign * nx, sign * nz], o.points); if (t < best[1]) best = [o, t] }
      let k = 'OPEN'
      if (best[0] && best[1] <= me + hw(best[0]) + 2) k = (best[0].skelId === st.pairId) ? 'PAIR' : 'ABUT'
      if (k === 'OPEN') { const P = [O[0] + sign * nx * (me + 3), O[1] + sign * nz * (me + 3)]; if (tiles.some(t => t.ring && pip(P[0], P[1], t.ring))) inTile++ }
      tally.set(k, (tally.get(k) || 0) + 1) } }
  let k = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] || 'OPEN'
  if (closed && Math.sign(area) === (side === 'left' ? 1 : -1) * -1 * -1 * (side === 'left' ? 1 : 1) && false) {}
  if (closed) k = 'LOOP'
  if (k === 'OPEN') k = inTile > 0 ? 'OPEN, probe lands in a tile' : 'OPEN, probe lands in no tile'
  const typ = `${k} [${st.type}${k === 'ABUT' ? '' : ''}]`
  cat.set(k, (cat.get(k) || 0) + 1); if (!ex.has(k)) ex.set(k, []); ex.get(k).push(`${row.k}(${st.type},${row.Lin.toFixed(0)}m)`)
}
console.log(`── ${scene}: ${rows.length} in-hood dark sides`)
for (const [k, v] of [...cat].sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(3)}  ${k.padEnd(30)} e.g. ${ex.get(k).slice(0, 5).join(' · ')}`)
