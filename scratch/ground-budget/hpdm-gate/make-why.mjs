// make-why.mjs <groundDeformer.mjs> [out.mjs] [--no-envelope] [--no-smooth] [--no-station-clamp] [--point-need] [--cap-window] [--cap-fan] — a PROBE copy (groundDeformer.why.mjs, or out.mjs, beside this file; never shipped) whose resolve
// also returns WHY: the branch (road side · on ② · band-held · lot ease · unowned), the owner span's station, H, depth, ring
// and stamp, and the profile's inputs (R the absorption, the lawn/walk widths and their shares, back, B, hBack, f).
// Exposed as `_why(x, z)` (uncached). Every edit is anchored once, or it throws. The lattice import is re-rooted.
import { readFileSync, writeFileSync } from 'fs'
let s = readFileSync(process.argv[2], 'utf8')
const one = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`make-why: anchor found ${n}× — ${a}`); s = s.replace(a, b) }
const W = `why: { R, lawnW, walkW, lawnCap, byLawn, byWalk, back, blend, H: n.H, d: n.d, st: [n.px, n.pz], t: n.R.t, k: n.R.k, i: n.i, stamp: n.R.stamp[n.i], arc: n.R.arc[n.i], ped: ped.map(b => b.cls + ':' + (b.to - b.from).toFixed(2)).join(' '), u: n.u, Araw: raw(n.px + ux * back, n.pz + uz * back) - n.H, walkCap: Math.max(0, WALK_SHARE * walkMax * walkW / exag - head) }`
one("if (n.d <= back) return { v: at(n.d), held }", `if (n.d <= back) return { v: at(n.d), held, ${W.replace('why: {', 'why: { branch: "in band",')} }`)
one("if (n.d >= back + blend) return { v: raw(x, z), held }", `if (n.d >= back + blend) return { v: raw(x, z), held, ${W.replace('why: {', 'why: { branch: "past the ease",')} }`)
one("return { v: hBack + (raw(x, z) - hBack) * f, held }", `return { v: hBack + (raw(x, z) - hBack) * f, held, ${W.replace('why: {', 'why: { branch: "ease", hBack, f,')} }`)
if (s.includes("if (!pipRings(x, z, t.iA) || n.d < 1e-9) return { v: n.H, owner: own(n) }")) one("if (!pipRings(x, z, t.iA) || n.d < 1e-9) return { v: n.H, owner: own(n) }", "if (!pipRings(x, z, t.iA) || n.d < 1e-9) return { v: n.H, owner: own(n), why: { branch: 'road side / on ②', H: n.H, d: n.d, st: [n.px, n.pz], t: n.R.t, k: n.R.k, i: n.i, stamp: n.R.stamp[n.i], arc: n.R.arc[n.i] } }")
else one("if (!pipRings(x, z, t.iA)) return { v: n.R.roadAt(n.i, n.u, x, z), owner: own(n) }", "if (!pipRings(x, z, t.iA)) return { v: n.R.roadAt(n.i, n.u, x, z), owner: own(n), why: { branch: 'road side / on ②', H: n.H, d: n.d, st: [n.px, n.pz], t: n.R.t, k: n.R.k, i: n.i, stamp: n.R.stamp[n.i], arc: n.R.arc[n.i] } }")
one("if (c.d < LATTICE) return { v: c.H, owner: own(c) }", "if (c.d < LATTICE) return { v: c.H, owner: own(c), why: { branch: 'within the lattice of ②', H: c.H, d: c.d, t: c.R.t, k: c.R.k, i: c.i } }")
one("if (p.held) { if (c.R !== n.R || c.key !== nearKey(n)) stats.byBand++; return { v: p.v, owner: own(c) } }", "if (p.held) { if (c.R !== n.R || c.key !== nearKey(n)) stats.byBand++; return { v: p.v, owner: own(c), why: { ...p.why, held: true, byBand: c.R !== n.R || c.key !== nearKey(n) } } }")
one("if (inBand(x, z)) { stats.unowned++; return { v: null, owner: null, unowned: t.ti } }", "if (inBand(x, z)) { stats.unowned++; return { v: null, owner: null, unowned: t.ti, why: { branch: 'UNOWNED (in a band no span reaches)', t: t.ti } } }")
one("return { v: profile(n, x, z).v, owner: own(n) }", "{ const p = profile(n, x, z); return { v: p.v, owner: own(n), why: { ...p.why, lot: true } } }")
one("return { heightAt, stats,", "return { _why: (x, z) => resolveUncached(x, z), _T: T, heightAt, stats,")
// --no-envelope: the COUNTERFACTUAL girdle — the absorption is held inside each station's OWN capacity, never the capacity's
// lower envelope along ② (which pins R near 0 wherever a lawn-less station lies within |A| / the walk limit)
// --no-smooth: the absorption is each station's own need (A_raw), not smoothed along ② (σ)
if (process.argv.includes('--no-smooth')) one('A[a] = v / w', 'A[a] = st[a].Araw')
// --no-station-clamp (P1): the smoothed need along ② reaches the point unclamped; only the point's own band limits it (the shares)
if (process.argv.includes('--no-station-clamp')) one('const c = Math.max(-env[a], Math.min(env[a], A[a]))', 'const c = A[a]')
// --point-need (P2): R is the point's OWN need on its own ray (raw at its back edge − H), not read off ② at all
if (process.argv.includes('--point-need')) one('const R = absorbAt(n.R, n.i, n.u)', 'const R = raw(n.px + ux * back, n.pz + uz * back) - n.H')
// --cap-window (C1): each station's capacity is the MEAN of the stations' capacities within ±σ along ② (the band as drawn
// along its stretch: its area over its length), not its one normal ray's
if (process.argv.includes('--cap-window')) one('const kk = walkMax / exag, env = st.map(S => S.cap)',
  '{ const c0 = st.map(S => S.cap); for (let a = 0; a < m; a++) { let w = 1, v = c0[a]; for (let b = a, d = 0, g = 0; g < m - 1; g++) { d += gap[b]; b = (b + 1) % m; if (d > sigma) break; w++; v += c0[b] } for (let b = a, d = 0, g = 0; g < m - 1; g++) { b = (b + m - 1) % m; d += gap[b]; if (d > sigma) break; w++; v += c0[b] } st[a].cap = v / w } }\n    const kk = walkMax / exag, env = st.map(S => S.cap)')
