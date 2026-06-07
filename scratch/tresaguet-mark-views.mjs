// One wide render per mark: asphalt + block boundary + centerlines + the mark
// + all fillet handles in view.
import { R, build, svg, markPts } from './tresaguet-setup.mjs'
const g = build()
const fk = Object.entries(g.cornerFillets || {})
for (const [mi, pts] of markPts.entries()) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]) }
  const c = [(x0 + x1) / 2, (z0 + z1) / 2]
  const half = Math.max(40, Math.max(x1 - x0, z1 - z0) / 2 + 25)
  svg(`scratch/tresaguet-mark${mi}.svg`, {
    center: c, half,
    layers: [
      { rings: g.asphalt || [], fill: '#ccc' },
      { rings: g.block || [], fill: 'none', stroke: '#06c', sw: 1.2 },
      { lines: R.streets.filter(s => !s.gradeSeparated && !s.disabled).map(s => s.points), stroke: '#aaa', sw: 0.6 },
      { lines: [pts], stroke: '#e11', sw: 2.5, op: 0.85 },
      { dots: fk.filter(([k, f]) => Math.abs(f.apex[0] - c[0]) < half && Math.abs(f.apex[1] - c[1]) < half).map(([k, f]) => f.apex), fill: '#f0f', r: 4 },
    ],
  })
}
