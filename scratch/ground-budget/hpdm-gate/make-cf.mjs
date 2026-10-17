// make-cf.mjs <groundDeformer.mjs> — COUNTERFACTUAL (a), a probe copy never shipped (groundDeformer.cf-raw.mjs, beside this
// file): every ② station takes the RAW terrain at the station instead of the line's H — at the nearest-② query and the owner
// candidates (the H every profile and road side starts from) and at the absorption's stations. Arcs, runs, caps alike.
// Each edit anchored (counted), or it throws. The lattice import is re-rooted.
import { readFileSync, writeFileSync } from 'fs'
let s = readFileSync(process.argv[2], 'utf8')
const all = (a, b, n) => { const k = s.split(a).length - 1; if (k !== n) throw new Error(`make-cf: anchor found ${k}×, expected ${n} — ${a}`); s = s.split(a).join(b) }
all('H: s.hp + u * (s.hq - s.hp)', 'H: raw(px, pz)', 2)
all('const H = R.H[S.i] + S.u * (R.H[(S.i + 1) % n] - R.H[S.i])', 'const H = raw(px, pz)', 1)
s = s.replace("'../src/lib/lattice.js'", "'../../../src/lib/lattice.js'")
writeFileSync(new URL('groundDeformer.cf-raw.mjs', import.meta.url), s)
