// For named dark sides: at each 10 m station, probe at pavHW+3 m on that side; in the frozen tile holding it, take the
// nearest iaFull contour edge and report the run that its iaStamp names (skelId|side), and the distance to it.
import fs from 'fs'; import path from 'path'
const DATA = '/Users/jacobhenderson/Desktop/lafayette-square.nosync', CODE = DATA + '/.claude/worktrees/census-202'
const [,, scene, ...keys] = process.argv
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const r = rd(scene === 'lafayette-square' ? CODE + '/src/data/ribbons.json' : `${DATA}/cartograph/data/${scene}/clean/ribbons.json`)
const tiles = rd(`${DATA}/public/baked/${scene}/shape.json`).tiles
const by = new Map(r.streets.map(s => [s.skelId || s.name, s]))
const pip = (x, z, ring) => { let o = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) o = !o } return o }
const segD = (p, A, B) => { const dx = B[0] - A[0], dz = B[1] - A[1], l = dx * dx + dz * dz; let t = l ? ((p[0] - A[0]) * dx + (p[1] - A[1]) * dz) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - A[0] - t * dx, p[1] - A[1] - t * dz) }
for (const k of keys) {
  const [skel, side] = k.split('|'), st = by.get(skel), sign = side === 'left' ? -1 : 1, me = st.measure[side].pavementHW
  const tally = new Map(), pts = st.points
  for (let i = 1; i < pts.length; i++) { const A = pts[i - 1], B = pts[i], L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 1e-6) continue
    const nx = -(B[1] - A[1]) / L, nz = (B[0] - A[0]) / L
    for (let s = 0; s < L; s += 10) { const O = [A[0] + (B[0] - A[0]) * s / L, A[1] + (B[1] - A[1]) * s / L], P = [O[0] + sign * nx * (me + 3), O[1] + sign * nz * (me + 3)]
      const t = tiles.find(t => t.ring && pip(P[0], P[1], t.ring)); if (!t) { tally.set('no tile', (tally.get('no tile') || 0) + 1); continue }
      let best = [Infinity, null]
      ;(t.iaFull || []).forEach((ring, si) => { for (let q = 0; q < ring.length; q++) { const d = segD(O, ring[q], ring[(q + 1) % ring.length]); if (d < best[0]) best = [d, t.iaStamp?.[si]?.[q]] } })
      const run = best[1] != null ? t.runs[best[1]] : null
      const lab = run ? `${run.skelId}|${run.side}` : 'unstamped edge'
      const key = `${lab}${run && run.skelId === skel ? ' (SELF)' : ''} @${Math.round(best[0])}m`
      tally.set(key, (tally.get(key) || 0) + 1) } }
  console.log(`${k.padEnd(30)} → ${[...tally].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a, b]) => `${a}×${b}`).join(', ')}`)
}
