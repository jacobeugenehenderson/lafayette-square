#!/usr/bin/env node
// CLAIM — IN THE FROZEN SHAPE, A CURB CONTOUR BELONGS TO ONE TILE, SO A RUN (skelId · side · poly) IS LISTED ONCE.
//
// ⛔ OPEN, CAUSE NOT ESTABLISHED (found 2026-09-26 by Wick, while deriving lamps along `runs`): two DIFFERENT
// tiles can carry the SAME `iaFull` — huron tiles 24 and 25 (rings of 2.47 km² and 0.27 km²) share one
// five-contour `iaFull`, while tile 25's own `iA` is a single ring — so every run struck on it is listed twice.
// Any consumer that walks `runs` (lamps, paint, a census) sees that frontage twice. `derive-lamps.mjs`
// lights each arc once and prints the count; nothing else is known to guard it.
//
// Reports, per town: tiles whose `iaFull` is byte-identical to another tile's, and runs listed more than once.
//   node checks/claims-a-curb-arc-belongs-to-one-tile.mjs [scene…]
import { readFileSync } from 'node:fs'
import { scenes } from './_scenes.mjs'

let red = 0
const key = (poly) => poly.map(q => (Array.isArray(q) ? q : [q.x, q.z]).map(v => v.toFixed(2)).join(',')).join(';')
for (const scene of scenes('public/baked/<scene>/shape.json')) {
  const tiles = JSON.parse(readFileSync(`public/baked/${scene}/shape.json`, 'utf-8')).tiles || []
  const byIa = new Map(), shared = []
  tiles.forEach((t, i) => {
    if (!t.iaFull?.length) return
    const k = t.iaFull.map(key).join('|')
    if (byIa.has(k)) shared.push([byIa.get(k), i]); else byIa.set(k, i)
  })
  const seen = new Set(); let runs = 0, repeated = 0
  for (const t of tiles) for (const r of t.runs || []) {
    runs++
    const k = `${r.skelId}|${r.side}|${key(r.poly || [])}`
    if (seen.has(k)) repeated++; else seen.add(k)
  }
  if (shared.length || repeated) {
    red++
    console.log(`⛔ ${scene.padEnd(26)} ${shared.length} tile pair(s) share one iaFull ${JSON.stringify(shared.slice(0, 5))} · ${repeated}/${runs} runs listed twice`)
  } else console.log(`✅ ${scene.padEnd(26)} ${tiles.length} tiles, ${runs} runs, each arc on one tile`)
}
console.log(red ? `\n⛔ FAIL — ${red} town(s)` : '\n✅ all claims hold')
process.exit(red ? 1 : 0)
