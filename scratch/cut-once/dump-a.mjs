// Zob's dump for Huron copy (A): the open-stage cut at (−191037, 1597658): its tags and X's parameter along each line, whether X
// lies within line a's SEGMENT (0 ≤ t ≤ 1), and whether P as noded (out and P noded together, as the gate does) carries it.
import fs from 'fs'
import clipperLib from 'clipper-lib'
import { openCloseProvenance, DETAIL, ORIGIN } from './cand3.mjs'
import { nodeCrossings } from '../../src/lib/latticeNode.js'
const { IntPoint } = clipperLib
const d = JSON.parse(fs.readFileSync(new URL('./fixtures/huron-traced.json', import.meta.url), 'utf8')), src = d.traced.map(p => p.map(([X, Y]) => new IntPoint(X, Y)))
const r = openCloseProvenance(src, d.fineM, 'huron'), K = '-191037,1597658'
const det = DETAIL.get(K)
console.log('origin', ORIGIN.get(K), 'detail', JSON.stringify(det))
const rings = [...r.rings.map(q => ({ q, set: 'out' })), ...r.P.map(q => ({ q, set: 'P' }))].filter(x => new Set(x.q.map(v => v.X + ',' + v.Y)).size >= 3)
const NR = nodeCrossings(rings.map((x, i) => ({ p: x.q.map(v => [v.X / 1000, v.Y / 1000]), tag: `${x.set}#${i}` })), { pairs: () => true, self: true, who: 'dump-a' })
const carries = (set) => NR.some((o, i) => rings[i].set === set && o.some(v => v.k[0] === -191037 && v.k[1] === 1597658))
console.log(JSON.stringify({ PrawCarries: r.P.some(q => q.some(v => v.X === -191037 && v.Y === 1597658)), PnodedCarries: carries('P'), outNodedCarries: carries('out'), outRawCarries: r.rings.some(q => q.some(v => v.X === -191037 && v.Y === 1597658)) }))
