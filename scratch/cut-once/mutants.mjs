// Which of candidate 3's mutant hooks do the fast fixtures (PTown decks, Breakwater) catch? Each mutant is set, both fixtures run,
// and a mutant is CAUGHT when either refuses or its measures move off the live GREEN (copy against P_noded, crossings, books,
// unaccounted, added/removed). node scratch/cut-once/mutants.mjs
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { IntPoint } = clipperLib
const C3 = await import('./cand3.mjs')
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'))
const ip = (pp) => pp.map(p => p.map(q => (Array.isArray(q) ? new IntPoint(q[0], q[1]) : new IntPoint(q.X, q.Y))))
const FIX = { decks: () => { const d = fx('ptown-deck-inputs'); return { src: ip(d.inputs.flat()), stepM: d.fineM } }, breakwater: () => { const d = fx('ptown-embankments'); return { src: ip(d.paths), stepM: d.fineM } } }
const area = (pp) => pp.reduce((t, r) => t + C3.area(r), 0)
const run = (name) => { const { src, stepM } = FIX[name](); try { const r = C3.openCloseProvenance(src, stepM, name); return { area: Math.round(area(r.rings)), rings: r.rings.length } } catch (e) { return { refused: String(e.message).slice(0, 90) } } }
const live = { decks: run('decks'), breakwater: run('breakwater') }
console.log('live', JSON.stringify(live))
const M = [['setByEdges', true], ['setTrimInverted', true], ['setRefuseAllBackward', true], ['setSinglePointBranch', true], ['setRawCurve', true],
  ['setFoldMutant', 'quad'], ['setFoldMutant', 'no-triangle'], ['setFoldMutant', 'r-separate'], ['setNoEmitInvariant', true], ['setTiersSwapped', true],
  ['setTagsOffAt', '∩P'], ['setNoTopologyGuard', true], ['setTagsBySegment', true]]
for (const [fn, v] of M) { if (typeof C3[fn] !== 'function') { console.log(`${fn}(${v}): NO SUCH HOOK`); continue }
  C3[fn](v); const got = { decks: run('decks'), breakwater: run('breakwater') }; C3[fn](fn === 'setFoldMutant' ? null : fn === 'setTagsOffAt' ? null : false)
  const moved = Object.keys(got).filter(k => JSON.stringify(got[k]) !== JSON.stringify(live[k]))
  console.log(`${moved.length ? 'CAUGHT ' : 'MISSED '} ${fn}(${JSON.stringify(v)}): ${moved.map(k => `${k} ${JSON.stringify(got[k])}`).join(' · ') || 'both fixtures unchanged'}`) }
