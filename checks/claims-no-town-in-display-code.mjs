#!/usr/bin/env node
/**
 * "IS THERE A TOWN IN THE DISPLAYS' CODE?" (BRIEF-the-monument-lights-up §4, gate 2; CLAUDE.md Layer 0)
 *
 * A display is a KIT plugin that a town adds; the town's part is data (its record, its drawer). So no code under
 * src/displays/ may name a town, its look or map id, its set-piece building, or its coordinates.
 * The towns are READ from src/instances/*.js (never listed here): each module's lookId, mapId, name, the set-piece's
 * buildingId and name, its displays' ids, the file's own name, and its geography's lat/lon. Comments are not code.
 *
 * Usage: node checks/claims-no-town-in-display-code.mjs [--mutants]
 *   --mutants: a town's look id, its set-piece building and its latitude, each planted in a plugin file → red.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, basename } from 'node:path'
import { ROOT } from './_scenes.mjs'

const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const walk = (dir) => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : /\.(m?js|jsx)$/.test(f) ? [p] : [] })

// The towns, as their instance modules declare them.
const towns = readdirSync(join(ROOT, 'src/instances')).filter(f => f.endsWith('.js') && f !== 'registry.js').map(f => {
  const all = code(readFileSync(join(ROOT, 'src/instances', f), 'utf8'))
  // A display's `name` is a label (it may be the plugin's own, "Light Show"); its `id` is the town's and counts.
  const d0 = all.indexOf('displays:'), d1 = d0 < 0 ? -1 : all.indexOf('\n  }],', d0)
  const src = d0 < 0 || d1 < 0 ? all : all.slice(0, d0) + all.slice(d1)
  const strings = new Set([basename(f, '.js')])
  for (const m of src.matchAll(/\b(lookId|mapId|name|buildingId|id)\s*:\s*["']([^"']{4,})["']/g)) strings.add(m[2])
  if (d0 >= 0) for (const m of all.slice(d0, d1).matchAll(/\bid\s*:\s*["']([^"']{4,})["']/g)) strings.add(m[1])
  const coords = [...src.matchAll(/\b(lat|lon)\s*:\s*(-?\d+\.\d{3,})/g)].map(m => m[2])
  return { file: f, strings: [...strings], coords }
})
if (!towns.length) throw new Error('no towns read from src/instances: the check would pass on nothing')

function verdict(plant) {
  const fails = []
  for (const p of walk(join(ROOT, 'src/displays'))) {
    const rel = relative(ROOT, p)
    let src = code(readFileSync(p, 'utf8')); if (plant?.file === rel) src += plant.text
    const lower = src.toLowerCase()
    for (const t of towns) {
      for (const s of t.strings) if (lower.includes(s.toLowerCase())) fails.push(`${rel} names "${s}" (${t.file})`)
      for (const c of t.coords) if (src.includes(c.slice(0, c.indexOf('.') + 4))) fails.push(`${rel} carries ${c}, a coordinate of ${t.file}`)
    }
  }
  return fails
}

const fails = verdict()
if (fails.length) { console.log('⛔ a town in the displays\' code:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log(`✅ no town in src/displays: ${towns.length} towns read from src/instances (${towns.reduce((n, t) => n + t.strings.length + t.coords.length, 0)} names, ids and coordinates), none in the plugins' code`)

if (process.argv.includes('--mutants')) {
  const P = towns.find(t => t.coords.length) || towns[0], name = P.strings[0]
  const mutants = [
    [`a town's look id ("${name}") in Displays.jsx`, { file: 'src/displays/Displays.jsx', text: `\nconst only = '${name}'\n` }],
    (() => { const v = P.strings.find(s => /^osm-/.test(s)) || P.strings.at(-1); return [`"${v}" from ${P.file} in LightShow.jsx`, { file: 'src/displays/lightShow/LightShow.jsx', text: `\nconst b = '${v}'\n` }] })(),
    [`a latitude in engine.js`, { file: 'src/displays/lightShow/engine.js', text: `\nconst lat = ${P.coords[0]}\n` }],
  ]
  let bad = 0
  for (const [label, plant] of mutants) { const f = verdict(plant); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${label}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
