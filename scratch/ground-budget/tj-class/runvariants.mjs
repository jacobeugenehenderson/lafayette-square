// runvariants.mjs — called IN-PROCESS by bake-ground.window.js at the conformity call (make-window.mjs): a window of the
// bake's own conformity input (polygons + refine policies, samplers included), through each conformity variant, with
// metrics.mjs on each output, and the triangles around every finding near the site written out. Exits nothing; returns a report.
//  mode 'whole': every polygon whose bbox meets the window goes in WHOLE (no clipping), so its triangulation is the bake's.
//  mode 'clip':  a polygon crossing the window is clipped to it (lattice rings keep their vertices exactly; mat:stripe whole).
//  variants: base · a (midpointIndex welds) · b (exact-identity detector; base's mesh) · c (mat:stripe's rings rounded onto
//  the 1 mm lattice before conformity, base conformity) · c+a.
import { metrics } from './metrics.mjs'
const DIR = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/scratch/ground-budget/tj-class/'
export async function runVariants({ planeSpecs, planeKeys, P, radii, mode, clip, CLIP_SCALE }) {
  const V = Object.fromEntries(await Promise.all(['base', 'a', 'b'].map(async v => [v, await import(DIR + `groundConformity.${v}.js`)])))
  const det = { stock: V.base.findTJunctions, exact: V.b.findTJunctions }
  const [px, pz] = P, rep = []
  const bbox = (r) => { let a = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, z] of r) a = [Math.min(a[0], x), Math.min(a[1], z), Math.max(a[2], x), Math.max(a[3], z)]; return a }
  const toLattice = (r) => r.map(([x, z]) => [Math.round(x * CLIP_SCALE) / CLIP_SCALE, Math.round(z * CLIP_SCALE) / CLIP_SCALE])
  for (const R of radii) {
    const W = [px - R, pz - R, px + R, pz + R]
    let whole = 0, clipped = 0, verts = 0
    const specs = planeSpecs.map((sp, gi) => ({ ...sp, polys: sp.polys.flatMap(p => {
      const b = bbox(p.outer); if (b[2] < W[0] || b[0] > W[2] || b[3] < W[1] || b[1] > W[3]) return []
      if (mode === 'whole' || (b[0] >= W[0] && b[2] <= W[2] && b[1] >= W[1] && b[3] <= W[3]) || planeKeys[gi] === 'mat:stripe') { whole++; verts += p.outer.length + (p.holes || []).reduce((n, h) => n + h.length, 0); return [p] }
      clipped++; return clip(p, W) }) }))
    const stripeLattice = specs.map((sp, gi) => planeKeys[gi] !== 'mat:stripe' ? sp : { ...sp, polys: sp.polys.map(p => ({ ...p, outer: toLattice(p.outer), holes: (p.holes || []).map(toLattice) })) })
    const offLattice = specs[planeKeys.indexOf('mat:stripe')]?.polys.flatMap(p => [p.outer, ...(p.holes || [])]).flat().filter(([x, z]) => Math.round(x * CLIP_SCALE) !== x * CLIP_SCALE || Math.round(z * CLIP_SCALE) !== z * CLIP_SCALE).length ?? 0
    const row = { R, mode, whole, clipped, verts, stripeVertsOffLattice: offLattice, variants: {} }
    for (const [name, mod, input] of [['base', V.base, specs], ['a', V.a, specs], ['c', V.base, stripeLattice], ['c+a', V.a, stripeLattice]]) {
      const t0 = Date.now(), st = {}, out = mod.conformAndRefine(input, st)
      const m = metrics(out, planeKeys, det, [px, pz, 2])
      m.s = (Date.now() - t0) / 1000; m.inTJ = st.inputTJunctions; m.refTJ = st.refineTJunctions; m.passes = st.passes
      // every stock finding within 2 m of the site, exact, with the triangles within 0.3 m (for the mechanism)
      const g = out.map((b, i) => ({ id: planeKeys[i], ...b }))
      m.findings = det.stock(g).found.filter(f => Math.max(Math.abs(f.x - px), Math.abs(f.z - pz)) < 2).map(f => ({ ...f, tris: name === 'base' ? out.flatMap((b, gi) => { const Q = b.positions, I = b.indices, o = []
        for (let t = 0; t < I.length; t += 3) { const v = [0, 1, 2].map(k => [Q[I[t + k] * 3], Q[I[t + k] * 3 + 2]]); if (v.some(([x, z]) => Math.hypot(x - f.x, z - f.z) < 0.3)) o.push({ g: planeKeys[gi], v }) } return o }) : undefined }))
      row.variants[name] = m
      console.log(`[variants] R ${R} ${mode} · ${name.padEnd(4)} · ${m.s.toFixed(1)} s · tris ${m.tris} · TJ stock ${m.tj_stock} (near ${m.tjNear_stock}) · exact ${m.tj_exact} (near ${m.tjNear_exact}) · zeroArea ${m.zeroArea} · weldCollapsed ${m.weldCollapsed} · inverted ${m.inverted} · nonManifold exact ${m.nonManifoldExact} / welded ${m.nonManifoldWelded} · subMM ${m.subMM}${m.findings[0] ? ` · first (${m.findings[0].x}, ${m.findings[0].z}) ${m.findings[0].vertexGroup} on ${m.findings[0].edgeGroup}` : ''}`)
    }
    rep.push(row)
    console.log(`[variants] R ${R} ${mode}: ${whole} whole (${verts} ring vertices) · ${clipped} clipped · stripe vertices off the lattice ${offLattice}`)
  }
  return rep
}
