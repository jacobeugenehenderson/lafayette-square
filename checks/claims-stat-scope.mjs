#!/usr/bin/env node
/**
 * claims-stat-scope.mjs — A DISPLAYED FIGURE MUST DECLARE, AND MATCH, ITS SCOPE.
 *
 * The masthead renders four stats side by side (`SidePanel.jsx`): Residents,
 * Buildings, Places, Streets. Three are derived live from the slab. `Residents`
 * is a hardcoded `profile.population` in `src/instances/<scene>.js`.
 *
 * ⛔ THE DEFECT THIS CATCHES: a supplied figure sourced to one boundary rendered
 * beside live figures derived from another. On LS, `population: 2164` is scoped
 * to the CITY's neighborhood while `buildingCount` is scoped to the slab — two
 * stats in one panel describing two different areas. Measured 2026-09-01.
 *
 * ⛔ SCOPE — this checks the DISPLAY layer only. It deliberately does NOT compute
 *    membership, re-derive an inclusion set, or reason about the boundary. That
 *    is `EXTENT-DESIGN §5.2` (record membership per building, with a reason code)
 *    and worklist step 3 (the membership diff). Do not grow this file into that.
 *
 * ⚠️ WHAT THIS CANNOT DO: catch a population scoped to the wrong boundary. That needs
 *    the inclusion set with per-building reasons — `EXTENT-DESIGN §5.2`, unbuilt. This
 *    check only asserts that an area-scoped stat DECLARES its boundary. Until §5.2
 *    lands, a declared-but-wrong scope still passes.
 *
 * USAGE   node scratch/claims-stat-scope.mjs --scene <scene>
 * EXIT    0 clean · 1 finding · 2 usage/inputs
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const i = argv.indexOf('--scene')
const SCENE = i >= 0 ? argv[i + 1] : null

if (!SCENE) {
  console.error('⛔ LOUD FAIL — no --scene given, and there is deliberately NO DEFAULT.')
  console.error('   usage: node scratch/claims-stat-scope.mjs --scene <scene>')
  console.error('   scenes:', readdirSync(join(ROOT, 'src', 'instances')).filter(f => f.endsWith('.js') && f !== 'index.js').map(f => f.replace(/\.js$/, '')).join(' '))
  process.exit(2)
}

const instP = join(ROOT, 'src', 'instances', `${SCENE}.js`)
if (!existsSync(instP)) { console.error(`⛔ no instance file: ${instP}`); process.exit(2) }
const src = readFileSync(instP, 'utf8')

const findings = []
console.log(`\n═══ ${SCENE} — displayed stat scope ═══`)

// Which stats are supplied (a literal in the instance) vs derived (null = live)?
const profile = (src.match(/profile:\s*\{([\s\S]*?)\n\s*\}/) || [])[1] || ''
const fields = [...profile.matchAll(/^\s*(\w+):\s*([^,\n]+),?(.*)$/gm)]
  .map(m => ({ key: m[1], val: m[2].trim(), trailing: (m[3] || '').trim() }))

if (!fields.length) { console.log('no profile block — nothing displayed to check.'); process.exit(0) }

for (const f of fields) {
  const derived = f.val === 'null'
  const numeric = /^[0-9_]+$/.test(f.val)
  const hasProvenance = /\/\//.test(f.trailing) || new RegExp(`${f.key}:[^\\n]*\\n?[^\\n]*//`).test(profile)
  console.log(`  ${f.key.padEnd(20)} ${derived ? 'DERIVED (live)' : f.val.padEnd(14)}`)

  // ⛔ Only AREA-SCOPED stats need a boundary declared. A founding year does not.
  const AREA_SCOPED = new Set(['population', 'buildingCount', 'parkAcres', 'households', 'businesses'])
  if (numeric && !hasProvenance && AREA_SCOPED.has(f.key)) {
    findings.push(
      `profile.${f.key} = ${f.val} is a supplied literal with no provenance comment. ` +
      `It renders beside slab-derived stats, so a reader cannot tell whether the two describe the same area. ` +
      `It is AREA-SCOPED, so it is only meaningful with a boundary attached. Name the source and the boundary inline ` +
      `(INTAKE-CATALOGUE names the official path for population: US Census ACS block-group).`
    )
  }
}

// Cross-stat plausibility: population against the live building count.
const popField = fields.find(f => f.key === 'population')
if (popField && /^[0-9_]+$/.test(popField.val)) {
  const pop = Number(popField.val.replace(/_/g, ''))
  const bJson = join(ROOT, 'cartograph', 'data', SCENE, 'buildings.json')
  if (existsSync(bJson)) {
    const j = JSON.parse(readFileSync(bJson, 'utf8'))
    const rows = Array.isArray(j) ? j : (j.buildings || Object.values(j).find(Array.isArray) || [])
    const perBuilding = rows.length ? pop / rows.length : 0
    console.log(`\n  population ${pop.toLocaleString()} ÷ ${rows.length.toLocaleString()} kept buildings = ${perBuilding.toFixed(2)} people/building`)
    // A kept building is a structure, not a dwelling — but under ~1.0 means the
    // population figure covers FEWER buildings than the map keeps, i.e. a smaller area.
    if (rows.length && perBuilding < 1.0) {
      findings.push(
        `population (${pop.toLocaleString()}) implies ${perBuilding.toFixed(2)} people per kept building (${rows.length.toLocaleString()}). ` +
        `Below 1.0 the supplied figure almost certainly covers a SMALLER area than the map presents — ` +
        `the two stats in the masthead are describing different places.`
      )
    }
  }
}

console.log('')
if (!findings.length) { console.log('PASS — every displayed stat declares its scope and they are mutually plausible.\n'); process.exit(0) }
console.log(`FAIL — ${findings.length} finding(s):`)
findings.forEach((f, n) => console.log(`\n  ${n + 1}. ${f}`))
console.log('')
process.exit(1)
