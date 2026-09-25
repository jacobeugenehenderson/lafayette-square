#!/usr/bin/env node
/**
 * claims-every-town-has-a-mark.mjs
 *
 * ⛔ THE CLASS: a town wearing another town's identity. A map with no `src/instances/<map>.js`
 * boots as LAFAYETTE SQUARE (`src/instance.js`), so its tab, loader, badge and legal pages were
 * LS's (provincetown, until 2026-09-25). And a module with no mark shows only an initial.
 *
 * Asserts, reading public/looks/index.json and the registry:
 *   · every map a Look points at has a registered instance module;
 *   · every registered module authors a mark (`branding.mark` emoji or `branding.markSvg`).
 * Fix a red: `node cartograph/scaffold-instance.mjs --scene=<map> --mark=<emoji>`, or author
 * the mark in the module.
 *
 *     node checks/claims-every-town-has-a-mark.mjs [--self-test]
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { registeredMaps, instanceForMap } = await import(join(ROOT, 'src/instances/registry.js'))

function loadSources() {
  const looks = JSON.parse(readFileSync(join(ROOT, 'public/looks/index.json'), 'utf8')).looks || []
  const maps = [...new Set(looks.map(l => l.scene).filter(Boolean))]
  const towns = Object.fromEntries(registeredMaps().map(m => [m, instanceForMap(m)?.branding || {}]))
  return { maps, towns }
}

function run(S) {
  const out = []
  const assert = (name, ok, detail) => out.push({ name, ok: !!ok, detail })
  const missing = S.maps.filter(m => !(m in S.towns))
  assert('every-map-has-a-module', missing.length === 0,
    `map(s) with a Look but no src/instances module — they boot as ANOTHER town: ${missing.join(', ')} — node cartograph/scaffold-instance.mjs --scene=<map> --mark=<emoji>`)
  const unmarked = Object.entries(S.towns).filter(([, b]) => !b.mark && !b.markSvg).map(([m]) => m)
  assert('every-module-has-a-mark', unmarked.length === 0,
    `module(s) with no authored mark (they show an initial): ${unmarked.join(', ')}`)
  return out
}

const MUTATIONS = [
  { name: 'every-map-has-a-module', apply: (S) => ({ ...S, maps: [...S.maps, 'a-town-with-no-module'] }) },
  { name: 'every-module-has-a-mark', apply: (S) => { const [m] = Object.keys(S.towns); return { ...S, towns: { ...S.towns, [m]: {} } } } },
]

const S = loadSources()
if (process.argv.includes('--self-test')) {
  const red = run(S).filter(r => !r.ok)
  if (red.length) { for (const r of red) console.log(`⛔ baseline red: ${r.name} — ${r.detail}`); process.exit(1) }
  let bad = 0
  for (const m of MUTATIONS) {
    const hit = run(m.apply(S)).find(r => r.name === m.name)
    if (!hit || hit.ok) { console.log(`  ⛔ ${m.name} — defect planted and the check STAYED GREEN`); bad++ } else console.log(`  ✓ ${m.name} — went red`)
  }
  console.log(bad ? `\n⛔ ${bad} mutation(s) did not fail.` : '\n✅ every mutation produced its named failure.')
  process.exit(bad ? 1 : 0)
}
for (const [m, b] of Object.entries(S.towns)) console.log(`  ${m.padEnd(18)} ${b.markSvg ? `markSvg ${b.markSvg}` : b.mark ? `mark ${b.mark}` : '— no mark'}`)
const res = run(S)
for (const r of res) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`)
const failed = res.filter(r => !r.ok)
console.log(`\n${res.length - failed.length}/${res.length} green`)
process.exit(failed.length ? 1 : 0)
