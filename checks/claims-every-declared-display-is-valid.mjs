#!/usr/bin/env node
/**
 * "IS EVERY DISPLAY A TOWN DECLARES VALID, BEFORE IT SHIPS?" (Boz's ruling, 2026-10-31: the first line refuses a bad
 * record; DisplayBoundary is only the last.)
 *
 * Every town module in src/instances that declares `displays` is imported, and each display is checked against its
 * plugin and its drawer (the town's content, read from disk): its kind has a plugin; for a Light Show,
 * engine.js#validateDisplay (strands, season, schedule, and a running order whose every look is in the drawer and
 * every transition exists). Displays are read, never listed here.
 * ⚠️ Records live in the instance modules until Stage's Displays section writes them into the town's design and the bake
 * carries them; then this moves into the bake's own validation and the check reads it there.
 *
 * Usage: node checks/claims-every-declared-display-is-valid.mjs [--mutants]
 *   --mutants: a running order naming a look the drawer lacks, a display of an unknown kind, a show that is not a whole
 *   multiple of the glow → red.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'
import { importSource } from './_importSource.mjs'

const { validateDisplay } = await importSource('src/displays/lightShow/engine.js')
const KINDS = [...readFileSync(join(ROOT, 'src/displays/Displays.jsx'), 'utf8').matchAll(/^\s*'([a-z-]+)'\s*:\s*\{\s*label:/gm)].map(m => m[1])
if (!KINDS.length) throw new Error('no plugin kinds read from src/displays/Displays.jsx: the check would pass on nothing')

const towns = []
for (const f of readdirSync(join(ROOT, 'src/instances')).filter(f => f.endsWith('.js') && f !== 'registry.js')) {
  const town = (await import(pathToFileURL(join(ROOT, 'src/instances', f)))).default
  if (town?.displays?.length) towns.push({ file: f, town })
}

function verdict(mutate) {
  const fails = []
  for (const { file, town } of towns) for (const d0 of town.displays) {
    const d = mutate ? mutate(structuredClone(d0)) : d0, where = `${file} display "${d.id}"`
    if (!KINDS.includes(d.kind)) { fails.push(`${where}: kind "${d.kind}" has no plugin (have: ${KINDS.join(', ')})`); continue }
    if (d.kind !== 'light-show') continue
    const at = join(ROOT, 'cartograph/data', town.lookId, 'content', d.drawer || '')
    if (!d.drawer || !existsSync(at)) { fails.push(`${where}: its drawer is not in the town's content (${at})`); continue }
    try { validateDisplay(d, JSON.parse(readFileSync(at, 'utf8')), where) } catch (e) { fails.push(e.message) }
  }
  return fails
}

const fails = verdict(), n = towns.reduce((k, t) => k + t.town.displays.length, 0)
if (fails.length) { console.log('⛔ a declared display is not valid:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log(`✅ every declared display is valid: ${n} display${n === 1 ? '' : 's'} in ${towns.length} town${towns.length === 1 ? '' : 's'}, each against its plugin and its drawer`)

if (process.argv.includes('--mutants')) {
  if (!n) { console.log('⚪ no displays declared: the mutants have nothing to break'); process.exitCode = 1 }
  else {
    const mutants = [
      ['a look the drawer lacks', (d) => { d.run = [...d.run, { transition: 'iris' }, { look: 'no-such-look', seconds: 3 }]; return d }],
      ['a display of an unknown kind', (d) => { d.kind = 'no-such-plugin'; return d }],
      ['a show that is not a multiple of the glow', (d) => { d.strands = { ...d.strands, show: d.strands.glow * 3 - 1 }; return d }],
    ]
    let bad = 0
    for (const [name, m] of mutants) { const f = verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}`); if (!f.length) bad++ }
    if (bad) process.exitCode = 1
  }
}
