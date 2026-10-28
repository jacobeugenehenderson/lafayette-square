// READ-ONLY: where are the decks' remaining edges ≤ 2 mm after the cut-once open/close, and does each touch a FEATURE the
// open took or the close filled (a feature piece's vertex within 2 u), and are its vertices source vertices?
import clipperLib from 'clipper-lib'
import { readFileSync } from 'node:fs'
const ROOT = new URL('../../', import.meta.url).pathname, D = ROOT.replace(/\.claude\/worktrees\/shore\/$/, '') + 'cartograph/data'
const S = await import(ROOT + 'cartograph/structures.mjs'), { CLIP_SCALE: SC } = await import(ROOT + 'src/lib/lattice.js')
const { Clipper, Paths, PolyType, ClipType, PolyFillType } = clipperLib
const [t, step] = [process.argv[2] || 'provincetown', +(process.argv[3] || 0.9987867588490528)]
const g = JSON.parse(readFileSync(`${D}/${t}/raw/osm.json`, 'utf8')).ground, { paths } = S.deckInputs(g)
const c = new Clipper(), u = new Paths(); c.AddPaths(paths, PolyType.ptSubject, true); c.Execute(ClipType.ctUnion, u, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
const src = new Set(u.flatMap(p => p.map(q => q.X + ',' + q.Y)))
const oc = S.openCloseAtStep(paths, step, 'probe'), feats = [...oc.openedPieces.features.map(f => ['taken', f]), ...oc.closedPieces.features.map(f => ['filled', f])]
const fp = S.deckFootprints(g, step)
for (const p of fp.paths) p.forEach((q, i) => { const b = p[(i + 1) % p.length]; if (Math.hypot(b.X - q.X, b.Y - q.Y) > 2) return
  let best = null; for (const [k, f] of feats) for (const r of f.poly) for (const v of r) { const d = Math.hypot(v[0] * SC - q.X, v[1] * SC - q.Y); if (!best || d < best.d) best = { d, k, m2: f.m2 } }
  console.log(`(${q.X}, ${q.Y})→(${b.X}, ${b.Y}) ${Math.hypot(b.X - q.X, b.Y - q.Y).toFixed(2)} u · source vertices ${src.has(q.X + ',' + q.Y) ? 'a' : '-'}${src.has(b.X + ',' + b.Y) ? 'b' : '-'} · nearest feature vertex ${best ? best.d.toFixed(1) + ' u (' + best.k + ' ' + best.m2 + ' m²)' : 'none'}`) })
console.log(`features: taken ${oc.openedPieces.features.length}, filled ${oc.closedPieces.features.length} · slivers taken ${oc.openedPieces.slivers.n}, filled ${oc.closedPieces.slivers.n}`)
