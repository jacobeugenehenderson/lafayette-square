// make-why-lot.mjs <groundDeformer.mjs> [out.mjs] — a PROBE copy (groundDeformer.why-lot.mjs beside this file; never shipped) whose
// lot branch also returns WHO: the nearest span (ring k, edge i, its key), its depth, the ray's ped band and back edge, and the
// point just inside that back edge (where the band piece behind the lot point is read). Every edit is anchored once, or it throws.
import { readFileSync, writeFileSync } from 'fs'
let s = readFileSync(process.argv[2], 'utf8')
const one = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`make-why-lot: anchor found ${n}× — ${a}`); s = s.replace(a, b) }
one("from '../src/lib/lattice.js'", "from '../../../src/lib/lattice.js'")
one("return { v: profile(n, x, z).v, owner: own(n) }", `{ const v = profile(n, x, z).v, ux = (x - n.px) / n.d, uz = (z - n.pz) / n.d
      const { ped, back } = pedOf(bandsAlong(n.px - uz * SIDESTEP, n.pz + ux * SIDESTEP, ux, uz, CAP)), sb = back - 2 * LATTICE
      return { v, owner: own(n), lot: { ti: t.ti, k: n.R.k, i: n.i, key: nearKey(n), d: n.d, H: n.H, back, eased: n.d < back + blend, ped: ped.map(b => b.cls).join('+'), behind: ped.length && sb > 0 ? [n.px + ux * sb, n.pz + uz * sb] : null } } }`)
one("return { heightAt, stats,", "return { _resolve: (x, z) => resolve(x, z), heightAt, stats,")
writeFileSync(process.argv[3] || new URL('./groundDeformer.why-lot.mjs', import.meta.url), s)
