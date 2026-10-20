// census-patch.mjs <tileGround.js> <out .js> — a census copy of a tileGround.js (never committed into src/): every join
// offsetRingByRects decides at a ① vertex is recorded (turn, the two bands' depths, the two ① edges, miter / chord / none),
// with the block's ① edge owners (skelId · side · segOrd · cap · gradeSeparated) set by the caller just before the offset,
// and written to CENSUS_OUT when the process exits (so any early-exit capture route keeps it). Read-only on the pour.
import { readFileSync, writeFileSync } from 'fs'
const [src, out] = process.argv.slice(2)
let s = readFileSync(src, 'utf8')
const sub = (old, neu) => { if (s.split(old).length !== 2) throw new Error(`census-patch: anchor not found exactly once: ${old.slice(0, 80)}`); s = s.replace(old, neu) }
const own = (L) => `${L}.map(l => { const o = protoOwners[l]; return o ? [o.skelId, o.side, o.segOrd, o.cap ? 1 : 0, o.gradeSeparated ? 1 : 0] : null })`
// the block's owners, for its outer ② offset and for each hole's
sub(`        const rings2 = offsetRingByRects(WC.ring, (j) => (depthRec.depth[j] = WC.depth[j]), false, st,`,
    `        globalThis.__censusBlock = { k, hole: null, owners: ${own('labs')} }\n        const rings2 = offsetRingByRects(WC.ring, (j) => (depthRec.depth[j] = WC.depth[j]), false, st,`)
sub(`            const hOff = offsetRingByRects(HW.ring,`, `            globalThis.__censusBlock = { k, hole: hi, owners: ${own('holeLabs[hi]')} }\n            const hOff = offsetRingByRects(HW.ring,`)
// inside the offset: take the block (only these two calls carry one), record every vertex's join decision
sub(`  const contrib = []\n`, `  const contrib = []\n  const __cb = globalThis.__censusBlock; globalThis.__censusBlock = null; let __r = null\n`)
sub(`    if (!(A.dE > 0 || S.dS > 0)) continue\n`, `    if (__cb) { const dot = A.e[0] * S.e[0] + A.e[1] * S.e[1]; __r = { k: __cb.k, hole: __cb.hole, v, turnDeg: Math.atan2(Math.abs(turn), dot) * 180 / Math.PI, dA: A.dE, dS: S.dS, eA: origE[ia], eS: origE[i], oA: __cb.owners[origE[ia]] ?? null, oS: __cb.owners[origE[i]] ?? null, join: 'none (no depth)' }; (globalThis.__census ||= []).push(__r) }
    if (!(A.dE > 0 || S.dS > 0)) continue
    if (__r) __r.join = 'none (straight)'\n`)
sub(`    if (X) { addClip([v, A.Q, X, S.P]); addSeg(A.Q, X, ia, 1); addSeg(X, S.P, i, 1) }`, `    if (__r) __r.join = X ? 'miter' : 'chord'\n    if (X) { addClip([v, A.Q, X, S.P]); addSeg(A.Q, X, ia, 1); addSeg(X, S.P, i, 1) }`)
s = `// ⚠️ JOIN-CENSUS COPY (scratch/ground-budget/join-census/census-patch.mjs) of ${src}. Never served, never committed into src/.\nimport { writeFileSync as __censusWrite } from 'fs'\nprocess.on('exit', () => { if (process.env.CENSUS_OUT) __censusWrite(process.env.CENSUS_OUT, JSON.stringify(globalThis.__census || [])) })\n` + s
writeFileSync(out, s)
console.log(`census-patch: ${src} → ${out}`)
