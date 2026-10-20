// make-road.mjs <groundDeformer.mjs> — COUNTERFACTUAL road side, a probe copy never shipped (groundDeformer.cf-road.mjs): a
// point on the ROAD SIDE of ② takes its owner edge's height AT THE POINT — the owner's line there (`line.heightAt(skelId,
// p)`), the terrain under it for a highway/bridge edge, the arc's blend as now — instead of the station's H carried flat out
// to the reach. Everything else as the given deformer. Anchors counted, or it throws; the lattice import is re-rooted.
import { readFileSync, writeFileSync } from 'fs'
let s = readFileSync(process.argv[2], 'utf8')
const one = (a, b) => { const k = s.split(a).length - 1; if (k !== 1) throw new Error(`make-road: anchor found ${k}× — ${a}`); s = s.replace(a, b) }
one('E[i] = { h, m }', 'E[i] = { h, m, id: o.skelId }')
one('rings.push({ ring, Hat, stamp, arc, t: ti, k: ri })', 'rings.push({ ring, Hat, E, stamp, arc, t: ti, k: ri })')
one('if (!pipRings(x, z, t.iA) || n.d < 1e-9) return { v: n.H, owner: own(n) }',
  "if (!pipRings(x, z, t.iA) || n.d < 1e-9) { const e = n.R.E[n.i]; return { v: n.d < 1e-9 || e.arc ? n.H : e.terrain ? raw(x, z) : (line.heightAt(e.id, [x, z]) ?? n.H), owner: own(n) } }")
s = s.replace("'../src/lib/lattice.js'", "'../../../src/lib/lattice.js'")
writeFileSync(new URL('groundDeformer.cf-road.mjs', import.meta.url), s)