// --cap-fan (C2): each station's capacity is the MOST a fan of rays (normal, ±30°, ±60°) finds — the band as drawn around
// the station. ⚠️ an oblique ray's path through a band is longer than the band is wide, so it can overstate the capacity
if (process.argv.includes('--cap-fan')) one('      S.cap = (lawnW > 0 ? (lawnMax == null ? Infinity : Math.max(0, lawnMax * lawnW / exag - head)) : 0) + Math.max(0, WALK_SHARE * walkMax * walkW / exag - head)',
  "      const capOn = (vx, vz) => { const { ped: p2 } = pedOf(bandsAlong(px - vz * SIDESTEP, pz + vx * SIDESTEP, vx, vz, CAP)); let lw = 0, ww = 0; for (const b of p2) { if (b.cls === 'lawn') lw += b.to - b.from; else if (b.cls === 'walk') ww += b.to - b.from }\n        return (lw > 0 ? (lawnMax == null ? Infinity : Math.max(0, lawnMax * lw / exag - head)) : 0) + Math.max(0, WALK_SHARE * walkMax * ww / exag - head) }\n      S.cap = Math.max(...[0, Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3].map(t => capOn(ux * Math.cos(t) - uz * Math.sin(t), ux * Math.sin(t) + uz * Math.cos(t))))")
if (process.argv.includes('--no-envelope')) one('for (let pass = 0; pass < 2; pass++) {', 'for (let pass = 0; pass < 0; pass++) {')
s = s.replace("'../src/lib/lattice.js'", "'../../../src/lib/lattice.js'")
writeFileSync(new URL(process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'groundDeformer.why.mjs', import.meta.url), s)
