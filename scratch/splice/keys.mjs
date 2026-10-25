// Splice probe: does the new mint stamp the same authoring key per chain vertex? For every (skelId, side, srcIdx) both mints
// stamped, segOrd must agree. Then: which (skelId|side|segOrd) frontages own block-ring edges in one mint and not the other.
//   node scratch/splice/keys.mjs <before.json> <after.json>
import { readFileSync } from 'node:fs'
const [A, B] = process.argv.slice(2).map(f => JSON.parse(readFileSync(f, 'utf8')).protopolygon)
const map = (P) => { const m = new Map(); for (const o of P.owners) if (o.srcIdx >= 0) m.set(`${o.skelId}|${o.side}|${o.srcIdx}`, o.segOrd); return m }
const ma = map(A), mb = map(B); let both = 0, diff = 0; const ex = []
for (const [k, v] of ma) if (mb.has(k)) { both++; if (mb.get(k) !== v) { diff++; if (ex.length < 3) ex.push(`${k}: ${v} → ${mb.get(k)}`) } }
const fr = (P) => { const s = new Map(); const add = (L) => { for (const l of L || []) { const o = P.owners[l]; if (o?.skelId) { const k = `${o.skelId}|${o.side}|${o.segOrd}`; s.set(k, (s.get(k) || 0) + 1) } } }
  P.blockLabels.forEach(add); (P.blockHoleLabels || []).forEach(hs => (hs || []).forEach(add)); return s }
const fa = fr(A), fb = fr(B), lost = [...fa.keys()].filter(k => !fb.has(k)), gained = [...fb.keys()].filter(k => !fa.has(k))
console.log(`stamps judged ${both} · segOrd differs ${diff}${ex.length ? ' · ' + ex.join(' · ') : ''} · frontages on block rings ${fa.size} → ${fb.size} · lost ${lost.length}${lost.length ? ' [' + lost.slice(0, 6).join(', ') + ']' : ''} · gained ${gained.length}${gained.length ? ' [' + gained.slice(0, 6).join(', ') + ']' : ''}`)
