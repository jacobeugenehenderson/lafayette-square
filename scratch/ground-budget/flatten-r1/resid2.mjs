// resid2.mjs — at a residual one-side vertex on tile ti: is it in the stamped evidence? the nearest iA⁺ edges and vertices; the parts' rings around it
import { readFileSync } from 'fs'
import { stampTile, prepareEvidence, evidenceByPiece } from '../../../src/lib/tileGround.js'
const [town, ti, at] = process.argv.slice(2), P = at.split(',').map(Number)
const st = JSON.parse(readFileSync(`/Users/jacobhenderson/Desktop/lafayette-square.nosync/public/baked/${town}/shape.json`, 'utf8')).tiles[+ti]
const groups = prepareEvidence(JSON.parse(readFileSync(`/Users/jacobhenderson/Desktop/lafayette-square.nosync/cartograph/data/${town}/clean/ribbons.json`, 'utf8')).landEvidence)
const { tile, groups: g } = stampTile(st, groups), parts = evidenceByPiece(tile.iA, g, null)
const sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
const show = (nm, R) => R.forEach((r, ri) => r.forEach((a, k) => { const b = r[(k + 1) % r.length], d = sd(P, a, b); if (d < 0.003) console.log(`${nm} ring ${ri} edge ${k}/${r.length} ${JSON.stringify(a)}→${JSON.stringify(b)} d ${(d * 1000).toFixed(3)} mm`) }))
show('iA', st.iA); show('iA+', tile.iA); show('iaFull+', tile.iaFull)
g.forEach(x => show(`ev+ ${x.lu}|${x.paint}`, x.rings.map(y => y.r)))
parts.forEach((l, pi) => (l || []).forEach(e => show(`part ${pi} ${e.ev}`, e.rings)))
