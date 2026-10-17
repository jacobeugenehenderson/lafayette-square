// make-why.mjs <groundDeformer.mjs> — a PROBE copy (groundDeformer.why.mjs, beside this file; never shipped) whose resolve
// also returns WHY: the branch (road side · on ② · band-held · lot ease · unowned), the owner span's station, H, depth, ring
// and stamp, and the profile's inputs (R the absorption, the lawn/walk widths and their shares, back, B, hBack, f).
// Exposed as `_why(x, z)` (uncached). Every edit is anchored once, or it throws. The lattice import is re-rooted.
import { readFileSync, writeFileSync } from 'fs'
let s = readFileSync(process.argv[2], 'utf8')
const one = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`make-why: anchor found ${n}× — ${a}`); s = s.replace(a, b) }
const W = `why: { R, lawnW, walkW, lawnCap, byLawn, byWalk, back, blend, H: n.H, d: n.d, st: [n.px, n.pz], t: n.R.t, k: n.R.k, i: n.i, stamp: n.R.stamp[n.i], arc: n.R.arc[n.i], ped: ped.map(b => b.cls + ':' + (b.to - b.from).toFixed(2)).join(' ') }`
one("if (n.d <= back) return { v: at(n.d), held }", `if (n.d <= back) return { v: at(n.d), held, ${W.replace('why: {', 'why: { branch: "in band",')} }`)
one("if (n.d >= back + blend) return { v: raw(x, z), held }", `if (n.d >= back + blend) return { v: raw(x, z), held, ${W.replace('why: {', 'why: { branch: "past the ease",')} }`)
one("return { v: hBack + (raw(x, z) - hBack) * f, held }", `return { v: hBack + (raw(x, z) - hBack) * f, held, ${W.replace('why: {', 'why: { branch: "ease", hBack, f,')} }`)
one("if (!pipRings(x, z, t.iA) || n.d < 1e-9) return { v: n.H, owner: own(n) }", "if (!pipRings(x, z, t.iA) || n.d < 1e-9) return { v: n.H, owner: own(n), why: { branch: 'road side / on ②', H: n.H, d: n.d, st: [n.px, n.pz], t: n.R.t, k: n.R.k, i: n.i, stamp: n.R.stamp[n.i], arc: n.R.arc[n.i] } }")
one("if (c.d < LATTICE) return { v: c.H, owner: own(c) }", "if (c.d < LATTICE) return { v: c.H, owner: own(c), why: { branch: 'within the lattice of ②', H: c.H, d: c.d, t: c.R.t, k: c.R.k, i: c.i } }")
one("if (p.held) { if (c.R !== n.R || c.key !== nearKey(n)) stats.byBand++; return { v: p.v, owner: own(c) } }", "if (p.held) { if (c.R !== n.R || c.key !== nearKey(n)) stats.byBand++; return { v: p.v, owner: own(c), why: { ...p.why, held: true, byBand: c.R !== n.R || c.key !== nearKey(n) } } }")
one("if (inBand(x, z)) { stats.unowned++; return { v: null, owner: null, unowned: t.ti } }", "if (inBand(x, z)) { stats.unowned++; return { v: null, owner: null, unowned: t.ti, why: { branch: 'UNOWNED (in a band no span reaches)', t: t.ti } } }")
one("return { v: profile(n, x, z).v, owner: own(n) }", "{ const p = profile(n, x, z); return { v: p.v, owner: own(n), why: { ...p.why, lot: true } } }")
one("return { heightAt, stats,", "return { _why: (x, z) => resolveUncached(x, z), heightAt, stats,")
s = s.replace("'../src/lib/lattice.js'", "'../../../src/lib/lattice.js'")
writeFileSync(new URL('groundDeformer.why.mjs', import.meta.url), s)
