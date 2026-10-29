// k's LINELESS edges on a fixture, by what they carry: null (no tag), a born line ({born}), or other; with the stage that drew each
// end (cand3.mjs#ORIGIN) and a few places. node scratch/cut-once/lineless.mjs huron|decks
import fs from 'fs'
const G = await import('./gate.mjs'), C3 = await import('./cand3.mjs')
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'))
const F = { decks: () => { const d = fx('ptown-deck-inputs'); return [G.ip(d.inputs.flat()), d.fineM] }, huron: () => { const d = fx('huron-traced'); return [G.ip(d.traced), d.fineM] } }
const [src, step] = F[process.argv[2] || 'huron'](), r = C3.openCloseProvenance(src, step, 'lineless')
const isLine = (x) => Array.isArray(x) && x.length === 2 && x.every(pt => Array.isArray(pt) && pt.length === 2 && pt.every(Number.isFinite))
const by = {}, eg = {}, len = {}
const L1 = (t) => { const L = isLine(t) ? t : Array.isArray(t) ? t.find(isLine) : null; return L && Math.abs(L[1][0] - L[0][0]) + Math.abs(L[1][1] - L[0][1]) <= 2 ? L : null }
r.rings.forEach((q, k) => q.forEach((v, i) => { const t = r.tags[k][i]; if ((isLine(t) || (Array.isArray(t) && t.some(isLine))) && !L1(t)) return
  const w = q[(i + 1) % q.length], kind = L1(t) ? `one-step line ${JSON.stringify(L1(t))}`.slice(0, 16) : t == null ? 'null' : t.born ? 'born' : Array.isArray(t) ? `list(${t.map(x => x?.born ? 'born' : typeof x).join(',')})` : JSON.stringify(t).slice(0, 40)
  const o = `${C3.ORIGIN.get(v.X + ',' + v.Y) || '-'} → ${C3.ORIGIN.get(w.X + ',' + w.Y) || '-'}`, key = `${kind} · ${o}`
  by[key] = (by[key] || 0) + 1; (eg[key] ||= []).length < 2 && eg[key].push([v.X / 1000, v.Y / 1000]); len[kind] = (len[kind] || []).concat(Math.hypot(w.X - v.X, w.Y - v.Y)) }))
for (const [k, n] of Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(n, k, JSON.stringify(eg[k]))
for (const [k, L] of Object.entries(len)) { L.sort((a, b) => a - b); console.log('length', k, 'n', L.length, 'median u', L[L.length >> 1].toFixed(1), 'max', L[L.length - 1].toFixed(1)) }
// the one-step lines: how many are one of P's OWN edges (exact endpoints), i.e. P's provenance kept on an edge one lattice step long
const ek = (L) => [L[0].join(','), L[1].join(',')].sort().join('|'), PE = new Set(r.P.flatMap(q => q.map((v, i) => ek([[v.X, v.Y], [q[(i + 1) % q.length].X, q[(i + 1) % q.length].Y]]))))
let own = 0, not = []; r.rings.forEach((q, k) => q.forEach((v, i) => { const L = L1(r.tags[k][i]); if (!L) return; if (PE.has(ek(L))) own++; else if (not.length < 6) not.push({ at: [v.X / 1000, v.Y / 1000], L }) }))
console.log('one-step lines that are P\'s own edges:', own, '· not:', JSON.stringify(not))
