// the spike's own counts per stage (backOffLine, backTwoFeet, backSquared). node scratch/cut-once/spike-stat.mjs decks|huron [miter]
import fs from 'fs'; import clipperLib from 'clipper-lib'; const { IntPoint } = clipperLib
const C3 = await import('./cand3.mjs'); C3.setBackPieces(true)
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'))
const ip = (pp) => pp.map(p => p.map(q => (Array.isArray(q) ? new IntPoint(q[0], q[1]) : new IntPoint(q.X, q.Y))))
const name = process.argv[2]
const src = name === 'decks' ? (d => [ip(d.inputs.flat()), d.fineM])(fx('ptown-deck-inputs')) : (d => [ip(d.traced), d.fineM])(fx('huron-traced'))
if (process.argv[3]) C3.setCornerAtMiter(true)
const r = C3.openCloseProvenance(src[0], src[1], name)
const st = r.stat || {}; console.log(JSON.stringify({ backOffLine: st.backOffLine, backTwoFeet: st.backTwoFeet, backSquared: st.backSquared }))
console.log('DROPPED', C3.DROPPED.length, JSON.stringify(C3.DROPPED.filter(x => Math.abs(x.at[0] - 302.6) < 1 && Math.abs(x.at[1] - 89.7) < 1)))
