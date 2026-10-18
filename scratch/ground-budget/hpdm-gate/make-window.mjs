// make-window.mjs — a SCRATCH copy of a bake-ground.js that, at the conformity call, runs conformAndRefine + findTJunctions
// on a WINDOW of the real conformity input (the bake's own polygons and refine policies, samplers included) and exits before
// conformity of the whole town. For tracing one T-junction without a full bake (Boz, 2026-10-18). Nothing written but --out.
//   node make-window.mjs <bake-ground.js> → bake-ground.window.js
//   env: WIN_P="x,z" (the site) · WIN_R="15,40" (half-sides, metres, run in order) · WIN_OUT=<json path>
// A polygon whose bbox lies inside the window goes in whole; one that crosses it is clipped by Clipper to the window
// (integer clipper units: a lattice ring keeps every vertex exactly) — EXCEPT mat:stripe, whose rings keep their own slot
// and are not on the lattice: a stripe polygon that meets the window goes in whole, as drawn.
import { readFileSync, writeFileSync } from 'fs'
const one = (s, a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`make-window: anchor found ${n}× — ${a}`); return s.replace(a, b) }
let src = readFileSync(process.argv[2], 'utf8')
src = one(src, `    const _tc = Date.now()
    const cstats = {}
    let bufs = conformAndRefine(planeSpecs, cstats)`, `    { // WINDOW (scratch, Screed 2026-10-18)
      const [px, pz] = process.env.WIN_P.split(',').map(Number), report = { P: [px, pz], runs: [] }
      // the input's own vertices within 2 cm of P, per group: is P a ring vertex of the input, and is it on the lattice?
      const near = []
      planeSpecs.forEach((sp, gi) => sp.polys.forEach((p, pi) => [p.outer, ...(p.holes || [])].forEach((r, ri) => r.forEach(([x, z], vi) => {
        const d = Math.hypot(x - px, z - pz); if (d < 0.02) near.push({ g: planeKeys[gi], pi, ri, vi, x, z, d,
          offLatticeMM: Math.max(Math.abs(x * CLIP_SCALE - Math.round(x * CLIP_SCALE)), Math.abs(z * CLIP_SCALE - Math.round(z * CLIP_SCALE))) }) }))))
      report.inputNear = near
      // the input's EDGES within 6 mm of P, per group (a ring edge P lies on)
      const segD = (ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0; return { d: Math.hypot(px - ax - t * dx, pz - az - t * dz), t } }
      const edges = []
      planeSpecs.forEach((sp, gi) => sp.polys.forEach((p, pi) => [p.outer, ...(p.holes || [])].forEach((r, ri) => r.forEach((a, vi) => {
        const b = r[(vi + 1) % r.length], s = segD(a[0], a[1], b[0], b[1]); if (s.d < 0.006) edges.push({ g: planeKeys[gi], pi, ri, vi, a, b, d: s.d, t: s.t, len: Math.hypot(b[0] - a[0], b[1] - a[1]) }) }))))
      report.inputEdgesNear = edges
      const bbox = (r) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z } return [x0, z0, x1, z1] }
      for (const R of process.env.WIN_R.split(',').map(Number)) {
        const W = [px - R, pz - R, px + R, pz + R], rect = [[W[0], W[1]], [W[2], W[1]], [W[2], W[3]], [W[0], W[3]]]
        let whole = 0, clipped = 0
        const specs = planeSpecs.map((sp, gi) => ({ ...sp, polys: sp.polys.flatMap(p => {
          const b = bbox(p.outer); if (b[2] < W[0] || b[0] > W[2] || b[3] < W[1] || b[1] > W[3]) return []
          if ((b[0] >= W[0] && b[2] <= W[2] && b[1] >= W[1] && b[3] <= W[3]) || planeKeys[gi] === 'mat:stripe') { whole++; return [p] }
          const c = new _Clipper(); c.StrictlySimple = true
          c.AddPaths([p.outer, ...(p.holes || [])].map(_ringToPath), _PolyType.ptSubject, true)
          c.AddPath(_ringToPath(rect), _PolyType.ptClip, true)
          const tree = new clipperLib.PolyTree()
          if (!c.Execute(_ClipType.ctIntersection, tree, _PolyFillType.pftEvenOdd, _PolyFillType.pftNonZero)) throw new Error('window: clip refused')
          const items = polyTreeToItems(tree); clipped++
          return items.map(it => ({ ...it, ...(p.side != null ? { side: p.side } : {}) })) }) }))
        const st = {}, t0 = Date.now(), bufs = conformAndRefine(specs, st)
        const tj = findTJunctions(bufs.map((b, i) => ({ id: planeKeys[i], ...b })))
        const inner = tj.found.filter(f => Math.max(Math.abs(f.x - px), Math.abs(f.z - pz)) < R - 1)
        const run = { R, whole, clipped, tris: bufs.reduce((n, b) => n + b.indices.length / 3, 0), s: (Date.now() - t0) / 1000, inTJ: st.inputTJunctions, closures: st.closures, refTJ: st.refineTJunctions, passes: st.passes, total: tj.total, cross: tj.cross, within: tj.within, inner: inner.map(f => ({ ...f })) }
        // every finding inside the window (away from its clipped edge): the triangles within 0.5 m, exact float32
        for (const f of run.inner) {
          f.tris = []
          bufs.forEach((b, gi) => { const P = b.positions, I = b.indices
            for (let t = 0; t < I.length; t += 3) { const v = [0, 1, 2].map(k => [P[I[t + k] * 3], P[I[t + k] * 3 + 2]])
              if (v.some(([x, z]) => Math.hypot(x - f.x, z - f.z) < 0.5)) f.tris.push({ g: planeKeys[gi], v }) } })
        }
        report.runs.push(run)
        console.log('[window] R ' + R + ' m: ' + whole + ' whole · ' + clipped + ' clipped · ' + run.tris + ' tris · ' + run.s.toFixed(1) + ' s · inTJ ' + run.inTJ + ' · refTJ ' + run.refTJ + ' · passes ' + run.passes + ' · detector ' + tj.total + ' (' + tj.cross + ' across) · inside the window ' + inner.length + (inner[0] ? ' · first (' + inner[0].x + ', ' + inner[0].z + ') ' + inner[0].vertexGroup + ' on ' + inner[0].edgeGroup : ''))
      }
      ;(await import('fs')).writeFileSync(process.env.WIN_OUT, JSON.stringify(report))
      console.log('[window] written ' + process.env.WIN_OUT + ' · input vertices within 2 cm of P: ' + near.length + ' · input edges within 6 mm: ' + edges.length); process.exit(0)
    }
    const _tc = Date.now()
    const cstats = {}
    let bufs = conformAndRefine(planeSpecs, cstats)`)
writeFileSync(new URL('bake-ground.window.js', import.meta.url), src)
