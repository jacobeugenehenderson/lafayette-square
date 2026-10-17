// cmp.mjs <before.json> <after.json> [x,z …] — per town: needles by layer under 85° (the 89–90° float of square corners
// excluded), before → after, at a pair before/after, and every needle that appears or disappears (matched within τ).
import { readFileSync } from 'fs'
const [A, B] = process.argv.slice(2, 4).map(f => JSON.parse(readFileSync(f, 'utf8')))
const probes = process.argv.slice(4).map(s => s.split(',').map(Number))
for (const town of Object.keys(B)) { const a = A[town].sites, b = B[town].sites, tau = B[town].tau
  const N = (S, l, f = () => true) => S.filter(s => s.kind === 'needle' && s.layer === l && s.angleDeg < 85 && f(s)).length
  console.log(`\n${town}`)
  for (const l of ['② block', '③ ped', '③ curb', '③ walk', '③ lawn']) console.log(`  ${l.padEnd(8)} needles < 85°: ${N(a, l)} → ${N(b, l)} · at a pair ${N(a, l, s => s.pair)} → ${N(b, l, s => s.pair)}`)
  const near = (s, S) => S.some(t => t.layer === s.layer && t.kind === s.kind && Math.hypot(t.at[0] - s.at[0], t.at[1] - s.at[1]) <= tau)
  for (const [what, X, Y] of [['gone', a, b], ['new', b, a]]) { const d = X.filter(s => s.kind === 'needle' && s.angleDeg < 85 && (s.layer === '② block' || s.layer === '③ ped') && !near(s, Y))
    console.log(`  ${what} ${d.length}: ${d.map(s => `${s.layer} (${s.at.map(c => c.toFixed(2))}) ${s.angleDeg.toFixed(1)}°${s.pair ? ' [' + s.pair + ']' : ''}`).join(' · ')}`) }
  for (const p of probes) { const f = (S) => S.filter(s => s.kind === 'needle' && Math.hypot(s.at[0] - p[0], s.at[1] - p[1]) <= 3).map(s => `${s.layer} ${s.angleDeg.toFixed(1)}°`).join(', ') || 'none'
    console.log(`  within 3 m of (${p}): before ${f(a)} · after ${f(b)}`) }
  const ns = B[town].noses; if (ns) console.log(`  noses: ${JSON.stringify(ns)}`) }
for (const town of Object.keys(B)) for (const s of B[town].sites.filter(s => s.kind === 'needle' && s.pair && s.layer === '② block'))
  console.log(`${town} still at a pair: (${s.at.map(c => c.toFixed(2))}) ${s.angleDeg.toFixed(1)}° · ${s.pair} ${JSON.stringify(s.pairAt)}`)
