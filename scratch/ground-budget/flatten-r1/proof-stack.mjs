// proof-stack.mjs — `bakeGround({ stackOnly })` returns the stack the full bake flattens: per-group item counts and the
// sub-lattice outers (mean width 2|A|/P < LATTICE_M, slv.mjs's definition) against slv-stack-<town>-1fam.json, which the
// slv hook wrote from inside a full bake. Run through the swap kit from the main tree's path (run-nm.mjs's pattern).
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
const { bakeGround } = await import('../../../../../../cartograph/bake-ground.js')
const { LATTICE_M } = await import('../../../../../../src/lib/lattice.js')
const town = process.argv[2], ref = JSON.parse(readFileSync(fileURLToPath(new URL(`./slv-stack-${town}-1fam.json`, import.meta.url)), 'utf8'))
const log = console.log; console.log = () => {}
const st = await bakeGround({ look: town, scene: town, shorePending: true, stackOnly: true }); console.log = log
const ar = (r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return s / 2 }
const pe = (r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += Math.hypot(r[i][0] - r[j][0], r[i][1] - r[j][1]); return s }
let diff = 0, n = 0
for (const e of st.stackEntries) { let items = 0, sub = 0
  for (const it of e.items) { const o = Array.isArray(it) ? it : it.outer; if (!o || o.length < 3) continue; items++; if (2 * Math.abs(ar(o)) / pe(o) < LATTICE_M) sub++ }
  const r = ref[e.groupKey]; n++
  if (!r || r.items !== items || r.sub !== sub) { diff++; console.log(`  ⛔ ${e.groupKey}: stackOnly ${items} items / ${sub} sub · full bake ${r ? `${r.items} / ${r.sub}` : 'absent'}`) } }
for (const k of Object.keys(ref)) if (!st.stackEntries.some(e => e.groupKey === k)) { diff++; console.log(`  ⛔ ${k}: in the full bake's stack, absent from stackOnly`) }
console.log(`${town}: ${n} groups · ${diff ? `⛔ ${diff} differ` : 'every group IDENTICAL in items and sub-lattice outers to the full bake\'s stack'}`)
process.exit(diff ? 1 : 0)
