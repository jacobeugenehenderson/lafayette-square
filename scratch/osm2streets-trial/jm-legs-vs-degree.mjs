#!/usr/bin/env node
// Found by T1 (osm2streets disagreed with junctionMap and agreed with `junctions`): at a node, does ribbons.json's junctionMap
// carry as many ARMS as ribbons.json's own `junctions` record says the node has? Arms = Σ legs, a `through` leg counting TWO
// (CLAUDE.md §4 — legs.length is not the degree). Joined by the node's own point: a junction's exact x,z rounded to 0.1 m, the
// precision junctionMap stores — a key holding two junctions is counted and left out. Light; reads only the town's ribbons.json (ribbonsPath).
//   node scratch/osm2streets-trial/jm-legs-vs-degree.mjs [town…] [--list]
import fs from 'fs'
import { ribbonsPath, ribbonScenes } from '../../checks/_scenes.mjs'
const LIST = process.argv.includes('--list')
const towns = process.argv.slice(2).filter(a => !a.startsWith('--'))
const all = towns.length ? towns : ribbonScenes()
const dm = (x, z) => `${(Math.round(x * 10) / 10).toFixed(1)},${(Math.round(z * 10) / 10).toFixed(1)}`
for (const town of all) {
  const R = JSON.parse(fs.readFileSync(ribbonsPath(town), 'utf8'))
  const J = new Map(), amb = new Set(); for (const j of R.junctions || []) { const k = dm(j.x, j.z); if (J.has(k)) amb.add(k); J.set(k, j) }
  const byK = new Map(); for (const n of R.junctionMap?.nodes || []) { const k = dm(n.at[0], n.at[1]); (byK.get(k) || byK.set(k, []).get(k)).push(n) }
  // MUTANT=1: drop one leg from the first node whose arms match its junction — ARMS ≠ DEGREE must rise by one
  if (process.env.MUTANT) { for (const [k, ns] of byK) { const j = J.get(k); if (!j || amb.has(k)) continue; const n = ns[0]
      if (ns.length === 1 && n.legs.length > 1 && n.legs.reduce((d, l) => d + (l.end === 'through' ? 2 : 1), 0) === j.degree) { console.log(`   MUTANT: dropped ${n.legs[0].chain}:${n.legs[0].end} at ${k}`); n.legs.shift(); break } } }
  // which of OUR streets carry the node as a point (exactly, to the cm the points carry), and how — so a missing arm is NAMED
  const at = new Map(); for (const st of R.streets || []) { const P = st.points || [], n = P.length
    P.forEach(([x, z], i) => { const k = dm(x, z); (at.get(k) || at.set(k, []).get(k)).push(`${st.skelId}:${i === 0 ? 'start' : i === n - 1 ? 'end' : 'through'}`) }) }
  const missH = {}
  const X = {}, bad = []
  for (const [k, ns] of byK) { if (amb.has(k)) continue; const j = J.get(k); if (!j) continue
    const arms = ns.reduce((s, n) => s + n.legs.reduce((d, l) => d + (l.end === 'through' ? 2 : 1), 0), 0)
    const key = `junction ${j.kind}/${j.degree} × jm arms ${arms}${ns.length > 1 ? ` (${ns.length} jm nodes)` : ''}`; X[key] = (X[key] || 0) + 1
    if (arms !== j.degree) { const have = new Set(ns.flatMap(n => n.legs.map(l => l.chain))), miss = [...new Set(at.get(k) || [])].filter(c => !have.has(c.split(':')[0]))
      for (const m of miss) { const r = m.split(':')[1]; missH[r] = (missH[r] || 0) + 1 }
      bad.push(`(${j.x.toFixed(1)}, ${j.z.toFixed(1)}) ${j.kind}/${j.degree} · jm ${ns.map(n => `[${n.kinds.join('+')}: ${n.legs.map(l => `${l.chain}:${l.end}`).join(', ')}]`).join(' ')} · our streets here not in its legs: ${miss.join(', ') || 'none'}`) } }
  const noJm = [...J.keys()].filter(k => !byK.has(k) && !amb.has(k)).length
  console.log(`── ${town}: junctions ${J.size} · junctionMap nodes ${(R.junctionMap?.nodes || []).length} · 0.1 m keys with two junctions ${amb.size} · junctions with no jm node ${noJm} · ARMS ≠ DEGREE ${bad.length}`)
  for (const [k, v] of Object.entries(X).filter(([k]) => { const m = k.match(/\/(\d+) × jm arms (\d+)/); return m[1] !== m[2] }).sort((a, b) => b[1] - a[1])) console.log(`     ${String(v).padStart(4)}  ${k}`)
  console.log(`     missing arms, by how our street carries the node: ${JSON.stringify(missH)}`)
  for (const b of LIST ? bad : bad.slice(0, 4)) console.log(`       ${b}`)
}
