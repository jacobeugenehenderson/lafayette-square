// why2.mjs <cap.json> — for each still-unowned kept ② edge: the distinct ① edges (labels) whose contributor SEGMENTS hold both
// its ends within TOLC, and the best overlap any contributor gives it. Tells which of the two rules declined it.
import { readFileSync } from 'fs'
import { LATTICE_M } from '../../../../src/lib/lattice.js'
const D = JSON.parse(readFileSync(process.argv[2], 'utf8')), TOLC = 2 * LATTICE_M, key = (p) => p.join(',')
const byP = new Map(D.offNull.map(o => [key(o.p), o])), tally = new Map(), ex = []
for (const a of D.at.filter(a => a.kept)) { const o = byP.get(key(a.p)); if (!o) { tally.set('no record', (tally.get('no record') || 0) + 1); continue }
  const dseg = (c, r) => { const dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], L2 = dx * dx + dy * dy, u = Math.max(0, Math.min(1, ((r[0] - c.a[0]) * dx + (r[1] - c.a[1]) * dy) / L2)); return Math.hypot(r[0] - c.a[0] - u * dx, r[1] - c.a[1] - u * dy) }
  const both = new Set(o.ops.filter(c => dseg(c, o.p) <= TOLC && dseg(c, o.q) <= TOLC).map(c => c.lab))
  const pLabs = new Set(o.ops.filter(c => dseg(c, o.p) <= TOLC).map(c => c.lab)), qLabs = new Set(o.ops.filter(c => dseg(c, o.q) <= TOLC).map(c => c.lab))
  const k = `${o.eL <= TOLC ? 'edge ≤ TOLC' : 'edge > TOLC'} · ${both.size} label(s) hold both ends · p on ${pLabs.size}, q on ${qLabs.size}${both.size === 0 && pLabs.size && qLabs.size ? (([...pLabs].some(l => qLabs.has(l))) ? '' : ' (disjoint: the edge crosses from one ① edge\'s line to another\'s)') : ''}`
  tally.set(k, (tally.get(k) || 0) + 1); if (ex.length < 3 && both.size === 0) ex.push(o) }
for (const [k, v] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`)
for (const o of ex) { console.log(`  edge ${o.p} → ${o.q} (${(o.eL * 1000).toFixed(2)} mm)`); for (const c of o.ops) console.log(`     kind ${c.kind} lab ${c.lab} ${c.a.map(v => v.toFixed(4))} → ${c.b.map(v => v.toFixed(4))}`) }
